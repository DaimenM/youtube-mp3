"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Music } from "lucide-react"
import { Button } from "@/components/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/card"
import { EditDialog } from "@/components/dialog"
import { Header } from "@/components/header"
import { Input } from "@/components/input"

interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<FileSystemFileHandle>
}

interface ConversionError {
  message: string
  code?: string
  stage?: string
  details?: string
  suggestion?: string
  requestId?: string
}

function parseApiError(data: unknown): ConversionError {
  if (typeof data !== "object" || data === null) {
    return { message: "The server returned an unreadable error response." }
  }

  const error = data as Record<string, unknown>
  return {
    message: typeof error.error === "string" ? error.error : "Conversion failed.",
    code: typeof error.code === "string" ? error.code : undefined,
    stage: typeof error.stage === "string" ? error.stage : undefined,
    details: typeof error.details === "string" ? error.details : undefined,
    suggestion: typeof error.suggestion === "string" ? error.suggestion : undefined,
    requestId: typeof error.requestId === "string" ? error.requestId : undefined,
  }
}

function safeDownloadName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "audio"
}

async function deleteBlob(url: string) {
  const response = await fetch("/api/convert", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) throw new Error("Failed to delete the temporary audio file")
}

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [isConverting, setIsConverting] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState("")
  const [videoTitle, setVideoTitle] = useState("")
  const [error, setError] = useState<ConversionError | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!downloadUrl) return

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return
      navigator.sendBeacon(
        "/api/cleanup",
        new Blob([JSON.stringify({ url: downloadUrl })], { type: "application/json" }),
      )
    }

    window.addEventListener("pagehide", handlePageHide)
    return () => window.removeEventListener("pagehide", handlePageHide)
  }, [downloadUrl])

  async function downloadFile() {
    setError(null)

    try {
      const response = await fetch(downloadUrl)
      if (!response.ok) throw new Error("Download failed")
      const blob = await response.blob()
      const fileName = `${safeDownloadName(videoTitle)}.mp3`
      const filePicker = (window as FilePickerWindow).showSaveFilePicker

      if (filePicker) {
        try {
          const handle = await filePicker({
            suggestedName: fileName,
            types: [{
              description: "MP3 audio file",
              accept: { "audio/mpeg": [".mp3"] },
            }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          return
        } catch (pickerError) {
          if (pickerError instanceof Error && pickerError.name === "AbortError") return
        }
      }

      const blobUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = blobUrl
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (downloadError) {
      console.error("Download failed:", downloadError)
      setError({
        message: "The MP3 could not be downloaded.",
        suggestion: "Check your connection and try again.",
      })
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsConverting(true)
    setError(null)
    const previousDownloadUrl = downloadUrl

    try {
      const controller = new AbortController()
      abortControllerRef.current = controller
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
        signal: controller.signal,
      })
      const data = await response.json()

      if (!response.ok) {
        setError(parseApiError(data))
        return
      }

      setDownloadUrl(data.downloadUrl)
      setVideoTitle(data.videoTitle)
      if (previousDownloadUrl && previousDownloadUrl !== data.downloadUrl) {
        deleteBlob(previousDownloadUrl).catch(console.error)
      }
    } catch (conversionError) {
      if (conversionError instanceof Error && conversionError.name === "AbortError") {
        setError({ message: "Conversion cancelled." })
      } else {
        console.error("Conversion request failed:", conversionError)
        setError({
          message: "The converter could not reach the backend.",
          details: conversionError instanceof Error ? conversionError.message : undefined,
          suggestion: "Check that the server is running and try again.",
        })
      }
    } finally {
      setIsConverting(false)
      abortControllerRef.current = null
    }
  }

  async function handleConvertAnother() {
    const oldDownloadUrl = downloadUrl
    setYoutubeUrl("")
    setDownloadUrl("")
    setVideoTitle("")
    setError(null)

    if (oldDownloadUrl) {
      try {
        await deleteBlob(oldDownloadUrl)
      } catch (cleanupError) {
        console.error("Temporary file cleanup failed:", cleanupError)
      }
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-950">
      <Header />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <Card className="mx-auto w-full max-w-lg border-green-100 shadow-xl">
          <CardHeader className="border-b border-green-100">
            <CardTitle className="text-xl text-green-800">Convert video</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label htmlFor="youtube-url" className="sr-only">YouTube video URL</label>
              <Input
                id="youtube-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://www.youtube.com/watch?v=…"
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                required
                disabled={isConverting}
                aria-describedby={error ? "conversion-error" : "conversion-help"}
                className="border-green-200 focus-visible:border-green-600 focus-visible:ring-green-600"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="submit"
                  className="min-h-11 flex-1 bg-green-700 text-white hover:bg-green-800"
                  disabled={isConverting}
                >
                  {isConverting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Converting…
                    </span>
                  ) : "Convert to MP3"}
                </Button>
                {isConverting ? (
                  <Button
                    type="button"
                    onClick={handleCancel}
                    className="min-h-11 bg-red-700 text-white hover:bg-red-800"
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>

            {error ? (
              <div id="conversion-error" role="alert" className="mt-4 space-y-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-950">
                <p className="font-semibold">{error.message}</p>
                {error.details ? <p className="break-words">{error.details}</p> : null}
                {error.suggestion ? <p><span className="font-medium">Try this:</span> {error.suggestion}</p> : null}
                {error.code || error.requestId ? (
                  <p className="break-all text-xs text-red-800">
                    {error.code ? `Code: ${error.code}` : ""}
                    {error.code && error.stage ? " · " : ""}
                    {error.stage ? `Stage: ${error.stage}` : ""}
                    {(error.code || error.stage) && error.requestId ? " · " : ""}
                    {error.requestId ? `Request: ${error.requestId}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}

            {downloadUrl ? (
              <section className="mt-6 space-y-4" aria-live="polite">
                <p className="break-words text-center text-lg font-semibold text-gray-800">{videoTitle}</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
                  <Button
                    type="button"
                    onClick={downloadFile}
                    variant="outline"
                    className="min-h-11 border-green-200 text-green-800 hover:bg-green-50"
                  >
                    <Music className="mr-2 h-4 w-4" aria-hidden="true" />
                    Download MP3
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setIsEditDialogOpen(true)}
                    className="min-h-11 bg-blue-700 text-white hover:bg-blue-800"
                  >
                    Edit metadata
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConvertAnother}
                    className="min-h-11 bg-green-700 text-white hover:bg-green-800"
                  >
                    Convert another
                  </Button>
                </div>
                <EditDialog
                  isOpen={isEditDialogOpen}
                  onClose={() => setIsEditDialogOpen(false)}
                  initialFileName={videoTitle}
                  downloadUrl={downloadUrl}
                  onUpdate={(newUrl, newFileName) => {
                    setDownloadUrl(newUrl)
                    setVideoTitle(newFileName)
                  }}
                />
              </section>
            ) : null}
          </CardContent>
          <CardFooter className="border-t border-green-100 pt-6">
            <p id="conversion-help" className="w-full text-center text-sm text-gray-600">
              Enter a valid YouTube link to convert it to MP3.
            </p>
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}
