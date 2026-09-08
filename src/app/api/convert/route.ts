import { del } from "@vercel/blob"
import { NextResponse } from "next/server"
import { isVercelBlobUrl, isYouTubeUrl } from "@/lib/server-validation"
import {
  WorkerConfigurationError,
  workerJsonResponse,
  workerRequest,
} from "@/lib/worker-client"

export const runtime = "nodejs"

function workerUnavailable(error: unknown) {
  const configurationError = error instanceof WorkerConfigurationError
  console.error("Conversion worker request failed", error)
  return NextResponse.json({
    error: configurationError
      ? "The conversion worker is not configured."
      : "The conversion worker is unavailable.",
    code: configurationError ? "WORKER_NOT_CONFIGURED" : "WORKER_UNAVAILABLE",
    suggestion: configurationError
      ? "Set CONVERSION_WORKER_URL and WORKER_API_SECRET on the web deployment."
      : "Try again shortly or check the worker health endpoint.",
  }, { status: 503 })
}

export async function GET() {
  try {
    const response = await workerRequest("/health")
    const result = await workerJsonResponse(response)
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    return workerUnavailable(error)
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "The conversion request is not valid JSON." }, { status: 400 })
  }

  const url = typeof body === "object" && body !== null && "url" in body
    ? (body as { url?: unknown }).url
    : undefined
  if (!isYouTubeUrl(url)) {
    return NextResponse.json({
      error: "Enter a valid HTTPS YouTube URL.",
      code: "INVALID_YOUTUBE_URL",
      suggestion: "Copy the video or playlist URL directly from YouTube and try again.",
    }, { status: 400 })
  }

  try {
    const response = await workerRequest("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
    const result = await workerJsonResponse(response)
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    return workerUnavailable(error)
  }
}

export async function DELETE(request: Request) {
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

  try {
    await del(url)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Blob deletion error", error)
    return NextResponse.json({ error: "Failed to delete blob" }, { status: 500 })
  }
}
