/**
 * CSV Import Modal
 * Modal for importing transactions from CSV files with column mapping
 */

import React, { useState, useCallback } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { accountService, Account } from '../../services/accountService';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: Account[];
}

type ImportStep = 'upload' | 'mapping' | 'importing' | 'complete';

interface ColumnMapping {
  [key: string]: string; // CSV column -> App field
}

const REQUIRED_FIELDS = ['date', 'description', 'amount'];
const OPTIONAL_FIELDS = ['type', 'category', 'account', 'currency'];

export const CSVImportModal: React.FC<CSVImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  accounts,
}) => {
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<number | undefined>(undefined);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const parseCSV = (text: string): { headers: string[], rows: string[][] } => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1, Math.min(6, lines.length)).map(line =>
      line.split(',').map(cell => cell.trim())
    );

    return { headers, rows };
  };

  const autoMapColumns = (headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {};
    const lowerHeaders = headers.map(h => h.toLowerCase());

    // Auto-detect common column names
    const patterns: { [key: string]: string[] } = {
      date: ['date', 'transaction date', 'posted date', 'datetime'],
      description: ['description', 'memo', 'details', 'payee', 'merchant'],
      amount: ['amount', 'value', 'total', 'debit', 'credit'],
      type: ['type', 'transaction type', 'category type'],
      category: ['category', 'subcategory', 'tag'],
      account: ['account', 'account name'],
      currency: ['currency', 'curr', 'ccy']
    };

    headers.forEach((header, index) => {
      const lowerHeader = lowerHeaders[index];
      for (const [field, patterns_list] of Object.entries(patterns)) {
        if (patterns_list.some(pattern => lowerHeader.includes(pattern))) {
          mapping[header] = field;
          break;
        }
      }
    });

    return mapping;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find((file) => file.name.toLowerCase().endsWith('.csv'));

    if (csvFile) {
      processFile(csvFile);
    } else {
      setError('Please drop a CSV file');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith('.csv')) {
        processFile(file);
      } else {
        setError('Please select a CSV file');
      }
    }
  };

  const processFile = async (file: File) => {
    setSelectedFile(file);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0) {
        setError('CSV file appears to be empty');
        return;
      }

      setCsvHeaders(headers);
      setCsvPreview(rows);

      // Auto-map columns
      const autoMapping = autoMapColumns(headers);
      setColumnMapping(autoMapping);

      // Move to mapping step
      setStep('mapping');
    } catch (err) {
      setError('Failed to parse CSV file');
    }
  };

  const validateMapping = (): boolean => {
    const mappedFields = Object.values(columnMapping);
    const hasAllRequired = REQUIRED_FIELDS.every(field => mappedFields.includes(field));

    if (!hasAllRequired) {
      setError(`Please map all required fields: ${REQUIRED_FIELDS.join(', ')}`);
      return false;
    }

    setError(null);
    return true;
  };

  const handleImport = async () => {
    if (!selectedFile || !validateMapping()) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setStep('importing');

    try {
      // Create FormData with file and mapping
      const formData = new FormData();
      formData.append('csv_file', selectedFile);
      if (selectedAccount) {
        formData.append('account_id', selectedAccount.toString());
      }
      formData.append('column_mapping', JSON.stringify(columnMapping));

      const importResult = await accountService.importTransactionsCSV(
        selectedFile,
        selectedAccount
      );

      if (importResult.success) {
        setResult({
          imported: importResult.importedCount,
          skipped: importResult.skippedCount,
        });
        setStep('complete');

        // Wait a moment to show results
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 3000);
      } else {
        setError(importResult.errors?.join(', ') || 'Import failed');
        setStep('mapping');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to import transactions');
      setStep('mapping');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setSelectedFile(null);
    setSelectedAccount(undefined);
    setCsvHeaders([]);
    setCsvPreview([]);
    setColumnMapping({});
    setError(null);
    setResult(null);
    setIsDragging(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)'
    }}>
      <div style={{
        background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: step === 'mapping' ? '900px' : '600px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              height: '48px',
              width: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Upload style={{ height: '24px', width: '24px', color: 'white' }} />
            </div>
            <div>
              <h2 style={{
                fontSize: '24px',
                fontWeight: 'bold',
                background: 'linear-gradient(to right, #86efac, #fbbf24)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                margin: 0
              }}>
                Import from CSV
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '4px 0 0 0' }}>
                {step === 'upload' && 'Upload your transaction history'}
                {step === 'mapping' && 'Map your CSV columns'}
                {step === 'importing' && 'Importing transactions...'}
                {step === 'complete' && 'Import complete!'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              padding: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <X style={{ height: '24px', width: '24px' }} />
          </button>
        </div>

        {/* Step Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '32px'
        }}>
          {['upload', 'mapping', 'importing'].map((s, index) => (
            <React.Fragment key={s}>
              {index > 0 && (
                <div style={{
                  width: '40px',
                  height: '2px',
                  background: step === s || (index === 1 && step === 'mapping') || step === 'importing' || step === 'complete' ? '#22c55e' : 'rgba(255, 255, 255, 0.2)'
                }} />
              )}
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: step === s || (s === 'upload' && (step === 'mapping' || step === 'importing' || step === 'complete')) || (s === 'mapping' && (step === 'importing' || step === 'complete')) ? '#22c55e' : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                {index + 1}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Upload Step */}
        {step === 'upload' && (
          <>
            {/* Account Selection */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                color: 'white',
                fontWeight: '500',
                marginBottom: '8px',
                fontSize: '14px'
              }}>
                Target Account (Optional)
              </label>
              <select
                value={selectedAccount || ''}
                onChange={(e) => setSelectedAccount(e.target.value ? Number(e.target.value) : undefined)}
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(17, 24, 39, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#22c55e'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
              >
                <option value="">All Accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} - {account.account_type}
                  </option>
                ))}
              </select>
            </div>

            {/* File Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? '#22c55e' : selectedFile ? 'rgba(34, 197, 94, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
                borderRadius: '12px',
                padding: '48px 32px',
                marginBottom: '24px',
                textAlign: 'center',
                transition: 'all 0.3s',
                background: isDragging ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                cursor: 'pointer'
              }}
            >
              <Upload style={{ height: '48px', width: '48px', color: '#64748b', margin: '0 auto 16px' }} />
              <p style={{ color: 'white', fontWeight: '500', marginBottom: '8px', fontSize: '16px' }}>
                Drop your CSV file here
              </p>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '16px' }}>
                or click to browse
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                id="csv-file-input"
                disabled={isLoading}
              />
              <label htmlFor="csv-file-input">
                <button
                  onClick={() => document.getElementById('csv-file-input')?.click()}
                  disabled={isLoading}
                  style={{
                    padding: '10px 20px',
                    background: '#22c55e',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#16a34a'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#22c55e'}
                >
                  Select File
                </button>
              </label>
            </div>
          </>
        )}

        {/* Mapping Step */}
        {step === 'mapping' && (
          <>
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <FileText style={{ height: '20px', width: '20px', color: '#22c55e' }} />
              <span style={{ color: '#22c55e', fontSize: '14px', fontWeight: '500' }}>
                {selectedFile?.name} ({csvHeaders.length} columns detected)
              </span>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '16px' }}>
              Map your CSV columns to transaction fields. Required fields are marked with *
            </p>

            {/* Column Mapping */}
            <div style={{ marginBottom: '24px' }}>
              {csvHeaders.map((header) => (
                <div key={header} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  gap: '16px',
                  marginBottom: '12px',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <div>
                    <p style={{ color: 'white', fontWeight: '500', fontSize: '14px', margin: 0 }}>
                      {header}
                    </p>
                    {csvPreview[0] && (
                      <p style={{ color: '#64748b', fontSize: '12px', margin: '4px 0 0 0' }}>
                        e.g., {csvPreview[0][csvHeaders.indexOf(header)]}
                      </p>
                    )}
                  </div>

                  <ArrowRight style={{ height: '20px', width: '20px', color: '#64748b' }} />

                  <select
                    value={columnMapping[header] || ''}
                    onChange={(e) => setColumnMapping({
                      ...columnMapping,
                      [header]: e.target.value
                    })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(17, 24, 39, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Skip this column</option>
                    <optgroup label="Required Fields">
                      {REQUIRED_FIELDS.map(field => (
                        <option key={field} value={field}>
                          {field.charAt(0).toUpperCase() + field.slice(1)} *
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Optional Fields">
                      {OPTIONAL_FIELDS.map(field => (
                        <option key={field} value={field}>
                          {field.charAt(0).toUpperCase() + field.slice(1)}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              ))}
            </div>

            {/* Preview */}
            {csvPreview.length > 0 && (
              <div style={{
                background: 'rgba(17, 24, 39, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px'
              }}>
                <h3 style={{ color: 'white', fontWeight: '600', fontSize: '14px', marginBottom: '12px' }}>
                  Preview (first {csvPreview.length} rows)
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {csvHeaders.map(header => (
                          <th key={header} style={{
                            color: '#94a3b8',
                            textAlign: 'left',
                            padding: '8px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
                          }}>
                            {header}
                            {columnMapping[header] && (
                              <div style={{ fontSize: '10px', color: '#22c55e', marginTop: '4px' }}>
                                → {columnMapping[header]}
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} style={{
                              color: '#cbd5e1',
                              padding: '8px',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                            }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setStep('upload');
                  setSelectedFile(null);
                  setCsvHeaders([]);
                  setCsvPreview([]);
                  setColumnMapping({});
                }}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: 'white',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
              >
                <ArrowLeft style={{ height: '16px', width: '16px' }} />
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={isLoading}
                style={{
                  flex: 2,
                  padding: '12px 16px',
                  background: isLoading ? 'rgba(34, 197, 94, 0.3)' : '#22c55e',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontWeight: '600',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.5 : 1,
                  transition: 'all 0.2s',
                  boxShadow: !isLoading ? '0 4px 12px rgba(34, 197, 94, 0.3)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = '#16a34a')}
                onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = '#22c55e')}
              >
                Import Transactions
                <ArrowRight style={{ height: '16px', width: '16px' }} />
              </button>
            </div>
          </>
        )}

        {/* Importing Step */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{
              width: '64px',
              height: '64px',
              border: '4px solid rgba(34, 197, 94, 0.3)',
              borderTopColor: '#22c55e',
              borderRadius: '50%',
              margin: '0 auto 24px',
              animation: 'spin 1s linear infinite'
            }} />
            <p style={{ color: 'white', fontSize: '18px', fontWeight: '500' }}>
              Importing your transactions...
            </p>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '8px' }}>
              Please wait while we process your CSV file
            </p>
          </div>
        )}

        {/* Complete Step */}
        {step === 'complete' && result && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: 'rgba(34, 197, 94, 0.2)',
              borderRadius: '50%',
              margin: '0 auto 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle style={{ height: '32px', width: '32px', color: '#22c55e' }} />
            </div>
            <h3 style={{ color: 'white', fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
              Import Successful!
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>
              Imported {result.imported} transactions
              {result.skipped > 0 && `, skipped ${result.skipped}`}
            </p>
          </div>
        )}

        {/* Error Messages */}
        {error && (
          <div style={{
            marginTop: '24px',
            padding: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#f87171'
          }}>
            <AlertCircle style={{ height: '20px', width: '20px' }} />
            <span style={{ fontSize: '14px' }}>{error}</span>
          </div>
        )}

        {/* CSS for spinner animation */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};
