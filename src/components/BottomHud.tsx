import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { Target, ChevronUp } from 'lucide-react';
import { TextMetrics } from '../types';
import { gsapButtonHover, prefersReducedMotion } from '../motion';

interface BottomHudProps {
  isTyping: boolean;
  metrics: TextMetrics;
  wordGoal: number;
  onChangeWordGoal: (goal: number) => void;
}

export const BottomHud: React.FC<BottomHudProps> = ({
  isTyping,
  metrics,
  wordGoal,
  onChangeWordGoal,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isTyping) {
      setExpanded(false);
    }
  }, [isTyping]);

  // GSAP auto-hide / reveal while typing
  useEffect(() => {
    const el = hudRef.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.style.opacity = isTyping ? '0' : '1';
      el.style.pointerEvents = isTyping ? 'none' : 'auto';
      return;
    }

    gsap.to(el, {
      y: isTyping ? 6 : 0,
      autoAlpha: isTyping ? 0 : 1,
      duration: isTyping ? 0.28 : 0.22,
      ease: 'power2.out',
      overwrite: 'auto',
      onStart: () => {
        el.style.pointerEvents = isTyping ? 'none' : 'auto';
      },
    });
  }, [isTyping]);

  // GSAP origin-aware popover entrance when expanded
  useEffect(() => {
    const el = popoverRef.current;
    if (!el || !expanded || prefersReducedMotion()) return;

    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.95, y: 6 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.18,
        ease: 'power3.out',
        overwrite: 'auto',
      }
    );
  }, [expanded]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (hudRef.current && !hudRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const progress =
    wordGoal > 0 ? Math.min(100, Math.round((metrics.words / wordGoal) * 100)) : 0;
  const radius = 6.5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const presets = [250, 500, 1000, 1500, 2000];
  const pillHover = gsapButtonHover({ hoverScale: 1.025, hoverY: -1, pressScale: 0.97 });
  const btnHover = gsapButtonHover({ hoverScale: 1.04, hoverY: -0.5, pressScale: 0.95 });

  return (
    <div
      ref={hudRef}
      style={{
        zIndex: 'var(--z-header)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      className="no-print fixed bottom-4 right-4 sm:bottom-5 sm:right-6"
    >
      {/* Expanded metrics & word goal popover */}
      {expanded && (
        <div
          ref={popoverRef}
          style={{
            backgroundColor: 'var(--bg-elevated)',
            boxShadow: 'var(--elevation-floating)',
            transformOrigin: 'bottom right',
          }}
          className="mb-2 w-64 rounded-2xl p-3.5 text-xs"
        >
          <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
            Script Statistics
          </div>

          <div className="grid grid-cols-2 gap-2 [font-variant-numeric:tabular-nums]">
            <div
              style={{ backgroundColor: 'var(--bg-surface)' }}
              className="rounded-xl p-2.5"
            >
              <div className="text-base font-semibold text-[var(--ink-1)]">
                {metrics.words.toLocaleString()}
              </div>
              <div className="text-[11px] text-[var(--ink-3)]">Words</div>
            </div>
            <div
              style={{ backgroundColor: 'var(--bg-surface)' }}
              className="rounded-xl p-2.5"
            >
              <div className="text-base font-semibold text-[var(--ink-1)]">
                {metrics.characters.toLocaleString()}
              </div>
              <div className="text-[11px] text-[var(--ink-3)]">Characters</div>
            </div>
            <div
              style={{ backgroundColor: 'var(--bg-surface)' }}
              className="rounded-xl p-2.5"
            >
              <div className="text-base font-semibold text-[var(--ink-1)]">
                {metrics.paragraphs.toLocaleString()}
              </div>
              <div className="text-[11px] text-[var(--ink-3)]">Paragraphs</div>
            </div>
            <div
              style={{ backgroundColor: 'var(--bg-surface)' }}
              className="rounded-xl p-2.5"
            >
              <div className="text-base font-semibold text-[var(--ink-1)]">
                {metrics.readingTimeMinutes === 0
                  ? '0 min'
                  : `${metrics.readingTimeMinutes} min`}
              </div>
              <div className="text-[11px] text-[var(--ink-3)]">Reading time</div>
            </div>
          </div>

          <div
            className="my-3"
            style={{
              height: 'var(--border-hairline)',
              backgroundColor: 'var(--border-subtle)',
            }}
          />

          <div className="mb-2 flex items-center justify-between [font-variant-numeric:tabular-nums]">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              <Target className="size-3" />
              Word Target
            </span>
            <span className="font-medium text-[var(--ink-2)]">
              {metrics.words} / {wordGoal} ({progress}%)
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1 [font-variant-numeric:tabular-nums]">
            {presets.map((goal) => {
              const active = wordGoal === goal;
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => onChangeWordGoal(goal)}
                  {...btnHover}
                  style={{
                    backgroundColor: active
                      ? 'var(--butter)'
                      : 'var(--bg-surface)',
                    color: active ? 'var(--on-pastel)' : 'var(--ink-2)',
                  }}
                  className="rounded-lg py-1.5 text-[11px] font-medium transition-colors duration-150 ease-out hover:text-[var(--ink-1)]"
                >
                  {goal}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact Pill */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        {...pillHover}
        aria-expanded={expanded}
        aria-label="Toggle writing statistics and word goal"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          boxShadow: 'var(--elevation-raised)',
        }}
        className="flex h-8 items-center gap-2 rounded-full pl-3 pr-2.5 text-xs font-medium text-[var(--ink-2)] transition-[color,box-shadow] duration-150 ease-out [font-variant-numeric:tabular-nums] hover:text-[var(--ink-1)]"
      >
        {/* Progress ring */}
        <svg className="size-4 -rotate-90" viewBox="0 0 18 18" aria-hidden="true">
          <circle
            cx="9"
            cy="9"
            r={radius}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth="2"
          />
          <circle
            cx="9"
            cy="9"
            r={radius}
            fill="none"
            stroke={progress >= 100 ? 'var(--good)' : 'var(--signal)'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>

        <span>
          {metrics.words.toLocaleString()}{' '}
          {metrics.words === 1 ? 'word' : 'words'}
        </span>
        <span className="text-[var(--ink-4)]">·</span>
        <span className="text-[var(--ink-3)]">
          {metrics.readingTimeMinutes === 0
            ? '< 1m read'
            : `${metrics.readingTimeMinutes}m read`}
        </span>
        <ChevronUp
          className={`size-3.5 text-[var(--ink-3)] transition-transform duration-150 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
    </div>
  );
};
