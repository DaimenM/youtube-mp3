import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { del, put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { isVercelBlobUrl, isYouTubeUrl } from "@/lib/server-validation"

export const runtime = "nodejs"
export const maxDuration = 300

const MAX_AUDIO_BYTES = 100 * 1024 * 1024
const MAX_DIAGNOSTIC_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 4 * 60 * 1000
const EVENT_PREFIX = "YTMP3_EVENT:"

interface ConversionEvent {
  event: string
  code?: string
  stage?: string
  title?: string
  fileSize?: number
  message?: string
  detail?: string
  suggestion?: string
}

interface ConversionFailure {
  status: number
  code: string
  stage: string
  message: string
  detail: string
  suggestion: string
}

function getTimeoutMs() {
  const configured = Number(process.env.CONVERSION_TIMEOUT_MS)
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(configured, 30_000), 10 * 60 * 1000)
}

function parseEvents(stderr: string) {
  const events: ConversionEvent[] = []
  const diagnostics: string[] = []

  for (const line of stderr.split(/\r?\n/)) {
    if (!line) continue
    if (!line.startsWith(EVENT_PREFIX)) {
      diagnostics.push(line)
      continue
    }

    try {
      events.push(JSON.parse(line.slice(EVENT_PREFIX.length)) as ConversionEvent)
    } catch {
      diagnostics.push("The converter emitted an unreadable diagnostic event.")
    }
  }

  return { events, diagnostics }
}

function statusForCode(code: string) {
  if (code === "YOUTUBE_RATE_LIMITED") return 429
  if (code === "YOUTUBE_NETWORK_ERROR") return 502
  if (code === "YOUTUBE_AUTH_REQUIRED") return 422
  if (code.startsWith("VIDEO_") || code === "AUDIO_FORMAT_UNAVAILABLE") return 422
  if (code === "INVALID_ARGUMENTS") return 400
  return 500
}

function failureResponse(failure: ConversionFailure, requestId: string) {
  console.error("Conversion failed", {
    requestId,
    code: failure.code,
    stage: failure.stage,
    detail: failure.detail,
  })

  return NextResponse.json(
    {
      error: failure.message,
      code: failure.code,
      stage: failure.stage,
      details: failure.detail,
      suggestion: failure.suggestion,
      requestId,
    },
    { status: failure.status },
  )
}

async function commandAvailable(command: string, args: string[]) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" })
    let settled = false
    const finish = (available: boolean) => {
      if (settled) return
      settled = true
      resolve(available)
    }
    child.once("error", () => finish(false))
    child.once("close", (code) => finish(code === 0))
  })
}

async function resolvePythonRuntime() {
  const candidates = [
    { executable: process.env.PYTHON_EXECUTABLE, source: "PYTHON_EXECUTABLE" },
    { executable: process.env.PYTHON_PATH, source: "PYTHON_PATH" },
    { executable: "python3", source: "python3 fallback" },
    { executable: "python", source: "python fallback" },
  ].filter(
    (candidate, index, all): candidate is { executable: string; source: string } =>
      Boolean(candidate.executable)
      && all.findIndex((item) => item.executable === candidate.executable) === index,
  )

  for (const candidate of candidates) {
    const available = await commandAvailable(candidate.executable, ["-c", "import yt_dlp"])
    if (available) return candidate
  }

  return null
}

