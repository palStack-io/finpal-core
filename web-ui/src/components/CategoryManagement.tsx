import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, Folder, Search, X } from 'lucide-react';
import { categoriesApi, type Category } from '../services/api/categories';
import { Modal } from './Modal';

// Category icons mapping
const categoryIcons: Record<string, string> = {
  'Food & Dining': '🍔',
  'Transportation': '🚗',
  'Entertainment': '🎬',
  'Shopping': '🛍️',
  'Utilities': '⚡',
  'Healthcare': '🏥',
  'Housing': '🏠',
  'Income': '💰',
  'Savings': '🐷',
  'Travel': '✈️',
  'Education': '📚',
  'Fitness': '💪',
  'Groceries': '🛒',
  'Coffee & Tea': '☕',
  'Restaurants': '🍽️',
  'Gas': '⛽',
  'Parking': '🅿️',
  'Public Transit': '🚌',
  'Movies': '🎥',
  'Concerts': '🎵',
  'Gaming': '🎮',
  'Clothing': '👕',
  'Electronics': '📱',
  'Home Decor': '🏡',
};

const categoryColors = [
  '#3b82f6', '#22c55e', '#ef4444', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#06b6d4', '#84cc16', '#a855f7', '#eab308'
];

interface CategoryFormProps {
  category: Category | null;
  parentCategories: Category[];
  onSuccess: () => void;
  onCancel: () => void;
}

