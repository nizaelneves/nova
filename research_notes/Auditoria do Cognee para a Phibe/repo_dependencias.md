# Cognee repo, dependencies and fit with the Phibe environment (as of 2026-11-14)

Method: read-only. Phibe files read: pyproject.toml, uv.lock (grep), .venv/pyvenv.cfg and .venv/Lib/site-packages dist-info names. Nothing was installed, run or edited. Cognee data came from PyPI JSON, raw pyproject.toml and the GitHub REST API (via WebFetch, which summarises pages; the PyPI requires_dist list was truncated at 100k chars and the pyproject was the cross-check).

## 1. Repo layout, license, core vs optional vs demo

### Takeaway
Cognee is an Apache-2.0 monorepo; the pip package `cognee` is only the `cognee/` directory, while MCP server, frontend, connectors, evals, worker and k8s/docker material live in sibling directories that are not part of the wheel.

### Cited Findings
- Top-level dirs: .agents, .claude, .devcontainer, .github, assets, bin, catalog, cognee-connectors, cognee-frontend, cognee-mcp, cognee-starter-kit, cognee, cognee_db_workers, deployment, distributed, docs, evals, examples, kuzu, licenses, logs, notebooks, scripts, tests, tools, working_dir_error_replication. Files include LICENSE, NOTICE.md, README.md, Dockerfile, docker-compose.yml, pyproject.toml, uv.lock, CLAUDE.md, AGENTS.md, SECURITY.md, DCO.md — [GitHub contents API](https://api.github.com/repos/topoteretes/cognee/contents/)
- License Apache-2.0; PyPI lists license_files LICENSE and NOTICE.md — [PyPI JSON](https://pypi.org/pypi/cognee/json). NOTICE.md: copyright 2024 Topoteretes UG (Berlin), no extra restrictions stated, third-party section is an unfilled template — [NOTICE.md](https://raw.githubusercontent.com/topoteretes/cognee/main/NOTICE.md) (fetched through a summariser; may be incomplete).
- cognee-mcp, cognee-frontend, cognee-connectors have separate release workflows (release_mcp.yml, release_connectors.yml, dockerhub-mcp.yml, dockerhub-ui.yml) so they ship separately from the core wheel — [workflows listing](https://api.github.com/repos/topoteretes/cognee/contents/.github/workflows)
- Optional "demo/heavy" pieces are extras, not core: `gliner` (gliner2[local], torch>=2.1,<3, protobuf, sentencepiece), `gliner-remote-grpc`, `gliner-remote-amqp`, `remote-worker-amqp`, `docling`/`docling-full`, `docs` (unstructured[...] , nltk), `huggingface`/`ollama` (transformers>=4.46.3,<6), `neo4j`, `neptune`, `postgres`/`postgres-binary` (psycopg2, pgvector, asyncpg), `turso`, `scraping` (playwright, lxml, APScheduler), `evals`, `dev`, `notebook`, `rapidocr`, `baml`, `instructor`, `redis`, `tracing`, `ontology` — [pyproject.toml](https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml)
- Postgres graph store is not a separate package: relational/vector via `postgres` extra (pgvector); graph default is the embedded Ladybug (Kuzu fork), vector default is LanceDB, relational default SQLite (aiosqlite + sqlalchemy) — inferred from core deps in [pyproject.toml](https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml); defaults not verified against README/config source.

### Inferences
- Core install = Ladybug + LanceDB + SQLite + fastembed/litellm, i.e. fully local, no server DB needed.

### Gaps
- Did not read README.md body, docs, or the `kuzu/` directory purpose, nor "gliner_demo" (not seen in top level; probably under examples or docs).
- Did not verify which store defaults apply at runtime.

## 2. Cognee pyproject: Python, core deps, extras, footprint

### Takeaway
Latest stable is 1.6.8 (2026-11-12), Python >=3.10,<3.15, with about 55 core dependencies, many with tight upper bounds. Base install has no torch; the heavy parts are onnxruntime, pandas, pyarrow/pylance, lancedb, dlt, litellm and fastembed.

### Cited Findings
- 1.6.8 is latest on PyPI, requires_python `<3.15,>=3.10`; wheel is pure Python (py3-none-any) 24,355,857 bytes (~24 MB), sdist ~42.8 MB — [PyPI 1.6.8 JSON](https://pypi.org/pypi/cognee/1.6.8/json)
- Recent releases: v1.6.5 (2026-10-16), v1.6.6 (10-29), v1.6.7 (11-06), v1.6.8 (11-12); roughly weekly patch cadence, though v1.6.5.dev0 and v1.6.6rc1 are flagged non-prerelease by GitHub — [GitHub releases](https://api.github.com/repos/topoteretes/cognee/releases?per_page=12)
- Core dependencies (verbatim constraints, [pyproject.toml](https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml), matches [PyPI requires_dist](https://pypi.org/pypi/cognee/json)):
  - pydantic>=2.13; pydantic-settings>=2.7.0,!=2.12.*,!=2.13.*,!=2.14.0,!=2.14.1,<3
  - fastapi>=0.116.2,<1; starlette>=0.48; uvicorn>=0.34,<1; gunicorn>=20.1,<24; python-multipart>=0.0.22,<1; fastapi-users[sqlalchemy]>=15.0.2
  - sqlalchemy>=2.0.39,<3; alembic>=1.13.3,<2; aiosqlite<1; dlt[sqlalchemy]>=1.9,<1.31
  - openai>=1.80.1; litellm>=1.102.2,<2; tiktoken>=0.8,<1; tokenizers>=0.22,<=0.23.0; huggingface-hub>=0.34,<1
  - lancedb>=0.39,<0.40; pylance>=12.0,<12.1; ladybug==0.22.3 (non-macOS; older macOS uses ladybug<0.18); networkx>=3.4.2,<4
  - fastembed>=0.9.1,<0.10; onnxruntime>=1.17 plus `<=1.23.2` for python<3.11 (and some macOS markers)
  - numpy>=1.26.4,<=4; pandas>=2.2.2,<3; pypdf>=6.6.2,<7; websockets>=15.0.1,<16; aiohttp>=3.13.5,<4; cryptography>=43,<51; urllib3>=2.6; certifi>=2026.10.19; rdflib>=7.1.4,<7.2; structlog<26; enola-cli==0.5.1; fakeredis[lua]; datamodel-code-generator; langdetect; cbor2; nbformat; pympler; limits; jinja2; dateparser
- torch appears only in the `gliner` extra; transformers only in `huggingface`/`ollama`/`docling-full` — same pyproject.
- Windows/macOS/Linux classifiers are listed on PyPI; no Python-version classifiers — [PyPI 1.6.8 JSON](https://pypi.org/pypi/cognee/1.6.8/json)

### Inferences
- Disk footprint of a fresh venv is probably several hundred MB to ~1 GB (onnxruntime, pyarrow/pylance, lancedb, pandas, litellm, dlt and their transitives); this is an estimate, not measured. No torch in the base path.
- Pure-Python wheel means the 24 MB is mostly bundled non-code assets; native wheels come from dependencies.

### Gaps
- Real install size not measured (no installs permitted). The PyPI requires_dist extras list beyond 100k chars was not read; extras taken from the pyproject.
- The exact ladybug/onnxruntime marker strings were truncated by the summariser.

## 3. Conflicts with Phibe's dependencies

### Takeaway
A shared venv would break. Phibe pins (via uv.lock) websockets 16.1.1, huggingface-hub 1.29.0, tokenizers 0.23.2 and an exact litellm 1.100.1, all outside Cognee's ranges. Resolution fails on at least four packages, and relaxing them would conflict with Phibe's security pin on litellm and with transformers 5.x.

### Cited Findings (Phibe side, local files, read-only)
- Phibe: `requires-python = ">=3.10,<3.14"`; venv is CPython 3.12.11 created by uv 0.12.17, no system site-packages — C:/Projects/Jarvis/pyproject.toml and C:/Projects/Jarvis/.venv/pyvenv.cfg
- Phibe pins `inference-litellm = ["litellm==1.100.1"]`, commented as an exact security pin (avoid 1.82.7/1.82.8); `mem0 = ["mem0ai>=2.2"]`; core deps include openai>=1.30, httpx>=0.27, websockets>=15.0.1, datasets>=4.5.0; `server`/`desktop` extras: fastapi, uvicorn, pydantic>=2, python-multipart, markitdown[pdf,...] — C:/Projects/Jarvis/pyproject.toml
- Locked versions in C:/Projects/Jarvis/uv.lock compared with Cognee 1.6.8 constraints:

| Package | Phibe lock | Cognee needs | Result |
|---|---|---|---|
| litellm | 1.100.1 (exact pin) | >=1.102.2,<2 | CONFLICT |
| websockets | 16.1.1 | >=15.0.1,<16 | CONFLICT |
| huggingface-hub | 1.29.0 | >=0.34,<1 | CONFLICT |
| tokenizers | 0.23.2 | >=0.22,<=0.23.0 | CONFLICT |
| pandas | 2.3.3 (lock); venv has 3.0.0 dist-info | >=2.2.2,<3 | lock OK; installed venv would conflict |
| onnxruntime | 1.23.2 (lock); venv has 1.24.2 | >=1.17 (<=1.23.2 only py<3.11) | OK on 3.12 |
| transformers (in lock) | 5.17.0 | extras only (>=4.46.3,<6) | needs hub>=1, clashes with Cognee hub<1 if both present |
| pydantic | 2.13.5 | >=2.13 | OK |
| pydantic-settings | 2.15.0 | not 2.12/2.13/2.14.0/2.14.1 | OK |
| fastapi / starlette / uvicorn | 0.141.1 / 1.6.0 / 0.53.0 | >=0.116.2 / >=0.48 / >=0.34 | OK |
| sqlalchemy | 2.0.48 (lock); 2.1.6 in venv | >=2.0.39,<3 | OK |
| openai | 2.21.0 | >=1.80.1 | OK |
| numpy | 2.2.6 | >=1.26.4,<=4 | OK |
| httpx | 0.28.1 | not constrained by Cognee | OK |
| aiohttp / cryptography / urllib3 / certifi | 3.14.3 / 50.0.1 / 2.6.3 / 2026.1.4 | <4 / <51 / >=2.6 / >=2026.10.19 | certifi lock too old, upgradable; others OK |
| networkx | 3.4.2 | >=3.4.2,<4 | OK |
| alembic / jinja2 / rdflib | 1.18.4 / 3.1.6 / 7.6.0 | <2 / <4 / >=7.1.4,<7.2 | rdflib CONFLICT (7.6.0 > 7.2) |
| python-multipart | 0.0.32 | >=0.0.22,<1 | OK |
| pypdf | not found as locked name (pypdfium2 5.14.0 in venv) | >=6.6.2,<7 | not checked; markitdown[pdf] uses pdfminer, so likely no overlap |
| mem0ai | 2.2.1 in venv | n/a | its transitive deps not inspected |

  Version sources: C:/Projects/Jarvis/uv.lock grep and C:/Projects/Jarvis/.venv/Lib/site-packages dist-info names.
- The installed venv differs from the lock in places (pandas 3.0.0 and sqlalchemy 2.1.6 installed vs 2.3.3 / 2.0.48 locked), so the venv was not synced with the lock.

### Inferences
- Phibe's uv.lock is universal and resolves all extras together; adding a `cognee` extra would make `uv lock` fail unless litellm, websockets, huggingface-hub, tokenizers and rdflib move down, which would downgrade `datasets`/`transformers` stacks and the litellm security pin. Not worth it.
- Phibe already has overlap in purpose: mem0 as memory layer; Cognee would be a second memory/graph engine.
- The rdflib row: I read lock rdflib 7.6.0; if rdflib is only a transitive that markitdown/others bring, uv could downgrade it, but this was not checked.

### Gaps
- Did not run the resolver, so the exact conflict set is derived by manual comparison.
- Transitive deps of Cognee's dependencies (fastembed -> onnxruntime, pillow, py-rust-stemmers, mmh3, loguru; dlt) not enumerated.
- Phibe lock may mark some of these under optional extras only; I did not check which extras pull them in.

## 4. Isolation strategy

### Takeaway
Run Cognee in its own venv/process (or Docker) as a sidecar and call it over HTTP; do not add it to Phibe's lock.

### Cited Findings
- Cognee ships a FastAPI app (fastapi, uvicorn, gunicorn, fastapi-users are core deps), a separate `cognee-mcp` package/image, a Dockerfile and docker-compose.yml — [pyproject.toml](https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml), [repo contents](https://api.github.com/repos/topoteretes/cognee/contents/)
- Phibe's own design already has import-linter contracts forbidding features from importing each other, so a network boundary fits — C:/Projects/Jarvis/pyproject.toml

### Inferences
- Same venv: pros are one process, no HTTP hop, simpler packaging; cons are unresolvable pins today (section 3), a pinned LanceDB/pylance/ladybug set that moves independently, the bigger Windows install, and risk to the litellm security pin. Not recommended.
- Separate venv, Cognee as sidecar (own Python 3.12 venv via `uv`, `cognee` API on localhost): pros are zero lock interaction, independent upgrade cadence (it releases weekly), crash isolation, can be disabled; cons are an extra process and ports to manage, auth between processes, a second ~1 GB-class venv, and Cognee's own litellm/openai keys config (.env) to sync with Phibe's providers.
- Alternative: Docker image from the repo. Cuts Windows wheel risks but needs Docker Desktop, which a desktop-app user base may not have.
- Alternative: cognee-mcp as the sidecar, which Phibe can already talk to if it has an MCP client (Phibe has `phibe.mcp`).

### Gaps
- REST endpoints and auth defaults of the Cognee API were not read; sidecar API stability is unverified.

## 5. Windows concerns

### Takeaway
No blocking issue found from the metadata, but native wheel availability on Windows and Defender behaviour are unverified.

### Cited Findings
- PyPI lists Microsoft Windows as supported OS — [PyPI 1.6.8 JSON](https://pypi.org/pypi/cognee/1.6.8/json)
- The repo has a `test_different_operating_systems.yml` workflow, which suggests Windows is CI-tested — [workflows listing](https://api.github.com/repos/topoteretes/cognee/contents/.github/workflows) (contents of the workflow not read)
- Cognee pins `ladybug==0.22.3` for non-macOS and onnxruntime caps (<=1.23.2) for Python <3.11 — [pyproject.toml](https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml). Phibe has the same kind of issue (onnxruntime<1.24 on py3.10, no cp310 wheel) — C:/Projects/Jarvis/pyproject.toml
- Phibe caps Python <3.14 because numpy 2.2.x has no cp314 Windows wheel; Cognee allows 3.14, but its pins (lancedb, pylance, ladybug) for cp314 Windows were not checked — C:/Projects/Jarvis/pyproject.toml

### Inferences
- Use Python 3.12 (Phibe's venv version) for the sidecar to stay in the best-supported wheel range; avoid 3.10 (the onnxruntime cap means older onnxruntime) and 3.14.
- Embedded DB files (LanceDB, Ladybug, SQLite) written by a new process may trigger Defender real-time scanning slowdowns; consistent with the Defender risk already in the user's release-risk notes, but not tested.
- Long paths: deep dependency trees (lancedb, dlt, datamodel-code-generator) plus data directories under a nested project path may exceed 260 chars; enable LongPathsEnabled or install near drive root. Not verified for this stack.

### Gaps
- No verification that ladybug 0.22.3, pylance 12.0.x and lancedb 0.39 publish win_amd64 cp312 wheels. Check with `pip download --only-binary=:all:` in a scratch dir before committing.
- No data on Defender false positives for ladybug/lancedb binaries.

## 6. Code-quality signals

### Takeaway
Very active, well-funded-looking project with heavy CI, but a large issue backlog and a concentrated contributor base.

### Cited Findings
- 33,310 stars, 3,512 forks, 1,124 open issues+PRs (GitHub open_issues_count includes PRs), created 2023-08-16, last push 2026-11-14 — [GitHub repo API](https://api.github.com/repos/topoteretes/cognee)
- 354 open PRs — [GitHub search API](https://api.github.com/search/issues?q=repo:topoteretes/cognee+type:pr+state:open&per_page=1)
- 2,795 commits since 2026-08-16 (about 90 days, ~31/day, includes automation and dev-branch merges) — [GitHub commit search](https://api.github.com/search/commits?q=repo:topoteretes/cognee+committer-date:%3E2026-08-16&per_page=1)
- Latest main commit "chore: bump mcp lock (#6701)" on 2026-11-13 — [commits API](https://api.github.com/repos/topoteretes/cognee/commits?since=2026-08-16T00:00:00Z&per_page=1)
- Top contributors by commit count: dexters1 3536, Vasilije1990 2984, siillee 909, hajdul88 714, ArmagedonFlamer 713, borisarzentar 577, lxobr 321, NMZivkovic 291, goran-radonic 283, daukadolt 221 — [contributors API](https://api.github.com/repos/topoteretes/cognee/contributors?per_page=10)
- CI: 67 files in .github/workflows, including basic_tests, integration_tests, e2e_tests, graph_db_tests, vector_db_tests, relational_db_migration_tests, examples_tests, notebooks_tests, test_different_operating_systems, nightly_tests, scorecard, cve_alert, release, release_test, pr_lint, DCO approval, dependabot — [workflows listing](https://api.github.com/repos/topoteretes/cognee/contents/.github/workflows)
- Recent main runs on 2026-11-14: Nightly Scheduler success, PR review tickets success, CVE alert success, dependabot success, Telemetry Insights (daily) failure; Nightly Tests in progress; 2,500 total runs — [Actions runs API](https://api.github.com/repos/topoteretes/cognee/actions/runs?branch=main&per_page=15) (only first 7 runs of 100k chars read; no conclusion for the full test suites)
- Dev dependencies include ruff, pytest, pre-commit, deptry and `ty` (type checker, <0.1.0) — [pyproject.toml](https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml)
- Release process: GitHub releases with `release.yml`, `dev_canary_release.yml`, `release_test.yml`; semver patch tags roughly weekly — [releases](https://api.github.com/repos/topoteretes/cognee/releases?per_page=12)

### Inferences
- Bus factor: two people (dexters1, Vasilije1990, the latter likely a founder; not verified) account for ~6.5k of the top-10 ~10.7k commits, but at least 8 contributors have 200+ commits, so moderate risk. Commit counts may include bot/merge commits.
- Weekly releases with many tight upper-bound pins (lancedb <0.40, ladybug==, dlt<1.31) mean frequent dependency churn; pin an exact cognee version.
- Test pass/fail rate on main was not established.

### Gaps
- No type-checking status, coverage numbers or required-checks status confirmed; whether `ty` is enforced in CI is unknown.
- Issue triage latency and security advisory history not examined.
- The GitHub search API commit count may include merge commits and dev-branch activity.
- Cognee README content and the 1.6.0-1.6.4 release dates were not fetched.
