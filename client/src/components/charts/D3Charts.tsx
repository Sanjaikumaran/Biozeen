/**
 * Admin charts drawn with d3 (scales, shapes, arcs) and rendered as React SVG so they follow the
 * theme, resize with their container and carry hover tooltips. Colours come from the --viz-*
 * palette in index.css, assigned by entity (never by rank) so a category keeps its colour.
 */
import { arc as d3arc, area as d3area, curveMonotoneX, line as d3line, max, mean, pie as d3pie, scaleBand, scaleLinear, type PieArcDatum } from 'd3'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { VIZ } from '../../lib/viz'


const monthShort = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
const monthLong = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Width of an element, kept up to date as it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Path for a bar with rounded top corners, anchored flat on the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // Flip to the left of the pointer near the right edge.
  const left = x > width - 170 ? x - 12 : x + 12
  return (
    <div
      role="status"
      className={cx('pointer-events-none absolute z-10 min-w-36 rounded-lg border border-ink-900/10 bg-card px-3 py-2 text-xs shadow-lg', x > width - 170 && '-translate-x-full')}
      style={{ left, top: Math.max(0, y - 10) }}
    >
      {children}
    </div>
  )
}

function Swatch({ color, line }: { color: string; line?: boolean }) {
  return <span className={cx('inline-block shrink-0', line ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-sm')} style={{ background: color }} aria-hidden />
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-700">
      {items.map((i) => <li key={i.label} className="inline-flex items-center gap-1.5"><Swatch color={i.color} line={i.line} />{i.label}</li>)}
    </ul>
  )
}

const M = { top: 12, right: 16, bottom: 26, left: 34 }

function YGrid({ ticks, y, width }: { ticks: number[]; y: (v: number) => number; width: number }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t} transform={`translate(0,${y(t)})`}>
          <line x1={M.left} x2={width - M.right} className="stroke-ink-900/8" strokeDasharray={t === 0 ? undefined : '3 4'} />
          <text x={M.left - 8} dy="0.32em" textAnchor="end" className="fill-ink-500 text-[10px] tabular-nums">{t}</text>
        </g>
      ))}
    </g>
  )
}

// ---------------------------------------------------------------- membership growth

