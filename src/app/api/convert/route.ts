import { spawn } from 'child_process'
import path from 'path'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export async function POST(request: Request): Promise<Response> {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 })
    }

    const pythonScriptPath = path.join(process.cwd(), 'src', 'scripts', 'conversion.py')
    const pythonProcess = spawn('python', [pythonScriptPath, url])

    return new Promise<Response>((resolve, reject) => {
      let title = ''
      const chunks: Buffer[] = []

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString()
        if (output.startsWith('Title:')) {
          title = output.split(':')[1].trim()
        } else {
          console.error(`stderr: ${data}`)
        }
      })

      pythonProcess.stdout.on('data', (data) => {
        chunks.push(data)
      })

      pythonProcess.on('close', async (code) => {
        if (code === 0 && chunks.length > 0) {
          const audioBuffer = Buffer.concat(chunks)
          console.log(`Received ${audioBuffer.length} bytes of audio data`)

          try {
            const blob = await put(`${title}.mp3`, audioBuffer, {
              access: 'public',
              addRandomSuffix: true,
              contentType: 'audio/mpeg'
            })
            console.log('Uploaded to blob:', blob.url)
            resolve(NextResponse.json({ downloadUrl: blob.url }))
          } catch (error) {
            console.error('Blob upload error:', error)
            resolve(NextResponse.json({ 
              error: 'Failed to upload to blob storage'
            }, { status: 500 }))
          }
        } else {
          resolve(NextResponse.json({ 
            error: 'Conversion process failed'
          }, { status: 500 }))
        }
      })

      pythonProcess.on('error', (error) => {
        console.error('Process error:', error)
        reject(error)
      })
    })
  } catch (error) {
    console.error('Request error:', error)
    return NextResponse.json({ 
      error: 'Error processing request',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}