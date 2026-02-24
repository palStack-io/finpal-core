/**
 * Investments Page
 * Track and manage investment portfolios
 */

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Package,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { investmentService } from '../services/api/investments';
import { useToast } from '../contexts/ToastContext';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { AddHoldingModal } from '../components/investment/AddHoldingModal';
import { StockDetailModal } from '../components/investment/StockDetailModal';

interface Portfolio {
  id: number;
  name: string;
  description: string;
  account_id?: number;
  created_at: string;
  updated_at: string;
}

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

export const Investments: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [portfoliosResponse, holdingsResponse] = await Promise.all([
        investmentService.getPortfolios(),
        investmentService.getHoldings()
      ]);

      setPortfolios(portfoliosResponse.portfolios || []);
      setHoldings(holdingsResponse.holdings || []);
    } catch (error: any) {
      console.error('Failed to load investment data:', error);
      showToast('Failed to load investment data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const ensurePortfolioExists = async () => {
    if (portfolios.length === 0) {
      try {
        const createResponse = await investmentService.createPortfolio({
          name: 'My Portfolio',
          description: 'Default investment portfolio'
        });
        if (createResponse.success) {
          setPortfolios([createResponse.portfolio]);
          return true;
        }
      } catch (err) {
        console.error('Failed to create default portfolio:', err);
        showToast('Failed to create portfolio. Please try again.', 'error');
        return false;
      }
    }
    return true;
  };

  const handleOpenAddModal = async () => {
    const hasPortfolio = await ensurePortfolioExists();
    if (hasPortfolio) {
      setShowAddModal(true);
    }
  };

  const refreshPrices = async () => {
    try {
      setIsRefreshing(true);
      const response = await investmentService.getHoldings();
      setHoldings(response.holdings || []);
      showToast('Prices updated successfully', 'success');
    } catch (error: any) {
      console.error('Failed to refresh prices:', error);
      showToast('Failed to refresh prices', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate portfolio statistics
  const calculateStats = () => {
    const filteredHoldings = selectedPortfolio
      ? holdings.filter(h => h.portfolio_id === selectedPortfolio)
      : holdings;

    const totalValue = filteredHoldings.reduce((sum, h) => sum + (h.current_price * h.shares), 0);
    const totalCost = filteredHoldings.reduce((sum, h) => sum + (h.purchase_price * h.shares), 0);
    const totalGain = totalValue - totalCost;
    const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    return {
      totalValue,
      totalCost,
      totalGain,
      totalGainPercent,
      holdingsCount: filteredHoldings.length
    };
  };

  const stats = calculateStats();

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

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: `linear-gradient(to bottom, var(--bg-primary), var(--bg-secondary))`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '18px' }}>Loading investment data...</div>
      </div>
    );
  }

  return (
    <>
      <div style={{ minHeight: '100vh', padding: '24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                  Investments
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Track and manage your investment portfolio</p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handleOpenAddModal}
                  style={{
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    transition: 'transform 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <Plus size={16} />
                  Add Holding
                </button>
                <button
                  onClick={refreshPrices}
                  disabled={isRefreshing}
                  style={{
                    padding: '10px 16px',
                    background: 'rgba(21, 128, 61, 0.2)',
                    border: '1px solid rgba(21, 128, 61, 0.5)',
                    borderRadius: '8px',
                    color: '#86efac',
                    cursor: isRefreshing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: isRefreshing ? 0.6 : 1,
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={(e) => !isRefreshing && (e.currentTarget.style.background = 'rgba(21, 128, 61, 0.3)')}
                  onMouseLeave={(e) => !isRefreshing && (e.currentTarget.style.background = 'rgba(21, 128, 61, 0.2)')}
                >
                  <RefreshCw size={16} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
                </button>
              </div>
            </div>
          </div>

          {/* Portfolio Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}>
            {/* Total Value */}
            <div style={{
              padding: '24px',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ padding: '8px', background: 'rgba(21, 128, 61, 0.2)', borderRadius: '8px' }}>
                  <DollarSign size={20} style={{ color: '#15803d' }} />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Total Value</span>
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(stats.totalValue)}
              </div>
            </div>

            {/* Total Gain/Loss */}
            <div style={{
              padding: '24px',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  padding: '8px',
                  background: stats.totalGain >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  borderRadius: '8px'
                }}>
                  {stats.totalGain >= 0 ? (
                    <TrendingUp size={20} style={{ color: '#22c55e' }} />
                  ) : (
                    <TrendingDown size={20} style={{ color: '#ef4444' }} />
                  )}
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Total Gain/Loss</span>
              </div>
              <div style={{
                color: stats.totalGain >= 0 ? '#22c55e' : '#ef4444',
                fontSize: '28px',
                fontWeight: '700'
              }}>
                {formatCurrency(stats.totalGain)}
              </div>
              <div style={{
                color: stats.totalGain >= 0 ? '#22c55e' : '#ef4444',
                fontSize: '14px',
                marginTop: '4px'
              }}>
                {formatPercent(stats.totalGainPercent)}
              </div>
            </div>

            {/* Total Cost */}
            <div style={{
              padding: '24px',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ padding: '8px', background: 'rgba(251, 191, 36, 0.2)', borderRadius: '8px' }}>
                  <Package size={20} style={{ color: '#fbbf24' }} />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Total Cost</span>
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(stats.totalCost)}
              </div>
            </div>

            {/* Holdings Count */}
            <div style={{
              padding: '24px',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
                  <BarChart3 size={20} style={{ color: '#3b82f6' }} />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Holdings</span>
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '28px', fontWeight: '700' }}>
                {stats.holdingsCount}
              </div>
            </div>
          </div>

          {/* Holdings Table */}
          {holdings.length > 0 ? (
            <div style={{
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)' }}>
                <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: '600' }}>
                  Your Holdings
                </h2>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>Symbol</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>Name</th>
                      <th style={{ padding: '16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>Shares</th>
                      <th style={{ padding: '16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>Avg Cost</th>
                      <th style={{ padding: '16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>Current Price</th>
                      <th style={{ padding: '16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>Market Value</th>
                      <th style={{ padding: '16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>Gain/Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((holding) => {
                      const marketValue = holding.current_price * holding.shares;
                      const costBasis = holding.purchase_price * holding.shares;
                      const gain = marketValue - costBasis;
                      const gainPercent = costBasis > 0 ? (gain / costBasis) * 100 : 0;

                      return (
                        <tr
                          key={holding.id}
                          onClick={() => setSelectedHolding(holding)}
                          style={{
                            borderBottom: '1px solid var(--surface-hover)',
                            transition: 'background 0.2s',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--table-row-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '16px' }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '15px' }}>{holding.symbol}</span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                                {holding.name || holding.symbol}
                              </div>
                              {holding.sector && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
                                  {holding.sector}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '14px' }}>
                            {holding.shares.toFixed(2)}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '14px' }}>
                            {formatCurrency(holding.purchase_price)}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '14px' }}>
                            {formatCurrency(holding.current_price)}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
                            {formatCurrency(marketValue)}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right' }}>
                            <div style={{ color: gain >= 0 ? '#22c55e' : '#ef4444', fontSize: '14px', fontWeight: '600' }}>
                              {formatCurrency(gain)}
                            </div>
                            <div style={{ color: gain >= 0 ? '#22c55e' : '#ef4444', fontSize: '12px', marginTop: '2px' }}>
                              {formatPercent(gainPercent)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '64px 24px',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <div style={{
                display: 'inline-flex',
                padding: '16px',
                background: 'rgba(21, 128, 61, 0.2)',
                borderRadius: '50%',
                marginBottom: '16px'
              }}>
                <LineChart size={32} style={{ color: '#15803d' }} />
              </div>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                No Holdings Yet
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                Start tracking your investments by adding your first holding
              </p>
              <button
                onClick={handleOpenAddModal}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <Plus size={18} />
                Add Your First Holding
              </button>
            </div>
          )}

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>

      {/* Add Holding Modal */}
      <AddHoldingModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadData}
        portfolios={portfolios}
      />

      {/* Stock Detail Modal */}
      {selectedHolding && (
        <StockDetailModal
          holding={selectedHolding}
          onClose={() => setSelectedHolding(null)}
          onUpdate={loadData}
        />
      )}
    </>
  );
};
