# UI building blocks, encryption at rest and packaging for a Second Brain (React 19 + TS + Tailwind 4 + FastAPI, local-first)

Date of research: 2026-11-14. Version, license, date and unpacked-size numbers marked [npm] / [PyPI] were read live from registry.npmjs.org and pypi.org on that date (unpacked size is NOT gzip/bundle size; no bundlephobia data was gathered).

## 1. Block editor (BlockNote, Tiptap, Lexical, Plate, Milkdown)

### Takeaway
BlockNote is the fastest path to a Notion-grade block editor (slash menu, drag handle, media blocks free, React 19 peer deps declared, MPL-2.0 core), but its markdown conversion is explicitly lossy, so store its JSON as source of truth. Tiptap core is MIT and has an official (but "early release") bidirectional markdown extension, but its polished Notion-like template is a paid Start-plan product. Lexical (MIT) and Plate (MIT) are viable but need more assembly.

### Cited Findings
- @blocknote/core 0.57.0, MPL-2.0, published 2026-10-30; @blocknote/react and @blocknote/mantine 0.57.0 MPL-2.0 with peer deps react "^18 || ^19" [npm] — https://registry.npmjs.org/@blocknote/react/latest
- @blocknote/xl-multi-column (and other xl-* packages: exporters, AI, multi-column) license is "GPL-3.0 OR PROPRIETARY" [npm] — https://registry.npmjs.org/@blocknote/xl-multi-column/latest
- BlockNote pricing page: core MPL-2.0 (free for commercial/closed-source); XL packages (AI, multi-column, exporters) dual-licensed GPL-3.0 or commercial; Community tier free; Business tier $195/month ($2,340/yr, shown with "-50%" off a $390 list); slash commands/menus included in free Community tier — https://www.blocknotejs.org/pricing ; commercial license text — https://www.blocknotejs.org/legal/blocknote-xl-commercial-license . Conflict: an earlier search snippet quoted Business at $390/month, and one older issue described XL as AGPL-3.0; current package metadata says GPL-3.0 — https://github.com/suitenumerique/docs/issues/769
- BlockNote markdown: import and export are both lossy; a minimal CommonMark+GFM subset parser (headings, lists, task lists, tables, code, quotes, links, images, emphasis, strike). Methods `blocksToMarkdownLossy()`, `tryParseMarkdownToBlocks()`. JSON (`editor.document`) is documented as the lossless storage format. PDF/DOCX/ODT/Email/Typst export are Pro (XL) — https://www.blocknotejs.org/docs/foundations/supported-formats
- BlockNote is built on Tiptap/ProseMirror, aimed at Notion-style, collaborative apps — https://dev.to/eddyter/10-best-tiptap-alternatives-in-2026-honest-comparison-327 (listicle, opinion); BlockNote core has Yjs-related peer deps (yjs ^13, @y/y ^14 rc) [npm].
- Tiptap: @tiptap/react 3.34.0, MIT, published 2026-11-13, peers react ^17/18/19; @tiptap/markdown 3.34.0 MIT [npm] — https://registry.npmjs.org/@tiptap/react/latest
- Tiptap Markdown docs: bidirectional (Markdown string <-> Tiptap JSON, MarkedJS-based); labeled "early release" that may change; limitations: comments unsupported, table cells hold one child node — https://tiptap.dev/docs/editor/markdown
- Tiptap pricing: editor is open source MIT and free; collaboration, AI, history, comments, UI Components are on the Start plan ($59/mo, $49/mo annual) — https://tiptap.dev/pricing
- Tiptap "Notion-like editor" template (slash menu, drag-and-drop blocks, floating toolbar, emoji, mentions, image upload) requires at least a Start plan for production use and refers to a Pro License — https://tiptap.dev/docs/ui-components/templates/notion-like-editor
- Lexical 0.53.0 MIT, @lexical/markdown 0.53.0 MIT, still pre-1.0 numbering [npm]; users include Meta, Bloomberg, Payload CMS, Supabase, Proton Docs — https://lexical.dev/docs/intro . Docs page does not state React 19 support or built-in slash/drag-handle (playground only is implied, unverified).
- Plate: platejs 53.5.2 MIT, @platejs/markdown 53.5.3 MIT, peers react >=18 [npm]; described as plugin system over Slate with shadcn-style copy-paste components — https://registry.npmjs.org/platejs/latest ; https://tooling-2ry.pages.dev/docs/categories/rich-text-editors/ (third-party list)
- Milkdown: @milkdown/kit 7.23.0 MIT [npm] — https://registry.npmjs.org/@milkdown/kit/latest . Markdown-native (remark-based) by design (my knowledge; not verified from a fetched page this session).
- Independent 2026 bundle-size/perf benchmarks of these editors: none found. Comparisons found are vendor blogs/listicles — https://velt.dev/blog/best-rich-text-editors-react-2026

