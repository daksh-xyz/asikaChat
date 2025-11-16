import os
import json
from typing import List, Dict, Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from langchain_groq import ChatGroq
from langchain_huggingface.embeddings import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_core.prompts import ChatPromptTemplate

# NEW: Groq vision client + RPA
import httpx
from groq import Groq

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

# NEW: optional RPA endpoint
RPA_ENDPOINT = "https://prd-pristine.api.novocuris.org/api/workflows/patient-registration"

# NEW: raw Groq client for vision / JSON-mode / OCR
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
    # IMPORTANT: use groq_api_key + model, not api_key/model_name
    return ChatGroq(
        temperature=0.1,
        groq_api_key=GROQ_API_KEY,
        model="openai/gpt-oss-20b",
    )


def load_or_create_vector_db() -> Chroma:
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

    # build from TXT if DB dir missing or empty
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


def debug_retrieval(query: str):
    print("\n--- DEBUG: RETRIEVAL FOR:", query)
    docs = vector_db.as_retriever().invoke(query)
    for i, d in enumerate(docs):
        print(f"\n[Result {i}]")
        print("Source:", d.metadata)
        print("Preview:", d.page_content[:500])


# -----------------------------
# Helpers
# -----------------------------
def get_last_user_message(messages: List[Dict[str, Any]]) -> str:
    """Return the last message with role === 'user'."""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return str(msg.get("content") or "").strip()
    return ""

def format_history_for_llm(messages: List[Dict[str, Any]], max_turns: int = 20) -> str:
    """
    Turn the chat history into a plain-text transcript for the model.
    Keeps the last `max_turns` messages to avoid context blow-up.
    """
    # take only the last max_turns messages
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



# NEW: OCR helper using Groq Llama 4 Maverick in JSON mode
def run_id_ocr(image_data_url: str) -> Dict[str, Any]:
    """
    image_data_url is a full data URL, e.g. 'data:image/jpeg;base64,...'
    We call Groq vision model in JSON mode to extract ID fields.
    """
    if not image_data_url:
        raise ValueError("Empty image data URL")

    completion = groq_client_raw.chat.completions.create(
        model="meta-llama/llama-4-maverick-17b-128e-instruct",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "You are an OCR engine for government ID documents. "
                            "Read the image and extract the following fields as JSON ONLY, no explanation:\n"
                            "- firstName (string)\n"
                            "- lastName (string)\n"
                            "- dob (date of birth in any format ISO or otherwise, or null if unclear)\n"
                            "- gender (string)\n"
                            "- country (string)\n\n"
                            "Return a single JSON object with exactly these keys."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_data_url,
                        },
                    },
                ],
            }
        ],
        # JSON-mode, supported on Maverick/Scout vision models
        # See Groq Docs 'JSON Mode with Images'
        response_format={"type": "json_object"},
        max_completion_tokens=512,
    )

    content = completion.choices[0].message.content
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        # Fallback: wrap raw string if something went wrong
        data = {"raw": content}

    # Normalise keys a bit
    return {
        "firstName": data.get("firstName"),
        "lastName": data.get("lastName"),
        "dateOfBirth": data.get("dob"),
        "gender": data.get("gender"),
        "country": data.get("country"),
    }


