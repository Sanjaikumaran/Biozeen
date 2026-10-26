import { api } from './api'

export interface MediaAsset {
  _id: string
  originalName: string
  mimeType: string
  size: number
  kind: 'image' | 'video' | 'document'
  url: string
  inheritAccess: boolean
  access: { visibility: string }
  linked: { kind: string; id: string }[]
  createdAt: string
  uploadedBy?: { name: string }
}

export async function uploadMedia(file: File, visibility = 'public', inheritAccess = true) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('visibility', visibility)
  fd.append('inheritAccess', String(inheritAccess))
  return api.post<MediaAsset>('/admin/media', fd)
}
