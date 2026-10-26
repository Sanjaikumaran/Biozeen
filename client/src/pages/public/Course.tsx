import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Clock, GraduationCap, PlayCircle, Target } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BlockRenderer } from '../../components/BlockRenderer'
import { FeedbackWidget } from '../../components/FeedbackWidget'
import { Alert, Badge, Button, Card, ErrorState, LinkButton, Loading, useFeedback } from '../../components/ui'
import { cx } from '../../lib/cx'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { label } from '../../lib/format'
import { useAsync, useDocumentTitle } from '../../lib/hooks'
import type { Block, CourseModule, Enrollment, PublicForm } from '../../lib/types'

interface CourseDetail {
  _id: string
  title: string
  slug: string
  summary: string
  description: string
  thumbnail?: string
  level: string
  objectives: string[]
  modules: CourseModule[]
  lessonCount: number
  enrollment: Enrollment | null
  feedbackForm: PublicForm | null
  trackCompletion: boolean
  preview: boolean
  status: string
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-900/8" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${value}%` }} />
    </div>
  )
}

function Outline({ modules, slug, completed, current }: { modules: CourseModule[]; slug: string; completed: Set<string>; current?: string }) {
  return (
    <ol className="space-y-4">
      {modules.map((m, i) => (
        <li key={m._id}>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Module {i + 1}</p>
          <p className="font-semibold text-ink-900">{m.title}</p>
          <ul className="mt-2 space-y-1">
            {m.lessons.map((l) => (
              <li key={l._id}>
                <Link to={`/courses/${slug}/lessons/${l._id}`} className={cx('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-brand-50', current === l._id && 'bg-brand-50 font-semibold text-brand-700')}>
                  {completed.has(l._id) ? <CheckCircle2 className="size-4 shrink-0 text-brand-600" /> : <Circle className="size-4 shrink-0 text-ink-300" />}
                  <span className="flex-1">{l.title}</span>
                  {l.durationMinutes ? <span className="text-xs text-ink-500">{l.durationMinutes}m</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

export function CoursePage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const { data, error, loading, reload } = useAsync(() => api.get<CourseDetail>(`/courses/${slug}`), [slug, user?.id])
  const [busy, setBusy] = useState(false)
  useDocumentTitle(data?.title)
  if (loading) return <Loading />
  if (error || !data) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState error={error} onRetry={reload} /></div>

  const first = data.modules[0]?.lessons[0]
  const completed = new Set(data.enrollment?.completedLessons ?? [])
  const nextLesson = data.modules.flatMap((m) => m.lessons).find((l) => !completed.has(l._id)) ?? first

  async function enroll() {
    if (!user) return navigate(`/login?next=/courses/${slug}`)
    setBusy(true)
    try {
      await api.post(`/courses/${data!._id}/enroll`)
      toast('You are enrolled')
      if (first) navigate(`/courses/${slug}/lessons/${first._id}`)
      else reload()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="hero-bg text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_320px]">
          <div>
            <Link to="/knowledge?tab=courses" className="mb-4 flex w-fit items-center gap-1 text-sm text-brand-100 hover:text-white"><ArrowLeft className="size-4" />All courses</Link>
            <Badge tone="lime">{label(data.level)} course</Badge>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">{data.title}</h1>
            <p className="mt-3 text-lg text-brand-100">{data.summary}</p>
            <p className="mt-4 text-sm text-brand-100/80">{data.modules.length} modules · {data.lessonCount} lessons</p>
          </div>
          <Card className="h-fit space-y-4 p-5 text-ink-700">
            {data.enrollment ? (
              <>
                <p className="text-sm font-semibold text-ink-900">Your progress · {data.enrollment.progress}%</p>
                <Progress value={data.enrollment.progress} />
                {nextLesson && <LinkButton to={`/courses/${slug}/lessons/${nextLesson._id}`} className="w-full"><PlayCircle className="size-4" />{data.enrollment.progress ? 'Continue learning' : 'Start course'}</LinkButton>}
              </>
            ) : (
              <>
                <p className="text-sm">Enroll to track your progress and share lesson feedback.</p>
                <Button className="w-full" onClick={enroll} loading={busy}><GraduationCap className="size-4" />{user ? 'Enroll for free' : 'Sign in to enroll'}</Button>
              </>
            )}
          </Card>
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          {data.preview && <Alert tone="warning" title={`Preview — ${label(data.status)}`}>This course is not visible to members yet.</Alert>}
          {data.description && <p className="whitespace-pre-line text-ink-700">{data.description}</p>}
          {data.objectives.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Target className="size-5 text-brand-600" />Learning objectives</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.objectives.map((o) => <li key={o} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />{o}</li>)}
              </ul>
            </section>
          )}
          {data.feedbackForm && data.enrollment && <FeedbackWidget form={data.feedbackForm} target={{ kind: 'course', id: data._id, title: data.title }} />}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-4 font-semibold">Course outline</h2>
          <Outline modules={data.modules} slug={slug} completed={completed} />
        </Card>
      </div>
    </>
  )
}

interface LessonData {
  course: { _id: string; title: string; slug: string; trackCompletion: boolean; modules: CourseModule[] }
  module: { _id: string; title: string }
  lesson: { _id: string; title: string; summary?: string; durationMinutes?: number; blocks: Block[]; feedbackForm: PublicForm | null }
  prev: { _id: string; title: string } | null
  next: { _id: string; title: string } | null
  enrollment: Enrollment | null
}

export function LessonPage() {
  const { slug = '', lessonId = '' } = useParams()
  const { user } = useAuth()
  const { toast } = useFeedback()
  const { data, error, loading, reload, setData } = useAsync(() => api.get<LessonData>(`/courses/${slug}/lessons/${lessonId}`), [slug, lessonId, user?.id])
  const [busy, setBusy] = useState(false)
  useDocumentTitle(data?.lesson.title)
  if (loading) return <Loading />
  if (error || !data) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState error={error} onRetry={reload} /></div>

  const completed = new Set(data.enrollment?.completedLessons ?? [])
  const done = completed.has(data.lesson._id)

  async function toggleComplete() {
    setBusy(true)
    try {
      let enrollment = data!.enrollment
      if (!enrollment) enrollment = await api.post<Enrollment>(`/courses/${data!.course._id}/enroll`)
      const updated = await api.post<Enrollment>(`/courses/${data!.course._id}/lessons/${data!.lesson._id}/complete`, { completed: !done })
      setData({ ...data!, enrollment: updated })
      if (!done) toast(updated.progress === 100 ? 'Course complete — well done!' : 'Lesson marked complete')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[280px_1fr]">
      <aside className="order-2 lg:order-1">
        <Card className="p-4 lg:sticky lg:top-20">
          <Link to={`/courses/${slug}`} className="mb-3 block font-semibold text-ink-900 hover:text-brand-700">{data.course.title}</Link>
          {data.enrollment && (
            <div className="mb-4 space-y-1">
              <p className="text-xs text-ink-500">{data.enrollment.progress}% complete</p>
              <Progress value={data.enrollment.progress} />
            </div>
          )}
          <Outline modules={data.course.modules} slug={slug} completed={completed} current={data.lesson._id} />
        </Card>
      </aside>
      <article className="order-1 min-w-0 lg:order-2">
        <p className="text-sm text-ink-500">{data.module.title}</p>
        <h1 className="mt-1 text-3xl font-bold">{data.lesson.title}</h1>
        {data.lesson.durationMinutes ? <p className="mt-2 flex items-center gap-1 text-sm text-ink-500"><Clock className="size-4" />{data.lesson.durationMinutes} minutes</p> : null}
        <div className="mt-6"><BlockRenderer blocks={data.lesson.blocks} target={{ kind: 'lesson', id: data.course._id, lessonId: data.lesson._id, title: `${data.course.title} › ${data.lesson.title}` }} /></div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink-900/8 pt-6">
          {data.prev ? <LinkButton variant="outline" to={`/courses/${slug}/lessons/${data.prev._id}`}><ArrowLeft className="size-4" />Previous</LinkButton> : <span />}
          {user && data.course.trackCompletion && (
            <Button variant={done ? 'soft' : 'primary'} onClick={toggleComplete} loading={busy}>
              <CheckCircle2 className="size-4" />{done ? 'Completed' : 'Mark as complete'}
            </Button>
          )}
          {data.next ? <LinkButton variant="outline" to={`/courses/${slug}/lessons/${data.next._id}`}>Next<ArrowRight className="size-4" /></LinkButton> : <span />}
        </div>

        {data.lesson.feedbackForm && (
          <div className="mt-10">
            <FeedbackWidget form={data.lesson.feedbackForm} target={{ kind: 'lesson', id: data.course._id, lessonId: data.lesson._id, title: `${data.course.title} › ${data.lesson.title}` }} />
          </div>
        )}
      </article>
    </div>
  )
}
