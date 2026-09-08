import { NextResponse } from "next/server"
import { isVercelBlobUrl, sanitizeFileName } from "@/lib/server-validation"
import { workerJsonResponse, workerRequest } from "@/lib/worker-client"

export const runtime = "nodejs"

interface EditRequest {
  downloadUrl?: unknown
  coverArtUrl?: unknown
  mediaType?: unknown
  collectionName?: unknown
  fileName?: unknown
  artistName?: unknown
  albumName?: unknown
  tracks?: unknown
}

function parseTracks(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null

  const tracks: Array<{ id: string; title: string }> = []
  for (const [index, track] of value.entries()) {
    if (typeof track !== "object" || track === null) return null
    const candidate = track as { id?: unknown; title?: unknown }
    const title = sanitizeFileName(candidate.title)
    if (!title) return null
    tracks.push({
      id: String(candidate.id || index + 1).slice(0, 100),
      title,
    })
  }
  return tracks
}

export async function POST(request: Request) {
  let body: EditRequest
  try {
    body = await request.json() as EditRequest
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!isVercelBlobUrl(body.downloadUrl)) {
    return NextResponse.json({ error: "Invalid download URL" }, { status: 400 })
  }
  if (body.coverArtUrl != null && !isVercelBlobUrl(body.coverArtUrl)) {
    return NextResponse.json({ error: "Invalid cover-art URL" }, { status: 400 })
  }

  const mediaType = body.mediaType === "playlist" ? "playlist" : "track"
  const tracks = parseTracks(body.tracks)
  const fileName = sanitizeFileName(body.fileName)
  if (!tracks || (mediaType === "track" && !fileName)) {
    return NextResponse.json({ error: "Valid song metadata is required" }, { status: 400 })
  }

  const payload = {
    downloadUrl: body.downloadUrl,
    coverArtUrl: body.coverArtUrl || null,
    mediaType,
    collectionName: sanitizeFileName(body.collectionName) || "YouTube playlist",
    fileName,
    artistName: sanitizeFileName(body.artistName),
    albumName: sanitizeFileName(body.albumName),
    tracks,
  }

  try {
    const response = await workerRequest("/edit-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const result = await workerJsonResponse(response)
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("Metadata worker request failed", error)
    return NextResponse.json({
      error: "The metadata worker is unavailable.",
      code: "WORKER_UNAVAILABLE",
      suggestion: "Try again shortly or check the worker service.",
    }, { status: 503 })
  }
}
