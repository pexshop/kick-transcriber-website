const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const TRANSCRIPT_URL = "https://api.openai.com/v1/audio/transcriptions";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function stamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return [h, String(m).padStart(2, "0"), s].join(":");
}

async function verifyTurnstile(token, request, secret) {
  if (!secret) return false;
  if (!token) return false;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const result = await response.json();
  return result.success === true;
}

async function handleTranscribe(request, env) {
  if (!env.OPENAI_API_KEY) return json({ error: "Server is not configured: OPENAI_API_KEY is missing." }, 503);
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Expected multipart/form-data." }, 400); }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return json({ error: "Please choose an audio file." }, 400);
  if (file.size > MAX_AUDIO_BYTES) return json({ error: "File exceeds the 24 MB limit." }, 413);

  const captcha = form.get("cf-turnstile-response");
  const verified = await verifyTurnstile(String(captcha || ""), request, env.TURNSTILE_SECRET_KEY);
  if (!verified) return json({ error: "Security check failed. Please complete the verification and try again." }, 403);

  const language = String(form.get("language") || "").trim();
  const translateTo = String(form.get("translate_to") || "zh").trim();
  const audio = new FormData();
  audio.set("file", file, file.name || "audio-upload");
  audio.set("model", "whisper-1");
  audio.set("response_format", "verbose_json");
  audio.set("timestamp_granularities[]", "segment");
  if (language) audio.set("language", language);

  let speech;
  try {
    const response = await fetch(TRANSCRIPT_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: audio
    });
    speech = await response.json();
    if (!response.ok) return json({ error: speech.error?.message || "Transcription service failed." }, 502);
  } catch {
    return json({ error: "Could not reach the transcription service." }, 502);
  }

  const transcript = speech.text || "";
  const segments = (speech.segments || []).map(s => ({
    start: stamp(s.start), end: stamp(s.end), text: s.text || ""
  }));
  let translation = "";
  let summary = "";
  if (transcript) {
    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Return JSON with keys translation and summary. Translate faithfully into the requested language and summarize briefly. Do not invent speech." },
            { role: "user", content: `Target language: ${translateTo}\n\nTranscript:\n${transcript}` }
          ]
        })
      });
      const result = await response.json();
      if (response.ok) {
        const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
        translation = parsed.translation || "";
        summary = parsed.summary || "";
      } else summary = "Transcription succeeded; translation service returned an error.";
    } catch {
      summary = "Transcription succeeded; translation could not be completed.";
    }
  }

  return json({
    filename: file.name || null,
    language: speech.language || language || null,
    duration_seconds: speech.duration ?? null,
    transcript, segments, translation, summary,
    notice: "This version accepts uploaded audio files. It does not download Kick VOD links."
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (url.pathname === "/health" && request.method === "GET") return json({ status: "ok", service: "kick-transcriber" });
    if (url.pathname === "/api" && request.method === "GET") {
      return json({ service: "KickTranscriber", status: "ok", features: ["audio upload", "timestamps", "translation", "summary"], kick_vod_extraction: false });
    }
    if (url.pathname === "/transcribe" && request.method === "POST") return handleTranscribe(request, env);
    if (url.pathname === "/" && request.method === "GET" && env.ASSETS) return env.ASSETS.fetch(request);
    if (env.ASSETS && request.method === "GET") {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }
    return json({ error: "Not found" }, 404);
  }
};

export { stamp };