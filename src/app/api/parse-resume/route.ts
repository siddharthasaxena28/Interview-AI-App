import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

function extractGoogleDriveId(url: string): { id: string; type: 'doc' | 'file' } | null {
  // Google Docs: https://docs.google.com/document/d/DOC_ID/...
  const docMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (docMatch) return { id: docMatch[1], type: 'doc' }

  // Google Drive file: https://drive.google.com/file/d/FILE_ID/...
  // or https://drive.google.com/open?id=FILE_ID
  const fileMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/)
  if (fileMatch) return { id: fileMatch[1], type: 'file' }

  return null
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 ESM: the /node export is a named export, not a default.
  type PdfParseFn = (b: Buffer) => Promise<{ text: string }>
  const mod = await import('pdf-parse/node') as unknown as { default?: PdfParseFn } & PdfParseFn
  const pdfParse: PdfParseFn = mod.default ?? (mod as unknown as PdfParseFn)
  const result = await pdfParse(buffer)
  return result.text.trim()
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value.trim()
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const contentType = request.headers.get('content-type') ?? ''

    // --- Google Drive / URL mode ---
    if (contentType.includes('application/json')) {
      const { url } = await request.json() as { url?: string }
      if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

      const parsed = extractGoogleDriveId(url)
      if (!parsed) {
        return NextResponse.json(
          { error: 'Unrecognised Google Drive URL. Share the file as "Anyone with the link" and paste the share URL.' },
          { status: 400 }
        )
      }

      let downloadUrl: string
      if (parsed.type === 'doc') {
        // Export Google Doc as plain text
        downloadUrl = `https://docs.google.com/document/d/${parsed.id}/export?format=txt`
      } else {
        // Download Drive file (PDF, DOCX, etc.)
        downloadUrl = `https://drive.google.com/uc?export=download&id=${parsed.id}`
      }

      const driveRes = await fetch(downloadUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      })
      if (!driveRes.ok) {
        return NextResponse.json(
          { error: 'Could not download file. Make sure the file is shared as "Anyone with the link can view".' },
          { status: 400 }
        )
      }

      // Reject before buffering if Content-Length exceeds the limit
      const contentLength = Number(driveRes.headers.get('content-length') ?? 0)
      if (contentLength > MAX_FILE_BYTES) {
        return NextResponse.json({ error: 'File too large (max 5 MB).' }, { status: 413 })
      }

      const driveContentType = driveRes.headers.get('content-type') ?? ''
      const buffer = Buffer.from(await driveRes.arrayBuffer())

      if (buffer.byteLength > MAX_FILE_BYTES) {
        return NextResponse.json({ error: 'File too large (max 5 MB).' }, { status: 413 })
      }

      let text = ''
      if (parsed.type === 'doc' || driveContentType.includes('text/plain')) {
        text = buffer.toString('utf-8').trim()
      } else if (driveContentType.includes('pdf') || downloadUrl.endsWith('.pdf')) {
        text = await extractTextFromPdf(buffer)
      } else if (driveContentType.includes('wordprocessingml') || driveContentType.includes('msword')) {
        text = await extractTextFromDocx(buffer)
      } else {
        // Attempt PDF parse as a best-effort fallback (Drive often serves unknown content-type)
        try {
          text = await extractTextFromPdf(buffer)
        } catch {
          return NextResponse.json(
            { error: 'Could not parse the file. Try downloading and uploading it directly.' },
            { status: 422 }
          )
        }
      }

      return NextResponse.json({ text: text.slice(0, 8000) })
    }

    // --- File upload mode (multipart/form-data) ---
    const form = await request.formData()
    const file = form.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const fileName = file.name.toLowerCase()
    const isPdf = fileName.endsWith('.pdf')
    const isDocx = fileName.endsWith('.docx')
    const isDoc = fileName.endsWith('.doc')

    if (!isPdf && !isDocx && !isDoc) {
      return NextResponse.json(
        { error: 'Only PDF and Word documents (.pdf, .doc, .docx) are supported.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 5 MB).' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    let text = ''
    if (isPdf) {
      text = await extractTextFromPdf(buffer)
    } else {
      text = await extractTextFromDocx(buffer)
    }

    if (!text) {
      return NextResponse.json(
        { error: 'Could not extract text from file. Try a different format or paste the text manually.' },
        { status: 422 }
      )
    }

    return NextResponse.json({ text: text.slice(0, 8000) })
  } catch (error) {
    console.error('parse-resume error:', error)
    return NextResponse.json({ error: 'Failed to parse resume.' }, { status: 500 })
  }
}
