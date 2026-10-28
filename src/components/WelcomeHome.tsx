import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ArrowRight, ArrowUpRight, MonitorDown, Plus } from 'lucide-react';
import filmSchoolLogo from '../assets/filmschool-africa-logo.png';
import { FocusWordmark } from './FocusLogo';
import { modKeys } from '../screenplay';
import { prefersReducedMotion } from '../motion';
import { installApp, isInstalled, isIosBrowser, usePwa } from '../pwa';

interface WelcomeHomeProps {
  /** Title of the script that the secondary action opens. */
  continueTitle: string;
  /** The script to continue is the bundled sample, not the writer's own. */
  isSample: boolean;
  onStartNew: () => void;
  onContinue: () => void;
  onOpenWritersRoom: () => void;
}

/**
 * Home page: welcomes writers to Focus, shows the few keys that make the
 * format work, and credits filmschool.Africa.
 */
export const WelcomeHome: React.FC<WelcomeHomeProps> = ({
  continueTitle,
  isSample,
  onStartNew,
  onContinue,
  onOpenWritersRoom,
}) => {
  const { canInstall } = usePwa();
  const showIosHint = !canInstall && isIosBrowser() && !isInstalled();
  const contentRef = useRef<HTMLDivElement>(null);
  const { mod } = modKeys();

  // Layout effect so the items are hidden before first paint, not after
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || prefersReducedMotion()) return;
    const tween = gsap.fromTo(
      el.querySelectorAll('[data-welcome-item]'),
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06 }
    );
    return () => {
      tween.kill();
    };
  }, []);

  const quickStart = [
    { keys: 'INT. / EXT.', label: 'starts a scene heading' },
    { keys: 'Tab', label: 'turns an action line into a character name' },
    { keys: `${mod}M`, label: 'shows every scene on a timeline' },
  ];

  return (
    <div
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      className="flex min-h-dvh flex-col"
    >
      <header className="px-6 pt-6 sm:px-10">
        <FocusWordmark title="Focus" className="block h-6 w-auto" />
      </header>

      <main className="flex flex-1 items-center px-6 py-12 sm:px-10">
        <div ref={contentRef} className="mx-auto w-full max-w-[560px]">
          <h1
            data-welcome-item
            className="text-balance font-serif text-[40px] font-normal leading-[1.05] tracking-[-0.025em] text-[var(--ink-1)] sm:text-[56px]"
          >
            Welcome to Focus.
          </h1>
          <p
            data-welcome-item
            className="mt-4 max-w-[46ch] text-pretty text-[15px] leading-relaxed text-[var(--ink-2)] sm:text-base"
          >
            A quiet place to write for the screen. Focus formats your screenplay as you type, keeps
            you on one scene at a time, and saves every word on this device.
          </p>

          <div data-welcome-item className="mt-8 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onStartNew}
              style={{ backgroundColor: 'var(--ink-1)', color: 'var(--bg-canvas)' }}
              className="flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-medium transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
            >
              <Plus className="size-4" strokeWidth={2} />
              Start a new screenplay
            </button>
            <button
              type="button"
              onClick={onContinue}
              style={{ backgroundColor: 'var(--bg-surface)' }}
              className="flex h-10 min-w-0 items-center gap-1.5 rounded-full px-5 text-[13px] font-medium text-[var(--ink-1)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-subtle-hover)] active:scale-[0.96]"
            >
              {isSample ? (
                'Explore the sample script'
              ) : (
                <>
                  Continue <span className="max-w-[18ch] truncate">{continueTitle.trim() || 'Untitled'}</span>
                </>
              )}
              <ArrowRight className="size-3.5 shrink-0" />
            </button>
          </div>
          <p data-welcome-item className="mt-4 text-[13px] leading-relaxed text-[var(--ink-3)]">
            Writing on more than one device, or with others?{' '}
            <button
              type="button"
              onClick={onOpenWritersRoom}
              className="relative font-medium text-[var(--ink-1)] underline decoration-[var(--border-strong)] underline-offset-2 transition-colors before:absolute before:-inset-x-1 before:-inset-y-1.5 hover:decoration-[var(--ink-1)]"
            >
              Get a passkey or sign in
            </button>
          </p>
          {canInstall && (
            <button
              data-welcome-item
              type="button"
              onClick={() => void installApp()}
              className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
            >
              <MonitorDown className="size-4" />
              Install Focus as an app on this device
            </button>
          )}
          {showIosHint && (
            <p data-welcome-item className="mt-3 text-[13px] leading-relaxed text-[var(--ink-3)]">
              To install Focus as an app, tap Share, then{' '}
              <span className="font-medium text-[var(--ink-2)]">Add to Home Screen</span>.
            </p>
          )}

          <dl data-welcome-item className="mt-10 space-y-2">
            {quickStart.map((row) => (
              <div key={row.keys} className="flex items-baseline gap-3 text-[13px]">
                <dt className="w-[92px] shrink-0">
                  <kbd
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    className="rounded-md px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink-1)]"
                  >
                    {row.keys}
                  </kbd>
                </dt>
                <dd className="text-[var(--ink-2)]">{row.label}</dd>
              </div>
            ))}
          </dl>

          <div
            data-welcome-item
            className="mt-12 flex items-center gap-4 border-t border-[var(--border-subtle)] pt-6"
          >
            {/* White plate keeps the black logo legible on every theme */}
            <div
              style={{ backgroundColor: '#FFFFFF', boxShadow: 'var(--elevation-raised)' }}
              className="shrink-0 rounded-xl p-2.5"
            >
              <img
                src={filmSchoolLogo}
                alt="The Film & Content School Africa"
                width={36}
                height={56}
                className="block h-14 w-auto"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Powered by
              </p>
              <a
                href="https://filmschool.africa"
                target="_blank"
                rel="noopener noreferrer"
                className="relative mt-0.5 inline-flex items-center gap-1 text-[15px] font-semibold text-[var(--ink-1)] underline decoration-[var(--border-strong)] underline-offset-[3px] transition-colors before:absolute before:-inset-x-1.5 before:-inset-y-1 hover:decoration-[var(--ink-1)]"
              >
                filmschool.Africa
                <ArrowUpRight className="size-3.5" />
              </a>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">The Film &amp; Content School Africa</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
