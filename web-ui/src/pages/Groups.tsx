import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, DollarSign, ArrowRight, X, Search, Mail } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { groupsApi, type Group } from '../services/api/groups';
import { SlidePanel } from '../components/SlidePanel';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';
import { apiErrorMessage } from '../utils/apiError';

interface GroupFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const GroupForm: React.FC<GroupFormProps> = ({ onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    memberEmails: [''],
    default_split_method: 'equal' as 'equal' | 'percentage' | 'custom',
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

      await groupsApi.create({
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
      setError(apiErrorMessage(err, 'Failed to create group'));
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>
        Create New Group
      </h2>

      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: 'var(--accent-red)',
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
          color: 'var(--brand-green-glow)',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          ✓ Group created successfully!
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={fieldLabelStyle}>
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
            background: 'var(--input-bg)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={fieldLabelStyle}>
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
            background: 'var(--input-bg)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none',
            resize: 'vertical'
          }}
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={fieldLabelStyle}>
          Default Split Method
        </label>
        <p style={tinyMetaStyle}>
          How should expenses be split by default in this group?
        </p>
        <select
          name="default_split_method"
          value={formData.default_split_method}
          onChange={(e) => setFormData(prev => ({ ...prev, default_split_method: e.target.value as any }))}
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="equal" style={secondaryBgStyle}>Equal - Split evenly among all members</option>
          <option value="percentage" style={secondaryBgStyle}>Percentage - Split by percentage</option>
          <option value="custom" style={secondaryBgStyle}>Custom - Specify amounts per person</option>
        </select>

        {/* Custom Split Values */}
        {formData.default_split_method === 'custom' && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
            <p style={{ color: '#93c5fd', fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
              💡 Specify default custom amounts for each member (optional)
            </p>
            {formData.memberEmails.filter(email => email.trim()).map((email, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={truncatedTextStyle}>
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
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              </div>
            ))}
            {formData.memberEmails.filter(email => email.trim()).length === 0 && (
              <p style={italicMutedStyle}>
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
                <span style={truncatedTextStyle}>
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
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                  <span style={smallMetaStyle}>%</span>
                </div>
              </div>
            ))}
            {formData.memberEmails.filter(email => email.trim()).length === 0 && (
              <p style={italicMutedStyle}>
                Add members above to specify percentage splits
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
              accentColor: 'var(--accent-blue)'
            }}
          />
          <span style={bodyTextStyle}>Auto-include all members in expenses</span>
        </label>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', marginLeft: '32px' }}>
          Automatically include all group members when creating an expense
        </p>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={fieldLabelStyle}>
          Invite Members (optional)
        </label>
        <p style={tinyMetaStyle}>
          You can add members now or invite them later
        </p>

        {formData.memberEmails.map((email, index) => (
          <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Mail size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(index, e.target.value)}
                placeholder="member@example.com"
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 40px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
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
                  color: 'var(--accent-red)',
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
            background: 'var(--surface-hover)',
            border: '1px dashed var(--border-medium)',
            borderRadius: '8px',
            color: 'var(--text-secondary)',
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

      <div style={{ display: 'flex', gap: '12px', paddingTop: '20px', borderTop: '1px solid var(--border-light)' }}>
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
            background: 'var(--border-light)',
            border: '1px solid var(--border-medium)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
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

const bodyTextStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const fieldLabelStyle: React.CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' };
const secondaryBgStyle: React.CSSProperties = { background: 'var(--bg-secondary)' };
const truncatedTextStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '13px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const italicMutedStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' };

const sectionSubtitleStyle: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: '600', fontSize: '16px', marginBottom: '8px' };
const bodyLineStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' };
const smallMetaStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '13px' };
const tinyMetaStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' };

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
      // `.groups`, not the response: the retired groupService unwrapped the
      // envelope for callers and groupsApi does not. Converging is a shape change
      // at every call site, not a rename.
      const { groups } = await groupsApi.getAll();
      setGroups(groups);
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

  // No "You Are Owed"/"You Owe" cards. They were `const totalOwed = 0` and
  // `const totalOwe = 0` with a "mock for now" comment, so both rendered a
  // confident $0.00 whatever the group balances were. /groups/{id}/balances
  // exists but returns simplified debts keyed by display name, not user id, so
  // aggregating them across groups needs a backend change first.

  if (loading) {
    return (
      <>
        <div style={pageContainerStyle}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid var(--border-light)',
              borderTop: '3px solid #22c55e',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto'
            }} />
            <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Loading groups...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={pageContainerStyle}>
        <div className="page-container">
          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h1 className="page-title">
                  Groups
                </h1>
                <p style={bodyTextStyle}>Split shared costs with the people in your household</p>
              </div>
              <button
                onClick={handleCreateGroup}
                style={{
                  padding: '10px 20px',
                  background: 'var(--brand-main-green)',
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
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-dark-green)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--brand-main-green)')}
              >
                <Plus size={16} /> Create Group
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 260px))', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              padding: '20px',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border-light)',
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
                <span style={bodyTextStyle}>Active Groups</span>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{groups.length}</p>
            </div>

          </div>

          {/* Search */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search groups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 44px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
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
                  <X size={20} color="var(--text-muted)" />
                </button>
              )}
            </div>
          </div>

          {/* Groups List */}
          {filteredGroups.length === 0 ? (
            <div style={{
              padding: '60px 20px',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <Users size={64} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                {searchTerm ? 'No groups match your search' : 'No groups yet'}
              </h3>
              {!searchTerm && (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                    Create a group to split what you share with your household — rent, groceries, a holiday
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
                    background: 'var(--bg-card)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '16px',
                    padding: '24px',
                    cursor: 'pointer',
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--brand-green-glow)';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
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
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {group.name}
                        </h3>
                        <p style={smallMetaStyle}>
                          {group.description || 'No description'}
                        </p>
                      </div>
                    </div>
                    <ArrowRight size={20} color="var(--text-muted)" />
                  </div>

                  <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={flexRowGap8}>
                        <Users size={16} color="var(--text-muted)" />
                        <span style={bodyTextStyle}>
                          {group.members?.length || 0} members
                        </span>
                      </div>
                      <div style={flexRowGap8}>
                        <DollarSign size={16} color="var(--text-muted)" />
                        <span style={bodyTextStyle}>View balances</span>
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
                        <p style={{ color: 'var(--accent-blue)', fontSize: '12px', fontWeight: '600' }}>
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
            background: 'var(--bg-card)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '32px'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>
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
                <h3 style={sectionSubtitleStyle}>Create a Group</h3>
                <p style={bodyLineStyle}>
                  Add the people in your household who share these costs
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
                <h3 style={sectionSubtitleStyle}>
                  Add Shared Expenses
                </h3>
                <p style={bodyLineStyle}>
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
                <h3 style={sectionSubtitleStyle}>
                  Settle Up
                </h3>
                <p style={bodyLineStyle}>
                  See who owes whom and record payments when settled
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="fp-page-footer">
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
