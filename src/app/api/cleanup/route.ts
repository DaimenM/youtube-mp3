import { del } from "@vercel/blob"
import { NextResponse } from "next/server"
import { isVercelBlobUrl } from "@/lib/server-validation"

export const runtime = "nodejs"

export async function POST(request: Request) {
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
    console.error("Cleanup error:", error)
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
  }
}
