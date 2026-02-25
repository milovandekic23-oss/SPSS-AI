/**
 * ApiKeyInput — compact API key entry for the header.
 * Key lives in React state only. Never stored anywhere persistent.
 */

import { useState } from 'react'
import { theme, styles } from '../theme'

interface ApiKeyInputProps {
  apiKey: string
  onApiKeyChange: (key: string) => void
}

export function ApiKeyInput({ apiKey, onApiKeyChange }: ApiKeyInputProps) {
  const [editing, setEditing] = useState(!apiKey)
  const [draft, setDraft] = useState(apiKey)
  const [show, setShow] = useState(false)
  const isSet = apiKey.length > 0

  const handleSave = () => {
    const trimmed = draft.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      alert(
        "This doesn't look like a valid Anthropic API key (should start with sk-ant-). Check at console.anthropic.com"
      )
      return
    }
    onApiKeyChange(trimmed)
    setEditing(false)
  }

  const handleClear = () => {
    onApiKeyChange('')
    setDraft('')
    setEditing(true)
  }

  if (!editing && isSet) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontFamily: theme.font.family,
            color: '#FFFFFF',
            opacity: 0.85,
            background: 'rgba(255,255,255,0.15)',
            padding: '4px 10px',
            borderRadius: 2,
          }}
        >
          🔑 AI enabled
        </span>
        <button
          type="button"
          onClick={handleClear}
          style={{
            ...styles.btn,
            marginTop: 0,
            padding: '4px 10px',
            fontSize: 11,
            color: '#FFFFFF',
            borderColor: 'rgba(255,255,255,0.4)',
            background: 'transparent',
          }}
        >
          Change key
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type={show ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="sk-ant-api03-…"
          style={{
            fontSize: 11,
            padding: '5px 8px',
            width: 200,
            fontFamily: 'monospace',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#FFFFFF',
            outline: 'none',
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          title={show ? 'Hide key' : 'Show key'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 14,
            padding: '0 2px',
            fontFamily: theme.font.family,
          }}
        >
          {show ? '🙈' : '👁'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!draft.trim()}
          style={{
            ...styles.btn,
            marginTop: 0,
            padding: '4px 12px',
            fontSize: 11,
            background: 'rgba(255,255,255,0.9)',
            color: theme.colors.accent,
            borderColor: 'transparent',
            opacity: draft.trim() ? 1 : 0.5,
            cursor: draft.trim() ? 'pointer' : 'default',
          }}
        >
          Enable AI
        </button>
      </div>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.3 }}>
        Session only — never stored.{' '}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'underline' }}
        >
          Get a key ↗
        </a>
      </p>
    </div>
  )
}
