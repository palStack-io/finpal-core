import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, DollarSign, ArrowRight, X, Search, Mail } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { groupService, type Group } from '../services/groupService';
import { SlidePanel } from '../components/SlidePanel';

interface GroupFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const GroupForm: React.FC<GroupFormProps> = ({ onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    memberEmails: [''],
    default_split_method: 'equal' as 'equal' | 'percentage' | 'custom' | 'shares',
    auto_include_all: true
  });
  const [customSplitValues, setCustomSplitValues] = useState<{ [email: string]: string }>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddEmail = () => {
    setFormData(prev => ({
      ...prev,
      memberEmails: [...prev.memberEmails, '']
    }));
  };

  const handleRemoveEmail = (index: number) => {
    setFormData(prev => ({
      ...prev,
      memberEmails: prev.memberEmails.filter((_, i) => i !== index)
    }));
  };

  const handleEmailChange = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      memberEmails: prev.memberEmails.map((email, i) => i === index ? value : email)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Please enter a group name');
      return;
    }

    // Validate percentage splits if percentage method is selected
    if (formData.default_split_method === 'percentage') {
      const validEmails = formData.memberEmails.filter(email => email.trim());
      const totalPercentage = validEmails.reduce((sum, email) => {
        const value = parseFloat(customSplitValues[email] || '0');
        return sum + value;
      }, 0);

      if (validEmails.length > 0 && totalPercentage > 0 && Math.abs(totalPercentage - 100) > 0.01) {
        setError('Percentage splits must add up to 100%');
        return;
      }
    }

    try {
      const validEmails = formData.memberEmails.filter(email => email.trim());

      // Build default_split_values based on split method
      let defaultSplitValues = undefined;
      if (formData.default_split_method !== 'equal' && validEmails.length > 0) {
        const hasValues = Object.keys(customSplitValues).some(email =>
          customSplitValues[email] && parseFloat(customSplitValues[email]) > 0
        );

        if (hasValues) {
          defaultSplitValues = {};
          validEmails.forEach(email => {
            if (customSplitValues[email] && parseFloat(customSplitValues[email]) > 0) {
              defaultSplitValues[email] = parseFloat(customSplitValues[email]);
            }
          });
        }
      }

      await groupService.createGroup({
        name: formData.name,
        description: formData.description || undefined,
        member_ids: validEmails.length > 0 ? validEmails.map(email => parseInt(email)) : undefined,
        default_split_method: formData.default_split_method,
        auto_include_all: formData.auto_include_all,
        default_split_values: defaultSplitValues
      });

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create group');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '24px' }}>
        Create New Group
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
          ✓ Group created successfully!
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Group Name *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Roommates, Trip to Paris, Dinner Club"
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

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Description (optional)
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Add details about this group..."
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

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Default Split Method
        </label>
        <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>
          How should expenses be split by default in this group?
        </p>
        <select
          name="default_split_method"
          value={formData.default_split_method}
          onChange={(e) => setFormData(prev => ({ ...prev, default_split_method: e.target.value as any }))}
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
          <option value="equal" style={{ background: '#1e293b' }}>Equal - Split evenly among all members</option>
          <option value="percentage" style={{ background: '#1e293b' }}>Percentage - Split by percentage</option>
          <option value="custom" style={{ background: '#1e293b' }}>Custom - Specify amounts per person</option>
          <option value="shares" style={{ background: '#1e293b' }}>Shares - Split by shares/units</option>
        </select>

        {/* Custom Split Values */}
        {formData.default_split_method === 'custom' && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
            <p style={{ color: '#93c5fd', fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
              💡 Specify default custom amounts for each member (optional)
            </p>
            {formData.memberEmails.filter(email => email.trim()).map((email, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email || `Member ${index + 1}`}
                </span>
                <input
                  type="number"
                  placeholder="Amount"
                  step="0.01"
                  min="0"
                  value={customSplitValues[email] || ''}
                  onChange={(e) => setCustomSplitValues(prev => ({ ...prev, [email]: e.target.value }))}
                  style={{
                    width: '120px',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              </div>
            ))}
            {formData.memberEmails.filter(email => email.trim()).length === 0 && (
              <p style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>
                Add members above to specify custom split amounts
              </p>
            )}
          </div>
        )}

        {/* Percentage Split Values */}
        {formData.default_split_method === 'percentage' && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '8px' }}>
            <p style={{ color: '#c4b5fd', fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
              💡 Specify default percentage split for each member (optional)
            </p>
            {formData.memberEmails.filter(email => email.trim()).map((email, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email || `Member ${index + 1}`}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    placeholder="50"
                    step="0.1"
                    min="0"
                    max="100"
                    value={customSplitValues[email] || ''}
                    onChange={(e) => setCustomSplitValues(prev => ({ ...prev, [email]: e.target.value }))}
                    style={{
                      width: '80px',
                      padding: '8px 12px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                  <span style={{ color: '#94a3b8', fontSize: '13px' }}>%</span>
                </div>
              </div>
            ))}
            {formData.memberEmails.filter(email => email.trim()).length === 0 && (
              <p style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>
                Add members above to specify percentage splits
              </p>
            )}
          </div>
        )}

        {/* Shares Split Values */}
        {formData.default_split_method === 'shares' && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: '8px' }}>
            <p style={{ color: '#fde047', fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
              💡 Specify default shares for each member (optional)
            </p>
            {formData.memberEmails.filter(email => email.trim()).map((email, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email || `Member ${index + 1}`}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    placeholder="1"
                    step="1"
                    min="0"
                    value={customSplitValues[email] || ''}
                    onChange={(e) => setCustomSplitValues(prev => ({ ...prev, [email]: e.target.value }))}
                    style={{
                      width: '80px',
                      padding: '8px 12px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                  <span style={{ color: '#94a3b8', fontSize: '13px' }}>shares</span>
                </div>
              </div>
            ))}
            {formData.memberEmails.filter(email => email.trim()).length === 0 && (
              <p style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>
                Add members above to specify share amounts
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={formData.auto_include_all}
            onChange={(e) => setFormData(prev => ({ ...prev, auto_include_all: e.target.checked }))}
            style={{
              width: '20px',
              height: '20px',
              cursor: 'pointer',
              accentColor: '#3b82f6'
            }}
          />
          <span style={{ color: '#94a3b8', fontSize: '14px' }}>Auto-include all members in expenses</span>
        </label>
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', marginLeft: '32px' }}>
          Automatically include all group members when creating an expense
        </p>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Invite Members (optional)
        </label>
        <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>
          You can add members now or invite them later
        </p>

        {formData.memberEmails.map((email, index) => (
          <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Mail size={18} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(index, e.target.value)}
                placeholder="member@example.com"
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
            {formData.memberEmails.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveEmail(index)}
                style={{
                  padding: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={handleAddEmail}
          style={{
            padding: '10px 16px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px dashed rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: '#94a3b8',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            justifyContent: 'center',
            marginTop: '8px'
          }}
        >
          <Plus size={16} />
          Add Another Member
        </button>
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
          Create Group
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

export const Groups: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const data = await groupService.getGroups();
      setGroups(data);
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = () => {
    setShowCreatePanel(true);
  };

  const handleClosePanel = () => {
    setShowCreatePanel(false);
  };

  const handleSuccess = () => {
    handleClosePanel();
    loadGroups();
  };

  const handleGroupClick = (groupId: number) => {
    navigate(`/groups/${groupId}`);
  };

  // Filter groups by search term
  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate totals (mock for now - should come from backend)
  const totalOwed = 0;
  const totalOwe = 0;

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
            <p style={{ color: '#94a3b8', marginTop: '16px' }}>Loading groups...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px', background: 'linear-gradient(to right, #86efac, #fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                  Groups
                </h1>
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>Split expenses and track shared costs with friends</p>
              </div>
              <button
                onClick={handleCreateGroup}
                style={{
                  padding: '10px 20px',
                  background: '#15803d',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#166534')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#15803d')}
              >
                <Plus size={16} /> Create Group
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
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
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>Active Groups</span>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>{groups.length}</p>
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
                  background: 'rgba(34, 197, 94, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <DollarSign size={20} color="#22c55e" />
                </div>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>You Are Owed</span>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#22c55e' }}>{branding.currencySymbol}{totalOwed.toFixed(2)}</p>
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
                  background: 'rgba(239, 68, 68, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <DollarSign size={20} color="#ef4444" />
                </div>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>You Owe</span>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>{branding.currencySymbol}{totalOwe.toFixed(2)}</p>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={20} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search groups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 44px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={20} color="#64748b" />
                </button>
              )}
            </div>
          </div>

          {/* Groups List */}
          {filteredGroups.length === 0 ? (
            <div style={{
              padding: '60px 20px',
              background: 'rgba(17, 24, 39, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <Users size={64} color="#64748b" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: 'white', marginBottom: '8px' }}>
                {searchTerm ? 'No groups match your search' : 'No groups yet'}
              </h3>
              {!searchTerm && (
                <>
                  <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '20px' }}>
                    Create a group to start splitting expenses with friends and family
                  </p>
                  <button
                    onClick={handleCreateGroup}
                    style={{
                      padding: '12px 24px',
                      background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Plus size={20} />
                    Create Your First Group
                  </button>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => handleGroupClick(group.id)}
                  style={{
                    background: 'rgba(17, 24, 39, 0.8)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '24px',
                    cursor: 'pointer',
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#22c55e';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '14px',
                        background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: 'white',
                        boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
                      }}>
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '4px' }}>
                          {group.name}
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '13px' }}>
                          {group.description || 'No description'}
                        </p>
                      </div>
                    </div>
                    <ArrowRight size={20} color="#64748b" />
                  </div>

                  <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={16} color="#64748b" />
                        <span style={{ color: '#94a3b8', fontSize: '14px' }}>
                          {group.members?.length || 0} members
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <DollarSign size={16} color="#64748b" />
                        <span style={{ color: '#94a3b8', fontSize: '14px' }}>View balances</span>
                      </div>
                    </div>

                    {group.created_by === user?.id && (
                      <div style={{
                        marginTop: '12px',
                        padding: '8px 12px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '6px'
                      }}>
                        <p style={{ color: '#3b82f6', fontSize: '12px', fontWeight: '600' }}>
                          You are the admin
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* How It Works */}
          <div style={{
            marginTop: '32px',
            background: 'rgba(17, 24, 39, 0.8)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '32px'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'white', marginBottom: '24px' }}>
              How Group Expenses Work
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: 'white',
                  margin: '0 auto 16px'
                }}>
                  1
                </div>
                <h3 style={{ color: 'white', fontWeight: '600', fontSize: '16px', marginBottom: '8px' }}>Create a Group</h3>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.5' }}>
                  Add friends, roommates, or travel companions to your group
                </p>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: 'white',
                  margin: '0 auto 16px'
                }}>
                  2
                </div>
                <h3 style={{ color: 'white', fontWeight: '600', fontSize: '16px', marginBottom: '8px' }}>
                  Add Shared Expenses
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.5' }}>
                  Track who paid and how to split each expense
                </p>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: 'white',
                  margin: '0 auto 16px'
                }}>
                  3
                </div>
                <h3 style={{ color: 'white', fontWeight: '600', fontSize: '16px', marginBottom: '8px' }}>
                  Settle Up
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.5' }}>
                  See who owes whom and record payments when settled
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', marginTop: '40px' }}>
            Part of {branding.parentBrand} ecosystem
          </div>
        </div>
      </div>

      {/* Create Group Panel */}
      <SlidePanel
        isOpen={showCreatePanel}
        onClose={handleClosePanel}
        title="Create New Group"
      >
        <GroupForm
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
