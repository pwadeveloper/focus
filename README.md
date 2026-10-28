# Focus

Focus is a local-first, distraction-free screenwriting app. You write one scene at a time in standard screenplay format, and the interface gets out of the way while you type.

When you start typing, the top bar and bottom status pill fade out so only the page and your script remain on screen. Moving the mouse or pressing `Esc` brings the controls back.

## Home page

New writers land on a welcome page that introduces Focus, offers to start a new screenplay or explore the sample script, and credits [filmschool.Africa](https://filmschool.africa) (The Film & Content School Africa), which powers Focus. After a writer opens or starts a script, later visits go straight back to it. The house button at the left of the top bar returns to the welcome page.

## Writing a screenplay

A screenplay in Focus is a list of scenes. You focus on one scene at a time and move between them with the previous/next turn bar at the bottom of the page, the **All Scenes** button, or the margin outline.

Each paragraph in a scene has a screenplay element type: scene heading, action, character, parenthetical, dialogue, transition, shot, and the less common elements (centered text, lyrics, act breaks, sections, synopses, notes, page breaks). Each type is styled to standard screenplay indentation.

- **Scene heading autocomplete.** Typing `INT.` or `EXT.` opens a keyboard-navigable menu (`Up`/`Down`, `Tab`/`Enter`) for `INT.`, `EXT.`, `INT./EXT.`, locations already used in your script, and times of day (`DAY`, `NIGHT`, `CONTINUOUS`, `DAWN`, `DUSK`, `LATER`).
- **Character and dialogue flow.** Pressing `Tab` on an action line turns it into a centered character cue and suggests character names from the rest of your script, plus extensions like `(V.O.)`, `(O.S.)`, and `(CONT'D)`. Pressing `Enter` after a character cue drops directly into dialogue.
- **Parentheticals and transitions.** Typing `(` starts a parenthetical. Typing `CUT`, `DISSOLVE`, `FADE`, or `> ` suggests right-aligned transitions (`CUT TO:`, `DISSOLVE TO:`, `SMASH CUT TO:`).
- **Fountain line triggers.** Starting a line with `.`, `>`, `@`, `!`, `~`, `#`, `=`, `[[` or `===` followed by a space forces a scene heading, transition, character, action, lyrics, section, synopsis, note, or page break.
- **Dual dialogue.** `Cmd/Ctrl + Shift + D` places two speeches side by side.
- **Element bar.** A floating pill bar at the bottom of the screen switches the current paragraph between element types without keyboard shortcuts. `Cmd/Ctrl + Alt + 1–9` does the same from the keyboard.
- **Screenplay guide (`Cmd/Ctrl + Alt + /` or `F1`).** A searchable side panel listing every element, scene heading part, character extension, transition, and shot. Clicking an entry inserts it at the cursor.

## Title page and export

- **Title page.** Edit the title, episode, credit ("Written by", "Screenplay by", "Teleplay by"), author, source material, draft date, contact, notes, and copyright from the **Title page** button in the timeline view or from the screenplay guide.
- **Paginated export.** **Screenplay pages (.html)** in the export menu opens a dialog with a live page preview. The dialog edits the title page credit, writer name, contact details, and draft date directly (**More fields…** opens the full title page editor), and exports Courier 12, 54 lines a page, with an optional title page, page numbers, `(MORE)`/`(CONT'D)` across page breaks, `(CONT'D)` for returning speakers, scene numbers, and a custom header and footer (`{title}`, `{date}`, `{revision}`, `{page}`).
- **Revision tracking.** Lock a draft in a production revision color (White, Blue, Pink, Yellow, and so on). Later exports mark every changed line with an asterisk.
- **Other formats.** Copy or download the script as Markdown/Fountain (`.md`) or plain text (`.txt`), or print and save as PDF (`Cmd/Ctrl + P`) through `@media print` rules that strip all app chrome.

## Narrative Timeline and Bird's-Eye View (`Cmd/Ctrl + M`)

The timeline view switches from the single-scene editor to an overview of the whole script with three layouts:

- **Timeline.** A Gantt-style scene stripboard with one bar per scene, estimated runtime, and the speaking characters listed under each scene.
- **Cards.** Index cards with the scene heading, status (Outline, In Progress, Polished), dialogue cue count, characters, an editable scene note, and controls to reorder or delete the scene.
- **Cabinet.** A stacked manila folder drawer for every scene with a dark monospace inspector card on top.

## Project filing cabinet and script library

- **Project Filing Cabinet (`Cmd/Ctrl + K`).** Clicking **Cabinet** in the top bar opens a stacked file cabinet of every script. Hovering or clicking a folder tab raises it and updates the inspector card, which can open the script or jump to its timeline.
- **Script library (`Cmd/Ctrl + \`).** The left drawer lists your scripts as a connected folder tree, with the active script's scenes nested underneath, or as a flat **All Scripts** list with search, pinning, duplicating, and deleting.

## Margin outline scanner

Along the left edge of the page sits a column of tick marks, one per scene heading, dialogue exchange, action beat, and transition. The active section is marked with a wider accent bar. Hovering over the ticks on desktop, or tapping them on a phone, expands them into a clickable outline.

## Focus, typography, and themes

- **Focus mode (`Cmd/Ctrl + D`).** Cycles between Off, Paragraph focus (dims every block except the active one), and Spotlight (dims distant blocks more than adjacent ones).
- **Typewriter scrolling (`Cmd/Ctrl + T`).** Keeps the active line anchored near 44% of the viewport height while you type.
- **Paper themes.** **Paper**, **Sepia**, and **Night**. An inline script in `index.html` applies the saved theme before first paint so the page never flashes on reload.
- **Typeface and measure.** The `Aa` menu switches between *Newsreader* (serif), *Plus Jakarta Sans* (sans), and *JetBrains Mono* (mono), with four font sizes and three column widths.

## Passkeys, sync, and writers rooms

Focus works without an account: scripts stay on the device. A passkey adds syncing and co-writing. Nobody signs up with an email.

- **Get a passkey.** Enter your name; Focus shows a passkey such as `DOLLY-7K2M-9QXA` exactly once. Your name plus that passkey signs you in on any device (case, spaces, and dashes don't matter).
- **Your scripts follow you.** While signed in, every script on the device is saved to your account (the sample script stays local), and new scripts are saved as you write them. Signing in on another device downloads them all, and Focus checks for changes whenever you come back to the tab. Signing out removes synced scripts from that device; they stay in your account.
- **Writers rooms.** From your account, start a room and share its invite code with up to two other writers. Someone new to Focus chooses **Join a room**, enters the code and their name, and gets their own passkey; someone with a passkey enters the code in their account. Names are unique within a room. The person who started a room can remove writers, replace the invite code, and delete the room's scripts; anyone can share a copy of a script into the room or leave it.
- **Lost passkeys.** On any device where you're still signed in, **New passkey** replaces it and signs out your other devices. Without a signed-in device, a lost passkey can't be recovered.

Synced scripts are written scene by scene, per device: opening a scene holds it, so another writer, or your own phone, sees it update every couple of seconds and can work on other scenes. A held scene frees up when its device moves on, closes the tab, or stops typing for ten minutes. Title, title page, and export settings sync too (the last change wins). Offline, you can keep writing; if someone else changed that scene in the meantime, your text is kept as a new scene named "(Name's version)" instead of being lost.

When a synced script is reopened on a device, the account's copy replaces whatever was saved there.

## Storage

All scripts and settings save locally in `localStorage` (keys prefixed `focus:`) for a synchronous first render, and back up to `IndexedDB` (`FocusWriterDB`) so long scripts do not hit storage quotas. Nothing leaves the browser.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + M` | Toggle Narrative Timeline & Bird's-Eye View |
| `Cmd/Ctrl + K` | Toggle Project Filing Cabinet (or insert link when text is selected) |
| `Cmd/Ctrl + Alt + /` or `F1` | Toggle the screenplay guide |
| `Cmd/Ctrl + Alt + 1–9` | Switch the current element type |
| `Cmd/Ctrl + Shift + D` | Dual dialogue |
| `Cmd/Ctrl + D` | Cycle Focus mode (Off / Paragraph / Spotlight) |
| `Cmd/Ctrl + T` | Toggle Typewriter scrolling |
| `Cmd/Ctrl + \` | Open or close the script library drawer |
| `Cmd/Ctrl + /` | Open the keyboard shortcuts reference |
| `Cmd/Ctrl + B` / `I` / `Shift + X` | Bold, italic, strikethrough |

## Project layout

- `src/App.tsx` manages scripts, the active scene, keyboard shortcuts, and exports.
- `src/components/WelcomeHome.tsx` renders the welcome home page and the filmschool.Africa credit (logo in `src/assets/`).
- `src/components/FocusLogo.tsx` holds the `_focus` wordmark and the `_f` mark, colored per theme by `--logo-ink`. The `_f` favicon set (`favicon.svg`, `favicon.ico`, `apple-touch-icon.png`) lives in `public/`.
- `src/components/RichEditor.tsx` renders the `contentEditable` scene canvas, element triggers, dual dialogue layout, focus dimming, typewriter scroll, and the scene turn bar.
- `src/components/ScreenplayTools.tsx` provides the scene heading, character, and transition autocomplete and the element switcher bar.
- `src/components/ScreenplayGuide.tsx` renders the searchable screenplay guide panel.
- `src/components/TitlePageDialog.tsx` and `src/components/ScreenplayExportDialog.tsx` edit the title page and configure paginated export.
- `src/screenplay.ts` holds element definitions, scene heading parsing, and shortcut tables.
- `src/screenplayExport.ts` paginates the script into industry-formatted pages and tracks revisions.
- `src/components/BirdsEyeView.tsx` and `src/components/NarrativeTimeline.tsx` render the Timeline, Cards, and scene Cabinet views.
- `src/components/ProjectCabinetView.tsx` renders the project file cabinet and the reusable `SegmentedTickMeter`.
- `src/components/SidebarDrawer.tsx` renders the script library drawer.
- `src/components/DocumentOutline.tsx` renders the left-margin outline scanner.
- `src/storage.ts` handles `localStorage` and `IndexedDB` persistence and the starter script.
- `api/` holds the Vercel Functions: `auth.ts` (passkeys, sign in and out, starting and joining rooms), `room.ts` (a room's writers and invite code), `scripts.ts` (open, download all, create, delete), and `sync.ts` (one round trip per poll: scene holds, saves, presence, and changes since the client's versions). Every script lives in a room; each writer's own scripts are in their personal room. Shared code and the API types are in `api/_lib/`.
- `db/schema.sql` is the Postgres schema; `npm run db:migrate` applies it.
- `src/room/` is the client side: `api.ts` calls the functions and remembers the account for offline use, `RoomSync.ts` pushes local edits and merges remote ones, and `useRoomSync.ts` runs it for the open script. `src/components/WritersRoomDialog.tsx` is the account and writers room panel.

## Running locally

Install dependencies and start the Vite dev server:

```bash
npm install
npm run dev
```

Passkeys and sync need the Neon Postgres database connected to the `focus` Vercel project. `npm run dev` serves `api/*.ts` itself and reads the connection string from `.env.local`:

```bash
vercel link --project focus   # once
vercel env pull .env.local    # DATABASE_URL and friends
npm run db:migrate            # create or update the tables
```

Functions run in London (`lhr1`, in `vercel.json`), next to the database.

The pulled `DATABASE_URL` is the live site's database, so accounts and scripts created while developing locally appear in production. For a separate development database, create a Neon branch and put its URL in `.env.local`.

Build the production bundle:

```bash
npm run build
```
