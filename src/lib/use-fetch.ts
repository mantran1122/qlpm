'use client'
import { useEffect, useState, useCallback } from 'react'

export function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!url) { setLoading(false); return }
    setLoading(true)
    setError(null)
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d: T) => { setData(d); setLoading(false) })
      .catch((e: unknown) => { setError(String(e)); setLoading(false) })
  }, [url])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refetch: load }
}
