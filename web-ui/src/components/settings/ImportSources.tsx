/**
 * Import Sources Component
 * Manages watched folders for automatic CSV import and the import history
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, Check, FolderPlus, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { importService } from '../../services/importService';
import type { ImportBatch, ImportBatchStatus, ImportSource } from '../../services/importService';

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

/** Semantic status colours; deliberately not variablised — see CLAUDE.md. */
const STATUS_COLOR: Record<ImportBatchStatus, string> = {
  success: '#22c55e',
  partial: '#f59e0b',
  failed: '#ef4444',
  reverted: 'var(--text-muted)',
};

const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : 'never';

export const ImportSources: React.FC = () => {
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [newPath, setNewPath] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadSources();
    loadBatches();
  }, []);

  const loadSources = async () => {
    try {
      setSources(await importService.listSources());
    } catch (err) {
      console.error('Failed to load import sources:', err);
    }
  };

  const loadBatches = async () => {
    try {
      const page = await importService.listBatches();
      setBatches(page.batches);
    } catch (err) {
      console.error('Failed to load import history:', err);
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

  const handleAdd = async () => {
    if (!newPath.trim()) {
      setError('Enter the folder to watch');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await importService.createSource(newPath.trim());
      setNewPath('');
      flash('Folder added. It will be scanned every 5 minutes.');
      await loadSources();
    } catch (err: any) {
      setError(readError(err, 'Failed to add the folder'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleScan = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      const found = await importService.scanNow(id);
      const imported = found.reduce((total, batch) => total + batch.imported, 0);
      flash(found.length
        ? `Scanned ${found.length} file(s), imported ${imported} transaction(s).`
        : 'Scanned — no new files to import.');
      await Promise.all([loadSources(), loadBatches()]);
    } catch (err: any) {
      setError(readError(err, 'Scan failed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteSource = async (source: ImportSource) => {
    if (!confirm(`Stop watching ${source.path}? Transactions already imported are kept.`)) {
      return;
    }
    setBusyId(source.id);
    setError(null);
    try {
      await importService.deleteSource(source.id);
      flash('Folder removed');
      await loadSources();
    } catch (err: any) {
      setError(readError(err, 'Failed to remove the folder'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRevert = async (batch: ImportBatch) => {
    if (!confirm(`Undo the import of ${batch.filename}? This removes the transactions it created.`)) {
      return;
    }
    setBusyId(batch.id);
    setError(null);
    try {
      const reverted = await importService.revertBatch(batch.id);
      flash(`Removed ${reverted} transaction(s) from ${batch.filename}`);
      await loadBatches();
    } catch (err: any) {
      setError(readError(err, 'Failed to undo the import'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {error && (
        <div style={bannerStyle('239, 68, 68')}>
          <AlertCircle size={20} style={{ color: 'var(--accent-red)' }} />
          <p style={{ color: 'var(--accent-red)', fontSize: '14px', margin: 0 }}>{error}</p>
        </div>
      )}

      {success && (
        <div style={bannerStyle('34, 197, 94')}>
          <Check size={20} style={{ color: 'var(--brand-green-glow)' }} />
          <p style={{ color: 'var(--brand-green-glow)', fontSize: '14px', margin: 0 }}>{success}</p>
        </div>
      )}

      {/* Watched folders */}
      <div style={panelStyle}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
          Watched Folders
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
          Drop a CSV into a watched folder and it is imported automatically.
        </p>

        {sources.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            No folders are being watched yet.
          </p>
        ) : (
          <div style={{ marginBottom: '16px' }}>
            {sources.map((source) => (
              <div key={source.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500',
                    margin: 0, overflowWrap: 'anywhere',
                  }}>
                    {source.path}
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0' }}>
                    Every {source.scan_interval_minutes} min • last scanned {formatWhen(source.last_scanned_at)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleScan(source.id)}
                    disabled={busyId === source.id}
                    style={{ ...iconButtonStyle, opacity: busyId === source.id ? 0.5 : 1 }}
                  >
                    <RefreshCw size={14} />
                    Scan now
                  </button>
                  <button
                    onClick={() => handleDeleteSource(source)}
                    disabled={busyId === source.id}
                    title="Stop watching this folder"
                    style={{
                      ...iconButtonStyle,
                      color: 'var(--accent-red)',
                      opacity: busyId === source.id ? 0.5 : 1,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <label style={labelStyle} htmlFor="import-folder-path">Folder path</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <input
            id="import-folder-path"
            type="text"
            value={newPath}
            onChange={(e) => {
              setNewPath(e.target.value);
              setError(null);
            }}
            placeholder="/data/inbox"
            style={inputStyle}
          />
          <button
            onClick={handleAdd}
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
            <FolderPlus size={16} />
            Add folder
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
          The folder must sit inside the server's <code>CSV_IMPORT_ROOT</code>. Anything
          outside it is rejected.
        </p>
      </div>

      {/* Import history */}
      <div style={panelStyle}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
          Import History
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
          Every automatic import, newest first. Undo removes the transactions it created.
        </p>

        {batches.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nothing has been imported yet.</p>
        ) : (
          batches.map((batch) => (
            <div key={batch.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <p style={{
                    color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500',
                    margin: 0, overflowWrap: 'anywhere',
                  }}>
                    {batch.filename}
                  </p>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: STATUS_COLOR[batch.status],
                  }}>
                    {batch.status}
                  </span>
                  {batch.profile_origin === 'heuristic' && (
                    <span style={{ fontSize: '12px', color: '#f59e0b' }}>guessed mapping</span>
                  )}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0' }}>
                  {batch.imported} imported
                  {batch.skipped > 0 && ` • ${batch.skipped} skipped`}
                  {batch.errors > 0 && ` • ${batch.errors} error(s)`}
                  {batch.confidence !== null && ` • confidence ${Math.round(batch.confidence * 100)}%`}
                  {' • '}{formatWhen(batch.created_at)}
                </p>
                {batch.error_details.length > 0 && (
                  <ul style={{
                    color: 'var(--accent-red)', fontSize: '12px',
                    margin: '6px 0 0', paddingLeft: '18px',
                  }}>
                    {batch.error_details.slice(0, 3).map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
              {batch.status !== 'reverted' && (
                <button
                  onClick={() => handleRevert(batch)}
                  disabled={busyId === batch.id}
                  style={{
                    ...iconButtonStyle,
                    flexShrink: 0,
                    opacity: busyId === batch.id ? 0.5 : 1,
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
