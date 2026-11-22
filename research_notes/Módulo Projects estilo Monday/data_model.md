# Data model and backend for a Monday-style board module (SQLite + FastAPI)

## 1. Typed columns with per-cell values: JSON per item vs EAV/cells table vs table per type

### Takeaway
For a single-user local app, the smallest design is a `columns` table (schema: type + settings JSON) plus one JSON text blob of values on each item (`items.values`, keyed by column id). SQLite JSON functions are built in and can be indexed through expressions or generated columns. Monday and Notion both split schema (column definition) from per-item values, and both type values per column.

### Cited Findings
- Monday returns every cell as a `column_value` with `id`, `type`, `text` (human readable, not always available), `value` (raw JSON whose structure varies per type), and `column` (the definition). Typed subtypes such as `StatusValue` add `index`, `label`, `is_done`, `label_style` — [Monday column values](https://developer.monday.com/api-reference/reference/column-values-v2)
- Notion also separates schema from values: the data source defines property names/types; each page's `properties` maps property to a typed value. Select/status = option object or null (`id`, `name`, `color`); date = `{start, end, time_zone}` or null; number = JSON number or null. Option colors live in the schema, not in the page value. A page write cannot create a new status option, which is managed in the schema — [Notion property values](https://developers.notion.com/reference/property-value-object)
- SQLite `json_extract` returns native SQL values (INTEGER/REAL/TEXT/NULL), so results sort and compare correctly; `->>` does the same (SQLite 3.38.0+). `json_each` expands arrays into rows (useful for multi-select/people filters) — [SQLite JSON1](https://www.sqlite.org/json1.html)
- JSON is built in by default since 3.38.0; JSONB functions since 3.45.0; `jsonb_each/tree` in 3.51.0 (2025-11-04) — [SQLite JSON1](https://www.sqlite.org/json1.html)
- Generated columns can be VIRTUAL (computed on read, no storage) or STORED. An index on a VIRTUAL generated column is an expression index. `ALTER TABLE ADD COLUMN` can add VIRTUAL but not STORED generated columns — [SQLite generated columns](https://www.sqlite.org/gencol.html)

### Inferences
- Recommended minimal schema (my design, not from a source):
  ```sql
  CREATE TABLE boards  (id INTEGER PRIMARY KEY, title TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'active', created_at TEXT, updated_at TEXT);
  CREATE TABLE groups  (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                        title TEXT NOT NULL, color TEXT, rank TEXT NOT NULL, archived_at TEXT);
  CREATE TABLE columns (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                        key TEXT NOT NULL,            -- stable key used inside items.values, e.g. 'status'
                        title TEXT NOT NULL, type TEXT NOT NULL,   -- text|number|status|date|people|checkbox|...
                        settings TEXT NOT NULL DEFAULT '{}',       -- JSON: status labels [{id,name,color,is_done}], number format...
                        rank TEXT NOT NULL, archived_at TEXT, UNIQUE(board_id,key));
  CREATE TABLE items   (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                        group_id INTEGER REFERENCES groups(id), parent_id INTEGER REFERENCES items(id),  -- subitem = parent_id set, one level only
                        title TEXT NOT NULL, rank TEXT NOT NULL,
                        values TEXT NOT NULL DEFAULT '{}',         -- JSON {colKey: value}
                        version INTEGER NOT NULL DEFAULT 1, archived_at TEXT, created_at TEXT, updated_at TEXT);
  CREATE INDEX items_board ON items(board_id, group_id, rank) WHERE archived_at IS NULL;
  ```
  Subitems as `parent_id` self-reference avoids a second table (Monday also has a distinct subitem column set, see Q3, but a single-user app can reuse the board columns).
- Query patterns: filter `WHERE values->>'status' = 3`; sort `ORDER BY values->>'due' , rank`; group-by `GROUP BY values->>'status'`; multi-value `EXISTS (SELECT 1 FROM json_each(items.values,'$.people') WHERE value = ?)`. Scale is small (thousands of items), so full scans are fine; add a generated-column index only for a hot key.
- Store status as the label's stable id (not label text and not display position). Store dates as ISO-8601 text so they sort lexically. Validate on write in Python (per-type validator keyed by `columns.type`) because JSON has no schema enforcement.
- Why not EAV (`cells(item_id, column_id, value_text, value_num, value_date)`): needs a join/pivot per column for filter/sort/group (N columns = N joins or conditional aggregation), more rows, more code; benefit (per-cell indexes, per-cell history) is not needed single-user. One table per column type is the heaviest (schema changes per new type) and is unnecessary. Upgrade path to EAV exists later since values are small JSON.

### Gaps
- No authoritative benchmark found comparing JSON-blob vs EAV in SQLite at small scale; the recommendation relies on reasoning from the documented JSON/expression-index features.
- Did not find Monday's exact raw `value` shapes for date/people/number (docs page lacked examples).

## 2. Ordering: fractional indexing / LexoRank vs integer positions

### Takeaway
Use a string `rank` with fractional indexing (one-row update per move, no renumbering). Integer positions force renumbering many rows on every move; floats run out of precision. Monday itself exposes `position` as a numeric string on groups, and Jira's LexoRank needs periodic rebalancing, which the fractional-index approach mostly avoids at single-user scale.

### Cited Findings
- Figma's fractional indexing: each child has a real-number index, sorted by it; insert = average of neighbours; arbitrary-precision values kept as strings; moving an object changes only one value — [Figma blog](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)
- Pitfalls per Figma: concurrent inserts may interleave (accepted); index strings can grow (not considered a practical concern); two identical indices cannot be averaged, so the server assigns a unique position — [Figma blog](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)
- `rocicorp/fractional-indexing` (JS; ports in Go, Python, Kotlin, Ruby said to be byte-for-byte compatible): `generateKeyBetween(a,b)` with null for open bounds (`generateKeyBetween(null,null)` = `"a0"`), `generateNKeysBetween(a,b,n)` gives shorter keys when generating several at once. Default base-62 digits. Keys are case-sensitive: sort with native/binary comparison, NOT `localeCompare`. Optional jitter reduces concurrent collisions — [rocicorp/fractional-indexing](https://github.com/rocicorp/fractional-indexing)
- Float-based ordering eventually runs out of room between neighbours; one blog suggests spacing initial values by large increments — [yasoob.me via search](https://yasoob.me/posts/how-to-efficiently-reorder-or-rerank-items-in-database/)
- Jira LexoRank: rank strings lengthen with operations; balancing redistributes values; Jira schedules a rebalance at 128 chars, forces one at 160, and blocks ranking at 254+ chars — [Atlassian LexoRank docs](https://confluence.atlassian.com/adminjiraserver0901/managing-lexorank-1155492126.html)
- Monday groups: `position` is a String containing only a number; passing a number errors; `create_group` `position` is deprecated in favour of `relative_to` + `position_relative_method` (`before_at`/`after_at`) — [Monday groups](https://developer.monday.com/api-reference/reference/groups)
- Search found nothing on how Linear stores ordering (`sortOrder`); not confirmed.

### Inferences
- In SQLite, make the rank column `TEXT` with default BINARY collation so `ORDER BY rank` matches the library's ordering. Index `(board_id, group_id, rank)`.
- API shape borrowed from Monday: move takes `{before_id | after_id | group_id}`; the server reads the two neighbours' ranks, computes the key, writes one row. Client never computes ranks (avoids the identical-key problem; single writer makes it trivial). Add `UNIQUE`-free index but if a computed key collides, regenerate/rebalance the group.
- Cheap safety valve: if `len(rank) > ~64`, rebalance a group with `generateNKeysBetween(None,None,n)` in one transaction. For a Python port, a ~40-line implementation or the existing PyPI ports can be used (not verified which PyPI package is maintained).
- Simplest alternative if fractional lib is unwanted: REAL positions with 1024 gaps and renumber on gap < epsilon; fine for single user but rank strings are more robust.

### Gaps
- Did not verify a specific maintained Python port of fractional indexing; check PyPI before adopting.
- Linear's ordering implementation not found.

## 3. Monday API model: boards, groups, items, column_values, status labels

### Takeaway
Monday: board has groups (visible sections, string `position`) and columns; items live in groups and expose `column_values`; status is `{"index": n}` where `index` is really the stable label id; label color is a named enum with hex.

### Cited Findings
- Board `state`: `active`, `all`, `archived`, `deleted` (queries return active only by default); `groups` = visible groups (containers of rows/items); `columns` = visible columns; `items_page` retrieves items; `board_kind`: private/public/share. Subitem columns are a separate field `subitem_columns` (version 2027-01+) — [Monday boards](https://developer.monday.com/api-reference/reference/boards)
- Group fields: `id`, `title`, `color`, `position` (string), `archived`, `deleted`. Mutations: `create_group`, `move_item_to_group`, `duplicate_group`, `archive_group`, `delete_group` (archive/delete cascade to the group's items) — [Monday groups](https://developer.monday.com/api-reference/reference/groups)
- Status value raw JSON e.g. `{"index":1}`; `index` is the label id used for updates, `label`/`text` are display text (null when empty); `label_style` has `color` and `border` hex — [Monday status](https://developer.monday.com/api-reference/reference/status)
- Writing: `change_multiple_column_values` with `{"status":{"index":1}}` or `{"status":{"label":"Done"}}`; `change_simple_column_value` with plain string; `create_labels_if_missing: true` creates unknown labels else error. Docs advise preferring index since label text is fragile. Clear with `null`/empty string — [Monday status](https://developer.monday.com/api-reference/reference/status)
- Colors are a `StatusColumnColors` enum (e.g. `done_green` #00c875, `stuck_red` #e2445c), each with a numeric id that doubles as label id, so each color is usable once per column; max 40 labels per status column; label `settings` may carry a `hex` override. In settings `id` is the stable label identifier, `index` is display position — [Monday status](https://developer.monday.com/api-reference/reference/status)
- Item `column_values` fields incl. `is_leaf` (no subitems) — [Monday column values](https://developer.monday.com/api-reference/reference/column-values-v2)

### Inferences
- Copy Monday's lesson: separate stable label `id` from display order; store label `id` in cells. Do NOT copy the "color doubles as id / once per column" constraint; use autoincrement label ids inside `columns.settings` and a free `color` string.
- Minimal column types for v1: text, number, status, date, checkbox, people/tags (JSON array). Add `is_done` flag on status labels so "completed" is derivable.

### Gaps
- Monday's raw `value` JSON for date, people, number not captured (page lacked examples).
- `settings_str` of board not described on fetched page.

## 4. Soft delete/archive, activity log, optimistic updates, conflicts (single-user, local-first)

### Takeaway
Use an `archived_at` timestamp (partial indexes keep live queries fast) and an append-only `activity` table written in the same transaction as each mutation. Optimistic UI plus a per-item integer `version` check is enough for a single user (conflicts only arise from multiple tabs or a stale tab). Specific local-first/CRDT sources were not retrieved.

### Cited Findings
- Monday models lifecycle as states on boards (`active/archived/deleted`) and `archived`/`deleted` booleans on groups; archive/delete of a group cascades to its items — [Monday boards](https://developer.monday.com/api-reference/reference/boards), [Monday groups](https://developer.monday.com/api-reference/reference/groups)
- SQLite operational advice (secondary sources, blog/skill pages, not official docs): `PRAGMA foreign_keys=ON` per connection (needed for ON DELETE CASCADE); `busy_timeout` of roughly 1000-5000 ms; WAL with `synchronous=NORMAL`; single write connection or serialized writes; `BEGIN IMMEDIATE` for write transactions; keep them short — [coddy.tech pragma settings](https://coddy.tech/docs/sqlite/pragma-settings) and other results of the same search
- Figma's server-authoritative approach: server resolves duplicate positions, accepts occasional imperfect order rather than complex OT — [Figma blog](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)

### Inferences
- Soft delete: `archived_at TEXT NULL` on boards/groups/items/columns; cascade in the service layer (archive group sets archived_at on its items with the same timestamp, so restore can restore exactly those). Hard purge via explicit "empty trash" only. Partial index `WHERE archived_at IS NULL`.
- Activity log ("updates"): `activity(id, board_id, item_id, ts, kind, field, old JSON, new JSON)` for field changes, plus `item_updates(id, item_id, body, ts)` for comment-style notes (Monday's "updates" are user posts; the audit trail is separate). Write in the same transaction; log only meaningful fields to limit churn.
- Optimistic updates: client applies change, sends `PATCH` with `If-Match`/`version`; server increments `version` in `UPDATE ... WHERE id=? AND version=?`, returns the new row; 409 on mismatch triggers refetch. Last-write-wins on a per-column basis is acceptable: PATCH only the changed keys using `json_set(values,'$.key',json(?))` so concurrent edits of different cells do not clobber each other.
- Sync/CRDTs unnecessary for one user; avoid until multi-device.

### Gaps
- No well-known local-first essays (Ink & Switch, etc.) were fetched; claims above on conflict handling are design reasoning, not cited.
- SQLite pragma advice came from secondary sources; confirm against sqlite.org WAL/pragma docs.

## 5. Migration from a simple tasks table to the richer model

### Takeaway
Do an additive, in-place migration in one transaction: create the new tables, create a default board with default columns, copy each old task into `items` mapping legacy fields to column values, and keep the old table until verified. No external source found; this is standard practice reasoning.

### Cited Findings
- SQLite can add VIRTUAL generated columns via `ALTER TABLE ADD COLUMN` but not STORED ones, which matters if you later add hot-key indexes without a table rebuild — [SQLite generated columns](https://www.sqlite.org/gencol.html)

### Inferences
- Steps: (1) backup the DB file (`VACUUM INTO` or file copy); (2) `PRAGMA user_version` as migration counter, migrations as ordered Python functions each run in a transaction; (3) create default board "Tasks" with group per legacy status (or one group) and columns: status (labels mapped from old status values), due date, priority, etc. derived from old columns; (4) insert items preserving old ids in a `legacy_task_id` column (or use the same id) so existing links/references from other modules (chat, voice) keep working; (5) generate ranks with `generateNKeysBetween` per group ordered by old order/created_at; (6) leave the old `tasks` table (rename `tasks_legacy`) for one release, then drop; (7) provide a compatibility view `CREATE VIEW tasks AS SELECT ...` if other code still queries `tasks` (read-only).
- Check the project's existing tasks table and callers before choosing id strategy (not inspected in this research).

### Gaps
- Did not inspect the Jarvis/Phibe repo schema; mapping depends on actual legacy columns.
- No external source on migration practice fetched.

## 6. Minimal REST API

### Takeaway
Resource-oriented REST over four collections, with a single "board snapshot" read endpoint and a single "move" endpoint; Monday's GraphQL surface (move_item_to_group, create_group with relative position, archive vs delete, change_multiple_column_values) maps cleanly to REST verbs.

### Cited Findings
- Monday's mutation vocabulary to mirror: `create_group`/`move_item_to_group`/`archive_group`/`delete_group`/`duplicate_group`; `change_multiple_column_values` (multi-cell patch); relative positioning via `relative_to` + `before_at/after_at` — [Monday groups](https://developer.monday.com/api-reference/reference/groups), [Monday status](https://developer.monday.com/api-reference/reference/status)

### Inferences
- Proposed endpoints (my design):
  - `GET /boards` ; `POST /boards` ; `PATCH /boards/{id}` ; `DELETE /boards/{id}` (archive; `?purge=1` hard)
  - `GET /boards/{id}` returns the whole snapshot: board, groups, columns, non-archived items (with `values`) in one response, which is plenty for a single user
  - `POST /boards/{id}/groups` ; `PATCH /groups/{id}` ; `POST /groups/{id}/move` `{before_id|after_id}`
  - `POST /boards/{id}/columns` ; `PATCH /columns/{id}` (title, settings incl. status labels) ; `POST /columns/{id}/move`
  - `POST /boards/{id}/items` `{title, group_id, parent_id?, values?, before_id?|after_id?}` ; `PATCH /items/{id}` `{title?, values?{key:val}, version}` ; `POST /items/{id}/move` `{group_id?, before_id?|after_id?}` ; `DELETE /items/{id}` (archive) ; `POST /items/{id}/restore`
  - `GET /items/{id}/activity` ; `POST /items/{id}/updates`
- Pydantic: `values` validated per column type in a service function; return the updated item (with new `version` and `rank`) from every mutation so the client reconciles optimistic state.

### Gaps
- No source defines a "standard" REST shape for this; the endpoint list is design judgment.
- Did not fetch Linear/Asana engineering posts (searches returned nothing relevant on Linear).
