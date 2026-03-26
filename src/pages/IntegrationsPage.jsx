import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MessageCircle, Send } from 'lucide-react'
import {
  fetchTelegramIntegration,
  saveTelegramIntegration,
  testTelegramIntegration,
} from '../services/integrationsService'
import './IntegrationsPage.css'

const IntegrationsPage = () => {
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [statusMsg, setStatusMsg] = useState('')

  const { data: integration, isLoading, refetch } = useQuery({
    queryKey: ['telegram-integration'],
    queryFn: fetchTelegramIntegration,
  })

  useEffect(() => {
    if (!integration) return
    setChatId(integration.telegram_chat_id || '')
    setEnabled(Boolean(integration.is_enabled))
  }, [integration])

  const saveMutation = useMutation({
    mutationFn: saveTelegramIntegration,
    onSuccess: () => {
      setStatusMsg('Telegram integration saved successfully.')
      setBotToken('')
      refetch()
    },
    onError: (err) => {
      setStatusMsg(err?.message || 'Failed to save integration.')
    },
  })

  const testMutation = useMutation({
    mutationFn: testTelegramIntegration,
    onSuccess: () => {
      setStatusMsg('Test message sent to your Telegram.')
    },
    onError: (err) => {
      setStatusMsg(err?.message || 'Failed to send test message.')
    },
  })

  const handleSave = () => {
    if (!botToken.trim() && !integration?.has_token) {
      setStatusMsg('Please enter Telegram bot token.')
      return
    }
    if (!chatId.trim()) {
      setStatusMsg('Please enter Telegram chat id.')
      return
    }
    saveMutation.mutate({
      telegram_bot_token: botToken.trim() || undefined,
      telegram_chat_id: chatId.trim(),
      is_enabled: enabled,
    })
  }

  return (
    <div className="integrations-page animate-fade-in">
      <div className="integrations-header">
        <h2>Integrations</h2>
        <p>Connect your own Telegram to receive CRM lead alerts.</p>
      </div>

      <div className="integration-card">
        <div className="integration-title">
          <MessageCircle size={18} />
          <h3>Telegram</h3>
        </div>

        {isLoading ? (
          <p className="integration-info">Loading integration settings...</p>
        ) : (
          <>
            <div className="integration-form">
              <label>Bot Token</label>
              <input
                type="password"
                placeholder={integration?.telegram_bot_token_masked || 'Paste your bot token'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />

              <label>Chat ID</label>
              <input
                type="text"
                placeholder="Example: 123456789"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
              />

              <label className="integration-checkbox">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Enable Telegram alerts for my account
              </label>
            </div>

            <div className="integration-actions">
              <button
                className="btn-sm primary"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                Save
              </button>
              <button
                className="btn-sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
              >
                <Send size={14} />
                Send Test
              </button>
            </div>

            <p className="integration-help">
              Tip: create a bot from Telegram @BotFather, then send a message to your bot and get your chat id.
            </p>
            {statusMsg && <p className="integration-status">{statusMsg}</p>}
          </>
        )}
      </div>
    </div>
  )
}

export default IntegrationsPage
