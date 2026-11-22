# Anytype: feature inventory, data model, encryption, API, licensing (as of Nov 2026)

Note: sources fetched via search/summarizer tools; some details come from third-party listings and are flagged. Sets/Collections/Views/Widgets/Daily-notes pages were only located, not read in full.

## 1. Object model and features

### Takeaway
Everything is an Object with a Type (blueprint), Properties (typed fields) and Links; organization is by relations, queries and views rather than folders. In 2026 Anytype merged Spaces and Chats into "Channels" and made Chats and media native objects.

### Cited Findings
- Everything is an Object (pages, tasks, people, images); each has a Type, Properties and Links to other objects; organized by relationships, not folders — [Objects](https://doc.anytype.io/anytype/create/objects.md)
- Type = blueprint; every object has exactly one Type, changeable later; built-in plus custom types; types are per-Space and not shared across spaces; Properties stay on an object when its type changes; Templates attach to Types; layout (page format) and header layout (Line/List) set in Type settings; Views include calendar and kanban — [Types](https://doc.anytype.io/anytype/organize/types.md)
- Docs index lists: Properties, Views, Queries ("surfaces information"), Collections ("hand-curated groupings of objects"), Templates, Inline Views, Advanced Filters, Formulas, Graph, Widgets, Deletion — [Docs sitemap](https://doc.anytype.io/anytype/sitemap.md)
- Editor: `/` command menu creates objects by type; Cmd/Ctrl+N new, Cmd/Ctrl+K search; any block can be converted to an object; images are objects linkable from many docs — [Objects](https://doc.anytype.io/anytype/create/objects.md)
- Graph view: nodes = objects; edges = editor links, property references, backlinks; toggles for titles/arrows/icons/orphans; filter by Type; title search highlights nodes — [Graph](https://doc.anytype.io/anytype/features/graph.md)
- Chats are objects inside a Channel (own system type, can have properties, views, collections, sidebar widget, can be @-mentioned); markdown text, mentions, attachments, reactions, threaded replies, pins, search; multiple chats per channel; direct (1:1) channels; no custom templates for chats; chats cannot be exported — [Chats](https://doc.anytype.io/anytype-docs/getting-started/chats)
- Desktop 0.55.0 (GitClear dates v0.55.0 to 29 Apr 2026): Spaces+Chats merged into Channels with Home = Chat, Page or Collection; per-object threaded Discussions; My Favorites vs Shared Pins; files/images/video/audio as standalone objects, folder drop creates a mirrored Collection; Bookmark layout (preview image, favicon, short URL); sidebar toggles Widgets vs Links; redesigned Bin; configurable offline-access threshold (Off, 20MB to Unlimited); visual refresh incl. new dark-mode palette — [0.55.0 notes](https://community.anytype.io/t/anytype-desktop-0-55-0-let-s-discuss/30672); [GitClear](https://www.gitclear.com/open_repos/anyproto/anytype-ts/release/v0.55.0)
- Community complaints on 0.55: deleting a Collection deletes its objects that have no other backlinks; some dislike new palette; image/video/audio missing in Create menu for some — [0.55.0 thread](https://community.anytype.io/t/anytype-desktop-0-55-0-let-s-discuss/30672)
- Release cadence about every two months (about six per year) per Feb 2026 update — [Blog Feb 2026](https://blog.anytype.io/february-community-update-2026/) (via search summary)

### Inferences
- Minimum viable model for Phibe: Object + Type + typed Properties + links/backlinks + saved queries/views. Daily notes appear only as a Type+template pattern in docs (non-English pages), not a dedicated feature page I could verify.

### Gaps
- Did not read Sets/Collections/Queries/Views/Widgets/Daily-notes/Formulas pages in full; exact property format list (text, number, date, select, multi-select, file, checkbox, URL, email, phone, object) not verified here.
- Exact latest app version in Nov 2026 not confirmed (APKMirror listing showed 0.49.0 uploaded Aug 2026 for Android, which is a different version track from desktop 0.55).

## 2. Local-first and encryption

### Takeaway
Data lives locally, E2E encrypted, synced as signed CRDT/DAG change logs through relay/backup nodes that cannot read content; identity is a locally generated key/seed phrase with no recovery by Anytype. Self-hosting and local-only modes exist.

### Cited Findings
- any-sync: local-first protocol syncing encrypted "spaces", P2P or via providers; data as DAGs (chats, pages, databases); signed changes; CRDT convergence without gas fees/consensus; separate ordered list for identity/ACL; files stored externally; works with any-store local object store; MIT license — [any-sync README](https://raw.githubusercontent.com/anyproto/any-sync/main/README.md)
- Node types: sync node, file node, consensus node (ACL validation), coordinator (network config) — [any-sync README](https://raw.githubusercontent.com/anyproto/any-sync/main/README.md)
- Objects encrypted at rest locally and on nodes; two encryption layers, AES CFB for data; key generated on device, never sent; no password reset or recovery; account is seed phrase, no email; local search indexes are unencrypted and never synced — [Data safety](https://doc.anytype.io/anytype-docs/advanced/data-and-security/how-we-keep-your-data-safe)
- Offline works fully; P2P sync over LAN; default network keeps encrypted backup in EU; only files count toward free storage quota; membership raises it; self-host and local-only alternatives; don't put data dir in Dropbox/Drive — [Sync & Backup](https://doc.anytype.io/anytype/data/sync-and-backup.md)
- Self-host stack: Docker Compose, ~1 GB RAM, coordinator (MongoDB), 3 sync nodes, filenode (Redis + Garage S3), consensus node, optional anytype-cli; upload generated client.yml in app; "suitable for personal" use; MIT — [any-sync-dockercompose](https://github.com/anyproto/any-sync-dockercompose)
- Middleware `anytype-heart` is a Go shared library used by clients, under Any Source Available License 1.0 — [anytype-heart](https://github.com/anyproto/anytype-heart) (language inferred from repo files)

### Inferences
- For Phibe (already local with Cognee/knowledge.db), replicating CRDT/E2E sync is not needed; if multi-device is wanted later, any-sync (MIT) is a reusable layer.

### Gaps
- Exact crypto primitives beyond "AES-CFB, two layers" and key derivation not verified.

## 3. API and MCP

### Takeaway
Desktop app exposes a local REST API (default http://127.0.0.1:31009) with bearer API keys and a dated `Anytype-Version` header; it supports read and write (create/edit/delete objects, search, types, properties, tags, templates, lists, files, chat). The official MCP server is generated from the OpenAPI spec and fails to start if the app/API is unreachable or the key is invalid.

### Cited Findings
- API ships with desktop app, works offline; auth via 4-digit challenge in app then bearer key; keys created in Vault Settings > API Keys; keys can edit and delete objects — [Local API doc](https://doc.anytype.io/anytype/features/integrations/local-api.md)
- API versions: 2025-11-08 (latest), 2025-05-20, 2025-04-22, v1, and pre-release v2 ("objects as editable JSON documents"); endpoint groups: Auth, Search, Spaces, Chat (13 endpoints), Files, Lists, Members, Objects, Properties, Tags, Types, Templates — [Developer portal](https://developers.anytype.io/docs/reference/)
- Default base `http://127.0.0.1:31009`; `anytype-cli` uses port 31012; official MCP: `npx -y @anyproto/anytype-mcp`, key in `OPENAPI_MCP_HEADERS` (`Authorization: Bearer`, `Anytype-Version: 2025-11-08`), tries v2 spec then falls back to v1; tools generated from OpenAPI; includes search, spaces, objects, lists, properties, tags, types, templates, dry_run, pagination, file download; excludes event streams and pairing/key mgmt; failure to connect or auth stops startup; `ANYTYPE_MCP_DEBUG=1` for logs — [anytype-mcp README](https://raw.githubusercontent.com/anyproto/anytype-mcp/main/README.md)
- Official MCP repo is MIT TypeScript; separate unofficial Qwinty/anytype-mcp exists; npm versions listed inconsistently across directories — [search listing](https://npmjs.com/package/@anyproto/anytype-mcp)
- 0.55 added "Anytype Agents' Skill" (open source, about 30 methods for coding agents) — [0.55.0 notes](https://community.anytype.io/t/anytype-desktop-0-55-0-let-s-discuss/30672); [doc page](https://doc.anytype.io/anytype/features/integrations/anytype-agents-skill.md)

### Inferences
- The "Connection closed" error seen in this session for the `anytype` MCP is consistent with: Anytype desktop not running or API not enabled, wrong port/base URL, missing/invalid API key, or missing/outdated `Anytype-Version` header; the server exits at startup rather than retrying, which clients report as CONNECTION_CLOSED. Not confirmed against the user's config.
- API is not read-only, so Phibe could mirror object CRUD via this API shape.

### Gaps
- Rate limits and exact auth endpoints not found; fetch of the 2025-11-08 introduction page returned 404.

## 4. Licensing

### Takeaway
Apps and middleware are source-available (Any Source Available License 1.0), not OSI open source; the any-sync protocol and server pieces are MIT.

### Cited Findings
- ASAL 1.0: license to use, modify, redistribute only for Non-Commercial Use (personal, academic, research, evaluation) or Commercial Use on "Allowed Networks" listed at networks.any.coop; can't relicense the Software itself; derivatives must carry same license; no sublicensing; terminates on violation or patent claim — [LICENSE](https://github.com/anyproto/anytype-ts/blob/develop/LICENSE.md)
- any-sync, any-sync-dockercompose, anytype-mcp are MIT — sources in section 2 and 3
- Community discussion reports a stated intent to move toward MIT over time (unverified, forum-level) — [community thread](https://community.anytype.io/t/privacy-sovereignty-and-direction-what-the-anytype-code-the-balderton-thread-and-the-governance-structure-actually-tell-us/30996); [Open philosophy](https://blog.anytype.io/our-open-philosophy/)

### Inferences
- Forking the frontend (anytype-ts) for personal, non-commercial use is allowed; a commercial product would need to run on Allowed Networks or get consent. Safest path for Phibe: copy UX ideas, not code; reuse MIT any-sync only if sync is needed.

### Gaps
- Not legal advice; exact current status of the "move to MIT" plan unverified.

## 5. Loved UX elements (what to copy visually)

### Takeaway
Few primary sources; evidence points to type icons, a clean block editor with `/` menu, flexible views, graph, and widget sidebar.

### Cited Findings
- Sidebar widgets with rich previews (or compact Links), type icons, kanban/calendar/gallery/list views, graph, `:` emoji search, per-type layouts and header layouts — [0.55.0 notes](https://community.anytype.io/t/anytype-desktop-0-55-0-let-s-discuss/30672), [Types](https://doc.anytype.io/anytype/organize/types.md), [Graph](https://doc.anytype.io/anytype/features/graph.md)

### Inferences
- Copy: type-icon + emoji identity per object, minimal chrome, dark palette, widget sidebar, object property header. Subjective; not backed by user-research sources.

### Gaps
- No sources found ranking "most loved" UX elements; this section is largely inference.

## 6. The 20% to replicate vs skip

### Takeaway (inference, based on sections 1-3)
Replicate: Objects + Types + Properties, links/backlinks, saved queries/views (list, kanban, gallery), templates per type, daily note via template, bookmarks and file objects, full-text search (Cmd+K), graph view (nice-to-have), sidebar widgets, local API/MCP for agents. Skip: CRDT/E2E sync and ACLs, multi-user spaces/permissions, chats/discussions (Phibe already has chat), membership/storage, custom self-hosted network, formulas, import/export of chats.

### Gaps
- No empirical usage data on which features matter most.
