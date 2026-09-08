import { createServer } from "node:http"
import { randomUUID, timingSafeEqual } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import readline from "node:readline"
import { spawn } from "node:child_process"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { del, put } from "@vercel/blob"

const PORT = positiveInteger(process.env.PORT, 8080)
const CONCURRENCY = positiveInteger(process.env.WORKER_CONCURRENCY, 1)
const MAX_QUEUE_DEPTH = positiveInteger(process.env.MAX_QUEUE_DEPTH, 25)
const MAX_OUTPUT_BYTES = positiveInteger(process.env.MAX_OUTPUT_BYTES, 200 * 1024 * 1024)
const MAX_COVER_BYTES = 10 * 1024 * 1024
const MAX_REQUEST_BYTES = 128 * 1024
const JOB_TTL_MS = positiveInteger(process.env.JOB_TTL_MS, 24 * 60 * 60 * 1000)
const EVENT_PREFIX = "YTMP3_EVENT:"
const YOUTUBE_HOSTS = new Set([
  "youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
])

const jobs = new Map()
const queue = []
const activeProcesses = new Map()
const activeControllers = new Map()
let activeJobs = 0

class JobFailure extends Error {
  constructor(code, message, detail, suggestion, status = 500) {
    super(message)
    this.code = code
    this.detail = detail
    this.suggestion = suggestion
    this.status = status
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function sanitizeName(value) {
  if (typeof value !== "string") return ""
  return value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
}

function isYouTubeUrl(value) {
  if (typeof value !== "string" || value.length > 2_048) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && YOUTUBE_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function isBlobUrl(value) {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com")
  } catch {
    return false
  }
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(left || "")
  const rightBuffer = Buffer.from(right || "")
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function authorized(request) {
  const configured = process.env.WORKER_API_SECRET
  if (!configured) return false
  const header = request.headers.authorization || ""
  return header.startsWith("Bearer ") && secureEqual(header.slice(7), configured)
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  })
  response.end(payload)
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_REQUEST_BYTES) {
      throw new JobFailure("REQUEST_TOO_LARGE", "Request body is too large.", "Worker job payload exceeded 128 KB.", "Send metadata and Blob URLs only.", 413)
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new JobFailure("INVALID_JSON", "Request body is not valid JSON.", "The worker could not parse the request.", "Send a JSON object.", 400)
  }
}

function publicJob(job) {
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    message: job.message,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.result ? { result: job.result } : {}),
    ...(job.failure ? { failure: job.failure } : {}),
  }
}

function updateJob(job, changes) {
  Object.assign(job, changes, { updatedAt: new Date().toISOString() })
}

function createJob(kind, input) {
  const now = new Date().toISOString()
  const job = {
    id: randomUUID(),
    kind,
    input,
    status: "queued",
    stage: "queued",
    message: "Waiting for an available worker.",
    createdAt: now,
    updatedAt: now,
    cancelRequested: false,
  }
  jobs.set(job.id, job)
  queue.push(job.id)
  pumpQueue()
  return job
}

function pumpQueue() {
  while (activeJobs < CONCURRENCY && queue.length > 0) {
    const id = queue.shift()
    const job = jobs.get(id)
    if (!job || job.status !== "queued") continue
    activeJobs += 1
    runJob(job).finally(() => {
      activeJobs -= 1
      pumpQueue()
    })
  }
}

async function runJob(job) {
  updateJob(job, { status: "running", stage: "initializing", message: "Starting the worker job." })
  try {
    const result = job.kind === "conversion"
      ? await runConversion(job)
      : await runEdit(job)
    if (job.cancelRequested) {
      updateJob(job, { status: "cancelled", stage: "cancelled", message: "Job cancelled." })
      return
    }
    updateJob(job, { status: "succeeded", stage: "complete", message: "Job completed.", result })
  } catch (error) {
    if (job.cancelRequested || error?.name === "AbortError") {
      updateJob(job, { status: "cancelled", stage: "cancelled", message: "Job cancelled." })
      return
    }
    const failure = error instanceof JobFailure
      ? error
      : new JobFailure("WORKER_JOB_FAILED", "The worker job failed.", error instanceof Error ? error.message : "Unknown worker error", "Check the worker logs and try again.")
    console.error("Worker job failed", { jobId: job.id, kind: job.kind, code: failure.code, detail: failure.detail })
    updateJob(job, {
      status: "failed",
      stage: job.stage,
      message: failure.message,
      failure: {
        status: failure.status,
        code: failure.code,
        stage: job.stage,
        message: failure.message,
        detail: failure.detail,
        suggestion: failure.suggestion,
      },
    })
  } finally {
    activeProcesses.delete(job.id)
    activeControllers.delete(job.id)
  }
}

