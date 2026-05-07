'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  selectedSort?: string;
  onSortChange?: (sort: any) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
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
  selectedSort,
  onSortChange,
  searchQuery,
  onSearchChange,
  searchInputRef,
  useIdForRouting = false,
}: CategorySidebarProps) {
  const router = useRouter();
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
              ? 'bg-[var(--cyan-pale)] text-[var(--cyan)] font-medium border border-[var(--cyan-border)]'
              : 'hover:bg-[var(--ivory-ghost)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
        >
          <span
            onClick={() => {
              const slug = slugify(category.name);
              router.push(`/e-commerce/${encodeURIComponent(slug)}`);
              onCategoryChange(categoryRouteValue(category));
            }}
            className="flex-1"
          >
            {category.name}
          </span>
          {hasChildren && (
            <button
              onClick={() => toggleCategory(category.id)}
              className="p-1 hover:bg-[var(--cyan-pale)] hover:text-[var(--cyan)] rounded transition-colors"
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
      {onSearchChange && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4">
          <h3 className="font-semibold text-[var(--text-primary)] mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>Search</h3>
          <div className="relative">
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Size, color, fabric..."
              value={searchQuery || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-[var(--bg-root)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--cyan)] transition-all placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>
      )}

      {onSortChange && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>Sort By</h3>
          <div className="space-y-2">
            {[
              { id: 'newest', label: 'Newest Arrivals' },
              { id: 'price_asc', label: 'Price: Low to High' },
              { id: 'price_desc', label: 'Price: High to Low' },
            ].map((option) => (
              <label key={option.id} className="flex items-center cursor-pointer group">
                <input
                  type="radio"
                  name="sortOrder"
                  value={option.id}
                  checked={selectedSort === option.id}
                  onChange={(e) => onSortChange(e.target.value)}
                  className="mr-2 accent-[var(--cyan)]"
                />
                <span className={`text-sm transition-colors ${selectedSort === option.id ? 'text-[var(--cyan)] font-medium' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>Categories</h3>
        <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 ec-scrollbar">
          <div
            className={`p-2 rounded cursor-pointer transition-colors ${activeCategory === 'all'
                ? 'bg-[var(--cyan-pale)] text-[var(--cyan)] font-medium border border-[var(--cyan-border)]'
                : 'hover:bg-[var(--ivory-ghost)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            onClick={() => {
              router.push('/e-commerce/products');
              onCategoryChange('all');
            }}
          >
            All Categories
          </div>
          {categories.map(category => renderCategory(category))}
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>Price Range</h3>
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
                className="mr-2 accent-[var(--cyan)] focus:ring-[var(--cyan-border)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">{range.label}</span>
            </label>
          ))}
        </div>
      </div>

    </div>
  );
}