### Inferences
- For Phibe (needs "very polished" + media blocks + free): BlockNote (core + @blocknote/mantine or shadcn UI) avoids paying for the editor UI; never import xl-* packages unless the project is GPL-3.0 compliant or pays. Need markdown on disk? Keep BlockNote JSON in the encrypted DB and export markdown on demand (lossy) for FTS/embedding text.
- If a lossless markdown file is a hard requirement (Obsidian-style vault), Milkdown or Tiptap+markdown are better fits than BlockNote; BlockNote custom blocks (typed objects, embeds) are the better fit for an Anytype/Capacities-style object model.
- Plate/Lexical give maximum control but cost the most assembly time; not recommended unless BlockNote/Tiptap prove limiting.

### Gaps
- Exact gzip bundle sizes per editor (no bundlephobia run).
- Whether BlockNote 0.57 passes cleanly on Tailwind 4 (Mantine theme vs shadcn variant) — untested.
- Plate docs fetch failed (HTTP 500); Plate slash menu/media details are from third-party listing only.
- Milkdown React 19 compatibility and current maintenance cadence not verified.

## 2. Graph visualization

### Takeaway
Sigma.js v4 + graphology (both MIT, WebGL) is the best fit for thousands of nodes with a polished look; react-force-graph-2d (MIT, canvas, d3-force) is the quickest to a pretty, interactive "graph view" for up to a few thousand nodes. Cytoscape.js is best for graph algorithms/layout variety; Reagraph (Apache-2.0, WebGL via three.js) is React-native and attractive but smaller community; G6 is heavy.

### Cited Findings
- sigma 4.0.6 MIT, published 2026-11-10; graphology 0.26.0 MIT [npm]; project run by Sciences Po medialab/OuestWare, ~12.2K GitHub stars, used by Gephi Lite, BloodHound — https://www.sigmajs.org/ ; https://registry.npmjs.org/sigma/latest
- Sigma describes GPU-accelerated rendering for large graphs; no benchmark numbers on the page — https://www.sigmajs.org/
- react-force-graph-2d 1.29.2 MIT (canvas, d3-force; 3D variant uses three.js/WebGL); repo ~3.4k stars, 218 open issues; no node-count guidance in README — https://github.com/vasturiano/react-force-graph
- cytoscape 3.35.0 MIT; @antv/g6 5.1.1 MIT (7.6MB unpacked); reagraph 4.32.0 Apache-2.0 [npm] — https://registry.npmjs.org/reagraph/latest
- Rough scale guidance: SVG workable to ~2k nodes, canvas ~5k, WebGL ~10k+ (2015-era benchmark, old hardware) — https://dev.to/timlrx/a-comparison-of-javascript-graph-network-visualisation-libraries-34a8 ; Cytoscape good to tens of thousands, Sigma better beyond 100k (blog claims) — https://medium.com/cylynx/a-comparison-of-javascript-graph-network-visualisation-libraries-ec9914b901e3 ; competitor (Ogma/Linkurious) claims Sigma struggles with 5k nodes using icons — https://doc.linkurious.com/ogma/5.3/compare/sigmajs.html (vendor bias)
- Cosmograph comparison page notes Sigma and react-force-graph lack GPU force simulation beyond ~50K points (vendor) — https://cosmograph.app/docs-lib/comparison/

### Inferences
- Second-brain graphs rarely exceed ~10k nodes: Sigma handles it with headroom and supports custom node programs (icons/colors per object type). Run force layout in a worker (graphology-layout-forceatlas2 worker) to avoid UI jank (my knowledge).
- react-force-graph-2d is a good v1 if time matters; migrate to Sigma if >3-5k nodes or label/icon rendering lags.

