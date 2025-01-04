import { NextResponse } from 'next/server'

const ALLOWED_ORIGIN = 'https://youtube-mp3-lilac.vercel.app'

export function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

export function handleOptions() {
  return corsHeaders(
    new NextResponse(null, {
      status: 204,
    })
  )
}