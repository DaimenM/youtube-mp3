const YOUTUBE_HOSTS = new Set([
  "youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
])

export function isYouTubeUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false

  try {
    const url = new URL(value)
    return url.protocol === "https:" && YOUTUBE_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function isVercelBlobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false

  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com")
  } catch {
    return false
  }
}

export function sanitizeFileName(value: unknown) {
  if (typeof value !== "string") return ""
  return value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
}
