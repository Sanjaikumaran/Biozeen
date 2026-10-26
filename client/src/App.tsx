import { lazy, Suspense, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FeedbackProvider, Loading } from './components/ui'
import PublicLayout from './layouts/PublicLayout'
import { AuthProvider } from './lib/auth'
import { FeatureUnavailable } from './components/FeatureUnavailable'
import { Feature, FeaturesProvider } from './lib/features'
import { SocketProvider } from './lib/socket'
import { ThemeProvider } from './lib/theme'
import { NotificationsProvider } from './lib/notifications'
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
const developer = () => import('./pages/developer/Developer')
const DeveloperLayout = lazyNamed(developer, 'DeveloperLayout')
const DeveloperOverview = lazyNamed(developer, 'DeveloperOverview')
const FeatureControl = lazyNamed(developer, 'FeatureControl')

/** A route whose screen the developer console can switch off. */
const gate = (feature: string, element: React.ReactNode) => <Feature name={feature} fallback={<FeatureUnavailable />}>{element}</Feature>
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
        <SocketProvider>
        <FeaturesProvider>
        <ThemeProvider>
        <FeedbackProvider>
          <NotificationsProvider>
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="about" element={gate('portfolio', <About />)} />
              <Route path="portfolio" element={gate('portfolio', <Portfolio />)} />
              <Route path="portfolio/:slug" element={gate('portfolio', <ContentPage type="portfolio" back={{ to: '/portfolio', label: 'Company portfolio' }} />)} />
              <Route path="partners" element={gate('partners', <Partners />)} />
              <Route path="partners/:slug" element={gate('partners.profiles', <PartnerDetail />)} />
              <Route path="opportunities" element={gate('opportunities', <Opportunities />)} />
              <Route path="opportunities/:slug" element={gate('opportunities', <ContentPage type="opportunity" back={{ to: '/opportunities', label: 'Opportunities Hub' }} />)} />
              <Route path="knowledge" element={gate('knowledge', <Knowledge />)} />
              <Route path="knowledge/:slug" element={gate('knowledge.resources', <ContentPage type="knowledge" back={{ to: '/knowledge', label: 'Knowledge Hub' }} />)} />
              <Route path="courses/:slug" element={gate('knowledge.courses', <CoursePage />)} />
              <Route path="courses/:slug/lessons/:lessonId" element={gate('knowledge.courses', <LessonPage />)} />
              <Route path="experts" element={gate('experts', <Experts />)} />
              <Route path="experts/:id" element={gate('experts', <ExpertDetail />)} />
              <Route path="events" element={gate('events', <Events />)} />
              <Route path="events/announcements/:slug" element={gate('events.announcements', <ContentPage type="announcement" back={{ to: '/events?tab=announcements', label: 'Announcements' }} />)} />
              <Route path="events/:slug" element={gate('events.calendar', <EventDetail />)} />
              <Route path="contact" element={gate('contact', <Contact />)} />
              <Route path="search" element={gate('search', <Search />)} />
              <Route path="login" element={<Login />} />
              <Route path="register" element={gate('registration', <Register />)} />
              <Route path="verify-email" element={<VerifyEmail />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="reset-password" element={<ResetPassword />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            <Route path="dashboard" element={<MemberLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="profile" element={<Profile />} />
              <Route path="post-opportunity" element={gate('opportunities.post', <PostOpportunity />)} />
              <Route path="opportunities" element={gate('opportunities.post', <MyOpportunities />)} />
              <Route path="learning" element={gate('dashboard.learning', <Learning />)} />
              <Route path="saved" element={gate('saved', <Saved />)} />
              <Route path="events" element={gate('dashboard.events', <MyEvents />)} />
              <Route path="requests" element={gate('dashboard.requests', <Requests />)} />
              <Route path="feedback" element={gate('dashboard.feedback', <MyFeedback />)} />
              <Route path="settings" element={<AccountSettings />} />
              <Route path="appearance" element={<Navigate to="/dashboard/settings" replace />} />
              <Route path="notifications" element={<Navigate to="/dashboard" replace />} />
            </Route>

            <Route path="developer" element={<DeveloperLayout />}>
              <Route index element={<DeveloperOverview />} />
              <Route path="features" element={<FeatureControl />} />
              <Route path="settings" element={<AccountSettings />} />
            </Route>

            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Overview />} />
              <Route path="approvals" element={<Approvals />} />
              <Route path="members" element={<Members />} />
              <Route path="roles" element={<Roles />} />
              <Route path="directory" element={gate('admin.directory', <Directory />)} />
              <Route path="experts" element={gate('admin.experts', <Directory initialTab="experts" />)} />
              <Route path="content" element={<ContentList />} />
              <Route path="content/new" element={<ContentEditor />} />
              <Route path="content/:id" element={<ContentEditor />} />
              <Route path="courses" element={gate('admin.courses', <CourseList />)} />
              <Route path="courses/:id" element={gate('admin.courses', <CourseEditor />)} />
              <Route path="events" element={gate('admin.events', <EventList />)} />
              <Route path="events/:id" element={gate('admin.events', <EventEditor />)} />
              <Route path="feedback" element={gate('admin.feedback', <FeedbackAnalytics />)} />
              <Route path="feedback/forms" element={gate('admin.feedback', <FeedbackForms />)} />
              <Route path="requests" element={gate('admin.requests', <AdminRequests />)} />
              <Route path="taxonomy" element={gate('admin.taxonomy', <Taxonomy />)} />
              <Route path="media" element={gate('admin.media', <MediaLibrary />)} />
              <Route path="audit" element={gate('admin.audit', <AuditLog />)} />
              <Route path="settings" element={<SiteSettingsPage />} />
              <Route path="account" element={<AccountSettings />} />
            </Route>
          </Routes>
          </Suspense>
          </NotificationsProvider>
        </FeedbackProvider>
        </ThemeProvider>
        </FeaturesProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
