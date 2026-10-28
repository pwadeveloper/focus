import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import gsap from 'gsap';
import {
  LayoutGrid,
  ArrowLeft,
  ArrowRight,
  Plus,
} from 'lucide-react';
import {
  DocumentUnit,
  FocusMode,
  FontSizeStep,
  FontVoice,
  MeasureStep,
  WorkKind,
} from '../types';
import { getUnitBadgeLabel } from '../editorUtils';
import { FloatingToolbar, SelectionRectInfo } from './FloatingToolbar';
import { DocumentOutline } from './DocumentOutline';
import {
  AutocompleteSuggestion,
  computeScreenplaySuggestions,
  ScreenplayAutocompletePopover,
  ScreenplayElementBar,
} from './ScreenplayTools';
import { ScreenplayGuide } from './ScreenplayGuide';
import {
  ScreenplayBlockType,
  ScreenplayVocabItem,
  FOUNTAIN_LINE_TRIGGERS,
  HEADING_PREFIX_RE,
  SPEECH_BLOCKS,
  blockByDigit,
  blockSpec,
  isMacPlatform,
  isVocabValue,
  opensForTyping,
  parseSceneHeading,
  formatSceneHeading,
} from '../screenplay';
import { gsapButtonHover, prefersReducedMotion } from '../motion';

interface RichEditorProps {
  docId: string;
  workKind: WorkKind;
  docTitle: string;
  unitId: string;
  unitTitle: string;
  unitSlugline?: string;
  initialHtml: string;
  units?: DocumentUnit[];
  knownCharacters?: string[];
  knownLocations?: string[];
  fontVoice: FontVoice;
  fontSize: FontSizeStep;
  measure: MeasureStep;
  focusMode: FocusMode;
  typewriterMode: boolean;
  sidebarOpen: boolean;
  isTyping: boolean;
  onChangeTitle: (newTitle: string) => void;
  onChangeSlugline?: (newSlugline: string) => void;
  onChangeHtml: (newHtml: string) => void;
  onSelectUnit?: (unitId: string) => void;
  onCreateNextUnit?: () => void;
  onOpenBirdsEye?: () => void;
  onUserTyping: () => void;
  screenplayGuideOpen?: boolean;
  onCloseScreenplayGuide?: () => void;
  onToggleScreenplayGuide?: () => void;
  onOpenTitlePage?: () => void;
  /** Another writer holds this scene: show it updating, but don't allow edits. */
  readOnly?: boolean;
  /** Shown above the scene title, e.g. who is writing it. */
  notice?: React.ReactNode;
}

