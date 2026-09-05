import { Music } from 'lucide-react'

export function Header() {
  return (
    <header className="w-full bg-green-700 py-5 shadow-md sm:py-6">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="flex items-center justify-center space-x-2">
          <Music className="h-7 w-7 shrink-0 text-white sm:h-8 sm:w-8" aria-hidden="true" />
          <h1 className="text-center text-2xl font-bold text-white sm:text-3xl">YouTube to MP3</h1>
        </div>
      </div>
    </header>
  )
}
