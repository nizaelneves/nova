# monday.com UI: views, columns, item card (browsing notes, Nov 2026)

Method: opened monday.com marketing page and support.monday.com articles in the built-in browser (no login, cookie banner ignored, nothing submitted). The live product UI is login-gated, and monday's public marketing pages are generic (AI copy only). So UI labels below come from the official Help Center text (pages read in full via the browser; WebFetch gets 403 on support.monday.com). Only 2 screenshots were saved (screens/); the Help Center screenshots are images inside articles and were not capturable as files, so layouts are described from article text. Items marked UNVERIFIED were not confirmed on an official page.

## Hierarchy and left sidebar

### Takeaway
Account > Workspace > (Folder > Sub-folder) > Board/Dashboard/Workdoc; inside a board: Groups > Items > Subitems, with Columns spanning the whole board. The board is the project/list container.

### Cited Findings
- Highest level is the workspace; boards, dashboards and workdocs must live in one. A new account has one "Main Workspace". Workspaces can be Open or Closed. Folders and sub-folders organize boards. — [Structural hierarchy](https://support.monday.com/hc/en-us/articles/7278527605906-Understanding-monday-com-s-structural-hierarchy)
- Inside a board: Groups (color-coded sections, e.g. a week, step, client), Items (rows), Columns, Subitems (an extra level under an item). — same source
- Columns are board-wide; a column cannot be added to just one item or group. Subitems can have their own columns. Limits: 500 columns per board. — [Basics of columns](https://support.monday.com/hc/en-us/articles/115005466609-The-basics-of-columns)
- Left pane has a "+ Add" button -> "New board" (also import from Excel/Google Sheets/Trello, templates, or AI prompt that creates board with columns, an AI column and 5 example items). Boards can be starred (Favorites) via dropdown arrow next to board name. Board description (max 1,000 chars) is under the same dropdown arrow. — [Basics of a board](https://support.monday.com/hc/en-us/articles/115005317249-The-basics-of-a-board)
- Board top-right: avatars of who viewed last, Activity log, three-dot menu (Board settings, Discussion, Archive/Delete, More actions > Save as a template). Delete is recoverable 30 days, archive indefinitely. — same source
- Board types: main (all team members), shareable (external guests), private (invited only). — same source

### Inferences
- Phibe (single user): Workspace ~ top-level area, board ~ project; skip board types/permissions. Keep Groups > Items > Subitems.

### Gaps
- Exact visual look of the left sidebar (tree, icons) not captured; text only.

## View tabs and "Add view"

### Takeaway
Views are tabs under the board title, a "+" opens the add-view menu, "More views" opens the Views Center. Main table is the first tab.

### Cited Findings
- Add view: click the "+" right below the board title; up to 100 views per board; "More views" goes to the Views Center. Listed views: Blank, Table, Gantt, Timeline, Files Gallery, Map, Workload, Chart, Calendar, Form, Kanban, Cards, Pivot Boards. Apps Marketplace can add more. — [Board views](https://support.monday.com/hc/en-us/articles/360001267945-The-board-views)
- "Dashboard" is also selectable from the add-view menu (AI prompt block, Pro/Enterprise). — same
- Header can be collapsed (views reached via a dropdown arrow next to view name) or expanded (views as tabs). — same
- Per-view three-dot menu (right-click the tab if not on it): Lock view (Pro/Enterprise), Pin view (owner only, pinned views reorder only among pinned), Hide main table (owner/admin; needs at least one other view). Views are drag-reorderable, order saved per user. Deleted views restorable via Activity log "Undo". — same
- Export button top-right (Excel for table views only; Schedule PDF export). — same
- "Main table" is the default first view name; the view uses saved filters. Sidekick can create views for Table, Gantt, Calendar, Battery, Chart, Numbers widgets. — same
- Feed view: I found NO official evidence of a "Feed" board view. The official view list above has none. What exists is the account-level "Update Feed (Inbox)" with tabs All Updates / I Was Mentioned / All Updates of Your Account / Bookmarked Updates, last 6 months only — [Update Feed](https://support.monday.com/hc/en-us/articles/115005309885-The-Update-Feed-Inbox) (seen via search snippet, article not opened).

### Inferences
- The "Feed view (new)" the requester mentioned may be rolling out and not documented, or a mislabel of Update Feed/Activity log. Do not copy it as a view type without verifying in the product.

### Gaps
- Exact layout of the Add view popup (grid vs list, section headings, icons) not seen; only the view names. Feed view unconfirmed.

## Files Gallery view

### Takeaway
A board-wide gallery of all files (from Files columns and updates), in grid or list, with settings to filter sources.

### Cited Findings
- Add via the "+ Add view" control > "Files Gallery"; also a dashboard widget via "+ Add widget". Grid and List icons at upper right. Three-dot menu > "Settings": choose which Files columns to show, and files from updates, Files Gallery only, or both. In full screen: regular / Table / Split modes via display-type icon next to the settings cogwheel. Download all as zip (download icon upper right), per-file three-dot > "Download File", click file to enlarge. Cloud files (Dropbox, Google Drive, monday Docs) are not supported. — [Files Gallery View](https://support.monday.com/hc/en-us/articles/360001264249-The-Files-Gallery-View)
- Screenshot of article: screens/support-files-gallery-view-article.jpg

### Inferences
- For Phibe: a per-project "Files" tab with grid/list toggle and a source filter is enough.

### Gaps
- Actual gallery screenshot not captured.

## Default columns, add-column popup, column editing

### Takeaway
New blank board has Item + Person + Status + Date (unofficial source; names in newer UI may be Owner / Status / Due date, UNVERIFIED). The "+" at far right opens a quick dropdown with search and "More Columns" for the Column Center.

### Cited Findings
- Default board columns: a community post says Item, Person, Status, Date — [Community](https://community.monday.com/t/customize-the-default-board/102725) (user post, not official, via search snippet).
- Add column: "+" far right of the column header; pick from dropdown, search bar (AI suggests a column and labels from a description) or full Column Center via "More Columns". Also "Add column to the right" in an existing column's menu. — [Basics of columns](https://support.monday.com/hc/en-us/articles/115005466609-The-basics-of-columns)
- Column Center tabs/categories: Essentials (Status, People, monday doc, Numbers, Timeline, Date, Text, Connect Boards, Mirror); Super useful (Checkbox, Link, World Clock, Item ID, Phone, Location, Files); AI-powered (Translate, Summarize, Assign Labels, Custom AI Prompt, Sentiment Detection, Extract from File, Generate Docs, Improve Text, Write with AI, Extract Info, Summarize Updates, Prioritize with AI, Assign People); Team Power-Up (Tags, Vote, Rating, Creation Log, Last Updated, Auto-Number, Progress Tracking); Board Power-Up (Button, Dropdown, Week, Formula, Country, Color Picker, Time Tracking, Hour, Email, Dependencies); Combo (Date + Status, Timeline + Status, Timeline + Numeric); plus Marketplace apps, Managed columns, Column templates. Status, Label and Priority columns are the same label-based column differing only in purpose. — [Available column types](https://support.monday.com/hc/en-us/articles/115005310285-Available-column-types-on-monday-com)
- Column menu actions: add description, Show Column Summary, delete column, Duplicate (without content or with values), Collapse, save as column template, permissions, sort button above each column, resize by dragging the header edge, move by dragging the header, pin columns via board three-dot > pin icon, Header height (Single/Double/Triple, per user). Changing column type exists ("How to change a column type", article not opened). — [Basics of columns](https://support.monday.com/hc/en-us/articles/115005466609-The-basics-of-columns)

### Inferences
- Phibe minimum set: Text, Status, Priority (label), Person is moot (single user), Date, Timeline, Numbers, Checkbox, Link, Files, Tags, Dropdown. Hide AI/Combo/Power-Up tiers. A search box plus 3-4 category tabs is enough.

### Gaps
- Exact column header three-dot menu order of items not seen. Whether "Priority" is default-added is unconfirmed.

## Status/Priority label editing

### Takeaway
Click a status cell > "Edit Labels" at the bottom of the dropdown; edit text, color, order, add labels, then "Apply".

### Cited Findings
- Cell click > "Edit Labels" button at the bottom. Reorder, rename, recolor, add labels; up to 40 labels with different colors, 40+ colors; must click "Apply". The gray label is the default for new items (leave it blank). Label three-dots: "Add label description" (an "i" icon with hover tooltip), "Deactivate" (used labels cannot be deleted, only deactivated; deactivated labels grayed in settings, hidden from dropdown). Column three-dots > Settings > "Customize Status column": choose which colors mean "done". "Show column summary" (progress bar with done thumbnail or all labels). "+" in a status cell opens a status-specific comment shown in the item's Updates. Account admins can set default labels for new Status columns (Administration > Customization > Boards). — [Status Column](https://support.monday.com/hc/en-us/articles/360001269685-The-Status-Column)

### Inferences
- Copy: edit-labels modal with drag order, color swatch picker, "done" flag per label (better than color-based), deactivate instead of delete when in use, summary progress bar under group.

### Gaps
- Color palette exact swatches and layout not viewed.

## Item side panel / item card

### Takeaway
Clicking an item opens the Updates Section (side panel) with tabs Updates, Files, Activity Log; extra views (Item Card) can be added as tabs via "Add View".

### Cited Findings
- Tabs: Updates | Files | Activity Log (and Info Boxes in some setups) — [Community](https://community.monday.com/t/allow-details-pane-to-show-all-field-values-not-just-updates-files-activity-log-info-box-tabs/120002) (user post). Item Activity Log opens by clicking the first column of an item then the Activity Log tab; it tracks changes to the item, not updates. Files tab shows files from the Files column and Updates in one gallery. — [Item Card](https://support.monday.com/hc/en-us/articles/360017143959-The-Item-Card), search snippet of [Activity Log](https://support.monday.com/hc/en-us/articles/115005310745-The-Activity-Log)
- Item Card: from the Updates Section click "Add View" > Item Views Center > "Add to item" -> new tab. Card settings (three-dot > settings) tick which columns appear; widgets (Information, Connected boards, Subitems, Updates, Files Gallery, Item description, Text, etc.) are draggable and resizable; layout applies to all items of the board. — [Item Card](https://support.monday.com/hc/en-us/articles/360017143959-The-Item-Card)
- Item pop-up card (from Kanban, Gantt, Connect Boards, My Work): shows and edits all column fields of the item inline. — [Item pop-up card](https://support.monday.com/hc/en-us/articles/360001568919-The-item-pop-up-card)
- A user complaint says the card became a right-side sliding window and you cannot see the table columns and updates simultaneously (not official) — [Community](https://community.monday.com/t/item-card-layout-change-is-terrible/112766)

### Inferences
- Copy for Phibe: right slide-over with tabs Details (all columns, editable), Updates (notes/comments), Files, Activity; keep the board visible behind it.

### Gaps
- Live item panel not seen; tab labels from community, not official page.

## UX patterns worth copying (summary)
1. "+" tab under board title with search/list of views; cap views; per-view menu: lock, pin, rename, delete.
2. "+" at the end of column header opens quick list + search + "More columns"; "Add column to the right" in column menu.
3. Status cell: dropdown with "Edit Labels" footer, label color, order, description, deactivate-not-delete, "done" mapping, group summary bar.
4. Group-level column summaries.
5. Item panel with Updates/Files/Activity tabs; pop-up card from any view for inline editing.
6. Files Gallery: grid/list toggle, source filter in Settings.
7. Per-user view order, per-user header height.

Screens saved: C:/Projects/Jarvis/research_notes/Monday views e colunas padrão/screens/ (monday-homepage-ai-project-management.jpg, support-files-gallery-view-article.jpg).
