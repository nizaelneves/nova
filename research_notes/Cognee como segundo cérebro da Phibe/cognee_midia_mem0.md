# Cognee multimedia ingestion and Cognee vs Mem0 division of roles (as of Nov 2026)

Note: Cognee docs describe a "v1.0" API (remember/recall/forget/update; add+cognify now "legacy"). All Cognee facts below come from docs.cognee.ai pages fetched in this session. Docs pages sometimes say "Not stated" for LLM usage of a loader; those are flagged as gaps.

## 1. Supported ingestion per content type (loaders, LLM needs, unsupported)

### Takeaway
Cognee v1.0 has built-in loaders for text/markdown, code, CSV, images (vision LLM), audio (transcription), and video (.mp4/.webm natively; .mov/.mkv/.avi/.m4v need ffmpeg), plus optional loaders (pypdf, unstructured, docling) for PDF/DOCX/etc. Media loaders are the only ingestion step that needs an LLM call beyond graph extraction. URLs are supported only as HTML web pages (not direct PDF downloads).

### Cited Findings
- Loader table (core vs optional):
  - TextLoader: .txt .md .json .xml .yaml .yml .log; no LLM at load time; stores content verbatim under a content-hash file name.
  - CodeLoader: 31 source extensions (.py .js .ts .go .rs .java ...); matched by extension only; no LLM or embedding calls; skips chunking/entity extraction/summarization; stored as `code_<content_hash>.<ext>`.
  - DltCsvLoader (default for .csv): builds row nodes from schema, no LLM extraction. CsvLoader (text flattening) only via `preferred_loaders=[{"csv_loader": {}}]`.
  - ImageLoader: png jpg jpeg gif webp bmp tiff heic avif psd etc.; requires vision-capable model; optional local OCR via `cognee[rapidocr]`.
  - AudioLoader: mp3 wav aac flac ogg m4a mid amr aiff; requires provider with transcription endpoint.
  - VideoLoader: .mp4/.webm no ffmpeg; .mov/.mkv/.avi/.m4v need system ffmpeg (extracts audio track); needs transcription model; transcripts carry inline timestamps that survive chunking and stay searchable.
  - PyPdfLoader (default PDF, needs `cognee[docs]`/pypdf); AdvancedPdfLoader (only via preferred_loaders; needs poppler + tesseract); UnstructuredLoader for docx/doc/odt/xlsx/pptx/rtf/html/eml/epub (`cognee[docs]`); DoclingLoader catch-all (`cognee[docling]`, `docling-full` for PDFs/images); BeautifulSoupLoader for HTML (`cognee[scraping]`, only via preferred_loaders).
  — [Loaders reference](https://docs.cognee.ai/core-concepts/further-concepts/loaders.md)
- Multimedia flow: audio/image/video output becomes ordinary text, then the same chunking, entity extraction and summarization run, "building one graph across all files". Image default prompt extracts entities, attributes, relationships and visible text; `IMAGE_EXTRACTION_ENABLED=false` gives a short caption; `IMAGE_OCR_ENABLED=true` appends local OCR text (useful for dense screenshots/scans). Docs state no file size limits, cost or provider list. — [Multimedia guide](https://docs.cognee.ai/guides/multimedia-audio-image-processing.md)
- Input types accepted by add/remember: raw text, local files and directories (recursive), s3:// URIs (needs s3fs), upload objects, HTTP/HTTPS URLs. URLs are fetched as web pages, so a `.pdf` URL yields the HTML response, not the PDF. GitHub/GitLab repo URLs are shallow-cloned and indexed as a code graph. Open file handles are rejected. A bare path counts as file only if it exists, else stored as text. — [add](https://docs.cognee.ai/core-concepts/main-operations/add.md), [remember](https://docs.cognee.ai/core-concepts/main-operations/remember.md)
- `remember()` = add + cognify + improve in one call; `self_improvement=True` default (set False for lightest path); `run_in_background` supported; cost drivers are volume, chunk count, extraction/summarization, improve pass. — [remember](https://docs.cognee.ai/core-concepts/main-operations/remember.md)
- Notes in Markdown/TXT need no key for ingestion per the loader page ("local GLiNER extractor and local embedder" for TextLoader). — [Loaders](https://docs.cognee.ai/core-concepts/further-concepts/loaders.md)

### Inferences
- Practical preprocessing per type for Phibe: md/txt -> direct. PDF -> pypdf default, but scanned PDFs need AdvancedPdfLoader (tesseract/poppler) or docling. DOCX -> needs `cognee[docs]`. Photos -> vision LLM (+ rapidocr for text-heavy). Audio -> needs a provider with transcription endpoint; if the chosen LLM provider (e.g. a local one) lacks it, transcribe externally (Whisper) and ingest the transcript as text. Video -> mp4/webm directly, others need ffmpeg installed on the user's machine (Windows install burden). Direct PDF URLs: download the file yourself, then ingest the file.
- Because a note-taking app likely stores Portuguese and English text, language handling relies on the LLM/embedder chosen; the docs fetched say nothing about language-specific behavior.

### Gaps
- Which LLM providers actually support Cognee's transcription/vision paths, per-file size limits, and cost: not stated in the docs.
- "LLM usage: Not stated" for PDF/Unstructured/Docling/BeautifulSoup loaders; I did not verify in source code.
- Whether the Kuzu/LanceDB "local" stack mentioned by a third party is the current default was not verified in Cognee docs.

## 2. Where raw files live vs graph/vector index; can original media be referenced for a gallery

### Takeaway
Cognee copies ingested files into its own storage (under DATA_ROOT_DIRECTORY, content-hash naming) and keeps a relational `Data` record with stable UUID, filename, MIME type, extension, size, content hash and optional label/external_metadata. Raw files are kept on disk even after `forget()`. So you can serve originals for a gallery, but the graph holds only derived text; keep your own app-side mapping (e.g. `data_id` <-> your media id) for reliability.

### Cited Findings
- Files are saved to Cognee storage and converted to text; text files renamed `text_<md5>.txt`; uploaded source files go under `<content_md5>/<original_filename>`; refers to `DATA_ROOT_DIRECTORY`. Each record gets a random UUID stable for the document's lifetime; filename, MIME, extension, size, content hash kept as metadata. — [add](https://docs.cognee.ai/core-concepts/main-operations/add.md)
- `DataItem` with `label` and `external_metadata` stored on the `Data` record, "not graph structure". — [add](https://docs.cognee.ai/core-concepts/main-operations/add.md)
- `node_set` tags become NodeSet nodes linked by `belongs_to_set` edges and can scope later searches. — [add](https://docs.cognee.ai/core-concepts/main-operations/add.md)
- forget(): raw files are "Kept" in every mode (single item, dataset, everything, memory-only); bytes can persist on disk. — [forget](https://docs.cognee.ai/core-concepts/main-operations/forget.md)
- Mem0, by contrast, stores only extracted textual facts, not the original file. — [Mem0 multimodal](https://docs.mem0.ai/features/multimodal-support)

### Inferences
- Gallery design: store media in the app's own folder (source of truth), pass the path to Cognee, and record `data_id` returned/looked up for it in the app DB. Use `label`/`external_metadata` to carry your note/media ID. Cognee's internal copy is a duplicate (disk cost x2) and is not guaranteed deleted when you delete the doc; app must clean up its own copies.
- For "graph node with image thumbnail", the node reachable by retrieval is a document/chunk/summary of the image's description, so mapping chunk -> Data -> your media id needs the `data_id`/metadata path.

### Gaps
- Exact `raw_data_location` column name/API to read the stored path: the data-points doc URL returned 404; not verified. Check source/API ("list data in dataset") before relying on it.
- Whether the image-derived graph nodes keep a back-reference to the file at node level: not documented in pages I read.

## 3. Mem0 vs Cognee: purposes, data models, retrieval, overlap, integrations, pitfalls

### Takeaway
Mem0 = short, fact-style memory about users/agents extracted from conversations (add/search). Cognee = knowledge engine building a graph + vector index from documents/media. They are positioned as alternatives by vendors, but a third-party comparison calls them complementary (Cognee for document corpus, Mem0 for runtime personalization). I found no official runtime integration, only a one-way Cognee-side Mem0 import adapter.

### Cited Findings
- Mem0 organizes memories by user, agent, app and run; "distills" conversations into facts and links entities. — [Mem0 overview](https://docs.mem0.ai/overview)
- Mem0 OSS v3: single-pass ADD-only extraction (one LLM call, no UPDATE/DELETE); new facts stored alongside old, retrieval ranks current info first; graph memory removed from OSS (now a Platform feature); entities stored in a parallel `{collection}_entities` vector collection; hybrid search = semantic + BM25 + entity score; defaults top_k 20, threshold 0.1, rerank False. — [Mem0 OSS v2->v3 migration](https://docs.mem0.ai/migration/oss-v2-to-v3)
- A third-party review argues entity linking improves retrieval but is not a navigable knowledge graph. — [zby review](https://zby.github.io/commonplace/agent-memory-systems/reviews/mem0/) (listed in search results; I did not fetch it)
- Mem0 multimodal: images (URL/base64), mdx/txt, pdf_url; extracts text facts, stores no original file; requires `infer=True` (infer=False + multimodal -> HTTP 400). — [Mem0 multimodal](https://docs.mem0.ai/features/multimodal-support)
- Vectorize comparison (Mar 15, 2026; author sells competitor Hindsight, treat comparative/benchmark claims cautiously): Mem0 = vector + graph dual store (graph only on Pro $249/mo per article, which conflicts with the v3 docs above stating graph is a Platform feature and removed from OSS); Cognee = pipeline ingest/process/store/query with 30+ connectors, hybrid graph+vector at every tier; "complementary rather than direct competitors: Cognee builds knowledge layer from document corpus while Mem0 handles runtime personalization". — [Vectorize](https://vectorize.io/articles/mem0-vs-cognee)
- Cognee's own guide positions Mem0 as quickest standalone memory layer, less suited to multi-hop reasoning over structured knowledge; says nothing about combined use (vendor-authored). — [Cognee blog](https://www.cognee.ai/blog/guides/most-popular-memory-agents-developers)
- Cognee ships a Mem0 import path: `Mem0Source` + `cognee.remember()`; modes re-derive (default, LLM re-extracts), preserve (zero LLM calls, facts mapped directly, then run cognify), hybrid. Only combined pattern documented is a one-time migration via `MemoryClient.get_all()`. — [Cognee migrate-from-mem0](https://docs.cognee.ai/examples/migrate-from-mem0.md)

### Inferences
- Overlap: both embed text into a vector store and call an LLM for extraction. Running both on the same text means double LLM extraction and double embedding cost, and two stores that can disagree. Avoid feeding the same note to both.
- Pitfall with Mem0 v3 ADD-only: contradictory preferences accumulate (old and new coexist); needs app-side pruning or recency weighting. Cognee's `improve()` has a conflict review (see section 5) but that applies inside Cognee only.
- Separate vector stores/embedding models are fine as long as each system queries only its own index; do not mix embedding dimensions in one collection.
- Simpler alternative for a local-first app: Cognee alone could hold profile facts as small text notes in a dedicated dataset (session/`node_set` scoping), dropping Mem0. Whether Cognee session memory matches Mem0 quality was not evaluated.

### Gaps
- No official Mem0+Cognee runtime integration or community example found (searched; only migration adapter and vendor comparisons).
- Mem0 data-model detail and current graph behavior on the Platform: docs overview page did not cover them; conflicting third-party pricing claim not reconciled.
- No independent benchmark of either tool for Portuguese content.

## 4. Recommended routing for a personal assistant

### Takeaway
Route by content shape: user-authored/imported documents and media (notes, PDFs, photos, audio, web pages, code) go to Cognee; short, conversational, stable-about-the-user facts (name, preferences, habits, tone, current goals) go to Mem0. Never send the same payload to both.

### Cited Findings
- Cognee suits shared knowledge bases built from documents; Mem0 suits conversational memory/personalization. — [Vectorize](https://vectorize.io/articles/mem0-vs-cognee) (vendor-biased source)
- Mem0 extracts only facts and keeps no original file; Cognee keeps raw files and builds one graph across files. — [Mem0 multimodal](https://docs.mem0.ai/features/multimodal-support); [Multimedia guide](https://docs.cognee.ai/guides/multimedia-audio-image-processing.md)

### Inferences (proposed table)
| Content | Destination | Why |
|---|---|---|
| Notes (md/txt), PDFs, DOCX, web pages, code, CSV | Cognee dataset(s) | Document knowledge, editable via update(), source file retained |
| Photos, audio, video | Cognee (vision/transcription loader) after app stores original | Becomes text + graph; app keeps the gallery |
| "I prefer short answers", "I live in X", "my sister is Ana" from chat | Mem0 | Small facts, per-user scope, cheap `search` per turn |
| Chat transcripts | Mem0 for extracted preferences; optionally Cognee session memory for episodic recall | Avoid indexing raw chats in both |
| Facts the user states that are really knowledge ("project Y deadline is..."") | Prefer Cognee note | Needs provenance/edit/delete tied to a document |
- Per turn: query Mem0 (profile) + Cognee recall (knowledge) in parallel, merge with source labels; give the model Mem0 facts as "user profile" and Cognee hits as "evidence".
- Option to cut complexity: start with Cognee only; add Mem0 only if profile personalization proves valuable (YAGNI).

### Gaps
- No documented reference architecture combining both; this routing is my design inference.

## 5. Incremental updates: edit, delete, versioning, graph consistency

### Takeaway
Cognee supports one-document update (`update()` with `data_id` + `dataset_id`, default chunk-level diff, falling back to full rebuild) and `forget()` for item/dataset/everything with shared-node protection. Plain re-add of changed content is refused (409), so the note editor must call update, not add. No document versioning/history is documented; Mem0 v3 is append-only, so edits to Mem0 memories accumulate.

### Cited Findings
- `add()` dedups by (dataset_id, owner_id, tenant_id, content_hash); identical content in same dataset = no-op; changed content at same path = refused (DocumentUpdateRequiredError, HTTP 409); use update(). Dedup is "a lookup, not an identity." — [add](https://docs.cognee.ai/core-concepts/main-operations/add.md)
- `update()`: exactly one document per call, never creates one; unknown data_id -> 404 (UpdateTargetNotFoundError); doc keeps its `data_id`; default `chunk_level_diff=True` re-ingests only changed chunks; falls back to full rebuild on first ingestion, changed node_set/metadata or content type; full rebuild = `forget(memory_only=True)` (drops doc's nodes/edges/embeddings, keeps entities shared with other docs) + re-add under same id + re-run cognify on the dataset; returns status incremental/unchanged/full_rebuild/failed; failed rebuild leaves old content with no graph until next cognify(). Remote mode: PATCH /api/v1/update; path strings are uploaded as literal text, so send a file object. — [update](https://docs.cognee.ai/python-api/update.md)
- `forget()`: single item (data_id+dataset), dataset, everything, memory-only variants; cognee records which nodes/edges each document produced; nodes owned only by removed doc deleted, nodes shared kept; raw files kept; forget uses no LLM/tokens; re-cognify after memory-only forget costs tokens; LanceDB keeps deleted rows until compaction, Ladybug graph file has no user-facing compaction; session-cache cleanup best-effort. — [forget](https://docs.cognee.ai/core-concepts/main-operations/forget.md)
- `improve()` conflict review: sources tagged with `effective_date`; disagreements stored as `FactConflict` nodes; facts get status current/superseded/conflicting; per-dataset watermark so only changed entities re-reviewed. Page does not address edited notes. — [fact-validity](https://docs.cognee.ai/guides/fact-validity.md)
- Incremental loading is on by default; to force re-processing use `incremental_loading=False`, `data_cache=False`. — [add](https://docs.cognee.ai/core-concepts/main-operations/add.md)
- Mem0 OSS v3 no longer issues UPDATE/DELETE in `add()`; new facts stored alongside old. — [Mem0 migration](https://docs.mem0.ai/migration/oss-v2-to-v3)

### Inferences
- Note editor flow: first save -> remember/add with `DataItem(label=note_id, external_metadata)` and store returned/looked-up `data_id`; each later save -> `update(data_id, dataset_id, new_text)`; delete note -> `forget(data_id, dataset)` and delete the app's own file copy (Cognee keeps its copy). Debounce saves (autosave per keystroke would trigger LLM re-extraction on changed chunks), and handle `status="failed"` with a retry queue.
- Keep one dataset per workspace/notebook so full-rebuild cognify scope stays small; update's rebuild re-runs cognify on the dataset, so cost scales with dataset size in the fallback case.
- Versioning/history of notes must live in the app (git-like snapshots); Cognee only holds current content.
- Keep a periodic consistency check: compare app note hashes to Cognee `Data.content_hash`.

### Gaps
- No documented document-version history in Cognee.
- Whether orphan entity nodes (left with no remaining source) are always cleaned after chunk-level update: docs say shared nodes are kept and ownership cleared; edge cases not verified.
- No GitHub issues reviewed (search did not surface relevant ones); real-world reliability of update() unverified. A release note "v1.5.0.dev3" appeared in search results but was not read.
