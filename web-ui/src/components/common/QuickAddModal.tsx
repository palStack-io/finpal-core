/**
 * Quick Add Modal Component
 * Modal for quickly adding transactions, accounts, budgets, and categories
 */

import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { transactionService } from '../../services/transactionService';
import { accountService } from '../../services/accountService';
import { budgetService } from '../../services/budgetService';
import { categoryService } from '../../services/categoryService';
import { useToast } from '../../contexts/ToastContext';
import { useAuthStore } from '../../store/authStore';
import {
  X,
  DollarSign,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Wallet,
  Target,
  FolderOpen,
  Calendar,
  FileText,
  Plus,
  CheckCircle,
} from 'lucide-react';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'transaction' | 'account' | 'budget' | 'category';
type TransactionType = 'expense' | 'income' | 'transfer';

export const QuickAddModal: React.FC<QuickAddModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabType>('transaction');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addAnother, setAddAnother] = useState(false);

  // Transaction form state
  const [transactionType, setTransactionType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | ''>('');
  const [selectedAccount, setSelectedAccount] = useState<number | ''>('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);

  // Account form state
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('checking');
  const [accountBalance, setAccountBalance] = useState('');

  // Budget form state
  const [budgetName, setBudgetName] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCategory, setBudgetCategory] = useState<number | ''>('');
  const [budgetPeriod, setBudgetPeriod] = useState('monthly');

  // Category form state
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const [categoryColor, setCategoryColor] = useState('#10b981');

  // Data lists
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadData();
      // Set default account from user preferences
      if (user?.defaultAccount) {
        setSelectedAccount(user.defaultAccount);
      }
      if (user?.defaultCategory) {
        setSelectedCategory(user.defaultCategory);
      }
    }
  }, [isOpen]);

  // Keyboard shortcut (Ctrl+N or Cmd+N)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (!isOpen) {
          // This would need to be triggered from parent
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [accountsData, categoriesData] = await Promise.all([
        accountService.getAccounts(),
        categoryService.getCategories(),
      ]);
      setAccounts(accountsData);
      setCategories(categoriesData);
    } catch (error: any) {
      console.error('Failed to load data:', error);
    }
  };

  const resetTransactionForm = () => {
    setAmount('');
    setDescription('');
    setTransactionDate(new Date().toISOString().split('T')[0]);
    if (!user?.defaultCategory) setSelectedCategory('');
    if (!user?.defaultAccount) setSelectedAccount('');
  };

  const resetAccountForm = () => {
    setAccountName('');
    setAccountType('checking');
    setAccountBalance('');
  };

  const resetBudgetForm = () => {
    setBudgetName('');
    setBudgetAmount('');
    setBudgetCategory('');
    setBudgetPeriod('monthly');
  };

  const resetCategoryForm = () => {
    setCategoryName('');
    setCategoryType('expense');
    setCategoryColor('#10b981');
  };

  const handleAddTransaction = async () => {
    if (!amount || !description || !selectedAccount) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await transactionService.createTransaction({
        amount: parseFloat(amount),
        description,
        transaction_type: transactionType,
        transaction_date: transactionDate,
        account_id: selectedAccount as number,
        category_id: selectedCategory as number || undefined,
        currency_code: user?.default_currency_code || 'USD',
      });

      showToast('Transaction added successfully', 'success');
      resetTransactionForm();

      if (!addAnother) {
        onClose();
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to add transaction', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAccount = async () => {
    if (!accountName) {
      showToast('Please enter an account name', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await accountService.createAccount({
        name: accountName,
        account_type: accountType,
        balance: accountBalance ? parseFloat(accountBalance) : 0,
        currency_code: user?.default_currency_code || 'USD',
      });

      showToast('Account created successfully', 'success');
      resetAccountForm();
      loadData();

      if (!addAnother) {
        onClose();
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to create account', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddBudget = async () => {
    if (!budgetName || !budgetAmount || !budgetCategory) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await budgetService.createBudget({
        name: budgetName,
        amount: parseFloat(budgetAmount),
        category_id: budgetCategory as number,
        period: budgetPeriod,
      });

      showToast('Budget created successfully', 'success');
      resetBudgetForm();

      if (!addAnother) {
        onClose();
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to create budget', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCategory = async () => {
    if (!categoryName) {
      showToast('Please enter a category name', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await categoryService.createCategory({
        name: categoryName,
        type: categoryType,
        color: categoryColor,
      });

      showToast('Category created successfully', 'success');
      resetCategoryForm();
      loadData();

      if (!addAnother) {
        onClose();
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to create category', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'transaction' as TabType, label: 'Transaction', icon: <DollarSign className="h-4 w-4" /> },
    { id: 'account' as TabType, label: 'Account', icon: <Wallet className="h-4 w-4" /> },
    { id: 'budget' as TabType, label: 'Budget', icon: <Target className="h-4 w-4" /> },
    { id: 'category' as TabType, label: 'Category', icon: <FolderOpen className="h-4 w-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background-dark border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Plus className="h-6 w-6 text-primary" />
            Quick Add
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-background-darker rounded-lg transition-colors"
          >
            <X className="h-6 w-6 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-6 pt-4 border-b border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 font-medium transition-all rounded-t-lg
                ${activeTab === tab.id
                  ? 'text-white bg-background-darker border-b-2 border-primary'
                  : 'text-gray-400 hover:text-white'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Transaction Tab */}
          {activeTab === 'transaction' && (
            <div className="space-y-4">
              {/* Type Toggle */}
              <div>
                <label className="block text-white font-medium mb-2">Type</label>
                <div className="flex gap-2">
                  {(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setTransactionType(type)}
                      className={`
                        flex-1 px-4 py-3 rounded-xl font-medium transition-all
                        ${transactionType === type
                          ? 'bg-primary text-white shadow-lg'
                          : 'bg-background-darker text-gray-400 hover:text-white border border-gray-800'
                        }
                      `}
                    >
                      {type === 'expense' && <TrendingDown className="inline w-4 h-4 mr-2" />}
                      {type === 'income' && <TrendingUp className="inline w-4 h-4 mr-2" />}
                      {type === 'transfer' && <RefreshCw className="inline w-4 h-4 mr-2" />}
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-white font-medium mb-2">Amount *</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-background-darker border border-gray-800 rounded-xl text-white text-2xl font-bold placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-white font-medium mb-2">Description *</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                  placeholder="What was this for?"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-white font-medium mb-2">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">Select category...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Account */}
              <div>
                <label className="block text-white font-medium mb-2">Account *</label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">Select account...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (${acc.balance?.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-white font-medium mb-2">Date</label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
          )}

          {/* Account Tab */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              <div>
                <label className="block text-white font-medium mb-2">Account Name *</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                  placeholder="e.g., Chase Checking"
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Account Type</label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="investment">Investment</option>
                </select>
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Initial Balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={accountBalance}
                  onChange={(e) => setAccountBalance(e.target.value)}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          {/* Budget Tab */}
          {activeTab === 'budget' && (
            <div className="space-y-4">
              <div>
                <label className="block text-white font-medium mb-2">Budget Name *</label>
                <input
                  type="text"
                  value={budgetName}
                  onChange={(e) => setBudgetName(e.target.value)}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                  placeholder="e.g., Monthly Groceries"
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Category *</label>
                <select
                  value={budgetCategory}
                  onChange={(e) => setBudgetCategory(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">Select category...</option>
                  {categories.filter(c => c.type === 'expense').map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Period</label>
                <select
                  value={budgetPeriod}
                  onChange={(e) => setBudgetPeriod(e.target.value)}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
          )}

          {/* Category Tab */}
          {activeTab === 'category' && (
            <div className="space-y-4">
              <div>
                <label className="block text-white font-medium mb-2">Category Name *</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                  placeholder="e.g., Groceries"
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCategoryType('expense')}
                    className={`
                      flex-1 px-4 py-3 rounded-xl font-medium transition-all
                      ${categoryType === 'expense'
                        ? 'bg-red-500 text-white shadow-lg'
                        : 'bg-background-darker text-gray-400 hover:text-white border border-gray-800'
                      }
                    `}
                  >
                    Expense
                  </button>
                  <button
                    onClick={() => setCategoryType('income')}
                    className={`
                      flex-1 px-4 py-3 rounded-xl font-medium transition-all
                      ${categoryType === 'income'
                        ? 'bg-green-500 text-white shadow-lg'
                        : 'bg-background-darker text-gray-400 hover:text-white border border-gray-800'
                      }
                    `}
                  >
                    Income
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={categoryColor}
                    onChange={(e) => setCategoryColor(e.target.value)}
                    className="h-12 w-20 bg-background-darker border border-gray-800 rounded-xl cursor-pointer"
                  />
                  <input
                    type="text"
                    value={categoryColor}
                    onChange={(e) => setCategoryColor(e.target.value)}
                    className="flex-1 px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
                    placeholder="#10b981"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 bg-background-darker">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={addAnother}
                onChange={(e) => setAddAnother(e.target.checked)}
                className="h-4 w-4 rounded border-gray-800 text-primary focus:ring-primary"
              />
              <span className="text-sm">Add another after saving</span>
            </label>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (activeTab === 'transaction') handleAddTransaction();
                  else if (activeTab === 'account') handleAddAccount();
                  else if (activeTab === 'budget') handleAddBudget();
                  else if (activeTab === 'category') handleAddCategory();
                }}
                isLoading={isSubmitting}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Save {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
