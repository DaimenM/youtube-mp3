# YouTube to MP3

A Next.js application that converts a YouTube video to MP3, stores the result temporarily in Vercel Blob, and lets the user edit common ID3 metadata before downloading it.

Only download content when you have permission to do so, and follow YouTube's terms and applicable copyright law.

## Requirements

- Node.js 20 or later
- Python 3.10 or later
- FFmpeg available on `PATH`
- A Vercel Blob store

## Local setup

1. Install JavaScript and Python dependencies:

   ```bash
   npm ci
   python3 -m pip install -r requirements.txt
   ```

2. Create `.env.local` and add your Blob token:

   ```dotenv
   BLOB_READ_WRITE_TOKEN=your_token_here
   # Optional JSON cookie array for restricted videos:
   MY_COOKIES=[]
   ```

   The server uses `python3` by default. Set `PYTHON_EXECUTABLE` if your Python executable has another name. `PYTHON_PATH` remains supported as a legacy alias.

   `MY_COOKIES` must be a JSON array of browser-cookie objects. Leave it unset unless cookies are required; stale cookies can cause YouTube authentication failures.

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

An optional Netscape-format `cookies.txt` file may be placed in the project root for videos that require an authenticated YouTube session. This file is ignored by Git and must never be committed.

## Backend diagnostics

`GET /api/convert` checks Python, FFmpeg, Node.js, and Blob configuration without exposing secret values. A healthy response has `status: "ready"`.

Conversion failures include a stable error `code`, failing `stage`, diagnostic `details`, an actionable `suggestion`, and a `requestId` that is also written to the server log. The request timeout defaults to four minutes and can be configured with `CONVERSION_TIMEOUT_MS` between 30 seconds and 10 minutes.

## Checks

```bash
npm run lint
npm run typecheck
npm test
python3 -m compileall -q src/scripts
npm run build
```

## Deployment

The included `render.yaml` installs both Node and Python dependencies. The runtime must also provide FFmpeg and the `BLOB_READ_WRITE_TOKEN` environment variable.
