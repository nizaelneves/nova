# Monday.com columns: defaults, types, status/priority, settings, API

Note: support.monday.com returned HTTP 403 to every fetch, so UI claims below come from search-result snippets (flagged) or the developer docs (fetched in full). Treat UI-side claims as medium confidence.

## 1. Default columns on a new blank board / template

### Takeaway
A new blank board ships with Item (name), Person, Status, Date (per a community post; not confirmed by official docs). "Owner" is the label used in templates, not a distinct type: the underlying type is People.

### Cited Findings
- A community post says the board created via "Add New Board" has Item, Person, Status, Date as the current default; users ask to customize this default — [search summary of community.monday.com/t/customize-the-default-board/102725](https://community.monday.com/t/customize-the-default-board/102725) (page itself returned 404 on fetch; snippet only).
- The official API type list has `name` (the item name column, no value class), `people` (deprecated `person`, `team` merged into it), `status`, `date`, `timeline` — [column types reference](https://developer.monday.com/api-reference/docs/column-types-reference).
- Third-party guides describe adding Status, Date, Person by hand after creating a board — [search results](https://www.temperstack.com/learn/monday/create-first-board/) (low reliability, unfetched).

### Inferences
- For a single-user task manager, Name + Status + Priority(status) + Date/Timeline is the faithful minimal set; People is optional for one user.

### Gaps
- Exact column titles on a blank board ("Owner" vs "Person") and per-template columns (Project template Owner/Status/Priority/Due date/Timeline): no official page retrievable (support.monday.com 403).

## 2. Column types and "+" picker categories

### Takeaway
The API lists ~29 writable types. The UI picker groups them (Essentials etc.), but the group membership could not be verified from official pages.

### Cited Findings
- API type ids: button, checkbox, color_picker, board_relation (Connect boards), country, date, dependency, dropdown, email, file, hour, link, location, long_text, doc, name, numbers, people, phone, rating, status, subtasks (Subitems), tags, text, timeline, time_tracking, vote, week, world_clock — [Column types reference](https://developer.monday.com/api-reference/docs/column-types-reference).
- Read-only types: creation_log, formula, item_id, last_updated, mirror, progress. auto_number is calculated and not in column_values. Deprecated: person, team. `integration` values cannot be set directly — same source.
- Write formats: `change_simple_column_value` (string) or `change_multiple_column_values` (JSON); per-type pages exist for status, people, date, timeline, dropdown, numbers, text, checkbox — same source.

### Inferences
- Essential for a single-user task manager: name, status, date, timeline, text/long_text, numbers, dropdown, tags, checkbox, file, link. Skip: people (or fixed single owner), mirror, board_relation, dependency, time_tracking initially.

### Gaps
- Official picker category names/membership (Essentials, Super useful, etc.) not retrievable.

## 3. Status and Priority labels

### Takeaway
Status defaults: Done (green), Working on it (orange), Stuck (red), plus an empty/blank label. Priority is just a status column with different labels; its default label set could not be confirmed from an official source.

### Cited Findings
- Default index/label/color: 0 blank gray #c4c4c4; 1 Done green #00c875; 2 Working on it orange #fdab3d; 3 Stuck red #e2445c; 4 custom blue #0086c0; 5 empty gray #c4c4c4. Mappings can be customized per board — [Status API docs](https://developer.monday.com/api-reference/docs/status).
- Read fields on StatusValue: index, label, text, is_done, label_style (color, border), value (e.g. `{"index":1}`) — same source.
- settings.labels entries (StatusLabel): id (stable, use for updates), label, color (enum, optional hex override), index (display position, changes on reorder), description, is_deactivated, is_done — same source.
- Writes: `{"status":{"index":1}}` or `{"status":{"label":"Done"}}`; `create_labels_if_missing: true` creates missing labels; clear with `{"status":null}`. Caveat: the "index" key actually takes the label id — same source.
- "Done" semantic is the per-label `is_done` boolean, not a fixed label — same source.
- UI: click a status cell, "Edit Labels" at bottom, change labels, Apply; "Customize Status column" in column menu chooses which labels count as done; account-wide default status labels exist, 40+ colors — [search snippets, TechRepublic](https://www.techrepublic.com/article/re-label-kanban-columns-monday-work-management/) and [support article 360001269685](https://support.monday.com/hc/en-us/articles/360001269685) (403 on fetch).
- A monday staff member said Priority is also a status column with predefined labels; sort order follows label order — [community thread](https://community.monday.com/t/priority-column-type/33249) (snippet only, fetch 404).

### Inferences
- Data model: one `status`-type column kind with labels[{id,label,color,is_done,description}] covers Status and Priority; a default-label-per-column field is needed.

### Gaps
- Default Priority labels and colors (Critical/High/Medium/Low is the common assumption but is NOT confirmed by any source I retrieved).
- How the "default label" for new items is set in the UI (community post on API default label exists: https://community.monday.com/t/create-status-column-using-api-with-custom-default-label/60261, not fetched).

## 4. Column management and settings (hide, pin, rename, permissions)

### Takeaway
Hide and pin are per-view UI features; columns have title and description; permissions are a separate feature I could not verify.

### Cited Findings
- Hide: columns can be hidden per board view and saved as a view — [Hiding columns](https://support.monday.com/hc/en-us/articles/360003384039) (snippet). Hidden state is a per-view setting, not a column property, and cannot be set via API — [community answer](https://community.monday.com/t/manage-columns-hide-or-show-check-if-hidden-using-api/121540) (snippet).
- Pin: "pin" icon in the board's three-dot menu freezes chosen item columns left; subitem columns cannot be pinned — [The basics of columns](https://support.monday.com/hc/en-us/articles/115005466609) and [community](https://community.monday.com/t/ability-to-pin-sub-item-columns/28451) (snippets).
- Column groups (vertical grouping) were launched — [community post](https://community.monday.com/t/just-launched-column-groups-for-vertically-grouping-columns/122312) (title only).
- Column object has `description`, `archived`, `width`, `settings`, `capabilities`, `revision`; `create_column` takes board_id, title, column_type, description, id (1-20 lowercase letters/underscores), defaults, after_column_id; `update_column` changes title, description, width, settings, type, id; `change_column_title`, `change_column_metadata` exist — [Columns API reference](https://developer.monday.com/api-reference/reference/columns).

### Inferences
- Reorder is expressed in the API by `after_column_id` at creation; no dedicated reorder mutation was seen.

### Gaps
- Required/validation, column permissions, "Column center", default values per column in the UI, delete/rename UI steps: no retrievable official source.

## 5. Developer API shape for a data model

### Takeaway
Column = {id, title, type, description, archived, width, settings(JSON)}; item values are polymorphic `column_values` typed by `type`; status settings hold a labels array.

### Cited Findings
- Column fields and mutations as in section 4 — [Columns API reference](https://developer.monday.com/api-reference/reference/columns).
- `settings` is dynamic JSON; valid properties per type come from the `get_column_type_schema` query; `defaults` in create_column is validated against that schema — [Columns docs](https://developer.monday.com/api-reference/docs/columns).
- On multi-level boards numeric, date, timeline, status columns are created with the calculated capability by default — same source (via search summary).
- Reads use typed fragments, e.g. `... on StatusValue { label index }`, `... on TextValue { text value }` — [Column types reference](https://developer.monday.com/api-reference/docs/column-types-reference).
- Legacy `settings_str` (JSON string with labels/colors maps) did not appear on the fetched pages; the current docs use `settings`.

### Inferences
- Suggested model: board_columns(id, title, type, description, archived, width, position, settings_json) plus item_values keyed by column id.

### Gaps
- Exact JSON for date/timeline/people/dropdown writes (per-type pages not fetched; tool-call budget).
