import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import {
  Plus,
  Search,
  Pin,
  Copy,
  Trash2,
  X,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Archive,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { DocumentItem, WorkKind } from '../types';
import {
  computeDocumentTotalMetrics,
  getUnitBadgeLabel,
} from '../editorUtils';
import { gsapButtonHover, gsapRowHover, prefersReducedMotion } from '../motion';
import { WORK_KIND_TONE, toneChip, toneVar } from '../palette';

interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  documents: DocumentItem[];
  activeDocId: string;
  onSelectDoc: (id: string) => void;
  onSelectDocUnit?: (docId: string, unitId: string) => void;
  onOpenCabinetView: () => void;
  onOpenNewWorkModal: () => void;
  onTogglePin: (id: string) => void;
  onDuplicateDoc: (id: string) => void;
  onDeleteDoc: (id: string) => void;
}

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  open,
  onClose,
  documents,
  activeDocId,
  onSelectDoc,
  onSelectDocUnit,
  onOpenCabinetView,
  onOpenNewWorkModal,
  onTogglePin,
  onDuplicateDoc,
  onDeleteDoc,
}) => {
  const [query, setQuery] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'folders' | 'all'>('folders');
  const [expandedFolders, setExpandedFolders] = useState<
    Record<WorkKind, boolean>
  >({
    screenplay: true,
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shouldRender, setShouldRender] = useState(open);

  const asideRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
    }
  }, [open]);

  useEffect(() => {
    if (!shouldRender) return;
    const aside = asideRef.current;
    const backdrop = backdropRef.current;
    if (!aside || !backdrop) return;

    if (prefersReducedMotion()) {
      if (!open) setShouldRender(false);
      return;
    }

    if (open) {
      gsap.fromTo(
        backdrop,
        { opacity: 0 },
        { opacity: 1, duration: 0.22, ease: 'power3.out' }
      );
      gsap.fromTo(
        aside,
        { x: -24, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.24, ease: 'power3.out' }
      );

      if (listRef.current) {
        const cards = listRef.current.querySelectorAll('[data-doc-card="true"]');
        if (cards.length > 0) {
          gsap.fromTo(
            cards,
            { x: -10, opacity: 0 },
            {
              x: 0,
              opacity: 1,
              duration: 0.22,
              stagger: 0.02,
              ease: 'power3.out',
              overwrite: 'auto',
            }
          );
        }
      }
    } else {
      gsap.to(backdrop, {
        opacity: 0,
        duration: 0.16,
        ease: 'power2.in',
      });
      gsap.to(aside, {
        x: -18,
        opacity: 0,
        duration: 0.16,
        ease: 'power2.in',
        onComplete: () => setShouldRender(false),
      });
    }
  }, [open, shouldRender]);

  if (!shouldRender) return null;

  const btnHover = gsapButtonHover({
    hoverScale: 1.03,
    hoverY: -0.5,
    pressScale: 0.96,
  });
  const rowHover = gsapRowHover(2);

  const filtered = documents.filter((d) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      d.kind.toLowerCase().includes(q) ||
      d.contentHtml.toLowerCase().includes(q)
    );
  });

  const pinnedDocs = filtered.filter((d) => d.pinned);
  const regularDocs = filtered.filter((d) => !d.pinned);

  const toggleFolder = (kind: WorkKind) => {
    setExpandedFolders((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };

  const renderWorkTypeIcon = (kind: WorkKind) => {
    const fill = toneVar(WORK_KIND_TONE[kind]);
    return (
      <Film
        className="size-3.5 shrink-0 text-[var(--ink-2)]"
        fill={fill}
        strokeWidth={1.85}
      />
    );
  };

  // ============================================================================
  // IMAGE 1-INSPIRED CONNECTED FOLDER TREE VIEW
  // ============================================================================
  const renderFolderTree = () => {
    const categories: {
      kind: WorkKind;
      label: string;
      docs: DocumentItem[];
    }[] = [
      {
        kind: 'screenplay',
        label: 'Screenplays',
        docs: filtered,
      },
    ];

    return (
      <div className="space-y-2">
        {categories.map((cat) => {
          const isExpanded = expandedFolders[cat.kind];
          const hasActiveChild = cat.docs.some((d) => d.id === activeDocId);
          const FolderIcon = isExpanded ? FolderOpen : Folder;

          return (
            <div key={cat.kind} data-doc-card="true">
              {/* Top-Level Category Folder Row with Count Badge (Image 1 style) */}
              <button
                type="button"
                onClick={() => toggleFolder(cat.kind)}
                style={{
                  backgroundColor: hasActiveChild
                    ? 'var(--bg-elevated)'
                    : 'transparent',
                }}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-[var(--bg-subtle-hover)]"
              >
                <div className="flex items-center gap-2">
                  <span
                    style={toneChip(WORK_KIND_TONE[cat.kind])}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full"
                  >
                    <FolderIcon className="size-3.5" strokeWidth={1.9} />
                  </span>
                  <span className="text-xs font-semibold text-[var(--ink-1)]">
                    {cat.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    style={toneChip(WORK_KIND_TONE[cat.kind])}
                    className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold [font-variant-numeric:tabular-nums]"
                  >
                    {cat.docs.length}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 text-[var(--ink-3)]" />
                  ) : (
                    <ChevronRight className="size-3.5 text-[var(--ink-3)]" />
                  )}
                </div>
              </button>

              {/* Connected Tree Branch for Scripts inside this Category */}
              {isExpanded && cat.docs.length > 0 && (
                <div className="relative ml-4 mt-1 space-y-1 pl-3.5">
                  {/* Vertical Tree Trunk Line */}
                  <div
                    style={{ backgroundColor: 'var(--border-strong)' }}
                    className="absolute bottom-3 left-0 top-0 w-[1px]"
                  />

                  {cat.docs.map((doc) => {
                    const isDocActive = doc.id === activeDocId;
                    const unitCount = doc.units?.length || 1;

                    return (
                      <div key={doc.id} className="relative">
                        {/* Horizontal Elbow Branch Connector (├─) */}
                        <div
                          style={{
                            borderBottom: '1px solid var(--border-strong)',
                            borderLeft: '1px solid var(--border-strong)',
                          }}
                          className=" pointer-events-none absolute -left-3.5 top-2.5 h-2.5 w-3 rounded-bl-md"
                        />

                        <button
                          type="button"
                          onClick={() => {
                            onSelectDoc(doc.id);
                            setConfirmDeleteId(null);
                          }}
                          style={{
                            backgroundColor: isDocActive
                              ? 'var(--bg-elevated)'
                              : 'transparent',
                            boxShadow: isDocActive
                              ? 'var(--elevation-raised)'
                              : 'none',
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start transition-colors hover:bg-[var(--bg-subtle-hover)]"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            {renderWorkTypeIcon(doc.kind)}
                            <span
                              style={{
                                color: isDocActive
                                  ? 'var(--ink-1)'
                                  : 'var(--ink-2)',
                              }}
                              className="truncate text-xs font-medium"
                            >
                              {doc.title.trim() || 'Untitled screenplay'}
                            </span>
                          </div>

                          <span
                            style={{ backgroundColor: 'var(--bg-subtle)' }}
                            className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--ink-3)] [font-variant-numeric:tabular-nums]"
                          >
                            {unitCount}
                          </span>
                        </button>

                        {/* Second-Level Subfolder Branch for the Active Screenplay's Scenes */}
                        {isDocActive &&
                          doc.units &&
                          doc.units.length > 0 && (
                            <div className="relative ml-3.5 mt-1 space-y-0.5 pl-3">
                              <div
                                style={{
                                  backgroundColor: 'var(--border-strong)',
                                }}
                                className="absolute bottom-2.5 left-0 top-0 w-[1px]"
                              />
                              {doc.units.map((u) => {
                                const isUnitCurrent =
                                  u.id ===
                                  (doc.activeUnitId || doc.units?.[0]?.id);
                                const badge = getUnitBadgeLabel(
                                  u,
                                  doc.units || []
                                );
                                return (
                                  <div key={u.id} className="relative">
                                    <div
                                      style={{
                                        borderBottom:
                                          '1px solid var(--border-strong)',
                                        borderLeft:
                                          '1px solid var(--border-strong)',
                                      }}
                                      className="pointer-events-none absolute -left-3 top-2 h-2 w-2.5 rounded-bl"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onSelectDocUnit) {
                                          onSelectDocUnit(doc.id, u.id);
                                        } else {
                                          onSelectDoc(doc.id);
                                        }
                                      }}
                                      className="flex w-full items-center justify-between gap-1.5 rounded-md px-2 py-1 text-start text-[11px] transition-colors hover:bg-[var(--bg-subtle-hover)]"
                                    >
                                      <span
                                        style={{
                                          color: isUnitCurrent
                                            ? 'var(--accent)'
                                            : 'var(--ink-3)',
                                        }}
                                        className="truncate font-medium"
                                      >
                                        {u.title.trim() ||
                                          (doc.kind === 'screenplay'
                                            ? u.slugline
                                            : badge)}
                                      </span>
                                      <span className="shrink-0 font-mono text-[9px] uppercase text-[var(--ink-4)]">
                                        {badge}
                                      </span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDocRow = (doc: DocumentItem) => {
    const isActive = doc.id === activeDocId;
    const metrics = computeDocumentTotalMetrics(doc);
    const isConfirmingDelete = confirmDeleteId === doc.id;
    const unitCountLabel = `${doc.units?.length || 1} sc`;

    return (
      <div
        key={doc.id}
        data-doc-card="true"
        {...rowHover}
        style={{
          backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
          boxShadow: isActive ? 'var(--elevation-raised)' : 'none',
        }}
        className="group relative rounded-xl p-2.5 transition-[background-color,box-shadow] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)]"
      >
        <button
          type="button"
          onClick={() => {
            onSelectDoc(doc.id);
            setConfirmDeleteId(null);
          }}
          className="block w-full text-start"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                style={toneChip(WORK_KIND_TONE[doc.kind])}
                className="flex size-6 shrink-0 items-center justify-center rounded-full"
              >
                <Film className="size-3.5" strokeWidth={1.85} />
              </span>
              <span
                className="truncate text-sm font-medium"
                style={{ color: isActive ? 'var(--ink-1)' : 'var(--ink-2)' }}
              >
                {doc.title.trim() || 'Untitled screenplay'}
              </span>
            </div>
            {doc.pinned && (
              <Pin
                className="size-3 shrink-0 text-[var(--accent)]"
                strokeWidth={2}
              />
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">
            <span className="capitalize">{unitCountLabel}</span>
            <span>·</span>
            <span>
              {metrics.words.toLocaleString()}{' '}
              {metrics.words === 1 ? 'word' : 'words'}
            </span>
          </div>
        </button>

        {/* Quick actions row: always visible on touch, hover-revealed on desktop mouse */}
        {!isConfirmingDelete ? (
          <div className="mt-2 flex items-center justify-between opacity-100 transition-opacity duration-150 focus-within:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(doc.id);
                }}
                {...btnHover}
                aria-label={doc.pinned ? 'Unpin screenplay' : 'Pin screenplay'}
                title={doc.pinned ? 'Unpin' : 'Pin to top'}
                className="flex size-8 items-center justify-center rounded-md text-[var(--ink-3)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)] sm:size-6"
              >
                <Pin className="size-3.5 sm:size-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicateDoc(doc.id);
                }}
                {...btnHover}
                aria-label="Duplicate screenplay"
                title="Duplicate"
                className="flex size-8 items-center justify-center rounded-md text-[var(--ink-3)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)] sm:size-6"
              >
                <Copy className="size-3.5 sm:size-3" />
              </button>
            </div>

            {documents.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(doc.id);
                }}
                {...btnHover}
                aria-label="Delete screenplay"
                title="Delete screenplay"
                className="flex size-8 items-center justify-center rounded-md text-[var(--ink-3)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-red-600 sm:size-6"
              >
                <Trash2 className="size-3.5 sm:size-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-xs">
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="rounded-md px-2 py-1 text-[var(--ink-2)] hover:bg-[var(--bg-subtle-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onDeleteDoc(doc.id);
                setConfirmDeleteId(null);
              }}
              className="rounded-md bg-red-600/15 px-2.5 py-1 font-medium text-red-600 hover:bg-red-600/25"
            >
              Delete script
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        ref={backdropRef}
        onClick={onClose}
        style={{ zIndex: 'calc(var(--z-sidebar) - 1)' }}
        className="no-print fixed inset-0 bg-black/20 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
      />

      <aside
        ref={asideRef}
        aria-label="Script library"
        style={{
          zIndex: 'var(--z-sidebar)',
          backgroundColor: 'var(--bg-surface)',
          boxShadow: 'var(--elevation-floating)',
          paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: '1rem',
        }}
        className="no-print fixed inset-y-0 left-0 flex w-[min(19rem,calc(100vw-2.5rem))] flex-col"
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-serif text-base font-semibold tracking-tight text-[var(--ink-1)]">
              Focus
            </span>
            <span className="rounded-md bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">
              {documents.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenNewWorkModal();
              }}
              {...btnHover}
              style={{
                backgroundColor: 'var(--ink-1)',
                color: 'var(--bg-canvas)',
              }}
              className="flex h-7 items-center gap-1 rounded-lg pl-2.5 pr-2 text-xs font-medium"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              New script
            </button>
            <button
              type="button"
              onClick={onClose}
              {...btnHover}
              aria-label="Close scripts drawer"
              className="flex size-7 items-center justify-center rounded-lg text-[var(--ink-3)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Open Interactive Project Filing Cabinet CTA */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenCabinetView();
          }}
          {...btnHover}
          style={{
            backgroundColor: 'var(--bg-elevated)',
            boxShadow: 'var(--elevation-raised)',
          }}
          className="mb-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-[var(--ink-1)] transition-colors hover:text-[var(--accent)]"
        >
          <span className="flex items-center gap-2">
            <Archive className="size-3.5 text-[var(--accent)]" />
            <span>Open Project Filing Cabinet</span>
          </span>
          <span className="font-mono text-[10px] text-[var(--ink-3)]">⌘K</span>
        </button>

        {/* Search Input */}
        <div className="relative mb-2.5">
          <label htmlFor="manuscript-search" className="sr-only">
            Filter scripts
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ink-3)]" />
          <input
            id="manuscript-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search folders &amp; files…"
            style={{
              backgroundColor: 'var(--bg-canvas)',
              boxShadow:
                'inset 0 0 0 var(--border-hairline) var(--border-subtle)',
            }}
            className="h-8 w-full rounded-lg pl-8 pr-7 text-base text-[var(--ink-1)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)] sm:text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-3)] hover:text-[var(--ink-1)]"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Image 1-inspired Segmented Switcher: Folders | All Scripts */}
        <div
          style={{ backgroundColor: 'var(--bg-subtle)' }}
          className="mb-3 grid grid-cols-2 gap-1 rounded-xl p-1"
        >
          <button
            type="button"
            onClick={() => setSidebarTab('folders')}
            style={{
              backgroundColor:
                sidebarTab === 'folders' ? 'var(--bg-elevated)' : 'transparent',
              boxShadow:
                sidebarTab === 'folders' ? 'var(--elevation-raised)' : 'none',
              color:
                sidebarTab === 'folders' ? 'var(--ink-1)' : 'var(--ink-3)',
            }}
            className="h-7 rounded-lg text-xs font-medium transition-all duration-150"
          >
            Folders
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('all')}
            style={{
              backgroundColor:
                sidebarTab === 'all' ? 'var(--bg-elevated)' : 'transparent',
              boxShadow:
                sidebarTab === 'all' ? 'var(--elevation-raised)' : 'none',
              color: sidebarTab === 'all' ? 'var(--ink-1)' : 'var(--ink-3)',
            }}
            className="h-7 rounded-lg text-xs font-medium transition-all duration-150"
          >
            All Scripts
          </button>
        </div>

        {/* Document Tree or Flat List */}
        <div
          ref={listRef}
          className="focus-scroller flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl py-10 text-center">
              <FileText
                className="mb-2 size-6 text-[var(--ink-4)]"
                strokeWidth={1.5}
              />
              <p className="text-xs font-medium text-[var(--ink-2)]">
                No matching scripts
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                Start a new screenplay.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  onClose();
                  onOpenNewWorkModal();
                }}
                {...btnHover}
                className="mt-3 rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--ink-1)]"
                style={{ boxShadow: 'var(--elevation-raised)' }}
              >
                Create new script
              </button>
            </div>
          ) : sidebarTab === 'folders' ? (
            renderFolderTree()
          ) : (
            <>
              {pinnedDocs.length > 0 && (
                <div>
                  <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                    Pinned Scripts
                  </div>
                  <div className="space-y-1">{pinnedDocs.map(renderDocRow)}</div>
                </div>
              )}

              {regularDocs.length > 0 && (
                <div>
                  {pinnedDocs.length > 0 && (
                    <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                      Library
                    </div>
                  )}
                  <div className="space-y-1">
                    {regularDocs.map(renderDocRow)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
};
