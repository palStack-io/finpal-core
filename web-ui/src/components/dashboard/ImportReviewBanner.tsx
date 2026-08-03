/**
 * Import Review Banner
 * Flags an automatic CSV import whose column mapping was guessed rather than
 * learned, so a wrong guess is visible and undoable instead of silent.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Undo2, X } from 'lucide-react';
import { importService } from '../../services/importService';
import type { ImportBatch } from '../../services/importService';

interface ImportReviewBannerProps {
  /** Called after a batch is undone, so the dashboard figures can be reloaded. */
  onReverted?: () => void;
}

/** Only recent imports are worth nagging about. */
const REVIEW_WINDOW_DAYS = 14;

const DISMISSED_KEY = 'import_review_dismissed';

/**
 * Dismissal has to outlive the component. A heuristic profile keeps
 * origin='heuristic' for good, so every later file from that bank produces
 * another batch that wants reviewing — with dismissal held in component state
 * the only way to clear the banner would be Undo, which deletes the
 * transactions. Persist the batch ids the user has already seen.
 */
const readDismissed = (): number[] => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'number') : [];
  } catch {
    return [];
  }
};

const writeDismissed = (ids: number[]) => {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // Private browsing or a full quota — the banner just reappears next load.
  }
};

/**
 * A mapping wants reviewing when it was guessed, or when the parse was shaky.
 *
 * Both halves are needed. profile_origin catches the heuristic path even when it
 * is fully confident — the heuristics legitimately return 1.0 for an unambiguous
 * header — and the confidence test catches a low-confidence import whatever its
 * origin. A reverted batch has already been dealt with, and anything older than
 * the review window is history the user has had ample chance to look at.
 */
const needsReview = (batch: ImportBatch) => {
  if (batch.status === 'reverted') return false;
  if (batch.created_at) {
    const ageDays = (Date.now() - new Date(batch.created_at).getTime()) / 86_400_000;
    if (ageDays > REVIEW_WINDOW_DAYS) return false;
  }
  return batch.profile_origin === 'heuristic' ||
    (batch.confidence !== null && batch.confidence < 1);
};

export const ImportReviewBanner: React.FC<ImportReviewBannerProps> = ({ onReverted }) => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [dismissedIds, setDismissedIds] = useState<number[]>(readDismissed);
  const [isReverting, setIsReverting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    importService
      .listBatches()
      .then((page) => {
        if (!cancelled) setBatches(page.batches.filter(needsReview));
      })
      // A user with no import sources has nothing here; failing quietly is right.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const pending = batches.filter((b) => !dismissedIds.includes(b.id));
  const batch = pending[0];

  if (!batch) return null;

  const handleDismiss = () => {
    const next = [...dismissedIds, batch.id];
    setDismissedIds(next);
    writeDismissed(next);
  };

  const handleUndo = async () => {
    setIsReverting(true);
    try {
      await importService.revertBatch(batch.id);
      setBatches((current) => current.filter((b) => b.id !== batch.id));
      onReverted?.();
    } catch {
      // Leave the banner up so the user can retry or go to Settings.
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '16px',
      // Flat amber wash, not a gradient: this is an FYI, not the DemoBanner's urgency.
      background: 'rgba(245, 158, 11, 0.1)',
      border: '1px solid rgba(245, 158, 11, 0.3)',
      borderRadius: '8px',
      marginBottom: '24px',
      flexWrap: 'wrap',
    }}>
      <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
      <p style={{ color: 'var(--text-primary)', fontSize: '14px', margin: 0, flex: 1, minWidth: '220px' }}>
        Imported {batch.imported} transaction{batch.imported === 1 ? '' : 's'} from{' '}
        <strong style={{ overflowWrap: 'anywhere' }}>{batch.filename}</strong> using a guessed
        mapping{pending.length > 1 ? ` (and ${pending.length - 1} more)` : ''}. Check the columns
        landed in the right place.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={() => navigate('/settings?tab=integrations')}
          style={{
            padding: '8px 14px',
            background: 'var(--btn-secondary-bg)',
            border: '1px solid var(--btn-secondary-border)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          Review
        </button>
        <button
          onClick={handleUndo}
          disabled={isReverting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: 'var(--btn-secondary-bg)',
            border: '1px solid var(--btn-secondary-border)',
            borderRadius: '6px',
            color: 'var(--accent-red)',
            fontSize: '13px',
            fontWeight: '500',
            cursor: isReverting ? 'not-allowed' : 'pointer',
            opacity: isReverting ? 0.5 : 1,
          }}
        >
          <Undo2 size={14} />
          Undo
        </button>
        <button
          onClick={handleDismiss}
          title="Dismiss — this import will not be flagged again"
          aria-label="Dismiss import review notice"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