function sizeLimiter(maxBytes, onExceeded) {
  let bytes = 0
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      if (bytes > maxBytes) {
        onExceeded?.()
        callback(new JobFailure("OUTPUT_TOO_LARGE", "The media file exceeds the configured limit.", `The file exceeded ${maxBytes} bytes.`, "Choose a shorter video or playlist.", 413))
        return
      }
      callback(null, chunk)
    },
  })
}

function pythonExecutable() {
  return process.env.PYTHON_EXECUTABLE || "python3"
}

function commandAvailable(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" })
    let settled = false
    const finish = (available) => {
      if (settled) return
      settled = true
      resolve(available)
    }
    child.once("error", () => finish(false))
    child.once("close", (code) => finish(code === 0))
  })
}

async function runPython(job, script, args, stdoutPath = null) {
  const child = spawn(pythonExecutable(), [script, ...args], {
    env: { ...process.env, YTDLP_NODE_PATH: process.execPath },
    stdio: ["ignore", stdoutPath ? "pipe" : "ignore", "pipe"],
  })
  activeProcesses.set(job.id, child)
  const diagnostics = []
  let resultEvent = null
  let errorEvent = null

  const lines = readline.createInterface({ input: child.stderr })
  lines.on("line", (line) => {
    if (!line.startsWith(EVENT_PREFIX)) {
      if (diagnostics.join(" ").length < 64 * 1024) diagnostics.push(line.slice(0, 1_000))
      return
    }
    try {
      const event = JSON.parse(line.slice(EVENT_PREFIX.length))
      if (event.event === "stage") {
        updateJob(job, { stage: event.stage || job.stage, message: event.message || job.message })
      } else if (event.event === "result") {
        resultEvent = event
      } else if (event.event === "error") {
        errorEvent = event
      }
    } catch {
      diagnostics.push("The converter emitted an unreadable event.")
    }
  })

  let outputPromise = Promise.resolve()
  if (stdoutPath) {
    outputPromise = pipeline(
      child.stdout,
      sizeLimiter(MAX_OUTPUT_BYTES, () => child.kill("SIGTERM")),
      createWriteStream(stdoutPath, { flags: "wx" }),
    )
  }

  const processResult = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }))
    child.once("close", (code) => resolve({ code }))
  })
  const outputResult = await Promise.allSettled([outputPromise])
  lines.close()

  if (processResult.error) {
    throw new JobFailure("PYTHON_START_FAILED", "The Python worker could not start.", processResult.error.message, "Check Python and the worker image.")
  }
  if (outputResult[0].status === "rejected" && !job.cancelRequested) throw outputResult[0].reason
  if (processResult.code !== 0) {
    throw new JobFailure(
      errorEvent?.code || "PYTHON_PROCESS_FAILED",
      errorEvent?.message || "The media operation failed.",
      errorEvent?.detail || diagnostics.slice(-3).join(" ") || `Python exited with code ${processResult.code}.`,
      errorEvent?.suggestion || "Review the worker logs and try again.",
      statusForCode(errorEvent?.code),
    )
  }
  return resultEvent
}

function statusForCode(code) {
  if (code === "YOUTUBE_RATE_LIMITED") return 429
  if (code === "PLAYLIST_TOO_LARGE" || code === "OUTPUT_TOO_LARGE") return 413
  if (code === "YOUTUBE_NETWORK_ERROR") return 502
  if (code === "YOUTUBE_AUTH_REQUIRED" || code?.startsWith("VIDEO_") || code === "AUDIO_FORMAT_UNAVAILABLE") return 422
  return 500
}

