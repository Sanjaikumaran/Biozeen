import { PowerOff } from 'lucide-react'
import { LinkButton } from './ui'

/** Shown in place of a screen the developer console has switched off for this viewer. */
export function FeatureUnavailable({ title = 'This section is not available' }: { title?: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-ink-900/10 bg-card px-6 py-12 text-center">
        <PowerOff className="size-7 text-ink-300" />
        <p className="font-semibold text-ink-900">{title}</p>
        <p className="text-sm text-ink-500">It isn't available for your account at the moment. If you think you need it, contact the BIAN secretariat.</p>
        <LinkButton to="/" variant="outline" size="sm">Back to home</LinkButton>
      </div>
    </div>
  )
}
