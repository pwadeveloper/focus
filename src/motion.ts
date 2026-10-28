import React from 'react';
import gsap from 'gsap';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function canHover(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Returns subtle GSAP mouse event handlers for interactive buttons & pills.
 * Animates only GPU-accelerated transform properties (scale, y, x) with overwrite: 'auto'.
 */
export function gsapButtonHover(options?: {
  hoverScale?: number;
  hoverY?: number;
  pressScale?: number;
}) {
  const hoverScale = options?.hoverScale ?? 1.025;
  const hoverY = options?.hoverY ?? -0.5;
  const pressScale = options?.pressScale ?? 0.96;

  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (prefersReducedMotion() || !canHover()) return;
      gsap.to(e.currentTarget, {
        scale: hoverScale,
        y: hoverY,
        duration: 0.16,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      if (prefersReducedMotion()) return;
      gsap.to(e.currentTarget, {
        scale: 1,
        y: 0,
        x: 0,
        duration: 0.18,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    },
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      if (prefersReducedMotion()) return;
      gsap.to(e.currentTarget, {
        scale: pressScale,
        y: 0,
        duration: 0.1,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    },
    onMouseUp: (e: React.MouseEvent<HTMLElement>) => {
      if (prefersReducedMotion()) return;
      gsap.to(e.currentTarget, {
        scale: canHover() ? hoverScale : 1,
        y: canHover() ? hoverY : 0,
        duration: 0.14,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    },
  };
}

/**
 * Subtle horizontal slide on hover for menu/list rows.
 */
export function gsapRowHover(nudgeX = 2.5) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (prefersReducedMotion() || !canHover()) return;
      gsap.to(e.currentTarget, {
        x: nudgeX,
        duration: 0.16,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      if (prefersReducedMotion()) return;
      gsap.to(e.currentTarget, {
        x: 0,
        scale: 1,
        duration: 0.16,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    },
  };
}