async function runConversion(job) {
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-worker-"))
  const outputPath = path.join(directory, "conversion-output.bin")
  try {
    const script = path.join(process.cwd(), "src", "scripts", "conversion.py")
    const result = await runPython(job, script, [job.input.url], outputPath)
    if (!result?.title || !result?.mediaType) {
      throw new JobFailure("CONVERSION_RESULT_MISSING", "The converter did not return a result.", "The result event was missing required fields.", "Review the worker logs and update yt-dlp.")
    }
    const file = await stat(outputPath)
    const playlist = result.mediaType === "playlist"
    const extension = playlist ? "zip" : "mp3"
    updateJob(job, { stage: "uploading", message: "Uploading the completed download." })
    const blob = await put(`${sanitizeName(result.title) || "audio"}.${extension}`, createReadStream(outputPath), {
      access: "public",
      addRandomSuffix: true,
      contentType: playlist ? "application/zip" : "audio/mpeg",
      multipart: file.size > 100 * 1024 * 1024,
    })
    return {
      downloadUrl: blob.url,
      videoTitle: sanitizeName(result.title) || "audio",
      mediaType: playlist ? "playlist" : "track",
      tracks: Array.isArray(result.tracks) ? result.tracks : [],
      fileSize: result.fileSize || file.size,
    }
  } finally {
    if (input.coverArtUrl) await Promise.allSettled([del(input.coverArtUrl)])
    await rm(directory, { recursive: true, force: true })
  }
}

async function downloadToFile(job, url, target, maxBytes) {
  const controller = new AbortController()
  activeControllers.set(job.id, controller)
  const response = await fetch(url, { signal: controller.signal, redirect: "error" })
  if (!response.ok || !response.body) {
    throw new JobFailure("BLOB_DOWNLOAD_FAILED", "The worker could not download the media file.", `Blob returned HTTP ${response.status}.`, "Try the operation again.", 502)
  }
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new JobFailure("BLOB_TOO_LARGE", "The Blob is too large to process.", `Blob size is ${contentLength} bytes.`, "Use a smaller media file.", 413)
  }
  await pipeline(
    Readable.fromWeb(response.body),
    sizeLimiter(maxBytes, () => controller.abort()),
    createWriteStream(target, { flags: "wx" }),
  )
}

