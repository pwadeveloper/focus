/**
 * Screenplay element catalogue: every block type the editor supports, the
 * standard values writers type inside them, and keyboard conventions.
 * Enter/Tab flow, element numbering and indents follow Final Draft's
 * defaults; typing triggers follow the Fountain spec (fountain.io/syntax).
 * Element shortcuts use ⌘⌥ because the browser owns plain ⌘1–9.
 */

export type ScreenplayBlockType =
  | 'slugline'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot'
  | 'general'
  | 'centered'
  | 'cast-list'
  | 'lyrics'
  | 'act-break'
  | 'sequence'
  | 'section'
  | 'synopsis'
  | 'note'
  | 'page-break';

export interface ScreenplayBlockSpec {
  id: ScreenplayBlockType;
  label: string;
  /** Short label for the compact element bar. */
  short: string;
  tier: 'core' | 'common' | 'advanced';
  /** ⌘⌥digit shortcut. */
  digit?: number;
  /** Fountain typing trigger at the start of a line. */
  fountain?: string;
  description: string;
  example: string;
  /** Element started by Enter at the end of this one. */
  enter: ScreenplayBlockType;
  /** Element this one becomes on Tab (non-empty line). */
  tab?: ScreenplayBlockType;
  /** Element this one becomes on Tab when the line is empty. */
  tabEmpty?: ScreenplayBlockType;
  shiftTab?: ScreenplayBlockType;
  /** What an empty line of this type becomes on Enter. */
  emptyEnter?: ScreenplayBlockType;
  /** Writer-only elements are hidden when printing/exporting to PDF. */
  printed: boolean;
}

