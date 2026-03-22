'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Category {
  id: number;
  name: string;
  slug?: string;
  product_count?: number;
  children?: Category[];
}

interface CategorySidebarProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  selectedPriceRange: string;
  onPriceRangeChange: (range: string) => void;
  selectedStock: string;
  onStockChange: (stock: string) => void;
  useIdForRouting?: boolean;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export default function CategorySidebar({
  categories,
  activeCategory,
  onCategoryChange,
  selectedPriceRange,
  onPriceRangeChange,
  selectedStock,
  onStockChange,
  useIdForRouting = false,
}: CategorySidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  const toggleCategory = (categoryId: number) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const isActive = (category: Category) => {
    const normalizedActive = decodeURIComponent(activeCategory || '').toLowerCase();

    // Check ID match
    if (normalizedActive === String(category.id)) return true;

    // Legacy/Slug match
    const slug = (category.slug || slugify(category.name)).toLowerCase();
    return normalizedActive === slug || normalizedActive === category.name.toLowerCase();
  };

  const categoryRouteValue = (category: Category) => 
    useIdForRouting ? String(category.id) : slugify(category.name);

  const renderCategory = (category: Category, level = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedCategories.has(category.id);

    return (
      <div key={category.id} className="mb-1">
        <div
          className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${isActive(category)
              ? 'bg-[rgba(212,169,106,0.16)] text-white font-medium border border-[rgba(212,169,106,0.25)]'
              : 'hover:bg-white/5 text-white/70'
            }`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
        >
          <span
            onClick={() => onCategoryChange(categoryRouteValue(category))}
            className="flex-1"
          >
            {category.name}
          </span>
          {hasChildren && (
            <button
              onClick={() => toggleCategory(category.id)}
              className="p-1 hover:bg-white/5 rounded"
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="mt-1 max-h-[400px] overflow-y-auto ec-scrollbar pr-1">
            {category.children!.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="ec-dark-card p-4">
        <h3 className="font-semibold text-white mb-4">Categories</h3>
        <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 ec-scrollbar">
          <div
            className={`p-2 rounded cursor-pointer transition-colors ${activeCategory === 'all'
                ? 'bg-[rgba(212,169,106,0.16)] text-white font-medium border border-[rgba(212,169,106,0.25)]'
                : 'hover:bg-white/5 text-white/70'
              }`}
            onClick={() => onCategoryChange('all')}
          >
            All Categories
          </div>
          {categories.map(category => renderCategory(category))}
        </div>
      </div>

      <div className="ec-dark-card p-4">
        <h3 className="font-semibold text-white mb-4">Price Range</h3>
        <div className="space-y-2">
          {[
            { value: 'all', label: 'All Prices' },
            { value: '0-500', label: 'Under ৳500' },
            { value: '500-1000', label: '৳500 - ৳1,000' },
            { value: '1000-2000', label: '৳1,000 - ৳2,000' },
            { value: '2000-5000', label: '৳2,000 - ৳5,000' },
            { value: '5000-999999', label: 'Above ৳5,000' },
          ].map((range) => (
            <label key={range.value} className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="priceRange"
                value={range.value}
                checked={selectedPriceRange === range.value}
                onChange={(e) => onPriceRangeChange(e.target.value)}
                className="mr-2 accent-[var(--gold)] focus:ring-neutral-200"
              />
              <span className="text-sm text-white/70">{range.label}</span>
            </label>
          ))}
        </div>
      </div>

    </div>
  );
}
