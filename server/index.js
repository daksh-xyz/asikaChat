// Minimal Node server to proxy requests to Groq without exposing the API key to the browser.
// Uses Node 18+ global fetch. Set GROQ_API_KEY in your environment.

import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3001;
const API_PATH = '/api/groq-chat';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Default system prompt used if client does not supply one.
const DEFAULT_SYSTEM_PROMPT = `
You are Radhika, a professional hospital assistant.

Core rules:
- Warm, patient, empathetic; professional tone; <= 600 characters per message.
- Ask ONE question at a time. Never reveal you are an AI.
- Only handle patient registration in this chat; redirect all other requests.

Registration flow (strict):
1) Greet and ask patient's name.
2) Offer registration only (redirect other requests politely).
3) Ask for a clear ID document (Aadhar/Driver's License/Passport). Do NOT proceed without it.
4) From the document, extract ONLY: firstName, lastName, dateOfBirth, gender, country. Do NOT extract or infer phone.
5) After extraction, ask for phone number separately and validate it's numeric and plausible.
6) Present all fields and ask to confirm Yes/No. If No, ask what to correct and re-present.
7) On Yes, confirm completion.

Hard constraints:
- Never extract/infer phone from the document; always ask separately after OCR.
- One question per message; follow the above sequence exactly.
 - If the user asks anything outside this workflow, reply: "I can only help with the current workflow." and continue with the next required step.
`;

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...headers,
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      // Hard limit ~15MB to avoid memory abuse
      if (data.length > 15 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function buildGroqPayload({ prompt, messages, image, task, systemPrompt }) {
  // Default text model; update to your preferred one
  const TEXT_MODEL = 'openai/gpt-oss-20b';
  // Vision model for image understanding; update to a current Groq vision model
  const VISION_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';

  if (image && image.dataUrl) {
    const content = [];
    const sys = systemPrompt || process.env.ASSISTANT_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
    const instruction =
      task === 'extract_id'
        ? 'From this document image, extract ONLY: firstName, lastName, dateOfBirth, gender, country. If gender appears as M/F, output Male/Female. If a field is not clearly present, output an empty string for that key. Do NOT extract or infer phone. Reply strictly as a single JSON object with only those keys.'
        : (prompt || 'Analyze the image.');
    content.push({ type: 'text', text: instruction });
    // OpenAI-compatible shape: image_url as object with url
    content.push({ type: 'image_url', image_url: { url: image.dataUrl } });

    return {
      model: VISION_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        sys ? { role: 'system', content: sys } : undefined,
        { role: 'user', content },
      ].filter(Boolean),
    };
  }

  // Text-only
  const content = prompt || (messages && messages.length ? undefined : '');
  const sys = systemPrompt || process.env.ASSISTANT_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
  const chatMessages = [];
  if (sys) chatMessages.push({ role: 'system', content: sys });
  if (content) chatMessages.push({ role: 'user', content });
  else if (messages && messages.length) chatMessages.push(...messages);
  return {
    model: TEXT_MODEL,
    temperature: 0.2,
    messages: chatMessages,
  };
}

async function handleGroqChat(req, res) {
  if (!process.env.GROQ_API_KEY) {
    return send(res, 500, { error: 'Missing GROQ_API_KEY env var' });
  }

  try {
    const body = await parseJsonBody(req);
    const groqPayload = buildGroqPayload(body);

    const groqRes = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(groqPayload),
    });

    if (!groqRes.ok) {
      const text = await groqRes.text();
      return send(res, groqRes.status, { error: 'Groq API error', details: text });
    }
    const data = await groqRes.json();
    const reply = data?.choices?.[0]?.message?.content || '';
    send(res, 200, { reply, raw: data });
  } catch (err) {
    send(res, 400, { error: 'Bad request', details: String(err?.message || err) });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    return send(res, 200, { ok: true });
  }

  if (url.pathname === API_PATH && req.method === 'POST') {
    return handleGroqChat(req, res);
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}${API_PATH}`);
});
