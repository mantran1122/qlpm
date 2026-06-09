// Đọc CSRF token từ cookie (non-HttpOnly) để gửi kèm header X-CSRF
export function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

// Wrapper cho fetch tự động thêm CSRF header vào mutation requests
export function csrfFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  if (!needsCsrf) return fetch(input, init)

  const headers = new Headers(init?.headers)
  const token = getCsrfToken()
  if (token) headers.set('X-CSRF', token)

  return fetch(input, { ...init, headers })
}