const CategoryForm: React.FC<CategoryFormProps> = ({ category, parentCategories, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    name: category?.name || '',
    icon: category?.icon || '📁',
    color: category?.color || '#3b82f6',
    parent_id: category?.parent_id || ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const data: any = {
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
      };

      if (formData.parent_id) {
        data.parent_id = parseInt(formData.parent_id);
      }

      if (category?.id) {
        await categoriesApi.update(category.id, data);
      } else {
        await categoriesApi.create(data);
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save category');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>
        {category?.id ? 'Edit Category' : formData.parent_id ? 'Add Subcategory' : 'Add Category'}
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
          ✓ Category {category?.id ? 'updated' : 'created'} successfully!
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Category Name *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Food & Dining"
          required
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--input-bg)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none'
          }}
        />
      </div>

      {!category?.parent_id && (
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
            Parent Category (optional)
          </label>
          <select
            name="parent_id"
            value={formData.parent_id}
            onChange={handleChange}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--input-bg)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="" style={{ background: 'var(--bg-secondary)' }}>None - This is a main category</option>
            {parentCategories.map(cat => (
              <option key={cat.id} value={cat.id} style={{ background: 'var(--bg-secondary)' }}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Icon
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {Object.entries(categoryIcons).slice(0, 12).map(([name, icon]) => (
            <button
              key={icon}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, icon }))}
              style={{
                width: '48px',
                height: '48px',
                background: formData.icon === icon ? 'rgba(34, 197, 94, 0.2)' : 'var(--input-bg)',
                border: formData.icon === icon ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                fontSize: '24px',
                cursor: 'pointer',
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title={name}
            >
              {icon}
            </button>
          ))}
        </div>
        <input
          type="text"
          name="icon"
          value={formData.icon}
          onChange={handleChange}
          placeholder="Or enter custom emoji"
          maxLength={2}
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--input-bg)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Color
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {categoryColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, color }))}
              style={{
                width: '40px',
                height: '40px',
                background: color,
                border: formData.color === color ? '3px solid white' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            />
          ))}
        </div>
        <input
          type="color"
          name="color"
          value={formData.color}
          onChange={handleChange}
          style={{
            width: '100%',
            height: '48px',
            background: 'var(--input-bg)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            cursor: 'pointer'
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
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          {category?.id ? 'Update Category' : 'Create Category'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '12px 24px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
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

export const CategoryManagement: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [addingSubcategoryTo, setAddingSubcategoryTo] = useState<number | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await categoriesApi.getAll();
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this category? This action cannot be undone.')) return;

    try {
      await categoriesApi.delete(id);
      await loadCategories();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete category. It may have associated transactions.');
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setAddingSubcategoryTo(null);
    setShowAddPanel(true);
  };

  const handleAddSubcategory = (parentId: number) => {
    setAddingSubcategoryTo(parentId);
    setEditingCategory({
      id: 0,
      name: '',
      icon: '📁',
      color: '#3b82f6',
      parent_id: parentId,
      is_system: false
    });
    setShowAddPanel(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setAddingSubcategoryTo(null);
    setShowAddPanel(true);
  };

  const handleClosePanel = () => {
    setShowAddPanel(false);
    setEditingCategory(null);
    setAddingSubcategoryTo(null);
  };

  const handleSuccess = () => {
    handleClosePanel();
    loadCategories();
  };

  // Filter categories
  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Separate parent and subcategories
  const parentCategories = filteredCategories.filter((cat) => !cat.parent_id);
  const getSubcategories = (parentId: number) =>
    filteredCategories.filter((cat) => cat.parent_id === parentId);

  if (loading) {
    return (
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
        <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Loading categories...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Categories</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Organize your transactions with categories and subcategories</p>
        </div>
        <button
          onClick={handleAddCategory}
          style={{
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.3s'
          }}
        >
          <Plus size={20} />
          Add Category
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{
          padding: '20px',
          background: 'var(--bg-card)',
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
              <Folder size={20} color="#3b82f6" />
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Main Categories</span>
          </div>
          <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{parentCategories.length}</p>
        </div>

        <div style={{
          padding: '20px',
          background: 'var(--bg-card)',
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
              <Tag size={20} color="#a855f7" />
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Subcategories</span>
          </div>
          <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {categories.filter(c => c.parent_id).length}
          </p>
        </div>

        <div style={{
          padding: '20px',
          background: 'var(--bg-card)',
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
              <Search size={20} color="#22c55e" />
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Total Items</span>
          </div>
          <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{categories.length}</p>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={20} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 12px 12px 44px',
              background: 'var(--input-bg)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
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
              <X size={20} color="#64748b" />
            </button>
          )}
        </div>
      </div>

      {/* Categories List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {parentCategories.length === 0 ? (
          <div style={{
            padding: '60px 20px',
            background: 'var(--bg-card)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <Folder size={64} color="#64748b" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginBottom: '20px' }}>No categories found</p>
            <button
              onClick={handleAddCategory}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Plus size={20} />
              Create Your First Category
            </button>
          </div>
        ) : (
          parentCategories.map((category) => {
            const subcategories = getSubcategories(category.id);

            return (
              <div
                key={category.id}
                style={{
                  padding: '24px',
                  background: 'var(--bg-card)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  transition: 'all 0.3s'
                }}
              >
                {/* Parent Category */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: subcategories.length > 0 ? '20px' : '0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      fontSize: '40px',
                      width: '60px',
                      height: '60px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `${category.color}20`,
                      borderRadius: '12px'
                    }}>
                      {category.icon}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {category.name}
                      </h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                        {subcategories.length} subcategory{subcategories.length !== 1 ? 'ies' : ''}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleEdit(category)}
                      style={{
                        padding: '10px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '8px',
                        color: '#3b82f6',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.3s'
                      }}
                      title="Edit category"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(category.id)}
                      style={{
                        padding: '10px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.3s'
                      }}
                      title="Delete category"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Subcategories */}
                {subcategories.length > 0 && (
                  <div style={{
                    paddingLeft: '76px',
                    borderLeft: '2px solid rgba(255, 255, 255, 0.1)',
                    marginBottom: '16px'
                  }}>
                    {subcategories.map((sub) => (
                      <div
                        key={sub.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--surface-hover)',
                          borderRadius: '8px',
                          marginBottom: '8px',
                          transition: 'all 0.3s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            fontSize: '24px',
                            width: '40px',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: `${sub.color}20`,
                            borderRadius: '8px'
                          }}>
                            {sub.icon}
                          </div>
                          <span style={{ color: 'var(--text-primary)', fontSize: '15px' }}>{sub.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => handleEdit(sub)}
                            style={{
                              padding: '8px',
                              background: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: '6px',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'all 0.3s'
                            }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(sub.id)}
                            style={{
                              padding: '8px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '6px',
                              color: '#ef4444',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'all 0.3s'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Subcategory Button */}
                <div style={{ paddingLeft: '76px' }}>
                  <button
                    onClick={() => handleAddSubcategory(category.id)}
                    style={{
                      padding: '10px 16px',
                      background: 'var(--surface-hover)',
                      border: '1px dashed rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      color: 'var(--text-secondary)',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.3s'
                    }}
                  >
                    <Plus size={16} />
                    Add Subcategory
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Suggested Categories */}
      {parentCategories.length === 0 && (
        <div style={{
          marginTop: '24px',
          padding: '24px',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            Suggested Categories
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' }}>
            {Object.entries(categoryIcons).map(([name, icon]) => (
              <div
                key={name}
                onClick={() => {
                  setEditingCategory({
                    id: 0,
                    name: name,
                    icon: icon,
                    color: categoryColors[Math.floor(Math.random() * categoryColors.length)],
                    is_system: false
                  });
                  setShowAddPanel(true);
                }}
                style={{
                  padding: '16px',
                  background: 'var(--input-bg)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
                <p style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '500' }}>{name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddPanel}
        onClose={handleClosePanel}
        title={editingCategory?.id ? 'Edit Category' : 'Add Category'}
        maxWidth="600px"
      >
        <CategoryForm
          category={editingCategory}
          parentCategories={parentCategories}
          onSuccess={handleSuccess}
          onCancel={handleClosePanel}
        />
      </Modal>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
