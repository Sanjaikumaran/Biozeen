import { lazy, Suspense, type ComponentType } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { FeedbackProvider, Loading } from './components/ui'
import PublicLayout from './layouts/PublicLayout'
import { AuthProvider } from './lib/auth'
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/auth/Auth'
import { AccountSettings, Dashboard, Learning, MemberLayout, MyEvents, MyFeedback, MyOpportunities, PostOpportunity, Profile, Requests, Saved } from './pages/member/Member'
import Contact from './pages/public/Contact'
import ContentPage from './pages/public/ContentPage'
import { CoursePage, LessonPage } from './pages/public/Course'
import Events, { EventDetail } from './pages/public/Events'
import Experts, { ExpertDetail } from './pages/public/Experts'
import Home from './pages/public/Home'
import Knowledge from './pages/public/Knowledge'
import Opportunities from './pages/public/Opportunities'
import Partners, { PartnerDetail } from './pages/public/Partners'
import { About, Portfolio } from './pages/public/Portfolio'
import Search, { NotFound } from './pages/public/Search'

/** Load a named export lazily so the admin workspace (and its chart library) is a separate chunk. */
function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType<Record<string, unknown>> }))
}
const overview = () => import('./pages/admin/Overview')
const contentAdmin = () => import('./pages/admin/ContentAdmin')
const courseEvent = () => import('./pages/admin/CourseEventAdmin')
const feedbackAdmin = () => import('./pages/admin/FeedbackAdmin')
const opsAdmin = () => import('./pages/admin/OpsAdmin')
const peopleAdmin = () => import('./pages/admin/PeopleAdmin')
const AdminLayout = lazyNamed(overview, 'AdminLayout')
const Overview = lazyNamed(overview, 'Overview')
const ContentList = lazyNamed(contentAdmin, 'ContentList')
const ContentEditor = lazyNamed(contentAdmin, 'ContentEditor')
const CourseList = lazyNamed(courseEvent, 'CourseList')
const CourseEditor = lazyNamed(courseEvent, 'CourseEditor')
const EventList = lazyNamed(courseEvent, 'EventList')
const EventEditor = lazyNamed(courseEvent, 'EventEditor')
const FeedbackAnalytics = lazyNamed(feedbackAdmin, 'FeedbackAnalytics')
const FeedbackForms = lazyNamed(feedbackAdmin, 'FeedbackForms')
const AuditLog = lazyNamed(opsAdmin, 'AuditLog')
const MediaLibrary = lazyNamed(opsAdmin, 'MediaLibrary')
const AdminRequests = lazyNamed(opsAdmin, 'Requests')
const SiteSettingsPage = lazyNamed(opsAdmin, 'SiteSettingsPage')
const Taxonomy = lazyNamed(opsAdmin, 'Taxonomy')
const Approvals = lazyNamed(peopleAdmin, 'Approvals')
const Directory = lazyNamed(peopleAdmin, 'Directory')
const Members = lazyNamed(peopleAdmin, 'Members')
const Roles = lazyNamed(peopleAdmin, 'Roles')

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FeedbackProvider>
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="about" element={<About />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="portfolio/:slug" element={<ContentPage type="portfolio" back={{ to: '/portfolio', label: 'Company portfolio' }} />} />
              <Route path="partners" element={<Partners />} />
              <Route path="partners/:slug" element={<PartnerDetail />} />
              <Route path="opportunities" element={<Opportunities />} />
              <Route path="opportunities/:slug" element={<ContentPage type="opportunity" back={{ to: '/opportunities', label: 'Opportunities Hub' }} />} />
              <Route path="knowledge" element={<Knowledge />} />
              <Route path="knowledge/:slug" element={<ContentPage type="knowledge" back={{ to: '/knowledge', label: 'Knowledge Hub' }} />} />
              <Route path="courses/:slug" element={<CoursePage />} />
              <Route path="courses/:slug/lessons/:lessonId" element={<LessonPage />} />
              <Route path="experts" element={<Experts />} />
              <Route path="experts/:id" element={<ExpertDetail />} />
              <Route path="events" element={<Events />} />
              <Route path="events/announcements/:slug" element={<ContentPage type="announcement" back={{ to: '/events?tab=announcements', label: 'Announcements' }} />} />
              <Route path="events/:slug" element={<EventDetail />} />
              <Route path="contact" element={<Contact />} />
              <Route path="search" element={<Search />} />
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />
              <Route path="verify-email" element={<VerifyEmail />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="reset-password" element={<ResetPassword />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            <Route path="dashboard" element={<MemberLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="profile" element={<Profile />} />
              <Route path="post-opportunity" element={<PostOpportunity />} />
              <Route path="opportunities" element={<MyOpportunities />} />
              <Route path="learning" element={<Learning />} />
              <Route path="saved" element={<Saved />} />
              <Route path="events" element={<MyEvents />} />
              <Route path="requests" element={<Requests />} />
              <Route path="feedback" element={<MyFeedback />} />
              <Route path="settings" element={<AccountSettings />} />
            </Route>

            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Overview />} />
              <Route path="approvals" element={<Approvals />} />
              <Route path="members" element={<Members />} />
              <Route path="roles" element={<Roles />} />
              <Route path="directory" element={<Directory />} />
              <Route path="experts" element={<Directory initialTab="experts" />} />
              <Route path="content" element={<ContentList />} />
              <Route path="content/new" element={<ContentEditor />} />
              <Route path="content/:id" element={<ContentEditor />} />
              <Route path="courses" element={<CourseList />} />
              <Route path="courses/:id" element={<CourseEditor />} />
              <Route path="events" element={<EventList />} />
              <Route path="events/:id" element={<EventEditor />} />
              <Route path="feedback" element={<FeedbackAnalytics />} />
              <Route path="feedback/forms" element={<FeedbackForms />} />
              <Route path="requests" element={<AdminRequests />} />
              <Route path="taxonomy" element={<Taxonomy />} />
              <Route path="media" element={<MediaLibrary />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="settings" element={<SiteSettingsPage />} />
            </Route>
          </Routes>
          </Suspense>
        </FeedbackProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
