import type { NextApiRequest, NextApiResponse } from 'next'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(req: Request) {
  const { url } = await req.json()

  if (!url) {
    return new Response(JSON.stringify({ error: 'YouTube URL is required' }), {
      status: 400,
    })
  }

  const pythonScriptPath = path.join(process.cwd(),'src', 'scripts', 'conversion.py')
  const pythonProcess = spawn('python', [pythonScriptPath, url])

  return new Promise((resolve) => {
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString()
      if (output.startsWith('Download URL:')) {
        const downloadUrl = output.split(':')[1].trim()
        resolve(new Response(JSON.stringify({ downloadUrl })))
      }
    })

    pythonProcess.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`)
      resolve(new Response(JSON.stringify({ error: 'Conversion failed' }), { status: 500 }))
    })

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        resolve(new Response(JSON.stringify({ error: 'Conversion process exited with error' }), { status: 500 }))
      }
    })
  })
}