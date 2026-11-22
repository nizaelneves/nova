"""How notes relate: the graph of layers 1 and 2, built from what is already stored (no model call, no cost).

Layer 1 is what you wrote: tags, collections and links between notes. Layer 2 is meaning: notes whose
embeddings are close. Both are read from ``notes.db`` and the search index, so the graph is always rebuilt
fresh and nothing about it needs a backup.
"""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

from phibe.connectors.embeddings import decode_embedding
from phibe.connectors.store import KnowledgeStore
from phibe.notes.indexer import SOURCE
from phibe.notes.store import NotesStore

# shortcut: similarity is a brute-force scan of one vector per note; fine for thousands of notes, use an index beyond that.
NEIGHBOURS = 3
MIN_SIMILARITY = 0.7  # bge-m3 on the real notes: the median pair scores 0.64 and the 90th percentile 0.77


def note_vectors(knowledge: KnowledgeStore, model: str) -> Dict[str, np.ndarray]:
    """One unit vector per note: the mean of its chunks' embeddings made with ``model`` (other models are ignored)."""
    rows = knowledge._conn.execute(
        "SELECT doc_id, embedding FROM knowledge_chunks WHERE source = ? AND embedding IS NOT NULL AND embedding_model_version = ?",
        (SOURCE, model),
    ).fetchall()
    sums: Dict[str, np.ndarray] = {}
    for row in rows:
        vec = decode_embedding(row["embedding"])
        if vec is None or not vec.size:
            continue
        norm = float(np.linalg.norm(vec))
        if norm == 0.0:
            continue
        nid = row["doc_id"].split(":", 1)[-1]
        unit = vec.astype(np.float32) / norm
        sums[nid] = sums[nid] + unit if nid in sums and sums[nid].size == unit.size else unit
    out = {}
    for nid, total in sums.items():
        norm = float(np.linalg.norm(total))
        if norm:
            out[nid] = total / norm
    return out


def similar(vectors: Dict[str, np.ndarray], note_id: str, limit: int, floor: float = MIN_SIMILARITY) -> List[Dict[str, Any]]:
    """The notes closest in meaning to ``note_id``, best first."""
    me = vectors.get(note_id)
    if me is None:
        return []
    ids = [i for i, v in vectors.items() if i != note_id and v.size == me.size]
    if not ids:
        return []
    scores = np.stack([vectors[i] for i in ids]) @ me
    order = np.argsort(-scores)[:limit]
    return [{"id": ids[i], "score": round(float(scores[i]), 3)} for i in order if scores[i] >= floor]


def related(notes: NotesStore, vectors: Dict[str, np.ndarray], note_id: str, limit: int = 6) -> List[Dict[str, Any]]:
    """Notes worth reading next: close in meaning, with the tags and collections they share as the reason."""
    me = notes.get(note_id)
    mine = {t.lower() for t in me["tags"]} | {c["name"].lower() for c in me["collections"]}
    linked = {l["id"] for l in me["links"] + me["backlinks"]}
    out = []
    for hit in similar(vectors, note_id, limit * 3):
        if hit["id"] in linked:
            continue  # already shown under Links and Backlinks
        other = notes.get(hit["id"])
        if other["deleted_at"]:
            continue
        shared = [t for t in other["tags"] if t.lower() in mine] + [c["name"] for c in other["collections"] if c["name"].lower() in mine]
        out.append({"id": other["id"], "title": other["title"], "kind": other["kind"], "score": hit["score"], "shared": shared})
        if len(out) == limit:
            break
    return out


def build(notes: NotesStore, vectors: Dict[str, np.ndarray], *, neighbours: int = NEIGHBOURS, floor: float = MIN_SIMILARITY) -> Dict[str, Any]:
    """Nodes (notes, tags that group at least two notes, collections) and edges: written links, membership, similarity."""
    live = notes.list(limit=2000)
    ids = {n["id"] for n in live}
    nodes: List[Dict[str, Any]] = [{"id": n["id"], "type": "note", "label": n["title"] or "Untitled", "kind": n["kind"]} for n in live]
    edges: List[Dict[str, Any]] = []
    for tag in notes.tags():
        if tag["count"] >= 2:
            nodes.append({"id": f"tag:{tag['name']}", "type": "tag", "label": tag["name"], "count": tag["count"]})
    for col in notes.collections():
        nodes.append({"id": f"collection:{col['id']}", "type": "collection", "label": col["name"], "count": col["count"]})
    hubs = {n["id"] for n in nodes if n["type"] != "note"}
    for n in live:
        full = notes.get(n["id"])
        for t in full["tags"]:
            if f"tag:{t}" in hubs:
                edges.append({"a": n["id"], "b": f"tag:{t}", "type": "tag"})
        for c in full["collections"]:
            edges.append({"a": n["id"], "b": f"collection:{c['id']}", "type": "collection"})
        for link in full["links"]:
            if link["id"] in ids:
                edges.append({"a": n["id"], "b": link["id"], "type": "link"})
    seen = set()
    for nid in ids:
        for hit in similar(vectors, nid, neighbours, floor):
            if hit["id"] in ids and (key := tuple(sorted((nid, hit["id"])))) not in seen:
                seen.add(key)
                edges.append({"a": key[0], "b": key[1], "type": "similar", "weight": hit["score"]})
    return {"nodes": nodes, "edges": edges}

