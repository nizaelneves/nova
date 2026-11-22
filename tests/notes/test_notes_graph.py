"""The relation graph: layer 1 (what was written) and layer 2 (meaning), from vectors made by hand."""

from __future__ import annotations

import numpy as np

from phibe.notes import graph
from phibe.notes.store import NotesStore


def unit(*xs: float) -> np.ndarray:
    v = np.array(xs, dtype=np.float32)
    return v / np.linalg.norm(v)


def make():
    s = NotesStore(":memory:")
    a = s.create("Pricing", "x", tags=["Business", "SaaS"])
    b = s.create("Packaging", "y", tags=["Business"])
    c = s.create("Gardening", "z", tags=["Plants"])
    d = s.create("Gone", "w")
    s.trash(d)
    col = s.upsert_collection("Course")
    s.add_to_collection(col, a)
    s.add_link(a, c, "mention")
    vectors = {a: unit(1, 0.1, 0), b: unit(1, 0.2, 0), c: unit(0, 0, 1)}
    return s, vectors, (a, b, c, d)


def test_graph_has_hubs_links_and_only_close_neighbours() -> None:
    s, vectors, (a, b, c, d) = make()
    g = graph.build(s, vectors)
    kinds = {n["id"]: n["type"] for n in g["nodes"]}
    assert d not in kinds  # trashed notes are not drawn
    assert "tag:Business" in kinds and "tag:Plants" not in kinds  # a tag on a single note groups nothing
    assert any(n["type"] == "collection" for n in g["nodes"])
    edges = {(e["type"], *sorted((e["a"], e["b"]))) for e in g["edges"]}
    assert ("link", *sorted((a, c))) in edges
    assert ("similar", *sorted((a, b))) in edges
    assert not any(e["type"] == "similar" and c in (e["a"], e["b"]) for e in g["edges"])  # far in meaning


def test_related_gives_the_reason_and_skips_what_is_already_linked() -> None:
    s, vectors, (a, b, c, d) = make()
    got = graph.related(s, vectors, a)
    assert [(r["id"], r["shared"]) for r in got] == [(b, ["Business"])]
    vectors[c] = unit(1, 0.15, 0.01)  # now close, but already linked to a
    assert c not in [r["id"] for r in graph.related(s, vectors, a)]
    assert graph.related(s, {}, a) == []
