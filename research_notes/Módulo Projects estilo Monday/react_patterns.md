# React patterns for a Monday.com-style task table (React 19, TS, Tailwind 4, zustand)

Project context (read from frontend/package.json): react ^19.3, zustand ^5.0.15, tailwind ^4.3, motion ^13, lucide-react, sonner, shadcn ^4.21, clsx, tailwind-merge. No table, DnD or virtualization library installed. Any addition is a new dependency.

## 1. Table approach: plain CSS grid vs TanStack Table vs data-grid library

### Takeaway
For a board with user-defined groups, a fixed set of typed columns and inline editors, the minimal choice is hand-rolled components (CSS grid or native table) driven by the zustand store. TanStack Table's value (column-value grouping, sorting, filtering row models) overlaps with logic you will own anyway in store selectors. Full data-grid libraries are built for spreadsheets and bring heavy a11y baggage.

### Cited Findings
- TanStack Table has no built-in virtualization. It is headless and works with TanStack Virtual or react-window; official examples cover fixed and dynamic row-height virtualized rows. — [TanStack Table virtualization guide](https://tanstack.com/table/latest/docs/guide/virtualization)
- In TanStack Table, grouping and expanding need their own row models passed in as options (grouped row model, expanded row model). — secondary summary of [TanStack Table features guide](https://tanstack.com/table/latest/docs/guide/features); I could not fetch the grouping guide (404/empty), so details are unverified.
- TanStack Virtual is a headless virtualizer for long lists; vertical by default, horizontal and two-axis supported; framework-agnostic. Bundle size not stated on the page. — [TanStack Virtual intro](https://tanstack.com/virtual/latest/docs/introduction)
- Adrian Roselli: for ordinary tabular data a native HTML table is enough; ARIA grid should mostly be ignored "unless you are trying to recreate Excel"; grid semantics are exposed only to screen-reader users and many pre-packaged grid libraries (he names ag-Grid) ship accessibility bugs. — [ARIA Grid As an Anti-Pattern](https://adrianroselli.com/2020/07/aria-grid-as-an-anti-pattern.html)
- MDN recommends native table markup rather than recreating table behavior with ARIA and JS; td or role=gridcell can be made editable. — [MDN gridcell role](https://developer.mozilla.org/docs/Web/Accessibility/ARIA/Roles/gridcell_role)

### Inferences
- Monday groups are user-defined containers (a group has a name, color, ordered item ids), not "group by column value". That is a different model from TanStack's `getGroupedRowModel`, so the grouping feature would not be used; you would feed TanStack a flattened list anyway. Hence TanStack Table adds a dependency for little. (Inference; not verified against the grouping docs.)
- Recommended structure: one CSS-grid template per board (`grid-template-columns` set once via a CSS variable on the board root, so header, rows and add-row all align; subgrid or a shared variable). Per-group: header row (collapse chevron, color bar, name, count), item rows, add-item row, footer summary row. Column resize can be a single store value.
- Use a native `<table>` only if you want free semantics; a div grid with `role="table"`/`rowgroup`/`row`/`cell` is the common compromise. Sticky first column plus horizontal scroll is easier with CSS grid + `position: sticky; left: 0`.
- Bring in TanStack Table only if you later need many column types with user-configurable sort/filter/column visibility and want its state model; otherwise write `selectVisibleItems(board, filters, sort)` as a pure function (also testable in vitest, which is already in the project).

### Gaps
- Could not read TanStack Table's grouping guide, so no verified statement on manual/user-defined groups.
- No bundle-size numbers for TanStack Table/Virtual obtained from a primary source.

## 2. Drag and drop: dnd-kit vs native HTML5 vs pragmatic-drag-and-drop

### Takeaway
dnd-kit is the default for a React app that needs keyboard-accessible sortable lists across containers (items inside groups, groups reorder). Pragmatic DnD is smaller and very performant but leaves keyboard/ARIA and multi-container wiring to you. Native HTML5 DnD is what Pragmatic wraps; raw use means writing everything yourself.

### Cited Findings
- Comparison table (secondary source, PkgPulse): dnd-kit core about 6KB with modular add-ons; actively maintained; keyboard dragging (Space, arrows, Escape) and customizable screen-reader announcements built in; dragging between lists/grids/trees works out of the box. Pragmatic DnD about 3.5KB (under 4KB); gives lower-level utilities; keyboard navigation and ARIA built by you; multi-container behavior wired manually; recommended for Jira-style UIs and thousands-of-items performance. react-beautiful-dnd about 30KB, deprecated, no React 19 guarantee. — [PkgPulse 2026 comparison](https://www.pkgpulse.com/guides/dnd-kit-vs-react-beautiful-dnd-vs-pragmatic-drag-drop-2026) (secondary, figures unverified)
- Pragmatic DnD README: core about 4.7kB (claimed, no method given); built on the browser's native drag and drop; unopinionated about accessibility and visuals; optional packages for drop indicators and assistive-technology controls (built on Atlassian Design System, with dependencies like emotion/React/@atlaskit/tokens). Repo is a one-way daily mirror of an internal monorepo and does not accept code contributions. — [atlassian/pragmatic-drag-and-drop on GitHub](https://github.com/atlassian/pragmatic-drag-and-drop)
- Conflicting size figures: 3.5KB (PkgPulse) vs 4.7kB (Atlassian README) for Pragmatic core. — sources above
- The Atlassian docs navigation shows a "Deprecated" label near Pragmatic DnD, but the fetched text does not explain it (it may refer to a different section). Unresolved. — [Atlassian Design pragmatic-drag-and-drop about page](https://atlassian.design/components/pragmatic-drag-and-drop/about)
- The current dnd-kit docs describe a framework-agnostic "latest" version with a "Legacy" section; sensors cover mouse, touch and keyboard; sortables are "reordered within and across lists". — [dndkit.com](https://dndkit.com/)
- dnd-kit (new API) multiple sortable lists: `DragDropProvider` with `onDragStart/onDragOver/onDragEnd`; items use `useSortable({id,index,type,accept,group})`; columns use `useDroppable` with `collisionPriority: Low`; move state with the `move` helper from `@dnd-kit/helpers` in `onDragOver`; make columns sortable too and reorder them in `onDragEnd` to avoid re-renders mid-drag; snapshot state in `onDragStart` and restore if `event.canceled`; Escape cancels a pointer drag. — [dndkit.com multiple sortable lists guide](https://dndkit.com/react/guides/multiple-sortable-lists)
- Roselli-style caution applies to custom DnD too: provide a non-drag alternative (e.g., a "Move to group / up / down" menu). (See keyboard note below.) — [ARIA Grid As an Anti-Pattern](https://adrianroselli.com/2020/07/aria-grid-as-an-anti-pattern.html) is only about grids; the move-menu suggestion is my inference.

### Inferences
- Nested case (items inside groups, plus group reorder): in dnd-kit, give items `type: "item"`, `accept: "item"`, `group: groupId`; give group containers `type: "group"`. Empty groups need a droppable so items can be dropped in them.
- Prefer dnd-kit for a11y out of the box. Check which package you install: the legacy `@dnd-kit/core` + `@dnd-kit/sortable` vs the newer `@dnd-kit/react`; I could not verify the npm release status or React 19 compatibility of each, so check before choosing.
- Persist order with fractional indexing (string rank per item) so a move updates one row only; see section 3.
- Drag only from a handle (not the entire row) so inline text editing and text selection keep working.

### Gaps
- No primary-source bundle size for dnd-kit; no verification of `@dnd-kit/react` stability or React 19 support.
- Meaning of the "Deprecated" label on Atlassian's page unknown.
- No independent a11y test results for any of the three libraries.

## 3. zustand store shape: normalized entities, selectors, optimistic mutations

### Takeaway
Store entities normalized (`itemsById`, `groupsById` plus ordered id arrays or rank strings), derive visible rows with selectors, and make optimistic changes a replayable layer over server-confirmed state so rollback is just removing the pending op.

### Cited Findings
- Pattern from a DEV post using zustand: `committed` (id to last server snapshot) plus `pending` (ordered queue of `{mutationId, entityId, patch}`); UI reads a derived view = committed with pending patches replayed in order; commit on ack replaces snapshot and drops op; reject just drops the op, so no residue; recommends computing the view in selectors rather than storing it, and unit testing the reducer/rebase logic. — [DEV: Optimistic React UIs that don't drift](https://dev.to/yaseenyk04/optimistic-react-uis-that-dont-drift-from-the-server-536l)
- Normalized data makes rollback easier because previous values can be read by entity id. — [DEV: Automatic rollback in optimistic updates](https://dev.to/klis87/automatic-rollback-data-in-optimistic-updates-a-surprising-benefit-of-normalized-data-535l) (from search snippet only)
- General guidance: snapshot before each optimistic write, roll back to that snapshot on failure, reconcile with the server afterward; two concurrent writes to one record can race and a last-response-wins policy can corrupt state, so order matters. — [Optimistic update rollback contracts](https://www.skills.sh/voidmatcha/frontend-niche-skills/optimistic-update-rollback-contracts) (snippet only)
- Fractional indexing (Figma): each child has an index between 0 and 1 as a string, a move changes a single value, insert by averaging neighbors; use exact (string) arithmetic not doubles; indices can grow long over many edits; concurrent inserts can collide/interleave and the server assigns unique positions. — [Figma: Realtime editing of ordered sequences](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)
- Linear (secondary write-ups, unverified against the talk): local replica in IndexedDB, mutations applied locally first and pushed async, revert in-memory model if the server rejects. — [performance.dev on Linear](https://performance.dev/what-makes-linear-feel-instant), [1023jack breakdown](https://1023jack.com/general/how-s-linear-so-fast-a-technical-breakdown/)
- zustand v5 selector guidance: I could not retrieve the `useShallow` docs page (404). From training knowledge (not verified in this session): in v5, a selector that returns a new object/array each call causes an infinite render loop; wrap with `useShallow` or select primitives/ids.

### Inferences
- Suggested shape:
  - `boards: Record<id, Board>`; `groups: Record<id, {id, boardId, name, color, collapsed, rank}>`; `items: Record<id, {id, groupId, rank, name, fields: Record<columnId, value>, updatedAt}>`; `columns` per board.
  - `groupItemIds(groupId)` as a selector that sorts by rank; memoize per group or keep an `itemIdsByGroup` index updated on mutations.
  - Rows subscribe by id: `useStore(s => s.items[id])`, so editing one cell re-renders one row. `React.memo` rows, cell components take `(itemId, columnId)`.
  - UI state (selected item for side panel, filters, sort, collapsed groups, editing cell) in a separate slice or store; persist collapsed/filters per board to localStorage with zustand `persist`.
- Because this is local-first with a local backend (FastAPI at localhost), failures are rare. A simple snapshot-and-rollback per mutation (capture previous entity, apply, call API, on error restore previous and show a sonner toast) is probably enough; the committed+pending queue is only worth it if rapid concurrent edits on the same item are expected. Serialize writes per item id (queue) to avoid the last-response race.
- Mutations for drag: apply move optimistically, send `{itemId, groupId, beforeId/afterId}` or a computed rank; server returns the canonical rank; on error restore snapshot (same as dnd-kit cancel handling).

### Gaps
- Could not open the zustand docs for v5 selector/`useShallow` and `persist`; v5 behavior above is from memory.
- Linear claims come from third-party blogs; the original talk was not accessed.

## 4. Accessibility and virtualization

### Takeaway
Follow the APG grid keyboard model only if cells are really edited in place; otherwise a real table/tab-order approach is simpler and less risky. Virtualize only after profiling; common rules of thumb put the threshold in the hundreds of rows, and expensive per-row renders are usually the first thing to fix.

### Cited Findings
- APG grid: one focusable element in the Tab sequence and author-written focus management; arrows move one cell; Home/End first/last cell in row; Ctrl+Home/End first/last cell in grid; Page Up/Down moves an author-defined number of rows; Enter or F2 enters edit mode (grid navigation disabled, focus moves into the input), F2 again returns; typing an alphanumeric key starts editing; Escape restores navigation and may undo; Tab/Shift+Tab move among widgets while navigation is disabled. — [WAI-ARIA APG grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
- APG attributes: `aria-rowcount`/`aria-colcount` when not all rows/columns are in the DOM; `aria-rowindex`/`aria-colindex` for position; `aria-readonly` on non-editable cells (omit if grid has no editing); `aria-selected`, `aria-sort`, label with `aria-label`/`aria-labelledby`. — [WAI-ARIA APG grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
- The APG page, as retrieved, does not name roving tabindex or aria-activedescendant explicitly; it only requires a single tab stop. — same source
- Roselli: grid semantics help only screen-reader users; keyboard-only users get no cue about arrow-key behavior; ignore ARIA grid unless recreating Excel. — [ARIA Grid As an Anti-Pattern](https://adrianroselli.com/2020/07/aria-grid-as-an-anti-pattern.html)
- Virtualization thresholds (single blog, no benchmark): roughly 500+ uniform-height rows or 200+ variable-height rows; a 200-row table rarely scrolled usually does not justify it; measure first; fix per-item render cost with `React.memo`/`useMemo` before virtualizing. — [search summary citing resumelens and frontendchecklist.io](https://www.resumelens.org/blog/react/react-virtualization-tanstack-virtual), [Front-end checklist](https://frontendchecklist.io/rules/performance/list-virtualization)
- Monday itself: staff guidance of under 1000 items and 40 columns per board for optimal performance (another staff reply lists hard limits of 10K items/200 columns, 20K/300 for enterprise); user reports of slow loading with 60-70 columns or 7,000+ items. — [Monday community: performance and columns](https://community.monday.com/t/performance-issues-related-to-number-of-columns/74201), [Monday community: max items per board](https://community.monday.com/t/is-there-a-maximum-number-of-items-per-board/19062)

### Inferences
- A pragmatic keyboard model for the board: row-level roving tabindex (arrows up/down between rows, Left/Right between cells, Enter/F2 to edit, Esc to cancel, Tab leaves the grid) using `role="grid"` only if you implement all of it; otherwise use `role="table"` plus normal tab stops on each cell's button. Provide non-drag alternatives for moving items (menu) and visible focus rings.
- Status pill / person / date cells: render as `<button aria-haspopup="listbox|dialog">` that opens a popover; Escape closes and returns focus to the cell. Native `<input type="date">` is the minimal date editor (no dependency); build the status listbox with a headless pattern (shadcn/Radix already pulled in via `shadcn`; I did not verify which Radix packages are installed).
- Realistic target for this app: hundreds of items per board, with Monday's own "under 1000 items" guidance as a ceiling. With memoized per-id rows, a collapsed-by-default long group, and no virtualization, hundreds of rows should be fine. Add TanStack Virtual only if profiling shows jank beyond roughly 500 to 1000 rendered rows; note virtualization conflicts with drag and drop (off-screen drop targets, auto-scroll), find-in-page and screen-reader row counts (needs `aria-rowcount`/`aria-rowindex`). Collapsed groups already cut DOM size cheaply.
- Use `content-visibility: auto` on group bodies as a no-dependency intermediate step (my suggestion; not sourced here).

### Gaps
- No primary benchmark for row-count thresholds; numbers are rules of thumb.
- No source found on dnd-kit + TanStack Virtual combination issues.

## 5. UX pitfalls reported in task tools

### Takeaway
The only well-sourced pitfall evidence I obtained is from Monday itself: column bloat and large boards hurt performance and clarity. Asana, ClickUp and Linear table pitfalls were not found in this pass.

### Cited Findings
- Reviews describe monday boards with too many columns looking cluttered; users cannot easily hide columns from specific people without separate boards; performance issues are reported on boards with hundreds of items. — [G2 monday.com review 2026](https://learn.g2.com/monday-review) and third-party review aggregations (vendor/competitor-sourced material is mixed in; framing may be promotional)
- Monday community: slow load with 60-70 columns and thousands of contacts; one commenter says 50 columns have no impact unless many are mirror columns (conflicting). — [Monday community thread](https://community.monday.com/t/performance-issues-related-to-number-of-columns/74201)
- Monday staff: keep boards under 1000 items and 40 columns. — [Monday community thread](https://community.monday.com/t/is-there-a-maximum-number-of-items-per-board/19062)

### Inferences
- Design defaults to avoid known failure modes (from general practice, not sourced): cap visible columns with a hide/show menu; keep add-item row always visible; autofocus the name input after adding and keep adding on Enter; preserve scroll and focus after optimistic reorder; make filters/sort visibly active (chip bar with clear-all); don't reset collapsed state on refetch; confirm destructive group delete; undo toast for item delete (sonner is installed); do not let sort override manual order silently (show "sorted by X, drag disabled" state).

### Gaps
- No sourced material on Asana, ClickUp or Linear table-view pitfalls. A targeted search (user forums, Reddit, UX teardowns) is still needed.
- No Linear/Asana/Notion engineering blog on table internals was reached (Linear sync-engine talk only via secondary summaries).
