"use client";

import { useState, useEffect } from "react";
import { Plus, Search } from "lucide-react";

import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import CategoryListItem from "@/components/CategoryListItem";
import AddCategoryDialog from "@/components/AddCategoryDialog";
import Toast from "@/components/Toast";
import AccessDenied from "@/components/AccessDenied";
import categoryService, { Category } from "@/services/categoryService";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function CategoryPageWrapper() {
  const { hasAnyPermission, hasPermission, permissionsResolved } = useAuth();
  const canView = hasAnyPermission(['categories.view', 'categories.create', 'categories.edit', 'categories.delete']);
  const canCreate = hasPermission('categories.create');
  const canEdit = hasPermission('categories.edit');
  const canDelete = hasPermission('categories.delete');
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  } | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  // If permissions are not yet reliably resolved (e.g. /me missing role.permissions),
  // do NOT block the page. Backend will still enforce 403 on actions.
  if (permissionsResolved && !canView) {
    return <AccessDenied />;
  }

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
  };

  const loadCategories = async () => {
    try {
      setLoading(true);
      // Load tree structure to show nested categories
      const result = await categoryService.getTree(true);
      
      // Transform all_children to children
      const transformCategories = (cats: Category[]): Category[] => {
        return cats
          .filter(cat => cat.is_active) // Filter out inactive categories
          .map(cat => ({
            ...cat,
            children: cat.all_children ? transformCategories(cat.all_children) : []
          }));
      };
      
      setCategories(transformCategories(result));
    } catch (error: any) {
      console.error('Failed to load categories:', error);
      showToast(error.message || 'Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!canDelete) {
      showToast("You don't have permission to delete categories", 'warning');
      return;
    }
    if (!confirm('Are you sure you want to delete this category?')) return;
    
    try {
      await categoryService.delete(id);
      showToast('Category deleted successfully!', 'success');
      loadCategories();
    } catch (error: any) {
      console.error('Failed to delete category:', error);
      showToast(error.response?.data?.message || 'Failed to delete category', 'error');
    }
  };

  const handleHardDelete = async (id: number, title: string) => {
    if (!canDelete) {
      showToast("You don't have permission to delete categories", 'warning');
      return;
    }
    // Extra safety for permanent delete
    const firstConfirm = confirm(
      `Permanently delete "${title}"?\n\nThis cannot be undone.`
    );
    if (!firstConfirm) return;

    const typed = prompt(`Type the category title to confirm: ${title}`);
    if (typed !== title) {
      showToast('Confirmation text did not match. Hard delete canceled.', 'warning');
      return;
    }

    try {
      const res = await categoryService.hardDelete(id);
      showToast(res.message || 'Category permanently deleted', 'success');
      loadCategories();
    } catch (error: any) {
      console.error('Failed to hard delete category:', error);
      showToast(error.response?.data?.message || 'Failed to permanently delete category', 'error');
    }
  };

  const handleEdit = (category: Category) => {
    if (!canEdit) {
      showToast("You don't have permission to edit categories", 'warning');
      return;
    }
    setEditCategory(category);
    setParentId(category.parent_id || null);
    setDialogOpen(true);
  };

  const handleAddSubcategory = (parentId: number) => {
    if (!canCreate) {
      showToast("You don't have permission to create categories", 'warning');
      return;
    }
    setParentId(parentId);
    setEditCategory(null);
    setDialogOpen(true);
  };

  const handleSave = async (formData: FormData) => {
    try {
      if (editCategory && !canEdit) {
        showToast("You don't have permission to edit categories", 'warning');
        return;
      }
      if (!editCategory && !canCreate) {
        showToast("You don't have permission to create categories", 'warning');
        return;
      }
      if (editCategory) {
        await categoryService.update(editCategory.id, formData);
        showToast('Category updated successfully!', 'success');
      } else {
        await categoryService.create(formData);
        showToast('Category created successfully!', 'success');
      }
      
      setEditCategory(null);
      setParentId(null);
      setDialogOpen(false);
      loadCategories();
    } catch (error: any) {
      console.error('Failed to save category:', error);
      showToast(error.response?.data?.message || 'Failed to save category', 'error');
    }
  };

  // Filter categories based on search query
  const filterCategories = (cats: Category[], query: string): Category[] => {
    if (!query) return cats;
    
    const lowerQuery = query.toLowerCase();
    
    return cats.reduce((acc: Category[], cat) => {
      const matchesTitle = cat.title.toLowerCase().includes(lowerQuery);
      const matchesDescription = cat.description?.toLowerCase().includes(lowerQuery);
      const matchesSlug = cat.slug.toLowerCase().includes(lowerQuery);
      
      // Check if children match
      const filteredChildren = cat.children ? filterCategories(cat.children, query) : [];
      
      // Include if this category matches OR if any children match
      if (matchesTitle || matchesDescription || matchesSlug || filteredChildren.length > 0) {
        acc.push({
          ...cat,
          children: filteredChildren.length > 0 ? filteredChildren : cat.children
        });
      }
      
      return acc;
    }, []);
  };

  const filteredCategories = filterCategories(categories, searchQuery);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-6">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
                    Categories
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manage your product categories and subcategories
                  </p>
                </div>
                {canCreate && (
                  <button
                    onClick={() => {
                      setEditCategory(null);
                      setParentId(null);
                      setDialogOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Category
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">Loading categories...</p>
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'No categories found matching your search' : 'No categories found. Create your first category!'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCategories.map((category) => (
                  <CategoryListItem
                    key={category.id}
                    category={category}
                    onDelete={canDelete ? handleDelete : undefined}
                    onHardDelete={canDelete ? handleHardDelete : undefined}
                    onEdit={canEdit ? handleEdit : undefined}
                    onAddSubcategory={canCreate ? handleAddSubcategory : undefined}
                  />
                ))}
              </div>
            )}

            <AddCategoryDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              onSave={handleSave}
              editCategory={editCategory}
              parentId={parentId}
            />
          </main>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}