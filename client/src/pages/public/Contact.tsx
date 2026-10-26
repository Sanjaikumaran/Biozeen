import { CheckCircle2, Handshake, HelpCircle, Mail, MapPin, Phone, UserRound, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Input, Select, Textarea } from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { LABELS } from '../../lib/format'
import { useAsync, useDocumentTitle } from '../../lib/hooks'
import type { SiteSettings } from '../../lib/types'

const TYPES = ['general', 'collaboration', 'partnership', 'requirement', 'training', 'support']
const CATEGORIES = ['industry', 'academia', 'startup', 'sme', 'alumni', 'student', 'other']

export default function Contact() {
  useDocumentTitle('Contact & Collaboration')
  const { user } = useAuth()
  const [params] = useSearchParams()
  const { data: settings } = useAsync(() => api.get<SiteSettings>('/settings'), [])
  const startedAt = useRef(0)
  useEffect(() => {
    startedAt.current = Date.now()
  }, [])
  const initialType = TYPES.includes(params.get('type') ?? '') ? params.get('type')! : ''
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: '',
    organization: params.get('org') ?? user?.organization?.name ?? '',
    category: user?.category ?? '',
    type: initialType,
    subject: '',
    message: '',
    website: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })
  const c = settings?.contact

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrors({})
    setError('')
    try {
      await api.post('/contact', { ...form, phone: form.phone || undefined, organization: form.organization || undefined, subject: form.subject || undefined, website: form.website || undefined, startedAt: startedAt.current })
      setStatus('sent')
    } catch (err) {
      setStatus('idle')
      if (err instanceof ApiError) {
        setErrors(err.fields)
        setError(err.message)
      }
    }
  }

  return (
    <section className="hero-bg">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Get in Touch</h1>
          <p className="mt-2 text-brand-100">Have a requirement, collaboration idea or suggestion? We'd love to hear from you.</p>
          <Card className="mt-6 p-6">
            {status === 'sent' ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto size-12 text-brand-600" />
                <p className="mt-3 text-lg font-semibold text-ink-900">Message sent</p>
                <p className="mt-1 text-sm text-ink-500">Thank you for reaching out. The BIAN secretariat will get back to you shortly.</p>
                {user && <Link to="/dashboard/requests" className="mt-4 inline-block text-sm font-semibold text-brand-600">Track it in your dashboard</Link>}
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4" noValidate>
                {error && !Object.keys(errors).length && <Alert tone="error">{error}</Alert>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="Enter your name" autoComplete="name" />
                  <Input label="Email" type="email" required value={form.email} onChange={set('email')} error={errors.email} placeholder="Enter your email" autoComplete="email" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Organization" value={form.organization} onChange={set('organization')} placeholder="Enter your organization name" autoComplete="organization" />
                  <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="Optional" autoComplete="tel" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Category" required value={form.category} onChange={set('category')} error={errors.category}>
                    <option value="">Select category</option>
                    {CATEGORIES.map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}
                  </Select>
                  <Select label="Requirement Type" required value={form.type} onChange={set('type')} error={errors.type}>
                    <option value="">Select requirement type</option>
                    {TYPES.map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}
                  </Select>
                </div>
                <Input label="Subject" value={form.subject} onChange={set('subject')} placeholder="Optional" />
                <Textarea label="Message" required value={form.message} onChange={set('message')} error={errors.message} placeholder="Type your message here…" rows={5} />
                {/* Honeypot field: hidden from people, often filled by bots. */}
                <div className="hidden" aria-hidden>
                  <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
                </div>
                <Button type="submit" className="w-full" size="lg" loading={status === 'sending'}>Send Message</Button>
              </form>
            )}
          </Card>
        </div>
        <Card className="h-fit space-y-5 p-6 lg:mt-24">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-full border border-brand-200 text-brand-600"><UserRound className="size-5" /></span>
            <div>
              <p className="font-semibold text-ink-900">BIAN Secretariat</p>
              <p className="text-sm text-ink-500">{c?.ownerLine ?? 'Powered by Biozeen · Platform Owner & Coordinator'}</p>
            </div>
          </div>
          <ul className="space-y-3 text-sm">
            {c?.email && <li className="flex items-center gap-3"><Mail className="size-4 text-brand-600" /><a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a></li>}
            {c?.phone && <li className="flex items-center gap-3"><Phone className="size-4 text-brand-600" />{c.phone}</li>}
            {c?.address && <li className="flex items-center gap-3"><MapPin className="size-4 text-brand-600" />{c.address}</li>}
          </ul>
          <div>
            <p className="mb-2 font-semibold text-ink-900">Quick Links</p>
            <ul className="space-y-2 text-sm">
              <li><Link to="/contact?type=collaboration" className="flex items-center gap-2 hover:text-brand-700"><UsersRound className="size-4 text-brand-600" />Collaboration Requests</Link></li>
              <li><Link to="/contact?type=partnership" className="flex items-center gap-2 hover:text-brand-700"><Handshake className="size-4 text-brand-600" />Partnership Enquiries</Link></li>
              <li><Link to="/experts" className="flex items-center gap-2 hover:text-brand-700"><UserRound className="size-4 text-brand-600" />Expert Connect Requests</Link></li>
              <li><Link to="/contact?type=general" className="flex items-center gap-2 hover:text-brand-700"><HelpCircle className="size-4 text-brand-600" />General Enquiries</Link></li>
            </ul>
          </div>
          {c?.quote && <blockquote className="border-l-4 border-brand-200 pl-3 text-sm italic text-ink-700">“{c.quote}”<footer className="mt-1 font-semibold not-italic text-ink-900">— Biozeen</footer></blockquote>}
        </Card>
      </div>
    </section>
  )
}
