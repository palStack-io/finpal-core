/**
 * Agent Access Component
 * Mints and revokes personal access tokens, and reviews the writes an API
 * client proposed — approve, reject, or undo one that was already applied.
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, Check, Copy, KeyRound, Trash2, Undo2, X } from 'lucide-react';
import API_CONFIG from '../../config/api';
import { agentAccessService } from '../../services/agentAccessService';
import type {
  AccessToken,
  AgentAction,
  AgentActionStatus,
  CreatedToken,
  TokenScope,
} from '../../services/agentAccessService';

const panelStyle: React.CSSProperties = {
  padding: '20px',
  background: 'var(--surface-hover)',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  marginBottom: '20px',
};

const bannerStyle = (rgb: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '16px',
  background: `rgba(${rgb}, 0.1)`,
  border: `1px solid rgba(${rgb}, 0.3)`,
  borderRadius: '8px',
  marginBottom: '20px',
});

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 0',
  borderBottom: '1px solid var(--border-light)',
};

const iconButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  background: 'var(--btn-secondary-bg)',
  border: '1px solid var(--btn-secondary-border)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontWeight: '500',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--text-secondary)',
  fontSize: '14px',
  fontWeight: '500',
  marginBottom: '8px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '14px',
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: '12px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '12px',
  lineHeight: 1.5,
  overflowX: 'auto',
  userSelect: 'all',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

/** Semantic status colours; deliberately not variablised — see CLAUDE.md. */
const STATUS_COLOR: Record<AgentActionStatus, string> = {
  applied: '#22c55e',
  approved: '#22c55e',
  pending: '#f59e0b',
  rejected: '#ef4444',
  expired: 'var(--text-muted)',
  reverted: 'var(--text-muted)',
};

/** The wire name of each guarded write, in words. */
const ACTION_LABEL: Record<string, string> = {
  create_transaction: 'Create a transaction',
  update_transaction_category: 'Recategorise a transaction',
  recategorise_transactions: 'Recategorise several transactions',
  set_budget: 'Change a budget',
  create_budget: 'Create a budget',
  create_category: 'Create a category',
  rename_category: 'Rename a category',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 14;

const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : 'never';

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : 'no expiry';

/** 'soon' means inside the warning window; 'gone' means already past. */
const expiryState = (iso: string | null): 'ok' | 'soon' | 'gone' => {
  if (!iso) return 'ok';
  const remaining = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(remaining)) return 'ok';
  if (remaining <= 0) return 'gone';
  return remaining <= EXPIRY_WARNING_DAYS * DAY_MS ? 'soon' : 'ok';
};

/**
 * What a client on this machine should use as FINPAL_URL. Normally the page's
 * own origin; when the build points axios at a different host that host wins,
 * because that is where the API actually answers.
 */
const apiOrigin = (): string => {
  const configured = API_CONFIG.baseURL;
  if (configured) {
    try {
      return new URL(configured, window.location.origin).origin;
    } catch {
      // A relative or malformed base — fall through to the page origin.
    }
  }
  return window.location.origin;
};

const mcpConfig = (token: string): string => JSON.stringify({
  mcpServers: {
    finpal: {
      command: 'npx',
      args: ['-y', 'finpal-mcp'],
      env: {
        FINPAL_URL: apiOrigin(),
        FINPAL_TOKEN: token,
      },
    },
  },
}, null, 2);

