/**
 * SimpleFin Integration Types
 */

export interface SimpleFinStatus {
  connected: boolean;
  lastSync?: string;
  accountCount?: number;
  syncFrequency?: string;
  enabled?: boolean;
}

export interface SimpleFinAccount {
  id: string;
  name: string;
  type: string;
  institution: string;
  balance: number;
  currency: string;
  balance_date?: string;
}

export interface SimpleFinConnection {
  access_url: string;
}

export interface ImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors?: string[];
  message?: string;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  newTransactions?: number;
  lastSync: string;
  message?: string;
}

export interface ExportOptions {
  accountId?: number;
  startDate?: string;
  endDate?: string;
}
