"use client"

import { useEffect, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Label } from "@radix-ui/react-label"
import { X } from "lucide-react"
import { Button } from "./button"
import { Input } from "./input"

interface EditDialogProps {
  isOpen: boolean
  onClose: () => void
  initialFileName: string
  downloadUrl: string
  onUpdate: (newUrl: string, newFileName: string) => void
}

export function EditDialog({
  isOpen,
  onClose,
  initialFileName,
  downloadUrl,
  onUpdate,
}: EditDialogProps) {
  const [fileName, setFileName] = useState(initialFileName)
  const [artistName, setArtistName] = useState("")
  const [albumName, setAlbumName] = useState("")
  const [coverArt, setCoverArt] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isOpen) return
    setFileName(initialFileName)
    setArtistName("")
    setAlbumName("")
    setCoverArt(null)
    setError("")
  }, [initialFileName, isOpen])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError("")

    const formData = new FormData()
    formData.append("fileName", fileName)
    formData.append("artistName", artistName)
    formData.append("albumName", albumName)
    formData.append("downloadUrl", downloadUrl)
    if (coverArt) formData.append("coverArt", coverArt)

    try {
      const response = await fetch("/api/edit", { method: "POST", body: formData })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to edit MP3")
        return
      }

      onUpdate(data.downloadUrl, data.fileName)
      onClose()
    } catch (submitError) {
      console.error("Failed to update MP3:", submitError)
      setError(submitError instanceof Error ? submitError.message : "Network error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-green-100 bg-white p-5 shadow-xl focus:outline-none sm:p-6">
          <div className="border-b border-green-100 pb-4 pr-8">
            <Dialog.Title className="text-xl font-semibold text-green-800">
              Edit MP3 metadata
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-gray-600">
              Update the song details and optionally add JPEG or PNG cover art.
            </Dialog.Description>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close metadata editor"
              disabled={isLoading}
              className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </Dialog.Close>

          {error ? (
            <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5 pt-5">
            <div className="space-y-2">
              <Label htmlFor="fileName" className="text-sm font-medium text-gray-700">
                Song name <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="fileName"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                required
                maxLength={100}
                disabled={isLoading}
                className="border-green-200 focus-visible:border-green-600 focus-visible:ring-green-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="artistName" className="text-sm font-medium text-gray-700">Artist name</Label>
              <Input
                id="artistName"
                value={artistName}
                onChange={(event) => setArtistName(event.target.value)}
                maxLength={100}
                disabled={isLoading}
                className="border-green-200 focus-visible:border-green-600 focus-visible:ring-green-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="albumName" className="text-sm font-medium text-gray-700">Album name</Label>
              <Input
                id="albumName"
                value={albumName}
                onChange={(event) => setAlbumName(event.target.value)}
                maxLength={100}
                disabled={isLoading}
                className="border-green-200 focus-visible:border-green-600 focus-visible:ring-green-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coverArt" className="text-sm font-medium text-gray-700">Cover art</Label>
              <Input
                id="coverArt"
                type="file"
                accept="image/jpeg,image/png"
                onChange={(event) => setCoverArt(event.target.files?.[0] || null)}
                disabled={isLoading}
                className="h-auto min-h-11 border-green-200 file:mr-3 file:rounded file:bg-green-50 file:px-2 file:py-1 focus-visible:border-green-600 focus-visible:ring-green-600"
              />
              <p className="text-xs text-gray-500">JPEG or PNG, up to 10 MB.</p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-green-100 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
                className="min-h-11 border-green-200 text-green-800 hover:bg-green-50"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="min-h-11 bg-green-700 text-white hover:bg-green-800"
              >
                {isLoading ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
