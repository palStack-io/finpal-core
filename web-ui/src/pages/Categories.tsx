/**
 * Categories Page
 * Manage categories and subcategories
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Categories</h1>
            <p className="text-gray-400">
              Organize your transactions with categories
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-5 w-5 mr-2" />
            New Category
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card hover>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Folder className="h-5 w-5 text-blue-500" />
              </div>
              <span className="text-gray-400 text-sm">Total Categories</span>
            </div>
            <p className="text-2xl font-bold text-white">{parentCategories.length}</p>
          </Card>

          <Card hover>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Tag className="h-5 w-5 text-purple-500" />
              </div>
              <span className="text-gray-400 text-sm">Subcategories</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {categories.filter((c) => c.parent_id).length}
            </p>
          </Card>

          <Card hover>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Search className="h-5 w-5 text-green-500" />
              </div>
              <span className="text-gray-400 text-sm">Total Items</span>
            </div>
            <p className="text-2xl font-bold text-white">{categories.length}</p>
          </Card>
        </div>

        {/* Search Bar */}
        <Card>
          <Input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="h-5 w-5" />}
            fullWidth
          />
        </Card>

        {/* Categories List */}
        <div className="space-y-4">
          {parentCategories.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <Tag className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">No categories found</p>
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
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="text-4xl">{categoryIcon}</div>
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {category.name}
                        </h3>
                        <p className="text-gray-400 text-sm">
                          {subcategories.length} subcategories
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCategory(category)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteCategory(category.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Subcategories */}
                  {subcategories.length > 0 && (
                    <div className="pl-12 space-y-2 border-l-2 border-gray-800">
                      {subcategories.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-background-darker/50 hover:bg-background-darker transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Tag className="h-4 w-4 text-gray-400" />
                            <span className="text-white">{sub.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingCategory(sub)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteCategory(sub.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Subcategory Button */}
                  <div className="mt-4 pl-12">
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
                      <Plus className="h-4 w-4 mr-2" />
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
          <h2 className="text-xl font-bold text-white mb-4">
            Suggested Categories
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(categoryIcons).map(([name, icon]) => (
              <div
                key={name}
                className="p-4 rounded-lg bg-background-darker/50 border border-gray-800 hover:border-gray-700 transition-colors text-center cursor-pointer"
                onClick={() => {
                  setEditingCategory({
                    id: 0,
                    name: name,
                    user_id: 0,
                  });
                  setShowCreateModal(true);
                }}
              >
                <div className="text-3xl mb-2">{icon}</div>
                <p className="text-white text-xs font-medium">{name}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
};
