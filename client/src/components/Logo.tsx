import { Link } from 'react-router-dom'
import { cx } from '../lib/cx'

/** Placeholder mark until the approved BIAN logo artwork is supplied (the mock-ups show "LOGO"). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cx('size-10 shrink-0', className)} aria-hidden>
      <circle cx="20" cy="20" r="19" fill="#0b4d3b" />
      <path d="M13 9c8 4 8 18 14 22M27 9c-8 4-8 18-14 22" stroke="#8bd346" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M15 15h10M14 20h12M15 25h10" stroke="#d5ecdc" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ dark = false, to = '/' }: { dark?: boolean; to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label="BIAN home">
      <LogoMark />
      <span className="leading-none">
        <span className={cx('block text-2xl font-extrabold tracking-tight', dark ? 'text-white' : 'text-ink-900')}>BIAN</span>
        <span className={cx('block text-[10px] font-medium', dark ? 'text-brand-100' : 'text-ink-500')}>Biozeen Industry Academy Network</span>
      </span>
    </Link>
  )
}
