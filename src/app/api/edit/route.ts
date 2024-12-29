import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { put } from '@vercel/blob'

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData()
    const downloadUrl = formData.get('downloadUrl') as string
    const metadata: {
      fileName: FormDataEntryValue | null;
      artistName: FormDataEntryValue | null;
      albumName: FormDataEntryValue | null;
      coverArt?: string;
    } = {
      fileName: formData.get('fileName'),
      artistName: formData.get('artistName'),
      albumName: formData.get('albumName'),
    }

    // Download the MP3 file
    const response = await fetch(downloadUrl)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Create temporary files
    const tempDir = os.tmpdir()
    const tempMp3Path = path.join(tempDir, 'temp.mp3')
    await fs.promises.writeFile(tempMp3Path, buffer)

    // Handle cover art if provided
    const coverArt = formData.get('coverArt') as File
    if (coverArt) {
      const coverArtBuffer = Buffer.from(await coverArt.arrayBuffer())
      const tempCoverPath = path.join(tempDir, 'cover.jpg')
      await fs.promises.writeFile(tempCoverPath, coverArtBuffer)
      metadata.coverArt = tempCoverPath
    }

    // Run Python script
    const pythonScriptPath = path.join(process.cwd(), 'src', 'scripts', 'edit_mp3.py')
    const pythonProcess = spawn('python', [
      pythonScriptPath,
      tempMp3Path,
      JSON.stringify(metadata)
    ])

    return new Promise((resolve) => {
      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            // Upload edited file to blob storage
            const blob = await put(`${metadata.fileName}.mp3`, await fs.promises.readFile(tempMp3Path), {
              access: 'public',
              addRandomSuffix: true,
              contentType: 'audio/mpeg'
            })

            // Cleanup temporary files
            await fs.promises.unlink(tempMp3Path)
            if (metadata.coverArt) {
              await fs.promises.unlink(metadata.coverArt)
            }

            resolve(NextResponse.json({ 
              success: true,
              downloadUrl: blob.url 
            }))
          } catch (error) {
            resolve(NextResponse.json({ error: 'Failed to upload edited MP3' }, { status: 500 }))
          }
        } else {
          resolve(NextResponse.json({ error: 'Failed to edit MP3' }, { status: 500 }))
        }
      })
    })
  } catch (error) {
    return NextResponse.json({ 
      error: 'Error processing request',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}