export const SCREENPLAY_BLOCKS: ScreenplayBlockSpec[] = [
  {
    id: 'slugline',
    label: 'Scene heading',
    short: 'Scene',
    tier: 'core',
    digit: 1,
    fountain: '. + Space',
    description:
      'Starts every scene: interior/exterior, location, time of day. All caps.',
    example: 'INT. HARBOR OFFICE - NIGHT',
    enter: 'action',
    tab: 'action',
    tabEmpty: 'action',
    shiftTab: 'transition',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'action',
    label: 'Action',
    short: 'Action',
    tier: 'core',
    digit: 2,
    fountain: '! + Space',
    description:
      'What we see and hear, in present tense. Introduce characters in CAPS the first time.',
    example: 'CLARA (30s) sets the valise down beside the stove.',
    enter: 'action',
    tab: 'character',
    tabEmpty: 'character',
    shiftTab: 'slugline',
    printed: true,
  },
  {
    id: 'character',
    label: 'Character',
    short: 'Character',
    tier: 'core',
    digit: 3,
    fountain: '@ + Space',
    description:
      'Who speaks next, in caps, centered over the dialogue. Add extensions like (V.O.).',
    example: 'CLARA (V.O.)',
    enter: 'dialogue',
    tab: 'parenthetical',
    tabEmpty: 'transition',
    shiftTab: 'action',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'parenthetical',
    label: 'Parenthetical',
    short: '(Paren)',
    tier: 'core',
    digit: 4,
    fountain: '(',
    description:
      'A brief note on delivery or a small action, under the character name. Use sparingly.',
    example: '(under her breath)',
    enter: 'dialogue',
    tab: 'dialogue',
    tabEmpty: 'dialogue',
    shiftTab: 'character',
    emptyEnter: 'dialogue',
    printed: true,
  },
  {
    id: 'dialogue',
    label: 'Dialogue',
    short: 'Dialogue',
    tier: 'core',
    digit: 5,
    description: 'The spoken lines, in a narrow column under the character.',
    example: 'The sand moves faster than the press can dry.',
    enter: 'action',
    tab: 'parenthetical',
    tabEmpty: 'parenthetical',
    shiftTab: 'character',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'transition',
    label: 'Transition',
    short: 'Transition',
    tier: 'core',
    digit: 6,
    fountain: '> + Space',
    description:
      'How one scene hands off to the next, flush right. Use only when the cut means something.',
    example: 'SMASH CUT TO:',
    enter: 'slugline',
    tab: 'slugline',
    tabEmpty: 'slugline',
    shiftTab: 'action',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'shot',
    label: 'Shot',
    short: 'Shot',
    tier: 'common',
    digit: 7,
    description:
      'A camera direction within a scene, like a mini heading. All caps.',
    example: 'CLOSE ON THE LEDGER',
    enter: 'action',
    tab: 'action',
    tabEmpty: 'action',
    shiftTab: 'slugline',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'general',
    label: 'General',
    short: 'General',
    tier: 'common',
    digit: 0,
    description:
      'Plain text with no screenplay formatting, for anything that fits no other element.',
    example: 'Song lyrics, a letter, a list on screen.',
    enter: 'general',
    tab: 'action',
    tabEmpty: 'action',
    shiftTab: 'action',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'centered',
    label: 'Centered text',
    short: 'Centered',
    tier: 'common',
    fountain: '> text <',
    description:
      'Text centered on the page, for title cards and THE END.',
    example: 'THE END',
    enter: 'action',
    tab: 'action',
    tabEmpty: 'action',
    shiftTab: 'action',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'cast-list',
    label: 'Cast list',
    short: 'Cast',
    tier: 'advanced',
    digit: 8,
    description:
      'Multi-camera TV: the characters in the scene, in caps and parentheses, right under the scene heading.',
    example: '(CLARA, JULIAN, THE CLERK)',
    enter: 'action',
    tab: 'action',
    tabEmpty: 'action',
    shiftTab: 'slugline',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'lyrics',
    label: 'Lyrics',
    short: 'Lyrics',
    tier: 'advanced',
    fountain: '~ + Space',
    description:
      'Sung lines, set in italics in the dialogue column. Each line of the song is its own line.',
    example: 'Oh, the tide comes in at Gull Rock…',
    enter: 'lyrics',
    tab: 'dialogue',
    tabEmpty: 'dialogue',
    shiftTab: 'character',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'act-break',
    label: 'Act / episode break',
    short: 'Act',
    tier: 'advanced',
    digit: 9,
    description:
      'TV structure markers like COLD OPEN, ACT ONE and END OF ACT ONE. Centered and underlined.',
    example: 'ACT ONE',
    enter: 'slugline',
    tab: 'slugline',
    tabEmpty: 'slugline',
    shiftTab: 'action',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'sequence',
    label: 'Sequence',
    short: 'Sequence',
    tier: 'advanced',
    description:
      'A printed header naming a run of scenes (Final Draft’s Sequence). Bold, underlined caps.',
    example: 'THE HEIST',
    enter: 'slugline',
    tab: 'slugline',
    tabEmpty: 'slugline',
    shiftTab: 'action',
    emptyEnter: 'action',
    printed: true,
  },
  {
    id: 'section',
    label: 'Section',
    short: 'Section',
    tier: 'advanced',
    fountain: '# + Space',
    description:
      'Your own outline marker for acts or sequences. Helps you navigate; never printed.',
    example: 'Act One: The missing soundings',
    enter: 'action',
    tab: 'synopsis',
    tabEmpty: 'synopsis',
    shiftTab: 'action',
    emptyEnter: 'action',
    printed: false,
  },
  {
    id: 'synopsis',
    label: 'Synopsis',
    short: 'Synopsis',
    tier: 'advanced',
    fountain: '= + Space',
    description:
      'A one-line summary of the scene or section for your own planning. Never printed.',
    example: 'Clara learns the chart was never finished.',
    enter: 'action',
    tab: 'action',
    tabEmpty: 'action',
    shiftTab: 'section',
    emptyEnter: 'action',
    printed: false,
  },
  {
    id: 'note',
    label: 'Note',
    short: 'Note',
    tier: 'advanced',
    fountain: '[[ + Space',
    description:
      'A reminder to yourself, highlighted in the margin of your draft. Never printed.',
    example: 'Check the tide tables for 1891.',
    enter: 'action',
    tab: 'action',
    tabEmpty: 'action',
    shiftTab: 'action',
    emptyEnter: 'action',
    printed: false,
  },
  {
    id: 'page-break',
    label: 'Page break',
    short: 'Page',
    tier: 'advanced',
    fountain: '=== + Space',
    description: 'Forces the next element onto a new page when printed.',
    example: '===',
    enter: 'action',
    tab: 'action',
    tabEmpty: 'action',
    shiftTab: 'action',
    emptyEnter: 'action',
    printed: true,
  },
];

