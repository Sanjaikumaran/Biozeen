export const LABELS: Record<string, string> = {
  // member categories
  startup: 'Startups & Innovation Ecosystems',
  academia: 'Academia & Research',
  industry: 'Industry',
  sme: 'Individual Experts (SME)',
  alumni: 'Alumni',
  student: 'Student',
  professional: 'Professional',
  other: 'Other',
  // opportunity types
  hiring: 'Hiring',
  internship: 'Internships',
  consultancy: 'Consultancy',
  research_collaboration: 'Research Collaboration',
  technology_transfer: 'Technology Transfer',
  training: 'Training',
  funding: 'Funding Requests',
  // knowledge sections
  industry_insights: 'Industry Insights',
  research_repository: 'Research Repository',
  regulatory_corner: 'Regulatory Corner',
  learning_center: 'Learning Center',
  funding_opportunities: 'Funding Opportunities',
  innovation_center: 'Innovation Center',
  templates_downloads: 'Templates & Downloads',
  success_stories: 'Success Stories',
  // content types
  page: 'Portfolio page',
  project: 'Project',
  case_study: 'Case study',
  service: 'Service',
  opportunity: 'Opportunity',
  article: 'Article',
  blog: 'Blog post',
  tutorial: 'Tutorial',
  announcement: 'Announcement',
  course: 'Course',
  lesson: 'Lesson',
  event: 'Event',
  // event types
  summit: 'Summit',
  webinar: 'Webinar',
  conference: 'Conference',
  workshop: 'Workshop',
  industry_visit: 'Industry Visit',
  meeting: 'Meeting',
  program: 'Programme',
  // expert types
  industry_expert: 'Industry Experts',
  research_expert: 'Research Experts',
  trainer: 'Trainers',
  consultant: 'Consultants',
  mentor: 'Mentors',
  // statuses
  draft: 'Draft',
  pending_review: 'Pending review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published',
  unpublished: 'Unpublished',
  archived: 'Archived',
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
  inactive: 'Inactive',
  rejected: 'Rejected',
  new: 'New',
  in_progress: 'In progress',
  responded: 'Responded',
  closed: 'Closed',
  // visibility
  public: 'Public',
  authenticated: 'All members',
  roles: 'Selected roles',
  organizations: 'Selected organizations',
  private: 'Admins only',
  members: 'Members only',
  hidden: 'Hidden',
  // contact types
  general: 'General enquiry',
  collaboration: 'Collaboration request',
  partnership: 'Partnership enquiry',
  expert_connect: 'Expert connect request',
  requirement: 'Post a requirement',
  support: 'Support',
  // org tiers
  founding: 'Founding Partners',
  knowledge: 'Knowledge Partners',
  innovation: 'Innovation Partners',
  none: 'Member organisation',
  research: 'Research',
  government: 'Government',
  // misc
  onsite: 'On-site',
  remote: 'Remote',
  hybrid: 'Hybrid',
  in_person: 'In person',
  online: 'Online',
}

export const label = (key?: string | null) => (key ? LABELS[key] ?? key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '')

export function formatDate(d?: string | Date | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', opts)
}

export function formatDateTime(d?: string | Date | null) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function timeAgo(d?: string | Date | null) {
  if (!d) return ''
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  const units: [number, string][] = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week'], [2592000, 'month'], [31536000, 'year']]
  let unit = units[0]
  for (const u of units) if (s >= u[0]) unit = u
  const n = Math.floor(s / unit[0])
  return `${n} ${unit[1]}${n === 1 ? '' : 's'} ago`
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`)

export const compact = (n: number) => new Intl.NumberFormat('en-IN', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n)

/** Datetime-local input value from an ISO string. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

/** Public URL for a content item. */
export function contentHref(c: { type: string; slug: string }) {
  if (c.type === 'opportunity') return `/opportunities/${c.slug}`
  if (c.type === 'announcement') return `/events/announcements/${c.slug}`
  if (['article', 'blog', 'tutorial'].includes(c.type)) return `/knowledge/${c.slug}`
  return `/portfolio/${c.slug}`
}
