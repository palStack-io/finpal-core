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

/**
 * A mapping wants reviewing when it was guessed, or when the parse was shaky.
 *
 * Both halves are needed. profile_origin catches the heuristic path even when it
 * is fully confident — the heuristics legitimately return 1.0 for an unambiguous
 * header — and the confidence test catches a low-confidence import whatever its
 * origin. A reverted batch has already been dealt with.
 */
const needsReview = (batch: ImportBatch) =>
  batch.status !== 'reverted' &&
  (batch.profile_origin === 'heuristic' ||
    (batch.confidence !== null && batch.confidence < 1));

export const ImportReviewBanner: React.FC<ImportReviewBannerProps> = ({ onReverted }) => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [dismissed, setDismissed] = useState(false);
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

  const batch = batches[0];

  if (dismissed || !batch) return null;

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
        mapping{batches.length > 1 ? ` (and ${batches.length - 1} more)` : ''}. Check the columns
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
          onClick={() => setDismissed(true)}
          title="Dismiss"
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
