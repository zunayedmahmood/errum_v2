'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronRight, ChevronDown, Menu } from 'lucide-react';
import { CatalogCategory } from '@/services/catalogService';

interface GlobalCategorySidebarProps {
  categories: CatalogCategory[];
  isOpen: boolean;
  onClose: () => void;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export default function GlobalCategorySidebar({ categories, isOpen, onClose }: GlobalCategorySidebarProps) {
  const router = useRouter();
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  const toggleCategory = (e: React.MouseEvent, categoryId: number) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const navigateToCategory = (category: CatalogCategory) => {
    router.push(`/e-commerce/products?category=${slugify(category.name)}`);
    onClose();
  };

  const renderCategory = (category: CatalogCategory, level = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedCategories.has(category.id);

    return (
      <div key={category.id} className="mb-0">
        <div
          onClick={() => navigateToCategory(category)}
          className={`flex items-center justify-between p-3 cursor-pointer transition-colors border-b border-[var(--border-default)] hover:bg-[var(--ivory-ghost)]`}
          style={{ paddingLeft: `${20 + level * 20}px`, paddingRight: '20px' }}
        >
          <span className="flex-1 text-[13px] font-medium text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {category.name}
          </span>
          {hasChildren && (
            <button
              onClick={(e) => toggleCategory(e, category.id)}
              className="p-3 -m-3 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="bg-[var(--bg-surface-2)] border-b border-[var(--border-default)]">
            {category.children!.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(2px)',
          }}
          className="ec-anim-backdrop"
          onClick={onClose}
        />
      )}

      {/* Side Drawer */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 101,
          width: '100%',
          maxWidth: '380px',
          background: '#ffffff',
          borderLeft: '1px solid rgba(0,0,0,0.10)',
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.10)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          height: '56px',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Menu style={{ width: '18px', height: '18px', color: '#111111' }} />
            <h2 style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: '14px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#111111',
              margin: 0,
            }}>
              Categories
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              width: '32px',
              height: '32px',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: '1px solid rgba(0,0,0,0.15)',
              color: '#999999',
              background: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#111111'; (e.currentTarget as HTMLElement).style.color = '#111111'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,0,0,0.15)'; (e.currentTarget as HTMLElement).style.color = '#999999'; }}
          >
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>

        {/* Category Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 20px 0' }} className="ec-scrollbar">
          <div
            onClick={() => { router.push('/e-commerce/products'); onClose(); }}
            className={`flex items-center justify-between p-3 cursor-pointer transition-colors border-b border-[var(--border-default)] hover:bg-[var(--ivory-ghost)]`}
            style={{ paddingLeft: '20px', paddingRight: '20px' }}
          >
            <span className="flex-1 text-[13px] font-bold text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
              All Products
            </span>
          </div>
          {categories.map(category => renderCategory(category))}
        </div>
      </div>

      {/* Mobile scroll lock */}
      <style jsx>{`
        @media (max-width: 640px) {
          body {
            overflow: ${isOpen ? 'hidden' : 'auto'};
          }
        }
      `}</style>
    </>
  );
}
