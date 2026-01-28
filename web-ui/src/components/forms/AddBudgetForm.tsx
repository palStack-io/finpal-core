import React, { useState } from 'react';
import { PiggyBank, DollarSign, Calendar, Tag, AlertCircle, Check } from 'lucide-react';

interface AddBudgetFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const AddBudgetForm: React.FC<AddBudgetFormProps> = ({ onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    category: '',
    period: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    endDate: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validation
      if (!formData.name.trim()) {
        throw new Error('Budget name is required');
      }
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        throw new Error('Budget amount must be greater than 0');
      }

      // TODO: Implement actual API call to create budget
      // For now, just simulate the API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setSuccess(true);

      // Wait a moment to show success message, then close
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to create budget');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.3s'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '8px'
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Success Message */}
      {success && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            background: 'rgba(134, 239, 172, 0.1)',
            border: '1px solid rgba(134, 239, 172, 0.3)',
            borderRadius: '8px'
          }}
        >
          <div style={{ background: 'rgba(134, 239, 172, 0.2)', padding: '8px', borderRadius: '8px' }}>
            <Check size={20} style={{ color: '#86efac' }} />
          </div>
          <p style={{ color: '#86efac', fontWeight: '600', fontSize: '14px', margin: 0 }}>
            Budget created successfully!
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px'
          }}
        >
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px' }}>
            <AlertCircle size={20} style={{ color: '#ef4444' }} />
          </div>
          <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Budget Name */}
      <div>
        <label style={labelStyle}>
          <PiggyBank size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          Budget Name *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Monthly Groceries Budget"
          required
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        />
      </div>

      {/* Budget Amount */}
      <div>
        <label style={labelStyle}>
          <DollarSign size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          Budget Amount *
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
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        />
      </div>

      {/* Category */}
      <div>
        <label style={labelStyle}>
          <Tag size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          Category
        </label>
        <input
          type="text"
          name="category"
          value={formData.category}
          onChange={handleChange}
          placeholder="e.g., Food, Transportation, Entertainment"
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        />
      </div>

      {/* Budget Period */}
      <div>
        <label style={labelStyle}>
          <Calendar size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          Budget Period
        </label>
        <select
          name="period"
          value={formData.period}
          onChange={handleChange}
          disabled={isSubmitting}
          style={{
            ...inputStyle,
            cursor: 'pointer'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        >
          <option value="daily" style={{ background: '#0f172a' }}>Daily</option>
          <option value="weekly" style={{ background: '#0f172a' }}>Weekly</option>
          <option value="monthly" style={{ background: '#0f172a' }}>Monthly</option>
          <option value="quarterly" style={{ background: '#0f172a' }}>Quarterly</option>
          <option value="yearly" style={{ background: '#0f172a' }}>Yearly</option>
          <option value="custom" style={{ background: '#0f172a' }}>Custom</option>
        </select>
      </div>

      {/* Start Date */}
      <div>
        <label style={labelStyle}>Start Date</label>
        <input
          type="date"
          name="startDate"
          value={formData.startDate}
          onChange={handleChange}
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        />
      </div>

      {/* End Date (only show for custom period) */}
      {formData.period === 'custom' && (
        <div>
          <label style={labelStyle}>End Date</label>
          <input
            type="date"
            name="endDate"
            value={formData.endDate}
            onChange={handleChange}
            disabled={isSubmitting}
            style={inputStyle}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
            }}
          />
        </div>
      )}

      {/* Info Box */}
      <div
        style={{
          padding: '12px',
          background: 'rgba(251, 191, 36, 0.1)',
          border: '1px solid rgba(251, 191, 36, 0.3)',
          borderRadius: '8px',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-start'
        }}
      >
        <AlertCircle size={16} style={{ color: '#fbbf24', marginTop: '2px', flexShrink: 0 }} />
        <p style={{ color: '#fbbf24', fontSize: '12px', lineHeight: '1.5', margin: 0 }}>
          This budget will track your spending in the selected category over the specified period.
          You'll receive notifications when you're approaching or exceeding your budget limit.
        </p>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '14px 24px',
            background: 'rgba(71, 85, 105, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '15px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
            opacity: isSubmitting ? 0.5 : 1
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.background = 'rgba(71, 85, 105, 0.5)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.background = 'rgba(71, 85, 105, 0.3)';
            }
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '14px 24px',
            background: isSubmitting ? 'rgba(21, 128, 61, 0.5)' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            border: '1px solid rgba(21, 128, 61, 0.5)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '15px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
            opacity: isSubmitting ? 0.7 : 1
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(21, 128, 61, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          {isSubmitting ? 'Creating...' : 'Create Budget'}
        </button>
      </div>
    </form>
  );
};
