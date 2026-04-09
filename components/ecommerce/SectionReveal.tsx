'use client';

import React, { useEffect, useRef, useState } from 'react';

interface SectionRevealProps {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
  triggerOnce?: boolean;
  staggerChildren?: boolean;
}

/**
 * 7.2 — Section Entry: Scroll-Triggered Reveals
 * Wraps any section and animates it in when it enters the viewport.
 */
export default function SectionReveal({
  children,
  className = '',
  threshold = 0.1,
  triggerOnce = true,
  staggerChildren = false,
}: SectionRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.unobserve(entry.target);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      {
        threshold,
      }
    );

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [threshold, triggerOnce]);

  // If staggerChildren is true, we could inject staggered delays via CSS vars
  // or just let the children handle their own animations.
  // For now, we apply the ec-reveal base classes to the wrapper.

  return (
    <div
      ref={ref}
      className={`ec-reveal ${isVisible ? 'ec-reveal-active' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
