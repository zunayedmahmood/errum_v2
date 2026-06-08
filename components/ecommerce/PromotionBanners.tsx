"use client";

import React, { useEffect, useMemo, useState } from "react";

interface PromotionBannerItem {
  promotion_id: number;
  timer_enabled?: boolean;
  image: string;
  promotion?: {
    id: number;
    name: string;
    code?: string;
    end_date?: string | null;
  };
}

interface PromotionBannersProps {
  items: PromotionBannerItem[];
}

function getTimerLabel(endDate?: string | null): string {
  if (!endDate) return "No end date";

  const end = new Date(endDate).getTime();
  if (!Number.isFinite(end)) return "No end date";

  const diff = end - Date.now();
  if (diff <= 0) return "Promotion ended";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const two = (value: number) => String(value).padStart(2, "0");
  if (days > 0) return `Time left: ${days}d ${two(hours)}h ${two(minutes)}m ${two(seconds)}s`;
  return `Time left: ${two(hours)}h ${two(minutes)}m ${two(seconds)}s`;
}

function PromotionTimer({ endDate, overlay = false }: { endDate?: string | null; overlay?: boolean }) {
  const [label, setLabel] = useState(() => getTimerLabel(endDate));

  useEffect(() => {
    setLabel(getTimerLabel(endDate));
    const interval = window.setInterval(() => setLabel(getTimerLabel(endDate)), 1000);
    return () => window.clearInterval(interval);
  }, [endDate]);

  if (overlay) {
    return (
      <div className="absolute right-3 top-3 z-10 rounded-2xl border border-white/50 bg-white/60 px-3 py-2 text-xs font-extrabold text-black shadow-lg backdrop-blur-md md:right-5 md:top-5 md:px-4 md:text-sm">
        {label}
      </div>
    );
  }

  return (
    <div className="mt-3 text-center text-base font-extrabold tracking-wide text-black md:text-lg">
      {label}
    </div>
  );
}

export default function PromotionBanners({ items }: PromotionBannersProps) {
  const safeItems = useMemo(() => (items || []).filter(item => item?.image).slice(0, 3), [items]);

  if (safeItems.length === 0) return null;

  const renderBanner = (item: PromotionBannerItem, isLarge = false, overlayTimer = false) => (
    <div className="h-full w-full">
      <div className={`relative overflow-hidden rounded-none bg-gray-100 ${isLarge ? 'min-h-[400px] md:min-h-[500px]' : 'min-h-[200px] md:min-h-[240px]'}`}>
        {item.timer_enabled && overlayTimer && (
          <PromotionTimer endDate={item.promotion?.end_date} overlay />
        )}
        <img
          src={item.image}
          alt={item.promotion?.name || "Promotion banner"}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-105"
        />
      </div>
      {item.timer_enabled && !overlayTimer && (
        <PromotionTimer endDate={item.promotion?.end_date} />
      )}
    </div>
  );

  return (
    <section className="container mx-auto px-4 py-12">
      <div className={`grid gap-4 md:gap-6 ${
        safeItems.length === 1 ? 'grid-cols-1' :
        safeItems.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
        'grid-cols-1 md:grid-cols-3 md:grid-rows-2'
      }`}>
        {safeItems.length === 1 && (
          <div className="col-span-1">
            {renderBanner(safeItems[0], true, false)}
          </div>
        )}

        {safeItems.length === 2 && (
          <>
            <div className="col-span-1">
              {renderBanner(safeItems[0], true, false)}
            </div>
            <div className="col-span-1">
              {renderBanner(safeItems[1], true, false)}
            </div>
          </>
        )}

        {safeItems.length === 3 && (
          <>
            <div className="md:col-span-2 md:row-span-2">
              {renderBanner(safeItems[0], true, true)}
            </div>
            <div className="md:col-span-1 md:row-span-1">
              {renderBanner(safeItems[1], false, true)}
            </div>
            <div className="md:col-span-1 md:row-span-1">
              {renderBanner(safeItems[2], false, true)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
