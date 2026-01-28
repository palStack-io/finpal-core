/**
 * Stock Detail Modal
 * Shows detailed information about a specific stock holding
 */

import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, DollarSign, Calendar, Briefcase, Activity, Edit2, Save } from 'lucide-react';
import { investmentService } from '../../services/api/investments';
import { useToast } from '../../contexts/ToastContext';

interface Holding {
  id: number;
  portfolio_id: number;
  symbol: string;
  name: string;
  shares: number;
  purchase_price: number;
  current_price: number;
  purchase_date: string;
  notes: string;
  sector: string;
  industry: string;
  last_update: string;
}

interface StockDetailModalProps {
  holding: Holding;
  onClose: () => void;
  onUpdate?: () => void;
}

export const StockDetailModal: React.FC<StockDetailModalProps> = ({ holding, onClose, onUpdate }) => {
  const { showToast } = useToast();
  const [quoteData, setQuoteData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState({
    shares: holding.shares,
    purchase_price: holding.purchase_price,
    notes: holding.notes || ''
  });

  useEffect(() => {
    loadQuoteData();
  }, [holding.symbol]);

  const loadQuoteData = async () => {
    try {
      setIsLoading(true);
      const response = await investmentService.getQuote(holding.symbol);
      if (response.success) {
        setQuoteData(response.quote);
      }
    } catch (error) {
      console.error('Failed to load quote data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await investmentService.updateHolding(holding.id, {
        shares: editData.shares,
        purchase_price: editData.purchase_price,
        notes: editData.notes
      });

      showToast('Stock holding updated successfully', 'success');
      setIsEditing(false);

      // Refresh the parent component
      if (onUpdate) {
        onUpdate();
      }

      // Update local holding data
      holding.shares = editData.shares;
      holding.purchase_price = editData.purchase_price;
      holding.notes = editData.notes;
    } catch (error: any) {
      console.error('Failed to update holding:', error);
      showToast('Failed to update holding', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditData({
      shares: holding.shares,
      purchase_price: holding.purchase_price,
      notes: holding.notes || ''
    });
    setIsEditing(false);
  };

  // Calculate metrics (use editData if editing, otherwise use holding)
  const shares = isEditing ? editData.shares : holding.shares;
  const purchasePrice = isEditing ? editData.purchase_price : holding.purchase_price;
  const costBasis = purchasePrice * shares;
  const marketValue = holding.current_price * shares;
  const totalGain = marketValue - costBasis;
  const gainPercent = costBasis > 0 ? (totalGain / costBasis) * 100 : 0;
  const dayChange = quoteData?.change || 0;
  const dayChangePercent = quoteData?.change_percent || 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 999,
          animation: 'fadeIn 0.3s ease-out'
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90%',
          maxWidth: '900px',
          maxHeight: '90vh',
          background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.3s ease-out',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(17, 24, 39, 0.8)',
            backdropFilter: 'blur(12px)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h2
                style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  background: 'linear-gradient(to right, #86efac, #fbbf24)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  margin: 0
                }}
              >
                {holding.symbol}
              </h2>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 12px',
                  background: dayChange >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${dayChange >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  borderRadius: '8px'
                }}
              >
                {dayChange >= 0 ? <TrendingUp size={16} style={{ color: '#22c55e' }} /> : <TrendingDown size={16} style={{ color: '#ef4444' }} />}
                <span style={{ color: dayChange >= 0 ? '#22c55e' : '#ef4444', fontSize: '14px', fontWeight: '600' }}>
                  {formatPercent(dayChangePercent)}
                </span>
              </div>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '16px', margin: 0 }}>{holding.name}</p>
            {holding.sector && (
              <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
                {holding.sector} • {holding.industry}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Edit/Save Button */}
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  padding: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <Edit2 size={20} style={{ color: '#22c55e' }} />
              </button>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    background: isSaving ? 'rgba(34, 197, 94, 0.05)' : 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '8px',
                    padding: '8px',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    opacity: isSaving ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaving) {
                      e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSaving ? 'rgba(34, 197, 94, 0.05)' : 'rgba(34, 197, 94, 0.1)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <Save size={20} style={{ color: '#22c55e' }} />
                </button>
                <button
                  onClick={handleCancelEdit}
                  style={{
                    background: 'rgba(148, 163, 184, 0.1)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    borderRadius: '8px',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(148, 163, 184, 0.2)';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <X size={20} style={{ color: '#94a3b8' }} />
                </button>
              </>
            )}
            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <X size={20} style={{ color: '#ef4444' }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px'
          }}
        >
          {/* Current Price & Performance */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {/* Current Price */}
            <div
              style={{
                padding: '20px',
                background: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <DollarSign size={16} style={{ color: '#fbbf24' }} />
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>Current Price</span>
              </div>
              <div style={{ color: 'white', fontSize: '24px', fontWeight: '700' }}>
                {formatCurrency(holding.current_price)}
              </div>
              <div style={{ color: dayChange >= 0 ? '#22c55e' : '#ef4444', fontSize: '14px', marginTop: '4px' }}>
                {dayChange >= 0 ? '+' : ''}{formatCurrency(dayChange)} today
              </div>
            </div>

            {/* Purchase Price */}
            <div
              style={{
                padding: '20px',
                background: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Calendar size={16} style={{ color: '#3b82f6' }} />
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>Purchase Price</span>
              </div>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editData.purchase_price}
                  onChange={(e) => setEditData({ ...editData, purchase_price: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '24px',
                    fontWeight: '700',
                    outline: 'none'
                  }}
                  onFocus={(e) => { e.currentTarget.style.border = '1px solid rgba(34, 197, 94, 0.5)'; }}
                  onBlur={(e) => { e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.1)'; }}
                />
              ) : (
                <div style={{ color: 'white', fontSize: '24px', fontWeight: '700' }}>
                  {formatCurrency(purchasePrice)}
                </div>
              )}
              <div style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
                {formatDate(holding.purchase_date)}
              </div>
            </div>

            {/* Shares Owned */}
            <div
              style={{
                padding: '20px',
                background: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Briefcase size={16} style={{ color: '#a855f7' }} />
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>Shares Owned</span>
              </div>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editData.shares}
                  onChange={(e) => setEditData({ ...editData, shares: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '24px',
                    fontWeight: '700',
                    outline: 'none'
                  }}
                  onFocus={(e) => { e.currentTarget.style.border = '1px solid rgba(34, 197, 94, 0.5)'; }}
                  onBlur={(e) => { e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.1)'; }}
                />
              ) : (
                <div style={{ color: 'white', fontSize: '24px', fontWeight: '700' }}>
                  {shares.toFixed(2)}
                </div>
              )}
              <div style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
                shares
              </div>
            </div>
          </div>

          {/* Position Summary */}
          <div
            style={{
              padding: '24px',
              background: 'rgba(17, 24, 39, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              marginBottom: '24px'
            }}
          >
            <h3 style={{ color: 'white', fontSize: '18px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={20} style={{ color: '#fbbf24' }} />
              Position Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>Cost Basis</div>
                <div style={{ color: 'white', fontSize: '20px', fontWeight: '600' }}>
                  {formatCurrency(costBasis)}
                </div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>Market Value</div>
                <div style={{ color: 'white', fontSize: '20px', fontWeight: '600' }}>
                  {formatCurrency(marketValue)}
                </div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>Total Gain/Loss</div>
                <div style={{ color: totalGain >= 0 ? '#22c55e' : '#ef4444', fontSize: '20px', fontWeight: '600' }}>
                  {formatCurrency(totalGain)}
                </div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>Return</div>
                <div style={{ color: gainPercent >= 0 ? '#22c55e' : '#ef4444', fontSize: '20px', fontWeight: '600' }}>
                  {formatPercent(gainPercent)}
                </div>
              </div>
            </div>
          </div>

          {/* Stock Info */}
          {quoteData && (
            <div
              style={{
                padding: '24px',
                background: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                marginBottom: '24px'
              }}
            >
              <h3 style={{ color: 'white', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
                Market Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                {quoteData.market_cap && (
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>Market Cap</div>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                      {quoteData.market_cap}
                    </div>
                  </div>
                )}
                {quoteData.pe_ratio && (
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>P/E Ratio</div>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                      {quoteData.pe_ratio}
                    </div>
                  </div>
                )}
                {quoteData.dividend_yield && (
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>Dividend Yield</div>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                      {quoteData.dividend_yield}%
                    </div>
                  </div>
                )}
                {quoteData.day_high && (
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>Day High</div>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                      {formatCurrency(quoteData.day_high)}
                    </div>
                  </div>
                )}
                {quoteData.day_low && (
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>Day Low</div>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                      {formatCurrency(quoteData.day_low)}
                    </div>
                  </div>
                )}
                {quoteData.week_52_high && (
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>52-Week High</div>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                      {formatCurrency(quoteData.week_52_high)}
                    </div>
                  </div>
                )}
                {quoteData.week_52_low && (
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>52-Week Low</div>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                      {formatCurrency(quoteData.week_52_low)}
                    </div>
                  </div>
                )}
                {quoteData.volume && (
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '4px' }}>Volume</div>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                      {new Intl.NumberFormat('en-US', { notation: 'compact' }).format(quoteData.volume)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {(holding.notes || isEditing) && (
            <div
              style={{
                padding: '20px',
                background: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px'
              }}
            >
              <h3 style={{ color: 'white', fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Notes</h3>
              {isEditing ? (
                <textarea
                  value={editData.notes}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  placeholder="Add notes about this investment..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#94a3b8',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                  onFocus={(e) => { e.currentTarget.style.border = '1px solid rgba(34, 197, 94, 0.5)'; }}
                  onBlur={(e) => { e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.1)'; }}
                />
              ) : (
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
                  {holding.notes}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideIn {
          from {
            transform: translate(-50%, -45%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, -50%);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
};
