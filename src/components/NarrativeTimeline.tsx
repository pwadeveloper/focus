import React from 'react';
import { Plus } from 'lucide-react';

export interface TimelineItem {
  id: string;
  title: string;
  badge: string;
  words: number;
  durationMinutes: number;
  /** Short beat list shown under the column (characters, synopsis). */
  beats: string[];
}

interface NarrativeTimelineProps {
  items: TimelineItem[];
  activeId: string;
  totalMinutes: number;
  onOpen: (id: string) => void;
  onAppend: () => void;
}

/** Narrow columns still need room for a readable bar label. */
const MIN_COLUMN_PX = 136;
const MAX_BEATS = 5;

/**
 * Minimal Gantt-style narrative timeline: one ink bar per scene, stepping
 * down and to the right in script order, with dashed column guides, a muted
 * label row, and each scene's beats listed beneath its column.
 */
export const NarrativeTimeline: React.FC<NarrativeTimelineProps> = ({
  items,
  activeId,
  totalMinutes,
  onOpen,
  onAppend,
}) => {
  // Column widths follow word count, floored so short scenes stay legible.
  const maxWords = Math.max(1, ...items.map((i) => i.words));
  const weights = items.map((i) => Math.max(i.words, maxWords * 0.55, 1));
  const columns = weights.map((w) => `minmax(${MIN_COLUMN_PX}px, ${w}fr)`).join(' ');
  const minWidth = items.length * MIN_COLUMN_PX;

  const gridStyle: React.CSSProperties = { gridTemplateColumns: columns };

  return (
    <section>
      {/* Section header: eyebrow, title, rule */}
      <div className="flex items-end justify-between gap-4 border-b border-[var(--border-strong)] pb-3">
        <div>
          <div className="text-xs text-[var(--ink-3)]">Narrative arc</div>
          <h2 className="text-2xl font-medium tracking-[-0.03em] text-[var(--ink-1)]">
            Timeline
          </h2>
        </div>
        <div className="flex items-baseline gap-4 [font-variant-numeric:tabular-nums]">
          <span className="text-xs text-[var(--ink-3)]">
            ~{totalMinutes} min runtime
          </span>
          <span className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink-1)]">
            {String(items.length).padStart(2, '0')}/
          </span>
        </div>
      </div>

      <div className="focus-scroller -mx-1 overflow-x-auto px-1 pb-2">
        <div className="relative pt-6" style={{ minWidth }}>
          {/* Dashed column guides spanning the full chart height */}
          <div
            aria-hidden="true"
            style={gridStyle}
            className="pointer-events-none absolute inset-0 grid"
          >
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`border-l border-dashed border-[var(--border-strong)] ${
                  idx === items.length - 1 ? 'border-r' : ''
                }`}
              />
            ))}
          </div>

          {/* Staggered bars: one row per scene */}
          <div style={gridStyle} className="relative grid gap-y-2.5">
            {items.map((item, idx) => {
              const isActive = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-birdseye-tile="true"
                  onClick={() => onOpen(item.id)}
                  title={`${item.badge} · ${item.words.toLocaleString()} words · Open in editor`}
                  aria-current={isActive ? 'true' : undefined}
                  style={{ gridColumn: idx + 1, gridRow: idx + 1 }}
                  className="flex min-h-10 items-center gap-2 rounded-[14px] bg-[var(--ink-1)] px-4 py-2 text-start text-[13px] font-medium leading-tight text-[var(--bg-canvas)] transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.98]"
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-[var(--signal)]"
                    />
                  )}
                  <span className="line-clamp-2 [overflow-wrap:anywhere]">{item.title}</span>
                </button>
              );
            })}
          </div>

          {/* Column labels */}
          <div
            style={gridStyle}
            className="relative mt-6 grid text-center text-[11px] [font-variant-numeric:tabular-nums]"
          >
            {items.map((item) => (
              <div
                key={item.id}
                className={`truncate px-2 ${
                  item.id === activeId
                    ? 'font-medium text-[var(--ink-1)]'
                    : 'text-[var(--ink-3)]'
                }`}
              >
                {item.badge}
              </div>
            ))}
          </div>

          {/* Beats under each column */}
          <div style={gridStyle} className="relative mt-5 grid pb-6">
            {items.map((item) => (
              <ul key={item.id} className="min-w-0 space-y-2 px-3">
                {item.beats.length > 0 ? (
                  item.beats.slice(0, MAX_BEATS).map((beat, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs leading-snug text-[var(--ink-2)]"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[5px] size-1 shrink-0 rounded-full bg-[var(--ink-1)]"
                      />
                      <span className="line-clamp-2">{beat}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-[var(--ink-4)]">No beats yet</li>
                )}
              </ul>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onAppend}
        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
      >
        <Plus className="size-3.5" />
        Add scene
      </button>
    </section>
  );
};
