# Monday.com board views (official docs research, as of Nov 2026)

Note on access: support.monday.com article pages returned HTTP 403 to the fetch tool, so help-center content below comes from search-result summaries of the official pages plus third-party guides (marked). Developer docs were fetched in full.

## 1. What each view type shows, settings, and required data

### Takeaway
The default is the Main Table. Other views are Kanban, Calendar, Gantt, Timeline, Cards, Form, Files Gallery, Map, plus dashboard-style widget views (Chart, Numbers, Workload, Battery). Several need specific columns (Kanban needs Status, Workload needs People plus a date/timeline column).

### Cited Findings
- Main Table is the default view of a board, showing all columns and items; up to 100 board views per board; "More views" opens the Views Center; views can be reordered from the views dropdown — [monday support: The board views](https://support.monday.com/hc/en-us/articles/360001267945-The-board-views) (via search summary)
- Third-party apps' board views open as tabs under the board title — [same article summary](https://support.monday.com/hc/en-us/articles/360001267945-The-board-views); [developer docs](https://developer.monday.com/apps/docs)
- Kanban: tasks grouped by status labels and assigned to people; requires a People column and a Status column; split-screen option in Settings — [SimonSezIt (third party)](https://www.simonsezit.com/article/types-of-views-on-monday-com/)
- Cards: item details as separate gallery-style cards — [SimonSezIt](https://www.simonsezit.com/article/types-of-views-on-monday-com/)
- Timeline: project timelines, board view or dashboard widget — [SimonSezIt](https://www.simonsezit.com/article/types-of-views-on-monday-com/)
- Gantt: project schedule with milestones and dependencies; usable as board view or dashboard widget — [SimonSezIt](https://www.simonsezit.com/article/types-of-views-on-monday-com/)
- Calendar: items placed by date; display by month, week, or day; Calendar is one of the views available on mobile — [SimonSezIt](https://www.simonsezit.com/article/types-of-views-on-monday-com/); [support](https://support.monday.com/hc/en-us/articles/360001267945-The-board-views)
- Workload: team members' workload over time; needs a People column and a date/timeframe column; weekends includable/excludable; status or dropdown columns can track non-people resources — [SimonSezIt](https://www.simonsezit.com/article/types-of-views-on-monday-com/)
- Chart: reports/analytics, can aggregate across boards; Numbers: totals/average/currency of Numbers columns; Battery: overall status graphic from chosen status column(s) — [SimonSezIt](https://www.simonsezit.com/article/types-of-views-on-monday-com/)
- Form: custom forms that feed items into the board; Map: items by location — [SimonSezIt](https://www.simonsezit.com/article/types-of-views-on-monday-com/)
- Split screen: show a view above the Main Table (Settings > Display type > Split Mode); board owners can set a default view from the view's three-dot menu — [SimonSezIt](https://www.simonsezit.com/article/types-of-views-on-monday-com/)
- Newer: List View can map board-specific columns (May 25, 2026); Sidekick can generate reporting board views and charts (May 17 / Jun 11, 2026); board views in managed templates sync to all instances (Mar 30, 2026) — [monday What's New](https://monday.com/whats-new)
- API view settings are type-specific JSON; table settings include `columns` with `column_properties` (`column_id`, `visible`) — [Board views API](https://developer.monday.com/api-reference/reference/board-views)

### Inferences
- Per-view settings to model in Phibe: filter, sort, visible columns (table), group-by/lane column (Kanban), date column(s) (Calendar/Gantt/Timeline), people+date columns (Workload), card fields (Cards).

### Gaps
- Official per-view setting lists (group by, sort per view for Kanban/Cards) not retrievable (support site 403). Plan availability per view not found.

## 2. Files Gallery

### Takeaway
Files Gallery aggregates all files on the board in one view (also usable as a dashboard widget), with grid or list layout. It does not show cloud-linked files (Dropbox, Google Drive, monday Docs).

### Cited Findings
- Gathers a board's files into one place as a gallery-like view or dashboard widget; grid/list format — [Files Gallery support article](https://support.monday.com/hc/en-us/articles/360001264249-The-Files-View) (via search summary)
- Files from cloud systems (Dropbox, Google Drive) and monday Docs are not supported in the gallery — same article; community requests confirm: [community](https://community.monday.com/t/add-monday-docs-directly-to-file-gallery-and-allow-monday-docs-created-in-file-columns-to-show-up-in-file-gallery/38851)
- Add via "Add view" (+) > File gallery — [Guideflow (third party)](https://www.guideflow.com/tutorial/how-to-add-the-files-gallery-view-to-a-board-in-mondaycom)
- Files can come from the view itself, the Updates section, or a Files column — [SimonSezIt](https://www.simonsezit.com/article/types-of-views-on-monday-com/)
- Community thread asks to turn off Files Gallery or make it display only Files-column files, implying it mixes sources — [community](https://community.monday.com/t/turn-off-files-gallery-or-make-it-display-from-files-columns/27350) (title only)
- API caveat: Files Gallery did not appear in `views` query results — [dev community](https://developer-community.monday.com/api-apps-framework-4/board-views-not-being-able-to-get-all-views-1027)

### Inferences
- For Phibe: gallery should index File-column files plus update attachments, grid/list toggle, link to source item.

### Gaps
- Filters, preview behavior and upload flow details not confirmed from official text.

## 3. Feed view (new)

### Takeaway
I found no official evidence of a board view named "Feed". The only official "feed" is the account-level Update Feed; board-level equivalents are the Updates widget (dashboard) and the activity log.

### Cited Findings
- Update Feed: all new updates from subscribed boards/items and mentions; tabs All Updates, I Was Mentioned, All Updates of Your Account, Bookmarked; Feed Settings to hide/show per board — [support article](https://support.monday.com/hc/en-us/articles/115005309885) (via search summary)
- Board Updates Widget surfaces updates from selected boards — [support](https://support.monday.com/hc/en-us/articles/360002328919-Board-Updates-Widget)
- Community workaround: blank board view + updates widget — [community](https://community.monday.com/t/dashboard-or-mirror-for-board-updates/73757)
- Activity log stores board events, not updates — [community](https://community.monday.com/t/activity-logs-and-updates/16854)
- 2026 release notes/What's New show no Feed view — [monday What's New](https://monday.com/whats-new) (page truncated, so not conclusive)
- Updates queryable via API at root, or nested in boards/items — [Updates API](https://developer.monday.com/api-reference/reference/updates)

### Inferences
- "Feed" is likely the user's own concept (or an unreleased/rolled-out feature); design as aggregate of updates/comments, file uploads and activity events with filter by item/person/type and a post box.

### Gaps
- Layout, filtering and posting of a native Feed view unverified.

## 4. View lifecycle (create, rename, duplicate, reorder, delete, filters)

### Takeaway
Views are added via "+"/Views Center, managed from each view's menu (rename, duplicate, delete), reordered via dropdown. Filter and sort are stored on the view object.

### Cited Findings
- View menu offers rename, duplicate, lock, delete; deleted views can be restored — [Guideflow](https://www.guideflow.com/tutorial/how-to-delete-a-view-in-mondaycom), [restore](https://www.guideflow.com/et-ee/tutorial/how-to-restore-a-deleted-view-in-mondaycom) (third party)
- API: `create_view`, `update_view`, `delete_view`; `duplicate_view` and `restore_view` from API 2026-10; `is_pinned` from 2027-01 (pinning needs owner/admin) — [Board views API](https://developer.monday.com/api-reference/reference/board-views)
- View fields: `id`, `name`, `type`, `access_level` (edit/view), `settings`, `filter` (ItemsQueryGroup), `sort` (column_id+direction), `filter_user_id`, `filter_team_id`, `source_view_id`, `tags` — same page
- ViewKind enum for creation: APP, DASHBOARD, FORM, TABLE — same page
- "Save to this view" button saves a filter to a view (older thread, possibly outdated) — [community](https://community.monday.com/t/views-or-save-filters/933)
- Main table described as the default view; undeletable status not explicitly confirmed in sources found.

### Gaps
- Explicit "main table cannot be deleted" statement not found.

## 5. Hierarchy

### Takeaway
Workspace > board > group > item > subitem; board is the project.

### Cited Findings
- Not confirmed from fetched sources in this session (the boards API reference exists: [Boards API](https://developer.monday.com/api-reference/reference/boards)); stated from general knowledge only.

### Gaps
- No fetched citation for the hierarchy; verify at developer.monday.com/api-reference/docs/boards.