export const RichEditor: React.FC<RichEditorProps> = ({
  docId,
  workKind,
  docTitle,
  unitId,
  unitTitle,
  unitSlugline,
  initialHtml,
  units = [],
  knownCharacters = [],
  knownLocations = [],
  fontVoice,
  fontSize,
  measure,
  focusMode,
  typewriterMode,
  sidebarOpen,
  isTyping,
  onChangeTitle,
  onChangeSlugline,
  onChangeHtml,
  onSelectUnit,
  onCreateNextUnit,
  onOpenBirdsEye,
  onUserTyping,
  screenplayGuideOpen = false,
  onCloseScreenplayGuide,
  onToggleScreenplayGuide,
  onOpenTitlePage,
  readOnly = false,
  notice,
}) => {
  const mainRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const lastContentKeyRef = useRef<string>('');

  const [liveHtml, setLiveHtml] = useState<string>(initialHtml);
  const [isEmpty, setIsEmpty] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRectInfo>({
    top: 0,
    left: 0,
    visible: false,
  });
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  // Screenplay state
  const [activeSpBlockType, setActiveSpBlockType] =
    useState<ScreenplayBlockType>('action');
  const [spSuggestions, setSpSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [spSelectedIndex, setSpSelectedIndex] = useState<number>(0);
  const [spPopoverPos, setSpPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [sluglineInputFocused, setSluglineInputFocused] = useState(false);

  const btnHover = gsapButtonHover({ hoverScale: 1.03, hoverY: -0.5, pressScale: 0.96 });

  const currentUnitIndex = useMemo(
    () => units.findIndex((u) => u.id === unitId),
    [units, unitId]
  );
  const currentUnit = units[currentUnitIndex];
  const prevUnit = currentUnitIndex > 0 ? units[currentUnitIndex - 1] : null;
  const nextUnit =
    currentUnitIndex >= 0 && currentUnitIndex < units.length - 1
      ? units[currentUnitIndex + 1]
      : null;

  const adjustTitleHeight = useCallback(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    adjustTitleHeight();
  }, [unitTitle, fontSize, fontVoice, adjustTitleHeight]);

  // Load initialHtml when switching documents or scenes
  const contentKey = `${docId}::${unitId}`;
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (lastContentKeyRef.current !== contentKey) {
      const isSwitch = lastContentKeyRef.current !== '';
      lastContentKeyRef.current = contentKey;
      const defaultHtml =
        workKind === 'screenplay'
          ? `<p data-sp-type="slugline">${unitSlugline || 'INT. LOCATION - DAY'}</p><p data-sp-type="action"><br></p>`
          : '<p><br></p>';
      el.innerHTML = initialHtml || defaultHtml;
      setLiveHtml(el.innerHTML);
      // Always re-sync so dual-dialogue offsets match the new scene
      syncDualLayout();
      // The old caret pointed into replaced content
      savedRangeRef.current = null;
      const text = (el.textContent || '').trim();
      setIsEmpty(text.length === 0);
      setSelectionRect((prev) => ({ ...prev, visible: false }));
      setSpSuggestions([]);

      if (isSwitch && mainRef.current && !prefersReducedMotion()) {
        gsap.fromTo(
          mainRef.current,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.24,
            ease: 'power3.out',
            overwrite: 'auto',
          }
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, initialHtml, workKind, unitSlugline]);

  // While another writer holds this scene, show their changes as they arrive.
  // Also catch up once more as the scene becomes editable for us.
  const readOnlyRef = useRef(readOnly);
  const wasReadOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  useEffect(() => {
    const el = editorRef.current;
    const wasReadOnly = wasReadOnlyRef.current;
    wasReadOnlyRef.current = readOnly;
    if (!el || (!readOnly && !wasReadOnly) || !initialHtml) return;
    if (el.innerHTML === initialHtml) return;
    el.innerHTML = initialHtml;
    setLiveHtml(el.innerHTML);
    syncDualLayout();
    setIsEmpty((el.textContent || '').trim().length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, initialHtml]);

  // Resolve top-level block inside editor for a DOM node
  const getTopLevelBlock = useCallback((node: Node | null): HTMLElement | null => {
    const editor = editorRef.current;
    if (!editor || !node) return null;
    let curr: Node | null = node;
    while (curr && curr.parentNode !== editor) {
      curr = curr.parentNode;
    }
    if (curr && curr.parentNode === editor && curr.nodeType === Node.ELEMENT_NODE) {
      return curr as HTMLElement;
    }
    return null;
  }, []);

  /**
   * Dual dialogue: each speech keeps its own column (static CSS margins), and
   * the second speech is lifted to sit beside the first. Offsets are measured
   * from the natural layout and written to a stylesheet we own, so nothing
   * leaks into the saved HTML. Each column flows independently.
   */
  const dualStyleRef = useRef<HTMLStyleElement | null>(null);
  const syncDualLayout = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!dualStyleRef.current) {
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-focus-dual', '');
      document.head.appendChild(styleEl);
      dualStyleRef.current = styleEl;
    }
    const styleEl = dualStyleRef.current;
    const children = Array.from(editor.children) as HTMLElement[];
    const isScreenplay = editor.getAttribute('data-work-kind') === 'screenplay';

    // Drop orphaned markers: a left column must be followed directly by a
    // right column (and vice versa), otherwise neither side is dual any more
    if (isScreenplay) {
      let k = 0;
      while (k < children.length) {
        const side = children[k].getAttribute('data-dual');
        if (!side) {
          k += 1;
          continue;
        }
        const run: HTMLElement[] = [];
        while (k < children.length && children[k].getAttribute('data-dual') === side) {
          run.push(children[k]);
          k += 1;
        }
        const pairedAfter =
          side === '1' && children[k]?.getAttribute('data-dual') === '2';
        const before = children[k - run.length - 1];
        const pairedBefore = side === '2' && before?.getAttribute('data-dual') === '1';
        if (!pairedAfter && !pairedBefore) {
          run.forEach((el) => el.removeAttribute('data-dual'));
        }
      }
    }

    if (!isScreenplay || !children.some((c) => c.hasAttribute('data-dual'))) {
      if (styleEl.textContent) styleEl.textContent = '';
      return;
    }

    // Measure the natural (unshifted) layout
    styleEl.textContent = '';
    const rules: string[] = [];
    let i = 0;
    while (i < children.length) {
      if (children[i].getAttribute('data-dual') !== '1') {
        i += 1;
        continue;
      }
      const left: number[] = [];
      while (i < children.length && children[i].getAttribute('data-dual') === '1') {
        left.push(i);
        i += 1;
      }
      const right: number[] = [];
      while (i < children.length && children[i].getAttribute('data-dual') === '2') {
        right.push(i);
        i += 1;
      }
      if (right.length === 0) continue;
      const leftTop = children[left[0]].getBoundingClientRect().top;
      const leftBottom = children[left[left.length - 1]].getBoundingClientRect().bottom;
      const rightTop = children[right[0]].getBoundingClientRect().top;
      const rightBottom = children[right[right.length - 1]].getBoundingClientRect().bottom;
      const lift = Math.max(0, rightTop - leftTop);
      // Reclaim the flow space the lifted column leaves behind
      const reclaim = Math.max(0, Math.min(rightBottom - leftBottom, lift));
      right.forEach((idx) => {
        rules.push(
          `.focus-editor[data-work-kind="screenplay"] > :nth-child(${idx + 1}){position:relative !important;top:-${lift.toFixed(1)}px !important}`
        );
      });
      rules.push(
        `.focus-editor[data-work-kind="screenplay"] > :nth-child(${right[right.length - 1] + 1}){margin-block-end:-${reclaim.toFixed(1)}px !important}`
      );
    }
    styleEl.textContent = rules.join('\n');
  }, []);

  // Re-measure dual dialogue when the column width or font changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || workKind !== 'screenplay' || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncDualLayout);
    });
    observer.observe(editor);
    // Printing lays the page out at a different width: re-measure for print
    // and again when returning to the screen
    const printQuery = window.matchMedia('print');
    const handlePrintChange = () => syncDualLayout();
    printQuery.addEventListener('change', handlePrintChange);
    window.addEventListener('afterprint', handlePrintChange);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      printQuery.removeEventListener('change', handlePrintChange);
      window.removeEventListener('afterprint', handlePrintChange);
    };
  }, [workKind, syncDualLayout]);

  useEffect(
    () => () => {
      dualStyleRef.current?.remove();
      dualStyleRef.current = null;
    },
    []
  );

  const emitHtmlChange = useCallback(() => {
    const el = editorRef.current;
    if (!el || readOnlyRef.current) return;
    if (workKind === 'screenplay') syncDualLayout();
    const text = (el.textContent || '').trim();
    setIsEmpty(text.length === 0);
    const html = el.innerHTML;
    setLiveHtml(html);
    onChangeHtml(html);

    // If in screenplay mode and first block is a slugline, keep unitSlugline synced
    if (workKind === 'screenplay' && onChangeSlugline) {
      const firstSlug = el.querySelector('p[data-sp-type="slugline"]');
      if (firstSlug) {
        const slugText = (firstSlug.textContent || '').trim().toUpperCase();
        if (slugText && slugText !== unitSlugline) {
          onChangeSlugline(slugText);
        }
      }
    }
  }, [onChangeHtml, workKind, onChangeSlugline, unitSlugline, syncDualLayout]);

  // Update active block highlight for Focus Mode + inspect active formatting + Screenplay block type
  const updateFocusAndToolbar = useCallback(
    (scrollTypewriter = false, checkAutocomplete = false) => {
      const editor = editorRef.current;
      const sel = window.getSelection();
      if (!editor || !sel || sel.rangeCount === 0) {
        setSelectionRect((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const range = sel.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) {
        setSelectionRect((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        if (!sluglineInputFocused) {
          setSpSuggestions([]);
        }
        return;
      }

      const activeBlock = getTopLevelBlock(sel.focusNode);
      Array.from(editor.children).forEach((child) => {
        child.classList.remove('is-active-block', 'is-adjacent-block');
      });

      if (activeBlock) {
        activeBlock.classList.add('is-active-block');
        if (activeBlock.previousElementSibling) {
          activeBlock.previousElementSibling.classList.add('is-adjacent-block');
        }
        if (activeBlock.nextElementSibling) {
          activeBlock.nextElementSibling.classList.add('is-adjacent-block');
        }

        if (workKind === 'screenplay') {
          const rawType = activeBlock.getAttribute('data-sp-type') as
            | ScreenplayBlockType
            | null;
          const resolvedType: ScreenplayBlockType = rawType || 'action';
          if (!rawType && activeBlock.tagName.toLowerCase() === 'p') {
            activeBlock.setAttribute('data-sp-type', 'action');
          }
          setActiveSpBlockType(resolvedType);

          if (checkAutocomplete && sel.isCollapsed) {
            const lineText = activeBlock.textContent || '';
            const suggestions = computeScreenplaySuggestions({
              blockType: resolvedType,
              lineText,
              knownCharacters,
              knownLocations,
            });
            setSpSuggestions(suggestions);
            // Nothing pre-selected: Enter keeps its normal meaning
            setSpSelectedIndex(-1);
            if (suggestions.length > 0) {
              const caretRect = range.getBoundingClientRect();
              const blockRect = activeBlock.getBoundingClientRect();
              setSpPopoverPos({
                top: caretRect.top > 0 ? caretRect.top : blockRect.top,
                left: caretRect.left > 0 ? caretRect.left : blockRect.left,
              });
            } else {
              setSpPopoverPos(null);
            }
          } else if (!checkAutocomplete) {
            setSpSuggestions([]);
          }
        }
      }

      // Inspect active formatting tags around selection
      const formats = new Set<string>();
      try {
        if (document.queryCommandState('bold')) formats.add('bold');
        if (document.queryCommandState('italic')) formats.add('italic');
        if (document.queryCommandState('strikeThrough')) formats.add('strikeThrough');
        if (document.queryCommandState('insertUnorderedList')) formats.add('ul');
        if (document.queryCommandState('insertOrderedList')) formats.add('ol');
      } catch {
        // Ignore
      }

      let walker: Node | null = sel.focusNode;
      while (walker && walker !== editor) {
        if (walker.nodeType === Node.ELEMENT_NODE) {
          const tag = (walker as HTMLElement).tagName.toLowerCase();
          if (tag === 'h1') formats.add('h1');
          if (tag === 'h2') formats.add('h2');
          if (tag === 'h3') formats.add('h3');
          if (tag === 'blockquote') formats.add('blockquote');
          if (tag === 'code') formats.add('code');
        }
        walker = walker.parentNode;
      }
      setActiveFormats(formats);

      // Position Floating Toolbar if selection is non-collapsed
      if (!sel.isCollapsed && sel.toString().trim().length > 0) {
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          const clampedLeft = Math.min(
            window.innerWidth - 190,
            Math.max(190, rect.left + rect.width / 2)
          );
          setSelectionRect({
            top: rect.top - 10,
            left: clampedLeft,
            visible: true,
          });
        }
      } else {
        setSelectionRect((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }

      // Typewriter Scrolling
      if (scrollTypewriter && typewriterMode) {
        const caretRect = range.getBoundingClientRect();
        const targetY =
          caretRect.top > 0
            ? caretRect.top
            : activeBlock?.getBoundingClientRect().top ?? 0;

        if (targetY > 0) {
          // Aim within the part of the screen the keyboard leaves visible
          const vv = window.visualViewport;
          const idealViewportY = vv
            ? vv.offsetTop + vv.height * 0.44
            : window.innerHeight * 0.44;
          const delta = targetY - idealViewportY;
          if (Math.abs(delta) > 18) {
            window.scrollBy({
              top: delta,
              behavior: 'smooth',
            });
          }
        }
      }
    },
    [
      getTopLevelBlock,
      typewriterMode,
      workKind,
      knownCharacters,
      knownLocations,
      sluglineInputFocused,
    ]
  );

  // Remember the last caret position inside the editor so the screenplay guide
  // (which takes focus) can insert exactly where the writer left off.
  const savedRangeRef = useRef<Range | null>(null);
  useEffect(() => {
    const remember = () => {
      const editor = editorRef.current;
      const sel = window.getSelection();
      if (!editor || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    };
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      updateFocusAndToolbar(false, false);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [updateFocusAndToolbar]);

  // ---------------------------------------------------------------------------
  // Screenplay block helpers
  // ---------------------------------------------------------------------------
  const spTypeOf = (el: Element | null): ScreenplayBlockType =>
    (el?.getAttribute('data-sp-type') as ScreenplayBlockType | null) || 'action';

  const isBlankBlock = (el: Element) =>
    el.tagName === 'P' && (el.textContent || '').trim() === '';

  const setBlockText = (el: HTMLElement, text: string) => {
    if (text) el.textContent = text;
    else el.innerHTML = '<br>';
  };

  const makeSpBlock = (type: ScreenplayBlockType, text = '') => {
    const p = document.createElement('p');
    p.setAttribute('data-sp-type', type);
    setBlockText(p, text);
    return p;
  };

  const placeCaret = (el: HTMLElement, at: 'start' | 'end' | number = 'end') => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    const textNode = el.firstChild;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const len = textNode.textContent?.length ?? 0;
      const offset = at === 'end' ? len : at === 'start' ? 0 : Math.min(at, len);
      range.setStart(textNode, offset);
    } else {
      range.selectNodeContents(el);
      range.collapse(at !== 'end');
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  /** Nearest earlier block of a type, stopping at the previous scene heading. */
  const findPrevBlock = (from: Element, type: ScreenplayBlockType) => {
    let el = from.previousElementSibling;
    while (el) {
      if (spTypeOf(el) === type) return el as HTMLElement;
      if (spTypeOf(el) === 'slugline') return null;
      el = el.previousElementSibling;
    }
    return null;
  };

  /** Character cue that owns a dialogue/parenthetical line. */
  const findSpeechCue = (from: Element): HTMLElement | null => {
    let el: Element | null = from;
    while (el && SPEECH_BLOCKS.includes(spTypeOf(el))) {
      if (spTypeOf(el) === 'character') return el as HTMLElement;
      el = el.previousElementSibling;
    }
    return null;
  };

  /** A cue plus the parenthetical/dialogue lines that follow it. */
  const speechGroupFrom = (cue: Element): HTMLElement[] => {
    const group = [cue as HTMLElement];
    let el = cue.nextElementSibling;
    while (el && ['parenthetical', 'dialogue', 'lyrics'].includes(spTypeOf(el))) {
      group.push(el as HTMLElement);
      el = el.nextElementSibling;
    }
    return group;
  };

  /** Empty for flow purposes: no text, or a parenthetical that is just "()". */
  const isBlankLine = (el: Element) => {
    const text = (el.textContent || '').trim();
    return (
      text === '' || (spTypeOf(el) === 'parenthetical' && /^\(\s*\)?$/.test(text))
    );
  };

  /** Caret sits before any text in the block. */
  const caretAtBlockStart = (block: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const probe = document.createRange();
    probe.setStart(block, 0);
    probe.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    return probe.toString().length === 0;
  };

  const rememberCaret = () => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const commitScreenplayEdit = useCallback(
    (focusBlock: HTMLElement | null) => {
      if (focusBlock) setActiveSpBlockType(spTypeOf(focusBlock));
      setSpSuggestions([]);
      setSpPopoverPos(null);
      // selectionchange is async; record the new caret now so a guide close
      // in the same tick does not restore the pre-edit position
      rememberCaret();
      emitHtmlChange();
      updateFocusAndToolbar(true, false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emitHtmlChange, updateFocusAndToolbar]
  );

  /** Return focus to the editor at the caret the writer last left there. */
  const focusEditorAtSavedCaret = useCallback((): HTMLElement | null => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel) return null;
    editor.focus({ preventScroll: true });
    const saved = savedRangeRef.current;
    if (saved && editor.contains(saved.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(saved);
    }
    // The selection must end up inside a real line (not the editor root)
    let block = sel.rangeCount > 0 ? getTopLevelBlock(sel.focusNode) : null;
    if (!block) {
      block = editor.lastElementChild as HTMLElement | null;
      if (block) placeCaret(block, 'end');
    }
    return block;
  }, [getTopLevelBlock]);

  // Apply a Screenplay block type to the currently focused paragraph
  const applyScreenplayBlockType = useCallback(
    (newType: ScreenplayBlockType) => {
      const editor = editorRef.current;
      const sel = window.getSelection();
      if (!editor || !sel) return;
      // When focus is elsewhere (guide, title field), go back to the writer's
      // caret first; a bare focus() would put it at the top of the scene
      const block =
        document.activeElement === editor && sel.rangeCount > 0
          ? getTopLevelBlock(sel.focusNode)
          : focusEditorAtSavedCaret();
      if (!block) return;

      // A page break is its own element: a rule plus a line to keep writing on
      if (newType === 'page-break') {
        const rule = document.createElement('hr');
        rule.setAttribute('data-sp-type', 'page-break');
        if (isBlankBlock(block)) {
          const next = makeSpBlock('action');
          block.replaceWith(rule);
          rule.insertAdjacentElement('afterend', next);
          placeCaret(next, 'start');
          commitScreenplayEdit(next);
        } else if (caretAtBlockStart(block)) {
          // At the start of a line: break before it, keep the caret on its text
          block.insertAdjacentElement('beforebegin', rule);
          placeCaret(block, 'start');
          commitScreenplayEdit(block);
        } else {
          const next = makeSpBlock('action');
          block.insertAdjacentElement('afterend', rule);
          rule.insertAdjacentElement('afterend', next);
          placeCaret(next, 'start');
          commitScreenplayEdit(next);
        }
        return;
      }

      if (block.tagName.toLowerCase() !== 'p') {
        if (block.tagName.toLowerCase() === 'hr') {
          const replacement = makeSpBlock(newType);
          block.replaceWith(replacement);
          placeCaret(replacement, 'start');
        } else {
          document.execCommand('formatBlock', false, 'P');
        }
      }
      const updatedBlock = getTopLevelBlock(window.getSelection()?.focusNode || null);
      if (updatedBlock) {
        const previousType = spTypeOf(updatedBlock);
        updatedBlock.setAttribute('data-sp-type', newType);
        // Dual dialogue only applies to speech lines
        if (!SPEECH_BLOCKS.includes(newType)) {
          updatedBlock.removeAttribute('data-dual');
        }
        const text = (updatedBlock.textContent || '').trim();
        if (newType === 'parenthetical' && !text.startsWith('(')) {
          if (text === '') {
            updatedBlock.textContent = '()';
            const r = document.createRange();
            r.setStart(updatedBlock.firstChild!, 1);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
          } else {
            // Wrap the existing content so line breaks and formatting survive
            updatedBlock.insertBefore(document.createTextNode('('), updatedBlock.firstChild);
            updatedBlock.appendChild(document.createTextNode(')'));
          }
        } else if (previousType === 'parenthetical' && /^\(\s*\)$/.test(text)) {
          // Leaving an untouched "()" behind: clear it
          updatedBlock.innerHTML = '<br>';
          placeCaret(updatedBlock, 'start');
        }
      }
      setActiveSpBlockType(newType);
      rememberCaret();
      emitHtmlChange();
      updateFocusAndToolbar(false, true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getTopLevelBlock, emitHtmlChange, updateFocusAndToolbar, commitScreenplayEdit, focusEditorAtSavedCaret]
  );

  /**
   * Insert a standard screenplay value (INT., NIGHT, (V.O.), (beat), CUT TO:,
   * MONTAGE, ...) according to how that value is used on the page.
   */
  const insertScreenplayVocab = useCallback(
    (item: ScreenplayVocabItem) => {
      const block = focusEditorAtSavedCaret();
      if (!block) return;
      const text = (block.textContent || '').trim();
      const NBSP = '\u00A0';

      // Reuse the current line when it is empty, otherwise open one after it
      const lineFor = (type: ScreenplayBlockType) => {
        if (block.tagName === 'P' && isBlankLine(block)) {
          block.setAttribute('data-sp-type', type);
          if (!SPEECH_BLOCKS.includes(type)) block.removeAttribute('data-dual');
          return block;
        }
        const p = makeSpBlock(type);
        if (block.hasAttribute('data-dual') && SPEECH_BLOCKS.includes(type)) {
          p.setAttribute('data-dual', block.getAttribute('data-dual')!);
        }
        block.insertAdjacentElement('afterend', p);
        return p;
      };

      const sceneHeading = () =>
        spTypeOf(block) === 'slugline'
          ? block
          : findPrevBlock(block, 'slugline') ??
            (spTypeOf(editorRef.current?.firstElementChild ?? null) === 'slugline'
              ? (editorRef.current!.firstElementChild as HTMLElement)
              : null);

      switch (item.mode) {
        case 'heading-prefix': {
          if (spTypeOf(block) === 'slugline') {
            const rest = text.replace(HEADING_PREFIX_RE, '');
            setBlockText(block, rest ? `${item.value} ${rest}` : `${item.value}${NBSP}`);
            placeCaret(block, 'end');
            commitScreenplayEdit(block);
            return;
          }
          const el = lineFor('slugline');
          setBlockText(el, `${item.value}${NBSP}`);
          placeCaret(el, 'end');
          commitScreenplayEdit(el);
          return;
        }

        case 'heading-time':
        case 'heading-append': {
          const heading = sceneHeading() ?? lineFor('slugline');
          const parts = parseSceneHeading((heading.textContent || '').trim());
          if (item.mode === 'heading-time') {
            parts.time = item.value;
          } else if (parts.tags.includes(item.value)) {
            parts.tags = parts.tags.filter((t) => t !== item.value);
          } else {
            parts.tags = [...parts.tags, item.value];
          }
          setBlockText(heading, formatSceneHeading(parts));
          placeCaret(heading, 'end');
          commitScreenplayEdit(heading);
          return;
        }

        case 'cue-extension': {
          const t = spTypeOf(block);
          const cue =
            t === 'character'
              ? block
              : SPEECH_BLOCKS.includes(t)
              ? findSpeechCue(block)
              : null;
          if (!cue) {
            // Start a new cue; the writer types the name in front of the extension
            const el = lineFor('character');
            setBlockText(el, `${NBSP}${item.value}`);
            placeCaret(el, 'start');
            commitScreenplayEdit(el);
            return;
          }
          const current = (cue.textContent || '').trim();
          const next = current.includes(item.value)
            ? current.replace(item.value, '').replace(/\s{2,}/g, ' ').trim()
            : `${current} ${item.value}`.trim();
          setBlockText(cue, next);
          placeCaret(cue, 'end');
          commitScreenplayEdit(cue);
          return;
        }

        case 'paren': {
          if (spTypeOf(block) === 'parenthetical') {
            setBlockText(block, item.value);
            placeCaret(block, 'end');
            commitScreenplayEdit(block);
            return;
          }
          const paren = lineFor('parenthetical');
          setBlockText(paren, item.value);
          // Continue the speech: jump into the following dialogue line
          let dialogue = paren.nextElementSibling as HTMLElement | null;
          if (!dialogue || spTypeOf(dialogue) !== 'dialogue') {
            dialogue = makeSpBlock('dialogue');
            if (paren.hasAttribute('data-dual')) {
              dialogue.setAttribute('data-dual', paren.getAttribute('data-dual')!);
            }
            paren.insertAdjacentElement('afterend', dialogue);
          }
          placeCaret(dialogue, 'start');
          commitScreenplayEdit(dialogue);
          return;
        }

        case 'line':
        default: {
          // Swap in place only when the line already holds a standard value of
          // the same kind (CUT TO: → DISSOLVE TO:); never overwrite prose
          const swap =
            spTypeOf(block) === item.block &&
            !SPEECH_BLOCKS.includes(item.block) &&
            isVocabValue(text, item.block);
          const el = swap ? block : lineFor(item.block);
          setBlockText(el, opensForTyping(item) ? `${item.value}${NBSP}` : item.value);
          placeCaret(el, 'end');
          commitScreenplayEdit(el);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusEditorAtSavedCaret, commitScreenplayEdit]
  );

  /**
   * Toggle dual dialogue for the speech under the caret: it pairs with the
   * speech right before it (or right after it) and the two sit side by side.
   */
  const toggleDualDialogue = useCallback(
    (fromBlock?: HTMLElement | null) => {
      const block = fromBlock ?? getTopLevelBlock(window.getSelection()?.focusNode || null);
      if (!block || !SPEECH_BLOCKS.includes(spTypeOf(block))) return false;
      const cue = findSpeechCue(block);
      if (!cue) return false;
      const group = speechGroupFrom(cue);
      const side = cue.getAttribute('data-dual');

      const prevLine = cue.previousElementSibling;
      const prevCue = prevLine ? findSpeechCue(prevLine) : null;
      const prevGroup = prevCue ? speechGroupFrom(prevCue) : null;
      const afterLine = group[group.length - 1].nextElementSibling;
      const nextGroup =
        afterLine && spTypeOf(afterLine) === 'character' ? speechGroupFrom(afterLine) : null;

      const mark = (els: HTMLElement[] | null, value: '1' | '2' | null) =>
        els?.forEach((el) =>
          value ? el.setAttribute('data-dual', value) : el.removeAttribute('data-dual')
        );

      if (side) {
        mark(group, null);
        mark(side === '2' ? prevGroup : nextGroup, null);
      } else if (prevGroup && !prevCue!.hasAttribute('data-dual')) {
        mark(prevGroup, '1');
        mark(group, '2');
      } else if (nextGroup && !nextGroup[0].hasAttribute('data-dual')) {
        mark(group, '1');
        mark(nextGroup, '2');
      } else {
        return false;
      }
      commitScreenplayEdit(block);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getTopLevelBlock, commitScreenplayEdit]
  );

  // However the guide closes (Esc, X, shortcut, toolbar), focus left inside it
  // would fall to <body>; send it back to the writer's caret instead
  const guideWasOpenRef = useRef(screenplayGuideOpen);
  useEffect(() => {
    const wasOpen = guideWasOpenRef.current;
    guideWasOpenRef.current = screenplayGuideOpen;
    if (wasOpen && !screenplayGuideOpen) {
      const active = document.activeElement;
      if (!active || active === document.body) focusEditorAtSavedCaret();
    }
  }, [screenplayGuideOpen, focusEditorAtSavedCaret]);

  // Guide entry points: put the caret back first, then run the command
  const guideApplyBlock = useCallback(
    (type: ScreenplayBlockType) => {
      focusEditorAtSavedCaret();
      applyScreenplayBlockType(type);
    },
    [focusEditorAtSavedCaret, applyScreenplayBlockType]
  );
  const guideToggleDual = useCallback(() => {
    toggleDualDialogue(focusEditorAtSavedCaret());
  }, [focusEditorAtSavedCaret, toggleDualDialogue]);

  // Accept an autocomplete suggestion inside the screenplay editor
  const handleAcceptSuggestion = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      const editor = editorRef.current;
      const sel = window.getSelection();
      if (!editor || !sel) return;

      const block = getTopLevelBlock(sel.focusNode);
      if (!block) return;

      if (suggestion.targetBlockType) {
        block.setAttribute('data-sp-type', suggestion.targetBlockType);
        setActiveSpBlockType(suggestion.targetBlockType);
      }

      block.textContent = suggestion.insertText;

      // Move caret to the end of the inserted text
      const textNode = block.firstChild;
      if (textNode) {
        const range = document.createRange();
        const len = textNode.textContent?.length ?? 0;
        range.setStart(textNode, len);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      setSpSuggestions([]);
      setSpPopoverPos(null);
      emitHtmlChange();
    },
    [getTopLevelBlock, emitHtmlChange]
  );

  const executeCommand = useCallback(
    (command: string, value?: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();

      if (command === 'inlineCode') {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const parentEl =
          sel.focusNode?.nodeType === Node.ELEMENT_NODE
            ? (sel.focusNode as HTMLElement)
            : sel.focusNode?.parentElement;

        if (parentEl && parentEl.tagName.toLowerCase() === 'code') {
          const textNode = document.createTextNode(parentEl.textContent || '');
          parentEl.replaceWith(textNode);
          const newRange = document.createRange();
          newRange.selectNodeContents(textNode);
          sel.removeAllRanges();
          sel.addRange(newRange);
        } else if (!sel.isCollapsed) {
          const selectedText = sel.toString();
          document.execCommand('insertHTML', false, `<code>${selectedText}</code>`);
        }
      } else {
        document.execCommand(command, false, value);
      }

      emitHtmlChange();
      updateFocusAndToolbar(false, false);
    },
    [emitHtmlChange, updateFocusAndToolbar]
  );

  // Handle Live Markdown Shortcuts, Screenplay Flow, & Keyboard Formatting
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Keys that confirm IME composition (Japanese, Chinese, Korean…) belong
    // to the input method, not to screenplay commands
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const isMod = e.metaKey || e.ctrlKey;

    // 1. Autocomplete: nothing is pre-selected, so Enter keeps its normal
    // meaning (next element) unless the writer arrowed to a suggestion;
    // Tab accepts the highlighted or top suggestion (Final Draft SmartType)
    if (workKind === 'screenplay' && spSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSpSelectedIndex((prev) => (prev + 1) % spSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSpSelectedIndex((prev) =>
          prev <= 0 ? spSuggestions.length - 1 : prev - 1
        );
        return;
      }
      const chosen =
        e.key === 'Tab' && !e.shiftKey
          ? spSuggestions[Math.max(0, spSelectedIndex)]
          : e.key === 'Enter' && !e.shiftKey && spSelectedIndex >= 0
          ? spSuggestions[spSelectedIndex]
          : undefined;
      if (chosen) {
        e.preventDefault();
        handleAcceptSuggestion(chosen);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSpSuggestions([]);
        return;
      }
    }

    // 2. Screenplay element shortcuts, Tab & Enter flow
    if (workKind === 'screenplay') {
      const mac = isMacPlatform();
      // On Windows, AltGr arrives as Ctrl+Alt: let characters and dead keys
      // it produces through instead of treating them as shortcuts
      const altGrInput =
        !mac &&
        (e.key === 'Dead' ||
          (e.key.length === 1 && !/[0-9a-z]/i.test(e.key)) ||
          e.nativeEvent.getModifierState?.('AltGraph'));

      // ⌘⌥0–9 / Ctrl+Alt+0–9 switch elements (plain ⌘1–9 switch browser tabs)
      if (isMod && e.altKey && !e.shiftKey && !altGrInput) {
        const digit = /^Digit([0-9])$/.exec(e.code)?.[1];
        const spec = digit !== undefined ? blockByDigit(Number(digit)) : undefined;
        if (spec) {
          e.preventDefault();
          applyScreenplayBlockType(spec.id);
          return;
        }
      }

      // Dual dialogue: ⌘⇧D on Mac (⌘⌥D hides the Dock), Ctrl+Alt+D on Windows
      if (
        e.code === 'KeyD' &&
        (mac ? e.metaKey && e.shiftKey && !e.altKey : e.ctrlKey && e.altKey && !altGrInput)
      ) {
        e.preventDefault();
        toggleDualDialogue();
        return;
      }

      if (e.key === 'Tab' && !isMod) {
        e.preventDefault();
        const sel = window.getSelection();
        const block = getTopLevelBlock(sel?.focusNode || null);
        const isBlockEmpty = !block || isBlankLine(block);
        const spec = blockSpec(activeSpBlockType);
        const next = e.shiftKey
          ? spec.shiftTab
          : isBlockEmpty
          ? spec.tabEmpty ?? spec.tab
          : spec.tab;
        if (!next) return;
        // Empty lines and Action convert in place (Final Draft); a finished
        // cue, line of dialogue, heading, etc. opens the next element below it
        if (isBlockEmpty || e.shiftKey || activeSpBlockType === 'action' || !block) {
          applyScreenplayBlockType(next);
          return;
        }
        const newLine = makeSpBlock(next);
        if (block.hasAttribute('data-dual') && SPEECH_BLOCKS.includes(next)) {
          newLine.setAttribute('data-dual', block.getAttribute('data-dual')!);
        }
        block.insertAdjacentElement('afterend', newLine);
        placeCaret(newLine, 'start');
        applyScreenplayBlockType(next);
        return;
      }

      // Enter splits the line at the caret and starts the element that
      // naturally follows (Scene Heading → Action, Character → Dialogue, ...)
      if (e.key === 'Enter' && !e.shiftKey && !isMod) {
        const sel = window.getSelection();
        let block = getTopLevelBlock(sel?.focusNode || null);
        if (block && editorRef.current && sel && sel.rangeCount > 0) {
          e.preventDefault();
          // A selection is replaced, like any text field
          if (!sel.isCollapsed) {
            document.execCommand('delete');
            block = getTopLevelBlock(sel.focusNode) ?? block;
          }
          let currentType = spTypeOf(block);

          // An empty non-action line (or an untouched "()") steps back out
          if (block.tagName === 'P' && isBlankLine(block)) {
            const fallback = blockSpec(currentType).emptyEnter;
            if (fallback && fallback !== currentType) {
              if ((block.textContent || '').trim() !== '') block.innerHTML = '<br>';
              block.setAttribute('data-sp-type', fallback);
              if (!SPEECH_BLOCKS.includes(fallback)) block.removeAttribute('data-dual');
              placeCaret(block, 'start');
              commitScreenplayEdit(block);
              return;
            }
          }

          const range = sel.getRangeAt(0);
          const afterCaret = (() => {
            const probe = document.createRange();
            probe.setStart(range.startContainer, range.startOffset);
            probe.setEnd(block, block.childNodes.length);
            return probe.toString();
          })();
          const atStart = caretAtBlockStart(block) && afterCaret.trim() !== '';
          // Enter inside "(quietly|)" jumps to dialogue instead of splitting ")"
          const keepTail =
            currentType === 'parenthetical' && /^\)?\s*$/.test(afterCaret);
          const atEnd = keepTail || afterCaret.trim() === '';

          if (atStart) {
            // Open a line above; the text and its element stay put
            document.execCommand('insertParagraph');
            const kept = getTopLevelBlock(sel.focusNode);
            const above = kept?.previousElementSibling as HTMLElement | null;
            if (above && kept) {
              above.setAttribute('data-sp-type', 'action');
              above.removeAttribute('data-dual');
              if ((above.textContent || '') === '') above.innerHTML = '<br>';
              placeCaret(kept, 'start');
            }
            commitScreenplayEdit(kept ?? block);
            return;
          }

          if (atEnd) {
            // Fountain conventions, resolved when the line is finished
            const rawText = (block.textContent || '').trim();
            if (currentType === 'action' || currentType === 'general') {
              const centered = /^>\s*(.+?)\s*<$/.exec(rawText);
              if (centered) {
                setBlockText(block, centered[1]);
                block.setAttribute('data-sp-type', 'centered');
                currentType = 'centered';
              } else if (
                rawText.length > 3 &&
                rawText === rawText.toUpperCase() &&
                /TO:$/.test(rawText)
              ) {
                block.setAttribute('data-sp-type', 'transition');
                currentType = 'transition';
              }
            }
            // "> THE END <": the "> " trigger made it a transition; the
            // closing "<" means it was centered text all along
            if (currentType === 'transition' && /<$/.test(rawText)) {
              setBlockText(block, rawText.replace(/^>\s*/, '').replace(/\s*<$/, ''));
              block.setAttribute('data-sp-type', 'centered');
              currentType = 'centered';
            }
            if (currentType === 'character' && rawText.endsWith('^')) {
              setBlockText(block, rawText.slice(0, -1).trim());
              toggleDualDialogue(block);
            }

            const nextType = blockSpec(currentType).enter;
            const side = block.getAttribute('data-dual');
            if (side && !SPEECH_BLOCKS.includes(nextType)) {
              // Leaving dual dialogue: continue after the whole pair, never
              // between its two columns
              let anchor: Element = block;
              while (anchor.nextElementSibling?.hasAttribute('data-dual')) {
                anchor = anchor.nextElementSibling;
              }
              const newP = makeSpBlock(nextType);
              anchor.insertAdjacentElement('afterend', newP);
              placeCaret(newP, 'start');
              commitScreenplayEdit(newP);
              return;
            }
            // A native paragraph split keeps Enter on the browser's undo stack.
            // The caret goes to the end first: rewriting the line above (^,
            // centered) or a trailing ")" would otherwise split it wrongly
            placeCaret(block, 'end');
            document.execCommand('insertParagraph');
            const newP = getTopLevelBlock(sel.focusNode);
            if (newP && newP !== block) {
              newP.setAttribute('data-sp-type', nextType);
              newP.classList.remove('is-active-block', 'is-adjacent-block');
              if (!side || !SPEECH_BLOCKS.includes(nextType)) newP.removeAttribute('data-dual');
              if ((newP.textContent || '') === '') {
                newP.innerHTML = '<br>';
                placeCaret(newP, 'start');
              }
            }
            commitScreenplayEdit(newP ?? block);
            return;
          }

          // Mid-line: a native split (undoable); both halves keep the element
          document.execCommand('insertParagraph');
          const tail = getTopLevelBlock(sel.focusNode);
          if (tail) {
            tail.setAttribute('data-sp-type', currentType);
            tail.classList.remove('is-active-block', 'is-adjacent-block');
          }
          commitScreenplayEdit(tail ?? block);
          return;
        }
      }
    }

    if (isMod && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        executeCommand('bold');
        return;
      }
      if (key === 'i') {
        e.preventDefault();
        executeCommand('italic');
        return;
      }
      if (key === 'e') {
        e.preventDefault();
        executeCommand('inlineCode');
        return;
      }
      if (key === 'u') {
        e.preventDefault();
        executeCommand('underline');
        return;
      }
      if (e.shiftKey && key === 'x') {
        e.preventDefault();
        executeCommand('strikeThrough');
        return;
      }
      if (e.shiftKey && key === '9') {
        e.preventDefault();
        const isQuote = activeFormats.has('blockquote');
        executeCommand('formatBlock', isQuote ? 'P' : 'BLOCKQUOTE');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      const block = getTopLevelBlock(sel?.focusNode || null);
      if (
        block &&
        block.tagName.toLowerCase() === 'blockquote' &&
        (block.textContent || '').trim() === ''
      ) {
        e.preventDefault();
        document.execCommand('formatBlock', false, 'P');
        emitHtmlChange();
        return;
      }
    }

    // A leading space on an empty screenplay line is never meaningful
    if (workKind === 'screenplay' && e.key === ' ' && !isMod) {
      const block = getTopLevelBlock(window.getSelection()?.focusNode || null);
      if (block && (block.textContent || '') === '') {
        e.preventDefault();
        return;
      }
    }

    // Live Markdown Prefix Triggers on Space
    if (e.key === ' ' && !isMod) {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.focusNode?.nodeType === Node.TEXT_NODE) {
        const textNode = sel.focusNode as Text;
        const beforeCaret = (textNode.textContent || '').slice(0, sel.focusOffset);
        const block = getTopLevelBlock(textNode);

        if (block && block.textContent?.startsWith(beforeCaret)) {
          if (workKind === 'screenplay') {
            // Fountain line triggers: ". " scene heading, "> " transition,
            // "@ " character, "! " action, "~ " lyrics, "# " section, "= " synopsis,
            // "[[ " note, "=== " page break
            const triggerType = FOUNTAIN_LINE_TRIGGERS[beforeCaret];
            if (triggerType) {
              e.preventDefault();
              textNode.textContent = (textNode.textContent || '').slice(sel.focusOffset);
              if (triggerType === 'page-break') {
                applyScreenplayBlockType('page-break');
                return;
              }
              block.setAttribute('data-sp-type', triggerType);
              if (!SPEECH_BLOCKS.includes(triggerType)) block.removeAttribute('data-dual');
              // Keep the caret on this line: an emptied text node would let the
              // browser drop it into the previous block
              if ((block.textContent || '') === '') block.innerHTML = '<br>';
              placeCaret(block, 'start');
              setActiveSpBlockType(triggerType);
              emitHtmlChange();
              updateFocusAndToolbar(true, true);
              return;
            }
          }

          const triggers: Record<string, () => void> = {
            '#': () => document.execCommand('formatBlock', false, 'H1'),
            '##': () => document.execCommand('formatBlock', false, 'H2'),
            '###': () => document.execCommand('formatBlock', false, 'H3'),
            '>': () => document.execCommand('formatBlock', false, 'BLOCKQUOTE'),
            '-': () => document.execCommand('insertUnorderedList'),
            '*': () => document.execCommand('insertUnorderedList'),
            '1.': () => document.execCommand('insertOrderedList'),
            '---': () => {
              document.execCommand('insertHorizontalRule');
              document.execCommand('formatBlock', false, 'P');
            },
          };

          // Lists, quotes and rules are not screenplay elements: in a screenplay
          // "- " or "1. " is just text
          const action = workKind === 'screenplay' ? undefined : triggers[beforeCaret];
          if (action) {
            e.preventDefault();
            textNode.textContent = (textNode.textContent || '').slice(sel.focusOffset);
            action();
            emitHtmlChange();
            updateFocusAndToolbar(true, false);
            return;
          }
        }
      }
    }

    if (
      !isMod &&
      e.key !== 'Escape' &&
      e.key !== 'Shift' &&
      e.key !== 'Control' &&
      e.key !== 'Alt' &&
      e.key !== 'Meta'
    ) {
      onUserTyping();
    }
  };

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor) return;

    if (editor.childNodes.length === 0) {
      editor.innerHTML =
        workKind === 'screenplay'
          ? '<p data-sp-type="action"><br></p>'
          : '<p><br></p>';
    } else if (
      editor.childNodes.length === 1 &&
      editor.firstChild?.nodeType === Node.TEXT_NODE
    ) {
      document.execCommand('formatBlock', false, 'P');
    }

    // In screenplay mode, auto-detect "(" at start of line for parenthetical or "@NAME" for character
    if (workKind === 'screenplay') {
      const sel = window.getSelection();
      const block = getTopLevelBlock(sel?.focusNode || null);
      // Only plain lines are re-detected; an element the writer chose
      // (Cast list, Character, Centered…) keeps its type
      const type = block ? spTypeOf(block) : 'action';
      const plainLine = type === 'action' || type === 'general';
      if (block && block.tagName.toLowerCase() === 'p') {
        const text = (block.textContent || '').trimStart();
        if (text === '(' && (plainLine || type === 'dialogue')) {
          block.setAttribute('data-sp-type', 'parenthetical');
          setActiveSpBlockType('parenthetical');
        } else if (text.startsWith('@') && plainLine) {
          block.setAttribute('data-sp-type', 'character');
          // Remove the "@" from its text node directly; the live selection
          // shifts with it, so the caret stays where the writer is typing
          const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
          const first = walker.nextNode() as Text | null;
          const at = first ? first.data.indexOf('@') : -1;
          if (first && at >= 0) first.deleteData(at, 1);
          if ((block.textContent || '') === '') {
            block.innerHTML = '<br>';
            placeCaret(block, 'start');
          }
          setActiveSpBlockType('character');
        } else if (plainLine && /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.|EST\.)/i.test(text)) {
          block.setAttribute('data-sp-type', 'slugline');
          setActiveSpBlockType('slugline');
        }
      }
    }

    emitHtmlChange();
    updateFocusAndToolbar(true, true);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paragraphs.length <= 1) {
      document.execCommand('insertText', false, text);
    } else {
      const html = paragraphs
        .map((p) => {
          const escaped = p
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
          return workKind === 'screenplay'
            ? `<p data-sp-type="action">${escaped}</p>`
            : `<p>${escaped}</p>`;
        })
        .join('');
      document.execCommand('insertHTML', false, html);
    }
    emitHtmlChange();
    updateFocusAndToolbar(true, false);
  };

  const fontClass =
    fontVoice === 'serif'
      ? 'font-serif'
      : fontVoice === 'sans'
      ? 'font-sans'
      : 'font-mono';

  const sizeStyle: React.CSSProperties =
    fontSize === 'sm'
      ? { fontSize: '1.0625rem', lineHeight: 1.62 }
      : fontSize === 'base'
      ? { fontSize: '1.1875rem', lineHeight: 1.65 }
      : fontSize === 'lg'
      ? { fontSize: '1.3125rem', lineHeight: 1.68 }
      : { fontSize: '1.5rem', lineHeight: 1.68 };

  const measureClass =
    measure === 'narrow'
      ? 'max-w-[56ch]'
      : measure === 'balanced'
      ? 'max-w-[65ch]'
      : 'max-w-[74ch]';

  const currentBadge = currentUnit
    ? getUnitBadgeLabel(currentUnit, units)
    : '';

  return (
    <>
      <DocumentOutline
        workKind={workKind}
        docTitle={docTitle}
        contentHtml={liveHtml}
        units={units}
        activeUnitId={unitId}
        onSelectUnit={onSelectUnit}
        editorContainerRef={editorRef}
        titleInputRef={titleInputRef}
        sidebarOpen={sidebarOpen}
        isTyping={isTyping}
      />

      {workKind === 'screenplay' && (
        <>
          <ScreenplayAutocompletePopover
            suggestions={spSuggestions}
            selectedIndex={spSelectedIndex}
            position={spPopoverPos}
            onSelect={handleAcceptSuggestion}
          />
          {!readOnly && (
            <ScreenplayElementBar
              activeBlockType={activeSpBlockType}
              onSelectBlockType={applyScreenplayBlockType}
              onOpenGuide={onToggleScreenplayGuide}
              guideOpen={screenplayGuideOpen}
            />
          )}
          <ScreenplayGuide
            open={screenplayGuideOpen}
            activeBlock={activeSpBlockType}
            onClose={() => onCloseScreenplayGuide?.()}
            onApplyBlock={guideApplyBlock}
            onInsertVocab={insertScreenplayVocab}
            onToggleDual={guideToggleDual}
            onOpenTitlePage={onOpenTitlePage}
          />
        </>
      )}

      <main
        ref={mainRef}
        className={`mx-auto w-full px-6 transition-[max-width,padding] duration-200 ease-out sm:px-10 ${measureClass} ${fontClass}`}
        style={{
          paddingTop: typewriterMode ? '32vh' : '7.5rem',
          paddingBottom: typewriterMode ? '52vh' : '12rem',
        }}
      >
        {!readOnly && (
          <FloatingToolbar
            rect={selectionRect}
            activeFormats={activeFormats}
            onCommand={executeCommand}
          />
        )}

        {/* Focused Scene Eyebrow Bar */}
        {currentUnit && (
          <div
            style={{ opacity: focusMode !== 'off' ? 0.35 : 1 }}
            className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 font-sans text-xs transition-opacity duration-200"
          >
            <div className="flex items-center gap-2">
              <span
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent)',
                }}
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]"
              >
                {currentBadge}
              </span>
              <span className="text-[11px] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]">
                {currentUnitIndex + 1} of {units.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {prevUnit && onSelectUnit && (
                <button
                  type="button"
                  onClick={() => onSelectUnit(prevUnit.id)}
                  {...btnHover}
                  title={`Previous: ${getUnitBadgeLabel(prevUnit, units)}`}
                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
                >
                  <ArrowLeft className="size-3" />
                  <span className="hidden sm:inline">Prev</span>
                </button>
              )}
              {nextUnit && onSelectUnit && (
                <button
                  type="button"
                  onClick={() => onSelectUnit(nextUnit.id)}
                  {...btnHover}
                  title={`Next: ${getUnitBadgeLabel(nextUnit, units)}`}
                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ArrowRight className="size-3" />
                </button>
              )}
              {onOpenBirdsEye && (
                <button
                  type="button"
                  onClick={onOpenBirdsEye}
                  {...btnHover}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                  }}
                  title="Open Bird’s-Eye View tile grid (⌘M)"
                  className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
                >
                  <LayoutGrid className="size-3 text-[var(--accent)]" />
                  <span>All Scenes</span>
                </button>
              )}
            </div>
          </div>
        )}

        {notice && (
          <div
            role="status"
            style={{ backgroundColor: 'var(--bg-surface)' }}
            className="no-print mb-4 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 font-sans text-xs leading-relaxed text-[var(--ink-2)]"
          >
            {notice}
          </div>
        )}

        {/* Scene Title Field */}
        <div className="mb-6">
          <label htmlFor="manuscript-title" className="sr-only">
            Scene title
          </label>
          <textarea
            ref={titleInputRef}
            id="manuscript-title"
            rows={1}
            value={unitTitle}
            readOnly={readOnly}
            onChange={(e) => {
              onChangeTitle(e.target.value);
              onUserTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                e.preventDefault();
                editorRef.current?.focus();
              }
            }}
            placeholder="Scene Title (e.g., The Unlabeled Reel)…"
            style={{
              fontSize:
                fontSize === 'sm'
                  ? '1.85rem'
                  : fontSize === 'base'
                  ? '2.15rem'
                  : fontSize === 'lg'
                  ? '2.45rem'
                  : '2.75rem',
              lineHeight: 1.15,
              letterSpacing: '-0.022em',
              opacity: focusMode !== 'off' ? 0.35 : 1,
            }}
            className="focus-title-input w-full resize-none overflow-hidden bg-transparent font-semibold text-[var(--ink-1)] transition-opacity duration-200 placeholder:text-[var(--ink-4)]"
          />

          {workKind === 'screenplay' && (
            <div
              style={{ opacity: focusMode !== 'off' ? 0.35 : 1 }}
              className="mt-2 flex flex-wrap items-center gap-2 font-sans text-[11px] text-[var(--ink-3)]"
            >
              <span>
                Tip: Type <code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 font-mono text-[var(--ink-2)]">INT.</code> or{' '}
                <code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 font-mono text-[var(--ink-2)]">EXT.</code> for a scene heading, press{' '}
                <code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 font-mono text-[var(--ink-2)]">Tab</code> for a character, or{' '}
                {onToggleScreenplayGuide ? (
                  <button
                    type="button"
                    onClick={onToggleScreenplayGuide}
                    className="font-medium text-[var(--ink-1)] underline decoration-[var(--border-strong)] underline-offset-2 transition-colors hover:decoration-[var(--ink-1)]"
                  >
                    open the screenplay guide
                  </button>
                ) : (
                  'open the screenplay guide'
                )}{' '}
                for every element.
              </span>
            </div>
          )}
        </div>

        {/* Rich Text / Screenplay Writing Canvas */}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label="Screenplay body"
          aria-readonly={readOnly || undefined}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          spellCheck
          data-work-kind={workKind}
          data-focus-mode={focusMode}
          data-empty={isEmpty ? 'true' : 'false'}
          data-placeholder={
            workKind === 'screenplay'
              ? 'Type INT. or EXT. for a scene heading, or press Tab for a character cue…'
              : 'Begin writing, or type # for a heading…'
          }
          style={sizeStyle}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyUp={(e) => {
            if (
              e.key !== 'ArrowUp' &&
              e.key !== 'ArrowDown' &&
              e.key !== 'Enter' &&
              e.key !== 'Tab' &&
              e.key !== 'Escape'
            ) {
              updateFocusAndToolbar(true, true);
            }
          }}
          onMouseUp={() => updateFocusAndToolbar(false, false)}
          onFocus={() => setSluglineInputFocused(false)}
          className="focus-editor relative min-h-[55vh] w-full text-[var(--ink-1)]"
        />

        {/* End-of-Scene Turn Bar */}
        <div className="no-print mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-6 font-sans text-xs">
          <div>
            {prevUnit && onSelectUnit ? (
              <button
                type="button"
                onClick={() => {
                  onSelectUnit(prevUnit.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                {...btnHover}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                }}
                className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-start text-[var(--ink-2)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
              >
                <ArrowLeft className="size-3.5 text-[var(--ink-3)]" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                    Previous { getUnitBadgeLabel(prevUnit, units) }
                  </div>
                  <div className="font-medium text-[var(--ink-1)]">
                    {prevUnit.title || prevUnit.slugline || 'Untitled'}
                  </div>
                </div>
              </button>
            ) : (
              <div />
            )}
          </div>

          <div className="flex items-center gap-2">
            {onOpenBirdsEye && (
              <button
                type="button"
                onClick={onOpenBirdsEye}
                {...btnHover}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                }}
                className="flex h-10 items-center gap-1.5 rounded-xl px-3.5 font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-1)]"
              >
                <LayoutGrid className="size-3.5 text-[var(--accent)]" />
                <span>Bird’s-Eye View</span>
              </button>
            )}

            {nextUnit && onSelectUnit ? (
              <button
                type="button"
                onClick={() => {
                  onSelectUnit(nextUnit.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                {...btnHover}
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  boxShadow: 'var(--elevation-raised)',
                }}
                className="flex items-center gap-2.5 rounded-xl px-4 py-2 text-end text-[var(--ink-1)]"
              >
                <div>
                  <div className="text-[10px] uppercase tracking-[0.05em] text-[var(--accent)]">
                    Next · {getUnitBadgeLabel(nextUnit, units)}
                  </div>
                  <div className="font-medium text-[var(--ink-1)]">
                    {nextUnit.title || nextUnit.slugline || 'Untitled'}
                  </div>
                </div>
                <ArrowRight className="size-3.5 text-[var(--accent)]" />
              </button>
            ) : (
              onCreateNextUnit && (
                <button
                  type="button"
                  onClick={onCreateNextUnit}
                  {...btnHover}
                  style={{
                    backgroundColor: 'var(--ink-1)',
                    color: 'var(--bg-canvas)',
                  }}
                  className="flex h-10 items-center gap-1.5 rounded-xl px-4 font-medium"
                >
                  <Plus className="size-3.5" strokeWidth={2} />
                  <span>Start Next Scene</span>
                </button>
              )
            )}
          </div>
        </div>
      </main>
    </>
  );
};
