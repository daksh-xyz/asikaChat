import os
import json
from typing import List, Dict, Any, Optional
import io

from dotenv import load_dotenv
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from langchain_groq import ChatGroq
from langchain_huggingface.embeddings import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_core.prompts import ChatPromptTemplate

# Document processing libraries
import httpx
from groq import Groq
import PyPDF2
import docx

# -----------------------------
# Env & config
# -----------------------------
load_dotenv()
os.environ["TOKENIZERS_PARALLELISM"] = "false"

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY env var is required")

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
DATA_DIR = os.getenv("DATA_DIR", "./data")
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# RPA endpoint for patient registration
RPA_ENDPOINT = os.getenv("RPA_ENDPOINT", "https://prd-pristine.api.novocuris.org/api/workflows/patient-registration")

# Raw Groq client for document processing
groq_client_raw = Groq(api_key=GROQ_API_KEY)

# -----------------------------
# FastAPI
# -----------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# LLM & vector store
# -----------------------------
def initialize_llm() -> ChatGroq:
    return ChatGroq(
        temperature=0.1,
        groq_api_key=GROQ_API_KEY,
        model="openai/gpt-oss-20b",
    )


def load_or_create_vector_db() -> Chroma:
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

    if not os.path.exists(CHROMA_DB_PATH) or not os.listdir(CHROMA_DB_PATH):
        print("No Chroma DB found — building from TXT files in", DATA_DIR)
        loader = DirectoryLoader(
            DATA_DIR,
            glob="*.txt",
            loader_cls=TextLoader,
            show_progress=True,
        )
        documents = loader.load()

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50,
        )
        chunks = splitter.split_documents(documents)

        vector_db = Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            persist_directory=CHROMA_DB_PATH,
            collection_name="txt_docs",
        )
        print("TXT-based Chroma DB created at", CHROMA_DB_PATH)
    else:
        print("Using existing Chroma DB at", CHROMA_DB_PATH)
        vector_db = Chroma(
            collection_name="txt_docs",
            embedding_function=embeddings,
            persist_directory=CHROMA_DB_PATH,
        )

    return vector_db


llm = initialize_llm()
vector_db = load_or_create_vector_db()

# -----------------------------
# Document Processing Helpers
# -----------------------------
def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF file bytes."""
    try:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        raise ValueError(f"Failed to extract text from PDF: {e}")


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX file bytes."""
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text.strip()
    except Exception as e:
        raise ValueError(f"Failed to extract text from DOCX: {e}")


