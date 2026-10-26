import { FileText, Film, ImageIcon, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { api, type Paged } from '../../lib/api'
import { uploadMedia, type MediaAsset } from '../../lib/media'
import { formatBytes } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import { Alert, Button, Empty, Loading, Modal, Pagination, Select } from '../ui'
import { cx } from '../../lib/cx'

export function MediaIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Film : FileText
  return <Icon className={className} />
}

/** Modal to pick or upload a media asset. Uploaded files default to inheriting their item's access. */
export function MediaPicker({ open, onClose, onPick, kind }: { open: boolean; onClose: () => void; onPick: (m: MediaAsset) => void; kind?: 'image' | 'video' | 'document' }) {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<string>(kind ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const { data, loading, reload } = useAsync(() => (open ? api.get<Paged<MediaAsset>>('/admin/media', { kind: filter, page }) : Promise.resolve(null)), [open, filter, page])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const m = await uploadMedia(file)
      onPick(m)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
      reload()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Media library" size="xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => input.current?.click()} loading={uploading}><Upload className="size-4" />Upload file</Button>
        <input ref={input} type="file" className="hidden" onChange={onFile} accept={kind === 'image' ? 'image/*' : kind === 'video' ? 'video/mp4,video/webm' : undefined} />
        {!kind && (
          <Select aria-label="Type" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1) }} className="h-10 w-40">
            <option value="">All files</option><option value="image">Images</option><option value="video">Videos</option><option value="document">Documents</option>
          </Select>
        )}
        <p className="text-xs text-ink-500">Uploaded files follow the access rules of the item they're used in.</p>
      </div>
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {loading ? <Loading /> : !data?.items.length ? <Empty title="No files yet">Upload an image, video or document.</Empty> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.items.map((m) => (
              <button key={m._id} onClick={() => { onPick(m); onClose() }} className="group overflow-hidden rounded-lg border border-ink-900/10 text-left hover:border-brand-500">
                <div className={cx('grid aspect-[4/3] place-items-center bg-ink-900/5')}>
                  {m.kind === 'image' ? <img src={m.url} alt="" className="size-full object-cover" /> : <MediaIcon kind={m.kind} className="size-8 text-ink-500" />}
                </div>
                <p className="truncate px-2 pt-1.5 text-xs font-medium text-ink-900">{m.originalName}</p>
                <p className="px-2 pb-1.5 text-[11px] text-ink-500">{formatBytes(m.size)}</p>
              </button>
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </Modal>
  )
}
