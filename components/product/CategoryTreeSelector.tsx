'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { CategoryTree } from '@/services/categoryService';

interface CategoryTreeSelectorProps {
  categories: CategoryTree[];
  selectedCategoryId: string;
  onSelect: (categoryId: string) => void;
  disabled?: boolean;
  /** Optional label (default: "Category") */
  label?: string;
  /** Whether to show required asterisk on label (default: true) */
  required?: boolean;
  /** Placeholder text shown when no category is selected (default: "Select category") */
  placeholder?: string;
  /** Whether to show the helper line "Selected: ..." (default: true) */
  showSelectedInfo?: boolean;
  /** Whether to show the clear option at top of dropdown (default: true) */
  allowClear?: boolean;
  /** Text for the clear option (default: "Clear selection") */
  clearText?: string;
}

interface TreeNodeProps {
  category: CategoryTree;
  selectedCategoryId: string;
  onSelect: (categoryId: string) => void;
  level: number;
}

function TreeNode({ category, selectedCategoryId, onSelect, level }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const children = category.children || category.all_children || [];
  const hasChildren = children.length > 0;
  const isSelected = String(category.id) === String(selectedCategoryId);

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
        }`}
        style={{ paddingLeft: `${level * 1.5 + 0.75}rem` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="flex-shrink-0 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <div className="w-5" />
        )}
        <button
          onClick={() => onSelect(String(category.id))}
          className="flex-1 text-left text-sm font-medium"
        >
          {category.title}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div className="mt-1">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              category={child}
              selectedCategoryId={selectedCategoryId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryTreeSelector({
  categories,
  selectedCategoryId,
  onSelect,
  disabled = false,
  label = 'Category',
  required = true,
  placeholder = 'Select category',
  showSelectedInfo = true,
  allowClear = true,
  clearText = 'Clear selection',
}: CategoryTreeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getSelectedCategoryName = (): string => {
    const findCategory = (cats: CategoryTree[], id: string): CategoryTree | null => {
      for (const cat of cats) {
        if (String(cat.id) === String(id)) return cat;
        const children = cat.children || cat.all_children || [];
        const found = findCategory(children, id);
        if (found) return found;
      }
      return null;
    };

    if (!selectedCategoryId) return placeholder;
    const found = findCategory(categories, selectedCategoryId);
    return found ? found.title : placeholder;
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}{required ? <span className="text-red-500"> *</span> : null}
      </label>
      
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-left flex items-center justify-between ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
      >
        <span className={selectedCategoryId ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}>
          {getSelectedCategoryName()}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
 
       {isOpen && !disabled && (
         <>
           <div
             className="fixed inset-0 z-40"
             onClick={() => setIsOpen(false)}
           />
           <div className="absolute z-50 mt-2 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-80 overflow-y-auto">
            <div className="p-2">
              {allowClear && (
                <button
                  onClick={() => {
                    onSelect('');
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {clearText}
                </button>
              )}
              {categories.map((category) => (
                <TreeNode
                  key={category.id}
                  category={category}
                  selectedCategoryId={selectedCategoryId}
                  onSelect={(id) => {
                    onSelect(id);
                    setIsOpen(false);
                  }}
                  level={0}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {showSelectedInfo && selectedCategoryId && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Selected: {getSelectedCategoryName()}
        </p>
      )}
    </div>
  );
}