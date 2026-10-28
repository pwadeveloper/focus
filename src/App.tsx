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
  markTypewriterChosen,
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
import { UpdateToast } from './components/UpdateToast';
import { InstallAppDialog } from './components/InstallAppDialog';
import { InstallBanner } from './components/InstallBanner';
import { installApp, usePwa } from './pwa';
import { WritersRoomDialog } from './components/WritersRoomDialog';
import { WriterAvatar } from './components/WriterAvatar';
import { CLIENT_ID, loadCachedSession, roomApi, saveCachedSession } from './room/api';
import { documentMeta, roomDocId, roomScriptToDocument, unitToScene } from './room/convert';
import { useRoomSync } from './room/useRoomSync';
import { unlockRooms } from './room/devicePasskey';
import { primeBaseline, type DocUpdate } from './room/RoomSync';
import type { RoomScript, RoomWriter, SessionResponse } from '../api/_lib/types';

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
  const [account, setAccount] = useState<SessionResponse | null>(() => loadCachedSession());
  const [writersRoomOpen, setWritersRoomOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const { installed } = usePwa();
  // The browser's own install prompt when it offers one, otherwise the steps
  const handleInstall = useCallback(() => {
    void installApp().then((opened) => {
      if (!opened) setInstallOpen(true);
    });
  }, []);

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
    if ('typewriterMode' in partial) markTypewriterChosen();
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
      // Your own synced scripts are deleted from your account too; shared room
      // scripts are only deleted for everyone from the writers room panel
      const doc = documents.find((d) => d.id === id);
      const personal = doc?.room && account?.rooms.find((r) => r.id === doc.room?.roomId)?.personal;
      if (doc?.room && personal && documents.length > 1) {
        roomApi.deleteScript(doc.room.scriptId).catch(() => {});
      }
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
    [activeDoc.id, persistDocs, documents, account]
  );

  // Accounts and writers rooms: scripts synced through the database
  const activeDocIdRef = useRef(activeDoc.id);
  activeDocIdRef.current = activeDoc.id;
  const lastLibraryRefreshRef = useRef(0);

  const updateAccount = useCallback((session: SessionResponse | null) => {
    setAccount(session);
    saveCachedSession(session);
  }, []);

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

  /** Brings every script in the writer's account and rooms onto this device. */
  const refreshLibrary = useCallback(async () => {
    lastLibraryRefreshRef.current = Date.now();
    let scripts: RoomScript[];
    let lockedRooms: Set<string>;
    try {
      const [session, library] = await Promise.all([roomApi.session(), roomApi.library()]);
      updateAccount(session);
      scripts = library.scripts;
      lockedRooms = new Set(library.lockedRoomIds);
    } catch {
      return;
    }
    setDocuments((prev) => {
      const isActive = (scriptId: string) =>
        prev.find((d) => d.room?.scriptId === scriptId)?.id === activeDocIdRef.current;
      // Scripts deleted, or in rooms the writer has left, go away. Rooms waiting
      // for a Face ID / Touch ID confirmation keep the copies already here.
      const reachable = new Set(scripts.map((script) => script.id));
      let next = prev.filter(
        (d) => !d.room || reachable.has(d.room.scriptId) || lockedRooms.has(d.room.roomId)
      );
      for (const script of scripts) {
        // The open script is live already; its sync keeps it current
        if (isActive(script.id)) continue;
        const existing = next.find((d) => d.room?.scriptId === script.id);
        primeBaseline(script);
        const doc = roomScriptToDocument(script, existing);
        next = existing ? next.map((d) => (d === existing ? doc : d)) : [...next, doc];
      }
      if (next.length === 0) next = [createNewWorkItem('Untitled screenplay')];
      persistDocs(next);
      return next;
    });
  }, [persistDocs, updateAccount]);

  useEffect(() => {
    roomApi
      .session()
      .then((session) => {
        updateAccount(session);
        if (session) void refreshLibrary();
        // Signed out elsewhere: synced scripts can't sync here any more
        else dropRoomDocuments();
      })
      // Offline: keep the remembered account so synced scripts stay usable
      .catch(() => {});
  }, [updateAccount, refreshLibrary, dropRoomDocuments]);

  // Coming back to Focus (perhaps after writing on another device): fetch what changed
  useEffect(() => {
    if (!account) return;
    const handleVisible = () => {
      if (!document.hidden && Date.now() - lastLibraryRefreshRef.current > 30_000) void refreshLibrary();
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [account, refreshLibrary]);

  // Signed in, every script on this device is saved to the writer's account
  // (except the sample). The document keeps its id, so the editor isn't disturbed.
  const personalRoomId = account?.rooms.find((r) => r.personal)?.id;
  // Once Face ID / Touch ID is set up, this device must confirm before saving to the account
  const personalLocked = !!account && account.security.devicePasskeys > 0 && !account.security.roomVerified;
  const uploadAttemptsRef = useRef(new Map<string, number>());
  useEffect(() => {
    if (!personalRoomId || personalLocked) return;
    for (const doc of documents) {
      if (doc.room || doc.id === STARTER_SCREENPLAY.id) continue;
      const lastAttempt = uploadAttemptsRef.current.get(doc.id);
      if (lastAttempt !== undefined && Date.now() - lastAttempt < 30_000) continue;
      uploadAttemptsRef.current.set(doc.id, Date.now());
      roomApi
        .createScript(personalRoomId, doc.title, documentMeta(doc), (doc.units ?? []).map(unitToScene))
        .then((script) => {
          // Anything typed during the upload differs from this copy and syncs as an edit
          primeBaseline(script);
          setDocuments((prev) => {
            const next = prev.map((d) =>
              d.id === doc.id ? { ...d, room: { roomId: script.roomId, scriptId: script.id } } : d
            );
            persistDocs(next);
            return next;
          });
        })
        .catch(() => {});
    }
  }, [documents, personalRoomId, personalLocked, persistDocs]);

  const handleOpenRoomScript = useCallback(
    (script: RoomScript) => {
      const existing = documents.find((d) => d.room?.scriptId === script.id);
      const id = existing?.id ?? roomDocId(script.id);
      // An open script is already live; only refresh copies that aren't syncing
      if (id !== activeDoc.id) {
        primeBaseline(script);
        setDocuments((prev) => {
          const current = prev.find((d) => d.room?.scriptId === script.id);
          const doc = roomScriptToDocument(script, current);
          const next = current ? prev.map((d) => (d === current ? doc : d)) : [doc, ...prev];
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
    [documents, activeDoc.id, persistDocs, handleLeaveHome]
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

  // Sync scripts from rooms this writer belongs to
  const docMembership = activeDoc.room
    ? account?.rooms.find((r) => r.id === activeDoc.room?.roomId)
    : undefined;
  const roomMe: RoomWriter | null =
    account && docMembership
      ? { id: account.me.id, name: account.me.name, role: docMembership.role, color: docMembership.color }
      : null;
  const roomSceneId =
    activeDoc.room && viewMode === 'write' && !showHome ? activeUnit?.id ?? null : null;
  const { state: roomSync, keepWriting, release: releaseRoomSync, resume: resumeRoomSync } = useRoomSync({
    doc: activeDoc,
    me: roomMe,
    sceneId: roomSceneId,
    wantLock: roomSceneId !== null,
    onRemote: handleRemoteUpdate,
  });

  useEffect(() => {
    if (roomSync?.status === 'signed-out') {
      // A new passkey was made on another device, so this one was signed out
      updateAccount(null);
      dropRoomDocuments();
      setWritersRoomOpen(true);
    } else if (roomSync?.status === 'gone' && activeDoc.room) {
      // Deleted, or the writer is no longer in its room
      dropRoomDocuments(activeDoc.room.scriptId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomSync?.status]);

  const handleSignOut = useCallback(async () => {
    // Send any last edits and free the open scene first: signing out removes
    // synced scripts from this device, and the server refuses requests after
    await releaseRoomSync();
    await roomApi.signOut().catch(() => {});
    updateAccount(null);
    dropRoomDocuments();
  }, [releaseRoomSync, updateAccount, dropRoomDocuments]);

  // Writers rooms ask for Face ID / Touch ID on each device
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const handleAccountUpdate = useCallback(
    (session: SessionResponse) => {
      updateAccount(session);
      if (session.security.roomVerified) resumeRoomSync();
      void refreshLibrary();
    },
    [updateAccount, resumeRoomSync, refreshLibrary]
  );
  const handleUnlockRooms = useCallback(async () => {
    if (!account) return;
    setDeviceError(null);
    try {
      handleAccountUpdate(await unlockRooms(account));
    } catch (error) {
      setDeviceError((error as Error).message);
    }
  }, [account, handleAccountUpdate]);

  const roomWriterById = (id: string | undefined) =>
    id ? roomSync?.writers.find((w) => w.id === id) : undefined;

  const linkClass =
    'font-medium text-[var(--ink-1)] underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-[var(--ink-1)]';
  const syncStatus = roomSync?.status ?? 'connecting';
  let editorReadOnly = false;
  let editorNotice: React.ReactNode = null;
  if (activeDoc.room && activeUnit) {
    const lock = roomSync?.locks[activeUnit.id];
    const lockedElsewhere = !!lock && !(lock.writerId === account?.me.id && lock.clientId === CLIENT_ID);
    const heldHere = roomSync?.heldSceneId === activeUnit.id;
    // Before the first answer, or offline, write freely unless we know another tab
    // holds the scene; anything refused later is kept as a copy
    const optimistic = (syncStatus === 'connecting' || syncStatus === 'offline') && !lockedElsewhere;
    editorReadOnly = !roomMe || !(heldHere || optimistic);
    const holder = lockedElsewhere ? roomWriterById(lock?.writerId) : undefined;

    if (!account) {
      editorNotice = (
        <span className="min-w-0">
          This script is synced to a Focus account. Sign in with your passkey to keep working on it.{' '}
          <button type="button" onClick={() => setWritersRoomOpen(true)} className={linkClass}>
            Sign in
          </button>
        </span>
      );
    } else if (!roomMe) {
      editorNotice = <span>You’re no longer in the writers room this script belongs to.</span>;
    } else if (syncStatus === 'locked') {
      editorNotice = (
        <span className="min-w-0">
          {docMembership?.personal
            ? 'Your scripts ask for Face ID, Touch ID or your device’s screen lock on each device.'
            : 'Writers rooms ask for Face ID, Touch ID or your device’s screen lock on each device.'}{' '}
          <button type="button" onClick={handleUnlockRooms} className={linkClass}>
            {account.security.devicePasskeys > 0 ? 'Confirm it’s you' : 'Set it up on this device'}
          </button>
          {deviceError && <span className="text-[var(--accent)]"> {deviceError}</span>}
        </span>
      );
    } else if (lockedElsewhere && lock?.writerId === account.me.id) {
      editorNotice = (
        <span>
          You’re writing this scene in another tab or on another device. Move to a different scene
          there to write here.
        </span>
      );
    } else if (holder) {
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
          You stepped away, so this scene is free for your other devices and writers.{' '}
          <button type="button" onClick={keepWriting} className={linkClass}>
            Keep writing
          </button>
        </span>
      );
    } else if (syncStatus === 'offline') {
      editorNotice = <span>You’re offline. Keep writing; your changes sync when you reconnect.</span>;
    }
  }

  // Other writers in this script (this writer's other devices aren't shown)
  const roomCollaborators = (roomSync?.presence ?? []).flatMap((p) => {
    const writer = roomWriterById(p.writerId);
    if (!writer || writer.id === account?.me.id) return [];
    const index = activeDoc.units?.findIndex((u) => u.id === p.sceneId) ?? -1;
    return [{ writer, where: index >= 0 ? `Scene ${index + 1}` : 'Viewing the script' }];
  }).filter((c, i, all) => all.findIndex((other) => other.writer.id === c.writer.id) === i);

  const syncLabel = activeDoc.room
    ? syncStatus === 'live'
      ? 'Synced'
      : syncStatus === 'offline'
      ? 'Offline'
      : syncStatus === 'locked'
      ? 'Locked'
      : 'Syncing…'
    : undefined;
  const accountBadge = account
    ? { name: account.me.name, color: account.rooms.find((r) => r.personal)?.color ?? 'butter' }
    : null;

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
          onInstall={handleInstall}
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
            account={accountBadge}
            collaborators={activeDoc.room ? roomCollaborators : undefined}
            statusLabel={syncLabel}
            onInstallApp={installed ? undefined : handleInstall}
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
        account={account}
        onAccount={handleAccountUpdate}
        onSignOut={handleSignOut}
        activeDoc={activeDoc}
        onOpenScript={handleOpenRoomScript}
        onScriptDeleted={(scriptId) => dropRoomDocuments(scriptId)}
      />

      <UpdateToast />
      {/* Not on the home page (it has its own link) and never while writing */}
      <InstallBanner hidden={showHome || isTyping || installOpen} onInstall={handleInstall} />
      <InstallAppDialog open={installOpen} onClose={() => setInstallOpen(false)} />

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
};

export default App;