### Gaps
- No independent, current benchmark comparing these; I recommend a 5k/20k-node spike with real data.
- @react-sigma/core wrapper version/React 19 compatibility not checked.

## 3. Media viewing and backend thumbnails

### Takeaway
react-pdf 11 (MIT, React 19 only peer) over pdfjs-dist (Apache-2.0) for PDF; yet-another-react-lightbox (MIT) or PhotoSwipe (MIT) for images; Vidstack (MIT) or Plyr (MIT) for audio/video; backend thumbnails with Pillow (+ pyvips for speed) and ffmpeg.

### Cited Findings
- react-pdf 11.0.0 MIT, published 2026-09-10, peer react ^19 (drops older React) [npm] — https://registry.npmjs.org/react-pdf/latest
- pdfjs-dist 6.5.438 Apache-2.0, published 2026-11-01, 37.6MB unpacked (includes workers/cmaps/fonts; not what ships to the browser) [npm] — https://registry.npmjs.org/pdfjs-dist/latest
- yet-another-react-lightbox 3.33.0 MIT, peers React 16.8–19; photoswipe 5.4.4 MIT [npm] — https://registry.npmjs.org/yet-another-react-lightbox/latest
- @vidstack/react 1.15.7 MIT, peers react 18/19 (vidstack core 1.15.7); plyr 3.8.5 MIT [npm] — https://registry.npmjs.org/@vidstack/react/latest
- Backend libs: pillow 13.0.0 (MIT-CMU, Windows wheels, 2026-10-16); pyvips 3.2.0 MIT (needs libvips install, no Windows wheel from PyPI listing) [PyPI] — https://pypi.org/pypi/pillow/json ; https://pypi.org/pypi/pyvips/json
- cmdk 1.1.1 MIT (command palette), peers react 18/19 [npm] — https://registry.npmjs.org/cmdk/latest

### Inferences
- "sharp" is Node-only; in a FastAPI backend use Pillow (simple, wheels on Windows) for images, ffmpeg subprocess (`-ss` frame grab, poster) for video, pdfium/pdf.js or PyMuPDF for PDF first-page thumbnails (PyMuPDF is AGPL — check before use; not verified here). Cache thumbnails as encrypted blobs or in the encrypted store (see section 5).
- Markdown rendering: react-markdown + remark-gfm (my knowledge, versions not verified).

### Gaps
- ffmpeg license/bundling on Windows (GPL vs LGPL builds), PyMuPDF license/versions, react-markdown versions: not researched.
- Real bundle sizes (gzip) not measured.

## 4. Layout/UX patterns of beautiful second brains

### Takeaway
Common pattern: type-centric left sidebar (objects grouped by type, user-orderable, pinned sections), right-hand contextual panel (backlinks/properties), command palette, and collections rendered as table/gallery/kanban over object types with icon+color.

### Cited Findings
- Capacities: object types listed in left sidebar and reorderable; pinned sections of shortcuts to objects/types; right sidebar auto-switches to floating layout when space is tight; contextual backlinks released as a feature — https://docs.capacities.io/reference/user-interface ; https://capacities.io/whats-new/release-9 ; https://docs.capacities.io/tutorials/object-types-vs-folders
- Anytype: two-level sidebar (vault/channel), each section hideable/reorderable; types show in sidebar only if they have at least one object; users request a right sidebar for per-object info — https://doc.anytype.io/anytype-docs/getting-started/customize-and-edit-the-sidebar ; https://community.anytype.io/t/another-sidebar-on-the-right/1071?page=2 ; https://doc.anytype.io/anytype/organize/types
- No sourced material found on Tana's UI/design specifically.

### Inferences
- Implementation recipe: object `type` table (name, icon, color, property schema); Collections = saved query + view type (table/gallery/kanban/list); right panel = backlinks + properties + outline; cmdk for palette and quick capture (global shortcut = Tauri-only unless using a browser extension/PWA share target). Tailwind 4 CSS variables for per-type colors.
- Capture visual conventions (emoji/Lucide icon per type, soft tinted chips) from Capacities docs/screenshots; Notion/Tana patterns here are from my background knowledge, not sources.

### Gaps
- Notion and Tana UX sources not collected; no quantitative design research.
- Anytype MCP server failed to connect in this session (CONNECTION_CLOSED), so the user's own Anytype data was not consulted.

