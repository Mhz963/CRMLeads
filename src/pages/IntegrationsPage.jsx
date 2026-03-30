import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MessageCircle, Send, BarChart3, Building2, ExternalLink } from 'lucide-react'
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
  const [powerBiWorkspace, setPowerBiWorkspace] = useState('')
  const [powerBiReport, setPowerBiReport] = useState('')
  const [powerBiEnabled, setPowerBiEnabled] = useState(false)
  const [dynamicsOrgUrl, setDynamicsOrgUrl] = useState('')
  const [dynamicsEnv, setDynamicsEnv] = useState('')
  const [dynamicsEnabled, setDynamicsEnabled] = useState(false)

  const { data: integration, isLoading, refetch } = useQuery({
    queryKey: ['telegram-integration'],
    queryFn: fetchTelegramIntegration,
  })

  useEffect(() => {
    if (!integration) return
    setChatId(integration.telegram_chat_id || '')
    setEnabled(Boolean(integration.is_enabled))
  }, [integration])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('crm-custom-integrations')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.powerBi) {
        setPowerBiWorkspace(parsed.powerBi.workspace || '')
        setPowerBiReport(parsed.powerBi.report || '')
        setPowerBiEnabled(Boolean(parsed.powerBi.enabled))
      }
      if (parsed?.dynamics365) {
        setDynamicsOrgUrl(parsed.dynamics365.orgUrl || '')
        setDynamicsEnv(parsed.dynamics365.environment || '')
        setDynamicsEnabled(Boolean(parsed.dynamics365.enabled))
      }
    } catch {
      // Ignore malformed localStorage data.
    }
  }, [])

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

  const saveCustomIntegrations = () => {
    const payload = {
      powerBi: {
        workspace: powerBiWorkspace.trim(),
        report: powerBiReport.trim(),
        enabled: powerBiEnabled,
      },
      dynamics365: {
        orgUrl: dynamicsOrgUrl.trim(),
        environment: dynamicsEnv.trim(),
        enabled: dynamicsEnabled,
      },
    }
    window.localStorage.setItem('crm-custom-integrations', JSON.stringify(payload))
    setStatusMsg('Power BI and Dynamics 365 settings saved locally for this browser.')
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

      <div className="integration-card">
        <div className="integration-title">
          <BarChart3 size={18} />
          <h3>Power BI</h3>
        </div>
        <p className="integration-info">
          Connect reporting links so your team can jump from CRM to live dashboards.
        </p>
        <div className="integration-form">
          <label>Workspace Name</label>
          <input
            type="text"
            placeholder="Example: Sales Performance Workspace"
            value={powerBiWorkspace}
            onChange={(e) => setPowerBiWorkspace(e.target.value)}
          />
          <label>Report URL</label>
          <input
            type="text"
            placeholder="https://app.powerbi.com/..."
            value={powerBiReport}
            onChange={(e) => setPowerBiReport(e.target.value)}
          />
          <label className="integration-checkbox">
            <input
              type="checkbox"
              checked={powerBiEnabled}
              onChange={(e) => setPowerBiEnabled(e.target.checked)}
            />
            Enable Power BI quick access in CRM
          </label>
        </div>
        <p className="integration-help">
          Setup flow: create a Power BI dashboard -&gt; publish it -&gt; paste report URL here.
        </p>
        {powerBiEnabled && powerBiReport && (
          <a className="integration-link" href={powerBiReport} target="_blank" rel="noreferrer">
            Open Power BI Report <ExternalLink size={14} />
          </a>
        )}
      </div>

      <div className="integration-card">
        <div className="integration-title">
          <Building2 size={18} />
          <h3>Microsoft Dynamics 365</h3>
        </div>
        <p className="integration-info">
          Connect your Dynamics org reference details for enterprise CRM sync setup.
        </p>
        <div className="integration-form">
          <label>Dynamics Organization URL</label>
          <input
            type="text"
            placeholder="https://yourorg.crm.dynamics.com"
            value={dynamicsOrgUrl}
            onChange={(e) => setDynamicsOrgUrl(e.target.value)}
          />
          <label>Environment Name</label>
          <input
            type="text"
            placeholder="Example: Production"
            value={dynamicsEnv}
            onChange={(e) => setDynamicsEnv(e.target.value)}
          />
          <label className="integration-checkbox">
            <input
              type="checkbox"
              checked={dynamicsEnabled}
              onChange={(e) => setDynamicsEnabled(e.target.checked)}
            />
            Enable Dynamics 365 integration profile
          </label>
        </div>
        <p className="integration-help">
          Setup flow: create Azure App Registration -&gt; grant Dynamics API permissions -&gt; use OAuth for sync endpoint.
        </p>
        {dynamicsEnabled && dynamicsOrgUrl && (
          <a className="integration-link" href={dynamicsOrgUrl} target="_blank" rel="noreferrer">
            Open Dynamics 365 Org <ExternalLink size={14} />
          </a>
        )}
      </div>

      <div className="integration-actions">
        <button className="btn-sm primary" onClick={saveCustomIntegrations}>
          Save Power BI + Dynamics 365
        </button>
      </div>
    </div>
  )
}

export default IntegrationsPage
