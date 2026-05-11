"use client";

import React from "react";
import Link from "next/link";

interface BanneredItem {
  id: number;
  type: 'category' | 'collection';
  title: string;
  subtitle?: string;
  image: string;
  href: string;
  show_text?: boolean;
}

interface BanneredCollectionsProps {
  items: BanneredItem[];
}

export default function BanneredCollections({ items }: BanneredCollectionsProps) {
  if (!items || items.length === 0) return null;

  const renderItem = (item: BanneredItem, isLarge: boolean = false) => (
    <Link
      href={item.href}
      className={`group relative overflow-hidden block w-full h-full ${isLarge ? 'min-h-[400px] md:min-h-[500px]' : 'min-h-[200px] md:min-h-[240px]'}`}
    >
      <img
        src={item.image}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
      
      {item.show_text && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
          <div className="absolute inset-0 p-6 md:p-10 flex flex-col justify-end text-white">
            {item.subtitle && (
              <span className="text-xs md:text-sm font-medium tracking-widest uppercase mb-2 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                {item.subtitle}
              </span>
            )}
            <h3 className={`font-bold ${isLarge ? 'text-2xl md:text-4xl' : 'text-xl md:text-2xl'} mb-3`}>
              {item.title}
            </h3>
            <div className="flex items-center gap-2 text-xs md:text-sm font-semibold uppercase tracking-wider group-hover:gap-4 transition-all duration-300">
              <span>Explore</span>
              <div className="w-8 h-px bg-white" />
            </div>
          </div>
        </>
      )}
    </Link>
  );

  return (
    <section className="container mx-auto px-4 py-12">
      <div className={`grid gap-4 md:gap-6 ${
        items.length === 1 ? 'grid-cols-1' : 
        items.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 
        'grid-cols-1 md:grid-cols-3 md:grid-rows-2'
      }`}>
        {items.length === 1 && (
          <div className="col-span-1">
            {renderItem(items[0], true)}
          </div>
        )}
        
        {items.length === 2 && (
          <>
            <div className="col-span-1">
              {renderItem(items[0], true)}
            </div>
            <div className="col-span-1">
              {renderItem(items[1], true)}
            </div>
          </>
        )}
        
        {items.length === 3 && (
          <>
            <div className="md:col-span-2 md:row-span-2">
              {renderItem(items[0], true)}
            </div>
            <div className="md:col-span-1 md:row-span-1">
              {renderItem(items[1], false)}
            </div>
            <div className="md:col-span-1 md:row-span-1">
              {renderItem(items[2], false)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
