/** Client mirror of server/src/lib/features.ts `resolve`, used to preview the effect of a change. */

export interface FeatureDef {
  key: string
  label: string
  description: string
  group: string
  scope: 'public' | 'member' | 'staff'
  parent?: string
  requires?: string[]
}
export interface Setting {
  enabled: boolean
  audience: string[]
}
export interface Resolution {
  on: boolean
  reason?: 'off' | 'audience'
  key?: string
}

export const AUDIENCE_LABELS: Record<string, string> = {
  visitor: 'Visitors',
  startup: 'Startups',
  academia: 'Academia',
  industry: 'Industry',
  sme: 'Experts (SME)',
  alumni: 'Alumni',
  student: 'Students',
  professional: 'Professionals',
  other: 'Other members',
}

export function resolveFeature(features: FeatureDef[], settings: Record<string, Setting>, key: string, audience: string | null, seen = new Set<string>()): Resolution {
  const def = features.find((f) => f.key === key)
  if (!def || seen.has(key)) return { on: true }
  seen.add(key)
  const s = settings[key]
  if (s && !s.enabled) return { on: false, reason: 'off', key }
  const applies = audience !== null && def.scope !== 'staff' && !(def.scope === 'member' && audience === 'visitor')
  if (applies && s?.audience.length && !s.audience.includes(audience)) return { on: false, reason: 'audience', key }
  for (const dep of [def.parent, ...(def.requires ?? [])]) {
    if (!dep) continue
    const r = resolveFeature(features, settings, dep, audience, new Set(seen))
    if (!r.on) return r
  }
  return { on: true }
}

/** Short reason a feature is unavailable, naming the link in the chain responsible. */
export function explain(r: Resolution, key: string, byKey: Map<string, FeatureDef>, audience: string) {
  if (r.on) return 'Available'
  const who = audience === 'staff' ? 'staff' : AUDIENCE_LABELS[audience]?.toLowerCase()
  if (r.key === key) return r.reason === 'audience' ? `Not for ${who}` : 'Switched off'
  const cause = byKey.get(r.key ?? '')?.label ?? r.key
  return r.reason === 'audience' ? `Off: ${cause} not for ${who}` : `Off: needs ${cause}`
}