const BLOCK_INDEX = new Map(SCREENPLAY_BLOCKS.map((b) => [b.id, b]));

export const blockSpec = (id: ScreenplayBlockType): ScreenplayBlockSpec =>
  BLOCK_INDEX.get(id) ?? BLOCK_INDEX.get('action')!;

export const blockByDigit = (digit: number) =>
  SCREENPLAY_BLOCKS.find((b) => b.digit === digit);

/** Lines that belong to a character's speech (and can be dual dialogue). */
export const SPEECH_BLOCKS: ScreenplayBlockType[] = [
  'character',
  'parenthetical',
  'dialogue',
  'lyrics',
];

/** Fountain line-start tokens that switch the element when followed by Space. */
export const FOUNTAIN_LINE_TRIGGERS: Record<string, ScreenplayBlockType> = {
  '.': 'slugline',
  '!': 'action',
  '@': 'character',
  '>': 'transition',
  '~': 'lyrics',
  '#': 'section',
  '##': 'section',
  '###': 'section',
  '=': 'synopsis',
  '[[': 'note',
  '===': 'page-break',
};

// ---------------------------------------------------------------------------
// Standard values writers type inside elements
// ---------------------------------------------------------------------------

export type VocabMode =
  /** Replaces the INT./EXT. prefix of the scene heading. */
  | 'heading-prefix'
  /** Sets the time of day at the end of this scene's heading. */
  | 'heading-time'
  /** Toggles a tag at the end of the heading, like (FLASHBACK). */
  | 'heading-append'
  /** Toggles an extension after the character name. */
  | 'cue-extension'
  /** A parenthetical line inside the current speech. */
  | 'paren'
  /** Its own line of the given element. */
  | 'line';

export interface ScreenplayVocabItem {
  value: string;
  meaning: string;
  mode: VocabMode;
  block: ScreenplayBlockType;
}

export interface ScreenplayVocabGroup {
  id: string;
  /** Tab label in the guide. */
  tab: string;
  title: string;
  hint: string;
  items: ScreenplayVocabItem[];
}

const items = (
  mode: VocabMode,
  block: ScreenplayBlockType,
  list: [string, string][]
): ScreenplayVocabItem[] =>
  list.map(([value, meaning]) => ({ value, meaning, mode, block }));

