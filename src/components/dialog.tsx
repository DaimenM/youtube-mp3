import { Dialog as DialogPrimitive, DialogContent, DialogTitle } from "@radix-ui/react-dialog"
import { Button } from "./button"
import { Input } from "./input"
import { Label } from "@radix-ui/react-label"
import { useState } from "react"
import { cn } from "@/lib/utils"

const DialogHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col space-y-1.5 text-center sm:text-left border-b border-green-100 pb-4">
    {children}
  </div>
)

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
      <DialogContent className={cn(
        "bg-white rounded-lg border border-green-100 shadow-xl",
        "p-6 w-full max-w-md mx-auto"
      )}>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-green-700">Edit MP3 Metadata</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
          <div className="space-y-2">
            <Label htmlFor="fileName" className="text-sm font-medium text-gray-700">
              File Name (required)
            </Label>
            <Input
              id="fileName"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              required
              className="border-green-200 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="artistName" className="text-sm font-medium text-gray-700">
              Artist Name
            </Label>
            <Input
              id="artistName"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              className="border-green-200 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="albumName" className="text-sm font-medium text-gray-700">
              Album Name
            </Label>
            <Input
              id="albumName"
              value={albumName}
              onChange={(e) => setAlbumName(e.target.value)}
              className="border-green-200 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coverArt" className="text-sm font-medium text-gray-700">
              Cover Art
            </Label>
            <Input
              id="coverArt"
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setCoverArt(e.target.files?.[0] || null)}
              className="border-green-200 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="flex justify-end space-x-3 pt-4 border-t border-green-100">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              className="bg-green-600 hover:bg-green-700 transition-colors"
            >
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogPrimitive>
  )
}