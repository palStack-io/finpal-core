import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Users,
  DollarSign,
  Calendar,
  Settings,
  UserPlus,
  X,
  Mail,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import {
  groupService,
  type Group,
  type GroupExpense,
  type GroupBalance,
  type CreateGroupExpenseData,
  type CreateSettlementData
} from '../services/groupService';
import { SlidePanel } from '../components/SlidePanel';

interface ExpenseFormProps {
  groupId: number;
  members: any[];
  onSuccess: () => void;
  onCancel: () => void;
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ groupId, members, onSuccess, onCancel }) => {
  const { user } = useAuthStore();
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paid_by: user?.id?.toString() || '',
    split_method: 'equal' as 'equal' | 'custom' | 'percentage'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.description.trim()) {
      setError('Please enter a description');
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      const data: CreateGroupExpenseData = {
        description: formData.description,
        amount: parseFloat(formData.amount),
        date: formData.date,
        paid_by: formData.paid_by,
        split_method: formData.split_method
      };

      await groupService.createGroupExpense(groupId, data);

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add expense');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '24px' }}>
        Add Group Expense
      </h2>

      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '8px',
          color: '#22c55e',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          ✓ Expense added successfully!
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Description *
        </label>
        <input
          type="text"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="e.g., Dinner at restaurant, Groceries, Hotel"
          required
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

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Amount *
        </label>
        <input
          type="number"
          name="amount"
          value={formData.amount}
          onChange={handleChange}
          placeholder="0.00"
          step="0.01"
          min="0"
          required
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

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Date *
        </label>
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          required
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
            colorScheme: 'dark'
          }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Paid By *
        </label>
        <select
          name="paid_by"
          value={formData.paid_by}
          onChange={handleChange}
          required
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="" style={{ background: '#1e293b' }}>Select member</option>
          {members.map(member => (
            <option key={member.id} value={member.id} style={{ background: '#1e293b' }}>
              {member.name || member.email}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Split Method *
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {(['equal', 'percentage', 'custom'] as const).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, split_method: method }))}
              style={{
                padding: '12px',
                background: formData.split_method === method ? 'rgba(34, 197, 94, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                border: formData.split_method === method ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: formData.split_method === method ? '#22c55e' : '#94a3b8',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s',
                textTransform: 'capitalize'
              }}
            >
              {method}
            </button>
          ))}
        </div>
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
          {formData.split_method === 'equal' && 'Split equally among all members'}
          {formData.split_method === 'percentage' && 'Specify percentage for each member'}
          {formData.split_method === 'custom' && 'Specify exact amount for each member'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          Add Expense
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '12px 24px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

interface SettlementFormProps {
  groupId: number;
  members: any[];
  balances: GroupBalance[];
  onSuccess: () => void;
  onCancel: () => void;
}

const SettlementForm: React.FC<SettlementFormProps> = ({ groupId, members, balances, onSuccess, onCancel }) => {
  const { user } = useAuthStore();
  const [formData, setFormData] = useState({
    from_user_id: '',
    to_user_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.from_user_id || !formData.to_user_id) {
      setError('Please select both payer and receiver');
      return;
    }

    if (formData.from_user_id === formData.to_user_id) {
      setError('Payer and receiver must be different');
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      const data: CreateSettlementData = {
        from_user_id: formData.from_user_id,
        to_user_id: formData.to_user_id,
        amount: parseFloat(formData.amount),
        date: formData.date,
        notes: formData.notes || undefined
      };

      await groupService.recordSettlement(groupId, data);

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to record settlement');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '24px' }}>
        Settle Up
      </h2>

      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '8px',
          color: '#22c55e',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          ✓ Settlement recorded successfully!
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Who Paid? *
        </label>
        <select
          name="from_user_id"
          value={formData.from_user_id}
          onChange={handleChange}
          required
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="" style={{ background: '#1e293b' }}>Select member</option>
          {members.map(member => (
            <option key={member.id} value={member.id} style={{ background: '#1e293b' }}>
              {member.name || member.email}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Who Received? *
        </label>
        <select
          name="to_user_id"
          value={formData.to_user_id}
          onChange={handleChange}
          required
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="" style={{ background: '#1e293b' }}>Select member</option>
          {members.map(member => (
            <option key={member.id} value={member.id} style={{ background: '#1e293b' }}>
              {member.name || member.email}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Amount *
        </label>
        <input
          type="number"
          name="amount"
          value={formData.amount}
          onChange={handleChange}
          placeholder="0.00"
          step="0.01"
          min="0"
          required
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

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Date *
        </label>
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          required
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
            colorScheme: 'dark'
          }}
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Notes (optional)
        </label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          placeholder="Add notes about this payment..."
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

      <div style={{ display: 'flex', gap: '12px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          Record Payment
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '12px 24px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

interface InviteMemberFormProps {
  groupId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const InviteMemberForm: React.FC<InviteMemberFormProps> = ({ groupId, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    userId: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.userId.trim()) {
      setError('Please enter a user ID or email');
      return;
    }

    try {
      await groupService.addGroupMember(groupId, parseInt(formData.userId));

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add member');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '24px' }}>
        Invite Member
      </h2>

      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '8px',
          color: '#22c55e',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          ✓ Member added successfully!
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          User ID or Email *
        </label>
        <div style={{ position: 'relative' }}>
          <Mail size={18} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            name="userId"
            value={formData.userId}
            onChange={handleChange}
            placeholder="Enter user ID or email"
            required
            style={{
              width: '100%',
              padding: '12px 12px 12px 40px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
          The user will be added to the group immediately
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          Add Member
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '12px 24px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export const GroupDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');

  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [balances, setBalances] = useState<GroupBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members'>('expenses');
  const [showExpensePanel, setShowExpensePanel] = useState(false);
  const [showSettlementPanel, setShowSettlementPanel] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);

  useEffect(() => {
    if (id) {
      loadGroupData(parseInt(id));
    }
  }, [id]);

  const loadGroupData = async (groupId: number) => {
    try {
      setLoading(true);
      const [groupData, expensesData, balancesData] = await Promise.all([
        groupService.getGroup(groupId),
        groupService.getGroupExpenses(groupId),
        groupService.getGroupBalances(groupId),
      ]);
      setGroup(groupData);
      setExpenses(expensesData);
      setBalances(balancesData);
    } catch (error) {
      console.error('Failed to load group data:', error);
      navigate('/groups');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = () => {
    setShowExpensePanel(true);
  };

  const handleSettleUp = () => {
    setShowSettlementPanel(true);
  };

  const handleInviteMember = () => {
    setShowInvitePanel(true);
  };

  const handleClosePanel = () => {
    setShowExpensePanel(false);
    setShowSettlementPanel(false);
    setShowInvitePanel(false);
  };

  const handleSuccess = () => {
    handleClosePanel();
    if (id) {
      loadGroupData(parseInt(id));
    }
  };

  if (loading) {
    return (
      <>
        <Navigation />
        <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              borderTop: '3px solid #22c55e',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto'
            }} />
            <p style={{ color: '#94a3b8', marginTop: '16px' }}>Loading group...</p>
          </div>
        </div>
      </>
    );
  }

  if (!group) {
    return (
      <>
        <Navigation />
        <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
          <div style={{
            padding: '60px 20px',
            background: 'rgba(17, 24, 39, 0.8)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            textAlign: 'center',
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            <AlertCircle size={64} color="#ef4444" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: '#94a3b8', fontSize: '16px' }}>Group not found</p>
          </div>
        </div>
      </>
    );
  }

  const isAdmin = group.created_by === user?.id;
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const myBalance = balances.find((b) => b.user_id === user?.id)?.balance || 0;

  return (
    <>
      <Navigation />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <button
              onClick={() => navigate('/groups')}
              style={{
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
            >
              <ArrowLeft size={20} />
            </button>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '4px', background: 'linear-gradient(to right, #86efac, #fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {group.name}
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>{group.description || 'No description'}</p>
            </div>
            {isAdmin && (
              <button
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
              >
                <Settings size={18} />
                Settings
              </button>
            )}
          </div>

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              padding: '20px',
              background: 'rgba(17, 24, 39, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  background: 'rgba(59, 130, 246, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Users size={20} color="#3b82f6" />
                </div>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>Members</span>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>{group.members?.length || 0}</p>
            </div>

            <div style={{
              padding: '20px',
              background: 'rgba(17, 24, 39, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  background: 'rgba(168, 85, 247, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <DollarSign size={20} color="#a855f7" />
                </div>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>Total Expenses</span>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>
                {branding.currencySymbol}{totalExpenses.toFixed(2)}
              </p>
            </div>

            <div style={{
              padding: '20px',
              background: 'rgba(17, 24, 39, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  background: myBalance >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <DollarSign size={20} color={myBalance >= 0 ? '#22c55e' : '#ef4444'} />
                </div>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>My Balance</span>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: myBalance >= 0 ? '#22c55e' : '#ef4444' }}>
                {myBalance >= 0 ? '+' : ''}{branding.currencySymbol}{Math.abs(myBalance).toFixed(2)}
              </p>
            </div>

            <div style={{
              padding: '20px',
              background: 'rgba(17, 24, 39, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  background: 'rgba(249, 115, 22, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Calendar size={20} color="#f97316" />
                </div>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>Transactions</span>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>{expenses.length}</p>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <button
              onClick={handleAddExpense}
              style={{
                padding: '12px 20px',
                background: '#15803d',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#166534')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#15803d')}
            >
              <Plus size={18} />
              Add Expense
            </button>
            <button
              onClick={handleSettleUp}
              style={{
                padding: '12px 20px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              <DollarSign size={18} />
              Settle Up
            </button>
          </div>

          {/* Tabs */}
          <div style={{
            background: 'rgba(17, 24, 39, 0.8)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '24px' }}>
              {(['expenses', 'balances', 'members'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab ? '3px solid #22c55e' : '3px solid transparent',
                    color: activeTab === tab ? '#22c55e' : '#94a3b8',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    transition: 'all 0.3s',
                    marginBottom: '-1px'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Expenses Tab */}
            {activeTab === 'expenses' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {expenses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <DollarSign size={64} color="#64748b" style={{ margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8', fontSize: '16px' }}>No expenses yet</p>
                    <p style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>
                      Add your first expense to start tracking group spending
                    </p>
                  </div>
                ) : (
                  expenses.map((expense) => (
                    <div
                      key={expense.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '12px',
                        transition: 'all 0.3s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <DollarSign size={24} color="white" />
                        </div>
                        <div>
                          <p style={{ color: 'white', fontWeight: '600', fontSize: '15px', marginBottom: '4px' }}>
                            {expense.description}
                          </p>
                          <p style={{ color: '#94a3b8', fontSize: '13px' }}>
                            Paid by {expense.paid_by} • {expense.split_method} split
                          </p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ color: 'white', fontWeight: '700', fontSize: '18px', marginBottom: '4px' }}>
                          {branding.currencySymbol}{expense.amount.toFixed(2)}
                        </p>
                        <p style={{ color: '#64748b', fontSize: '12px' }}>{expense.date}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Balances Tab */}
            {activeTab === 'balances' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {balances.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <CheckCircle size={64} color="#22c55e" style={{ margin: '0 auto 16px' }} />
                    <p style={{ color: '#22c55e', fontSize: '18px', fontWeight: '600' }}>All settled up!</p>
                    <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '8px' }}>
                      Everyone in this group is even
                    </p>
                  </div>
                ) : (
                  balances.map((balance) => (
                    <div key={balance.user_id}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            color: 'white'
                          }}>
                            {balance.user_name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ color: 'white', fontWeight: '600', fontSize: '15px' }}>
                            {balance.user_name}
                          </span>
                        </div>
                        <div style={{
                          fontSize: '18px',
                          fontWeight: '700',
                          color: balance.balance >= 0 ? '#22c55e' : '#ef4444'
                        }}>
                          {balance.balance >= 0 ? '+' : ''}
                          {branding.currencySymbol}{Math.abs(balance.balance).toFixed(2)}
                        </div>
                      </div>

                      {/* Show who owes/owed details */}
                      {balance.owes.length > 0 && (
                        <div style={{ marginLeft: '52px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {balance.owes.map((owe) => (
                            <p key={owe.user_id} style={{ color: '#ef4444', fontSize: '13px' }}>
                              owes {owe.user_name} {branding.currencySymbol}{owe.amount.toFixed(2)}
                            </p>
                          ))}
                        </div>
                      )}
                      {balance.owed_by.length > 0 && (
                        <div style={{ marginLeft: '52px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {balance.owed_by.map((owed) => (
                            <p key={owed.user_id} style={{ color: '#22c55e', fontSize: '13px' }}>
                              is owed {branding.currencySymbol}{owed.amount.toFixed(2)} by {owed.user_name}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {group.members?.map((member) => (
                  <div
                    key={member.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        color: 'white'
                      }}>
                        {(member.name?.charAt(0) || member.email?.charAt(0) || 'U').toUpperCase()}
                      </div>
                      <div>
                        <p style={{ color: 'white', fontWeight: '600', fontSize: '15px' }}>
                          {member.name || 'Unknown'}
                        </p>
                        <p style={{ color: '#94a3b8', fontSize: '13px' }}>{member.email}</p>
                      </div>
                    </div>
                    {member.id === group.created_by && (
                      <span style={{
                        padding: '4px 12px',
                        background: 'rgba(59, 130, 246, 0.2)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '6px',
                        color: '#3b82f6',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        Admin
                      </span>
                    )}
                  </div>
                )) || (
                  <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 20px' }}>No members</p>
                )}

                {isAdmin && (
                  <button
                    onClick={handleInviteMember}
                    style={{
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px dashed rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      color: '#94a3b8',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      marginTop: '8px',
                      transition: 'all 0.3s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.color = '#94a3b8';
                    }}
                  >
                    <UserPlus size={18} />
                    Add Member
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', marginTop: '40px' }}>
            Part of {branding.parentBrand} ecosystem
          </div>
        </div>
      </div>

      {/* Add Expense Panel */}
      <SlidePanel
        isOpen={showExpensePanel}
        onClose={handleClosePanel}
        title="Add Group Expense"
      >
        <ExpenseForm
          groupId={parseInt(id!)}
          members={group.members || []}
          onSuccess={handleSuccess}
          onCancel={handleClosePanel}
        />
      </SlidePanel>

      {/* Settlement Panel */}
      <SlidePanel
        isOpen={showSettlementPanel}
        onClose={handleClosePanel}
        title="Settle Up"
      >
        <SettlementForm
          groupId={parseInt(id!)}
          members={group.members || []}
          balances={balances}
          onSuccess={handleSuccess}
          onCancel={handleClosePanel}
        />
      </SlidePanel>

      {/* Invite Member Panel */}
      <SlidePanel
        isOpen={showInvitePanel}
        onClose={handleClosePanel}
        title="Invite Member"
      >
        <InviteMemberForm
          groupId={parseInt(id!)}
          onSuccess={handleSuccess}
          onCancel={handleClosePanel}
        />
      </SlidePanel>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};
