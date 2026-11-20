/**
 * One question from a lesson you read a while ago, asked on the Dashboard.
 *
 * Three options, "Not sure yet" and a quiet "Not now". After an answer the server's `why` line shows,
 * with "You've got this one" or "This is worth another look" (the lesson quiz's own words). Nothing is
 * scored. Done removes the card for this visit. Core edition: literal English, no motion.
 */
import React, { useEffect, useState } from 'react';
import type { SlotState } from '../../components/home/DashboardSlot';
import { learnpalService } from './service';
import type { RecallChoice, RecallQuestion, RecallResult } from '../../types/learnpal';

export interface RecallState {
  recall: RecallQuestion | null;
  state: SlotState;
  dismiss: () => void;
}

export function useRecall(): RecallState {
  const [recall, setRecall] = useState<RecallQuestion | null>(null);
  const [settled, setSettled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let live = true;
    learnpalService.getRecall()
      .then((r) => { if (live) setRecall(r.enabled ? r.recall : null); })
      .catch(() => { /* no card beats an error box */ })
      .finally(() => { if (live) setSettled(true); });
    return () => { live = false; };
  }, []);

  // After Done or Not now the slot is held empty, so the This week card does not appear in the same
  // visit (the answered question would be replaced by another card under the user's cursor).
  const dismiss = () => { setRecall(null); setDismissed(true); };
  return { recall, dismiss, state: !settled ? 'loading' : dismissed ? 'hold' : recall ? 'show' : 'hide' };
}

const choiceButton: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 15,
  background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)',
};
const quiet: React.CSSProperties = {
  padding: 0, background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)', fontSize: 14,
};

export const RecallCard: React.FC<{ recall: RecallState }> = ({ recall: state }) => {
  const { recall, dismiss } = state;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RecallResult | null>(null);
  if (!recall) return null;

  const answer = async (choice: RecallChoice) => {
    setBusy(true);
    try {
      const r = await learnpalService.answerRecall(recall.id, choice);
      if (choice === 'not_now') { dismiss(); return; }
      setResult(r);
    } catch {
      // Left as it was so the click can be retried.
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="recall-card" aria-label="A question from earlier" style={{
      margin: '16px 0 20px', padding: '16px 20px', borderRadius: 12,
      background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
    }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
        Still with you?
      </h2>
      <p style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.5 }}>{recall.prompt}</p>
      {result === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          {recall.options.map((text, i) => (
            <button key={i} type="button" disabled={busy} onClick={() => answer(String(i) as RecallChoice)}
              style={choiceButton}>{text}</button>
          ))}
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <button type="button" disabled={busy} onClick={() => answer('not_sure')} style={choiceButton}>
              {recall.not_sure_label || 'Not sure yet'}
            </button>
            <button type="button" disabled={busy} onClick={() => answer('not_now')}
              style={{ ...quiet, alignSelf: 'center' }}>Not now</button>
          </div>
        </div>
      ) : (
        <div data-testid="recall-result">
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {result.right ? "You've got this one" : 'This is worth another look'}
          </p>
          {result.why && <p style={{ margin: '0 0 12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{result.why}</p>}
          <button type="button" onClick={dismiss} style={choiceButton}>Done</button>
        </div>
      )}
    </section>
  );
};

export default RecallCard;
