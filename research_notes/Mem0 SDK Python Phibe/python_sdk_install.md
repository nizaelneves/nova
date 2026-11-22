# Mem0 Python SDK: install, auth, platform and OSS usage (as of late Oct 2026)

Note: the docs pages were fetched through a summarizing tool, so code is as returned by it. Anything marked "constructed" or "third party" is not verbatim official.

## 1. Package, version, Python support, extras, dependencies

### Takeaway
Package is `mem0ai` (import `mem0`), latest 2.2.1 (2026-09-25), Python >=3.10,<4.0, so 3.11+ is fine. Core deps are modest (qdrant-client, openai, pydantic, sqlalchemy, protobuf, posthog); heavy stuff is gated behind extras.

### Cited Findings
- Latest version 2.2.1, released Sept 25, 2026; requires Python >=3.10,<4.0; extras: `dev`, `extras`, `llms`, `nlp`, `test`, `vector-stores`; install `pip install mem0ai`; NLP variant `pip install mem0ai[nlp]` then `python -m spacy download en_core_web_sm` — [PyPI](https://pypi.org/project/mem0ai/)
- Core dependencies: qdrant-client>=1.12.0, pydantic>=2.7.3, openai>=1.90.0, httpx>=0.28.0, posthog>=7.14.0, pytz>=2024.1, sqlalchemy>=2.0.31, protobuf>=5.29.6,<7.0.0 — [pyproject.toml (main branch)](https://raw.githubusercontent.com/mem0ai/mem0/main/pyproject.toml)
- Extras contents: `nlp` = spacy>=3.7.0; `llms` = groq, together, litellm (>=1.83.7,<1.98.0), openai, ollama, vertexai, google-generativeai, google-genai; `vector-stores` = vecs, chromadb, cassandra-driver, weaviate-client(<5), pinecone(<=7.3.0), faiss-cpu, psycopg, pymongo, redis(<6), elasticsearch(<9), pymilvus(<2.6), langchain-aws(<0.3), oracledb and more; `extras` = boto3, langchain(<1.0), langchain-community(<1.0), sentence-transformers, transformers, fastembed, opensearch-py and more — [pyproject.toml](https://raw.githubusercontent.com/mem0ai/mem0/main/pyproject.toml)
- `ollama` Python client is only in the `llms` extra, not core (core has openai but not ollama) — [pyproject.toml](https://raw.githubusercontent.com/mem0ai/mem0/main/pyproject.toml)

### Inferences
- Plain `pip install mem0ai` is light enough for FastAPI on Windows. Avoid `[extras]` (torch via sentence-transformers/transformers) and `[vector-stores]` (many conflicting pins). For OSS+Ollama, install `mem0ai` plus `ollama` directly, not `[llms]` (litellm, vertexai, etc.).
- Pins: protobuf <7 and pydantic >=2.7.3 could conflict with other libs in the project; check with `pip install --dry-run`.
- pyproject is from main; PyPI 2.2.1 matches the main version, so likely the same.

### Gaps
- PyPI page did not list dependencies; core list comes from GitHub main only.
- Wheel size/Windows-specific install issues not found.

## 2. Platform (cloud) quickstart

### Takeaway
`MemoryClient(api_key=...)` or env `MEM0_API_KEY`. Search and get_all take a `filters` dict in the current SDK. Platform has no `update` per the migration guide, but the client source has an `update` method, so the docs conflict.

### Cited Findings
- Key: create an account at app.mem0.ai, generate key in dashboard API keys settings — [Platform quickstart](https://docs.mem0.ai/platform/quickstart)
- Env var `MEM0_API_KEY`; client does `self.api_key = api_key or os.getenv("MEM0_API_KEY")`. Also reads `MEM0_SOURCE`, `MEM0_APPLICATION`, `MEM0_CLIENT_STACK` — [mem0/client/main.py](https://raw.githubusercontent.com/mem0ai/mem0/main/mem0/client/main.py)
- Quickstart code (verbatim) — [Platform quickstart](https://docs.mem0.ai/platform/quickstart):
```python
from mem0 import MemoryClient
client = MemoryClient(api_key="your-api-key")

messages = [
    {"role": "user", "content": "I'm a vegetarian and allergic to nuts."},
    {"role": "assistant", "content": "Got it! I'll remember your dietary preferences."}
]
client.add(messages, user_id="user123")

results = client.search("What are my dietary restrictions?", filters={"user_id": "user123"})
print(results)
```
- add with keyword `messages=`; processing is asynchronous, response returns an `event_id` pollable at `GET /v1/event/{event_id}/`; Python param `expiration_date` — [Add memories API](https://docs.mem0.ai/api-reference/memory/add-memories)
- get_all/delete/delete_all/pagination (verbatim) — [OSS to platform migration](https://docs.mem0.ai/migration/oss-to-platform):
```python
memories = client.get_all(filters={"user_id": "alex"}, top_k=10)
memories = client.get_all(filters={"user_id": "alex"}, top_k=5, offset=10)
client.delete(memory_id="mem_123")
client.delete_all(user_id="alex")
# connection check:
client.get_all(filters={"user_id": "test_connection"})
```
- Migration guide: "The `update()` method is not available in Platform - use delete + add pattern instead" — [migration](https://docs.mem0.ai/migration/oss-to-platform); contradicted by client source which defines `update(self, memory_id: str, options=None, **kwargs)` — [client/main.py](https://raw.githubusercontent.com/mem0ai/mem0/main/mem0/client/main.py). A third-party skill doc shows `client.update("memory-uuid", text=...)` (unverified).
- Signatures: `search(self, query, options=None, **kwargs)`, `get_all(self, options=None, **kwargs)` — [client/main.py](https://raw.githubusercontent.com/mem0ai/mem0/main/mem0/client/main.py)
- Org/project: `MemoryClient.__init__(self, api_key=None, host=None, client=None)` has NO `org_id`/`project_id` params; they are set None and filled from the `/v1/ping/` response (key is project-scoped). Older docs/third-party sources still show `MemoryClient(api_key, org_id, project_id)` — [client/main.py](https://raw.githubusercontent.com/mem0ai/mem0/main/mem0/client/main.py); conflicting third party noted in a search result list
- Admin interfaces exist: `client.projects.create(org_id=...)`, `client.organizations.add_member(org_id=...)`, `client.webhooks.create(project_id=...)` — [migration](https://docs.mem0.ai/migration/oss-to-platform)
- Async client: `AsyncMemoryClient` exists; verbatim — [Async client](https://docs.mem0.ai/platform/features/async-client):
```python
import os
from mem0 import AsyncMemoryClient
os.environ["MEM0_API_KEY"] = "your-api-key"
client = AsyncMemoryClient()
await client.add([{"role":"user","content":"Alice loves playing badminton"},
                  {"role":"assistant","content":"That's great!"}], user_id="alice")
await client.search("What is Alice's favorite sport?", filters={"user_id": "alice"})
await client.get_all(filters={"AND": [{"user_id": "alice"}]})   # get_all requires filters
await client.delete(memory_id="memory-id-here")
```

### Inferences
- For FastAPI, use `AsyncMemoryClient` inside async endpoints (one shared instance); sync client would block the event loop.
- Use `filters={"user_id": ...}` everywhere; the older `user_id=` kwarg form for search/get_all is the pre-2.x API.
- Safest "update": try `client.update(memory_id, text=...)` in a test, else delete+add.

### Gaps
- Official verbatim `update` example not found; `org_id`/`project_id` official usage on current SDK not confirmed (docs and source disagree).
- Free-tier limits/pricing not researched.

## 3. OSS quickstart (Memory, Ollama, local vector store)

### Takeaway
`Memory()` defaults to OpenAI + Qdrant; for fully local, use `Memory.from_config` with `ollama` for llm and embedder and qdrant with `path`/`on_disk`. Official docs lack a full Ollama+Qdrant example; the config below is assembled from per-component pages.

### Cited Findings
- Defaults: OpenAI `gpt-5-mini` extraction, `text-embedding-3-small` embeddings, Qdrant at `/tmp/qdrant`, SQLite history at `~/.mem0/history.db`; usage `from mem0 import Memory; m = Memory(); m.add(messages, user_id="alex"); m.search("...", filters={"user_id": "alex"})` — [OSS python quickstart](https://docs.mem0.ai/open-source/python-quickstart)
- Config is dict of `llm`, `embedder`, `vector_store`, each `{provider, config}`; passed to `Memory.from_config(config)`; providers `ollama` (llm+embedder), `qdrant`, `chroma` supported — [Configuration](https://docs.mem0.ai/open-source/configuration)
- Ollama LLM official example (embedder there still OpenAI, needs OPENAI_API_KEY) — [Ollama LLM](https://docs.mem0.ai/components/llms/models/ollama):
```python
config = {"llm": {"provider": "ollama",
  "config": {"model": "mixtral:8x7b", "temperature": 0.1, "max_tokens": 2000}}}
m = Memory.from_config(config)
```
- Ollama embedder params: `model` (default `nomic-embed-text`), `embedding_dims` (default 512), `ollama_base_url` (default None) — [Ollama embedder](https://docs.mem0.ai/components/embedders/models/ollama)
- Qdrant params: `collection_name` (mem0), `embedding_model_dims` (default 1536), `path` (default /tmp/qdrant), `on_disk` (default False; True persists), host/port/url/api_key — [Qdrant](https://docs.mem0.ai/components/vectordbs/dbs/qdrant). Local Qdrant needs `qdrant-client` (already core).

### Inferences
- Assembled config (constructed, untested). Dimension must match: nomic-embed-text is 768 dims in reality, so set both `embedding_dims` and `embedding_model_dims` to 768 (the 512/1536 defaults would mismatch; 768 is from my knowledge, not the docs):
```python
from mem0 import Memory
config = {
  "llm": {"provider": "ollama", "config": {
      "model": "llama3.1:8b", "temperature": 0.1, "max_tokens": 2000,
      "ollama_base_url": "http://localhost:11434"}},
  "embedder": {"provider": "ollama", "config": {
      "model": "nomic-embed-text", "embedding_dims": 768,
      "ollama_base_url": "http://localhost:11434"}},
  "vector_store": {"provider": "qdrant", "config": {
      "collection_name": "phibe", "embedding_model_dims": 768,
      "path": "C:/Projects/Jarvis/data/qdrant", "on_disk": True}},
}
m = Memory.from_config(config)
```
- Install: `pip install mem0ai ollama`. Default `/tmp/qdrant` is bad on Windows; set `path`. Note OSS `update(memory_id, new_memory=...)` exists per migration guide, and `get_all(user_id=..., top_k=...)` there.
- Local Qdrant path mode locks the folder to one process (my knowledge); with uvicorn multiple workers this would fail.

### Gaps
- No official end-to-end Ollama+local-store example; `llm` ollama_base_url key name unverified; ollama LLM parameter list not retrieved.
- Chroma config not retrieved.

## 4. Privacy and data retention

### Takeaway
Platform sends message content to Mem0 cloud; OSS with Ollama keeps data local but still sends anonymous telemetry to PostHog unless disabled with `MEM0_TELEMETRY=false`.

### Cited Findings
- Telemetry: `MEM0_TELEMETRY = os.environ.get("MEM0_TELEMETRY", "True")`, enabled only if lowercase value in ("true","1","yes"), so `0`/`false` disables. Sends to `https://us.i.posthog.com`: client name, mem0 version, Python version, OS/processor info, a distinct_id (stored user id or email if provided), and for OSS the collection name, vector size, history store, and class paths of vector store/LLM/embedder. Hot-path events sampled at 0.1 — [mem0/memory/telemetry.py](https://raw.githubusercontent.com/mem0ai/mem0/main/mem0/memory/telemetry.py)
- Mem0 security page: SOC 2 Type I, HIPAA-ready, Type II audit in progress; docs homepage says "SOC 2 and HIPAA compliant" (inconsistent wording) — [mem0.ai/security](https://mem0.ai/security), [docs overview](https://docs.mem0.ai/overview)
- Third-party claim of MD5-hashed ids and `MEM0_TELEMETRY_ENABLED` var is not supported by the source file (which uses `MEM0_TELEMETRY`) — [instagit (third party)](https://instagit.com/mem0ai/mem0/what-are-the-security-considerations-when-using-mem0-with-sensitive-user-data)

### Inferences
- Platform: conversation text passed to `add` goes to Mem0 servers for LLM extraction and storage; for a personal-assistant app this is user-private data, so OSS+Ollama is the privacy-preserving route.

### Gaps
- No default retention period found; no official doc page on what exactly is stored or where hosted. Data deletion guarantees not verified.
