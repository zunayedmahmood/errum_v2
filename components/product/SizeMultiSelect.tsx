'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Plus, Search, X, Loader2 } from 'lucide-react';
import { sizeService } from '@/services/sizeService';

interface SizeMultiSelectProps {
  allOptions: string[];
  selectedOptions: string[];
  onSelect: (options: string[]) => void;
  onCreateSize: (name: string) => Promise<void>;
  placeholder?: string;
}

export default function SizeMultiSelect({
  allOptions,
  selectedOptions,
  onSelect,
  onCreateSize,
  placeholder = 'Select sizes...',
}: SizeMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newSizeName, setNewSizeName] = useState('');
  const [tempSelected, setTempSelected] = useState<string[]>([]);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTempSelected(selectedOptions);
      setSearch('');
      setIsCreating(false);
    }
  }, [isOpen, selectedOptions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = allOptions.filter(opt => 
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (option: string) => {
    if (tempSelected.includes(option)) {
      setTempSelected(tempSelected.filter(o => o !== option));
    } else {
      setTempSelected([...tempSelected, option]);
    }
  };

  const handleApply = () => {
    onSelect(tempSelected);
    setIsOpen(false);
  };

  const handleCreateNew = async () => {
    const name = newSizeName.trim();
    if (!name) return;
    
    try {
      setIsCreating(true);
      await onCreateSize(name);
      setTempSelected([...tempSelected, name]);
      setNewSizeName('');
      setIsCreating(false);
      setSearch('');
    } catch (error) {
      console.error('Failed to create size:', error);
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (newSizeName.trim()) {
        handleCreateNew();
      } else {
        handleApply();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-400 dark:hover:border-gray-500"
      >
        <div className="flex flex-wrap gap-1 items-center overflow-hidden">
          {selectedOptions.length === 0 ? (
            <span className="text-gray-500 dark:text-gray-400">{placeholder}</span>
          ) : (
            selectedOptions.map(opt => (
              <span
                key={opt}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium"
              >
                {opt}
                <X
                  className="w-3 h-3 cursor-pointer hover:text-blue-800 dark:hover:text-blue-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(selectedOptions.filter(o => o !== opt));
                  }}
                />
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full min-w-[240px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="p-3 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search or add size..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white"
              />
            </div>
          </div>

          <div className="max-h-[240px] overflow-y-auto p-1">
            {filteredOptions.length === 0 && !search ? (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No sizes found.
              </div>
            ) : filteredOptions.length === 0 && search ? (
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewSizeName(search);
                    handleCreateNew();
                  }}
                  disabled={isCreating}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add "{search}"
                </button>
              </div>
            ) : (
              <>
                {filteredOptions.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleOption(option)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors group"
                  >
                    <span>{option}</span>
                    {tempSelected.includes(option) && (
                      <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    )}
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
            <div className="flex-1">
              {search && !allOptions.includes(search) && (
                 <button
                 type="button"
                 onClick={() => {
                   setNewSizeName(search);
                   handleCreateNew();
                 }}
                 disabled={isCreating}
                 className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
               >
                 {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                 Quick Add
               </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-4 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
              >
                Apply ({tempSelected.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
