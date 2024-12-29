//import type { NextApiRequest, NextApiResponse } from 'next'
import { spawn } from 'child_process'
import path from 'path'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 })
    }

    const pythonScriptPath = path.join(process.cwd(), 'src', 'scripts', 'conversion.py')
    const pythonProcess = spawn('python', [pythonScriptPath, url])

    return new Promise((resolve) => {
      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString()
        if (output.startsWith('Download URL:')) {
          const downloadUrl = output.split(':')[1].trim()
          resolve(NextResponse.json({ downloadUrl }))
        }
      })

      pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`)
        resolve(NextResponse.json({ error: 'Conversion failed' }, { status: 500 }))
      })

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          resolve(NextResponse.json({ error: 'Conversion process exited with error' }, { status: 500 }))
        }
      })
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}