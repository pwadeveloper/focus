import React, { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ArrowLeft, Check, ChevronRight, Copy, Download, KeyRound, Lock, LogOut, Plus, Share2, X } from 'lucide-react';
import type { DocumentItem } from '../types';
import type { DevicePasskey, RoomDetails, RoomScript, SessionResponse } from '../../api/_lib/types';
import { needsDeviceCheck, roomApi } from '../room/api';
import { documentMeta, unitToScene } from '../room/convert';
import { addThisDevice, confirmWithDevice, unlockRooms } from '../room/devicePasskey';
import { downloadFile } from '../editorUtils';
import { WriterAvatar } from './WriterAvatar';
import { canHover, prefersReducedMotion } from '../motion';

interface WritersRoomDialogProps {
  open: boolean;
  onClose: () => void;
  account: SessionResponse | null;
  onAccount: (session: SessionResponse) => void;
  onSignOut: () => Promise<void>;
  /** The open script, offered for sharing into a room */
  activeDoc: DocumentItem;
  onOpenScript: (script: RoomScript) => void;
  onScriptDeleted: (scriptId: string) => void;
}

/** 'recover' is reached from Sign in, not a tab */
type Mode = 'sign-in' | 'create' | 'join' | 'recover';
type View = { kind: 'account' } | { kind: 'room'; roomId: string };
type RoomAction = 'create' | 'join' | null;

const fieldClass =
  'h-10 w-full rounded-xl px-3 text-base text-[var(--ink-1)] transition-[box-shadow,background-color] duration-150 ease-out placeholder:text-[var(--ink-4)] focus:bg-[var(--bg-elevated)] focus:shadow-[inset_0_0_0_1px_var(--border-strong)] focus-visible:outline-none sm:text-[13px]';
const codeFieldClass = `${fieldClass} font-mono tracking-[0.06em]`;
const labelClass = 'mb-1 block cursor-pointer text-xs font-medium text-[var(--ink-2)]';
const sectionHeadingClass = 'text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]';
const hintClass = 'text-xs leading-relaxed text-[var(--ink-3)]';
const primaryButtonClass =
  'flex h-10 items-center justify-center gap-1.5 rounded-full px-5 text-[13px] font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50';
const smallPrimaryClass =
  'flex h-8 shrink-0 items-center rounded-full px-3.5 text-xs font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50';
