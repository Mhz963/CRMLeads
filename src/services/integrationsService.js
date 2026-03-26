import { supabase } from './supabaseClient'

async function authedRequest(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const raw = await response.text()
  let payload = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {} }
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Request failed (${response.status})`)
  }
  return payload
}

export async function fetchTelegramIntegration() {
  const payload = await authedRequest('/api/telegram-config', { method: 'GET' })
  return payload.integration || null
}

export async function saveTelegramIntegration({ telegram_bot_token, telegram_chat_id, is_enabled }) {
  const payload = await authedRequest('/api/telegram-config', {
    method: 'POST',
    body: JSON.stringify({
      action: 'save',
      telegram_bot_token,
      telegram_chat_id,
      is_enabled,
    }),
  })
  return payload.integration
}

export async function testTelegramIntegration() {
  const payload = await authedRequest('/api/telegram-config', {
    method: 'POST',
    body: JSON.stringify({ action: 'test' }),
  })
  return payload
}
