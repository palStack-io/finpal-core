/**
 * Points people from Accounts, where they go looking for it, to Settings → Integrations,
 * where connecting a bank actually happens.
 *
 * The feature was reachable only by opening Settings and finding the Integrations tab —
 * nothing on the page about accounts said automatic bank sync existed. This is the
 * signpost, and it carries enough of the instructions to decide whether to follow it.
 *
 * It removes itself in the two cases where it would be noise or a dead end: when the
 * server has SimpleFin switched off (`SIMPLEFIN_ENABLED` defaults to **false**, so
 * self-hosters who have not enabled it would otherwise be sent to a panel that says
 * "not available"), and when the user is already connected.
 */

import React, { useEffect, useState } from 'react';
import { Link2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { accountService } from '../../services/accountService';
import { useAuthStore } from '../../store/authStore';
import { SIMPLEFIN_DOCS_URL, SIMPLEFIN_STEPS } from '../../constants/simplefin';

export const BankSyncCallout: React.FC = () => {
  const navigate = useNavigate();
  const { features } = useAuthStore();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const serverHasSimpleFin = features?.simplefin !== false;

  useEffect(() => {
    if (!serverHasSimpleFin) return;
    let cancelled = false;
    accountService
      .getSimpleFinStatus()
      // A failure here must not hide the callout: the common failure is a network
      // blip, and treating that as "connected" would remove the only pointer to the
      // feature. Not-connected is the safe answer.
      .then((status) => { if (!cancelled) setConnected(Boolean(status?.connected)); })
      .catch(() => { if (!cancelled) setConnected(false); });
    return () => { cancelled = true; };
  }, [serverHasSimpleFin]);

  if (!serverHasSimpleFin) return null;
  // `null` is "still asking" — rendering during that flickers the callout in and out
  // for anyone who is already connected.
  if (connected !== false) return null;

  return (
    <div
      style={{
        padding: '20px',
        marginBottom: '32px',
        background: 'var(--surface-hover)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
      }}
    >
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(59, 130, 246, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Link2 size={20} color="#3b82f6" />
        </div>

        <div style={{ flex: 1, minWidth: '260px' }}>
          <h3 className="fp-item-title">Connect your bank automatically</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginTop: '4px' }}>
            SimpleFin keeps balances and transactions up to date so you do not have to
            import them. You set it up in <strong>Settings → Integrations</strong>, using
            a setup token you generate at SimpleFin Bridge.
          </p>

          {showSteps && (
            <ol
              style={{
                margin: '12px 0 0',
                paddingLeft: '20px',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                lineHeight: 1.6,
              }}
            >
              {SIMPLEFIN_STEPS.map((step, i) => (
                <li key={i} style={{ marginBottom: '6px' }}>{step}</li>
              ))}
            </ol>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginTop: '14px' }}>
            <button
              onClick={() => navigate('/settings?tab=integrations')}
              style={{
                padding: '10px 18px',
                background: 'var(--brand-main-green)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Set up bank sync
            </button>
            <button
              onClick={() => setShowSteps((v) => !v)}
              style={{
                padding: '10px 14px',
                background: 'transparent',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {showSteps ? 'Hide steps' : 'What do I need?'}
            </button>
            <a
              href={SIMPLEFIN_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--text-muted)',
                fontSize: '13px',
                textDecoration: 'underline',
              }}
            >
              <ExternalLink size={13} />
              Full setup guide
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
