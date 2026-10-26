export class ApiError extends Error {
  status: number
  details?: Record<string, unknown>
  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.details = details
  }
  /** Per-field validation messages returned by the API. */
  get fields(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(this.details ?? {})) if (typeof v === 'string') out[k] = v
    return out
  }
}

type Query = Record<string, string | number | boolean | undefined | null>

export function qs(params: Query) {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  const str = s.toString()
  return str ? `?${str}` : ''
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'include', headers: {} }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError(0, 'Unable to reach the server. Check your connection and try again.')
  }
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; details?: Record<string, unknown> }
    throw new ApiError(res.status, d.error ?? `Request failed (${res.status})`, d.details)
  }
  return data as T
}

function safeJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path + (params ? qs(params) : '')),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

/** Trigger a browser download for an authenticated CSV export. */
export function downloadUrl(path: string, params?: Query) {
  const a = document.createElement('a')
  a.href = `/api${path}${params ? qs(params) : ''}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
  pages: number
}
