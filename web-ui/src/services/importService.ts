/**
 * Import Service
 * Handles watched import folders and the CSV import batch history
 */

import { api } from './api';

export interface ImportSource {
  id: number;
  kind: string;
  path: string | null;
  enabled: boolean;
  scan_interval_minutes: number;
  last_scanned_at: string | null;
}

export type ImportBatchStatus = 'success' | 'partial' | 'failed' | 'reverted';

export interface ImportBatch {
  id: number;
  filename: string;
  status: ImportBatchStatus;
  confidence: number | null;
  row_count: number;
  imported: number;
  skipped: number;
  errors: number;
  error_details: string[];
  mapping_used: Record<string, string> | null;
  /** 'heuristic' means the columns were guessed and want reviewing. */
  profile_origin: 'manual' | 'heuristic' | null;
  created_at: string | null;
  reverted_at: string | null;
}

export interface ImportBatchPage {
  batches: ImportBatch[];
  total: number;
  page: number;
}

/**
 * Batch routes are top-level (`/api/v1/import-batches`), not nested under
 * import-sources — see the module docstring in api/v1/import_sources.py.
 */
export const importService = {
  /**
   * List the watched folders. Admin-only server-side; a non-admin gets 403.
   */
  async listSources(): Promise<ImportSource[]> {
    const response = await api.get('/api/v1/import-sources');
    return response.data.sources;
  },

  /**
   * Watch a folder. The path must sit inside CSV_IMPORT_ROOT or this 400s.
   */
  async createSource(path: string, scanIntervalMinutes = 5): Promise<ImportSource> {
    const response = await api.post('/api/v1/import-sources', {
      path,
      scan_interval_minutes: scanIntervalMinutes,
    });
    return response.data.source;
  },

  /**
   * Stop watching a folder. Files already imported are left alone.
   */
  async deleteSource(id: number): Promise<void> {
    await api.delete(`/api/v1/import-sources/${id}`);
  },

  /**
   * Scan a folder immediately rather than waiting for the scheduled run.
   */
  async scanNow(id: number): Promise<ImportBatch[]> {
    const response = await api.post(`/api/v1/import-sources/${id}/scan`);
    return response.data.batches;
  },

  /**
   * The import history, newest first.
   */
  async listBatches(page = 1): Promise<ImportBatchPage> {
    const response = await api.get('/api/v1/import-batches', { params: { page } });
    return response.data;
  },

  /**
   * Undo an import. Returns how many transactions were removed. Not repeatable:
   * a second call on the same batch 409s.
   */
  async revertBatch(id: number): Promise<number> {
    const response = await api.delete(`/api/v1/import-batches/${id}`);
    return response.data.reverted;
  },
};
