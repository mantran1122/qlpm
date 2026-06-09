const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN ?? 'nctu.edu.vn'

function getEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing env: ${name}`)
  return val
}

export function getGoogleOAuthURL(state: string): string {
  const params = new URLSearchParams({
    client_id: getEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: getEnv('GOOGLE_REDIRECT_URI'),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })
  console.log('[Google OAuth] redirect_uri:', getEnv('GOOGLE_REDIRECT_URI'))
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

interface GoogleTokenResponse {
  access_token: string
  id_token: string
}

interface GoogleUserInfo {
  email: string
  name: string
  picture?: string
}

export async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getEnv('GOOGLE_CLIENT_ID'),
      client_secret: getEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: getEnv('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) throw new Error('Token exchange failed')
  return res.json()
}

export async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error('Failed to fetch user info')
  return res.json()
}

export function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN)
}

export function validateConfig() {
  getEnv('GOOGLE_CLIENT_ID')
  getEnv('GOOGLE_CLIENT_SECRET')
  getEnv('GOOGLE_REDIRECT_URI')
}