/** Running total as an area + line, with members joined each month as bars on the same axis. */
export function GrowthChart({ data, height = 260 }: { data: { month: string; total: number; joined: number }[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const geo = useMemo(() => {
    if (!width) return null
    const x = scaleBand(data.map((d) => d.month), [M.left, width - M.right]).padding(0.28)
    const y = scaleLinear([0, Math.max(1, max(data, (d) => d.total) ?? 1)], [height - M.bottom, M.top]).nice(4)
    const cx_ = (m: string) => (x(m) ?? 0) + x.bandwidth() / 2
    const area = d3area<(typeof data)[number]>().x((d) => cx_(d.month)).y0(y(0)).y1((d) => y(d.total)).curve(curveMonotoneX)(data) ?? ''
    const line = d3line<(typeof data)[number]>().x((d) => cx_(d.month)).y((d) => y(d.total)).curve(curveMonotoneX)(data) ?? ''
    return { x, y, cx: cx_, area, line, ticks: y.ticks(4) }
  }, [data, width, height])
  const h = hover !== null ? data[hover] : null
  const last = data[data.length - 1]

  return (
    <div>
      <Legend items={[{ label: 'Total members', color: VIZ[0], line: true }, { label: 'Joined that month', color: VIZ[1] }]} />
      <div ref={ref} className="relative mt-3" style={{ height }} onMouseLeave={() => setHover(null)}>
        {geo && (
          <svg width={width} height={height} role="img" aria-label={`Membership grew to ${last?.total ?? 0} members over 12 months`}>
            <defs>
              <linearGradient id="growth-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={VIZ[0]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={VIZ[0]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <YGrid ticks={geo.ticks} y={geo.y} width={width} />
            {data.map((d, i) => {
              const bw = Math.min(geo.x.bandwidth() * 0.5, 14)
              return <path key={d.month} className="viz-grow" d={barPath(geo.cx(d.month) - bw / 2, geo.y(d.joined), bw, geo.y(0) - geo.y(d.joined))} fill={VIZ[1]} opacity={hover === null || hover === i ? 0.9 : 0.35} />
            })}
            <path d={geo.area} fill="url(#growth-fill)" className="viz-fade" />
            <path d={geo.line} fill="none" stroke={VIZ[0]} strokeWidth={2} strokeLinecap="round" className="viz-fade" />
            {data.map((d, i) => (
              <text key={d.month} x={geo.cx(d.month)} y={height - 8} textAnchor="middle" className={cx('text-[10px]', hover === i ? 'fill-ink-900 font-semibold' : 'fill-ink-500')}>{monthShort(d.month)}</text>
            ))}
            {last && hover === null && (
              <g transform={`translate(${geo.cx(last.month)},${geo.y(last.total)})`}>
                <circle r={4} fill={VIZ[0]} className="stroke-card" strokeWidth={2} />
                <text x={-12} dy="0.32em" textAnchor="end" className="fill-ink-900 text-[11px] font-semibold tabular-nums">{last.total}</text>
              </g>
            )}
            {h && (
              <g pointerEvents="none">
                <line x1={geo.cx(h.month)} x2={geo.cx(h.month)} y1={M.top} y2={height - M.bottom} className="stroke-ink-900/25" strokeDasharray="3 3" />
                <circle cx={geo.cx(h.month)} cy={geo.y(h.total)} r={5} fill={VIZ[0]} className="stroke-card" strokeWidth={2} />
              </g>
            )}
            {data.map((d, i) => (
              <rect key={d.month} x={(geo.x(d.month) ?? 0) - (geo.x.step() - geo.x.bandwidth()) / 2} y={M.top} width={geo.x.step()} height={height - M.top - M.bottom} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
        )}
        {geo && h && (
          <Tooltip x={geo.cx(h.month)} y={geo.y(h.total)} width={width}>
            <p className="mb-1 font-semibold text-ink-900">{monthLong(h.month)}</p>
            <p className="flex items-center gap-2 text-ink-700"><Swatch color={VIZ[0]} line />Total <span className="ml-auto pl-3 font-semibold tabular-nums text-ink-900">{h.total}</span></p>
            <p className="flex items-center gap-2 text-ink-700"><Swatch color={VIZ[1]} />Joined <span className="ml-auto pl-3 font-semibold tabular-nums text-ink-900">+{h.joined}</span></p>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- monthly bars

/** Monthly counts as bars with a dashed average line; the busiest month is labelled. */
export function MonthlyBars({ data, color = VIZ[2], unit, height = 240 }: { data: { month: string; count: number }[]; color?: string; unit: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const geo = useMemo(() => {
    if (!width) return null
    const x = scaleBand(data.map((d) => d.month), [M.left, width - M.right]).padding(0.3)
    const y = scaleLinear([0, Math.max(1, max(data, (d) => d.count) ?? 1)], [height - M.bottom, M.top + 10]).nice(4)
    return { x, y, ticks: y.ticks(4), avg: mean(data, (d) => d.count) ?? 0 }
  }, [data, width, height])
  const peak = data.reduce((best, d, i) => (d.count > (data[best]?.count ?? -1) ? i : best), 0)
  const h = hover !== null ? data[hover] : null

  return (
    <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
      {geo && (
        <svg width={width} height={height} role="img" aria-label={`${unit} per month, average ${geo.avg.toFixed(1)}`}>
          <YGrid ticks={geo.ticks} y={geo.y} width={width} />
          {data.map((d, i) => {
            const x = geo.x(d.month) ?? 0
            return (
              <g key={d.month}>
                <path className="viz-grow" d={barPath(x, geo.y(d.count), geo.x.bandwidth(), geo.y(0) - geo.y(d.count))} fill={color} opacity={hover === null || hover === i ? 1 : 0.4} />
                {i === peak && d.count > 0 && hover === null && <text x={x + geo.x.bandwidth() / 2} y={geo.y(d.count) - 6} textAnchor="middle" className="fill-ink-900 text-[11px] font-semibold tabular-nums">{d.count}</text>}
                <text x={x + geo.x.bandwidth() / 2} y={height - 8} textAnchor="middle" className={cx('text-[10px]', hover === i ? 'fill-ink-900 font-semibold' : 'fill-ink-500')}>{monthShort(d.month)}</text>
                <rect x={x - (geo.x.step() - geo.x.bandwidth()) / 2} y={M.top} width={geo.x.step()} height={height - M.top - M.bottom} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            )
          })}
          {geo.avg > 0 && (
            <g pointerEvents="none">
              <line x1={M.left} x2={width - M.right} y1={geo.y(geo.avg)} y2={geo.y(geo.avg)} className="stroke-ink-700" strokeDasharray="4 4" strokeOpacity={0.6} />
              <text x={M.left + 4} y={geo.y(geo.avg) - 5} className="fill-ink-700 text-[10px]">avg {geo.avg.toFixed(1)}</text>
            </g>
          )}
        </svg>
      )}
      {geo && h && (
        <Tooltip x={(geo.x(h.month) ?? 0) + geo.x.bandwidth() / 2} y={geo.y(h.count)} width={width}>
          <p className="mb-1 font-semibold text-ink-900">{monthLong(h.month)}</p>
          <p className="flex items-center gap-2 text-ink-700"><Swatch color={color} />{unit} <span className="ml-auto pl-3 font-semibold tabular-nums text-ink-900">{h.count}</span></p>
        </Tooltip>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- donut

export interface Slice { key: string; label: string; value: number; color: string }

/** Share of a whole; hovering a slice (or its legend row) shows it in the centre. */
export function Donut({ data, totalLabel, size = 190 }: { data: Slice[]; totalLabel: string; size?: number }) {
  const [hover, setHover] = useState<string | null>(null)
  const total = data.reduce((a, d) => a + d.value, 0)
  const arcs = useMemo(() => d3pie<Slice>().value((d) => d.value).sort(null).padAngle(0.015)(data), [data])
  const r = size / 2
  const arcFor = (d: PieArcDatum<Slice>, grow = 0) => d3arc<PieArcDatum<Slice>>().innerRadius(r * 0.62).outerRadius(r - 6 + grow).cornerRadius(3)(d) ?? ''
  const active = data.find((d) => d.key === hover)
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0)

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`} role="img" aria-label={`${totalLabel}: ${total}`} onMouseLeave={() => setHover(null)} className="shrink-0">
        {arcs.map((a) => (
          <path key={a.data.key} d={arcFor(a, hover === a.data.key ? 5 : 0)} fill={a.data.color} className="stroke-card transition-[d,opacity] duration-200" strokeWidth={1.5} opacity={!hover || hover === a.data.key ? 1 : 0.35} onMouseEnter={() => setHover(a.data.key)} />
        ))}
        <text textAnchor="middle" dy="-0.1em" className="fill-ink-900 text-[26px] font-bold tabular-nums">{active ? active.value : total}</text>
        <text textAnchor="middle" dy="1.5em" className="fill-ink-500 text-[11px]">{active ? `${active.label} · ${pct(active.value)}%` : totalLabel}</text>
      </svg>
      <ul className="min-w-44 flex-1 space-y-1 text-xs">
        {data.map((d) => (
          <li key={d.key} onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)} className={cx('flex items-center gap-2 rounded-md px-1.5 py-1', hover === d.key && 'bg-ink-900/5')}>
            <Swatch color={d.color} />
            <span className="flex-1 truncate text-ink-700">{d.label}</span>
            <span className="font-semibold tabular-nums text-ink-900">{d.value}</span>
            <span className="w-9 text-right tabular-nums text-ink-500">{pct(d.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- sparkline

/** Tiny trend line for KPI tiles. */
export function Sparkline({ values, color, width = 96, height = 32 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const x = scaleLinear([0, values.length - 1], [2, width - 2])
  const y = scaleLinear([0, Math.max(1, max(values) ?? 1)], [height - 3, 3])
  const line = d3line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX)(values) ?? ''
  const area = d3area<number>().x((_, i) => x(i)).y0(height).y1((v) => y(v)).curve(curveMonotoneX)(values) ?? ''
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <path d={area} fill={color} opacity={0.14} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} fill={color} />
    </svg>
  )
}

// ---------------------------------------------------------------- stacked monthly bars

export interface StackSeries { key: string; label: string; color: string }

/** Several monthly counts stacked per month, with a hover breakdown and the month's total. */
export function StackedMonthly({ data, series, height = 260 }: { data: ({ month: string } & Record<string, number | string>)[]; series: StackSeries[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const totals = useMemo(() => data.map((d) => series.reduce((a, s) => a + Number(d[s.key] ?? 0), 0)), [data, series])
  const geo = useMemo(() => {
    if (!width) return null
    const x = scaleBand(data.map((d) => d.month), [M.left, width - M.right]).padding(0.3)
    const y = scaleLinear([0, Math.max(1, max(totals) ?? 1)], [height - M.bottom, M.top + 10]).nice(4)
    return { x, y, ticks: y.ticks(4) }
  }, [data, totals, width, height])
  const h = hover !== null ? data[hover] : null

  return (
    <div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      <div ref={ref} className="relative mt-3" style={{ height }} onMouseLeave={() => setHover(null)}>
        {geo && (
          <svg width={width} height={height} role="img" aria-label={`Monthly ${series.map((s) => s.label.toLowerCase()).join(', ')}`}>
            <YGrid ticks={geo.ticks} y={geo.y} width={width} />
            {data.map((d, i) => {
              const x = geo.x(d.month) ?? 0
              let acc = 0
              const top = series.reduce((last, s, si) => (Number(d[s.key]) > 0 ? si : last), -1)
              return (
                <g key={d.month} opacity={hover === null || hover === i ? 1 : 0.4}>
                  {series.map((s, si) => {
                    const v = Number(d[s.key] ?? 0)
                    if (!v) return null
                    const y0 = geo.y(acc), y1 = geo.y(acc + v)
                    acc += v
                    // A 2px surface gap separates stacked segments; only the top segment is rounded.
                    const hgt = Math.max(0, y0 - y1 - (si === top ? 0 : 2))
                    return <path key={s.key} className="viz-grow" d={si === top ? barPath(x, y1, geo.x.bandwidth(), hgt) : `M${x},${y1 + 2}h${geo.x.bandwidth()}v${hgt}h${-geo.x.bandwidth()}Z`} fill={s.color} />
                  })}
                  <text x={x + geo.x.bandwidth() / 2} y={height - 8} textAnchor="middle" className={cx('text-[10px]', hover === i ? 'fill-ink-900 font-semibold' : 'fill-ink-500')}>{monthShort(d.month)}</text>
                  <rect x={x - (geo.x.step() - geo.x.bandwidth()) / 2} y={M.top} width={geo.x.step()} height={height - M.top - M.bottom} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              )
            })}
            {hover === null && totals.some(Boolean) && (() => {
              const i = totals.length - 1
              const x = (geo.x(data[i].month) ?? 0) + geo.x.bandwidth() / 2
              return totals[i] > 0 ? <text x={x} y={geo.y(totals[i]) - 6} textAnchor="middle" className="fill-ink-900 text-[11px] font-semibold tabular-nums">{totals[i]}</text> : null
            })()}
          </svg>
        )}
        {geo && h && hover !== null && (
          <Tooltip x={(geo.x(h.month) ?? 0) + geo.x.bandwidth() / 2} y={geo.y(totals[hover])} width={width}>
            <p className="mb-1 font-semibold text-ink-900">{monthLong(h.month)}</p>
            {[...series].reverse().map((s) => <p key={s.key} className="flex items-center gap-2 text-ink-700"><Swatch color={s.color} />{s.label}<span className="ml-auto pl-3 font-semibold tabular-nums text-ink-900">{Number(h[s.key] ?? 0)}</span></p>)}
            <p className="mt-1 flex border-t border-ink-900/10 pt-1 font-semibold text-ink-900">Total<span className="ml-auto pl-3 tabular-nums">{totals[hover]}</span></p>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- horizontal stacked bars

/** One horizontal bar per row, split into ordered stages; hover a segment for its count. */
export function StageBars({ rows, stages, rowLabel }: { rows: ({ key: string } & Record<string, number | string>)[]; stages: StackSeries[]; rowLabel: (key: string) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<{ row: string; stage: string; x: number; y: number } | null>(null)
  const LABEL = 132, ROW = 30, BAR = 16
  const totals = rows.map((r) => stages.reduce((a, s) => a + Number(r[s.key] ?? 0), 0))
  const x = scaleLinear([0, Math.max(1, max(totals) ?? 1)], [LABEL, Math.max(LABEL + 10, width - 40)])
  const height = rows.length * ROW + 4
  const hs = hover && stages.find((s) => s.key === hover.stage)
  const hr = hover && rows.find((r) => r.key === hover.row)

  return (
    <div>
      <Legend items={stages.map((s) => ({ label: s.label, color: s.color }))} />
      <div ref={ref} className="relative mt-3" onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Requests by type and stage">
            {rows.map((r, ri) => {
              let acc = 0
              const y = ri * ROW + (ROW - BAR) / 2
              return (
                <g key={r.key}>
                  <text x={0} y={y + BAR / 2} dy="0.32em" className="fill-ink-700 text-[11px]">{rowLabel(r.key)}</text>
                  {stages.map((s) => {
                    const v = Number(r[s.key] ?? 0)
                    if (!v) return null
                    const x0 = x(acc), x1 = x(acc + v)
                    acc += v
                    const w = Math.max(0, x1 - x0 - 2)
                    const active = !hover || (hover.row === r.key && hover.stage === s.key)
                    return (
                      <g key={s.key} onMouseEnter={() => setHover({ row: r.key, stage: s.key, x: x0 + w / 2, y })}>
                        <rect x={x0} y={y} width={w} height={BAR} rx={3} fill={s.color} opacity={active ? 1 : 0.45} />
                        {w > 22 && <text x={x0 + w / 2} y={y + BAR / 2} dy="0.32em" textAnchor="middle" className="pointer-events-none fill-white text-[10px] font-semibold tabular-nums">{v}</text>}
                      </g>
                    )
                  })}
                  <text x={x(totals[ri]) + 6} y={y + BAR / 2} dy="0.32em" className="fill-ink-900 text-[11px] font-semibold tabular-nums">{totals[ri]}</text>
                </g>
              )
            })}
          </svg>
        )}
        {hover && hs && hr && (
          <Tooltip x={hover.x} y={hover.y} width={width}>
            <p className="mb-1 font-semibold text-ink-900">{rowLabel(hr.key)}</p>
            <p className="flex items-center gap-2 text-ink-700"><Swatch color={hs.color} />{hs.label}<span className="ml-auto pl-3 font-semibold tabular-nums text-ink-900">{Number(hr[hs.key])}</span></p>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
