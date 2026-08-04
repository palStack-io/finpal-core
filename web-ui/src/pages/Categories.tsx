/**
 * Categories Page
 * Manage categories and subcategories
 *
 * Inline styles with CSS variables (the house pattern — see
 * components/settings/ImportSources.tsx). Tailwind's config hardcodes its dark
 * background with no `data-theme` awareness, so the classes this page used could
 * not follow the light/dark toggle.
 */

import React, { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Loading } from '../components/common/Loading';
import { categoryService, type Category } from '../services/categoryService';
import {
  Plus,
  Edit2,
  Trash2,
  Tag,
  Folder,
  Search,
  MoreVertical,
} from 'lucide-react';

const stackStyle = (gap: string): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap,
});

/** Responsive columns without media queries, matching the repo's auto-fit grids. */
const autoGridStyle = (min: string, gap: string): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`,
  gap,
});

const statIconStyle = (background: string): React.CSSProperties => ({
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  background,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

const statLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '14px',
};

const statValueStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: '24px',
  fontWeight: '700',
  margin: 0,
};

const statHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '8px',
};

const subRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '12px',
  borderRadius: '8px',
  background: 'var(--surface-hover)',
  transition: 'background 0.2s',
};

const suggestionTileStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '8px',
  background: 'var(--surface-hover)',
  border: '1px solid var(--border-light)',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'border-color 0.2s',
};

export const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await categoryService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      await categoryService.deleteCategory(id);
      await loadCategories();
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category. It may have associated transactions.');
    }
  };

  // Filter categories
  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Separate parent and subcategories
  const parentCategories = filteredCategories.filter((cat) => !cat.parent_id);
  const getSubcategories = (parentId: number) =>
    filteredCategories.filter((cat) => cat.parent_id === parentId);

  // Category icons mapping
  const categoryIcons: Record<string, string> = {
    'Food & Dining': '🍔',
    Transportation: '🚗',
    Entertainment: '🎬',
    Shopping: '🛍️',
    Utilities: '⚡',
    Healthcare: '🏥',
    Housing: '🏠',
    Income: '💰',
    Savings: '🐷',
    Travel: '✈️',
    Education: '📚',
    Fitness: '💪',
  };

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={stackStyle('24px')}>
        {/* Header */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}>
          <div>
            <h1 style={{
              color: 'var(--text-primary)',
              fontSize: '30px',
              fontWeight: '700',
              margin: '0 0 8px',
            }}>
              Categories
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Organize your transactions with categories
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={20} />
            New Category
          </Button>
        </div>

        {/* Stats Cards */}
        <div style={autoGridStyle('250px', '24px')}>
          <Card hover>
            <div style={statHeaderStyle}>
              <div style={statIconStyle('rgba(59, 130, 246, 0.2)')}>
                <Folder size={20} style={{ color: '#3b82f6' }} />
              </div>
              <span style={statLabelStyle}>Total Categories</span>
            </div>
            <p style={statValueStyle}>{parentCategories.length}</p>
          </Card>

          <Card hover>
            <div style={statHeaderStyle}>
              {/* Purple has no CSS-variable equivalent; kept literal like the other
                  semantic accents. */}
              <div style={statIconStyle('rgba(168, 85, 247, 0.2)')}>
                <Tag size={20} style={{ color: '#a855f7' }} />
              </div>
              <span style={statLabelStyle}>Subcategories</span>
            </div>
            <p style={statValueStyle}>
              {categories.filter((c) => c.parent_id).length}
            </p>
          </Card>

          <Card hover>
            <div style={statHeaderStyle}>
              <div style={statIconStyle('rgba(34, 197, 94, 0.2)')}>
                <Search size={20} style={{ color: '#22c55e' }} />
              </div>
              <span style={statLabelStyle}>Total Items</span>
            </div>
            <p style={statValueStyle}>{categories.length}</p>
          </Card>
        </div>

        {/* Search Bar */}
        <Card>
          <Input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search size={20} />}
            fullWidth
          />
        </Card>

        {/* Categories List */}
        <div style={stackStyle('16px')}>
          {parentCategories.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Tag
                  size={64}
                  style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 16px' }}
                />
                <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  No categories found
                </p>
                <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                  Create Your First Category
                </Button>
              </div>
            </Card>
          ) : (
            parentCategories.map((category) => {
              const subcategories = getSubcategories(category.id);
              const categoryIcon = categoryIcons[category.name] || category.icon || '📁';

              return (
                <Card key={category.id} hover>
                  {/* Parent Category */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap',
                    marginBottom: '16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
                      <div style={{ fontSize: '36px', lineHeight: 1 }}>{categoryIcon}</div>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{
                          color: 'var(--text-primary)',
                          fontSize: '18px',
                          fontWeight: '700',
                          margin: 0,
                        }}>
                          {category.name}
                        </h3>
                        <p style={{
                          color: 'var(--text-secondary)',
                          fontSize: '14px',
                          margin: '4px 0 0',
                        }}>
                          {subcategories.length} subcategories
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Edit category"
                        onClick={() => setEditingCategory(category)}
                      >
                        <Edit2 size={16} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Delete category"
                        onClick={() => handleDeleteCategory(category.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>

                  {/* Subcategories */}
                  {subcategories.length > 0 && (
                    <div style={{
                      ...stackStyle('8px'),
                      paddingLeft: '48px',
                      borderLeft: '2px solid var(--border-light)',
                    }}>
                      {subcategories.map((sub) => (
                        <div
                          key={sub.id}
                          style={subRowStyle}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--surface-active)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--surface-hover)';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            <Tag size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                            <span style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                              {sub.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label="Edit subcategory"
                              onClick={() => setEditingCategory(sub)}
                            >
                              <Edit2 size={12} />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label="Delete subcategory"
                              onClick={() => handleDeleteCategory(sub.id)}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Subcategory Button */}
                  <div style={{ marginTop: '16px', paddingLeft: '48px' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCategory({
                          id: 0,
                          name: '',
                          parent_id: category.id,
                          user_id: 0,
                        });
                        setShowCreateModal(true);
                      }}
                    >
                      <Plus size={16} />
                      Add Subcategory
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* Default Categories Info */}
        <Card>
          <h2 style={{
            color: 'var(--text-primary)',
            fontSize: '20px',
            fontWeight: '700',
            margin: '0 0 16px',
          }}>
            Suggested Categories
          </h2>
          <div style={autoGridStyle('120px', '12px')}>
            {Object.entries(categoryIcons).map(([name, icon]) => (
              <div
                key={name}
                style={suggestionTileStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-medium)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-light)';
                }}
                onClick={() => {
                  setEditingCategory({
                    id: 0,
                    name: name,
                    user_id: 0,
                  });
                  setShowCreateModal(true);
                }}
              >
                <div style={{ fontSize: '30px', marginBottom: '8px' }}>{icon}</div>
                <p style={{
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: '500',
                  margin: 0,
                }}>
                  {name}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
};
