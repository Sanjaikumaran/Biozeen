import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, Lock, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import type { ApiError } from '../lib/api'
import { cx } from '../lib/cx'
import { label } from '../lib/format'


// ---------------------------------------------------------------- buttons

type Variant = 'primary' | 'accent' | 'dark' | 'outline' | 'outlineLight' | 'ghost' | 'danger' | 'soft'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-strong shadow-sm',
  accent: 'bg-lime-500 text-brand-900 hover:bg-lime-400 shadow-sm',
  dark: 'bg-navy text-white hover:bg-navy/90 shadow-sm',
  outline: 'border border-brand-200 bg-card text-brand-700 hover:bg-brand-50',
  outlineLight: 'border border-white/40 bg-transparent text-white hover:bg-white/10',
  ghost: 'text-ink-700 hover:bg-ink-900/5',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
}
const SIZES = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' }

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: keyof typeof SIZES
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function LinkButton({ to, variant = 'primary', size = 'md', className, children }: { to: string; variant?: Variant; size?: keyof typeof SIZES; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors', VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  )
}

// ---------------------------------------------------------------- form fields

const inputBase =
  'w-full rounded-lg border border-ink-300/70 bg-card px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-900/5'

interface FieldProps {
  label?: ReactNode
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
  children: (id: string) => ReactNode
}

export function Field({ label: text, error, hint, required, className, children }: FieldProps) {
  const id = useId()
  return (
    <div className={cx('space-y-1.5', className)}>
      {text && (
        <label htmlFor={id} className="block text-sm font-medium text-ink-900">
          {text}
          {required && <span className="text-red-600"> *</span>}
        </label>
      )}
      {children(id)}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-500">{hint}</p>
      )}
    </div>
  )
}

type WithField = { label?: ReactNode; error?: string; hint?: ReactNode; wrapClass?: string }

export function Input({ label: l, error, hint, wrapClass, required, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & WithField) {
  return (
    <Field label={l} error={error} hint={hint} required={required} className={wrapClass}>
      {(id) => <input id={id} required={required} aria-invalid={!!error} className={cx(inputBase, error && 'border-red-400', className)} {...rest} />}
    </Field>
  )
}

export function Textarea({ label: l, error, hint, wrapClass, required, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & WithField) {
  return (
    <Field label={l} error={error} hint={hint} required={required} className={wrapClass}>
      {(id) => <textarea id={id} required={required} aria-invalid={!!error} className={cx(inputBase, 'min-h-24', error && 'border-red-400', className)} {...rest} />}
    </Field>
  )
}

export function Select({ label: l, error, hint, wrapClass, required, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & WithField) {
  return (
    <Field label={l} error={error} hint={hint} required={required} className={wrapClass}>
      {(id) => (
        <select id={id} required={required} aria-invalid={!!error} className={cx(inputBase, 'pr-8', error && 'border-red-400', className)} {...rest}>
          {children}
        </select>
      )}
    </Field>
  )
}

export function Checkbox({ label: l, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700', className)}>
      <input type="checkbox" className="size-4 rounded border-ink-300 accent-brand-600" {...rest} />
      {l}
    </label>
  )
}

/** Comma/Enter separated list editor for tags, skills and similar lists. */
export function TagInput({ label: l, value, onChange, placeholder, hint }: { label?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; hint?: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length) onChange([...new Set([...value, ...parts])])
    setDraft('')
  }
  return (
    <Field label={l} hint={hint}>
      {(id) => (
        <div className={cx(inputBase, 'flex flex-wrap items-center gap-1.5 py-1.5')}>
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            id={id}
            className="min-w-24 flex-1 border-0 bg-transparent p-1 text-sm outline-none"
            value={draft}
            placeholder={placeholder ?? 'Type and press Enter'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                add()
              } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
            }}
            onBlur={add}
          />
        </div>
      )}
    </Field>
  )
}

// ---------------------------------------------------------------- display

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-xl border border-ink-900/8 bg-card shadow-[0_1px_2px_rgb(15_42_74/0.04)]', className)} {...rest}>
      {children}
    </div>
  )
}

const BADGE_TONES = {
  green: 'bg-brand-50 text-brand-700 ring-brand-200',
  lime: 'bg-lime-500/15 text-lime-600 ring-lime-500/30',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  gray: 'bg-ink-900/5 text-ink-700 ring-ink-900/10',
}
export type Tone = keyof typeof BADGE_TONES

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE_TONES[tone], className)}>{children}</span>
}

const STATUS_TONE: Record<string, Tone> = {
  published: 'green', approved: 'green', active: 'green', responded: 'green', completed: 'green',
  scheduled: 'blue', in_progress: 'blue', new: 'blue',
  draft: 'gray', unpublished: 'gray', archived: 'gray', inactive: 'gray', closed: 'gray', hidden: 'gray',
  pending_review: 'amber', pending: 'amber',
  suspended: 'red', rejected: 'red',
}

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{label(status)}</Badge>
}

