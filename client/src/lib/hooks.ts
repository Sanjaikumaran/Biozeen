import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from './api'

/** Load data from an async function, re-running whenever `deps` change. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const run = useCallback(() => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    fn()
      .then((d) => id === seq.current && setData(d))
      .catch((e) => id === seq.current && setError(e instanceof ApiError ? e : new ApiError(0, String(e))))
      .finally(() => id === seq.current && setLoading(false))
    // Callers pass their own dependency list, as with useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, deps)

  useEffect(() => {
    run()
  }, [run])

  return { data, error, loading, reload: run, setData }
}

/** Filter state stored in the URL query string so views are shareable and survive reloads. */
export function useQueryState<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams()
  const values = { ...defaults } as T
  for (const k of Object.keys(defaults)) {
    const v = params.get(k)
    if (v !== null) (values as Record<string, string>)[k] = v
  }
  const set = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '' || v === defaults[k]) next.delete(k)
            else next.set(k, String(v))
          }
          if (!('page' in patch)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  )
  return [values, set] as const
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (title) document.title = `${title} · BIAN`
  }, [title])
}
