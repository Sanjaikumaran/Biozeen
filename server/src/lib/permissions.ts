/**
 * Permission keys. A role grants a set of these; a user's effective permissions
 * are the union across all assigned roles. Member *category* (startup, academia…)
 * describes the person and never grants permissions on its own.
 */
export const PERMISSIONS = {
  adminAccess: "admin.access",
  contentManage: "content.manage",
  contentPublish: "content.publish",
  membersManage: "members.manage",
  rolesManage: "roles.manage",
  organizationsManage: "organizations.manage",
  expertsManage: "experts.manage",
  feedbackManage: "feedback.manage",
  feedbackView: "feedback.view",
  feedbackViewIdentified: "feedback.viewIdentified",
  contactsManage: "contacts.manage",
  auditView: "audit.view",
  settingsManage: "settings.manage",
  mediaUpload: "media.upload",
  opportunitiesPost: "opportunities.post",
  expertsContact: "experts.contact",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "admin.access": "Access the admin workspace",
  "content.manage": "Create and edit CMS content, courses and events",
  "content.publish": "Publish, schedule, unpublish and archive content",
  "members.manage": "Approve, edit and suspend members",
  "roles.manage": "Create and edit roles and permissions",
  "organizations.manage": "Manage partner organizations",
  "experts.manage": "Manage expert profiles",
  "feedback.manage": "Build and attach feedback forms",
  "feedback.view": "View feedback analytics and anonymised responses",
  "feedback.viewIdentified": "See who submitted identified feedback",
  "contacts.manage": "Manage contact and collaboration requests",
  "audit.view": "View the audit log",
  "settings.manage": "Edit site settings",
  "media.upload": "Upload media files",
  "opportunities.post": "Submit opportunities for review",
  "experts.contact": "Send connect requests to experts",
};

export const MEMBER_CATEGORIES = [
  "startup",
  "academia",
  "industry",
  "sme",
  "alumni",
  "student",
  "professional",
  "other",
] as const;
export type MemberCategory = (typeof MEMBER_CATEGORIES)[number];

export const ORGANIZATION_CATEGORIES: MemberCategory[] = ["startup", "academia", "industry"];
