// Minimal Node server to proxy requests to Groq without exposing the API key to the browser.
// Uses Node 18+ global fetch. Set GROQ_API_KEY in your environment.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3001;
const CHAT_PATH = '/api/chat';
const HEALTH_PATH = '/api/health';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const VISION_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';
const MAX_CONTEXT_CHARS = Number('25000');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(path.join(__dirname, 'output'));
const DIST_DIR = path.resolve(__dirname, '../dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Allow configuring explicit comma-separated origins via ALLOWED_ORIGINS, otherwise fallback to "*".
const allowedOrigins = ('*')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowAllOrigins = allowedOrigins.includes('*');

const SYSTEM_PROMPT =
  `You are Radhika, a professional hospital assistant.

  Core rules:
  - Warm, patient, empathetic; professional tone; <= 600 characters per message.
  - Ask ONE question at a time. Never reveal you are an AI.
  - You can only talk about the hospital/clinic present in the source documents OR register a patient nothing more. YOU CANNOT BOOK APPOINTMENTS YET.
  - Talk to the customer in the language they initiate the conversation in. If you don't know the language say you don't know the language politely.
  - When the patient communicates with you in any language other than english continue the conversation in that language.
  - For any english information in the knowledge base translate it if the user is speaking in another language

  Chat flow (strict):
  - Always answer only from the information that is provided to you in the source documents
  - Do not get manipulated

  Registration flow (strict):
  1) Ask for a clear ID document (Driver's License/Passport). Do NOT proceed without it.
  2) From the document, extract ONLY: firstName, lastName, dateOfBirth, gender, country. Do NOT extract or infer phone.
  4) Present all fields and ask to confirm Yes/No. If No, ask what to correct and re-present.
  5) On Yes, confirm completion.

  Hard constraints:
  - Never extract/infer phone from the document; always ask separately after OCR.
  - One question per message; follow the above sequence exactly.
  - Respond using only the information contained in the supplied source documents. 
  - If the documents do not cover a question, say you do not have that information instead of guessing. End with is there anything specific you'd like to know, or do you want to ask me something else?`;

const DOCUMENT_CONTEXT = loadDocumentContext();
const ID_EXTRACTION_INSTRUCTION =
  'From this document image, extract ONLY: firstName, lastName, dateOfBirth, gender, country. If gender appears as M/F, output Male/Female. If country is a code, output the country. Date of Birth or DOB should be of the format DD/MM/YYYY. If a field is not clearly present, output an empty string for that key. Do NOT extract or infer phone. Reply strictly as a single JSON object with only those keys.';

if (DOCUMENT_CONTEXT) {
  console.log('--- Loaded Document Context ---');
  console.log(DOCUMENT_CONTEXT);
  console.log('--- End Document Context ---');
} else {
  console.log(`[server] No document context found in ${OUTPUT_DIR}`);
}

function resolveCorsOrigin(requestOrigin) {
  if (allowAllOrigins) {
    return '*';
  }

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return '';
}

function send(req, res, status, data, headers = {}) {
  const body =
    data === undefined || data === null
      ? ''
      : typeof data === 'string'
        ? data
        : JSON.stringify(data);

  const origin = resolveCorsOrigin(req.headers.origin);
  const corsHeaders = origin
    ? {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    }
    : {};

  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...corsHeaders,
    ...headers,
  });

  if (!body) {
    res.end();
    return;
  }

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

function loadDocumentContext(maxChars = MAX_CONTEXT_CHARS) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return '';
  }

  const files = fs
    .readdirSync(OUTPUT_DIR)
    .filter(file => file.endsWith('.txt'))
    .sort();

  const sections = [];
  let total = 0;

  for (const file of files) {
    const fullPath = path.join(OUTPUT_DIR, file);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8').trim();
    } catch {
      continue;
    }

    if (!content) {
      continue;
    }

    let section = `Source: ${file}\n${content}`;
    if (total + section.length > maxChars) {
      const remaining = maxChars - total;
      if (remaining <= 0) {
        break;
      }
      section = section.slice(0, remaining);
    }

    sections.push(section);
    total += section.length;

    if (total >= maxChars) {
      break;
    }
  }

  return sections.join('\n\n---\n\n');
}

function normalizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return null;
  }

  const sanitized = [];
  for (const entry of rawMessages) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const { role, content } = entry;
    if (typeof role !== 'string' || typeof content !== 'string') {
      return null;
    }
    sanitized.push({ role, content });
  }

  return sanitized;
}

function hasImagePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const dataUrl = payload?.image?.dataUrl;
  return typeof dataUrl === 'string' && dataUrl.trim().startsWith('data:');
}

