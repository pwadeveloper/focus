import React, { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Check, Copy, LogOut, Plus, Share2, X } from 'lucide-react';
import type { DocumentItem } from '../types';
import type { RoomDetails, RoomScript, SessionResponse } from '../../api/_lib/types';
import { roomApi } from '../room/api';
import { documentMeta, unitToScene } from '../room/convert';
import { WriterAvatar } from './WriterAvatar';
import { canHover, prefersReducedMotion } from '../motion';

interface WritersRoomDialogProps {
  open: boolean;
  onClose: () => void;
  session: SessionResponse | null;
  onSession: (session: SessionResponse) => void;
  onSignOut: () => void;
  /** The open script, offered for sharing when it isn't in the room yet */
  activeDoc: DocumentItem;
  onOpenScript: (script: RoomScript) => void;
  onScriptDeleted: (scriptId: string) => void;
}

type Mode = 'sign-in' | 'join' | 'start';

const fieldClass =
  'h-10 w-full rounded-xl px-3 text-base text-[var(--ink-1)] transition-[box-shadow,background-color] duration-150 ease-out placeholder:text-[var(--ink-4)] focus:bg-[var(--bg-elevated)] focus:shadow-[inset_0_0_0_1px_var(--border-strong)] focus:outline-none sm:text-[13px]';
const labelClass = 'mb-1 block text-xs font-medium text-[var(--ink-2)]';
const sectionHeadingClass = 'text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]';
const primaryButtonClass =
  'flex h-10 items-center justify-center gap-1.5 rounded-full px-5 text-[13px] font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50';
const secondaryButtonClass =
  'flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--ink-1)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50';
const textLinkClass =
  'relative text-xs font-medium text-[var(--ink-2)] underline decoration-[var(--border-strong)] underline-offset-2 transition-colors before:absolute before:-inset-x-2 before:-inset-y-1.5 hover:text-[var(--ink-1)] hover:decoration-[var(--ink-1)] disabled:opacity-50';

