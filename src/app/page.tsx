"use client";
declare global {
  interface Window {
    showSaveFilePicker: (options?: {
      suggestedName?: string;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<FileSystemFileHandle>;
  }
}
import { useState, useRef, useEffect } from 'react'
import { EditDialog } from '@/components/dialog'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/card'
import { Loader2, Music } from 'lucide-react'
import { Header } from '@/components/header'

export default function Home() {
  // Add new state for edited filename
  const [editedFileName, setEditedFileName] = useState<string | null>(null);
  
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string>('')
  const [videoTitle, setVideoTitle] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  async function downloadFile(url: string, filename: string) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
  
      // Get edited filename if available
      const fileNameResponse = await fetch('/api/edit');
      const fileNameData = await fileNameResponse.json();
      const finalFileName = fileNameData.fileName || filename;
  
      // Modern browsers: Use File System Access API
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: `${finalFileName}.mp3`,
            types: [{
              description: 'MP3 Audio File',
              accept: {'audio/mpeg': ['.mp3']},
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (err) {
          // If user cancels, just return - don't fall back to traditional download
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          console.log('Falling back to traditional download');
        }
      }
  
      // ...existing fallback code...
    } catch (error) {
      console.error('Download failed:', error);
    }
  }
  
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsConverting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsConverting(true)
    setDownloadUrl('')

    try {
      abortControllerRef.current = new AbortController()
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
        signal: abortControllerRef.current.signal
      })

      if (response.ok) {
        const data = await response.json()
        setDownloadUrl(data.downloadUrl)
        setVideoTitle(data.videoTitle) // Update this line
      } else {
        console.error('Conversion failed')
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Conversion cancelled')
      } else {
        console.error('Error:', error)
      }
    } finally {
      setIsConverting(false)
      abortControllerRef.current = null
    }
  }

  // Add effect to cleanup on unmount
  useEffect(() => {
    // Cleanup function for page unload
    const handleUnload = async () => {
      if (downloadUrl) {
        // Send sync request on unload
        navigator.sendBeacon('/api/convert/cleanup', JSON.stringify({ url: downloadUrl }));
      }
    };

    // Add unload listener
    window.addEventListener('beforeunload', handleUnload);

    // Cleanup on component unmount
    return () => {
      if (downloadUrl) {
        deleteBlob(downloadUrl);
      }
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [downloadUrl]);

  // Add delete function
  const deleteBlob = async (url: string) => {
    try {
      const response = await fetch('/api/convert', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to delete blob');
      }
      
      console.log('Blob deleted successfully:', url);
    } catch (error) {
      console.error('Failed to delete blob:', error);
    }
  };

  // Modify the Convert Another button click handler
  const handleConvertAnother = async () => {
    if (downloadUrl) {
      await deleteBlob(downloadUrl);
    }
    setYoutubeUrl('');
    setDownloadUrl('');
    setVideoTitle(''); // Add this line
  };

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <Card className="w-full max-w-md mx-auto shadow-xl border-green-100 border">
          <CardHeader className="border-b border-green-100">
            <CardTitle className="text-xl text-green-700">Convert Video</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="text"
                placeholder="Enter YouTube video URL"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                required
                className="border-green-200 focus:ring-green-500 focus:border-green-500"
              />
              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  className="flex-1 bg-green-600 hover:bg-green-700 transition-colors" 
                  disabled={isConverting}
                >
                  {isConverting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Converting...
                    </span>
                  ) : (
                    "Convert to MP3"
                  )}
                </Button>
                {isConverting && (
                  <Button 
                    type="button"
                    onClick={handleCancel}
                    className="bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
            {downloadUrl && (
              <div className="mt-6 space-y-4">
                <p className="text-center text-lg text-gray-800 font-semibold break-words">
                  {videoTitle}
                </p>
                <div className="flex justify-center items-center gap-4">
                  <a 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      const filename = downloadUrl.split('/').pop()?.split('?')[0] || 'audio.mp3';
                      downloadFile(downloadUrl, filename);
                    }}
                    className="inline-flex items-center space-x-2 text-green-600 hover:text-green-700 font-medium"
                  >
                    <Music className="h-4 w-4" />
                    <span>Download MP3</span>
                  </a>
                  <Button
                    type="button"
                    onClick={() => setIsEditDialogOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 transition-colors text-sm"
                  >
                    Edit MP3
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConvertAnother}
                    className="bg-green-600 hover:bg-green-700 transition-colors text-sm"
                  >
                    Convert Another
                  </Button>
                </div>
                <EditDialog
                  isOpen={isEditDialogOpen}
                  onClose={() => setIsEditDialogOpen(false)}
                  initialFileName={videoTitle}
                  downloadUrl={downloadUrl}
                  onUpdate={setDownloadUrl}
                />
              </div>
            )}
          </CardContent>
          
          <CardFooter className="border-t border-green-100 justify-center">
            <p className="text-sm text-gray-600">Enter a valid YouTube link to convert it to MP3</p>
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}