const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
const telegramChatId = process.env.TELEGRAM_CHAT_ID

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function parseMaybeJson(input) {
  if (!input) return {}
  if (typeof input === 'string') {
    try {
      return JSON.parse(input)
    } catch {
      return {}
    }
  }
  return input
}

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use GET or POST.' })
  }

  const hasToken = Boolean(telegramBotToken)
  const hasChatId = Boolean(telegramChatId)

  if (!hasToken || !hasChatId) {
    return res.status(200).json({
      success: false,
      env: { hasToken, hasChatId },
      error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in this environment.',
    })
  }

  try {
    const body = parseMaybeJson(req.body)
    const customText = String(body?.text || '').trim()
    const text = customText || 'Telegram test from /api/telegram-test'

    const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
        disable_web_page_preview: true,
      }),
    })

    const raw = await response.text()
    let payload = {}
    try {
      payload = raw ? JSON.parse(raw) : {}
    } catch {
      payload = { raw }
    }

    if (!response.ok || payload?.ok === false) {
      return res.status(200).json({
        success: false,
        env: { hasToken, hasChatId },
        http_status: response.status,
        telegram_ok: payload?.ok ?? null,
        telegram_error: payload?.description || payload?.raw || `HTTP ${response.status}`,
      })
    }

    return res.status(200).json({
      success: true,
      env: { hasToken, hasChatId },
      http_status: response.status,
      telegram_ok: payload?.ok ?? true,
      message_id: payload?.result?.message_id ?? null,
      chat_id: payload?.result?.chat?.id ?? null,
    })
  } catch (err) {
    return res.status(200).json({
      success: false,
      env: { hasToken, hasChatId },
      error: err?.message || 'Unexpected telegram test error',
    })
  }
}
