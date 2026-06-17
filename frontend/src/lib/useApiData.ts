/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'

export interface ApiDataState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  setData: React.Dispatch<React.SetStateAction<T | null>>
}

export function useApiData<T>(load: () => Promise<T>, deps: React.DependencyList = []): ApiDataState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(load)
  const depKey = JSON.stringify(deps)

  useEffect(() => {
    loadRef.current = load
  })

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadRef.current())
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.dispatchEvent(new Event('nexusflow:unauthorized'))
      }
      setError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [depKey, reload])

  return { data, loading, error, reload, setData }
}
