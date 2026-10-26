import { CheckCircle2, MessageSquareHeart, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { PublicForm, Question } from '../lib/types'
import { Alert, Button, Card, Checkbox } from './ui'
import { cx } from '../lib/cx'

export interface FeedbackTarget {
  kind: 'content' | 'course' | 'lesson' | 'event'
  id: string
  lessonId?: string
  /** What is being evaluated, shown to the respondent. */
  title: string
}

type Answers = Record<string, unknown>

function RatingInput({ q, value, onChange }: { q: Question; value?: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  const max = q.scaleMax ?? 5
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={q.label} onMouseLeave={() => setHover(0)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of ${max}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className="rounded p-1"
        >
          <Star className={cx('size-7 transition', (hover || value || 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-ink-300')} />
        </button>
      ))}
    </div>
  )
}

function QuestionInput({ q, value, onChange }: { q: Question; value: unknown; onChange: (v: unknown) => void }) {
  const name = `q-${q._id}`
  switch (q.type) {
    case 'rating':
      return <RatingInput q={q} value={value as number} onChange={onChange} />
    case 'nps':
      return (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={q.label}>
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)} className={cx('size-9 rounded-lg border text-sm font-semibold', value === n ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300/70 bg-card hover:border-brand-300')}>
              {n}
            </button>
          ))}
        </div>
      )
    case 'yes_no':
      return (
        <div className="flex gap-2" role="radiogroup" aria-label={q.label}>
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cx('rounded-lg border px-5 py-2 text-sm font-semibold', value === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300/70 bg-card hover:border-brand-300')}>
              {v ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      )
    case 'single_choice':
      return (
        <div className="grid gap-2">
          {q.options.map((o) => (
            <label key={o._id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={name} className="accent-brand-600" checked={value === o._id} onChange={() => onChange(o._id)} />
              {o.label}
            </label>
          ))}
        </div>
      )
    case 'multiple_choice': {
      const arr = (value as string[]) ?? []
      return (
        <div className="grid gap-2">
          {q.options.map((o) => (
            <Checkbox key={o._id} label={o.label} checked={arr.includes(o._id)} onChange={(e) => onChange(e.target.checked ? [...arr, o._id] : arr.filter((x) => x !== o._id))} />
          ))}
        </div>
      )
    }
    case 'short_text':
      return <input id={name} className="w-full rounded-lg border border-ink-300/70 px-3 py-2 text-sm" maxLength={q.maxLength ?? 300} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
    case 'long_text':
      return <textarea id={name} className="min-h-24 w-full rounded-lg border border-ink-300/70 px-3 py-2 text-sm" maxLength={q.maxLength ?? 2000} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
  }
}

export function FeedbackWidget({ form, target, heading }: { form: PublicForm; target: FeedbackTarget; heading?: string }) {
  const { user } = useAuth()
  const [answers, setAnswers] = useState<Answers>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [anonymous, setAnonymous] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'already'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || form.submissionPolicy !== 'once') return
    api
      .get<{ submitted: boolean }>('/feedback/status', { formId: form._id, targetKind: target.kind, targetId: target.id, lessonId: target.lessonId })
      .then((r) => r.submitted && setState('already'))
      .catch(() => undefined)
  }, [user, form._id, form.submissionPolicy, target.kind, target.id, target.lessonId])

  const needsLogin = form.anonymity === 'identified' && !user

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const missing: Record<string, string> = {}
    for (const q of form.questions) {
      const v = answers[q._id]
      if (q.required && (v === undefined || v === '' || (Array.isArray(v) && !v.length))) missing[q._id] = 'This question is required'
    }
    setErrors(missing)
    if (Object.keys(missing).length) return
    setState('sending')
    setError('')
    try {
      await api.post('/feedback/submit', { formId: form._id, targetKind: target.kind, targetId: target.id, lessonId: target.lessonId, anonymous, answers })
      setState('done')
    } catch (err) {
      setState(err instanceof ApiError && err.status === 409 ? 'already' : 'idle')
      if (err instanceof ApiError) {
        setErrors(err.fields)
        if (err.status !== 409) setError(err.message)
      }
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><MessageSquareHeart className="size-5" /></div>
        <div>
          <h3 className="text-lg font-semibold">{heading || form.title}</h3>
          <p className="text-sm text-ink-500">
            Feedback on <span className="font-medium text-ink-700">{target.title}</span>
            {form.anonymity === 'anonymous' && ' · Responses are anonymous'}
          </p>
          {form.description && <p className="mt-1 text-sm text-ink-500">{form.description}</p>}
        </div>
      </div>

      {state === 'done' ? (
        <Alert tone="success" title="Thank you!">Your feedback has been recorded.</Alert>
      ) : state === 'already' ? (
        <div className="flex items-center gap-2 text-sm text-brand-700"><CheckCircle2 className="size-4" /> You have already shared feedback on this item.</div>
      ) : needsLogin ? (
        <p className="text-sm text-ink-500">
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="font-semibold text-brand-600 underline">Sign in</Link> to share your feedback.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {form.questions.map((q) => (
            <fieldset key={q._id}>
              <legend className="mb-2 text-sm font-medium text-ink-900">
                {q.label}
                {q.required && <span className="text-red-600"> *</span>}
              </legend>
              {q.help && <p className="-mt-1 mb-2 text-xs text-ink-500">{q.help}</p>}
              <QuestionInput q={q} value={answers[q._id]} onChange={(v) => setAnswers((a) => ({ ...a, [q._id]: v }))} />
              {errors[q._id] && <p className="mt-1 text-xs text-red-600" role="alert">{errors[q._id]}</p>}
            </fieldset>
          ))}
          {form.anonymity === 'optional' && user && <Checkbox label="Submit anonymously" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />}
          {form.anonymity === 'optional' && !user && <p className="text-xs text-ink-500">You are not signed in, so this response will be anonymous.</p>}
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={state === 'sending'}>Submit feedback</Button>
        </form>
      )}
    </Card>
  )
}