const secondaryButtonClass =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-full pl-3 pr-3.5 text-xs font-medium text-[var(--ink-1)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50';
const textLinkClass =
  'relative text-xs font-medium text-[var(--ink-2)] underline decoration-[var(--border-strong)] underline-offset-2 transition-colors before:absolute before:-inset-x-2 before:-inset-y-1.5 hover:text-[var(--ink-1)] hover:decoration-[var(--ink-1)] disabled:opacity-50';
const quietButtonClass =
  'relative text-xs text-[var(--ink-3)] transition-colors before:absolute before:-inset-x-2 before:-inset-y-1.5 hover:text-[var(--ink-1)]';
const dangerButtonClass =
  'relative text-xs font-medium text-[var(--accent)] before:absolute before:-inset-x-2 before:-inset-y-1.5 hover:underline';

const surface = { backgroundColor: 'var(--bg-surface)' };
const inkFill = { backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' };

const MODES: { id: Mode; label: string }[] = [
  { id: 'sign-in', label: 'Sign in' },
  { id: 'create', label: 'Get a passkey' },
  { id: 'join', label: 'Join a room' },
];

const newSceneId = () => `unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      aria-label={label}
      style={surface}
      className={secondaryButtonClass}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

/** A generated code, shown large enough to read back without mistakes. */
const CodeBlock: React.FC<{ code: string; label: string }> = ({ code, label }) => (
  <div style={surface} className="flex items-center justify-between gap-3 rounded-xl py-2 pl-4 pr-2">
    <code className="select-all font-mono text-[17px] font-medium tracking-[0.08em] text-[var(--ink-1)]">
      {code}
    </code>
    <CopyButton value={code} label={label} />
  </div>
);

const ScriptRow: React.FC<{
  title: string;
  meta: string;
  children: React.ReactNode;
}> = ({ title, meta, children }) => (
  <li className="flex items-center justify-between gap-3 py-2">
    <div className="min-w-0">
      <p className="truncate text-[13px] font-medium text-[var(--ink-1)]">{title.trim() || 'Untitled screenplay'}</p>
      <p className="text-[11px] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">{meta}</p>
    </div>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </li>
);

/**
 * Accounts and writers rooms. No email: a writer's name plus a generated
 * passkey signs them in on any device, syncs their own scripts, and gets
 * them into shared rooms.
 */
export const WritersRoomDialog: React.FC<WritersRoomDialogProps> = ({
  open,
  onClose,
  account,
  onAccount,
  onSignOut,
  activeDoc,
  onOpenScript,
  onScriptDeleted,
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const createRoomInputRef = useRef<HTMLInputElement>(null);
  const joinRoomInputRef = useRef<HTMLInputElement>(null);
  const roomActionFormRef = useRef<HTMLFormElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [mode, setMode] = useState<Mode>('sign-in');
  const [view, setView] = useState<View>({ kind: 'account' });
  const [roomAction, setRoomAction] = useState<RoomAction>(null);
  const roomActionRef = useRef<RoomAction>(null);
  roomActionRef.current = roomAction;
  const [name, setName] = useState('');
  const [passkey, setPasskey] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<string | null>(null);
  /** A passkey (and recovery code) just created for this writer: shown once */
  const [newSecrets, setNewSecrets] = useState<{ passkey: string; recoveryCode?: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [details, setDetails] = useState<RoomDetails | null>(null);
  /** The room view is waiting for Face ID / Touch ID on this device */
  const [roomLocked, setRoomLocked] = useState(false);
  const [devices, setDevices] = useState<DevicePasskey[] | null>(null);

  const personalRoom = account?.rooms.find((r) => r.personal);
  const sharedRooms = account?.rooms.filter((r) => !r.personal) ?? [];
  const shownRoomId = view.kind === 'room' ? view.roomId : personalRoom?.id;

  const loadDetails = useCallback(async (roomId: string | undefined) => {
    if (!roomId) return;
    try {
      setDetails(await roomApi.details(roomId));
      setRoomLocked(false);
    } catch (err) {
      if (needsDeviceCheck(err)) setRoomLocked(true);
      else setError((err as Error).message);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      setDevices((await roomApi.devicePasskeys()).devices);
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setErrorSource(null);
    setConfirming(null);
    setDetails(null);
    setRoomLocked(false);
    if (account) void loadDetails(shownRoomId);
  }, [open, account, shownRoomId, loadDetails]);

  useEffect(() => {
    if (open && account && view.kind === 'account') void loadDevices();
  }, [open, account, view.kind, loadDevices]);

  // Back to the account view whenever the dialog opens
  useEffect(() => {
    if (open) {
      setView({ kind: 'account' });
      setRoomAction(null);
    }
  }, [open]);

  useEffect(() => {
    if (!roomAction) return;
    if (!prefersReducedMotion() && roomActionFormRef.current) {
      gsap.fromTo(
        roomActionFormRef.current,
        { opacity: 0, y: -4, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.18, ease: 'power2.out' }
      );
    }
    if (canHover()) {
      const target = roomAction === 'create' ? createRoomInputRef.current : joinRoomInputRef.current;
      target?.focus();
    }
  }, [roomAction]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      if (canHover()) firstFieldRef.current?.focus();
    }, 60);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (roomActionRef.current) {
          setRoomAction(null);
          setError(null);
          setErrorSource(null);
          return;
        }
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open || prefersReducedMotion()) return;
    if (backdropRef.current) {
      gsap.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power3.out' });
    }
    if (dialogRef.current) {
      gsap.fromTo(
        dialogRef.current,
        { opacity: 0, scale: 0.97, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.24, ease: 'power3.out' }
      );
    }
  }, [open]);

  if (!open) return null;

  /** Runs an API call with a busy state and an inline error. */
  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setErrorSource(null);
    try {
      await task();
    } catch (err) {
      setError((err as Error).message);
      setErrorSource(key);
    } finally {
      setBusy(null);
    }
  };

  const acceptSession = (session: SessionResponse) => {
    if (session.passkey) setNewSecrets({ passkey: session.passkey, recoveryCode: session.recoveryCode });
    setPasskey('');
    setRecoveryCode('');
    setInviteCode('');
    setRoomName('');
    setRoomAction(null);
    onAccount(session);
  };

  /** Runs a task, and if the server wants Face ID / Touch ID first, asks for it and retries once. */
  const withDeviceCheck = async <T,>(task: () => Promise<T>): Promise<T> => {
    try {
      return await task();
    } catch (err) {
      if (!needsDeviceCheck(err)) throw err;
      onAccount(await confirmWithDevice());
      return task();
    }
  };

  const submitSignedOut = (e: React.FormEvent) => {
    e.preventDefault();
    void run('auth', async () => {
      acceptSession(
        mode === 'sign-in'
          ? await roomApi.signIn(name, passkey)
          : mode === 'recover'
          ? await roomApi.recover(name, recoveryCode)
          : mode === 'create'
          ? await roomApi.createAccount(name)
          : await roomApi.join(inviteCode, name)
      );
    });
  };

  /** The passkey and recovery code as a small text file to keep somewhere safe. */
  const downloadRecoveryFile = () => {
    if (!account || !newSecrets) return;
    const lines = [
      'Focus sign-in details',
      '',
      `Name:          ${account.me.name}`,
      `Passkey:       ${newSecrets.passkey}`,
      ...(newSecrets.recoveryCode ? [`Recovery code: ${newSecrets.recoveryCode}`] : []),
      '',
      `Sign in at ${window.location.origin} with your name and passkey.`,
      'Lost the passkey? Choose Sign in, then "Use your recovery code". You get a new',
      'passkey and recovery code, and every other device is signed out.',
      '',
      'Keep this file private: anyone with it can sign in as you.',
      '',
    ];
    downloadFile(`focus-${account.me.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-recovery.txt`, lines.join('\n'), 'text/plain;charset=utf-8');
  };

  const openScript = (id: string) =>
    run(`open-${id}`, async () => {
      onOpenScript(await roomApi.getScript(id));
    });

  const deleteScript = (id: string) =>
    run(`delete-${id}`, async () => {
      await roomApi.deleteScript(id);
      setConfirming(null);
      onScriptDeleted(id);
      await loadDetails(shownRoomId);
    });

  const signOut = () =>
    run('sign-out', async () => {
      await onSignOut();
      setDetails(null);
      setDevices(null);
      setNewSecrets(null);
      setMode('sign-in');
    });

  const isActiveInRoom = (roomId: string) => activeDoc.room?.roomId === roomId;
  const scriptMeta = (count: number, updatedAt: string) =>
    `${count} ${count === 1 ? 'scene' : 'scenes'} · updated ${timeAgo(updatedAt)}`;

  const room = view.kind === 'room' ? sharedRooms.find((r) => r.id === view.roomId) : undefined;
  const roomDetails = view.kind === 'room' && details?.room.id === view.roomId ? details : null;
  const personalDetails = view.kind === 'account' && details?.room.personal ? details : null;
  const isOwner = roomDetails?.me.role === 'owner';
  const openSeats = roomDetails ? roomDetails.room.maxWriters - roomDetails.writers.length : 0;

  const title = !account ? 'Your passkey' : room ? room.name : account.me.name;
  const subtitle = !account
    ? 'Keep your scripts on every device, and write with others. No email: your name and a passkey sign you in.'
    : room
    ? 'Scripts here sync with everyone in the room.'
    : 'Your scripts are saved to your account and open on any device where you sign in with your passkey.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="writers-room-title"
      style={{ zIndex: 'var(--z-modal)' }}
      className="no-print fixed inset-0 flex items-center justify-center p-4"
    >
      <div ref={backdropRef} onClick={onClose} className="fixed inset-0 bg-black/35 backdrop-blur-[2px]" />

      <div
        ref={dialogRef}
        style={{ backgroundColor: 'var(--bg-elevated)', boxShadow: 'var(--elevation-floating)' }}
        className="focus-scroller relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
          <div className="min-w-0">
            {room && !newSecrets && (
              <button
                type="button"
                onClick={() => setView({ kind: 'account' })}
                className="mb-1.5 flex items-center gap-1 text-xs font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)]"
              >
                <ArrowLeft className="size-3.5" />
                Your account
              </button>
            )}
            <h2 id="writers-room-title" className="truncate text-lg font-semibold tracking-[-0.01em] text-[var(--ink-1)]">
              {title}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="relative -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-[color,background-color] duration-150 ease-out before:absolute before:-inset-0.5 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Signed out: sign in, get a passkey, or join a room */}
        {!account && (
          <form onSubmit={submitSignedOut} className="px-5 pb-5 sm:px-6">
            <div
              role="tablist"
              aria-label="How to sign in"
              style={{ background: 'var(--capsule-track-bg)', boxShadow: 'var(--capsule-track-shadow)' }}
              className="mb-4 grid grid-cols-3 gap-1 rounded-full p-1"
            >
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => {
                    setMode(m.id);
                    setError(null);
                  }}
                  style={
                    mode === m.id
                      ? { background: 'var(--capsule-active-bg)', boxShadow: 'var(--capsule-active-shadow)' }
                      : undefined
                  }
                  className={`h-8 rounded-full text-xs font-medium transition-colors duration-150 ease-out ${
                    mode === m.id ? 'text-[var(--ink-1)]' : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {mode === 'join' && (
                <div>
                  <label htmlFor="room-invite" className={labelClass}>
                    Invite code
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="room-invite"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="7K2M-9QXA-P4TD"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    style={surface}
                    className={codeFieldClass}
                  />
                </div>
              )}
              <div>
                <label htmlFor="room-writer-name" className={labelClass}>
                  {mode === 'sign-in' || mode === 'recover' ? 'Name' : 'Your name'}
                </label>
                <input
                  ref={mode === 'join' ? undefined : firstFieldRef}
                  id="room-writer-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={mode === 'sign-in' || mode === 'recover' ? 'As you signed up' : 'How other writers will see you'}
                  autoComplete="username"
                  maxLength={40}
                  style={surface}
                  className={fieldClass}
                />
              </div>
              {mode === 'sign-in' && (
                <div>
                  <label htmlFor="room-passkey" className={labelClass}>
                    Passkey
                  </label>
                  <input
                    id="room-passkey"
                    type="password"
                    value={passkey}
                    onChange={(e) => setPasskey(e.target.value)}
                    placeholder="DOLLY-7K2M-9QXA"
                    autoComplete="current-password"
                    autoCapitalize="characters"
                    spellCheck={false}
                    style={surface}
                    className={codeFieldClass}
                  />
                </div>
              )}
              {mode === 'recover' && (
                <div>
                  <label htmlFor="room-recovery" className={labelClass}>
                    Recovery code
                  </label>
                  <input
                    id="room-recovery"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    placeholder="7K2M-9QXA-P4TD-RW8N-3HJC"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    style={surface}
                    className={codeFieldClass}
                  />
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-3 text-xs leading-relaxed text-[var(--accent)]">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy !== null} style={inkFill} className={`${primaryButtonClass} mt-4 w-full`}>
              {busy
                ? 'One moment…'
                : mode === 'sign-in'
                ? 'Sign in'
                : mode === 'recover'
                ? 'Get back in'
                : mode === 'create'
                ? 'Get my passkey'
                : 'Join and get my passkey'}
            </button>
            <p className={`mt-3 text-center ${hintClass}`}>
              {mode === 'sign-in' ? (
                <>
                  Signing in brings your scripts and writers rooms onto this device.{' '}
                  <button type="button" onClick={() => { setMode('recover'); setError(null); }} className={textLinkClass}>
                    Lost your passkey?
                  </button>
                </>
              ) : mode === 'recover' ? (
                <>
                  Use the recovery code you saved with your passkey. You’ll get new codes, and every other
                  device is signed out.{' '}
                  <button type="button" onClick={() => { setMode('sign-in'); setError(null); }} className={textLinkClass}>
                    Back to sign in
                  </button>
                </>
              ) : mode === 'create' ? (
                'The scripts on this device are saved to your account, so you can open them anywhere.'
              ) : (
                'Already have a passkey? Sign in first, then join from your account.'
              )}
            </p>
          </form>
        )}

        {/* A new passkey and recovery code, shown once */}
        {account && newSecrets && (
          <div className="space-y-4 px-5 pb-5 sm:px-6">
            <div>
              <h3 className={`mb-2 ${sectionHeadingClass}`}>Your passkey</h3>
              <CodeBlock code={newSecrets.passkey} label="Copy your passkey" />
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-2)]">
                Sign in as <span className="font-medium text-[var(--ink-1)]">{account.me.name}</span> with this on
                any device, and your scripts come with you.
              </p>
            </div>
            {newSecrets.recoveryCode && (
              <div>
                <h3 className={`mb-2 ${sectionHeadingClass}`}>Recovery code</h3>
                <CodeBlock code={newSecrets.recoveryCode} label="Copy your recovery code" />
                <p className="mt-2 text-xs leading-relaxed text-[var(--ink-2)]">
                  If you lose your passkey, this gets you back in. Keep it somewhere different from your passkey.
                </p>
              </div>
            )}
            <p className={hintClass}>Focus can’t show these again. Save them in your password manager, or download them.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={downloadRecoveryFile} style={surface} className={`${primaryButtonClass} flex-1 text-[var(--ink-1)]`}>
                <Download className="size-4" />
                Download as a file
              </button>
              <button type="button" onClick={() => setNewSecrets(null)} style={inkFill} className={`${primaryButtonClass} flex-1`}>
                I’ve saved them
              </button>
            </div>
          </div>
        )}

        {account && !newSecrets && (
          <div className="space-y-6 px-5 pb-5 sm:px-6">
            {error && errorSource !== 'create-room' && errorSource !== 'join-room' && (
              <p role="alert" className="text-xs leading-relaxed text-[var(--accent)]">
                {error}
              </p>
            )}

            {view.kind === 'account' && (
              <>
                <section>
                  <h3 className={`mb-1 ${sectionHeadingClass}`}>Your scripts</h3>
                  {!personalDetails ? (
                    <p className={`py-2 ${hintClass}`}>Loading…</p>
                  ) : personalDetails.scripts.length === 0 ? (
                    <p className={`py-2 ${hintClass}`}>
                      Nothing saved yet. Scripts you write while signed in are saved here automatically.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--border-subtle)]">
                      {personalDetails.scripts.map((script) => (
                        <ScriptRow key={script.id} title={script.title} meta={scriptMeta(script.sceneCount, script.updatedAt)}>
                          <button
                            type="button"
                            onClick={() => openScript(script.id)}
                            disabled={busy !== null}
                            style={inkFill}
                            className={smallPrimaryClass}
                          >
                            {busy === `open-${script.id}` ? 'Opening…' : 'Open'}
                          </button>
                        </ScriptRow>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className={`mb-1.5 ${sectionHeadingClass}`}>Writers rooms</h3>
                  {sharedRooms.length > 0 ? (
                    <ul className="mb-2.5 divide-y divide-[var(--border-subtle)]">
                      {sharedRooms.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => setView({ kind: 'room', roomId: r.id })}
                            className="group flex w-full items-center justify-between gap-3 py-2.5 text-left"
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <WriterAvatar writer={{ name: r.name, color: r.color }} size="sm" />
                              <span className="truncate text-[13px] font-medium text-[var(--ink-1)]">{r.name}</span>
                              {r.role === 'owner' && <span className="text-[11px] text-[var(--ink-3)]">You started it</span>}
                            </span>
                            {!account.security.roomVerified && (
                              <Lock aria-label="Needs Face ID or Touch ID on this device" className="ml-auto size-3.5 shrink-0 text-[var(--ink-3)]" />
                            )}
                            <ChevronRight className="size-4 shrink-0 text-[var(--ink-3)] transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`mb-3 ${hintClass}`}>
                      Write a script with up to two others. Start a room and share its invite code, or enter one
                      another writer started.
                    </p>
                  )}

                  <div className="space-y-2">
                    {roomAction === 'create' ? (
                      <form
                        ref={roomActionFormRef}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run('create-room', async () => {
                            const prevIds = new Set(account.rooms.map((r) => r.id));
                            const nextSession = await roomApi.createRoom(roomName);
                            acceptSession(nextSession);
                            const created = nextSession.rooms.find((r) => !r.personal && !prevIds.has(r.id));
                            if (created) setView({ kind: 'room', roomId: created.id });
                          });
                        }}
                        style={surface}
                        className="rounded-xl p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="new-room-name"
                            className="cursor-pointer text-xs font-medium text-[var(--ink-1)]"
                          >
                            New writers room
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setRoomAction(null);
                              setError(null);
                              setErrorSource(null);
                            }}
                            className={quietButtonClass}
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="relative mt-2">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
                            <WriterAvatar
                              writer={{
                                name: roomName.trim() || `${account.me.name}’s writers room`,
                                color: 'butter',
                              }}
                              size="sm"
                            />
                          </span>
                          <input
                            ref={createRoomInputRef}
                            id="new-room-name"
                            type="text"
                            value={roomName}
                            onChange={(e) => {
                              setRoomName(e.target.value);
                              if (errorSource === 'create-room') {
                                setError(null);
                                setErrorSource(null);
                              }
                            }}
                            placeholder={`${account.me.name}’s writers room`}
                            maxLength={60}
                            autoComplete="off"
                            spellCheck={false}
                            data-1p-ignore
                            data-lpignore="true"
                            aria-invalid={errorSource === 'create-room' && !!error}
                            style={{ backgroundColor: 'var(--bg-elevated)' }}
                            className={`${fieldClass} pl-10 pr-8`}
                          />
                          {roomName.length > 0 && (
                            <button
                              type="button"
                              aria-label="Clear room name"
                              onClick={() => {
                                setRoomName('');
                                if (errorSource === 'create-room') {
                                  setError(null);
                                  setErrorSource(null);
                                }
                                createRoomInputRef.current?.focus();
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--ink-3)] transition-colors before:absolute before:-inset-1.5 hover:text-[var(--ink-1)]"
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </div>

                        {errorSource === 'create-room' && error && (
                          <p role="alert" className="mt-2 text-xs leading-relaxed text-[var(--accent)]">
                            {error}
                          </p>
                        )}

                        <div className="mt-2.5 flex items-center justify-between gap-3">
                          <p className={hintClass}>Creates a shared room with an invite code for up to two others.</p>
                          <button
                            type="submit"
                            disabled={busy !== null}
                            style={inkFill}
                            className={`${smallPrimaryClass} gap-1 pl-3 pr-3.5`}
                          >
                            <Plus className="size-3.5" />
                            {busy === 'create-room' ? 'Starting…' : 'Start room'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        aria-expanded={false}
                        onClick={() => {
                          setRoomAction('create');
                          setError(null);
                          setErrorSource(null);
                        }}
                        style={surface}
                        className="group flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] active:scale-[0.98]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            style={{ backgroundColor: 'var(--bg-elevated)' }}
                            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[var(--ink-1)]"
                          >
                            <Plus className="size-3.5" />
                          </span>
                          <span className="truncate text-[13px] font-medium text-[var(--ink-1)]">
                            Start a new writers room
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
                          <span className="hidden sm:inline">Up to 3 writers</span>
                          <ChevronRight className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    )}

                    {roomAction === 'join' ? (
                      <form
                        ref={roomActionFormRef}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run('join-room', async () => {
                            const prevIds = new Set(account.rooms.map((r) => r.id));
                            const nextSession = await roomApi.join(inviteCode);
                            acceptSession(nextSession);
                            const joined = nextSession.rooms.find((r) => !r.personal && !prevIds.has(r.id));
                            if (joined) setView({ kind: 'room', roomId: joined.id });
                          });
                        }}
                        style={surface}
                        className="rounded-xl p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="join-room-code"
                            className="cursor-pointer text-xs font-medium text-[var(--ink-1)]"
                          >
                            Invite code
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setRoomAction(null);
                              setError(null);
                              setErrorSource(null);
                            }}
                            className={quietButtonClass}
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="relative mt-2">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]">
                            <KeyRound className="size-3.5" />
                          </span>
                          <input
                            ref={joinRoomInputRef}
                            id="join-room-code"
                            type="text"
                            value={inviteCode}
                            onChange={(e) => {
                              setInviteCode(e.target.value.toUpperCase());
                              if (errorSource === 'join-room') {
                                setError(null);
                                setErrorSource(null);
                              }
                            }}
                            placeholder="7K2M-9QXA-P4TD"
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            data-1p-ignore
                            data-lpignore="true"
                            aria-invalid={errorSource === 'join-room' && !!error}
                            style={{ backgroundColor: 'var(--bg-elevated)' }}
                            className={`${codeFieldClass} pl-9 pr-8`}
                          />
                          {inviteCode.length > 0 && (
                            <button
                              type="button"
                              aria-label="Clear invite code"
                              onClick={() => {
                                setInviteCode('');
                                if (errorSource === 'join-room') {
                                  setError(null);
                                  setErrorSource(null);
                                }
                                joinRoomInputRef.current?.focus();
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--ink-3)] transition-colors before:absolute before:-inset-1.5 hover:text-[var(--ink-1)]"
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </div>

                        {errorSource === 'join-room' && error && (
                          <p role="alert" className="mt-2 text-xs leading-relaxed text-[var(--accent)]">
                            {error}
                          </p>
                        )}

                        <div className="mt-2.5 flex items-center justify-between gap-3">
                          <p className={hintClass}>Enter the code from the writer who started the room.</p>
                          <button
                            type="submit"
                            disabled={busy !== null || !inviteCode.trim()}
                            style={inkFill}
                            className={smallPrimaryClass}
                          >
                            {busy === 'join-room' ? 'Entering…' : 'Enter room'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        aria-expanded={false}
                        onClick={() => {
                          setRoomAction('join');
                          setError(null);
                          setErrorSource(null);
                        }}
                        style={surface}
                        className="group flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] active:scale-[0.98]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            style={{ backgroundColor: 'var(--bg-elevated)' }}
                            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[var(--ink-2)]"
                          >
                            <KeyRound className="size-3.5" />
                          </span>
                          <span className="truncate text-[13px] font-medium text-[var(--ink-1)]">
                            Enter a room with an invite code
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
                          <span className="hidden sm:inline">Have a code?</span>
                          <ChevronRight className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    )}
                  </div>
                </section>

                <section>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className={sectionHeadingClass}>Face ID &amp; Touch ID</h3>
                    <button
                      type="button"
                      onClick={() =>
                        run('add-device', async () => {
                          onAccount(await withDeviceCheck(addThisDevice));
                          await loadDevices();
                        })
                      }
                      disabled={busy !== null}
                      style={surface}
                      className={secondaryButtonClass}
                    >
                      <KeyRound className="size-3.5" />
                      {busy === 'add-device' ? 'Waiting for your device…' : 'Add this device'}
                    </button>
                  </div>
                  <p className={`mb-1 ${hintClass}`}>
                    Writers rooms ask for Face ID, Touch ID, Windows Hello or a security key on each device, so a
                    passkey alone can’t get into them. Your phone can confirm for a computer by scanning a QR code.
                  </p>
                  {devices && devices.length > 0 && (
                    <ul className="divide-y divide-[var(--border-subtle)]">
                      {devices.map((device) => (
                        <li key={device.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-[var(--ink-1)]">{device.label}</p>
                            <p className="text-[11px] text-[var(--ink-3)]">
                              Added {timeAgo(device.createdAt)}
                              {device.lastUsedAt ? ` · used ${timeAgo(device.lastUsedAt)}` : ''}
                            </p>
                          </div>
                          {confirming === device.id ? (
                            <button
                              type="button"
                              onClick={() =>
                                run(`remove-${device.id}`, async () => {
                                  onAccount(
                                    await withDeviceCheck(() =>
                                      roomApi.devicePasskeyAction<SessionResponse>('remove', { id: device.id })
                                    )
                                  );
                                  setConfirming(null);
                                  await loadDevices();
                                })
                              }
                              className={dangerButtonClass}
                            >
                              Remove it
                            </button>
                          ) : (
                            <button type="button" onClick={() => setConfirming(device.id)} className={quietButtonClass}>
                              Remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className={hintClass}>Lost your passkey or recovery code, or shared one by mistake?</p>
                    {confirming === 'new-passkey' ? (
                      <button
                        type="button"
                        onClick={() =>
                          run('new-passkey', async () => {
                            setConfirming(null);
                            acceptSession(await withDeviceCheck(roomApi.newPasskey));
                          })
                        }
                        className={`shrink-0 ${dangerButtonClass}`}
                      >
                        Replace both and sign out other devices
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirming('new-passkey')} className={`shrink-0 ${textLinkClass}`}>
                        New codes
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className={hintClass}>Signing out removes your synced scripts from this device. They stay in your account.</p>
                    <button
                      type="button"
                      onClick={signOut}
                      disabled={busy !== null}
                      className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
                    >
                      <LogOut className="size-3.5" />
                      {busy === 'sign-out' ? 'Signing out…' : 'Sign out'}
                    </button>
                  </div>
                </section>
              </>
            )}

            {view.kind === 'room' && roomLocked && (
              <section style={surface} className="rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 size-4 shrink-0 text-[var(--ink-2)]" />
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold text-[var(--ink-1)]">Confirm it’s you to open this room</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--ink-2)]">
                      {account.security.devicePasskeys > 0
                        ? 'Use Face ID, Touch ID, your screen lock or security key. On a computer without them, your phone can confirm by scanning a QR code.'
                        : 'Writers rooms are protected by Face ID, Touch ID, your device’s screen lock or a security key. Set it up once on this device; it takes a few seconds.'}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        run('unlock', async () => {
                          onAccount(await unlockRooms(account));
                        })
                      }
                      disabled={busy !== null}
                      style={inkFill}
                      className={`${smallPrimaryClass} mt-3`}
                    >
                      {busy === 'unlock'
                        ? 'Waiting for your device…'
                        : account.security.devicePasskeys > 0
                        ? 'Confirm it’s you'
                        : 'Set up Face ID / Touch ID'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {view.kind === 'room' && !roomLocked && (
              <>
                <section>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className={sectionHeadingClass}>Scripts</h3>
                    <button
                      type="button"
                      onClick={() =>
                        run('new-script', async () => {
                          const slug = 'INT. LOCATION - DAY';
                          onOpenScript(
                            await roomApi.createScript(view.roomId, 'Untitled screenplay', {}, [
                              {
                                id: newSceneId(),
                                title: 'Scene 1',
                                slugline: slug,
                                synopsis: null,
                                contentHtml: `<p data-sp-type="slugline">${slug}</p><p data-sp-type="action"><br></p>`,
                              },
                            ])
                          );
                        })
                      }
                      disabled={busy !== null}
                      style={surface}
                      className={secondaryButtonClass}
                    >
                      <Plus className="size-3.5" />
                      New script
                    </button>
                  </div>
                  {!roomDetails ? (
                    <p className={`py-2 ${hintClass}`}>Loading the room…</p>
                  ) : roomDetails.scripts.length === 0 ? (
                    <p className={`py-2 ${hintClass}`}>No scripts yet. Start one, or share a copy of the script you have open.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--border-subtle)]">
                      {roomDetails.scripts.map((script) => (
                        <ScriptRow key={script.id} title={script.title} meta={scriptMeta(script.sceneCount, script.updatedAt)}>
                          {isOwner &&
                            (confirming === script.id ? (
                              <button type="button" onClick={() => deleteScript(script.id)} className={dangerButtonClass}>
                                Delete for everyone
                              </button>
                            ) : (
                              <button type="button" onClick={() => setConfirming(script.id)} className={quietButtonClass}>
                                Delete
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() => openScript(script.id)}
                            disabled={busy !== null}
                            style={inkFill}
                            className={smallPrimaryClass}
                          >
                            {busy === `open-${script.id}` ? 'Opening…' : 'Open'}
                          </button>
                        </ScriptRow>
                      ))}
                    </ul>
                  )}
                  {!isActiveInRoom(view.roomId) && (
                    <button
                      type="button"
                      onClick={() =>
                        run('share', async () => {
                          onOpenScript(
                            await roomApi.createScript(
                              view.roomId,
                              activeDoc.title,
                              documentMeta(activeDoc),
                              (activeDoc.units ?? []).map(unitToScene)
                            )
                          );
                        })
                      }
                      disabled={busy !== null}
                      className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)] disabled:opacity-50"
                    >
                      <Share2 className="size-3.5" />
                      {busy === 'share' ? 'Sharing…' : `Share a copy of “${activeDoc.title.trim() || 'Untitled'}” with the room`}
                    </button>
                  )}
                </section>

                {roomDetails && (
                  <section>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <h3 className={sectionHeadingClass}>Writers</h3>
                      <span className="text-[11px] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">
                        {roomDetails.writers.length} of {roomDetails.room.maxWriters}
                      </span>
                    </div>
                    <ul className="divide-y divide-[var(--border-subtle)]">
                      {roomDetails.writers.map((writer) => (
                        <li key={writer.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <WriterAvatar writer={writer} />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-[var(--ink-1)]">
                                {writer.name}
                                {writer.id === account.me.id && <span className="font-normal text-[var(--ink-3)]"> (you)</span>}
                              </p>
                              {writer.role === 'owner' && <p className="text-[11px] text-[var(--ink-3)]">Started the room</p>}
                            </div>
                          </div>
                          {isOwner &&
                            writer.id !== account.me.id &&
                            (confirming === writer.id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  run(`remove-${writer.id}`, async () => {
                                    await roomApi.removeWriter(view.roomId, writer.id);
                                    setConfirming(null);
                                    await loadDetails(view.roomId);
                                  })
                                }
                                className={dangerButtonClass}
                              >
                                Remove {writer.name}
                              </button>
                            ) : (
                              <button type="button" onClick={() => setConfirming(writer.id)} className={quietButtonClass}>
                                Remove
                              </button>
                            ))}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {roomDetails?.room.inviteCode && (
                  <section>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h3 className={sectionHeadingClass}>Invite code</h3>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() =>
                            run('invite', async () => {
                              const result = await roomApi.newInvite(view.roomId);
                              setDetails({ ...roomDetails, room: { ...roomDetails.room, inviteCode: result.inviteCode } });
                            })
                          }
                          disabled={busy !== null}
                          className={textLinkClass}
                        >
                          New code
                        </button>
                      )}
                    </div>
                    {openSeats > 0 ? (
                      <>
                        <CodeBlock code={roomDetails.room.inviteCode} label="Copy invite code" />
                        <p className={`mt-2 ${hintClass}`}>
                          Share it with {openSeats === 1 ? 'one more writer' : `up to ${openSeats} writers`}. They choose{' '}
                          <span className="text-[var(--ink-2)]">Join a room</span>, or enter it in their account if they
                          already have a passkey.
                        </p>
                      </>
                    ) : (
                      <p className={hintClass}>The room is full.{isOwner ? ' Remove a writer to invite someone else.' : ''}</p>
                    )}
                  </section>
                )}

                {roomDetails && !isOwner && (
                  <div className="flex justify-end border-t border-[var(--border-subtle)] pt-3">
                    {confirming === 'leave' ? (
                      <button
                        type="button"
                        onClick={() =>
                          run('leave', async () => {
                            await roomApi.leaveRoom(view.roomId);
                            const session = await roomApi.session();
                            if (session) onAccount(session);
                            setView({ kind: 'account' });
                          })
                        }
                        className={dangerButtonClass}
                      >
                        Leave {roomDetails.room.name}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirming('leave')} className={quietButtonClass}>
                        Leave this room
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