def process_referral_document(file_bytes: bytes, filename: str) -> str:
    """Process uploaded document and extract text."""
    filename_lower = filename.lower()
    
    if filename_lower.endswith('.pdf'):
        return extract_text_from_pdf(file_bytes)
    elif filename_lower.endswith('.docx'):
        return extract_text_from_docx(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: {filename}. Only PDF and DOCX are supported.")


def extract_referral_data_with_llm(document_text: str) -> Dict[str, Any]:
    """
    Use Groq LLM to extract structured data from referral letter text.
    """
    completion = groq_client_raw.chat.completions.create(
        model="meta-llama/llama-4-maverick-17b-128e-instruct",
        messages=[
            {
                "role": "user",
                "content": (
                    "You are a medical document parser. Extract the following fields from this referral letter. "
                    "Return ONLY a JSON object with these exact keys. If a field is not found, use null.\n\n"
                    "Required fields:\n"
                    "- nhsNumber (string)\n"
                    "- hospitalLocation (string)\n"
                    "- firstName (string)\n"
                    "- lastName (string)\n"
                    "- dateOfBirth (string, format YYYY-MM-DD if possible)\n"
                    "- gender (string: Male/Female/Other, infer from context if needed)\n"
                    "- phoneNumber (string)\n"
                    "- gpName (string, doctor's full name)\n"
                    "- gpAddress (string, GP clinic address)\n\n"
                    "Referral letter text:\n\n"
                    f"{document_text}\n\n"
                    "Return only the JSON object, no explanation."
                ),
            }
        ],
        response_format={"type": "json_object"},
        max_completion_tokens=1024,
    )

    content = completion.choices[0].message.content
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        data = {"raw": content}

    return data


# -----------------------------
# Helpers
# -----------------------------
def get_last_user_message(messages: List[Dict[str, Any]]) -> str:
    """Return the last message with role === 'user'."""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return str(msg.get("content") or "").strip()
    return ""


def format_history_for_llm(messages: List[Dict[str, Any]], max_turns: int = 50) -> str:
    """Turn the chat history into a plain-text transcript for the model."""
    msgs = messages[-max_turns:]
    lines = []
    
    for msg in msgs:
        role = msg.get("role", "user")
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        if role == "user":
            lines.append(f"User: {content}")
        elif role == "assistant":
            lines.append(f"Assistant: {content}")
        else:
            lines.append(f"{role.capitalize()}: {content}")

    return "\n".join(lines)


def maybe_trigger_rpa(answer: str) -> Dict[str, Any]:
    """
    Look for registration completion marker and trigger RPA.
    Marker format: ~~~REGISTER_PATIENT_JSON: {...}~~~
    """
    marker = "~~~REGISTER_PATIENT_JSON:"
    meta: Dict[str, Any] = {}

    if marker not in answer:
        return meta

    for line in answer.splitlines():
        if marker in line:
            json_part = line.split(marker, 1)[1].strip()
            
            if "~~~" in json_part:
                json_part = json_part.split("~~~", 1)[0].strip()

            if not json_part:
                continue

            try:
                payload = json.loads(json_part)
            except json.JSONDecodeError as e:
                meta["rpa_error"] = f"Could not parse REGISTER_PATIENT_JSON payload: {e}"
                meta["raw_json_part"] = json_part
                return meta

            # Map to RPA expected format
            final_body = {"patientData": payload}
            meta["body"] = final_body

            if not RPA_ENDPOINT:
                meta["rpa_warning"] = "RPA_ENDPOINT not configured"
                return meta

            try:
                resp = httpx.post(
                    RPA_ENDPOINT,
                    json=final_body,
                    timeout=10.0,
                )
                meta["rpa_status_code"] = resp.status_code
                meta["rpa_ok"] = 200 <= resp.status_code < 300
                meta["rpa_response"] = resp.text
            except Exception as e:
                meta["rpa_error"] = f"Error calling RPA endpoint: {e}"

            return meta

    return meta



# -----------------------------
# Debug endpoints
# -----------------------------
@app.get("/debug/chroma")
async def debug_chroma():
    data = vector_db.get(include=["metadatas", "documents"])
    docs = []

    for meta, doc in zip(data["metadatas"], data["documents"]):
        docs.append({
            "metadata": meta,
            "content": doc
        })

    return {
        "count": len(docs),
        "documents": docs
    }


# -----------------------------
# Document Upload Endpoint
# -----------------------------
@app.post("/upload-referral")
async def upload_referral(file: UploadFile = File(...)):
    """
    Upload a referral letter (PDF or DOCX) and extract patient data.
    Returns extracted data for the chat flow to continue.
    """
    try:
        file_bytes = await file.read()
        
        # Extract text from document
        document_text = process_referral_document(file_bytes, file.filename)
        
        # Use LLM to extract structured data
        extracted_data = extract_referral_data_with_llm(document_text)
        
        return {
            "success": True,
            "extracted_data": extracted_data,
            "document_text": document_text[:500] + "..." if len(document_text) > 500 else document_text
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# -----------------------------
# /chat endpoint (RAG + Registration)
# -----------------------------
@app.post("/chat")
async def chat(request: Request):
    raw_bytes = await request.body()
    try:
        raw_text = raw_bytes.decode("utf-8", "replace")
        payload = json.loads(raw_text)
    except json.JSONDecodeError as e:
        return {"error": f"Invalid JSON body: {e}", "raw": raw_text}

    messages = payload.get("messages") or []

    if not isinstance(messages, list):
        return {"error": "Field 'messages' must be an array"}

    user_text = get_last_user_message(messages)
    if not user_text:
        return {"reply": "I didn't receive any user message to respond to."}

    try:
        # Retrieve context from Chroma (RAG)
        retriever = vector_db.as_retriever()
        docs = retriever.invoke(user_text)
        context_text = "\n\n---\n\n".join(d.page_content for d in docs) or "No context available."

        # System prompt for Radhika with new registration flow
        SYSTEM_PROMPT = (
            """
            You are Radhika, a professional hospital assistant helping with patient registrations.

            General behaviour:
            - Warm, patient, empathetic; professional tone; <= 600 characters per message.
            - Ask ONE question at a time. Never reveal you are an AI.
            - Always respond in the language the user is using.
            - For any English text in the knowledge base, translate it into the user's language.

            RAG / knowledge behaviour:
            - Answer only from the information in the provided source documents ('Context').
            - If the documents do not cover a question, say that you do not have that information.

            Registration flow (Referral Letter Based):
            
            When a user uploads a referral letter, the system will send you a special message starting with 
            '~~~REFERRAL_DATA:' followed by JSON data extracted from the document, ending with ~~~.
            
            The JSON will contain:
            {{
                "hospitalLocation": "..."
                "nhsNumber": "...",
                "firstName": "...",
                "lastName": "...",
                "gender": "...",
                "dateOfBirth": "DD-MM-YYYY",
                "phoneNumber": "...",
                "gpName": "...",
                "gpAddress": "...",
            }}

            Step 1 - Present extracted data:
            - Show the user what was extracted from their referral letter.
            - Ask them to confirm if the information is correct.
            - If they say no, ask which fields need correction.

            Step 2 - Collect missing/additional information:
            Ask ONE question at a time for:
            - Hospital Number (if not in document, ask if they have one from previous correspondence, otherwise use "Pre-Registered")
            - Ask if the patient is an inpatient or an outpatient (type)
            - Ask if the patient prefers Self-Pay, Insured or NHS
            - Ask the patient if they want to provide additional details

            Step 3 - Final confirmation and RPA trigger:
            - When ALL required fields are collected, tell the patient that you are registering them.
            - Ask for final confirmation.
            - If confirmed, output on the LAST line:

            ~~~REGISTER_PATIENT_JSON: {{"hospitalLocation": "...", "nhsNumber": "...", "firstName": "...", "lastName": "...", "gender": "...", "dateOfBirth": "DD-MM-YYYY", "phoneNumber": "...", "gpName": "...", "gpAddress": "...", "additionalInfo": "...", "type": "...", "paymentMode": "..." }}~~~

            Use valid JSON. If a field is not provided, ask again, if user doesn't provide say registration isn't possible without this information.
            """
            "Context:\n{context}"
        )

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "Here is the recent conversation between the user and you:\n\n"
                    "{history}\n\n"
                    "Using the above conversation and the hospital 'Context', respond to the user's latest message."
                ),
            ]
        )

        history_text = format_history_for_llm(messages)
        chain = prompt | llm
        ai_msg = chain.invoke({"context": context_text, "history": history_text})

        answer = (ai_msg.content or "")
        if not answer:
            answer = "I don't know the answer from the available documents."

        # Token usage & cost tracking
        usage_meta = getattr(ai_msg, "response_metadata", {}) or {}
        token_usage = usage_meta.get("token_usage", {}) or {}

        prompt_tokens = (
            token_usage.get("prompt_tokens")
            or token_usage.get("input_tokens")
            or 0
        )
        completion_tokens = (
            token_usage.get("completion_tokens")
            or token_usage.get("output_tokens")
            or 0
        )
        total_tokens = token_usage.get("total_tokens") or (
            prompt_tokens + completion_tokens
        )

        input_cost = (prompt_tokens / 1_000_000) * 0.15
        output_cost = (completion_tokens / 1_000_000) * 0.75
        estimated_cost_usd = input_cost + output_cost

        # Trigger RPA if registration is complete
        rpa_meta = maybe_trigger_rpa(answer)

        return {
            "reply": answer,
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "estimated_cost_usd": round(estimated_cost_usd, 8),
            },
            "sources": [
                {
                    "source": d.metadata.get("source"),
                    "page": d.metadata.get("page"),
                }
                for d in docs
            ],
            "rpa": rpa_meta,
        }

    except Exception as e:
        return {"error": f"Server error: {e}"}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)