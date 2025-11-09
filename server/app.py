import os
from pathlib import Path
from typing import Any, Dict, List

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)

# Allow configuring explicit comma-separated origins via ALLOWED_ORIGINS, otherwise fallback to "*".
allowed_origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", Path(__file__).parent / "output"))
MAX_CONTEXT_CHARS = int(os.getenv("MAX_CONTEXT_CHARS", "25000"))

SYSTEM_PROMPT = (
    "You are Asika, a helpful fertility clinic assistant. Respond using only the information contained "
    "in the supplied source documents. If the documents do not cover a question, say you do not have "
    "that information instead of guessing. End with is there anything specific you'd like to know, or do you want to ask me something else?"
)


def load_context_documents(max_chars: int = MAX_CONTEXT_CHARS) -> str:
    if not OUTPUT_DIR.exists():
        return ""

    collected: List[str] = []
    total_chars = 0

    for path in sorted(OUTPUT_DIR.glob("*.txt")):
        try:
            content = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue

        if not content:
            continue

        section = f"Source: {path.name}\n{content}"
        section_length = len(section)

        if total_chars + section_length > max_chars:
            remaining = max_chars - total_chars
            if remaining <= 0:
                break
            section = section[:remaining]
            collected.append(section)
            total_chars += remaining
            break

        collected.append(section)
        total_chars += section_length

        if total_chars >= max_chars:
            break

    return "\n\n---\n\n".join(collected)


DOCUMENT_CONTEXT = load_context_documents()
print(DOCUMENT_CONTEXT)


@app.route("/api/health", methods=["GET"])
def health() -> Any:
    """Simple health check endpoint."""
    return jsonify({"status": "ok"})


@app.route("/api/chat", methods=["POST"])
def chat() -> Any:
    """Relay chat messages to Groq's API using the local document context."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return (
            jsonify({"error": "Server misconfigured: missing GROQ_API_KEY environment variable"}),
            500,
        )

    payload: Dict[str, Any] = request.get_json(force=True, silent=True) or {}
    messages: List[Dict[str, str]] = payload.get("messages", [])

    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "Request must include a non-empty 'messages' list"}), 400

    groq_messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

    if DOCUMENT_CONTEXT:
        groq_messages.append(
            {
                "role": "system",
                "content": f"Source documents:\n\n{DOCUMENT_CONTEXT}",
            }
        )

    groq_messages.extend(messages)

    groq_request: Dict[str, Any] = {
        "model": payload.get("model") or DEFAULT_MODEL,
        "messages": groq_messages,
        "temperature": payload.get("temperature", 0.3),
        "stream": False,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(GROQ_API_URL, headers=headers, json=groq_request, timeout=60)
        response.raise_for_status()
    except requests.RequestException as exc:
        status_code = getattr(exc.response, "status_code", 502)
        if status_code == 429:
            retry_after = exc.response.headers.get("Retry-After") if exc.response is not None else None
            cooldown_message = "Groq rate limit reached. Please wait a few seconds before trying again."
            if retry_after:
                cooldown_message += f" Suggested wait: {retry_after} seconds."
            return jsonify({"error": cooldown_message}), 429
        detail = "Groq API request failed"
        response_body: Any = None

        if exc.response is not None:
            try:
                response_body = exc.response.json()
            except ValueError:
                response_body = exc.response.text

        return jsonify({"error": detail, "details": response_body or str(exc)}), status_code

    groq_data = response.json()
    choices = groq_data.get("choices", [])
    if not choices:
        return jsonify({"error": "Groq API returned no choices"}), 502

    reply = choices[0].get("message", {}).get("content")
    if not reply:
        return jsonify({"error": "Groq API response missing message content"}), 502

    return jsonify({"reply": reply, "usage": groq_data.get("usage")})


if __name__ == "__main__":
    app.run(host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", "5000")))
