import type { WorkKind } from './types';

/**
 * Pastel tone system (borrowed from Still Reading). Every tone is a CSS
 * variable defined per theme in index.css, so night mode swaps the pastels
 * for deep tinted surfaces automatically. Text on a tone uses --on-pastel.
 */
export type Tone = 'butter' | 'sage' | 'blush' | 'lavender' | 'sky' | 'honey';

export const toneVar = (tone: Tone) => `var(--${tone})`;

/** Fill + text pair for a pastel chip. */
export const toneChip = (tone: Tone) => ({
  backgroundColor: toneVar(tone),
  color: 'var(--on-pastel)',
});

/** Soft top-down wash that fades into the canvas, for hero headers. */
export const toneWash = (tone: Tone) =>
  `linear-gradient(180deg, color-mix(in srgb, ${toneVar(tone)} 70%, var(--bg-canvas)) 0%, color-mix(in srgb, ${toneVar(tone)} 28%, var(--bg-canvas)) 55%, var(--bg-canvas) 100%)`;

export const WORK_KIND_TONE: Record<WorkKind, Tone> = {
  screenplay: 'lavender',
};

export const SECTION_KIND_TONE: Record<'scene', Tone> = {
  scene: 'lavender',
};

export type UnitStatus = 'Outline' | 'In Progress' | 'Polished';

export const STATUS_STYLE: Record<
  UnitStatus,
  { tone: Tone | null; dot: string }
> = {
  Outline: { tone: null, dot: 'var(--ink-4)' },
  'In Progress': { tone: null, dot: 'var(--signal)' },
  Polished: { tone: 'sage', dot: 'var(--good)' },
};

/** Screenplay scene tone from the slugline's time of day. */
export const timeOfDayTone = (tod: string): Tone => {
  if (tod.includes('NIGHT') || tod.includes('EVENING')) return 'lavender';
  if (tod.includes('DAWN') || tod.includes('DUSK') || tod.includes('MORNING'))
    return 'blush';
  return 'butter';
};
