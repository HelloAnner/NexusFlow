export interface ApiErrorBody {
  code?: string
  message?: string
  details?: Record<string, unknown>
}

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || `请求失败 (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code || 'request_failed'
    this.details = body.details
  }
}

const TOKEN_KEY = 'nexusflow.auth.token'
const USER_KEY = 'nexusflow.auth.user'

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getStoredUser<T = unknown>() {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    localStorage.removeItem(USER_KEY)
    return null
  }
}

export function setStoredUser(user: unknown | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

export type QueryValue = string | number | boolean | null | undefined

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const params = new URLSearchParams()
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })
  const suffix = params.toString()
  return `/api${path}${suffix ? `?${suffix}` : ''}`
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { query?: Record<string, QueryValue> } = {}
): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(buildUrl(path, options.query), {
    ...options,
    headers,
  })

  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new ApiError(response.status, body ?? {})
  }
  return body as T
}

export async function apiGet<T>(path: string, query?: Record<string, QueryValue>) {
  return apiFetch<T>(path, { query })
}

export async function apiPost<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function apiPatch<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function apiPut<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function apiDelete<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: 'DELETE',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
