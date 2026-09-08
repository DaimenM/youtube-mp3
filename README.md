# YouTube to MP3

A Next.js application with a separate conversion worker. The web application dispatches short-lived jobs, while a Dockerized worker runs yt-dlp and FFmpeg, stores results temporarily in Vercel Blob, and applies ID3 metadata. Single videos download as MP3 files; playlists download as ZIP archives containing MP3 files named after their songs.

Only download content when you have permission to do so, and follow YouTube's terms and applicable copyright law.

## Requirements

- Node.js 22 or later
- Python 3.10 or later
- FFmpeg available on `PATH`
- A Vercel Blob store
- Docker for the production-equivalent worker setup

## Local setup

1. Install JavaScript and Python dependencies:

   ```bash
   npm ci
   python3 -m pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env.local`, then set the shared worker secret and Blob token:

   ```dotenv
   BLOB_READ_WRITE_TOKEN=your_token_here
   CONVERSION_WORKER_URL=http://127.0.0.1:8080
   WORKER_API_SECRET=replace-with-a-long-random-secret
   ```

   Export the same values before starting the local worker. The worker uses `python3` by default; set `PYTHON_EXECUTABLE` if necessary.

   `MY_COOKIES` must be a JSON array of browser-cookie objects. Leave it unset unless cookies are required; stale cookies can cause YouTube authentication failures.

3. Start the worker and web application in separate terminals:

   ```bash
   set -a && source .env.local && set +a
   npm run worker
   ```

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

An optional Netscape-format `cookies.txt` file may be placed in the project root for local worker use. This file is ignored by Git and must never be committed. Production workers should receive cookie configuration through their secret manager, not the container image.

## Job flow and diagnostics

`POST /api/convert` validates a URL and returns a job ID with HTTP 202. The browser polls `GET /api/jobs/:id`; the web route authenticates to the worker without exposing `WORKER_API_SECRET`. `DELETE /api/jobs/:id` cancels queued or active work.

`GET /api/convert` proxies the worker health check. A healthy response has `status: "ready"`.

Conversion failures include a stable error `code`, failing `stage`, diagnostic detail, and an actionable suggestion. Progress stages are returned while a job is queued, downloading, editing, and uploading.

Playlist conversions support up to 50 tracks and a 200 MB output by default. Change `MAX_PLAYLIST_TRACKS` or `MAX_OUTPUT_BYTES` on the worker to adjust these limits. The metadata editor applies artist, album, and optional cover art to every playlist track while keeping each song title independently editable.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run worker:check
python3 -m compileall -q src/scripts
npm run build
```

## Hybrid deployment

Deploy the Next.js application to Vercel and deploy `Dockerfile.worker` to a VM or container host. The included `render.yaml` can create the worker on Render, although a VM with controlled/static egress is preferable when YouTube challenges shared datacenter addresses.

Configure these variables on Vercel:

- `BLOB_READ_WRITE_TOKEN`
- `CONVERSION_WORKER_URL` — the worker's public HTTPS origin
- `WORKER_API_SECRET` — the same long random value used by the worker

Configure these variables on the worker:

- `BLOB_READ_WRITE_TOKEN`
- `WORKER_API_SECRET`
- `WORKER_CONCURRENCY` (default `1`)
- `MAX_QUEUE_DEPTH` (default `25`)
- `MAX_PLAYLIST_TRACKS` (default `50`)
- `MAX_OUTPUT_BYTES` (default `209715200`)
- Optional `MY_COOKIES` JSON when an authorized session is genuinely required

The worker must be exposed over HTTPS. Its unauthenticated `GET /health` endpoint is a constant-time liveness check for the hosting platform, while `GET /ready` performs deeper Python, yt-dlp, Mutagen, FFmpeg, and secret-configuration checks. Job creation, status, editing, and cancellation require the bearer secret. Completed media is uploaded directly from the worker to Blob and never travels through a Vercel Function.

Jobs are intentionally stored in the worker process for this first single-instance deployment. Restarting the worker invalidates in-flight job IDs. Before running multiple worker replicas, move job state and queueing to a shared service such as Redis.
