/** Convert a YouTube/Vimeo share URL to an embeddable player URL; null if not a known host. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url, location.origin)
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      const id = u.searchParams.get('v') ?? u.pathname.match(/\/(embed|shorts)\/([\w-]+)/)?.[2]
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (u.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`
    if (/(^|\.)vimeo\.com$/.test(u.hostname)) {
      const id = u.pathname.match(/\/(\d+)/)?.[1]
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch {
    /* fall through */
  }
  return null
}