export const SCREENPLAY_VOCAB: ScreenplayVocabGroup[] = [
  {
    id: 'headings',
    tab: 'Scene headings',
    title: 'Scene headings',
    hint:
      'A heading reads PREFIX LOCATION - TIME. Prefixes start a new heading; times and tags update the heading of the scene you’re in.',
    items: [
      ...items('heading-prefix', 'slugline', [
        ['INT.', 'Interior: the scene happens inside'],
        ['EXT.', 'Exterior: the scene happens outside'],
        ['INT./EXT.', 'Inside and outside at once, like a moving car'],
        ['EXT./INT.', 'Starts outside, moves inside'],
        ['I/E.', 'Short form of INT./EXT.'],
        ['EST.', 'Establishing shot; many guides prefer EXT. plus “Establishing.”'],
      ]),
      ...items('heading-time', 'slugline', [
        ['DAY', 'Daytime'],
        ['NIGHT', 'Nighttime'],
        ['EARLY MORNING', 'Just after dawn'],
        ['MORNING', 'Morning'],
        ['AFTERNOON', 'Afternoon'],
        ['LATE AFTERNOON', 'Late in the day, before evening'],
        ['EVENING', 'Evening'],
        ['DAWN', 'First light'],
        ['DUSK', 'Last light'],
        ['SUNRISE', 'As the sun comes up'],
        ['SUNSET', 'As the sun goes down'],
        ['CONTINUOUS', 'Follows straight on from the previous scene, no time cut'],
        ['LATER', 'Same place, some time later'],
        ['MOMENTS LATER', 'Same place, a short time later'],
        ['THE NEXT DAY', 'The following day'],
        ['MAGIC HOUR', 'The golden light around sunset'],
        ['SAME', 'Happening at the same time as the previous scene'],
        ['SAME TIME', 'Simultaneous with the previous scene'],
        ['MOVING', 'Inside a moving vehicle'],
      ]),
      ...items('heading-append', 'slugline', [
        ['(FLASHBACK)', 'This scene happens in the past'],
        ['(PRESENT DAY)', 'Return to the story’s present'],
        ['(DREAM)', 'This scene is a dream'],
        ['(FLASH FORWARD)', 'This scene happens in the future'],
        ['(FANTASY)', 'This scene is imagined'],
        ['(STOCK FOOTAGE)', 'Existing footage is used here'],
      ]),
    ],
  },
  {
    id: 'characters',
    tab: 'Characters',
    title: 'Character extensions',
    hint:
      'Extensions sit after the character name and tell us where the voice comes from. Clicking toggles one on the nearest character cue.',
    items: items('cue-extension', 'character', [
      ['(V.O.)', 'Voice over: narration, or the unseen caller on a phone'],
      ['(O.S.)', 'Off screen: in the scene but out of frame'],
      ['(O.C.)', 'Off camera: TV’s name for off screen'],
      ["(CONT'D)", 'The same character keeps talking after an action line'],
      ['(PRE-LAP)', 'Dialogue heard before the scene it belongs to starts'],
      ['(FILTERED)', 'Heard through a device: phone, radio, intercom'],
      ['(ON PHONE)', 'Speaking on a phone call'],
      ['(ON TV)', 'Heard from a television in the scene'],
      ['(ON RADIO)', 'Heard from a radio in the scene'],
      ['(INTO PHONE)', 'Speaking into a phone, other side unheard'],
      ['(SUBTITLE)', 'Spoken in another language and subtitled'],
      ['(TEXT)', 'A text message, written as dialogue'],
      ['(SINGING)', 'The line is sung'],
      ['(WHISPERING)', 'Delivered in a whisper throughout'],
    ]),
  },
  {
    id: 'parentheticals',
    tab: 'Parentheticals',
    title: 'Parentheticals',
    hint:
      'Short delivery notes inside a speech. Clicking adds one under the current character and puts you back in the dialogue.',
    items: items('paren', 'parenthetical', [
      ['(beat)', 'A short pause or shift in thought'],
      ['(pause)', 'A longer silence'],
      ['(continuing)', 'Picks the speech back up after an interruption'],
      ['(interrupting)', 'Cuts in on the other speaker'],
      ['(to Clara)', 'Says who the line is aimed at'],
      ['(to self)', 'Talking to themselves'],
      ['(re: the ledger)', 'Says what the line is about'],
      ['(sotto voce)', 'Under the breath'],
      ['(whispering)', 'Whispered'],
      ['(shouting)', 'Shouted'],
      ['(sarcastic)', 'Said with sarcasm'],
      ['(in Spanish)', 'Spoken in another language'],
      ['(subtitled)', 'This line is subtitled'],
      ['(reading)', 'Reading aloud from something'],
      ['(into phone)', 'Speaking into a phone'],
      ['(listening)', 'Hearing the other side of a call'],
      ['(from the phone)', 'The voice comes through a phone'],
      ['(simultaneously)', 'Overlapping speech, without dual dialogue'],
      ['(laughing)', 'Said through laughter'],
      ['(overlapping)', 'Talks over the previous line'],
      ['(singing)', 'The line is sung'],
      ['(signing)', 'Said in sign language'],
      ['(to camera)', 'Breaks the fourth wall'],
      ['(together)', 'A group cue speaking in unison'],
    ]),
  },
  {
    id: 'transitions',
    tab: 'Transitions',
    title: 'Transitions',
    hint:
      'Transitions sit flush right between scenes. FADE IN: opens a script; FADE OUT. closes it.',
    items: [
      ...items('line', 'action', [['FADE IN:', 'The very first line of a screenplay']]),
      ...items('line', 'transition', [
        ['CUT TO:', 'A straight cut to the next scene'],
        ['SMASH CUT TO:', 'An abrupt, jarring cut for contrast'],
        ['MATCH CUT TO:', 'Cut that links two matching images or sounds'],
        ['JUMP CUT TO:', 'A cut forward in time within the same shot'],
        ['DISSOLVE TO:', 'One scene melts into the next; often time passing'],
        ['MATCH DISSOLVE TO:', 'A dissolve between two matching images'],
        ['RIPPLE DISSOLVE TO:', 'The classic, now dated, way into a flashback'],
        ['FLASHBACK TO:', 'Cuts into a flashback'],
        ['FADE TO:', 'A mid-script fade for a large jump in time'],
        ['FLASH CUT TO:', 'A very brief cut, often a memory'],
        ['TIME CUT:', 'A cut that skips time in the same place'],
        ['INTERCUT WITH:', 'Cut back and forth between two places'],
        ['WIPE TO:', 'One image pushes the other off screen'],
        ['IRIS IN:', 'Picture opens from a circle'],
        ['IRIS OUT.', 'Picture closes to a circle'],
        ['BACK TO:', 'Return to an earlier scene'],
        ['FADE TO BLACK.', 'Picture fades to black'],
        ['FADE TO WHITE.', 'Picture fades to white'],
        ['POP TO:', 'Sitcom: an instant cut to the next scene'],
        ['CUT TO BLACK.', 'Instant black screen'],
        ['FADE OUT.', 'The last line of a screenplay'],
      ]),
    ],
  },
  {
    id: 'camera',
    tab: 'Camera',
    title: 'Shots & camera',
    hint:
      'Shots direct attention inside a scene. Spec scripts use them sparingly; each one starts its own line.',
    items: items('line', 'shot', [
      ['ANGLE ON', 'Point the camera at a specific subject'],
      ['CLOSE ON', 'A close shot of something important'],
      ['TIGHT ON', 'A very close framing on a subject'],
      ['CLOSE UP', 'Fills the frame with a face or object'],
      ['EXTREME CLOSE UP', 'A tiny detail fills the frame'],
      ['WIDE SHOT', 'Shows the whole space'],
      ['LONG SHOT', 'The camera is far from the subject'],
      ['MEDIUM SHOT', 'A waist-up, mid-range framing'],
      ['CLOSER ANGLE', 'A new, tighter angle on the same subject'],
      ['ESTABLISHING SHOT', 'Sets up where we are'],
      ['POV', 'What a character sees, from their point of view'],
      ['REVERSE ANGLE', 'The opposite view of the previous shot'],
      ['OVER THE SHOULDER', 'Framed past one character toward another'],
      ['TWO SHOT', 'Two characters in the same frame'],
      ['TRACKING SHOT', 'The camera moves alongside the action'],
      ['AERIAL SHOT', 'From high above'],
      ['PUSH IN ON', 'The camera moves closer to the subject'],
      ['DOLLY IN', 'The camera physically travels toward the subject'],
      ['PAN TO', 'The camera pivots to find a new subject'],
      ['ZOOM IN ON', 'The lens zooms toward the subject'],
      ['PULL FOCUS TO', 'Focus shifts from one subject to another'],
      ['INTO FRAME', 'Someone enters while the camera holds still'],
      ['PULL BACK TO REVEAL', 'The camera moves back to show more'],
      ['FREEZE FRAME', 'The picture stops on one frame'],
      ['STOCK SHOT', 'Existing footage, not shot for this film'],
      ['MOS', 'Shot without sound'],
      ['INSERT', 'A cut-in to an object, like a letter or screen'],
      ['BACK TO SCENE', 'Return to the main action after a shot or insert'],
      ['ON SCREEN', 'What appears on a monitor, phone, or TV'],
    ]),
  },
  {
    id: 'sequences',
    tab: 'Sequences',
    title: 'Special sequences',
    hint:
      'Markers that open and close a run of scenes or shots, plus on-screen text. Close what you open.',
    items: [
      // Flush-left caps subheaders (formatted like a Shot) so they never
      // replace the scene's real heading
      ...items('line', 'shot', [
        ['MONTAGE -', 'A series of short scenes that compress time'],
        ['BEGIN MONTAGE', 'Alternative way to open a montage'],
        ['END MONTAGE', 'Closes a montage'],
        ['SERIES OF SHOTS -', 'Quick shots that tell one progression'],
        ['END SERIES OF SHOTS', 'Closes a series of shots'],
        ['INTERCUT -', 'Cut between two locations, like a phone call'],
        ['INTERCUT - PHONE CONVERSATION', 'Dialogue runs back and forth between two callers'],
        ['END INTERCUT', 'Closes an intercut'],
        ['FLASHBACK:', 'On its own line before the flashback’s first heading'],
        ['END FLASHBACK', 'Closes a flashback'],
        ['BACK TO PRESENT', 'Return to the story’s present after a flashback'],
        ['DREAM SEQUENCE:', 'On its own line before the dream’s first heading'],
        ['END DREAM SEQUENCE', 'Closes a dream'],
        ['SPLIT SCREEN', 'Two images share the frame'],
        ['OVER BLACK', 'We hear something before we see anything'],
      ]),
      ...items('line', 'action', [
        ['SUPER:', 'Superimposed text over the picture, like a place or date'],
        ['TITLE CARD:', 'Text on its own card, no picture'],
        ['TITLE OVER:', 'Opening title text over the picture'],
        ['CHYRON:', 'Lower-third caption, like a news name tag'],
        ['TEXT MESSAGE:', 'A text message shown on screen'],
        ['TEXT READS:', 'Final Draft’s way to show a text message in action'],
        ['SFX:', 'A key sound effect'],
        ['MUSIC CUE:', 'Names a specific song'],
        ['CRAWL:', 'Scrolling on-screen text'],
        ['SLOW MOTION:', 'The action that follows plays slowed down'],
        ['END SLOW MOTION', 'Back to normal speed'],
        ['QUICK CUTS:', 'A burst of very short shots, each set off with --'],
        ['ROLL CREDITS.', 'Credits begin over the picture'],
        ['END CREDITS.', 'Credits finish'],
      ]),
    ],
  },
  {
    id: 'tv',
    tab: 'TV & pages',
    title: 'TV structure & page markers',
    hint:
      'Act breaks structure a TV episode. Centered markers like THE END close a script.',
    items: [
      ...items('line', 'act-break', [
        ['COLD OPEN', 'Scenes before the opening titles'],
        ['END OF COLD OPEN', 'Close of the cold open'],
        ['TEASER', 'Opening hook before the first act'],
        ['END OF TEASER', 'Close of the teaser'],
        ['ACT ONE', 'Start of act one'],
        ['END OF ACT ONE', 'Close of act one'],
        ['ACT TWO', 'Start of act two'],
        ['END OF ACT TWO', 'Close of act two'],
        ['ACT THREE', 'Start of act three'],
        ['END OF ACT THREE', 'Close of act three'],
        ['ACT FOUR', 'Start of act four'],
        ['END OF ACT FOUR', 'Close of act four'],
        ['ACT FIVE', 'Start of act five'],
        ['END OF ACT FIVE', 'Close of act five'],
        ['TAG', 'Short closing scene after the last act'],
        ['MAIN TITLES', 'Cue for the opening credits'],
        ['SCENE A', 'Multi-camera scene letter (A, B, C…)'],
        ['END OF EPISODE', 'Closes the episode'],
        ['END OF SHOW', 'Closes a multi-camera episode'],
      ]),
      ...items('line', 'centered', [
        ['THE END', 'Closes a feature script'],
        ['INTERMISSION', 'A break in a stage or long-form script'],
      ]),
    ],
  },
];