async function runEdit(job) {
  const input = job.input
  const directory = await mkdtemp(path.join(tmpdir(), "youtube-edit-worker-"))
  const extension = input.mediaType === "playlist" ? "zip" : "mp3"
  const mediaPath = path.join(directory, `media.${extension}`)
  const coverPath = input.coverArtUrl ? path.join(directory, "cover") : null
  try {
    updateJob(job, { stage: "downloading", message: "Downloading the media for editing." })
    await downloadToFile(job, input.downloadUrl, mediaPath, MAX_OUTPUT_BYTES)
    if (coverPath) await downloadToFile(job, input.coverArtUrl, coverPath, MAX_COVER_BYTES)

    updateJob(job, { stage: "editing", message: "Applying metadata to the audio." })
    const scriptName = input.mediaType === "playlist" ? "edit_playlist.py" : "edit_mp3.py"
    const script = path.join(process.cwd(), "src", "scripts", scriptName)
    const metadata = {
      fileName: input.fileName,
      artistName: input.artistName,
      albumName: input.albumName,
      coverArt: coverPath,
      tracks: input.tracks,
    }
    await runPython(job, script, [mediaPath, JSON.stringify(metadata)])

    const outputName = input.mediaType === "playlist" ? input.collectionName : input.fileName
    const file = await stat(mediaPath)
    updateJob(job, { stage: "uploading", message: "Uploading the edited media." })
    const blob = await put(`${sanitizeName(outputName) || "audio"}.${extension}`, createReadStream(mediaPath), {
      access: "public",
      addRandomSuffix: true,
      contentType: input.mediaType === "playlist" ? "application/zip" : "audio/mpeg",
      multipart: file.size > 100 * 1024 * 1024,
    })
    await Promise.allSettled([del(input.downloadUrl)])
    return {
      downloadUrl: blob.url,
      fileName: sanitizeName(outputName) || "audio",
      mediaType: input.mediaType,
      tracks: input.tracks,
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function validateEditInput(body) {
  if (!isBlobUrl(body?.downloadUrl)) return "Invalid media Blob URL"
  if (body.coverArtUrl != null && !isBlobUrl(body.coverArtUrl)) return "Invalid cover-art Blob URL"
  if (body.mediaType !== "track" && body.mediaType !== "playlist") return "Invalid media type"
  if (!Array.isArray(body.tracks) || body.tracks.length < 1 || body.tracks.length > 50) return "Invalid track list"
  for (const track of body.tracks) {
    if (!track || !sanitizeName(track.title)) return "Every track requires a title"
  }
  if (body.mediaType === "track" && !sanitizeName(body.fileName)) return "A file name is required"
  return null
}

function cancelJob(job) {
  if (["succeeded", "failed", "cancelled"].includes(job.status)) return
  job.cancelRequested = true
  if (job.status === "queued") {
    updateJob(job, { status: "cancelled", stage: "cancelled", message: "Job cancelled." })
  }
  activeControllers.get(job.id)?.abort()
  activeProcesses.get(job.id)?.kill("SIGTERM")
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)

  if (request.method === "GET" && url.pathname === "/health") {
    const [python, ffmpeg] = await Promise.all([
      commandAvailable(pythonExecutable(), ["-c", "import yt_dlp, mutagen"]),
      commandAvailable("ffmpeg", ["-version"]),
    ])
    const secretsConfigured = Boolean(process.env.WORKER_API_SECRET && process.env.BLOB_READ_WRITE_TOKEN)
    const healthy = secretsConfigured && python && ffmpeg
    sendJson(response, healthy ? 200 : 503, {
      status: healthy ? "ready" : "degraded",
      checks: {
        workerSecret: Boolean(process.env.WORKER_API_SECRET),
        blobStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        python,
        ffmpeg,
        queueDepth: queue.length,
        activeJobs,
      },
    })
    return
  }

  if (!authorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" })
    return
  }

  try {
    if (request.method === "POST" && url.pathname === "/jobs") {
      const body = await readJson(request)
      if (!isYouTubeUrl(body?.url)) {
        sendJson(response, 400, { error: "Invalid YouTube URL", code: "INVALID_YOUTUBE_URL" })
        return
      }
      if (queue.length >= MAX_QUEUE_DEPTH) {
        sendJson(response, 429, { error: "The worker queue is full. Try again later.", code: "WORKER_QUEUE_FULL" })
        return
      }
      const job = createJob("conversion", { url: body.url })
      sendJson(response, 202, publicJob(job))
      return
    }

    if (request.method === "POST" && url.pathname === "/edit-jobs") {
      const body = await readJson(request)
      const error = validateEditInput(body)
      if (error) {
        sendJson(response, 400, { error, code: "INVALID_EDIT_REQUEST" })
        return
      }
      if (queue.length >= MAX_QUEUE_DEPTH) {
        sendJson(response, 429, { error: "The worker queue is full. Try again later.", code: "WORKER_QUEUE_FULL" })
        return
      }
      const job = createJob("edit", {
        ...body,
        collectionName: sanitizeName(body.collectionName) || "YouTube playlist",
        fileName: sanitizeName(body.fileName),
        artistName: sanitizeName(body.artistName),
        albumName: sanitizeName(body.albumName),
        tracks: body.tracks.map((track, index) => ({ id: String(track.id || index + 1).slice(0, 100), title: sanitizeName(track.title) })),
      })
      sendJson(response, 202, publicJob(job))
      return
    }

    const match = url.pathname.match(/^\/jobs\/([0-9a-f-]+)$/i)
    if (match && (request.method === "GET" || request.method === "DELETE")) {
      const job = jobs.get(match[1])
      if (!job) {
        sendJson(response, 404, { error: "Job not found", code: "JOB_NOT_FOUND" })
        return
      }
      if (request.method === "DELETE") cancelJob(job)
      sendJson(response, 200, publicJob(job))
      return
    }

    sendJson(response, 404, { error: "Not found" })
  } catch (error) {
    const status = error instanceof JobFailure ? error.status : 500
    console.error("Worker request failed", error)
    sendJson(response, status, {
      error: error instanceof JobFailure ? error.message : "Worker request failed",
      code: error instanceof JobFailure ? error.code : "WORKER_REQUEST_FAILED",
    })
  }
})

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs) {
    if (["succeeded", "failed", "cancelled"].includes(job.status) && Date.parse(job.updatedAt) < cutoff) {
      jobs.delete(id)
    }
  }
}, Math.min(JOB_TTL_MS, 60 * 60 * 1000)).unref()

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Conversion worker listening on port ${PORT} with concurrency ${CONCURRENCY}`)
})

function shutdown() {
  for (const job of jobs.values()) cancelJob(job)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
