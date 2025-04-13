import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { put } from '@vercel/blob'

let lastEditedFileName: string | null = null;

// Add these fields to the GET response
export async function GET() {
  return NextResponse.json({
      fileName: lastEditedFileName || null,
      success: true
    })
}

export async function POST(request: Request): Promise<Response> {
  let tempMp3Path: string | null = null;
  let tempCoverPath: string | null = null;

  try {
    const formData = await request.formData();
    console.log("Processing request with formData:", 
      Object.fromEntries(formData.entries()));

    const downloadUrl = formData.get('downloadUrl') as string;
    if (!downloadUrl) {
      throw new Error('Download URL is required');
    }

    // Download and validate MP3
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error('Failed to download MP3');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const tempDir = os.tmpdir();
    tempMp3Path = path.join(tempDir, `temp-${Date.now()}.mp3`);
    await fs.promises.writeFile(tempMp3Path, buffer);

    // Process metadata
    const metadata = {
      fileName: formData.get('fileName'),
      artistName: formData.get('artistName'),
      albumName: formData.get('albumName'),
      coverArt: null as string | null,
    };

    // Handle cover art
    const coverArt = formData.get('coverArt') as File;
    if (coverArt) {
      tempCoverPath = path.join(tempDir, `cover-${Date.now()}.jpg`);
      await fs.promises.writeFile(
        tempCoverPath,
        Buffer.from(await coverArt.arrayBuffer())
      );
      metadata.coverArt = tempCoverPath;
    }

    // Store the fileName for GET requests
    lastEditedFileName = metadata.fileName?.toString() || null;

    // Run Python script
    const pythonScriptPath = path.join(process.cwd(),'src', 'scripts', 'edit_mp3.py')
    const pythonProcess = spawn('python', [
      pythonScriptPath,
      tempMp3Path,
      JSON.stringify(metadata)
    ], {
  })

    pythonProcess.stderr?.on('data', (data) => {
      console.error('Python error:', data.toString());
    });

    pythonProcess.stdout?.on('data', (data) => {
      console.log('Python output:', data.toString());
    });

    return new Promise((resolve) => {
      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            if (!tempMp3Path) {
              throw new Error('Temporary MP3 file path is null');
            }
            // Upload edited file to blob storage
            const blob = await put(`${metadata.fileName}.mp3`, await fs.promises.readFile(tempMp3Path), {
              access: 'public',
              addRandomSuffix: true,
              contentType: 'audio/mpeg'
            })

            // Cleanup temporary files
            if (tempMp3Path) {
              await fs.promises.unlink(tempMp3Path)
            }
            if (metadata.coverArt) {
              await fs.promises.unlink(metadata.coverArt)
            }

            resolve(NextResponse.json({ 
              success: true,
              downloadUrl: blob.url 
            }))
          } catch (error) {
            console.error('Blob upload error:', error)
            resolve(NextResponse.json({ error: 'Failed to upload edited MP3' }, { status: 500 }))
          }
        } else {
          resolve(NextResponse.json({ error: 'Failed to edit MP3' }, { status: 500 }))
        }
      })
    })
  } catch (error) {
    // Cleanup temp files
    if (tempMp3Path) {
      try { await fs.promises.unlink(tempMp3Path); } catch {}
    }
    if (tempCoverPath) {
      try { await fs.promises.unlink(tempCoverPath); } catch {}
    }

    console.error('Error:', error);
    return NextResponse.json({
      error: 'Error processing request',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}