## 5. Encryption at rest

### Takeaway
SQLCipher via the sqlcipher3 Python package (Windows wheels, 0.6.5 released 2026-11-05) for the main SQLite DB (FTS5 works inside it), a random 256-bit master key stored via OS keychain (keyring -> Windows Credential Locker/DPAPI-backed) with a user-held recovery key/passphrase export, and age (pyrage) or libsodium/cryptography AES-GCM for media files and non-SQLite stores. Verify that the vector/graph stores are covered, since sqlite-vec compatibility with SQLCipher is unconfirmed.

### Cited Findings
- SQLCipher: 256-bit AES-CBC per page, random IV per page, HMAC-SHA512 integrity, PBKDF2-HMAC-SHA512 with 256,000 iterations default, per-database random salt, 4096-byte default page size — https://www.zetetic.net/sqlcipher/design/
- SQLCipher does not persist the key; Zetetic lists Windows Hello/DPAPI/TPM as storage options and has no turnkey Python solution — https://www.zetetic.net/sqlcipher/database-key-material/ ; https://www.zetetic.net/sqlcipher/sqlcipher-python/
- Python packages [PyPI]: sqlcipher3 0.6.5 (Windows win32/amd64/arm64 wheels, 2026-11-05) — https://pypi.org/pypi/sqlcipher3/json ; sqlcipher3-wheels 0.5.7 (2026-01-07), sqlcipher3-binary 0.6.0 (no Windows wheel listed); apsw 3.54.1.0 (2026-10-19, Windows wheels) — https://pypi.org/pypi/apsw/json ; the laggykiller sqlcipher3 fork — https://github.com/laggykiller/sqlcipher3
- keyring 25.7.0 MIT [PyPI]; on Windows it uses the Windows Credential Locker backend (size limits not documented on the page) — https://github.com/jaraco/keyring
- DPAPI binds data to the same user on the same machine, so DB cannot move to another profile/machine without re-key — https://glama.ai/mcp/servers/@john-walkoe/uspto_fpd_mcp/blob/40671c3f8fc6739af2ff477d2d334544af86c29e/src/fpd_mcp/secure_storage.py (third-party sample, low authority)
- File encryption libs [PyPI]: pyrage 1.4.0 (age, Windows wheel, 2026-08-23); pynacl 1.6.2 Apache-2.0; cryptography 50.0.2 Apache/BSD — https://pypi.org/pypi/pyrage/json
- sqlite-vec 0.1.9 (MIT/Apache-2.0, Windows amd64 wheel only, 2026-03-31) [PyPI]; lancedb 0.41.0; kuzu 0.11.3 MIT (2025-10-10, last release over a year old) [PyPI]; cognee 1.6.8 Apache-2.0 (2026-11-12) [PyPI]
- Third-party vector index project encrypts index files only at rest and decrypts into memory on load — https://coderdayton.github.io/SimpleVecDB/api/encryption

### Inferences
- Recommended layout: key hierarchy = random master key (32 bytes) in keyring; derive subkeys (SQLCipher raw key `x'...'`, file DEK wrapping). Raw hex keys skip PBKDF2 cost at open; per-open KDF cost with passphrase mode at 256k iterations is tens-to-hundreds of ms once at startup (my estimate, not measured here).
- Realistic overhead: Zetetic page states no numbers; commonly cited figure is single-digit to ~15% on typical workloads with AES-NI (my background knowledge, UNSOURCED, benchmark on your data).
- Recovery: show a 24-word or base32 recovery key once at setup; also allow an optional passphrase-wrapped copy. Losing keyring entry (Windows profile reset) = data loss without it.
- Vector/graph stores: the safest approach is to keep vectors in the same SQLCipher DB (sqlite-vec virtual tables store shadow tables in the DB file; needs a test), because LanceDB/Kuzu write their own unencrypted files. If using LanceDB/Kuzu, options are BitLocker/OS full-disk encryption, per-file age encryption at rest (decrypt to a temp dir = leak risk), or an encrypted-container approach. Cognee defaults would need checking for where it writes data.
- Existing project note (MEMORY): code signing/Defender is a release risk — bundling a native sqlcipher DLL and unsigned exe may trigger Defender heuristics.