export const HEADING_PREFIX_RE =
  /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.?|I\/E\.?|INT\.|EXT\.|EST\.)\s*/i;

const TIMES = new Set(
  SCREENPLAY_VOCAB.flatMap((g) =>
    g.items.filter((i) => i.mode === 'heading-time').map((i) => i.value)
  )
);
export const isTimeOfDay = (value: string) => TIMES.has(value.trim().toUpperCase());

/** The line already holds a standard value for this element (a swap target). */
const VALUES_BY_BLOCK = new Map<ScreenplayBlockType, Set<string>>();
SCREENPLAY_VOCAB.forEach((g) =>
  g.items.forEach((i) => {
    if (!VALUES_BY_BLOCK.has(i.block)) VALUES_BY_BLOCK.set(i.block, new Set());
    VALUES_BY_BLOCK.get(i.block)!.add(i.value.toUpperCase());
  })
);
export const isVocabValue = (text: string, block: ScreenplayBlockType) =>
  VALUES_BY_BLOCK.get(block)?.has(text.replace(/\u00A0/g, ' ').trim().toUpperCase()) ?? false;

/**
 * Values the writer continues on the same line (SUPER: "…", MONTAGE - …)
 * get a trailing space. Transitions and stand-alone markers do not, so
 * flush-right lines stay flush right.
 */
