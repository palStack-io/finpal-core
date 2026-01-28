/**
 * Add Holding Modal
 * Modal for adding a new investment holding
 */

import React, { useState, useEffect } from 'react';
import { X, Search, AlertCircle, TrendingUp } from 'lucide-react';
import { investmentService } from '../../services/api/investments';
import { useToast } from '../../contexts/ToastContext';

interface Portfolio {
  id: number;
  name: string;
  description: string;
}

interface AddHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  portfolios: Portfolio[];
}

export const AddHoldingModal: React.FC<AddHoldingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  portfolios
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState<'search' | 'details'>('search');
  const [symbol, setSymbol] = useState('');
  const [stockData, setStockData] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [shares, setShares] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (portfolios.length > 0 && !portfolioId) {
      setPortfolioId(portfolios[0].id);
    }
  }, [portfolios, portfolioId]);

  const handleSearch = async () => {
    if (!symbol.trim()) {
      setError('Please enter a stock symbol');
      return;
    }

    try {
      setIsSearching(true);
      setError(null);

      const response = await investmentService.getQuote(symbol.toUpperCase());

      if (response.success) {
        setStockData(response.quote);
        setPurchasePrice(response.quote.price?.toString() || '');
        setStep('details');
      } else {
        setError(response.error || 'Stock not found. Please check the symbol and try again.');
      }
    } catch (err: any) {
      console.error('Failed to search stock:', err);
      const errorMsg = err.response?.data?.error || 'Failed to find stock. Please try again.';

      // Check if it's a rate limit error
      if (errorMsg.includes('Stock not found') || err.response?.status === 404) {
        setError('Unable to fetch stock data at the moment. Yahoo Finance may be rate limiting requests. You can still add the holding manually by entering the details.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!portfolioId) {
      setError('Please select a portfolio');
      return;
    }

    if (!shares || parseFloat(shares) <= 0) {
      setError('Please enter a valid number of shares');
      return;
    }

    if (!purchasePrice || parseFloat(purchasePrice) <= 0) {
      setError('Please enter a valid purchase price');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await investmentService.createHolding({
        portfolio_id: portfolioId,
        symbol: symbol.toUpperCase(),
        shares: parseFloat(shares),
        purchase_price: parseFloat(purchasePrice),
        purchase_date: purchaseDate,
        notes: notes
      });

      showToast('Holding added successfully', 'success');
      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Failed to add holding:', err);
      setError(err.response?.data?.error || 'Failed to add holding. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setStep('search');
    setSymbol('');
    setStockData(null);
    setShares('');
    setPurchasePrice('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setError(null);
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
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'rgba(17, 24, 39, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ color: 'white', fontSize: '24px', fontWeight: '700', margin: 0 }}>
            Add New Holding
          </h2>
          <button
            onClick={handleClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
          >
            <X size={20} style={{ color: 'white' }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {/* Error Message */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <AlertCircle size={20} style={{ color: '#ef4444' }} />
              <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Step 1: Search */}
          {step === 'search' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  color: '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px'
                }}>
                  Stock Symbol
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="e.g., AAPL, MSFT, GOOGL"
                    disabled={isSearching}
                    style={{
                      width: '100%',
                      padding: '12px 40px 12px 12px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '16px',
                      outline: 'none'
                    }}
                  />
                  <Search
                    size={20}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#64748b'
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleSearch}
                disabled={isSearching || !symbol.trim()}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: isSearching || !symbol.trim() ? '#166534' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: isSearching || !symbol.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSearching || !symbol.trim() ? 0.6 : 1
                }}
              >
                {isSearching ? 'Searching...' : 'Search Stock'}
              </button>

              <div style={{
                textAlign: 'center',
                margin: '16px 0',
                color: '#64748b',
                fontSize: '14px'
              }}>
                or
              </div>

              <button
                onClick={() => {
                  if (!symbol.trim()) {
                    setError('Please enter a stock symbol');
                    return;
                  }
                  setStockData({ symbol: symbol.toUpperCase(), name: '', price: 0 });
                  setStep('details');
                }}
                disabled={isSearching || !symbol.trim()}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: isSearching || !symbol.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSearching || !symbol.trim() ? 0.6 : 1
                }}
              >
                Enter Details Manually
              </button>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 'details' && stockData && (
            <div>
              {/* Stock Info */}
              <div style={{
                padding: '16px',
                background: 'rgba(21, 128, 61, 0.1)',
                border: '1px solid rgba(21, 128, 61, 0.3)',
                borderRadius: '12px',
                marginBottom: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <TrendingUp size={24} style={{ color: '#15803d' }} />
                  <div>
                    <h3 style={{ color: 'white', fontSize: '20px', fontWeight: '700', margin: 0 }}>
                      {stockData.symbol}
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                      {stockData.name}
                    </p>
                  </div>
                </div>
                {stockData.price && (
                  <div style={{ color: '#86efac', fontSize: '24px', fontWeight: '700' }}>
                    ${stockData.price.toFixed(2)}
                  </div>
                )}
              </div>

              {/* Portfolio Selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  color: '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px'
                }}>
                  Portfolio
                </label>
                <select
                  value={portfolioId || ''}
                  onChange={(e) => setPortfolioId(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                >
                  {portfolios.map(p => (
                    <option key={p.id} value={p.id} style={{ background: '#1e293b' }}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shares */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  color: '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px'
                }}>
                  Number of Shares
                </label>
                <input
                  type="number"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Purchase Price */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  color: '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px'
                }}>
                  Purchase Price per Share ($)
                </label>
                <input
                  type="number"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Purchase Date */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  color: '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px'
                }}>
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  color: '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px'
                }}>
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this investment..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setStep('search')}
                  disabled={isSaving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.5 : 1
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  style={{
                    flex: 2,
                    padding: '12px',
                    background: isSaving ? '#166534' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.6 : 1
                  }}
                >
                  {isSaving ? 'Adding...' : 'Add Holding'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
