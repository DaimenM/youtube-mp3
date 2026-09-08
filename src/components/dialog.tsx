"use client"

import { useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Label } from "@radix-ui/react-label"
import { upload } from "@vercel/blob/client"
import { X } from "lucide-react"
import { JobClientError, waitForJob } from "@/lib/job-client"
import { Button } from "./button"
import { Input } from "./input"

export interface TrackMetadata {
  id: string
  title: string
}

interface EditDialogProps {
  isOpen: boolean
  onClose: () => void
  collectionName: string
  mediaType: "track" | "playlist"
  initialTracks: TrackMetadata[]
  downloadUrl: string
  onUpdate: (newUrl: string, newName: string, tracks: TrackMetadata[]) => void
}

export function EditDialog({
  isOpen,
  onClose,
  collectionName,
  mediaType,
  initialTracks,
  downloadUrl,
  onUpdate,
}: EditDialogProps) {
  const [tracks, setTracks] = useState(initialTracks)
  const [artistName, setArtistName] = useState("")
  const [albumName, setAlbumName] = useState(mediaType === "playlist" ? collectionName : "")
  const [coverArt, setCoverArt] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [error, setError] = useState("")

  function updateTrackTitle(index: number, title: string) {
    setTracks((current) => current.map((track, trackIndex) => (
      trackIndex === index ? { ...track, title } : track
    )))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError("")

    const controller = new AbortController()
    let coverArtUrl: string | null = null
    let workerOwnsCoverArt = false
    try {
      if (coverArt) {
        if (coverArt.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png"].includes(coverArt.type)) {
          setError("Cover art must be a JPEG or PNG no larger than 10 MB")
          return
        }
        setStatusMessage("Uploading cover art…")
        const coverBlob = await upload(`covers/${coverArt.name}`, coverArt, {
          access: "public",
          handleUploadUrl: "/api/uploads/cover",
          abortSignal: controller.signal,
        })
        coverArtUrl = coverBlob.url
      }

      setStatusMessage("Creating metadata job…")
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType,
          collectionName,
          fileName: tracks[0]?.title || "",
          tracks,
          artistName,
          albumName,
          downloadUrl,
          coverArtUrl,
        }),
        signal: controller.signal,
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to edit the audio metadata")
        return
      }

      if (typeof data.jobId !== "string") throw new Error("The worker did not return a job ID.")
      workerOwnsCoverArt = true
      const result = await waitForJob<{
        downloadUrl: string
        fileName: string
        tracks: TrackMetadata[]
      }>(data.jobId, controller.signal, (message) => setStatusMessage(message))
      onUpdate(result.downloadUrl, result.fileName, result.tracks)
      onClose()
    } catch (submitError) {
      console.error("Failed to update audio metadata:", submitError)
      const failure = submitError instanceof JobClientError ? submitError.payload : null
      setError(failure?.message || (submitError instanceof Error ? submitError.message : "Network error occurred"))
    } finally {
      if (coverArtUrl && !workerOwnsCoverArt) {
        fetch("/api/convert", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: coverArtUrl }),
        }).catch(console.error)
      }
      setIsLoading(false)
      setStatusMessage("")
    }
  }

  const isPlaylist = mediaType === "playlist"

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className={`fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-green-100 bg-white p-5 shadow-xl focus:outline-none sm:p-6 ${isPlaylist ? "max-w-2xl" : "max-w-md"}`}>
          <div className="border-b border-green-100 pb-4 pr-10">
            <Dialog.Title className="text-xl font-semibold text-green-800">
              Edit {isPlaylist ? "playlist" : "MP3"} metadata
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-gray-600">
              {isPlaylist
                ? "Artist, album, and cover art apply to every MP3. Song names can be changed individually."
                : "Update the song details and optionally add JPEG or PNG cover art."}
            </Dialog.Description>
          </div>

          <Dialog.Close asChild>
            <button type="button" aria-label="Close metadata editor" disabled={isLoading} className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 disabled:opacity-50">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </Dialog.Close>

          {error ? <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

          <form onSubmit={handleSubmit} className="space-y-5 pt-5">
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-3 text-sm font-semibold text-gray-900">Shared metadata</legend>
              <div className="space-y-2">
                <Label htmlFor="artistName" className="text-sm font-medium text-gray-700">Artist name</Label>
                <Input id="artistName" value={artistName} onChange={(event) => setArtistName(event.target.value)} maxLength={100} disabled={isLoading} className="border-green-200 focus-visible:border-green-600 focus-visible:ring-green-600" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="albumName" className="text-sm font-medium text-gray-700">Album name</Label>
                <Input id="albumName" value={albumName} onChange={(event) => setAlbumName(event.target.value)} maxLength={100} disabled={isLoading} className="border-green-200 focus-visible:border-green-600 focus-visible:ring-green-600" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="coverArt" className="text-sm font-medium text-gray-700">Cover art</Label>
                <Input id="coverArt" type="file" accept="image/jpeg,image/png" onChange={(event) => setCoverArt(event.target.files?.[0] || null)} disabled={isLoading} className="h-auto min-h-11 border-green-200 file:mr-3 file:rounded file:bg-green-50 file:px-2 file:py-1 focus-visible:border-green-600 focus-visible:ring-green-600" />
                <p className="text-xs text-gray-500">JPEG or PNG, up to 10 MB. Applied to every track.</p>
              </div>
            </fieldset>

            <fieldset className="space-y-3 border-t border-green-100 pt-5">
              <legend className="px-1 text-sm font-semibold text-gray-900">
                {isPlaylist ? `Song names (${tracks.length})` : "Song name"}
              </legend>
              <div className={isPlaylist ? "max-h-72 space-y-3 overflow-y-auto pr-1" : "space-y-3"}>
                {tracks.map((track, index) => (
                  <div key={track.id} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2">
                    <span className="text-right text-sm tabular-nums text-gray-500" aria-hidden="true">{index + 1}.</span>
                    <div className="min-w-0">
                      <Label htmlFor={`track-${index}`} className="sr-only">Song {index + 1} name</Label>
                      <Input id={`track-${index}`} value={track.title} onChange={(event) => updateTrackTitle(index, event.target.value)} required maxLength={100} disabled={isLoading} className="border-green-200 focus-visible:border-green-600 focus-visible:ring-green-600" />
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col-reverse gap-2 border-t border-green-100 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="min-h-11 border-green-200 text-green-800 hover:bg-green-50">Cancel</Button>
              <Button type="submit" disabled={isLoading} className="min-h-11 bg-green-700 text-white hover:bg-green-800">
                {isLoading ? statusMessage || `Saving ${tracks.length} track${tracks.length === 1 ? "" : "s"}…` : "Save changes"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