export function AccessBadge({ visibility }: { visibility?: string }) {
  if (!visibility || visibility === 'public') return null
  return (
    <Badge tone="purple">
      <Lock className="size-3" aria-hidden />
      {visibility === 'authenticated' ? 'Members' : visibility === 'roles' ? 'Restricted' : label(visibility)}
    </Badge>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-brand-600', className)} aria-label="Loading" />
}

export function Loading({ label: text = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-500" role="status">
      <Spinner /> {text}
    </div>
  )
}

export function SkeletonGrid({ count = 6, className = 'h-40' }: { count?: number; className?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cx('animate-pulse rounded-xl bg-ink-900/5', className)} />
      ))}
    </div>
  )
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-300/60 bg-card/60 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-300">{icon}</div>}
      <p className="font-semibold text-ink-900">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error | null; onRetry?: () => void }) {
  if (!error) return null
  const status = (error as ApiError).status
  if (status === 401 || status === 403) return <RestrictedNotice message={error.message} signedIn={status === 403} />
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="size-6 text-red-600" />
      <p className="text-sm text-red-800">{status === 404 ? 'We could not find what you were looking for.' : error.message}</p>
      {onRetry && status !== 404 && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
      {status === 404 && <LinkButton to="/" variant="outline" size="sm">Back to home</LinkButton>}
    </div>
  )
}

export function RestrictedNotice({ message, signedIn }: { message: string; signedIn: boolean }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-6 py-12 text-center">
      <Lock className="size-7 text-violet-600" />
      <p className="font-semibold text-ink-900">{message}</p>
      {signedIn ? (
        <p className="text-sm text-ink-500">If you believe you should have access, contact the BIAN secretariat.</p>
      ) : (
        <div className="flex gap-2">
          <LinkButton to={`/login?next=${encodeURIComponent(location.pathname)}`} variant="dark" size="sm">Login</LinkButton>
          <LinkButton to="/register" variant="accent" size="sm">Join BIAN</LinkButton>
        </div>
      )}
    </div>
  )
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warning' | 'error'; title?: string; children?: ReactNode }) {
  const tones = {
    info: ['border-sky-200 bg-sky-50 text-sky-900', Info],
    success: ['border-brand-200 bg-brand-50 text-brand-800', CheckCircle2],
    warning: ['border-amber-200 bg-amber-50 text-amber-900', AlertTriangle],
    error: ['border-red-200 bg-red-50 text-red-800', AlertTriangle],
  } as const
  const [cls, Icon] = tones[tone]
  return (
    <div className={cx('flex gap-3 rounded-lg border p-3 text-sm', cls)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
  return (
    <nav className="flex items-center justify-center gap-1 pt-6" aria-label="Pagination">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft className="size-4" />
      </Button>
      {nums.map((n, i) => (
        <span key={n} className="flex items-center">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-ink-300">…</span>}
          <button
            onClick={() => onChange(n)}
            aria-current={n === page ? 'page' : undefined}
            className={cx('size-8 rounded-md text-sm font-medium', n === page ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-ink-900/5')}
          >
            {n}
          </button>
        </span>
      ))}
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto border-b border-ink-900/10', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            t.value === value ? 'border-brand-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-ink-900/5 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  const widths = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-card shadow-xl outline-none sm:rounded-2xl', widths[size])}>
        <div className="flex items-center justify-between border-b border-ink-900/8 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-500 hover:bg-ink-900/5" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-900/8 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- confirm + toast

interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}
interface Toast {
  id: number
  tone: 'success' | 'error' | 'info'
  text: string
}
interface FeedbackApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>
  toast: (text: string, tone?: Toast['tone']) => void
}
const FeedbackContext = createContext<FeedbackApi | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), [])
  const toast = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, tone, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])
  const close = (v: boolean) => {
    pending?.resolve(v)
    setPending(null)
  }
  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{pending?.confirmLabel ?? 'Confirm'}</Button>
          </>
        }
      >
        <div className="text-sm text-ink-700">{pending?.message}</div>
      </Modal>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex max-w-md items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg',
              t.tone === 'error' ? 'bg-red-600' : t.tone === 'info' ? 'bg-navy' : 'bg-brand-strong',
            )}
          >
            {t.tone === 'error' ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
            {t.text}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider')
  return ctx
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatTile({ icon, value, label: text, change, tone = 'green' }: { icon: ReactNode; value: ReactNode; label: string; change?: number | null; tone?: 'green' | 'blue' | 'amber' | 'red' | 'purple' }) {
  const tones = { green: 'bg-brand-50 text-brand-600', blue: 'bg-sky-50 text-sky-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', purple: 'bg-violet-50 text-violet-600' }
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className={cx('grid size-11 shrink-0 place-items-center rounded-xl', tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-tight text-ink-900 tabular-nums">{value}</p>
        <p className="truncate text-xs text-ink-500">{text}</p>
        {change !== undefined && change !== null && (
          <p className={cx('text-xs font-semibold tabular-nums', change > 0 ? 'text-brand-600' : change < 0 ? 'text-red-600' : 'text-ink-500')}>
            {change > 0 ? '▲ +' : change < 0 ? '▼ ' : ''}
            {change}% <span className="font-normal text-ink-500">vs previous period</span>
          </p>
        )}
      </div>
    </Card>
  )
}
