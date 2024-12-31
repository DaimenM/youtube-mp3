import { spawn } from 'child_process'
import path from 'path'
import { NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'


export async function POST(request: Request): Promise<Response> {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 })
    }

    // Use absolute path for Python executable
    const pythonScriptPath = path.join(process.cwd(), 'src', 'scripts', 'conversion.py')
    
    // Add error handling for Python process
    const pythonProcess = spawn('python3', [pythonScriptPath, url], {
      env: { ...process.env, PYTHONPATH: process.cwd() }
    })
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
            resolve(NextResponse.json({ 
              downloadUrl: blob.url,
              videoTitle: title  // Add this line
            }))
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

export async function DELETE(request: Request) {
    try {
      const { url } = await request.json();
      
      if (!url) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
      }
  
      // Validate if it's a valid blob URL
      if (!url.includes('blob.vercel-storage.com')) {
        return NextResponse.json({ error: 'Invalid blob URL' }, { status: 400 });
      }
  
      console.log('Attempting to delete blob:', url);
      await del(url);
      console.log('Successfully deleted blob:', url);
  
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Blob deletion error:', error);
      return NextResponse.json({ 
        error: 'Failed to delete blob',
        details: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  }