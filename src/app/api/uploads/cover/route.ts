import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

const MAX_COVER_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("covers/")) {
          throw new Error("Invalid cover-art path")
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png"],
          maximumSizeInBytes: MAX_COVER_BYTES,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(response)
  } catch (error) {
    console.error("Cover-art upload token error", error)
    return NextResponse.json({ error: "Cover art could not be uploaded" }, { status: 400 })
  }
}
