# Focus

Focus is a local-first, distraction-free screenwriting app. You write one scene at a time in standard screenplay format, and the interface gets out of the way while you type.

When you start typing, the top bar and bottom status pill fade out so only the page and your script remain on screen. Moving the mouse or pressing `Esc` brings the controls back.

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
- **Paginated export.** **Screenplay pages (.html)** in the export menu opens a dialog with a live page preview: Courier 12, 54 lines a page, with an optional title page, page numbers, `(MORE)`/`(CONT'D)` across page breaks, `(CONT'D)` for returning speakers, scene numbers, and a custom header and footer (`{title}`, `{date}`, `{revision}`, `{page}`).
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

## Running locally

Install dependencies and start the Vite dev server:

```bash
npm install
npm run dev
```

Build the production bundle:

```bash
npm run build
```