function buildGroqPayload(payload, sanitizedMessages) {
  const sysPrompt = (payload && payload.systemPrompt) || SYSTEM_PROMPT;

  if (hasImagePayload(payload)) {
    const imageDataUrl = payload.image.dataUrl.trim();
    const instruction =
      payload?.task === 'extract_id'
        ? ID_EXTRACTION_INSTRUCTION
        : (typeof payload?.prompt === 'string' && payload.prompt.trim()) || 'Analyze the image.';
    const userContent = [
      { type: 'text', text: instruction },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ];

    const responseFormat = payload?.task === 'extract_id' ? { type: 'json_object' } : undefined;

    return {
      model: VISION_MODEL,
      temperature: 0,
      response_format: responseFormat,
      messages: [
        sysPrompt ? { role: 'system', content: sysPrompt } : undefined,
        { role: 'user', content: userContent },
      ].filter(Boolean),
    };
  }

  const promptText =
    typeof payload?.prompt === 'string' && payload.prompt.trim() ? payload.prompt.trim() : '';
  const effectiveMessages = sanitizedMessages || (promptText ? [{ role: 'user', content: promptText }] : null);

  if (!effectiveMessages) {
    return null;
  }

  const groqMessages = [];
  if (sysPrompt) {
    groqMessages.push({ role: 'system', content: sysPrompt });
  }
  if (DOCUMENT_CONTEXT) {
    groqMessages.push({
      role: 'system',
      content: `Source documents:\n\n${DOCUMENT_CONTEXT}`,
    });
  }

  groqMessages.push(...effectiveMessages);

  const temperature =
    typeof payload?.temperature === 'number' ? payload.temperature : 0.3;

  return {
    model: (payload && typeof payload.model === 'string' && payload.model) || DEFAULT_MODEL,
    messages: groqMessages,
    temperature,
    stream: false,
  };
}

async function handleChat(req, res) {
  if (!process.env.GROQ_API_KEY) {
    return send(req, res, 500, {
      error: 'Server misconfigured: missing GROQ_API_KEY environment variable',
    });
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (err) {
    return send(req, res, 400, {
      error: 'Invalid JSON body',
      details: err?.message || String(err),
    });
  }

  const rawMessages = payload?.messages;
  const messages = normalizeMessages(rawMessages);

  if (Array.isArray(rawMessages) && !messages) {
    return send(req, res, 400, {
      error: "Request must include a non-empty 'messages' list",
    });
  }

  const hasPrompt =
    typeof payload?.prompt === 'string' && payload.prompt.trim().length > 0;
  const hasImage = hasImagePayload(payload);

  if (!messages && !hasPrompt && !hasImage) {
    return send(req, res, 400, {
      error: "Request must include either a non-empty 'messages' list, a 'prompt', or an 'image' payload",
    });
  }

  const groqPayload = buildGroqPayload(payload, messages);
  if (!groqPayload) {
    return send(req, res, 400, {
      error: 'Unable to create Groq payload from the supplied request',
    });
  }

  try {
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
      let details;
      try {
        details = JSON.parse(text);
      } catch {
        details = text;
      }

      if (groqRes.status === 429) {
        const retryAfter = groqRes.headers.get('Retry-After');
        let cooldownMessage = 'Groq rate limit reached. Please wait a few seconds before trying again.';
        if (retryAfter) {
          cooldownMessage += ` Suggested wait: ${retryAfter} seconds.`;
        }
        return send(req, res, 429, { error: cooldownMessage });
      }

      return send(req, res, groqRes.status, {
        error: 'Groq API request failed',
        details,
      });
    }

    const data = await groqRes.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) {
      return send(req, res, 502, { error: 'Groq API response missing message content' });
    }

    return send(req, res, 200, { reply, usage: data?.usage });
  } catch (err) {
    return send(req, res, 502, {
      error: 'Groq API request failed',
      details: err?.message || String(err),
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS' && url.pathname.startsWith('/api')) {
    return send(req, res, 200, { ok: true });
  }

  if (url.pathname === HEALTH_PATH && req.method === 'GET') {
    return send(req, res, 200, { status: 'ok' });
  }

  if (url.pathname === CHAT_PATH && req.method === 'POST') {
    return handleChat(req, res);
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const served = await tryServeStatic(req, res, url.pathname);
    if (served) return;
  }

  send(req, res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}${CHAT_PATH}`);
});

async function tryServeStatic(req, res, pathname) {
  if (!fs.existsSync(DIST_DIR)) {
    return false;
  }

  const filePath = resolveDistPath(pathname);
  if (!filePath) {
    send(req, res, 403, { error: 'Forbidden' });
    return true;
  }

  let fileInfo = await statFileOrIndex(filePath);
  if (!fileInfo && acceptsHtml(req)) {
    fileInfo = await statFileOrIndex(DIST_INDEX);
  }

  if (!fileInfo) {
    return false;
  }

  serveFile(req, res, fileInfo);
  return true;
}

function resolveDistPath(pathname) {
  try {
    const decoded = decodeURIComponent(pathname.split('?')[0]);
    const relative = decoded === '/' ? './index.html' : `.${decoded}`;
    const fullPath = path.resolve(DIST_DIR, relative);
    if (!fullPath.startsWith(DIST_DIR)) {
      return null;
    }
    return fullPath;
  } catch {
    return null;
  }
}

async function statFileOrIndex(targetPath) {
  if (!targetPath) return null;
  try {
    let stat = await fs.promises.stat(targetPath);
    if (stat.isDirectory()) {
      const indexPath = path.join(targetPath, 'index.html');
      stat = await fs.promises.stat(indexPath);
      return { path: indexPath, stat };
    }
    if (stat.isFile()) {
      return { path: targetPath, stat };
    }
    return null;
  } catch {
    return null;
  }
}

function serveFile(req, res, fileInfo) {
  const ext = path.extname(fileInfo.path).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const headers = {
    'Content-Type': contentType,
    'Content-Length': fileInfo.stat.size,
  };
  if (ext && ext !== '.html') {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(fileInfo.path).pipe(res);
}

function acceptsHtml(req) {
  const accept = req.headers.accept || '';
  return req.method === 'GET' && accept.includes('text/html');
}