### Gaps
- sqlite-vec + SQLCipher compatibility (loading extension into sqlcipher3 connection; Windows wheel of sqlcipher3 allows extension loading?) — no source found; must be tested by `strings` on the DB file.
- Measured overhead numbers; Windows Credential Locker per-secret size limit (~2.5 KB blob in my memory, unverified).
- Whether Cognee's stores (LanceDB/Kuzu/networkx) can be pointed at encrypted storage.
- FTS5 under SQLCipher: not in sources fetched (widely believed to work because encryption is at page layer).

## 6. Search UI: hybrid keyword + vector + graph

### Takeaway
Run FTS5 (BM25) and vector KNN as separate queries, take ~50 candidates each, fuse with Reciprocal Rank Fusion (k≈60) in Python or SQL, then optionally boost/expand with graph neighbors; present as a command-palette-style overlay with type-filtered, grouped results.

### Cited Findings
- RRF pattern with SQLite FTS5 + sqlite-vec, score = sum 1/(k+rank), k=60 — https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/ ; https://dev.to/soytuber/building-a-hybrid-rag-in-200-lines-sqlite-fts5-sqlite-vec-rrf-38h1
- 49,746-chunk Obsidian vault run with BM25 + vector + RRF in one SQLite file; advice: add RRF last, after each layer works alone — https://blakecrosley.com/blog/hybrid-retriever-obsidian
- arXiv paper (scrydb) evaluates FTS5 + sqlite-vec rank fusion on IR benchmarks — https://arxiv.org/pdf/2608.24060 (listed in search; not read in full; arXiv ID format suggests treat with caution)
- Conflict: llama-stack hybrid implementation described differently (keyword candidates first, then vector) — https://git.kvant.cloud/phoenix-oss/llama-stack-mirror/commit/eab85a712107229144e5ae8512760e82fdf68932

### Inferences
- Graph signal: after RRF, add a small boost for results linked to top-k hits (1-hop backlinks) or to the currently open object; UI shows "why matched" chips (keyword / semantic / linked). Cognee graph queries can be the third retriever; keep the fusion layer in FastAPI.

### Gaps
- Latency numbers for the target corpus; graph-fusion weights are untested.

## 7. Packaging: Tauri vs browser at localhost:8080

### Takeaway
Tauri 2 gives a native window, tray, global shortcuts (quick capture) and installer, but with a Python sidecar the size savings vs Electron shrink, and the project already tried and uninstalled a desktop app (per user memory). Browser-at-localhost keeps the single-process model and avoids WebView2/Defender/signing issues, at the cost of no native capture hotkey and an open local port.

### Cited Findings
- Tauri uses system WebView (WebView2 on Windows); one benchmark: 57 MB Tauri vs 323 MB Electron (Better Stack, July 2026) — https://betterstack.com/community/guides/scaling-nodejs/tauri-vs-electron-vs-deno-vs-electrobun/
- PyInstaller-frozen FastAPI sidecar ~35-40MB exe; one Tauri 2 + PyInstaller report ~71MB sidecar in an NSIS installer — https://aiechoes.substack.com/p/building-production-ready-desktop ; https://github.com/tauri-apps/tauri/issues/15134 (sidecar not replaced on reinstall, NSIS)
- WebView2 install modes: downloadBootstrapper +0 MB (default), embedBootstrapper +~1.8 MB, offlineInstaller +~127 MB, fixedVersion +~180 MB; WebView2 ships with Windows 10 (April 2018+) and 11; MSI (WiX v3, Windows-only) and NSIS formats — https://v2.tauri.app/distribute/windows-installer/
- @tauri-apps/api 2.12.4 Apache-2.0 OR MIT [npm]
- Retrospective lists platform-specific webview bugs (WebView2/WebKit/WebKitGTK) as a main pain — https://dev.to/johalputt/retrospective-6-months-of-using-tauri-20-for-desktop-apps-60-smaller-installers-20-more-13m4

### Inferences
- Keep browser-served localhost as the primary mode; if native features are needed later, a Tauri shell that spawns the same FastAPI as sidecar with a random port + per-launch token is incremental. Localhost security: bind 127.0.0.1, require a token/Origin check (other local processes can hit the port), important once data is encrypted — the DB key is in process memory.

### Gaps
- Tauri global-shortcut/tray plugin versions not checked; no measurement of this project's own build size.