def maybe_trigger_rpa(answer: str) -> Dict[str, Any]:
    """
    Look for a line like:
    Thank you... ~~~REGISTER_PATIENT_JSON: {...}~~~
    Parse JSON, remap field names, and POST exactly what RPA expects.
    """
    marker = "~~~REGISTER_PATIENT_JSON:"
    meta: Dict[str, Any] = {}

    if marker not in answer:
        return meta

    for line in answer.splitlines():
        if marker in line:
            # Take everything after the START marker
            json_part = line.split(marker, 1)[1].strip()

            # Remove trailing closing tildes if present
            if "~~~" in json_part:
                json_part = json_part.split("~~~", 1)[0].strip()

            if not json_part:
                continue

            try:
                payload = json.loads(json_part)
            except json.JSONDecodeError as e:
                meta["rpa_error"] = f"Could not parse REGISTER_PATIENT_JSON payload: {e}"
                meta["raw_json_part"] = json_part  # optional: for debugging
                return meta

            # --- FIELD NAME REMAPPING ---
            mapped = {
                "firstName": payload.get("firstName"),
                "lastName": payload.get("lastName"),
                "gender": payload.get("gender"),
                "phone": payload.get("phone"),
                "country": payload.get("country"),
                "causeOfInfertility": payload.get("causeOfInfertility"),
                "additionalInfo": payload.get("additionalDetails") or payload.get("additionalInfo"),
            }

            # Handle both "dob" and "dateOfBirth" just in case
            dob = payload.get("dob") or payload.get("dateOfBirth")
            mapped["dateOfBirth"] = dob if dob else None

            final_body = {"patientData": mapped}
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
# /chat endpoint (RAG + OCR + registration + usage)
# -----------------------------
@app.post("/chat")
async def chat(request: Request):
    # --- parse raw JSON body ---
    raw_bytes = await request.body()
    try:
        raw_text = raw_bytes.decode("utf-8", "replace")
        payload = json.loads(raw_text)
    except json.JSONDecodeError as e:
        return {"error": f"Invalid JSON body: {e}", "raw": raw_text}

    messages = payload.get("messages") or []
    task = (payload.get("task") or "chat").lower()  # NEW: task routing
    image_data_url: Optional[str] = payload.get("image")

    if not isinstance(messages, list):
        return {"error": "Field 'messages' must be an array"}

    # -------------------------
    # Task: OCR
    # -------------------------
    if task == "ocr":
        if not image_data_url:
            return {"error": "For task='ocr' you must send an 'image' field (data URL)."}

        try:
            ocr_data = run_id_ocr(image_data_url)
        except Exception as e:
            return {"error": f"OCR failed: {e}"}

        # We deliberately do NOT call the chat LLM here.
        # Frontend will turn ocr_data into an OCR_DATA: ... message for the chat flow.
        return {"ocr_data": ocr_data}

    # -------------------------
    # Task: normal chat (RAG + registration flow)
    # -------------------------
    user_text = get_last_user_message(messages)
    if not user_text:
        return {"reply": "I didn't receive any user message to respond to."}

    try:
        # --- 1) Retrieve context from Chroma (RAG) ---
        retriever = vector_db.as_retriever()
        docs = retriever.invoke(user_text)

        context_text = "\n\n---\n\n".join(d.page_content for d in docs) or "No context available."

        # --- 2) Build Radhika system prompt with registration + OCR_DATA ---
        SYSTEM_PROMPT = (
            """
            You are Radhika, a professional hospital assistant.

            General behaviour:
            - Warm, patient, empathetic; professional tone; <= 600 characters per message.
            - Ask ONE question at a time. Never reveal you are an AI.
            - You can only talk about the hospital/clinic present in the source documents OR handle patient registration. YOU CANNOT BOOK APPOINTMENTS YET.
            - Always respond in the language the user is using. If you do not understand the language, say so politely.
            - For any English text in the knowledge base, translate it into the user's language.

            RAG / knowledge behaviour:
            - Answer only from the information in the provided source documents ('Context').
            - If the documents do not cover a question, say that you do not have that information instead of guessing.
            - Then gently ask if there is anything else the user would like to know.

            Registration flow (ID + infertility):
            - A user may ask to register (in any language). If they do, switch into a registration flow and clearly guide them.

            Step 0 - ID upload & OCR:
            - Ask the user to upload a clear image of a government ID (passport, national ID, driver's licence).
            - Do NOT attempt to read the ID yourself.
            - The frontend will call a separate OCR model and then send you a special message that starts with '~~~OCR_DATA:' followed by JSON and ending with ~~~.
            - When you receive a message starting with '~~~OCR_DATA:', treat the JSON that follows as the OCR output with fields:
              {{ "firstName": ..., "middleName": ..., "lastName": ..., "dob": "YYYY/MM/DD", "gender": ..., "country": ... }}.
            - Never assume a phone number from the document. You must always ask for the phone number separately.

            Step 1 - Present extracted ID details:
            - Present the extracted details to the user in a friendly way, in their language.
            - Show middle name ONLY if it is non-empty / not null.
            - Do not invent or change values on your own.

            Step 2 - Confirm and correct:
            - Ask the user if these details are correct (Yes/No).
            - If they say No or ask for changes, ask specifically which fields to update.
            - Verbally confirm the updated details and ask again if everything is correct.

            Step 3 - Ask remaining questions:
            - Ask for mobile phone number (do not infer).
            - Ask for cause of infertility.
            - Ask if they want to share any other/additional details.

            Step 4 - Final confirmation and RPA trigger marker:
            - When you have all of these fields:
              * firstName
              * lastName
              * dob
              * gender
              * phone
              * country
              * causeOfInfertility
              * additionalInfo
            - Summarise all details in natural language and ask for a last confirmation.
            - If the user confirms, on the LAST line of your reply output this EXACT pattern:

              ~~~REGISTER_PATIENT_JSON: {{"firstName": "...", "lastName": "...", "dateOfBirth": "YYYY/MM/DD", "gender": "...", "phone": "...", "country": "...", "causeOfInfertility": "...", "additionalInfo": "..."}}~~~

            - Use valid JSON (double quotes, no trailing commas). If a field is missing, use null or an empty string.
            - If the user later asks for a change, update the information, re-summarise, and output a NEW REGISTER_PATIENT_JSON line.

            Important:
            - Always ask only one question at a time.
            - Maintain the user's language throughout the registration process.
            - YOU CANNOT DO ANYTHING BESIDES ANSWERING FROM THE KNOWLEDGE BASE AND REGISTERING THE USER WITH THE CLINIC. 
            - YOU CANNOT FORWARD REQUESTS TO OTHER DOCTORS. 
            - YOU ARE A SIMPLE CHATBOT
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
                    "Using the above conversation and the hospital 'Context', respond to the user's latest message. "
                    "If they ask to modify a field (like DOB, name, phone, etc.), use the values you have already "
                    "collected earlier in this same conversation."
                ),
            ]
        )

        history_text = format_history_for_llm(messages)

        chain = prompt | llm
        ai_msg = chain.invoke({"context": context_text, "history": history_text})


        answer = (ai_msg.content or "")
        if not answer:
            answer = "I don't know the answer from the available documents."

        # --- 3) Token usage & cost from response_metadata ---
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

        # Pricing for openai/gpt-oss-120b on Groq (example; update if needed):
        input_cost = (prompt_tokens / 1_000_000) * 0.15
        output_cost = (completion_tokens / 1_000_000) * 0.75
        estimated_cost_usd = input_cost + output_cost

        # --- 4) Optionally trigger RPA if the marker is present ---
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
            "rpa": rpa_meta,  # Includes payload/status if registration completed
        }

    except Exception as e:
        return {"error": f"Server error: {e}"}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
