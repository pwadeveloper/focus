import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DocumentItem,
  DocumentUnit,
  FocusMode,
  WorkspaceViewMode,
  WriterSettings,
} from './types';
import {
  loadSettings,
  saveSettings,
  loadDocumentsSync,
  loadActiveDocIdSync,
  saveActiveDocIdSync,
  saveDocuments,
  hydrateDocumentsFromIndexedDB,
  createNewWorkItem,
  NewWorkOptions,
  STARTER_SCREENPLAY,
  hasSeenWelcome,
  markWelcomeSeen,
} from './storage';
import {
  computeDocumentTotalMetrics,
  documentToFullMarkdown,
  downloadFile,
  extractScreenplayCharacters,
  extractScreenplayLocations,
  getUnitBadgeLabel,
  slugifyFilename,
} from './editorUtils';
import { TitlePageDialog } from './components/TitlePageDialog';
import { ScreenplayExportDialog } from './components/ScreenplayExportDialog';
import { renderScreenplayHtml, snapshotSignatures } from './screenplayExport';
import { TopBar } from './components/TopBar';
import { SidebarDrawer } from './components/SidebarDrawer';
import { RichEditor } from './components/RichEditor';
import { BirdsEyeView } from './components/BirdsEyeView';
import { ProjectCabinetView } from './components/ProjectCabinetView';
import { NewWorkModal } from './components/NewWorkModal';
import { BottomHud } from './components/BottomHud';
import { ShortcutsModal } from './components/ShortcutsModal';
import { WelcomeHome } from './components/WelcomeHome';
import { WritersRoomDialog } from './components/WritersRoomDialog';
import { WriterAvatar } from './components/WriterAvatar';
import { roomApi } from './room/api';
import { roomDocId, roomScriptToDocument } from './room/convert';
import { useRoomSync } from './room/useRoomSync';
import type { DocUpdate } from './room/RoomSync';
import type { RoomScript, SessionResponse } from '../api/_lib/types';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<WriterSettings>(() => loadSettings());
  const [documents, setDocuments] = useState<DocumentItem[]>(() => loadDocumentsSync());
  const [activeDocId, setActiveDocId] = useState<string>(() =>
    loadActiveDocIdSync(loadDocumentsSync())
  );
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('write');
  const [showHome, setShowHome] = useState(() => !hasSeenWelcome());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newWorkModalOpen, setNewWorkModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [screenplayGuideOpen, setScreenplayGuideOpen] = useState(false);
  const [titlePageOpen, setTitlePageOpen] = useState(false);
  const closeTitlePage = useCallback(() => setTitlePageOpen(false), []);
  const [screenplayExportOpen, setScreenplayExportOpen] = useState(false);
  const closeScreenplayExport = useCallback(() => setScreenplayExportOpen(false), []);
  const [isTyping, setIsTyping] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [roomSession, setRoomSession] = useState<SessionResponse | null>(null);
  const [writersRoomOpen, setWritersRoomOpen] = useState(false);

  const lastPointerPos = useRef<{ x: number; y: number } | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  // Hydrate from IndexedDB if available
  useEffect(() => {
    hydrateDocumentsFromIndexedDB().then((idbDocs) => {
      if (idbDocs && idbDocs.length > 0) {
        setDocuments((current) => {
          const currentLatest = Math.max(...current.map((d) => d.updatedAt), 0);
          const idbLatest = Math.max(...idbDocs.map((d) => d.updatedAt), 0);
          return idbLatest > currentLatest ? idbDocs : current;
        });
      }
    });
  }, []);

  // Apply theme attribute & mobile status bar theme-color without ragged cascade transitions
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', settings.theme);
    const metaTheme = document.getElementById('focus-theme-color');
    if (metaTheme) {
      const themeColors: Record<string, string> = {
        paper: '#F6F2EA',
        sepia: '#F3ECE0',
        night: '#141312',
      };
      metaTheme.setAttribute('content', themeColors[settings.theme] || '#F6F2EA');
    }
    const timer = window.setTimeout(() => {
      root.classList.remove('theme-switching');
    }, 40);
    return () => window.clearTimeout(timer);
  }, [settings.theme]);

  const updateSettings = useCallback((partial: Partial<WriterSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const activeDoc = useMemo(() => {
    return documents.find((d) => d.id === activeDocId) || documents[0];
  }, [documents, activeDocId]);

  const activeUnit = useMemo((): DocumentUnit | null => {
    if (!activeDoc.units || activeDoc.units.length === 0) {
      return null;
    }
    return (
      activeDoc.units.find((u) => u.id === activeDoc.activeUnitId) ||
      activeDoc.units[0]
    );
  }, [activeDoc]);

  const activeUnitBadge = useMemo(() => {
    if (!activeUnit || !activeDoc.units) return undefined;
    return getUnitBadgeLabel(activeUnit, activeDoc.units);
  }, [activeUnit, activeDoc.units]);

  const metrics = useMemo(() => {
    return computeDocumentTotalMetrics(activeDoc);
  }, [activeDoc]);

  const knownCharacters = useMemo(
    () => extractScreenplayCharacters(activeDoc),
    [activeDoc]
  );

  const knownLocations = useMemo(
    () => extractScreenplayLocations(activeDoc),
    [activeDoc]
  );

  const persistDocs = useCallback((nextDocs: DocumentItem[]) => {
    setSaveStatus('saving');
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveDocuments(nextDocs).then(() => {
      saveTimerRef.current = window.setTimeout(() => {
        setSaveStatus('saved');
      }, 280);
    });
  }, []);

  // The guide lives in the screenplay editor: close it whenever that editor
  // is not on screen, so it never reopens unexpectedly later
  useEffect(() => {
    if (viewMode !== 'write') {
      setScreenplayGuideOpen(false);
    }
  }, [viewMode]);

  // Update active document helper
  const updateActiveDocument = useCallback(
    (updater: (doc: DocumentItem) => DocumentItem) => {
      setDocuments((prev) => {
        const next = prev.map((d) =>
          d.id === activeDoc.id
            ? { ...updater(d), updatedAt: Date.now() }
            : d
        );
        persistDocs(next);
        return next;
      });
    },
    [activeDoc.id, persistDocs]
  );

  // Scene editing handlers
  const handleEditorTitleChange = useCallback(
    (newTitle: string) => {
      updateActiveDocument((doc) => {
        if (!doc.units || !activeUnit) {
          return { ...doc, title: newTitle };
        }
        return {
          ...doc,
          units: doc.units.map((u) =>
            u.id === activeUnit.id
              ? { ...u, title: newTitle, updatedAt: Date.now() }
              : u
          ),
        };
      });
    },
    [updateActiveDocument, activeUnit]
  );

  const handleEditorSluglineChange = useCallback(
    (newSlugline: string) => {
      if (!activeUnit) return;
      updateActiveDocument((doc) => ({
        ...doc,
        units: (doc.units || []).map((u) =>
          u.id === activeUnit.id
            ? { ...u, slugline: newSlugline, updatedAt: Date.now() }
            : u
        ),
      }));
    },
    [updateActiveDocument, activeUnit]
  );

  const handleEditorHtmlChange = useCallback(
    (newHtml: string) => {
      updateActiveDocument((doc) => {
        if (!doc.units || !activeUnit) {
          return { ...doc, contentHtml: newHtml };
        }
        return {
          ...doc,
          units: doc.units.map((u) =>
            u.id === activeUnit.id
              ? { ...u, contentHtml: newHtml, updatedAt: Date.now() }
              : u
          ),
        };
      });
    },
    [updateActiveDocument, activeUnit]
  );

  // Bird's-Eye View handlers
  const handleSelectUnitAndWrite = useCallback(
    (unitId: string) => {
      updateActiveDocument((doc) => ({
        ...doc,
        activeUnitId: unitId,
      }));
      setViewMode('write');
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [updateActiveDocument]
  );

  const handleAddUnit = useCallback(
    (openImmediately = false) => {
      const now = Date.now();
      const newUnitId = `unit-${now}-${Math.random().toString(36).slice(2, 6)}`;

      updateActiveDocument((doc) => {
        const existingUnits = doc.units || [];
        const newUnit: DocumentUnit = {
          id: newUnitId,
          unitKind: 'scene',
          slugline: 'INT. LOCATION - DAY',
          title: `Scene ${existingUnits.length + 1}`,
          synopsis: '',
          contentHtml:
            '<p data-sp-type="slugline">INT. LOCATION - DAY</p><p data-sp-type="action"><br></p>',
          updatedAt: now,
        };

        return {
          ...doc,
          units: [...existingUnits, newUnit],
          activeUnitId: openImmediately ? newUnitId : doc.activeUnitId || newUnitId,
        };
      });

      if (openImmediately) {
        setViewMode('write');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [updateActiveDocument]
  );

  const handleUpdateUnitMeta = useCallback(
    (
      unitId: string,
      patch: Partial<Pick<DocumentUnit, 'title' | 'synopsis' | 'slugline'>>
    ) => {
      updateActiveDocument((doc) => ({
        ...doc,
        units: (doc.units || []).map((u) =>
          u.id === unitId ? { ...u, ...patch, updatedAt: Date.now() } : u
        ),
      }));
    },
    [updateActiveDocument]
  );

  const handleMoveUnit = useCallback(
    (unitId: string, direction: -1 | 1) => {
      updateActiveDocument((doc) => {
        const list = [...(doc.units || [])];
        const idx = list.findIndex((u) => u.id === unitId);
        const targetIdx = idx + direction;
        if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return doc;
        const [moved] = list.splice(idx, 1);
        list.splice(targetIdx, 0, moved);
        return { ...doc, units: list };
      });
    },
    [updateActiveDocument]
  );

  const handleDeleteUnit = useCallback(
    (unitId: string) => {
      updateActiveDocument((doc) => {
        const list = doc.units || [];
        if (list.length <= 1) return doc;
        const nextUnits = list.filter((u) => u.id !== unitId);
        const nextActiveId =
          doc.activeUnitId === unitId ? nextUnits[0].id : doc.activeUnitId;
        return {
          ...doc,
          units: nextUnits,
          activeUnitId: nextActiveId,
        };
      });
    },
    [updateActiveDocument]
  );

  const handleLeaveHome = useCallback(() => {
    markWelcomeSeen();
    setShowHome(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleOpenHome = useCallback(() => {
    setSidebarOpen(false);
    setScreenplayGuideOpen(false);
    setIsTyping(false);
    setShowHome(true);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  // Create a new screenplay
  const handleCreateWork = useCallback(
    (title: string, options?: NewWorkOptions) => {
      const newDoc = createNewWorkItem(title, options);
      setDocuments((prev) => {
        const next = [newDoc, ...prev];
        persistDocs(next);
        return next;
      });
      setActiveDocId(newDoc.id);
      saveActiveDocIdSync(newDoc.id);
      if (options?.openInTimeline) {
        setViewMode('birdseye');
      } else {
        setViewMode('write');
      }
      setSidebarOpen(false);
      setIsTyping(false);
      handleLeaveHome();
    },
    [persistDocs, handleLeaveHome]
  );

  const handleSelectDoc = useCallback((id: string) => {
    setActiveDocId(id);
    saveActiveDocIdSync(id);
    setViewMode('write');
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleSelectDocUnit = useCallback(
    (docId: string, unitId: string) => {
      setActiveDocId(docId);
      saveActiveDocIdSync(docId);
      setDocuments((prev) => {
        const next = prev.map((d) =>
          d.id === docId ? { ...d, activeUnitId: unitId } : d
        );
        persistDocs(next);
        return next;
      });
      setViewMode('write');
      setSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [persistDocs]
  );

  const handleSelectDocBirdsEye = useCallback((id: string) => {
    setActiveDocId(id);
    saveActiveDocIdSync(id);
    setViewMode('birdseye');
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleOpenNewWorkModal = useCallback(() => {
    setNewWorkModalOpen(true);
  }, []);

  const handleTogglePin = useCallback(
    (id: string) => {
      setDocuments((prev) => {
        const next = prev.map((d) =>
          d.id === id ? { ...d, pinned: !d.pinned } : d
        );
        persistDocs(next);
        return next;
      });
    },
    [persistDocs]
  );

  const handleDuplicateDoc = useCallback(
    (id: string) => {
      const source = documents.find((d) => d.id === id);
      if (!source) return;
      const copy: DocumentItem = {
        ...source,
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: source.title ? `${source.title} (Copy)` : 'Untitled (Copy)',
        pinned: false,
        room: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setDocuments((prev) => {
        const next = [copy, ...prev];
        persistDocs(next);
        return next;
      });
      setActiveDocId(copy.id);
      saveActiveDocIdSync(copy.id);
    },
    [documents, persistDocs]
  );

  const handleDeleteDoc = useCallback(
    (id: string) => {
      setDocuments((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((d) => d.id !== id);
        persistDocs(next);
        if (id === activeDoc.id && next[0]) {
          setActiveDocId(next[0].id);
          saveActiveDocIdSync(next[0].id);
        }
        return next;
      });
    },
    [activeDoc.id, persistDocs]
  );

  // Writers room: scripts shared through the database
  const dropRoomDocuments = useCallback(
    (scriptId?: string) => {
      setDocuments((prev) => {
        const keep = prev.filter((d) => !d.room || (scriptId !== undefined && d.room.scriptId !== scriptId));
        if (keep.length === prev.length) return prev;
        const next = keep.length > 0 ? keep : [createNewWorkItem('Untitled screenplay')];
        persistDocs(next);
        return next;
      });
    },
    [persistDocs]
  );

  useEffect(() => {
    // Offline: keep room scripts on this device until the room can be reached
    roomApi
      .session()
      .then((session) => {
        setRoomSession(session);
        // Signed out: room scripts left on this device can't sync, so drop them
        if (!session) dropRoomDocuments();
      })
      .catch(() => {});
  }, [dropRoomDocuments]);

  const handleOpenRoomScript = useCallback(
    (script: RoomScript) => {
      if (!roomSession) return;
      const id = roomDocId(script.id);
      // An open room script is already live; only refresh copies that aren't syncing
      if (id !== activeDoc.id) {
        setDocuments((prev) => {
          const existing = prev.find((d) => d.id === id);
          const doc = roomScriptToDocument(script, roomSession.room.id, existing);
          const next = existing ? prev.map((d) => (d.id === id ? doc : d)) : [doc, ...prev];
          persistDocs(next);
          return next;
        });
        setActiveDocId(id);
        saveActiveDocIdSync(id);
      }
      setViewMode('write');
      setWritersRoomOpen(false);
      handleLeaveHome();
    },
    [roomSession, activeDoc.id, persistDocs, handleLeaveHome]
  );

  const handleRemoteUpdate = useCallback(
    (docId: string, update: DocUpdate) => {
      setDocuments((prev) => {
        const next = prev.map((d) => (d.id === docId ? update(d) : d));
        persistDocs(next);
        return next;
      });
    },
    [persistDocs]
  );

  // Sync only scripts from the room this writer is signed in to
  const roomMe =
    roomSession && activeDoc.room?.roomId === roomSession.room.id ? roomSession.me : null;
  const roomSceneId =
    activeDoc.room && viewMode === 'write' && !showHome ? activeUnit?.id ?? null : null;
  const { state: roomSync, keepWriting } = useRoomSync({
    doc: activeDoc,
    me: roomMe,
    sceneId: roomSceneId,
    wantLock: roomSceneId !== null,
    onRemote: handleRemoteUpdate,
  });

  useEffect(() => {
    if (roomSync?.status === 'signed-out') {
      // Their passkey was reissued or they were removed from the room
      setRoomSession(null);
      dropRoomDocuments();
      setWritersRoomOpen(true);
    } else if (roomSync?.status === 'gone' && activeDoc.room) {
      dropRoomDocuments(activeDoc.room.scriptId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomSync?.status]);

  const roomWriterById = (id: string | undefined) =>
    id ? roomSync?.writers.find((w) => w.id === id) : undefined;

  let editorReadOnly = false;
  let editorNotice: React.ReactNode = null;
  if (activeDoc.room && activeUnit) {
    const holder = roomWriterById(roomSync?.locks[activeUnit.id]);
    editorReadOnly = roomSync?.heldSceneId !== activeUnit.id;
    if (!roomMe) {
      editorNotice = (
        <span className="min-w-0">
          This is a writers room script. Sign in to the room to keep working on it.{' '}
          <button type="button" onClick={() => setWritersRoomOpen(true)} className="font-medium text-[var(--ink-1)] underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-[var(--ink-1)]">
            Open the writers room
          </button>
        </span>
      );
    } else if (holder && holder.id !== roomMe.id) {
      editorNotice = (
        <>
          <WriterAvatar writer={holder} size="sm" />
          <span className="min-w-0">
            <span className="font-medium text-[var(--ink-1)]">{holder.name}</span> is writing this
            scene. You’ll see their changes as they type, and can write once they move on.
          </span>
        </>
      );
    } else if (roomSync?.idle) {
      editorNotice = (
        <span className="min-w-0">
          You stepped away, so this scene is open to the others.{' '}
          <button type="button" onClick={keepWriting} className="font-medium text-[var(--ink-1)] underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-[var(--ink-1)]">
            Keep writing
          </button>
        </span>
      );
    } else if (roomSync?.status === 'offline') {
      editorNotice = <span>You’re offline. Keep writing; your changes sync when you reconnect.</span>;
    }
  }

  const roomCollaborators = (roomSync?.presence ?? []).flatMap((p) => {
    const writer = roomWriterById(p.writerId);
    if (!writer) return [];
    const index = activeDoc.units?.findIndex((u) => u.id === p.sceneId) ?? -1;
    return [{ writer, where: index >= 0 ? `Scene ${index + 1}` : 'Viewing the script' }];
  });

  // Restore UI chrome when mouse moves purposefully
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!lastPointerPos.current) {
        lastPointerPos.current = { x: e.clientX, y: e.clientY };
        return;
      }
      const dx = Math.abs(e.clientX - lastPointerPos.current.x);
      const dy = Math.abs(e.clientY - lastPointerPos.current.y);
      if (dx + dy > 8) {
        lastPointerPos.current = { x: e.clientX, y: e.clientY };
        setIsTyping(false);
      }
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // The editor already handled it (e.g. ⌘⇧D dual dialogue)
      if (e.defaultPrevented || e.isComposing) return;
      // The welcome page has no workspace for these shortcuts to act on
      if (showHome) return;
      if (e.key === 'Escape') {
        setIsTyping(false);
        if (sidebarOpen) setSidebarOpen(false);
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // Screenplay guide: ⌘⌥/ (Ctrl+Alt+/ on Windows) or F1. ⌘? is taken by
      // the macOS Help menu, so it never reaches the page.
      const guideKey =
        e.key === 'F1' || (isMod && e.altKey && !e.shiftKey && e.code === 'Slash');
      if (guideKey) {
        e.preventDefault();
        setViewMode('write');
        setScreenplayGuideOpen((v) => !v);
        setIsTyping(false);
        return;
      }

      // Other ⌘⌥ combinations belong to the editor (element shortcuts)
      if (!isMod || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === 'm') {
        e.preventDefault();
        setViewMode((v) => (v === 'birdseye' ? 'write' : 'birdseye'));
        setIsTyping(false);
      } else if (key === 'k') {
        const sel = window.getSelection();
        const hasRangeSelection = sel && !sel.isCollapsed;
        if (!hasRangeSelection) {
          e.preventDefault();
          setViewMode((v) => (v === 'cabinet' ? 'write' : 'cabinet'));
          setIsTyping(false);
        }
      } else if (key === 'd' && !e.shiftKey) {
        e.preventDefault();
        const order: FocusMode[] = ['off', 'paragraph', 'deep'];
        const next = order[(order.indexOf(settings.focusMode) + 1) % order.length];
        updateSettings({ focusMode: next });
      } else if (key === 't' && !e.shiftKey) {
        e.preventDefault();
        updateSettings({ typewriterMode: !settings.typewriterMode });
      } else if (e.key === '\\') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        setIsTyping(false);
      } else if (e.key === '/') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        setIsTyping(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    settings.focusMode,
    settings.typewriterMode,
    sidebarOpen,
    showHome,
    updateSettings,
  ]);

  const handleUserTyping = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
    }
    if (sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [isTyping, sidebarOpen]);

  // Export & Copy handlers (exports the full screenplay)
  const handleExportMarkdown = () => {
    const md = documentToFullMarkdown(activeDoc);
    downloadFile(
      `${slugifyFilename(activeDoc.title)}.md`,
      md,
      'text/markdown;charset=utf-8'
    );
  };

  const handleExportText = () => {
    // The Markdown/Fountain text is already plain text; parsing it as HTML
    // would drop anything that looks like a tag (and could run markup)
    const body = documentToFullMarkdown(activeDoc).trim();
    downloadFile(
      `${slugifyFilename(activeDoc.title)}.txt`,
      `${body}\n`,
      'text/plain;charset=utf-8'
    );
  };

  // Screenplays export as paginated, industry-formatted pages
  const handleExportHtml = () => {
    downloadFile(
      `${slugifyFilename(activeDoc.title)}.html`,
      renderScreenplayHtml(activeDoc).html,
      'text/html;charset=utf-8'
    );
  };

  const handleCopyMarkdown = () => {
    const md = documentToFullMarkdown(activeDoc);
    navigator.clipboard?.writeText(md).catch(() => {});
  };

  const handleCopyPlainText = () => {
    const md = documentToFullMarkdown(activeDoc);
    navigator.clipboard?.writeText(md).catch(() => {});
  };

  return (
    <div className="min-h-dvh w-full bg-[var(--bg-canvas)] text-[var(--ink-1)] selection:bg-[var(--selection-bg)]">
      {showHome ? (
        <WelcomeHome
          continueTitle={activeDoc.title}
          isSample={activeDoc.id === STARTER_SCREENPLAY.id}
          onStartNew={handleOpenNewWorkModal}
          onContinue={handleLeaveHome}
          onOpenWritersRoom={() => setWritersRoomOpen(true)}
        />
      ) : (
        <>
          <a
            href="#manuscript-title"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--bg-elevated)] focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-[var(--ink-1)]"
          >
            Skip to writing canvas
          </a>

          <TopBar
            onOpenHome={handleOpenHome}
            onOpenWritersRoom={() => setWritersRoomOpen(true)}
            collaborators={activeDoc.room ? roomCollaborators : undefined}
            isTyping={isTyping && viewMode === 'write'}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            workKind={activeDoc.kind}
            docTitle={activeDoc.title}
            activeUnitBadge={activeUnitBadge}
            viewMode={viewMode}
            onToggleViewMode={() =>
              setViewMode((v) => (v === 'birdseye' ? 'write' : 'birdseye'))
            }
            onToggleCabinetView={() =>
              setViewMode((v) => (v === 'cabinet' ? 'write' : 'cabinet'))
            }
            onOpenNewWorkModal={handleOpenNewWorkModal}
            saveStatus={saveStatus}
            settings={settings}
            onUpdateSettings={updateSettings}
            onExportMarkdown={handleExportMarkdown}
            onExportText={handleExportText}
            onExportHtml={handleExportHtml}
            onCopyMarkdown={handleCopyMarkdown}
            onCopyPlainText={handleCopyPlainText}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenScreenplayExport={() => setScreenplayExportOpen(true)}
            screenplayGuideOpen={screenplayGuideOpen}
            onToggleScreenplayGuide={() => {
              setViewMode('write');
              setScreenplayGuideOpen((v) => !v);
            }}
          />

          <SidebarDrawer
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            documents={documents}
            activeDocId={activeDoc.id}
            onSelectDoc={handleSelectDoc}
            onSelectDocUnit={handleSelectDocUnit}
            onOpenCabinetView={() => setViewMode('cabinet')}
            onOpenNewWorkModal={handleOpenNewWorkModal}
            onTogglePin={handleTogglePin}
            onDuplicateDoc={handleDuplicateDoc}
            onDeleteDoc={handleDeleteDoc}
          />

          {viewMode === 'cabinet' ? (
            <ProjectCabinetView
              documents={documents}
              activeDocId={activeDoc.id}
              onSelectDocAndWrite={handleSelectDoc}
              onSelectDocBirdsEye={handleSelectDocBirdsEye}
              onOpenNewWorkModal={handleOpenNewWorkModal}
              onTogglePin={handleTogglePin}
              onDeleteDoc={handleDeleteDoc}
            />
          ) : viewMode === 'birdseye' ? (
            <BirdsEyeView
              doc={activeDoc}
              activeUnitId={activeUnit?.id || ''}
              onSelectUnitAndWrite={handleSelectUnitAndWrite}
              onUpdateDocTitle={(newTitle) =>
                updateActiveDocument((d) => ({ ...d, title: newTitle }))
              }
              onUpdateDocSubtitle={(newSubtitle) =>
                updateActiveDocument((d) => ({ ...d, subtitle: newSubtitle }))
              }
              onOpenTitlePage={() => setTitlePageOpen(true)}
              onAddUnit={() => handleAddUnit(false)}
              onUpdateUnitMeta={handleUpdateUnitMeta}
              onMoveUnit={handleMoveUnit}
              onDeleteUnit={handleDeleteUnit}
              onOpenProjectCabinet={() => setViewMode('cabinet')}
            />
          ) : (
            <RichEditor
              docId={activeDoc.id}
              workKind={activeDoc.kind}
              docTitle={activeDoc.title}
              unitId={activeUnit ? activeUnit.id : activeDoc.id}
              unitTitle={activeUnit ? activeUnit.title : activeDoc.title}
              unitSlugline={activeUnit?.slugline}
              initialHtml={
                activeUnit ? activeUnit.contentHtml : activeDoc.contentHtml
              }
              units={activeDoc.units}
              knownCharacters={knownCharacters}
              knownLocations={knownLocations}
              fontVoice={settings.fontVoice}
              fontSize={settings.fontSize}
              measure={settings.measure}
              focusMode={settings.focusMode}
              typewriterMode={settings.typewriterMode}
              sidebarOpen={sidebarOpen}
              isTyping={isTyping}
              onChangeTitle={handleEditorTitleChange}
              onChangeSlugline={handleEditorSluglineChange}
              onChangeHtml={handleEditorHtmlChange}
              onSelectUnit={handleSelectUnitAndWrite}
              onCreateNextUnit={() => handleAddUnit(true)}
              onOpenBirdsEye={() => setViewMode('birdseye')}
              onUserTyping={handleUserTyping}
              screenplayGuideOpen={screenplayGuideOpen}
              onCloseScreenplayGuide={() => setScreenplayGuideOpen(false)}
              onToggleScreenplayGuide={() => setScreenplayGuideOpen((v) => !v)}
              onOpenTitlePage={() => setTitlePageOpen(true)}
              readOnly={editorReadOnly}
              notice={editorNotice}
            />
          )}

          <BottomHud
            isTyping={isTyping && viewMode === 'write'}
            metrics={metrics}
            wordGoal={activeDoc.wordGoal || settings.wordGoal}
            onChangeWordGoal={(goal) => {
              updateSettings({ wordGoal: goal });
              updateActiveDocument((d) => ({ ...d, wordGoal: goal }));
            }}
          />
        </>
      )}

      <NewWorkModal
        open={newWorkModalOpen}
        onClose={() => setNewWorkModalOpen(false)}
        onCreateWork={handleCreateWork}
      />

      {/* The title page editor opens over export; export returns when it closes */}
      <ScreenplayExportDialog
        open={screenplayExportOpen && !titlePageOpen}
        doc={activeDoc}
        onClose={closeScreenplayExport}
        onChangeSettings={(patch) =>
          updateActiveDocument((d) => ({
            ...d,
            screenplayExport: { ...d.screenplayExport, ...patch },
          }))
        }
        onChangeTitlePage={(patch) =>
          updateActiveDocument((d) => ({
            ...d,
            titlePage: { ...d.titlePage, ...patch },
          }))
        }
        onOpenTitlePage={() => setTitlePageOpen(true)}
        onLockDraft={(color) =>
          updateActiveDocument((d) => ({
            ...d,
            revisionBaseline: {
              lockedAt: Date.now(),
              color,
              units: snapshotSignatures(d),
            },
            // A freshly locked draft has nothing to mark yet; keep marks on
            screenplayExport: { ...d.screenplayExport, revisionMarks: true },
          }))
        }
        onDownload={handleExportHtml}
      />

      <TitlePageDialog
        open={titlePageOpen}
        doc={activeDoc}
        onClose={closeTitlePage}
        onChangeTitle={(title) => updateActiveDocument((d) => ({ ...d, title }))}
        onChangeTitlePage={(patch) =>
          updateActiveDocument((d) => ({
            ...d,
            titlePage: { ...d.titlePage, ...patch },
          }))
        }
      />

      <WritersRoomDialog
        open={writersRoomOpen}
        onClose={() => setWritersRoomOpen(false)}
        session={roomSession}
        onSession={setRoomSession}
        onSignOut={() => {
          setRoomSession(null);
          dropRoomDocuments();
        }}
        activeDoc={activeDoc}
        onOpenScript={handleOpenRoomScript}
        onScriptDeleted={(scriptId) => dropRoomDocuments(scriptId)}
      />

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
};

export default App;
