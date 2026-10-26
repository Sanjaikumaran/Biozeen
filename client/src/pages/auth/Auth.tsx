import { ArrowLeft, ArrowRight, Building, CheckCircle2, Factory, GraduationCap, Lock, MailCheck, Rocket, UserRound, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Checkbox, Input, Loading, TagInput, Textarea } from '../../components/ui'
import { cx } from '../../lib/cx'
import { ApiError, api } from '../../lib/api'
import { useAuth, type OtpChallenge } from '../../lib/auth'
import { label } from '../../lib/format'
import { useDocumentTitle } from '../../lib/hooks'
import type { SessionUser } from '../../lib/types'

const ORG_CATEGORIES = [
  { key: 'startup', title: 'Startups & Innovation Ecosystems', icon: Rocket },
  { key: 'academia', title: 'Academia & Research', icon: GraduationCap },
  { key: 'industry', title: 'Industry', icon: Factory },
]
const INDIVIDUAL_CATEGORIES = [
  { key: 'sme', title: 'Individual Experts (SME)', icon: UserRound },
  { key: 'alumni', title: 'Alumni', icon: UsersRound },
  { key: 'student', title: 'Student', icon: GraduationCap },
  { key: 'professional', title: 'Professional', icon: Building },
]

/** Only allow in-app redirects after login. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

function AuthShell({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_380px]">
      <div>{children}</div>
      {aside ?? (
        <div className="hero-bg relative hidden overflow-hidden rounded-2xl p-8 lg:flex lg:flex-col lg:justify-end">
          <p className="text-3xl font-bold leading-tight text-white">Different Perspectives.<br />A Stronger Tomorrow.</p>
        </div>
      )}
    </div>
  )
}

export function Login() {
  useDocumentTitle('Login')
  const { login, verifyOtp } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ email: '', password: '', remember: false })
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [portal, setPortal] = useState('')
  const [resent, setResent] = useState('')
  const [otp, setOtp] = useState<OtpChallenge | null>(null)
  const [code, setCode] = useState('')
  const [otpNotice, setOtpNotice] = useState('')

  const enter = (user: SessionUser | null) => {
    const next = safeNext(params.get('next'))
    navigate(next ?? (user?.isDeveloper ? '/developer' : user?.permissions.includes('admin.access') ? '/admin' : '/dashboard'), { replace: true })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await login(form.email, form.password, form.remember)
      if (r.otp) {
        setOtp(r.otp)
        setCode('')
        setOtpNotice('')
      } else enter(r.user)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    if (!otp) return
    setBusy(true)
    setError(null)
    try {
      enter(await verifyOtp(otp.challenge, code))
    } catch (err) {
      const apiErr = err as ApiError
      // An expired or locked challenge needs a fresh password step.
      if (apiErr.details?.code === 'otp_expired') setOtp(null)
      setError(apiErr)
    } finally {
      setBusy(false)
    }
  }

  async function resendCode() {
    if (!otp) return
    setError(null)
    try {
      const r = await api.post<{ message: string; devCode?: string }>('/auth/login/otp/resend', { challenge: otp.challenge })
      setOtp({ ...otp, devCode: r.devCode })
      setOtpNotice(r.message)
    } catch (err) {
      setError(err as ApiError)
    }
  }

  async function resend() {
    const r = await api.post<{ message: string; devVerificationUrl?: string }>('/auth/resend-verification', { email: form.email })
    setResent(r.devVerificationUrl ?? r.message)
  }

  const panel = (title: React.ReactNode, items: { key: string; title: string; icon: typeof Rocket }[]) => (
    <Card className="p-4">
      <p className="mb-3 font-semibold text-ink-900">{title}</p>
      <div className="space-y-2">
        {items.map((i) => (
          <button key={i.key} type="button" onClick={() => setPortal(i.title)} className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition', portal === i.title ? 'bg-brand-600 text-white' : 'bg-brand-50/70 text-ink-900 hover:bg-brand-50')}>
            <i.icon className={cx('size-5', portal === i.title ? 'text-white' : 'text-brand-600')} />
            {i.title}
          </button>
        ))}
      </div>
    </Card>
  )

  return (
    <AuthShell
      aside={
        <div className="space-y-4">
          {panel(<>Common Login Access <span className="font-normal text-ink-500">(Organization)</span></>, ORG_CATEGORIES)}
          {panel('Individual Login Access', INDIVIDUAL_CATEGORIES.slice(0, 2))}
          {panel(<>Admin Login <span className="text-brand-600">(Biozeen)</span></>, [{ key: 'admin', title: 'Biozeen Administrator', icon: Lock }])}
          <p className="px-1 text-xs text-ink-500">All member types sign in with the same form; your workspace is chosen from your account's role.</p>
        </div>
      }
    >
      <Card className="mx-auto max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Welcome to BIAN</h1>
        <p className="mt-1 text-sm text-ink-500">{portal ? `Signing in to: ${portal}` : 'Sign in to access your dashboard.'}</p>
        {otp ? (
          <form onSubmit={submitCode} className="mt-6 space-y-4">
            {error && <Alert tone="error">{error.message}</Alert>}
            <Alert tone="info" title="Check your email">
              We sent a 6-digit sign-in code to <strong>{otp.email}</strong>. It expires in {otp.expiresInMinutes} minutes.
            </Alert>
            {otp.devCode && <Alert tone="warning" title="Development mode">Email is turned off, so here is the code: <strong className="font-mono tracking-widest">{otp.devCode}</strong></Alert>}
            {otpNotice && <p className="text-sm text-ink-500" role="status">{otpNotice}</p>}
            <Input
              label="Sign-in code"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              className="text-center font-mono text-lg tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>Verify and sign in</Button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => { setOtp(null); setError(null) }} className="font-medium text-ink-500 hover:text-ink-900">← Use a different account</button>
              <button type="button" onClick={resendCode} className="font-medium text-brand-600 hover:underline">Resend code</button>
            </div>
          </form>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {error && (
              <Alert tone="error">
                {error.message}
                {error.details?.code === 'unverified' && (
                  <button type="button" onClick={resend} className="mt-1 block font-semibold underline">Resend verification email</button>
                )}
              </Alert>
            )}
            {resent && <Alert tone="info">{resent.startsWith('http') ? <>Development mode — <a className="font-semibold underline" href={resent}>open verification link</a></> : resent}</Alert>}
            <Input label="Email" type="email" required autoComplete="email" placeholder="Enter your email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Password" type="password" required autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <div className="flex items-center justify-between">
              <Checkbox label="Remember me" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />
              <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">Forgot Password?</Link>
            </div>
            <Button type="submit" size="lg" className="w-full" loading={busy}>Login</Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-ink-500">New to BIAN? <Link to="/register" className="font-semibold text-brand-600 hover:underline">Register here →</Link></p>
      </Card>
    </AuthShell>
  )
}

const STEPS = ['Select Category', 'Organization / Personal Details', 'Review & Submit']

export function Register() {
  useDocumentTitle('Join BIAN')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    category: '',
    name: '',
    email: '',
    password: '',
    confirm: '',
    phone: '',
    designation: '',
    organizationName: '',
    organizationWebsite: '',
    organizationDescription: '',
    location: '',
    institution: '',
    graduationYear: '',
    expertise: '',
    interests: [] as string[],
    acceptTerms: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ message: string; devVerificationUrl?: string } | null>(null)
  const isOrg = ['startup', 'academia', 'industry'].includes(form.category)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })

  function validateDetails() {
    const e: Record<string, string> = {}
    if (form.name.trim().length < 2) e.name = 'Enter your full name'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email'
    if (form.password.length < 10 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'At least 10 characters with letters and numbers'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match'
    if (isOrg && !form.organizationName.trim()) e.organizationName = 'Organization name is required'
    setErrors(e)
    return !Object.keys(e).length
  }

  async function submit() {
    if (!form.acceptTerms) return setErrors({ acceptTerms: 'Please accept the terms to continue' })
    setBusy(true)
    setErrors({})
    try {
      const payload = Object.fromEntries(
        Object.entries({ ...form, graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined }).filter(([k, v]) => k !== 'confirm' && v !== ''),
      )
      setDone(await api.post('/auth/register', payload))
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ ...err.fields, _: err.message })
        if (Object.keys(err.fields).some((k) => ['name', 'email', 'password', 'organizationName'].includes(k))) setStep(1)
      }
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <AuthShell>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <MailCheck className="mx-auto size-12 text-brand-600" />
          <h1 className="mt-4 text-2xl font-bold">Thank you for registering</h1>
          <p className="mt-2 text-ink-700">{done.message}</p>
          {done.devVerificationUrl && (
            <Alert tone="info" title="Development mode">
              Email delivery is not configured. <a href={done.devVerificationUrl} className="font-semibold underline">Open your verification link</a>.
            </Alert>
          )}
          <Link to="/login" className="mt-6 inline-block font-semibold text-brand-600">Go to login →</Link>
        </Card>
      </AuthShell>
    )

  const categoryButton = (c: { key: string; title: string; icon: typeof Rocket }, sub: string) => (
    <button
      key={c.key}
      type="button"
      onClick={() => setForm({ ...form, category: c.key })}
      aria-pressed={form.category === c.key}
      className={cx('flex flex-col items-center gap-2 rounded-xl border bg-card p-5 text-center transition', form.category === c.key ? 'border-brand-500 ring-2 ring-brand-500/25' : 'border-ink-900/10 hover:border-brand-200')}
    >
      <c.icon className="size-9 text-brand-700" />
      <span className="text-sm font-semibold text-ink-900">{c.title}</span>
      <span className="text-xs text-ink-500">({sub})</span>
    </button>
  )

  return (
    <AuthShell>
      <div className="text-center">
        <h1 className="text-3xl font-bold">Join the BIAN Network</h1>
        <p className="mt-1 text-ink-500">Choose your category to get started</p>
      </div>
      <ol className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 text-xs sm:text-sm" aria-label="Registration steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cx('grid size-7 shrink-0 place-items-center rounded-full font-semibold', i <= step ? 'bg-brand-600 text-white' : 'bg-ink-900/8 text-ink-500')} aria-current={i === step ? 'step' : undefined}>{i < step ? <CheckCircle2 className="size-4" /> : i + 1}</span>
            <span className={cx('hidden sm:inline', i === step ? 'font-semibold text-ink-900' : 'text-ink-500')}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-ink-300" />}
          </li>
        ))}
      </ol>

      <div className="mx-auto mt-8 max-w-2xl">
        {step === 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">{ORG_CATEGORIES.map((c) => categoryButton(c, 'Common organizational login'))}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">{INDIVIDUAL_CATEGORIES.map((c) => categoryButton(c, 'Individual login'))}</div>
            <div className="mt-6 flex justify-end"><Button disabled={!form.category} onClick={() => setStep(1)}>Continue <ArrowRight className="size-4" /></Button></div>
          </>
        )}
        {step === 1 && (
          <Card className="space-y-4 p-6">
            <p className="text-sm text-ink-500">Registering as <span className="font-semibold text-ink-900">{label(form.category)}</span></p>
            {isOrg && (
              <fieldset className="space-y-4 rounded-xl bg-brand-50/50 p-4">
                <legend className="px-1 text-sm font-semibold text-ink-900">Organization</legend>
                <Input label="Organization name" required value={form.organizationName} onChange={set('organizationName')} error={errors.organizationName} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Website" value={form.organizationWebsite} onChange={set('organizationWebsite')} placeholder="https://" />
                  <Input label="Location" value={form.location} onChange={set('location')} placeholder="City, Country" />
                </div>
                <Textarea label="About the organization" value={form.organizationDescription} onChange={set('organizationDescription')} rows={3} />
              </fieldset>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={isOrg ? 'Contact person name' : 'Full name'} required value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" />
              <Input label="Email" type="email" required value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" />
              <Input label="Password" type="password" required value={form.password} onChange={set('password')} error={errors.password} hint="10+ characters with letters and numbers" autoComplete="new-password" />
              <Input label="Confirm password" type="password" required value={form.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" />
              <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
              <Input label="Designation / Role" value={form.designation} onChange={set('designation')} />
              {!isOrg && <Input label="Location" value={form.location} onChange={set('location')} placeholder="City, Country" />}
              {['alumni', 'student'].includes(form.category) && <Input label="Institution" value={form.institution} onChange={set('institution')} />}
              {form.category === 'alumni' && <Input label="Graduation year" type="number" value={form.graduationYear} onChange={set('graduationYear')} />}
            </div>
            {['sme', 'professional'].includes(form.category) && <Textarea label="Expertise summary" value={form.expertise} onChange={set('expertise')} rows={3} />}
            <TagInput label="Interests" value={form.interests} onChange={(interests) => setForm({ ...form, interests })} placeholder="e.g. Bioprocessing, GMP" />
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft className="size-4" />Back</Button>
              <Button onClick={() => validateDetails() && setStep(2)}>Review <ArrowRight className="size-4" /></Button>
            </div>
          </Card>
        )}
        {step === 2 && (
          <Card className="space-y-4 p-6">
            {errors._ && <Alert tone="error">{errors._}</Alert>}
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['Category', label(form.category)],
                ['Name', form.name],
                ['Email', form.email],
                ['Phone', form.phone],
                ['Designation', form.designation],
                ...(isOrg ? [['Organization', form.organizationName], ['Website', form.organizationWebsite]] : [['Institution', form.institution]]),
                ['Location', form.location],
                ['Interests', form.interests.join(', ')],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="text-ink-500">{k}</dt><dd className="font-medium text-ink-900">{v}</dd></div>
              ))}
            </dl>
            <Alert tone="info">New registrations are reviewed by the BIAN team. You'll be able to sign in once your email is verified and your membership is approved.</Alert>
            <div>
              <Checkbox label="I agree to the BIAN terms of membership and privacy policy." checked={form.acceptTerms} onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })} />
              {errors.acceptTerms && <p className="mt-1 text-xs text-red-600">{errors.acceptTerms}</p>}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="size-4" />Back</Button>
              <Button onClick={submit} loading={busy}>Submit registration</Button>
            </div>
          </Card>
        )}
        <p className="mt-6 text-center text-sm text-ink-500">Already a member? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Login here →</Link></p>
      </div>
    </AuthShell>
  )
}

export function VerifyEmail() {
  useDocumentTitle('Verify email')
  const [params] = useSearchParams()
  const [state, setState] = useState<{ ok: boolean; message: string; status?: string } | null>(null)
  // Tokens are single-use, so the request must not repeat when effects re-run (e.g. StrictMode).
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    api
      .post<{ message: string; status: string }>('/auth/verify-email', { token: params.get('token'), email: params.get('email') })
      .then((r) => setState({ ok: true, message: r.message, status: r.status }))
      .catch((e: Error) => setState({ ok: false, message: e.message }))
  }, [params])
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-8 text-center">
        {!state ? <Loading label="Verifying…" /> : (
          <>
            {state.ok ? <CheckCircle2 className="mx-auto size-12 text-brand-600" /> : <Lock className="mx-auto size-12 text-red-600" />}
            <h1 className="mt-4 text-xl font-bold">{state.ok ? 'Email verified' : 'Verification failed'}</h1>
            <p className="mt-2 text-sm text-ink-500">{state.message} {state.status === 'pending' && 'Your membership is awaiting approval — we will let you know once it is active.'}</p>
            <Link to="/login" className="mt-6 inline-block font-semibold text-brand-600">Go to login →</Link>
          </>
        )}
      </Card>
    </div>
  )
}

export function ForgotPassword() {
  useDocumentTitle('Reset password')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<{ message: string; devResetUrl?: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-8">
        <h1 className="text-2xl font-bold">Forgot your password?</h1>
        <p className="mt-1 text-sm text-ink-500">Enter your email and we will send a reset link.</p>
        {result ? (
          <div className="mt-6 space-y-3">
            <Alert tone="success">{result.message}</Alert>
            {result.devResetUrl && <Alert tone="info" title="Development mode"><a className="font-semibold underline" href={result.devResetUrl}>Open reset link</a></Alert>}
          </div>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setError('')
              try {
                setResult(await api.post('/auth/forgot-password', { email }))
              } catch (err) {
                setError((err as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            {error && <Alert tone="error">{error}</Alert>}
            <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
          </form>
        )}
        <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-brand-600">← Back to login</Link>
      </Card>
    </div>
  )
}

export function ResetPassword() {
  useDocumentTitle('Choose a new password')
  const [params] = useSearchParams()
  const [pw, setPw] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-8">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        {done ? (
          <div className="mt-6 space-y-4"><Alert tone="success">{done}</Alert><Link to="/login" className="font-semibold text-brand-600">Go to login →</Link></div>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (pw.password !== pw.confirm) return setErrors({ confirm: 'Passwords do not match' })
              setBusy(true)
              setErrors({})
              try {
                const r = await api.post<{ message: string }>('/auth/reset-password', { token: params.get('token'), email: params.get('email'), password: pw.password })
                setDone(r.message)
              } catch (err) {
                if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message })
              } finally {
                setBusy(false)
              }
            }}
          >
            {errors._ && <Alert tone="error">{errors._}</Alert>}
            <Input label="New password" type="password" required value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} error={errors.password} hint="10+ characters with letters and numbers" autoComplete="new-password" />
            <Input label="Confirm password" type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={errors.confirm} autoComplete="new-password" />
            <Button type="submit" className="w-full" loading={busy}>Update password</Button>
          </form>
        )}
      </Card>
    </div>
  )
}
