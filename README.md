# KickTranscriber Website

A standalone Chinese-language audio transcription website built for Cloudflare Workers. It does not require ChatGPT, MCP, OAuth, or a ChatGPT connector.

## Current features

- Upload audio for transcription
- Timestamped transcript segments
- Translation into Chinese, English, Japanese, or Korean
- Short summary
- Copy results and download a TXT file
- Cloudflare Turnstile verification
- OpenAI API key stays server-side as a Worker Secret

**Important limitation:** this version does not extract audio directly from Kick VOD URLs. Upload an audio file (maximum 24 MB). Kick URL extraction requires a separate, permitted media-fetching service; do not bypass login, DRM, or platform access controls.

## Required Cloudflare configuration

Set these Worker secrets in Cloudflare:

- `OPENAI_API_KEY`: OpenAI API key
- `TURNSTILE_SECRET_KEY`: secret key from a Cloudflare Turnstile widget

Set the public Turnstile Site Key in `public/index.html` by replacing `REPLACE_WITH_CLOUDFLARE_TURNSTILE_SITE_KEY`. The Site Key is public; never put the Secret Key or OpenAI API key in browser code.

## Deploy

Install Node.js 20+ and Wrangler, then run:

```sh
npm install
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler deploy
```

The first deploy must be associated with your Cloudflare account. The Worker serves the static site and API from the same origin.

## Endpoints

- `GET /`: website
- `GET /health`: health check
- `GET /api`: service metadata
- `POST /transcribe`: multipart form with `file`, optional `language`, `translate_to`, and `cf-turnstile-response`

The upload limit is 24 MB. Long recordings must be split into smaller files; timestamps are relative to each uploaded file.

## Local checks

```sh
npm test
```

No API keys or secrets belong in this repository.