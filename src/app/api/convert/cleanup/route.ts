import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    
    if (!url || !url.includes('blob.vercel-storage.com')) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    await del(url);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ 
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}