export const opensForTyping = (item: ScreenplayVocabItem) =>
  item.block !== 'transition' &&
  (/ -$/.test(item.value) ||
    (item.block === 'action' && /:$/.test(item.value) && item.value !== 'FADE IN:'));

export interface SceneHeadingParts {
  /** Everything before the time of day, e.g. "INT. HOUSE - KITCHEN". */
  base: string;
  time: string;
  /** Trailing tags like (FLASHBACK). */
  tags: string[];
}

export const parseSceneHeading = (heading: string): SceneHeadingParts => {
  let rest = heading.replace(/\u00A0/g, ' ').trim();
  const tags: string[] = [];
  let tag = /\s*(\([^()]*\))$/.exec(rest);
  while (tag) {
    tags.unshift(tag[1]);
    rest = rest.slice(0, tag.index).trim();
    tag = /\s*(\([^()]*\))$/.exec(rest);
  }
  const dash = rest.lastIndexOf(' - ');
  const tail = dash >= 0 ? rest.slice(dash + 3) : '';
  if (dash >= 0 && isTimeOfDay(tail)) {
    return { base: rest.slice(0, dash).trim(), time: tail.trim(), tags };
  }
  return { base: rest, time: '', tags };
};

export const formatSceneHeading = ({ base, time, tags }: SceneHeadingParts) => {
  const prefixOnly = HEADING_PREFIX_RE.test(base) && base.replace(HEADING_PREFIX_RE, '') === '';
  const head = !base ? 'INT. LOCATION' : prefixOnly ? `${base.trim()} LOCATION` : base;
  return [time ? `${head} - ${time}` : head, ...tags].join(' ');
};

