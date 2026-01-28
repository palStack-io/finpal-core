/**
 * Recurring Settings Component
 * Manage recurring transactions from settings
 */

import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { recurringService, RecurringExpense } from '../../services/recurringService';
import { useToast } from '../../contexts/ToastContext';
import {
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

export const RecurringSettings: React.FC = () => {
  const { showToast } = useToast();
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadRecurring();
  }, []);

  const loadRecurring = async () => {
    setIsLoading(true);
    try {
      const data = await recurringService.getRecurringExpenses();
      setRecurring(data);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to load recurring transactions', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    try {
      await recurringService.updateRecurringExpense(id, { active: !currentActive });
      showToast(
        `Recurring transaction ${!currentActive ? 'activated' : 'deactivated'}`,
        'success'
      );
      loadRecurring();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update recurring transaction', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this recurring transaction?')) return;

    try {
      await recurringService.deleteRecurringExpense(id);
      showToast('Recurring transaction deleted', 'success');
      loadRecurring();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to delete recurring transaction', 'error');
    }
  };

  const handleDetectPatterns = async () => {
    try {
      const detected = await recurringService.detectRecurringPatterns();
      if (detected.length > 0) {
        showToast(`Found ${detected.length} potential recurring patterns`, 'success');
      } else {
        showToast('No recurring patterns detected', 'info');
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to detect patterns', 'error');
    }
  };

  const getFrequencyBadge = (frequency: string) => {
    const colors = {
      daily: 'bg-blue-500/10 text-blue-500',
      weekly: 'bg-green-500/10 text-green-500',
      monthly: 'bg-purple-500/10 text-purple-500',
      yearly: 'bg-orange-500/10 text-orange-500',
    };

    return (
      <span className={`px-2 py-1 text-xs rounded ${colors[frequency as keyof typeof colors] || 'bg-gray-500/10 text-gray-400'}`}>
        {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
      </span>
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'income':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'expense':
        return <TrendingDown className="w-5 h-5 text-red-500" />;
      default:
        return <RefreshCw className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Recurring Transactions</h2>
          <p className="text-gray-400 mt-1">
            Manage your recurring transactions and detect patterns
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleDetectPatterns}>
            <Clock className="h-4 w-4 mr-2" />
            Detect Patterns
          </Button>
          <Button variant="primary" onClick={() => (window.location.href = '/transactions')}>
            <Plus className="h-4 w-4 mr-2" />
            Create New
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <RefreshCw className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Total Recurring</p>
              <p className="text-2xl font-bold text-white">{recurring.length}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-500/10 rounded-xl">
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Active</p>
              <p className="text-2xl font-bold text-white">
                {recurring.filter((r) => r.active).length}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gray-500/10 rounded-xl">
              <XCircle className="w-6 h-6 text-gray-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Inactive</p>
              <p className="text-2xl font-bold text-white">
                {recurring.filter((r) => !r.active).length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Recurring List */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">All Recurring Transactions</h3>
          <Button variant="outline" size="sm" onClick={loadRecurring} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-gray-400 mt-4">Loading recurring transactions...</p>
          </div>
        ) : recurring.length > 0 ? (
          <div className="space-y-3">
            {recurring.map((item) => (
              <div
                key={item.id}
                className={`p-4 border rounded-xl transition-all ${
                  item.active
                    ? 'bg-background-darker border-gray-800'
                    : 'bg-background-darker/50 border-gray-800/50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {getTypeIcon(item.transaction_type)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-semibold">{item.description}</h4>
                        {getFrequencyBadge(item.frequency)}
                        {item.active ? (
                          <span className="px-2 py-1 bg-green-500/10 text-green-500 text-xs rounded flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-500/10 text-gray-400 text-xs rounded flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          ${item.amount.toFixed(2)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Starts: {new Date(item.start_date).toLocaleDateString()}
                        </span>
                        {item.end_date && (
                          <span className="flex items-center gap-1">
                            Ends: {new Date(item.end_date).toLocaleDateString()}
                          </span>
                        )}
                        {item.last_created && (
                          <span className="flex items-center gap-1">
                            Last: {new Date(item.last_created).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.active}
                        onChange={() => handleToggleActive(item.id, item.active)}
                        className="sr-only"
                      />
                      <div
                        className={`w-12 h-6 rounded-full transition-colors ${
                          item.active ? 'bg-primary' : 'bg-gray-700'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform m-0.5 ${
                            item.active ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </label>

                    <Button variant="outline" size="sm" onClick={() => {}}>
                      <Edit className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                      className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <RefreshCw className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg mb-2">No recurring transactions yet</p>
            <p className="text-gray-500 mb-6">
              Create recurring transactions to automate your financial tracking
            </p>
            <Button variant="primary" onClick={() => (window.location.href = '/transactions')}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Recurring Transaction
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