export async function GET() {
  const [pythonRuntime, ffmpeg] = await Promise.all([
    resolvePythonRuntime(),
    commandAvailable("ffmpeg", ["-version"]),
  ])
  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  const nodeSupported = Number(process.versions.node.split(".", 1)[0]) >= 22
  const healthy = Boolean(pythonRuntime) && ffmpeg && blobConfigured && nodeSupported

  return NextResponse.json(
    {
      status: healthy ? "ready" : "degraded",
      checks: {
        python: pythonRuntime
          ? { available: true, ytDlpAvailable: true, source: pythonRuntime.source }
          : { available: false },
        ffmpeg: { available: ffmpeg },
        blobStorage: { configured: blobConfigured },
        node: { available: true, supported: nodeSupported },
      },
    },
    { status: healthy ? 200 : 503 },
  )
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID()
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return failureResponse({
      status: 400,
      code: "INVALID_JSON",
      stage: "validation",
      message: "The conversion request is not valid JSON.",
      detail: "The request body could not be parsed.",
      suggestion: "Send a JSON object containing a url field.",
    }, requestId)
  }

  const url = typeof body === "object" && body !== null && "url" in body
    ? (body as { url?: unknown }).url
    : undefined

  if (!isYouTubeUrl(url)) {
    return failureResponse({
      status: 400,
      code: "INVALID_YOUTUBE_URL",
      stage: "validation",
      message: "Enter a valid HTTPS YouTube URL.",
      detail: "Supported hosts include youtube.com, www.youtube.com, music.youtube.com, and youtu.be.",
      suggestion: "Copy the video URL directly from YouTube and try again.",
    }, requestId)
  }

  const pythonScriptPath = path.join(process.cwd(), "src", "scripts", "conversion.py")
  const pythonRuntime = await resolvePythonRuntime()
  if (!pythonRuntime) {
    return failureResponse({
      status: 500,
      code: "PYTHON_UNAVAILABLE",
      stage: "initializing",
      message: "No usable Python interpreter was found.",
      detail: "The configured interpreter and the python3/python fallbacks could not be started.",
      suggestion: "Set PYTHON_EXECUTABLE to a Python 3.10+ executable available to the server.",
    }, requestId)
  }

  const pythonProcess = spawn(pythonRuntime.executable, [pythonScriptPath, url], {
    env: { ...process.env, YTDLP_NODE_PATH: process.execPath },
    stdio: ["ignore", "pipe", "pipe"],
  })

  const audioChunks: Buffer[] = []
  const diagnosticChunks: Buffer[] = []
  let audioBytes = 0
  let diagnosticBytes = 0
  let exceededSizeLimit = false
  let timedOut = false
  const abortProcess = () => pythonProcess.kill("SIGTERM")
  const timeout = setTimeout(() => {
    timedOut = true
    pythonProcess.kill("SIGTERM")
  }, getTimeoutMs())

  request.signal.addEventListener("abort", abortProcess, { once: true })
  pythonProcess.stdout.on("data", (chunk: Buffer) => {
    audioBytes += chunk.length
    if (audioBytes > MAX_AUDIO_BYTES) {
      exceededSizeLimit = true
      pythonProcess.kill("SIGTERM")
      return
    }
    audioChunks.push(chunk)
  })
  pythonProcess.stderr.on("data", (chunk: Buffer) => {
    if (diagnosticBytes >= MAX_DIAGNOSTIC_BYTES) return
    diagnosticBytes += chunk.length
    diagnosticChunks.push(chunk.subarray(0, MAX_DIAGNOSTIC_BYTES - diagnosticBytes + chunk.length))
  })

  const result = await new Promise<{ code: number | null; error?: Error }>((resolve) => {
    let settled = false
    const finish = (value: { code: number | null; error?: Error }) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    pythonProcess.once("error", (error) => finish({ code: null, error }))
    pythonProcess.once("close", (code) => finish({ code }))
  })

  clearTimeout(timeout)
  request.signal.removeEventListener("abort", abortProcess)

  if (result.error) {
    return failureResponse({
      status: 500,
      code: "PYTHON_START_FAILED",
      stage: "initializing",
      message: "The conversion worker could not be started.",
      detail: result.error.message,
      suggestion: "Check PYTHON_EXECUTABLE (or legacy PYTHON_PATH) and the server's Python installation.",
    }, requestId)
  }
  if (timedOut) {
    return failureResponse({
      status: 504,
      code: "CONVERSION_TIMEOUT",
      stage: "youtube_or_ffmpeg",
      message: "The conversion took too long and was stopped.",
      detail: `The worker exceeded the ${Math.round(getTimeoutMs() / 1000)} second limit.`,
      suggestion: "Try a shorter video or increase CONVERSION_TIMEOUT_MS on a server that permits longer requests.",
    }, requestId)
  }
  if (exceededSizeLimit) {
    return failureResponse({
      status: 413,
      code: "OUTPUT_TOO_LARGE",
      stage: "youtube_or_ffmpeg",
      message: "The converted MP3 exceeds the 100 MB limit.",
      detail: "The worker was stopped before the oversized file could be uploaded.",
      suggestion: "Choose a shorter video.",
    }, requestId)
  }
  if (request.signal.aborted) {
    return failureResponse({
      status: 499,
      code: "CONVERSION_CANCELLED",
      stage: "youtube_or_ffmpeg",
      message: "The conversion was cancelled.",
      detail: "The client closed or cancelled the request.",
      suggestion: "Start the conversion again when ready.",
    }, requestId)
  }

  const stderr = Buffer.concat(diagnosticChunks).toString("utf8")
  const { events, diagnostics } = parseEvents(stderr)
  const resultEvent = events.findLast((event) => event.event === "result")
  const errorEvent = events.findLast((event) => event.event === "error")

  if (result.code !== 0 || audioChunks.length === 0 || !resultEvent?.title) {
    const code = errorEvent?.code || "CONVERSION_FAILED"
    return failureResponse({
      status: statusForCode(code),
      code,
      stage: errorEvent?.stage || "youtube_or_ffmpeg",
      message: errorEvent?.message || "The video could not be converted.",
      detail: errorEvent?.detail || diagnostics.slice(-3).join(" ") || `The worker exited with code ${result.code}.`,
      suggestion: errorEvent?.suggestion || "Review the server logs using the request ID, then try another public video.",
    }, requestId)
  }

  try {
    const audioBuffer = Buffer.concat(audioChunks)
    const blob = await put(`${resultEvent.title}.mp3`, audioBuffer, {
      access: "public",
      addRandomSuffix: true,
      contentType: "audio/mpeg",
    })

    return NextResponse.json({
      downloadUrl: blob.url,
      videoTitle: resultEvent.title,
      fileSize: resultEvent.fileSize || audioBuffer.length,
      requestId,
    })
  } catch (error) {
    return failureResponse({
      status: 502,
      code: "BLOB_UPLOAD_FAILED",
      stage: "blob_upload",
      message: "The MP3 was created, but it could not be uploaded.",
      detail: error instanceof Error ? error.message : "The Blob storage request failed.",
      suggestion: "Verify BLOB_READ_WRITE_TOKEN and the Blob store configuration, then try again.",
    }, requestId)
  }
}

export async function DELETE(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const url = typeof body === "object" && body !== null && "url" in body
      ? (body as { url?: unknown }).url
      : undefined

    if (!isVercelBlobUrl(url)) {
      return NextResponse.json({ error: "Invalid blob URL" }, { status: 400 })
    }

    await del(url)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Blob deletion error:", error)
    return NextResponse.json({ error: "Failed to delete blob" }, { status: 500 })
  }
}