export const vocabValues = (groupId: string, mode?: VocabMode) =>
  (SCREENPLAY_VOCAB.find((g) => g.id === groupId)?.items ?? []).filter(
    (i) => !mode || i.mode === mode
  );

// ---------------------------------------------------------------------------
// Keyboard reference
// ---------------------------------------------------------------------------

export const isMacPlatform = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

export const modKeys = () =>
  isMacPlatform() ? { mod: '⌘', alt: '⌥' } : { mod: 'Ctrl+', alt: 'Alt+' };

/** ⌘? is the macOS Help menu, so the guide uses ⌘⌥/ (or F1). */
export const guideShortcut = () => (isMacPlatform() ? '⌘⌥/' : 'Ctrl+Alt+/');

/** ⌘⌥D hides the macOS Dock, so dual dialogue is ⌘⇧D on Mac (Final Draft: ⌘D). */
export const dualShortcut = () => (isMacPlatform() ? '⌘⇧D' : 'Ctrl+Alt+D');

export interface ScreenplayKeyRow {
  keys: string;
  result: string;
}

export const SCREENPLAY_KEY_GROUPS = (mod: string, alt: string) => [
  {
    title: 'Element shortcuts',
    rows: [
      ...SCREENPLAY_BLOCKS.filter((b) => b.digit !== undefined)
        .sort((a, b) => (a.digit || 10) - (b.digit || 10))
        .map((b) => ({ keys: `${mod}${alt}${b.digit}`, result: b.label })),
      { keys: dualShortcut(), result: 'Dual dialogue on / off' },
    ],
  },
  {
    title: 'Emphasis',
    rows: [
      { keys: `${mod}B`, result: 'Bold' },
      { keys: `${mod}I`, result: 'Italic' },
      { keys: `${mod}U`, result: 'Underline' },
      { keys: `${mod}⇧X`, result: 'Strikethrough' },
    ],
  },
  {
    title: 'Writing flow',
    rows: [
      { keys: '↵', result: 'Next element: Scene → Action, Character → Dialogue' },
      { keys: '↵ on empty line', result: 'Step back out to Action' },
      { keys: 'Tab', result: 'Action → Character, Dialogue → Parenthetical' },
      { keys: 'Tab on empty Character', result: 'Transition' },
      { keys: '⇧ Tab', result: 'Previous element' },
      { keys: '⇧ ↵', result: 'Line break inside the same element' },
    ],
  },
  {
    title: 'Fountain typing shortcuts',
    rows: [
      { keys: 'INT. / EXT.', result: 'Scene heading with autocomplete' },
      { keys: '. + Space', result: 'Force a scene heading' },
      { keys: '@ + Space', result: 'Force a character cue' },
      { keys: '( ', result: 'Parenthetical' },
      { keys: '> + Space', result: 'Transition' },
      { keys: '> text <', result: 'Centered text (on Enter)' },
      { keys: 'ALL CAPS ending TO:', result: 'Transition (on Enter)' },
      { keys: 'NAME^', result: 'Dual dialogue (on Enter)' },
      { keys: '! + Space', result: 'Force action' },
      { keys: '~ + Space', result: 'Lyrics' },
      { keys: '# + Space', result: 'Section (not printed)' },
      { keys: '= + Space', result: 'Synopsis (not printed)' },
      { keys: '[[ + Space', result: 'Note (not printed)' },
      { keys: '=== + Space', result: 'Page break' },
    ],
  },
  {
    title: 'Autocomplete & guide',
    rows: [
      { keys: '↑ ↓', result: 'Move through suggestions' },
      { keys: 'Tab / ↵', result: 'Accept suggestion' },
      { keys: 'Esc', result: 'Dismiss suggestions' },
      { keys: `${guideShortcut()} or F1`, result: 'Open or close this guide' },
    ],
  },
];
