/**
 * Recurring Transactions Page
 * Manage recurring transactions and detect patterns
 */

import React, { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { recurringService, RecurringExpense, RecurringPattern } from '../services/recurringService';
import {
  RefreshCw,
  Plus,
  Calendar,
  ToggleLeft,
  ToggleRight,
  Trash2,
  AlertCircle,
  TrendingUp,
  Eye,
  EyeOff,
} from 'lucide-react';

export const Recurring: React.FC = () => {
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code);

  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [detectedPatterns, setDetectedPatterns] = useState<RecurringPattern[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);

  useEffect(() => {
    loadRecurringExpenses();
  }, []);

  const loadRecurringExpenses = async () => {
    setIsLoading(true);
    try {
      const expenses = await recurringService.getRecurringExpenses();
      setRecurringExpenses(expenses);
    } catch (error) {
      console.error('Failed to load recurring expenses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDetectPatterns = async () => {
    setIsDetecting(true);
    try {
      const patterns = await recurringService.detectRecurringPatterns();
      setDetectedPatterns(patterns);
      setShowPatterns(true);
    } catch (error) {
      console.error('Failed to detect patterns:', error);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleToggleRecurring = async (id: number) => {
    try {
      await recurringService.toggleRecurringExpense(id);
      await loadRecurringExpenses();
    } catch (error) {
      console.error('Failed to toggle recurring expense:', error);
    }
  };

  const handleDeleteRecurring = async (id: number) => {
    if (!confirm('Are you sure you want to delete this recurring expense?')) return;

    try {
      await recurringService.deleteRecurringExpense(id);
      await loadRecurringExpenses();
    } catch (error) {
      console.error('Failed to delete recurring expense:', error);
    }
  };

  const handleCreateFromPattern = async (patternKey: string) => {
    try {
      await recurringService.createFromPattern(patternKey);
      await loadRecurringExpenses();
      setDetectedPatterns(detectedPatterns.filter((p) => p.pattern_key !== patternKey));
    } catch (error) {
      console.error('Failed to create from pattern:', error);
    }
  };

  const handleIgnorePattern = async (patternKey: string) => {
    try {
      await recurringService.ignorePattern(patternKey);
      setDetectedPatterns(detectedPatterns.filter((p) => p.pattern_key !== patternKey));
    } catch (error) {
      console.error('Failed to ignore pattern:', error);
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      daily: 'Every Day',
      weekly: 'Every Week',
      monthly: 'Every Month',
      yearly: 'Every Year',
    };
    return labels[frequency] || frequency;
  };

  const getFrequencyColor = (frequency: string) => {
    const colors: Record<string, string> = {
      daily: 'text-blue-400',
      weekly: 'text-green-400',
      monthly: 'text-purple-400',
      yearly: 'text-orange-400',
    };
    return colors[frequency] || 'text-gray-400';
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Recurring Transactions</h1>
            <p className="text-gray-400">Manage your recurring expenses and income</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleDetectPatterns}
              disabled={isDetecting}
            >
              <TrendingUp className={`h-5 w-5 mr-2 ${isDetecting ? 'animate-pulse' : ''}`} />
              {isDetecting ? 'Detecting...' : 'Detect Patterns'}
            </Button>
            <Button variant="primary">
              <Plus className="h-5 w-5 mr-2" />
              Add Recurring
            </Button>
          </div>
        </div>

        {/* Detected Patterns */}
        {showPatterns && detectedPatterns.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent" />
                <h2 className="text-xl font-bold text-white">Detected Patterns</h2>
                <span className="px-2 py-1 text-xs rounded-lg bg-accent/20 text-accent">
                  {detectedPatterns.length}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPatterns(false)}
              >
                Hide
              </Button>
            </div>

            <div className="space-y-3">
              {detectedPatterns.map((pattern, index) => (
                <div
                  key={index}
                  className="p-4 bg-background-darker rounded-xl border border-gray-800 hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-white font-semibold">{pattern.description}</h3>
                        <span className="px-2 py-1 text-xs rounded-lg bg-blue-500/20 text-blue-400">
                          {pattern.frequency}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Amount: </span>
                          <span className="text-white font-medium">
                            {branding.currencySymbol}{pattern.amount.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Occurrences: </span>
                          <span className="text-white font-medium">{pattern.occurrences}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Confidence: </span>
                          <span className="text-accent font-medium">
                            {(pattern.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleCreateFromPattern(pattern.pattern_key)}
                      >
                        Create Recurring
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleIgnorePattern(pattern.pattern_key)}
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Active Recurring Expenses */}
        <Card>
          <h2 className="text-xl font-bold text-white mb-6">Active Recurring</h2>

          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 text-gray-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Loading recurring expenses...</p>
            </div>
          ) : recurringExpenses.filter((r) => r.active).length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">No active recurring expenses</p>
              <Button variant="primary">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Recurring
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {recurringExpenses
                .filter((r) => r.active)
                .map((recurring) => (
                  <div
                    key={recurring.id}
                    className="p-4 bg-background-darker rounded-xl border border-gray-800 hover:border-gray-700 transition-all"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-semibold text-lg">
                            {recurring.description}
                          </h3>
                          <span className={`text-sm font-medium ${getFrequencyColor(recurring.frequency)}`}>
                            {getFrequencyLabel(recurring.frequency)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div>
                            <span className="text-gray-400">Amount: </span>
                            <span className="text-white font-medium text-lg">
                              {branding.currencySymbol}{recurring.amount.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Started: </span>
                            <span className="text-white">
                              {new Date(recurring.start_date).toLocaleDateString()}
                            </span>
                          </div>
                          {recurring.last_created && (
                            <div>
                              <span className="text-gray-400">Last Created: </span>
                              <span className="text-white">
                                {new Date(recurring.last_created).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleRecurring(recurring.id)}
                        >
                          <ToggleRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteRecurring(recurring.id)}
                          className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>

        {/* Inactive Recurring Expenses */}
        {recurringExpenses.filter((r) => !r.active).length > 0 && (
          <Card>
            <h2 className="text-xl font-bold text-white mb-6">Inactive Recurring</h2>

            <div className="space-y-3">
              {recurringExpenses
                .filter((r) => !r.active)
                .map((recurring) => (
                  <div
                    key={recurring.id}
                    className="p-4 bg-background-darker/50 rounded-xl border border-gray-800 opacity-60"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-semibold">{recurring.description}</h3>
                          <span className="px-2 py-1 text-xs rounded-lg bg-gray-500/20 text-gray-400">
                            Inactive
                          </span>
                        </div>
                        <div className="text-gray-400 text-sm">
                          {branding.currencySymbol}{recurring.amount.toFixed(2)} •{' '}
                          {getFrequencyLabel(recurring.frequency)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleRecurring(recurring.id)}
                        >
                          <ToggleLeft className="h-4 w-4 mr-2" />
                          Activate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteRecurring(recurring.id)}
                          className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
};
