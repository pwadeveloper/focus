import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import {
  PanelLeft,
  Eye,
  AlignCenterHorizontal,
  SlidersHorizontal,
  Download,
  Maximize2,
  Minimize2,
  Keyboard,
  Check,
  Copy,
  FileText,
  FileCode,
  Printer,
  PenLine,
  Film,
  Plus,
  Archive,
  GitCommitHorizontal,
  CircleHelp,
  Users,
} from 'lucide-react';
import {
  FocusMode,
  FontSizeStep,
  FontVoice,
  MeasureStep,
  ThemeMode,
  WorkKind,
  WorkspaceViewMode,
  WriterSettings,
} from '../types';
import { gsapButtonHover, gsapRowHover, prefersReducedMotion } from '../motion';
import { WORK_KIND_TONE, toneChip } from '../palette';
import { guideShortcut } from '../screenplay';
import { FocusMark } from './FocusLogo';
import { WriterAvatar } from './WriterAvatar';
import type { RoomWriter } from '../../api/_lib/types';

interface TopBarProps {
  /** Return to the welcome home page. */
  onOpenHome: () => void;
  onOpenWritersRoom: () => void;
  /** Other writers in this writers room script, and where they are */
  collaborators?: { writer: RoomWriter; where: string }[];
  isTyping: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  workKind: WorkKind;
  docTitle: string;
  activeUnitBadge?: string;
  viewMode: WorkspaceViewMode;
  onToggleViewMode: () => void;
  onToggleCabinetView: () => void;
  onOpenNewWorkModal: () => void;
  saveStatus: 'saved' | 'saving';
  settings: WriterSettings;
  onUpdateSettings: (partial: Partial<WriterSettings>) => void;
  onExportMarkdown: () => void;
  onExportText: () => void;
  onExportHtml: () => void;
  onCopyMarkdown: () => void;
  onCopyPlainText: () => void;
  onOpenShortcuts: () => void;
  screenplayGuideOpen?: boolean;
  onToggleScreenplayGuide?: () => void;
  /** Screenplays: open the paginated export (PDF / HTML) dialog. */
  onOpenScreenplayExport?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenHome,
  onOpenWritersRoom,
  collaborators,
  isTyping,
  sidebarOpen,
  onToggleSidebar,
  workKind,
  docTitle,
  activeUnitBadge,
  viewMode,
  onToggleViewMode,
  onToggleCabinetView,
  onOpenNewWorkModal,
  saveStatus,
  settings,
  onUpdateSettings,
  onExportMarkdown,
  onExportText,
  onExportHtml,
  onCopyMarkdown,
  onCopyPlainText,
  onOpenShortcuts,
  screenplayGuideOpen = false,
  onToggleScreenplayGuide,
  onOpenScreenplayExport,
}) => {
  const [openMenu, setOpenMenu] = useState<'appearance' | 'export' | null>(null);
  const [copiedType, setCopiedType] = useState<'md' | 'txt' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isTyping) {
      setOpenMenu(null);
    }
  }, [isTyping]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.style.opacity = isTyping ? '0' : '1';
      el.style.pointerEvents = isTyping ? 'none' : 'auto';
      return;
    }

    gsap.to(el, {
      y: isTyping ? -6 : 0,
      autoAlpha: isTyping ? 0 : 1,
      duration: isTyping ? 0.28 : 0.22,
      ease: 'power2.out',
      overwrite: 'auto',
      onStart: () => {
        el.style.pointerEvents = isTyping ? 'none' : 'auto';
      },
    });
  }, [isTyping]);

  useEffect(() => {
    const el = popoverRef.current;
    if (!el || !openMenu || prefersReducedMotion()) return;

    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.96, y: -5 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.18,
        ease: 'power3.out',
        overwrite: 'auto',
      }
    );
  }, [openMenu]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setOpenMenu(null);
      }
    };
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const cycleFocusMode = () => {
    const order: FocusMode[] = ['off', 'paragraph', 'deep'];
    const next = order[(order.indexOf(settings.focusMode) + 1) % order.length];
    onUpdateSettings({ focusMode: next });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleCopy = (type: 'md' | 'txt') => {
    if (type === 'md') onCopyMarkdown();
    else onCopyPlainText();
    setCopiedType(type);
    window.setTimeout(() => setCopiedType(null), 1500);
  };

  const focusLabel =
    settings.focusMode === 'off'
      ? 'Focus'
      : settings.focusMode === 'paragraph'
      ? 'Paragraph'
      : 'Spotlight';

  const btnHover = gsapButtonHover({ hoverScale: 1.03, hoverY: -0.5, pressScale: 0.96 });
  const rowHover = gsapRowHover(2.5);

  return (
    <header
      ref={headerRef}
      style={{
        zIndex: 'var(--z-header)',
        backgroundColor: 'color-mix(in srgb, var(--bg-canvas) 86%, transparent)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
      className="no-print fixed inset-x-0 top-0 flex min-h-14 items-center justify-between px-3 backdrop-blur-md sm:px-6"
    >
      {/* Left: Drawer Trigger + Format Badge + Document Breadcrumb + New Script */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenHome}
          {...btnHover}
          aria-label="Home"
          title="Home"
          className="relative flex size-9 items-center justify-center rounded-lg text-[var(--ink-2)] transition-colors duration-150 ease-out before:absolute before:-inset-1 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
        >
          <FocusMark className="h-[18px] w-auto" />
        </button>

        <button
          type="button"
          onClick={onToggleSidebar}
          {...btnHover}
          aria-label={sidebarOpen ? 'Hide scripts (⌘\\)' : 'Show scripts (⌘\\)'}
          title="Script Library (⌘\)"
          className="relative flex size-9 items-center justify-center rounded-lg text-[var(--ink-2)] transition-colors duration-150 ease-out before:absolute before:-inset-1 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
        >
          <PanelLeft className="size-4" strokeWidth={1.8} />
        </button>

        <button
          type="button"
          onClick={onOpenNewWorkModal}
          {...btnHover}
          title="New Screenplay"
          style={{
            backgroundColor: 'var(--ink-1)',
            color: 'var(--bg-canvas)',
          }}
          className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" strokeWidth={2} />
          <span className="hidden md:inline">New</span>
        </button>

        <button
          type="button"
          onClick={onOpenWritersRoom}
          {...btnHover}
          aria-label="Writers room"
          title="Writers room"
          className="relative flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-[var(--ink-2)] transition-colors duration-150 ease-out before:absolute before:-inset-1 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
        >
          <Users className="size-3.5" strokeWidth={1.8} />
          <span className="hidden md:inline">Room</span>
        </button>

        <div
          className="mx-0.5 h-4"
          style={{
            width: 'var(--border-hairline)',
            backgroundColor: 'var(--border-subtle)',
          }}
        />

        <div className="flex min-w-0 items-center gap-2">
          <span
            style={toneChip(WORK_KIND_TONE[workKind])}
            className="hidden items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize sm:inline-flex"
          >
            <Film className="size-3" />
            {workKind}
          </span>

          <span
            title={docTitle || 'Untitled screenplay'}
            className="max-w-[140px] truncate text-sm font-medium text-[var(--ink-1)] sm:max-w-[220px]"
          >
            {docTitle.trim() || 'Untitled'}
          </span>

          {activeUnitBadge && viewMode === 'write' && (
            <>
              <span className="hidden text-[var(--ink-4)] md:inline">/</span>
              <span className="hidden truncate text-xs font-medium text-[var(--ink-3)] md:inline">
                {activeUnitBadge}
              </span>
            </>
          )}

          <span
            aria-live="polite"
            className="hidden shrink-0 whitespace-nowrap text-xs text-[var(--ink-3)] lg:inline-block"
          >
            · {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
          </span>

          {collaborators && collaborators.length > 0 && (
            <span
              aria-label={`Also here: ${collaborators.map((c) => `${c.writer.name}, ${c.where}`).join('; ')}`}
              className="flex shrink-0 items-center -space-x-1.5 pl-1"
            >
              {collaborators.map(({ writer, where }) => (
                <WriterAvatar
                  key={writer.id}
                  writer={writer}
                  size="sm"
                  title={`${writer.name} · ${where}`}
                  className="ring-2 ring-[var(--bg-canvas)]"
                />
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Right: Cabinet Archive Toggle, Timeline/Bird's-Eye Toggle, Writing Modes, Typography, Export */}
      <div ref={menuContainerRef} className="relative flex items-center gap-1 sm:gap-1.5">
        {workKind === 'screenplay' && onToggleScreenplayGuide && (
          <button
            type="button"
            onClick={onToggleScreenplayGuide}
            {...btnHover}
            aria-pressed={screenplayGuideOpen}
            aria-label={`Screenplay elements guide (${guideShortcut()})`}
            title={`Screenplay elements & shortcuts (${guideShortcut()} or F1)`}
            style={{
              backgroundColor: screenplayGuideOpen
                ? 'var(--ink-1)'
                : 'var(--lavender)',
              color: screenplayGuideOpen
                ? 'var(--bg-canvas)'
                : 'var(--on-pastel)',
            }}
            className="relative flex size-8 items-center justify-center rounded-full transition-colors duration-150 ease-out before:absolute before:-inset-1"
          >
            <CircleHelp className="size-4" strokeWidth={1.9} />
          </button>
        )}
        <button
          type="button"
          onClick={onToggleCabinetView}
          {...btnHover}
          aria-pressed={viewMode === 'cabinet'}
          title={
            viewMode === 'cabinet'
              ? 'Return to writing (⌘K)'
              : 'Open Project Filing Cabinet & Folders (⌘K)'
          }
          style={{
            color: viewMode === 'cabinet' ? 'var(--bg-canvas)' : 'var(--ink-1)',
            backgroundColor:
              viewMode === 'cabinet' ? 'var(--ink-1)' : 'var(--bg-surface)',
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-150 ease-out"
        >
          <Archive
            className={`size-3.5 ${
              viewMode === 'cabinet' ? '' : 'text-[var(--accent)]'
            }`}
            strokeWidth={1.85}
          />
          <span className="hidden sm:inline">Cabinet</span>
        </button>

          <button
            type="button"
            onClick={onToggleViewMode}
            {...btnHover}
            aria-pressed={viewMode === 'birdseye'}
            title={
              viewMode === 'birdseye'
                ? 'Return to focused writing (⌘M)'
                : 'Narrative Timeline & Bird’s-Eye View of all Scenes (⌘M)'
            }
            style={{
              color: viewMode === 'birdseye' ? 'var(--bg-canvas)' : 'var(--ink-1)',
              backgroundColor:
                viewMode === 'birdseye' ? 'var(--ink-1)' : 'var(--bg-surface)',
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-150 ease-out"
          >
            {viewMode === 'birdseye' ? (
              <>
                <PenLine className="size-3.5" strokeWidth={1.85} />
                <span>Write</span>
              </>
            ) : (
              <>
                <GitCommitHorizontal
                  className="size-3.5 text-[var(--accent)]"
                  strokeWidth={1.85}
                />
                <span>Timeline</span>
              </>
            )}
          </button>

          <div
            className="mx-0.5 h-4"
            style={{
              width: 'var(--border-hairline)',
              backgroundColor: 'var(--border-subtle)',
            }}
          />

        {/* Focus Mode Button */}
        {viewMode === 'write' && (
          <button
            type="button"
            onClick={cycleFocusMode}
            {...btnHover}
            aria-pressed={settings.focusMode !== 'off'}
            title="Cycle Focus Mode: Off → Paragraph → Spotlight (⌘D)"
            style={{
              color: settings.focusMode !== 'off' ? 'var(--accent)' : 'var(--ink-2)',
              backgroundColor:
                settings.focusMode !== 'off' ? 'var(--accent-soft)' : 'transparent',
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
          >
            <Eye className="size-3.5" strokeWidth={1.85} />
            <span className="hidden sm:inline">{focusLabel}</span>
          </button>
        )}

        {/* Typewriter Scroll Toggle */}
        {viewMode === 'write' && (
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({ typewriterMode: !settings.typewriterMode })
            }
            {...btnHover}
            aria-pressed={settings.typewriterMode}
            title="Typewriter scrolling: Keep active line centered (⌘T)"
            style={{
              color: settings.typewriterMode ? 'var(--accent)' : 'var(--ink-2)',
              backgroundColor: settings.typewriterMode
                ? 'var(--accent-soft)'
                : 'transparent',
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
          >
            <AlignCenterHorizontal className="size-3.5" strokeWidth={1.85} />
            <span className="hidden md:inline">Typewriter</span>
          </button>
        )}

        {/* Appearance & Typography Popover Trigger */}
        <button
          type="button"
          onClick={() =>
            setOpenMenu(openMenu === 'appearance' ? null : 'appearance')
          }
          {...btnHover}
          aria-expanded={openMenu === 'appearance'}
          aria-label="Typography and theme settings"
          title="Typography & Paper Theme"
          style={{
            color: openMenu === 'appearance' ? 'var(--ink-1)' : 'var(--ink-2)',
            backgroundColor:
              openMenu === 'appearance'
                ? 'var(--bg-subtle-hover)'
                : 'transparent',
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
        >
          <SlidersHorizontal className="size-3.5" strokeWidth={1.85} />
          <span className="hidden sm:inline">Aa</span>
        </button>

        {/* Export Popover Trigger */}
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === 'export' ? null : 'export')}
          {...btnHover}
          aria-expanded={openMenu === 'export'}
          aria-label="Export or copy screenplay"
          title="Export & Copy"
          style={{
            color: openMenu === 'export' ? 'var(--ink-1)' : 'var(--ink-2)',
            backgroundColor:
              openMenu === 'export' ? 'var(--bg-subtle-hover)' : 'transparent',
          }}
          className="flex size-8 items-center justify-center rounded-lg transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
        >
          <Download className="size-3.5" strokeWidth={1.85} />
        </button>

        {/* Keyboard Shortcuts Trigger */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          {...btnHover}
          aria-label="Keyboard shortcuts (⌘/)"
          title="Keyboard shortcuts (⌘/)"
          className="hidden size-8 items-center justify-center rounded-lg text-[var(--ink-2)] transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)] sm:flex"
        >
          <Keyboard className="size-3.5" strokeWidth={1.85} />
        </button>

        {/* Fullscreen Trigger (only rendered when browser supports Fullscreen API) */}
        {typeof document !== 'undefined' && document.fullscreenEnabled && (
          <button
            type="button"
            onClick={toggleFullscreen}
            {...btnHover}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            className="hidden size-8 items-center justify-center rounded-lg text-[var(--ink-2)] transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)] sm:flex"
          >
            {isFullscreen ? (
              <Minimize2 className="size-3.5" strokeWidth={1.85} />
            ) : (
              <Maximize2 className="size-3.5" strokeWidth={1.85} />
            )}
          </button>
        )}

        {/* Appearance Popover Panel */}
        {openMenu === 'appearance' && (
          <div
            ref={popoverRef}
            style={{
              backgroundColor: 'var(--bg-elevated)',
              boxShadow: 'var(--elevation-floating)',
              transformOrigin: 'top right',
            }}
            className="absolute right-0 top-11 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl p-3.5 text-xs"
          >
            {/* Theme Picker */}
            <div className="mb-3.5">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Surface Theme
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    {
                      id: 'paper',
                      label: 'Paper',
                      bg: '#F6F2EA',
                      fg: '#111111',
                      ring: 'rgba(17,17,17,0.14)',
                    },
                    {
                      id: 'sepia',
                      label: 'Sepia',
                      bg: '#F3ECE0',
                      fg: '#261E18',
                      ring: 'rgba(42,33,25,0.16)',
                    },
                    {
                      id: 'night',
                      label: 'Night',
                      bg: '#141312',
                      fg: '#EAE4DC',
                      ring: 'rgba(255,255,255,0.18)',
                    },
                  ] as {
                    id: ThemeMode;
                    label: string;
                    bg: string;
                    fg: string;
                    ring: string;
                  }[]
                ).map((t) => {
                  const selected = settings.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onUpdateSettings({ theme: t.id })}
                      {...btnHover}
                      style={{
                        backgroundColor: t.bg,
                        color: t.fg,
                        boxShadow: selected
                          ? '0 0 0 2px var(--accent)'
                          : `0 0 0 1px ${t.ring}`,
                      }}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-lg font-medium transition-shadow duration-150 ease-out"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: t.fg }}
                      />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Typeface Voice */}
            <div className="mb-3.5">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Typeface Voice
              </div>
              <div
                style={{ backgroundColor: 'var(--bg-surface)' }}
                className="grid grid-cols-3 gap-1 rounded-xl p-1"
              >
                {(
                  [
                    {
                      id: 'serif',
                      name: 'Editorial',
                      sample: 'Serif',
                      fontClass: 'font-serif',
                    },
                    {
                      id: 'sans',
                      name: 'Clean',
                      sample: 'Sans',
                      fontClass: 'font-sans',
                    },
                    {
                      id: 'mono',
                      name: 'Draft',
                      sample: 'Mono',
                      fontClass: 'font-mono',
                    },
                  ] as {
                    id: FontVoice;
                    name: string;
                    sample: string;
                    fontClass: string;
                  }[]
                ).map((voice) => {
                  const active = settings.fontVoice === voice.id;
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => onUpdateSettings({ fontVoice: voice.id })}
                      {...btnHover}
                      style={{
                        backgroundColor: active
                          ? 'var(--bg-elevated)'
                          : 'transparent',
                        boxShadow: active ? 'var(--elevation-raised)' : 'none',
                        color: active ? 'var(--ink-1)' : 'var(--ink-2)',
                      }}
                      className="flex flex-col items-center rounded-lg py-1.5 transition-[color,background-color,box-shadow] duration-150 ease-out"
                    >
                      <span className={`text-sm font-medium ${voice.fontClass}`}>
                        {voice.sample}
                      </span>
                      <span className="text-[10px] text-[var(--ink-3)]">
                        {voice.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Text Scale */}
            <div className="mb-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  Type Scale
                </span>
                <span className="text-[11px] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">
                  {settings.fontSize === 'sm'
                    ? '17px'
                    : settings.fontSize === 'base'
                    ? '19px'
                    : settings.fontSize === 'lg'
                    ? '21px'
                    : '24px'}
                </span>
              </div>
              <div
                style={{ backgroundColor: 'var(--bg-surface)' }}
                className="grid grid-cols-4 gap-1 rounded-xl p-1"
              >
                {(
                  [
                    { id: 'sm', label: 'S' },
                    { id: 'base', label: 'M' },
                    { id: 'lg', label: 'L' },
                    { id: 'xl', label: 'XL' },
                  ] as { id: FontSizeStep; label: string }[]
                ).map((s) => {
                  const active = settings.fontSize === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onUpdateSettings({ fontSize: s.id })}
                      {...btnHover}
                      style={{
                        backgroundColor: active
                          ? 'var(--bg-elevated)'
                          : 'transparent',
                        boxShadow: active ? 'var(--elevation-raised)' : 'none',
                        color: active ? 'var(--ink-1)' : 'var(--ink-2)',
                      }}
                      className="h-7 rounded-lg font-medium transition-[color,background-color,box-shadow] duration-150 ease-out"
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Measure / Line Width */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  Line Measure
                </span>
                <span className="text-[11px] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">
                  {settings.measure === 'narrow'
                    ? '56ch'
                    : settings.measure === 'balanced'
                    ? '65ch'
                    : '74ch'}
                </span>
              </div>
              <div
                style={{ backgroundColor: 'var(--bg-surface)' }}
                className="grid grid-cols-3 gap-1 rounded-xl p-1"
              >
                {(
                  [
                    { id: 'narrow', label: 'Narrow' },
                    { id: 'balanced', label: 'Balanced' },
                    { id: 'wide', label: 'Wide' },
                  ] as { id: MeasureStep; label: string }[]
                ).map((m) => {
                  const active = settings.measure === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdateSettings({ measure: m.id })}
                      {...btnHover}
                      style={{
                        backgroundColor: active
                          ? 'var(--bg-elevated)'
                          : 'transparent',
                        boxShadow: active ? 'var(--elevation-raised)' : 'none',
                        color: active ? 'var(--ink-1)' : 'var(--ink-2)',
                      }}
                      className="h-7 rounded-lg font-medium transition-[color,background-color,box-shadow] duration-150 ease-out"
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Export & Copy Popover */}
        {openMenu === 'export' && (
          <div
            ref={popoverRef}
            style={{
              backgroundColor: 'var(--bg-elevated)',
              boxShadow: 'var(--elevation-floating)',
              transformOrigin: 'top right',
            }}
            className="absolute right-0 top-11 w-56 rounded-2xl p-1.5 text-xs"
          >
            <div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              Copy Full Script
            </div>
            <button
              type="button"
              onClick={() => handleCopy('md')}
              {...rowHover}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-start font-medium text-[var(--ink-1)] transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)]"
            >
              <span className="flex items-center gap-2">
                {copiedType === 'md' ? (
                  <Check className="size-3.5 text-[var(--accent)]" />
                ) : (
                  <Copy className="size-3.5 text-[var(--ink-2)]" />
                )}
                {copiedType === 'md' ? 'Copied Markdown' : 'Copy as Markdown'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleCopy('txt')}
              {...rowHover}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-start font-medium text-[var(--ink-1)] transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)]"
            >
              <span className="flex items-center gap-2">
                {copiedType === 'txt' ? (
                  <Check className="size-3.5 text-[var(--accent)]" />
                ) : (
                  <Copy className="size-3.5 text-[var(--ink-2)]" />
                )}
                {copiedType === 'txt' ? 'Copied plain text' : 'Copy plain text'}
              </span>
            </button>

            <div
              className="my-1"
              style={{
                height: 'var(--border-hairline)',
                backgroundColor: 'var(--border-subtle)',
              }}
            />

            <div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              Download File
            </div>
            <button
              type="button"
              onClick={() => {
                onExportMarkdown();
                setOpenMenu(null);
              }}
              {...rowHover}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-start font-medium text-[var(--ink-1)] transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)]"
            >
              <span className="flex items-center gap-2">
                <FileCode className="size-3.5 text-[var(--ink-2)]" />
                Markdown (.md)
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                onExportText();
                setOpenMenu(null);
              }}
              {...rowHover}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-start font-medium text-[var(--ink-1)] transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)]"
            >
              <span className="flex items-center gap-2">
                <FileText className="size-3.5 text-[var(--ink-2)]" />
                Plain text (.txt)
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                if (onOpenScreenplayExport) onOpenScreenplayExport();
                else onExportHtml();
              }}
              {...rowHover}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-start font-medium text-[var(--ink-1)] transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)]"
            >
              <span className="flex items-center gap-2">
                <FileCode className="size-3.5 text-[var(--ink-2)]" />
                {onOpenScreenplayExport ? 'Screenplay pages (.html)…' : 'HTML document (.html)'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                if (onOpenScreenplayExport) onOpenScreenplayExport();
                else window.print();
              }}
              {...rowHover}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-start font-medium text-[var(--ink-1)] transition-colors duration-150 ease-out hover:bg-[var(--bg-subtle-hover)]"
            >
              <span className="flex items-center gap-2">
                <Printer className="size-3.5 text-[var(--ink-2)]" />
                {onOpenScreenplayExport ? 'Print / Save PDF…' : 'Print / Save PDF'}
              </span>
              {!onOpenScreenplayExport && (
                <span className="text-[11px] text-[var(--ink-3)]">⌘P</span>
              )}
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
