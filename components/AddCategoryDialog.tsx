"use client";

import React, { useState, useEffect } from "react";
import { X, ChevronRight, ChevronDown } from "lucide-react";
import { Category } from '@/services/categoryService';
import categoryService from '@/services/categoryService';

interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (formData: FormData) => void;
  editCategory?: Category | null;
  parentId?: number | null;
}

export default function AddCategoryDialog({
  open,
  onOpenChange,
  onSave,
  editCategory,
  parentId: initialParentId,
}: AddCategoryDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const [removeBanner, setRemoveBanner] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [parentId, setParentId] = useState<number | null>(initialParentId ?? null);
  const [showParentSelector, setShowParentSelector] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (editCategory) {
      setTitle(editCategory.title);
      setDescription(editCategory.description || "");
      setImageFile(null);
      setImagePreview("");
      setBannerFile(null);
      setBannerPreview("");
      setRemoveBanner(false);
      setParentId(initialParentId ?? null);
    } else {
      setTitle("");
      setDescription("");
      setImageFile(null);
      setImagePreview("");
      setBannerFile(null);
      setBannerPreview("");
      setRemoveBanner(false);
      setParentId(initialParentId ?? null);
    }
  }, [editCategory, open, initialParentId]);

  useEffect(() => {
    if (open) {
      loadCategories();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
      if (bannerPreview && bannerPreview.startsWith('blob:')) {
        URL.revokeObjectURL(bannerPreview);
      }
    };
  }, [imagePreview, bannerPreview]);

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const data = await categoryService.getTree(true);
      
      // Transform all_children to children for consistency
      const transformCategories = (cats: Category[]): Category[] => {
        return cats.map(cat => ({
          ...cat,
          children: cat.all_children ? transformCategories(cat.all_children) : []
        }));
      };
      
      const transformedData = transformCategories(data);
      setCategories(transformedData);
      
      // Start with all categories collapsed
      setExpandedCategories(new Set());
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  };

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const getSelectedCategoryPath = (): string => {
    if (!parentId) return "None (Root Level)";
    
    const findCategoryWithPath = (cats: Category[], path: string[] = []): string | null => {
      for (const cat of cats) {
        const currentPath = [...path, cat.title];
        
        if (cat.id === parentId) {
          return currentPath.join(' > ');
        }
        
        if (cat.children) {
          const found = findCategoryWithPath(cat.children, currentPath);
          if (found) return found;
        }
      }
      return null;
    };

    return findCategoryWithPath(categories) || "Unknown";
  };

  const renderCategoryTree = (cats: Category[], depth = 0): React.ReactNode => {
    return cats.map((cat) => {
      // Skip the category being edited to prevent circular reference
      if (editCategory && cat.id === editCategory.id) return null;

      const isExpanded = expandedCategories.has(cat.id);
      const hasChildren = cat.children && cat.children.length > 0;
      const isSelected = parentId === cat.id;

      return (
        <div key={cat.id}>
          <div
            className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
              isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''
            }`}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCategory(cat.id);
                }}
                className="flex-shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                )}
              </button>
            ) : (
              <div className="w-5" />
            )}
            <div
              onClick={() => {
                setParentId(cat.id);
                setShowParentSelector(false);
              }}
              className="flex-1 py-1"
            >
              <span className={`text-sm ${isSelected ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                {cat.title}
              </span>
            </div>
          </div>
          {isExpanded && hasChildren && (
            <div>
              {renderCategoryTree(cat.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setBannerFile(file);
    const previewUrl = URL.createObjectURL(file);
    setBannerPreview(previewUrl);
    setRemoveBanner(false);
  };

  const handleSaveClick = () => {
    if (!title) {
      alert('Please fill in title');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    if (description) {
      formData.append('description', description);
    }
    if (parentId !== null) {
      formData.append('parent_id', String(parentId));
    }
    if (imageFile) {
      formData.append('image', imageFile);
    }
    if (bannerFile) {
      formData.append('banner', bannerFile);
    }
    if (removeBanner) {
      formData.append('remove_banner', '1');
    }

    onSave(formData);

    // Reset form
    setTitle("");
    setDescription("");
    setImageFile(null);
    setImagePreview("");
    setBannerFile(null);
    setBannerPreview("");
    setRemoveBanner(false);
    setParentId(null);
    setExpandedCategories(new Set());
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editCategory ? "Edit Category" : initialParentId ? "Add Subcategory" : "Add New Category"}
          </h2>
          <button onClick={() => onOpenChange(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Title <span className="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="Category title" 
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-white">Description</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder="Category description" 
              rows={3} 
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-900 dark:text-white" 
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Parent Category (optional)
            </label>
            
            <div className="relative">
              <button
                onClick={() => setShowParentSelector(!showParentSelector)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-left flex items-center justify-between text-gray-900 dark:text-white"
              >
                <span className="text-sm truncate">{getSelectedCategoryPath()}</span>
                <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ml-2 ${showParentSelector ? 'rotate-180' : ''}`} />
              </button>

              {showParentSelector && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  <div
                    onClick={() => {
                      setParentId(null);
                      setShowParentSelector(false);
                    }}
                    className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm transition-colors ${
                      parentId === null ? 'bg-blue-50 dark:bg-blue-900/30 font-medium text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    None (Root Level)
                  </div>
                  {loadingCategories ? (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading categories...</div>
                  ) : (
                    renderCategoryTree(categories)
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-white">Upload Image</label>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleImageUpload}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-200 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-300" 
            />

            {imagePreview && imagePreview.trim() !== '' && (
              <img 
                src={imagePreview} 
                alt="Preview" 
                className="w-full h-32 object-cover rounded border border-gray-200 dark:border-gray-700 mt-2" 
              />
            )}

            {!imagePreview && editCategory?.image_url && editCategory.image_url.trim() !== '' && (
              <img 
                src={editCategory.image_url} 
                alt="Current image" 
                className="w-full h-32 object-cover rounded border border-gray-200 dark:border-gray-700 mt-2" 
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-white">Category Banner</label>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleBannerUpload}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-200 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-300" 
            />

            {bannerPreview && bannerPreview.trim() !== '' && (
              <div className="relative mt-2">
                <img 
                  src={bannerPreview} 
                  alt="Banner Preview" 
                  className="w-full h-32 object-cover rounded border border-gray-200 dark:border-gray-700" 
                />
                <button 
                  onClick={() => { setBannerFile(null); setBannerPreview(""); }}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {!bannerPreview && editCategory?.banner_url && !removeBanner && (
              <div className="relative mt-2">
                <img 
                  src={editCategory.banner_url} 
                  alt="Current banner" 
                  className="w-full h-32 object-cover rounded border border-gray-200 dark:border-gray-700" 
                />
                <button 
                  onClick={() => setRemoveBanner(true)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button 
            onClick={() => onOpenChange(false)} 
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-900 dark:text-white"
          >
            Cancel
          </button>
          <button 
            onClick={handleSaveClick} 
            disabled={!title} 
            className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {editCategory ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}