const MODES: { id: Mode; label: string }[] = [
  { id: 'sign-in', label: 'Sign in' },
  { id: 'join', label: 'Join a room' },
  { id: 'start', label: 'Start a room' },
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
      style={{ backgroundColor: 'var(--bg-surface)' }}
      className={secondaryButtonClass}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

/** A generated code, shown large enough to read back without mistakes. */
const CodeBlock: React.FC<{ code: string; label: string }> = ({ code, label }) => (
  <div
    style={{ backgroundColor: 'var(--bg-surface)' }}
    className="flex items-center justify-between gap-3 rounded-xl py-2 pl-4 pr-2"
  >
    <code className="select-all font-mono text-[17px] font-medium tracking-[0.08em] text-[var(--ink-1)]">
      {code}
    </code>
    <CopyButton value={code} label={label} />
  </div>
);

/**
 * The writers room: sign in with a name and passkey (no email), join with an
 * invite code, or start a room; then open, start or share scripts.
 */
export const WritersRoomDialog: React.FC<WritersRoomDialogProps> = ({
  open,
  onClose,
  session,
  onSession,
  onSignOut,
  activeDoc,
  onOpenScript,
  onScriptDeleted,
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [passkey, setPasskey] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A passkey just created for this writer: shown once */
  const [newPasskey, setNewPasskey] = useState<string | null>(null);
  /** A passkey the owner just reissued for someone else */
  const [issued, setIssued] = useState<{ writerName: string; passkey: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [details, setDetails] = useState<RoomDetails | null>(null);

  const loadDetails = useCallback(async () => {
    try {
      setDetails(await roomApi.details());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIssued(null);
    setConfirming(null);
    if (session) void loadDetails();
  }, [open, session, loadDetails]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      if (canHover()) firstFieldRef.current?.focus();
    }, 60);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
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
    try {
      await task();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submitSignedOut = (e: React.FormEvent) => {
    e.preventDefault();
    void run('auth', async () => {
      const result =
        mode === 'sign-in'
          ? await roomApi.signIn(name, passkey)
          : mode === 'join'
          ? await roomApi.join(inviteCode, name)
          : await roomApi.createRoom(roomName, name);
      if (result.passkey) setNewPasskey(result.passkey);
      setPasskey('');
      setInviteCode('');
      onSession(result);
    });
  };

  const openScript = (id: string) =>
    run(`open-${id}`, async () => {
      onOpenScript(await roomApi.getScript(id));
    });

  const newScript = () =>
    run('new-script', async () => {
      const slug = 'INT. LOCATION - DAY';
      onOpenScript(
        await roomApi.createScript('Untitled screenplay', {}, [
          {
            id: newSceneId(),
            title: 'Scene 1',
            slugline: slug,
            synopsis: null,
            contentHtml: `<p data-sp-type="slugline">${slug}</p><p data-sp-type="action"><br></p>`,
          },
        ])
      );
    });

  const shareActive = () =>
    run('share', async () => {
      onOpenScript(
        await roomApi.createScript(
          activeDoc.title,
          documentMeta(activeDoc),
          (activeDoc.units ?? []).map(unitToScene)
        )
      );
    });

  const signOut = () =>
    run('sign-out', async () => {
      await roomApi.signOut().catch(() => {});
      setDetails(null);
      setNewPasskey(null);
      onSignOut();
    });

  const me = details?.me ?? session?.me;
  const isOwner = me?.role === 'owner';
  const openSeats = details ? details.room.maxWriters - details.writers.length : 0;

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
            <h2 id="writers-room-title" className="text-lg font-semibold tracking-[-0.01em] text-[var(--ink-1)]">
              {session ? session.room.name : 'Writers room'}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">
              {session ? (
                <>Signed in as {session.me.name}. Scripts here sync with everyone in the room.</>
              ) : (
                <>Write a script with up to two others. No email: you sign in with your name and a passkey.</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close writers room"
            className="relative -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-[color,background-color] duration-150 ease-out before:absolute before:-inset-0.5 hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {!session && (
          <form onSubmit={submitSignedOut} className="px-5 pb-5 sm:px-6">
            <div
              role="tablist"
              aria-label="How to enter"
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
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    className={`${fieldClass} font-mono tracking-[0.06em]`}
                  />
                </div>
              )}
              {mode === 'start' && (
                <div>
                  <label htmlFor="room-name" className={labelClass}>
                    Room name <span className="font-normal text-[var(--ink-3)]">optional</span>
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="room-name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Night Frequency writers"
                    maxLength={60}
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    className={fieldClass}
                  />
                </div>
              )}
              <div>
                <label htmlFor="room-writer-name" className={labelClass}>
                  {mode === 'sign-in' ? 'Name' : 'Your name'}
                </label>
                <input
                  ref={mode === 'sign-in' ? firstFieldRef : undefined}
                  id="room-writer-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="As the room knows you"
                  autoComplete="username"
                  maxLength={40}
                  style={{ backgroundColor: 'var(--bg-surface)' }}
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
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    className={`${fieldClass} font-mono tracking-[0.06em]`}
                  />
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-3 text-xs leading-relaxed text-[var(--accent)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy !== null}
              style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
              className={`${primaryButtonClass} mt-4 w-full`}
            >
              {busy
                ? 'One moment…'
                : mode === 'sign-in'
                ? 'Enter the writers room'
                : mode === 'join'
                ? 'Join and get my passkey'
                : 'Start the room'}
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--ink-3)]">
              {mode === 'sign-in'
                ? 'Lost your passkey? Ask the person who started your room for a new one.'
                : 'You’ll get a passkey. With your name, it’s how you sign in on any device.'}
            </p>
          </form>
        )}

        {session && newPasskey && (
          <div className="px-5 pb-5 sm:px-6">
            <h3 className={`mb-2 ${sectionHeadingClass}`}>Your passkey</h3>
            <CodeBlock code={newPasskey} label="Copy your passkey" />
            <p className="mt-2.5 text-xs leading-relaxed text-[var(--ink-2)]">
              Save it in your password manager or somewhere safe. With your name,{' '}
              <span className="font-medium text-[var(--ink-1)]">{session.me.name}</span>, it’s how you
              get back in on any device. Focus can’t show it again.
            </p>
            <button
              type="button"
              onClick={() => setNewPasskey(null)}
              style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
              className={`${primaryButtonClass} mt-4 w-full`}
            >
              I’ve saved my passkey
            </button>
          </div>
        )}

        {session && !newPasskey && (
          <div className="space-y-6 px-5 pb-5 sm:px-6">
            {error && (
              <p role="alert" className="text-xs leading-relaxed text-[var(--accent)]">
                {error}
              </p>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className={sectionHeadingClass}>Scripts</h3>
                <button
                  type="button"
                  onClick={newScript}
                  disabled={busy !== null}
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                  className={secondaryButtonClass}
                >
                  <Plus className="size-3.5" />
                  New script
                </button>
              </div>
              {!details ? (
                <p className="py-2 text-xs text-[var(--ink-3)]">Loading the room…</p>
              ) : details.scripts.length === 0 ? (
                <p className="py-2 text-xs leading-relaxed text-[var(--ink-3)]">
                  No scripts yet. Start one, or share the script you have open.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {details.scripts.map((script) => (
                    <li key={script.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-[var(--ink-1)]">
                          {script.title.trim() || 'Untitled screenplay'}
                        </p>
                        <p className="text-[11px] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">
                          {script.sceneCount} {script.sceneCount === 1 ? 'scene' : 'scenes'} · updated{' '}
                          {timeAgo(script.updatedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isOwner &&
                          (confirming === script.id ? (
                            <button
                              type="button"
                              onClick={() =>
                                run(`delete-${script.id}`, async () => {
                                  await roomApi.deleteScript(script.id);
                                  setConfirming(null);
                                  onScriptDeleted(script.id);
                                  await loadDetails();
                                })
                              }
                              className="text-xs font-medium text-[var(--accent)] hover:underline"
                            >
                              Delete for everyone
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirming(script.id)}
                              className="text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)]"
                            >
                              Delete
                            </button>
                          ))}
                        <button
                          type="button"
                          onClick={() => openScript(script.id)}
                          disabled={busy !== null}
                          style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
                          className="flex h-8 items-center rounded-full px-3.5 text-xs font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96] disabled:opacity-50"
                        >
                          {busy === `open-${script.id}` ? 'Opening…' : 'Open'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!activeDoc.room && (
                <button
                  type="button"
                  onClick={shareActive}
                  disabled={busy !== null}
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)] disabled:opacity-50"
                >
                  <Share2 className="size-3.5" />
                  {busy === 'share'
                    ? 'Sharing…'
                    : `Share a copy of “${activeDoc.title.trim() || 'Untitled'}” with the room`}
                </button>
              )}
            </section>

            {details && (
              <section>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h3 className={sectionHeadingClass}>Writers</h3>
                  <span className="text-[11px] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">
                    {details.writers.length} of {details.room.maxWriters}
                  </span>
                </div>
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {details.writers.map((writer) => (
                    <li key={writer.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <WriterAvatar writer={writer} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[var(--ink-1)]">
                            {writer.name}
                            {writer.id === me?.id && (
                              <span className="font-normal text-[var(--ink-3)]"> (you)</span>
                            )}
                          </p>
                          {writer.role === 'owner' && (
                            <p className="text-[11px] text-[var(--ink-3)]">Started the room</p>
                          )}
                        </div>
                      </div>
                      {isOwner && (
                        <div className="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              run(`passkey-${writer.id}`, async () => {
                                const result = await roomApi.reissuePasskey(writer.id);
                                setIssued({ writerName: writer.name, passkey: result.passkey });
                              })
                            }
                            disabled={busy !== null}
                            className={textLinkClass}
                          >
                            New passkey
                          </button>
                          {writer.id !== me?.id &&
                            (confirming === writer.id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  run(`remove-${writer.id}`, async () => {
                                    await roomApi.removeWriter(writer.id);
                                    setConfirming(null);
                                    await loadDetails();
                                  })
                                }
                                className="text-xs font-medium text-[var(--accent)] hover:underline"
                              >
                                Remove {writer.name}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirming(writer.id)}
                                className="text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)]"
                              >
                                Remove
                              </button>
                            ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {issued && (
                  <div className="mt-2">
                    <p className="mb-1.5 text-xs leading-relaxed text-[var(--ink-2)]">
                      New passkey for <span className="font-medium text-[var(--ink-1)]">{issued.writerName}</span>.
                      Their old one has stopped working, so share this with them privately.
                    </p>
                    <CodeBlock code={issued.passkey} label={`Copy ${issued.writerName}’s new passkey`} />
                  </div>
                )}
              </section>
            )}

            {details && (
              <section>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className={sectionHeadingClass}>Invite code</h3>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() =>
                        run('invite', async () => {
                          const result = await roomApi.newInvite();
                          setDetails({ ...details, room: { ...details.room, inviteCode: result.inviteCode } });
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
                    <CodeBlock code={details.room.inviteCode} label="Copy invite code" />
                    <p className="mt-2 text-xs leading-relaxed text-[var(--ink-3)]">
                      Share it with {openSeats === 1 ? 'one more writer' : `up to ${openSeats} writers`}.
                      They choose <span className="text-[var(--ink-2)]">Join a room</span> and get their own
                      passkey.
                    </p>
                  </>
                ) : (
                  <p className="text-xs leading-relaxed text-[var(--ink-3)]">
                    The room is full. {isOwner ? 'Remove a writer to invite someone else.' : ''}
                  </p>
                )}
              </section>
            )}

            <div className="flex justify-end border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={signOut}
                disabled={busy !== null}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)]"
              >
                <LogOut className="size-3.5" />
                Sign out of the room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
