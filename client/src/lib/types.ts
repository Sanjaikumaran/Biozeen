export type Visibility = 'public' | 'authenticated' | 'roles' | 'organizations' | 'private'
export type PublicationStatus = 'draft' | 'pending_review' | 'approved' | 'scheduled' | 'published' | 'unpublished' | 'archived'

export interface Access {
  visibility: Visibility
  roles?: string[]
  organizations?: string[]
}

export interface Ref {
  _id: string
  name: string
  slug?: string
}

export interface Block {
  id: string
  type: BlockType
  data: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type BlockType =
  | 'heading' | 'richText' | 'image' | 'gallery' | 'video' | 'file' | 'columns' | 'cards'
  | 'list' | 'table' | 'faq' | 'callout' | 'cta' | 'quote' | 'divider' | 'related' | 'feedback'

export interface ContentCard {
  _id: string
  type: string
  title: string
  slug: string
  summary: string
  featuredImage?: string
  categories?: Ref[]
  tags?: Ref[]
  status: PublicationStatus
  publishedAt?: string
  publishAt?: string
  expireAt?: string
  featured?: boolean
  access?: Access
  author?: { _id: string; name: string }
  opportunity?: {
    opportunityType?: string
    organizationName?: string
    organization?: { _id: string; name: string; slug: string; website?: string } | string
    location?: string
    workMode?: string
    employmentType?: string
    deadline?: string
    applyUrl?: string
    applyEmail?: string
    eligibility?: string
  }
  knowledge?: { section?: string; readingMinutes?: number }
  portfolio?: { section?: string; client?: string; year?: number }
  createdAt?: string
  updatedAt?: string
}

export interface Question {
  _id: string
  type: 'rating' | 'nps' | 'single_choice' | 'multiple_choice' | 'yes_no' | 'short_text' | 'long_text'
  label: string
  help?: string
  required: boolean
  options: { _id: string; label: string }[]
  scaleMax?: number
  maxLength?: number
}

export interface PublicForm {
  _id: string
  title: string
  description?: string
  questions: Question[]
  anonymity: 'identified' | 'anonymous' | 'optional'
  submissionPolicy: 'once' | 'multiple'
  version: number
}

export interface ContentDetail extends ContentCard {
  blocks: Block[]
  feedbackForm: PublicForm | null
  preview: boolean
  saved: boolean
  seo?: { title?: string; description?: string; noIndex?: boolean }
}

export interface EventItem {
  _id: string
  title: string
  slug: string
  summary: string
  eventType: string
  startAt: string
  endAt?: string
  location?: { mode: string; venue?: string; city?: string; meetingUrl?: string }
  registration?: { enabled: boolean; capacity?: number; deadline?: string; externalUrl?: string }
  featuredImage?: string
  access?: Access
  status: PublicationStatus
}

export interface Expert {
  _id: string
  name?: string
  email?: string
  headline: string
  bio?: string
  expertType: string
  domain?: string
  skills: string[]
  expertiseAreas: string[]
  yearsExperience?: number
  location?: string
  photoUrl?: string
  visibility: 'public' | 'members' | 'hidden'
  mentoringAvailable?: boolean
  organization?: { name: string; slug: string }
  status?: string
}

export interface Organization {
  _id: string
  name: string
  slug: string
  orgType: string
  partnerTier: string
  description?: string
  logoUrl?: string
  website?: string
  location?: string
  collaborationAreas?: string[]
  initiatives?: { title: string; description?: string; year?: number }[]
  contact?: { name?: string; email?: string; phone?: string }
  visibility?: 'public' | 'internal'
  status?: 'pending' | 'approved' | 'inactive'
  createdAt?: string
}

export interface Lesson {
  _id: string
  title: string
  summary?: string
  durationMinutes?: number
  blocks?: Block[]
  feedbackForm?: string | null
}

export interface CourseModule {
  _id: string
  title: string
  summary?: string
  lessons: Lesson[]
}

export interface Enrollment {
  _id: string
  course: string | { _id: string; title: string; slug: string; thumbnail?: string; summary?: string; modules?: { lessons: unknown[] }[] }
  status: string
  progress: number
  completedLessons: string[]
  enrolledAt: string
  completedAt?: string
}

export interface SessionUser {
  id: string
  email: string
  name: string
  category: string
  accountType: 'organization' | 'individual'
  organization: { _id: string; name: string; slug: string; orgType: string } | null
  roles: string[]
  permissions: string[]
  profile: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  phone?: string
  preferences?: { themeMode: 'light' | 'dark' | 'system' | null; accent: string | null }
}

export interface SiteSettings {
  hero?: { headline?: string[]; highlight?: string; subheading?: string; keywords?: string[]; videoUrl?: string }
  contact?: { email?: string; phone?: string; address?: string; ownerLine?: string; quote?: string }
  social?: { linkedin?: string; twitter?: string; youtube?: string }
}
