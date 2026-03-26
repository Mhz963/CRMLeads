import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function getSupabasePublic() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getSupabaseAdmin() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseMaybeJson(input) {
  if (!input) return {}
  if (typeof input === 'string') {
    try { return JSON.parse(input) } catch { return {} }
  }
  return input
}

function maskToken(token) {
  const t = String(token || '')
  if (!t) return ''
  if (t.length <= 8) return '********'
  return `${t.slice(0, 4)}...${t.slice(-4)}`
}

async function sendTestTelegram({ botToken, chatId, fullName }) {
  const text = `Telegram integration is active for ${fullName || 'CRM user'} at ${new Date().toLocaleString()}.`
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const raw = await response.text()
  let payload = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {} }
  if (!response.ok || payload?.ok === false) {
    return { success: false, error: payload?.description || `HTTP ${response.status}` }
  }
  return { success: true, error: null }
}

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return res.status(401).json({ success: false, error: 'Missing authorization token.' })

  try {
    const supabasePublic = getSupabasePublic()
    const { data: userData } = await supabasePublic.auth.getUser(token)
    const userId = userData?.user?.id
    if (!userId) return res.status(401).json({ success: false, error: 'Invalid session token.' })

    const supabaseAdmin = getSupabaseAdmin()

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('user_telegram_integrations')
        .select('is_enabled, telegram_chat_id, telegram_bot_token, updated_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) {
        const msg = String(error.message || '')
        if (msg.toLowerCase().includes('user_telegram_integrations')) {
          return res.status(500).json({
            success: false,
            error: 'Missing table: user_telegram_integrations. Run the SQL migration first.',
          })
        }
        return res.status(500).json({ success: false, error: msg || 'Failed to fetch integration.' })
      }

      return res.status(200).json({
        success: true,
        integration: data
          ? {
              is_enabled: Boolean(data.is_enabled),
              telegram_chat_id: data.telegram_chat_id || '',
              telegram_bot_token_masked: maskToken(data.telegram_bot_token),
              has_token: Boolean(data.telegram_bot_token),
              updated_at: data.updated_at || null,
            }
          : null,
      })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed.' })
    }

    const body = parseMaybeJson(req.body)
    const action = String(body.action || 'save')

    const { data: me } = await supabaseAdmin.from('crm_users').select('full_name, email').eq('id', userId).maybeSingle()
    const fullName = me?.full_name || me?.email || 'CRM user'

    if (action === 'test') {
      const { data: existing, error: getErr } = await supabaseAdmin
        .from('user_telegram_integrations')
        .select('telegram_bot_token, telegram_chat_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (getErr) return res.status(500).json({ success: false, error: getErr.message || 'Failed to load integration.' })
      if (!existing?.telegram_bot_token || !existing?.telegram_chat_id) {
        return res.status(400).json({ success: false, error: 'Please save bot token and chat id first.' })
      }
      const sent = await sendTestTelegram({
        botToken: existing.telegram_bot_token,
        chatId: existing.telegram_chat_id,
        fullName,
      })
      if (!sent.success) return res.status(400).json({ success: false, error: sent.error || 'Test failed.' })
      return res.status(200).json({ success: true, message: 'Test message sent to your Telegram.' })
    }

    const telegramBotTokenInput = String(body.telegram_bot_token || '').trim()
    const telegramChatId = String(body.telegram_chat_id || '').trim()
    const isEnabled = Boolean(body.is_enabled)

    const { data: existing } = await supabaseAdmin
      .from('user_telegram_integrations')
      .select('telegram_bot_token')
      .eq('user_id', userId)
      .maybeSingle()

    const telegramBotToken = telegramBotTokenInput || existing?.telegram_bot_token || ''
    if (!telegramBotToken || !telegramChatId) {
      return res.status(400).json({ success: false, error: 'telegram_bot_token and telegram_chat_id are required.' })
    }

    const { error: upsertError } = await supabaseAdmin
      .from('user_telegram_integrations')
      .upsert(
        {
          user_id: userId,
          telegram_bot_token: telegramBotToken,
          telegram_chat_id: telegramChatId,
          is_enabled: isEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
    if (upsertError) {
      const msg = String(upsertError.message || '')
      if (msg.toLowerCase().includes('user_telegram_integrations')) {
        return res.status(500).json({
          success: false,
          error: 'Missing table: user_telegram_integrations. Run the SQL migration first.',
        })
      }
      return res.status(500).json({ success: false, error: msg || 'Failed to save integration.' })
    }

    return res.status(200).json({
      success: true,
      integration: {
        is_enabled: isEnabled,
        telegram_chat_id: telegramChatId,
        telegram_bot_token_masked: maskToken(telegramBotToken),
        has_token: true,
      },
    })
  } catch (err) {
    console.error('telegram-config error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
