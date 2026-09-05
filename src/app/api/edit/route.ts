import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { del, put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { isVercelBlobUrl, sanitizeFileName } from "@/lib/server-validation"

export const runtime = "nodejs"

const MAX_MP3_BYTES = 100 * 1024 * 1024
const MAX_COVER_BYTES = 10 * 1024 * 1024
const ALLOWED_COVER_TYPES = new Set(["image/jpeg", "image/png"])

async function runEditor(scriptPath: string, mp3Path: string, metadata: object) {
  const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python3"
  const child = spawn(pythonExecutable, [scriptPath, mp3Path, JSON.stringify(metadata)], {
    stdio: ["ignore", "ignore", "pipe"],
  })
  const stderr: Buffer[] = []
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))

  const result = await new Promise<{ code: number | null; error?: Error }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }))
    child.once("close", (code) => resolve({ code }))
  })

  if (result.error) throw result.error
  if (result.code !== 0) {
    console.error("MP3 editor failed:", Buffer.concat(stderr).toString("utf8"))
    throw new Error("Failed to edit MP3")
  }
}

export async function POST(request: Request): Promise<Response> {
  const tempPaths: string[] = []

  try {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
    }
    const downloadUrl = formData.get("downloadUrl")
    const fileName = sanitizeFileName(formData.get("fileName"))

    if (!isVercelBlobUrl(downloadUrl)) {
      return NextResponse.json({ error: "Invalid download URL" }, { status: 400 })
    }
    if (!fileName) {
      return NextResponse.json({ error: "Song name is required" }, { status: 400 })
    }

    const coverArtEntry = formData.get("coverArt")
    const coverArt = coverArtEntry instanceof File && coverArtEntry.size > 0
      ? coverArtEntry
      : null
    if (coverArt && (!ALLOWED_COVER_TYPES.has(coverArt.type) || coverArt.size > MAX_COVER_BYTES)) {
      return NextResponse.json(
        { error: "Cover art must be a JPEG or PNG no larger than 10 MB" },
        { status: 400 },
      )
    }

    const response = await fetch(downloadUrl)
    if (!response.ok) throw new Error("Failed to download MP3")

    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > MAX_MP3_BYTES) {
      return NextResponse.json({ error: "MP3 is too large to edit" }, { status: 413 })
    }

    const mp3Buffer = Buffer.from(await response.arrayBuffer())
    if (mp3Buffer.length === 0 || mp3Buffer.length > MAX_MP3_BYTES) {
      return NextResponse.json({ error: "MP3 is empty or too large to edit" }, { status: 413 })
    }

    const id = randomUUID()
    const tempMp3Path = path.join(os.tmpdir(), `youtube-mp3-${id}.mp3`)
    tempPaths.push(tempMp3Path)
    await fs.writeFile(tempMp3Path, mp3Buffer, { flag: "wx" })

    let tempCoverPath: string | null = null
    if (coverArt) {
      const extension = coverArt.type === "image/png" ? "png" : "jpg"
      tempCoverPath = path.join(os.tmpdir(), `youtube-cover-${id}.${extension}`)
      tempPaths.push(tempCoverPath)
      await fs.writeFile(tempCoverPath, Buffer.from(await coverArt.arrayBuffer()), { flag: "wx" })
    }

    const metadata = {
      fileName,
      artistName: sanitizeFileName(formData.get("artistName")),
      albumName: sanitizeFileName(formData.get("albumName")),
      coverArt: tempCoverPath,
    }

    const scriptPath = path.join(process.cwd(), "src", "scripts", "edit_mp3.py")
    await runEditor(scriptPath, tempMp3Path, metadata)

    const blob = await put(`${fileName}.mp3`, await fs.readFile(tempMp3Path), {
      access: "public",
      addRandomSuffix: true,
      contentType: "audio/mpeg",
    })

    try {
      await del(downloadUrl)
    } catch (error) {
      console.error("Failed to remove original blob after editing:", error)
    }

    return NextResponse.json({ success: true, downloadUrl: blob.url, fileName })
  } catch (error) {
    console.error("MP3 edit error:", error)
    return NextResponse.json({ error: "Unable to edit the MP3" }, { status: 500 })
  } finally {
    await Promise.all(tempPaths.map(async (tempPath) => {
      try {
        await fs.unlink(tempPath)
      } catch (error) {
        const code = error instanceof Error && "code" in error ? error.code : undefined
        if (code !== "ENOENT") console.error("Temporary file cleanup failed:", error)
      }
    }))
  }
}
