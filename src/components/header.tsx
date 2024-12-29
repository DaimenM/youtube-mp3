import { Music } from 'lucide-react'

export function Header() {
  return (
    <header className="w-full bg-green-600 py-6 shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center space-x-2">
          <Music className="h-8 w-8 text-white" />
          <h1 className="text-3xl font-bold text-white">YouTube to MP3</h1>
        </div>
      </div>
    </header>
  )
}