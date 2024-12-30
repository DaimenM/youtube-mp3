import { Dialog as DialogPrimitive, DialogContent, DialogTitle } from "@radix-ui/react-dialog"
import { Button } from "./button"

const DialogHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col space-y-1.5 text-center sm:text-left">
    {children}
  </div>
)
import { Input } from "./input"
import { Label } from "@radix-ui/react-label"
import { useState } from "react"

interface EditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialFileName: string;
  downloadUrl: string;
}

export function EditDialog({ isOpen, onClose, initialFileName, downloadUrl, onUpdate }: EditDialogProps & { onUpdate: (newUrl: string) => void }) {
  const [fileName, setFileName] = useState(initialFileName)
  const [artistName, setArtistName] = useState("")
  const [albumName, setAlbumName] = useState("")
  const [coverArt, setCoverArt] = useState<File | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const formData = new FormData()
    formData.append("fileName", fileName)
    formData.append("artistName", artistName)
    formData.append("albumName", albumName)
    formData.append("downloadUrl", downloadUrl)
    if (coverArt) {
      formData.append("coverArt", coverArt)
    }

    try {
      // Update the endpoint to match the route.ts file
      const response = await fetch("/api/edit", {
        method: "POST", 
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        if (data.downloadUrl) {
          onUpdate(data.downloadUrl)
        }
        onClose()
      } else {
        console.error("Failed to edit MP3:", await response.json())
      }
    } catch (error) {
      console.error("Failed to update MP3:", error)
    }
  }

  return (
    <DialogPrimitive open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit MP3 Metadata</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="fileName">File Name (required)</Label>
            <Input
              id="fileName"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="artistName">Artist Name</Label>
            <Input
              id="artistName"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="albumName">Album Name</Label>
            <Input
              id="albumName"
              value={albumName}
              onChange={(e) => setAlbumName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="coverArt">Cover Art</Label>
            <Input
              id="coverArt"
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setCoverArt(e.target.files?.[0] || null)}
            />
          </div>
          <div className="flex justify-end space-x-2 mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Confirm</Button>
          </div>
        </form>
      </DialogContent>
    </DialogPrimitive>
  )
}