export const AgentAccess: React.FC = () => {
  const [tokens, setTokens] = useState<AccessToken[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<TokenScope>('read');
  const [newExpiry, setNewExpiry] = useState('90');
  const [minted, setMinted] = useState<CreatedToken | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadTokens();
    loadActions();
  }, []);

  const loadTokens = async () => {
    try {
      setTokens(await agentAccessService.listTokens());
    } catch (err) {
      console.error('Failed to load access tokens:', err);
    }
  };

  const loadActions = async () => {
    try {
      setActions(await agentAccessService.listActions());
    } catch (err) {
      console.error('Failed to load agent actions:', err);
    }
  };

  // The API answers with {'error': ...}; fall back to message for anything
  // that goes through a different error path.
  const readError = (err: any, fallback: string) =>
    err.response?.data?.error || err.response?.data?.message || fallback;

  const flash = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 4000);
  };

  // clipboard is undefined outside a secure context, which is exactly where a
  // self-hosted server on plain http lives. Say so instead of throwing.
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${what} copied to the clipboard`);
    } catch {
      setError(`Could not reach the clipboard — this browser only allows it over HTTPS. Select the ${what.toLowerCase()} and copy it by hand.`);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError('Name the token so you can tell it apart later');
      return;
    }
    const days = Number(newExpiry);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      setError('Expiry must be between 1 and 365 days');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const created = await agentAccessService.createToken(
        newName.trim(), newScope, Math.floor(days));
      setMinted(created);
      setNewName('');
      await loadTokens();
    } catch (err: any) {
      setError(readError(err, 'Failed to create the token'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (token: AccessToken) => {
    if (!confirm(`Revoke "${token.name}"? Anything still using it stops working immediately.`)) {
      return;
    }
    setBusyId(`token-${token.id}`);
    setError(null);
    try {
      const rejected = await agentAccessService.revokeToken(token.id);
      flash(rejected
        ? `Token revoked. ${rejected} pending proposal(s) were rejected with it.`
        : 'Token revoked.');
      await Promise.all([loadTokens(), loadActions()]);
    } catch (err: any) {
      setError(readError(err, 'Failed to revoke the token'));
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async (action: AgentAction) => {
    setBusyId(`action-${action.id}`);
    setError(null);
    try {
      await agentAccessService.approveAction(action.id);
      flash('Change applied.');
      await loadActions();
    } catch (err: any) {
      setError(readError(err, 'Failed to apply the change'));
      await loadActions();
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (action: AgentAction) => {
    setBusyId(`action-${action.id}`);
    setError(null);
    try {
      await agentAccessService.rejectAction(action.id);
      flash('Proposal rejected.');
      await loadActions();
    } catch (err: any) {
      setError(readError(err, 'Failed to reject the proposal'));
      await loadActions();
    } finally {
      setBusyId(null);
    }
  };

  const handleRevert = async (action: AgentAction) => {
    if (!confirm(`Undo "${ACTION_LABEL[action.action] || action.action}"? This puts the data back as it was.`)) {
      return;
    }
    setBusyId(`action-${action.id}`);
    setError(null);
    try {
      await agentAccessService.revertAction(action.id);
      flash('Change undone.');
      await loadActions();
    } catch (err: any) {
      setError(readError(err, 'Failed to undo the change'));
      await loadActions();
    } finally {
      setBusyId(null);
    }
  };

  const pending = actions.filter((a) => a.status === 'pending');
  const recent = actions.filter((a) => a.status !== 'pending');

  return (
    <div>
      {error && (
        <div style={bannerStyle('239, 68, 68')}>
          <AlertCircle size={20} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
          <p style={{ color: 'var(--accent-red)', fontSize: '14px', margin: 0 }}>{error}</p>
        </div>
      )}

      {success && (
        <div style={bannerStyle('34, 197, 94')}>
          <Check size={20} style={{ color: 'var(--brand-green-glow)', flexShrink: 0 }} />
          <p style={{ color: 'var(--brand-green-glow)', fontSize: '14px', margin: 0 }}>{success}</p>
        </div>
      )}

      {/* The plaintext, shown once */}
      {minted && (
        <div style={panelStyle}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
            {minted.token_info.name}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
            This is the only time this token will be shown. Copy it now — the server
            keeps only a hash and cannot show it again.
          </p>

          <pre style={codeBlockStyle}>{minted.token}</pre>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => copy(minted.token, 'Token')} style={iconButtonStyle}>
              <Copy size={14} />
              Copy token
            </button>
          </div>

          <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', margin: '20px 0 4px' }}>
            For Claude Desktop or another MCP client
          </h4>
          <p style={{ color: 'var(--accent-red)', fontSize: '13px', margin: '0 0 8px' }}>
            <code>finpal-mcp</code> is not published yet, so this config will not
            connect today. The token itself works right now for curl and scripts.
            This block becomes live when the package ships.
          </p>

          <pre style={codeBlockStyle}>{mcpConfig(minted.token)}</pre>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '8px 0 0' }}>
            <code>FINPAL_URL</code> is this browser's view of the server, which is right
            when the client runs on the same machine or LAN. Behind a reverse proxy or a
            tunnel, substitute your external URL.
          </p>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => copy(mcpConfig(minted.token), 'MCP config')}
              style={iconButtonStyle}
            >
              <Copy size={14} />
              Copy MCP config
            </button>
            <button onClick={() => setMinted(null)} style={iconButtonStyle}>
              <X size={14} />
              I've saved it
            </button>
          </div>
        </div>
      )}

      {/* Tokens */}
      <div style={panelStyle}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
          Access Tokens
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
          A token reads only your own data. <strong>Read</strong> cannot change anything;
          <strong> read &amp; write</strong> lets a client propose changes, which still wait
          for you here.
        </p>

        {tokens.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            No tokens yet.
          </p>
        ) : (
          <div style={{ marginBottom: '16px' }}>
            {tokens.map((token) => {
              const revoked = token.revoked_at !== null;
              const expiry = revoked ? 'ok' : expiryState(token.expires_at);
              return (
                <div key={token.id} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <p style={{
                        color: revoked ? 'var(--text-muted)' : 'var(--text-primary)',
                        fontSize: '14px', fontWeight: '500', margin: 0, overflowWrap: 'anywhere',
                      }}>
                        {token.name}
                      </p>
                      <code style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {token.token_prefix}…
                      </code>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                        {token.scopes === 'read_write' ? 'read & write' : 'read'}
                      </span>
                      {revoked && (
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
                          revoked
                        </span>
                      )}
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0' }}>
                      last used {formatWhen(token.last_used_at)}
                      {' • '}
                      {revoked ? (
                        <>revoked {formatWhen(token.revoked_at)}</>
                      ) : expiry === 'gone' ? (
                        <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>
                          expired {formatDate(token.expires_at)}
                        </span>
                      ) : expiry === 'soon' ? (
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                          expires {formatDate(token.expires_at)} — expires soon
                        </span>
                      ) : (
                        <>expires {formatDate(token.expires_at)}</>
                      )}
                    </p>
                  </div>
                  {!revoked && (
                    <button
                      onClick={() => handleRevoke(token)}
                      disabled={busyId === `token-${token.id}`}
                      title="Revoke this token"
                      style={{
                        ...iconButtonStyle,
                        color: 'var(--accent-red)',
                        flexShrink: 0,
                        opacity: busyId === `token-${token.id}` ? 0.5 : 1,
                      }}
                    >
                      <Trash2 size={14} />
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 200px', minWidth: 0 }}>
            <label style={labelStyle} htmlFor="agent-token-name">Name</label>
            <input
              id="agent-token-name"
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError(null);
              }}
              placeholder="Claude Desktop"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 150px', minWidth: 0 }}>
            <label style={labelStyle} htmlFor="agent-token-scope">Access</label>
            <select
              id="agent-token-scope"
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as TokenScope)}
              style={inputStyle}
            >
              <option value="read">Read only</option>
              <option value="read_write">Read &amp; write</option>
            </select>
          </div>
          <div style={{ flex: '1 1 120px', minWidth: 0 }}>
            <label style={labelStyle} htmlFor="agent-token-expiry">Expires in (days)</label>
            <input
              id="agent-token-expiry"
              type="number"
              min={1}
              max={365}
              value={newExpiry}
              onChange={(e) => {
                setNewExpiry(e.target.value);
                setError(null);
              }}
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              background: 'var(--brand-main-green)',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            <KeyRound size={16} />
            Create token
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
          Every token expires; 365 days is the longest the server accepts.
        </p>
      </div>

      {/* Pending proposals */}
      <div style={panelStyle}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
          Waiting for You
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
          Changes a client proposed. Nothing here has happened yet.
        </p>

        {pending.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nothing is waiting.</p>
        ) : (
          pending.map((action) => (
            <div key={action.id} style={{ ...rowStyle, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{
                  color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500', margin: 0,
                }}>
                  {ACTION_LABEL[action.action] || action.action}
                </p>
                <div style={{ margin: '6px 0 0' }}>
                  {Object.entries(action.payload).map(([key, value]) => (
                    <p key={key} style={{
                      color: 'var(--text-secondary)', fontSize: '12px',
                      margin: '2px 0', overflowWrap: 'anywhere',
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>{key}: </span>
                      {typeof value === 'object' && value !== null
                        ? JSON.stringify(value)
                        : String(value)}
                    </p>
                  ))}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '6px 0 0' }}>
                  proposed {formatWhen(action.created_at)}
                  {action.expires_at && ` • offer lapses ${formatWhen(action.expires_at)}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={() => handleApprove(action)}
                  disabled={busyId === `action-${action.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    background: 'var(--brand-main-green)',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    opacity: busyId === `action-${action.id}` ? 0.5 : 1,
                  }}
                >
                  <Check size={14} />
                  Approve
                </button>
                <button
                  onClick={() => handleReject(action)}
                  disabled={busyId === `action-${action.id}`}
                  style={{
                    ...iconButtonStyle,
                    color: 'var(--accent-red)',
                    opacity: busyId === `action-${action.id}` ? 0.5 : 1,
                  }}
                >
                  <X size={14} />
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Recent activity */}
      <div style={panelStyle}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
          Recent Activity
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
          Everything a token has done, newest first.
        </p>

        {recent.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No activity yet.</p>
        ) : (
          recent.map((action) => (
            <div key={action.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <p style={{
                    color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500', margin: 0,
                  }}>
                    {ACTION_LABEL[action.action] || action.action}
                  </p>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: STATUS_COLOR[action.status] }}>
                    {action.status}
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0' }}>
                  {formatWhen(action.decided_at || action.created_at)}
                  {action.target_ref && ` • ${action.target_ref}`}
                </p>
              </div>
              {(action.status === 'applied' || action.status === 'approved') && (
                <button
                  onClick={() => handleRevert(action)}
                  disabled={busyId === `action-${action.id}`}
                  style={{
                    ...iconButtonStyle,
                    flexShrink: 0,
                    opacity: busyId === `action-${action.id}` ? 0.5 : 1,
                  }}
                >
                  <Undo2 size={14} />
                  Undo
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
