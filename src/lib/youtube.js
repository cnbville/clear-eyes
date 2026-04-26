function parseTimeToSeconds(value) {
  if (!value) {
    return 0
  }

  if (/^\d+$/.test(value)) {
    return Number(value)
  }

  const hoursMatch = value.match(/(\d+)h/i)
  const minutesMatch = value.match(/(\d+)m/i)
  const secondsMatch = value.match(/(\d+)s/i)

  if (hoursMatch || minutesMatch || secondsMatch) {
    return (
      Number(hoursMatch?.[1] ?? 0) * 3600 +
      Number(minutesMatch?.[1] ?? 0) * 60 +
      Number(secondsMatch?.[1] ?? 0)
    )
  }

  if (/^\d+:\d+(?::\d+)?$/.test(value)) {
    const parts = value.split(':').map((part) => Number(part))

    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    }

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
  }

  return 0
}

function normalizeHostname(hostname = '') {
  return hostname.replace(/^www\./i, '').toLowerCase()
}

export function isYouTubeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false
  }

  try {
    const url = new URL(value)
    const hostname = normalizeHostname(url.hostname)

    return (
      hostname === 'youtu.be' ||
      hostname === 'youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'youtube-nocookie.com'
    )
  } catch {
    return false
  }
}

export function getYouTubeVideoId(value) {
  if (!isYouTubeUrl(value)) {
    return null
  }

  const url = new URL(value)
  const hostname = normalizeHostname(url.hostname)

  if (hostname === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] ?? null
  }

  if (url.pathname.startsWith('/watch')) {
    return url.searchParams.get('v')
  }

  const segments = url.pathname.split('/').filter(Boolean)

  if (!segments.length) {
    return null
  }

  if (segments[0] === 'embed' || segments[0] === 'shorts') {
    return segments[1] ?? null
  }

  return null
}

export function getYouTubeStartSeconds(value) {
  if (!isYouTubeUrl(value)) {
    return 0
  }

  const url = new URL(value)
  const explicitStart = url.searchParams.get('start') || url.searchParams.get('t')

  return parseTimeToSeconds(explicitStart)
}

export function getYouTubeEmbedUrl(value) {
  const videoId = getYouTubeVideoId(value)

  if (!videoId) {
    return null
  }

  const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`)
  const startSeconds = getYouTubeStartSeconds(value)

  embedUrl.searchParams.set('rel', '0')
  embedUrl.searchParams.set('modestbranding', '1')
  embedUrl.searchParams.set('playsinline', '1')

  if (startSeconds > 0) {
    embedUrl.searchParams.set('start', `${startSeconds}`)
  }

  return embedUrl.toString()
}
