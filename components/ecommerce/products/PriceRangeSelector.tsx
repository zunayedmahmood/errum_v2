'use client';

import React from 'react';

interface PriceRangeSelectorProps {
  selectedPriceRange: string;
  onPriceRangeChange: (range: string) => void;
}

const PriceRangeSelector: React.FC<PriceRangeSelectorProps> = ({
  selectedPriceRange,
  onPriceRangeChange,
}) => {
  const priceRanges = [
    { value: 'all', label: 'All Prices' },
    { value: '0-500', label: 'Under ৳500' },
    { value: '500-1000', label: '৳500 - ৳1,000' },
    { value: '1000-2000', label: '৳1,000 - ৳2,000' },
    { value: '2000-5000', label: '৳2,000 - ৳5,000' },
    { value: '5000-999999', label: 'Above ৳5,000' },
  ];

  return (
    <div className="ec-dark-card p-4">
      <h3 className="font-semibold text-white mb-4" style={{ fontFamily: "'Jost', sans-serif", letterSpacing: '0.05em', fontSize: '14px', textTransform: 'uppercase' }}>Price Range</h3>
      <div className="space-y-2">
        {priceRanges.map((range) => (
          <label key={range.value} className="flex items-center cursor-pointer group">
            <div className="relative flex items-center">
              <input
                type="radio"
                name="priceRange"
                value={range.value}
                checked={selectedPriceRange === range.value}
                onChange={(e) => onPriceRangeChange(e.target.value)}
                className="sr-only"
              />
              <div 
                className={`h-4 w-4 rounded-full border transition-all flex items-center justify-center ${
                  selectedPriceRange === range.value 
                    ? 'border-[var(--gold)] bg-[var(--gold)]' 
                    : 'border-white/20 bg-transparent group-hover:border-white/40'
                }`}
              >
                {selectedPriceRange === range.value && (
                  <div className="h-1.5 w-1.5 rounded-full bg-black"></div>
                )}
              </div>
            </div>
            <span 
              className={`ml-3 text-sm transition-colors ${
                selectedPriceRange === range.value ? 'text-white font-medium' : 'text-white/60 group-hover:text-white/80'
              }`}
              style={{ fontFamily: "'Jost', sans-serif" }}
            >
              {range.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default PriceRangeSelector;
