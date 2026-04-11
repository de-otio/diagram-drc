# Design Philosophy: IC DRC as a Model for LLM Diagram Generation

The architecture of `diagram-drc` is inspired by the Design Rule Check (DRC) workflow found in IC layout tools like Cadence Virtuoso. This document explains why that analogy is a strong fit for helping LLMs generate high-quality draw.io diagrams.

## Why the DRC Analogy Works

### LLMs Are Bad at Geometry

Just as an IC designer specifies circuit intent and relies on DRC to catch physical violations, an LLM can specify *graph structure* (nodes, edges, groups) without needing to reason about pixel-level placement. The DRC engine handles spatial correctness as a post-processing step — this plays to LLM strengths (semantic/structural) and away from weaknesses (spatial reasoning).

### Declarative Constraints, Not Imperative Layout

In Virtuoso, you don't hand-place every transistor — you define rules (min spacing, width, enclosure) and the tool enforces them. Similarly, this repo lets rules like `spacing`, `content-margin`, and `crossing-minimization` encode quality constraints that are applied automatically. An LLM just needs to produce a valid `GraphSpec`.

### Composable, Ordered Rule Passes

The sequential rule application (crossing-min -> rank-compaction -> spacing -> content-margin) mirrors how real DRC decks work — each rule assumes prior rules have already cleaned up their domain. This is a proven pattern from EDA.

## Opportunities to Borrow More from EDA

### LVS (Layout vs. Schematic)

A validation step that checks whether the rendered diagram faithfully represents the *intent* the LLM was given — e.g., "are all specified edges present? are groupings correct?" This catches structural errors, not just layout ones.

### DFM (Design for Manufacturability)

The analog here is "design for readability" — rules that check label legibility, color contrast, or whether a diagram exceeds a reasonable viewport size.

### Incremental DRC

Virtuoso re-checks only the affected region after an edit. If you add iterative LLM refinement (LLM generates -> DRC reports violations -> LLM adjusts), incremental checking would make the feedback loop faster.

### Rule Decks / PDKs

Different diagram *types* (architecture diagrams, sequence flows, network topologies) could have different rule sets, analogous to how different foundry process nodes have different DRC decks.

## The Key Insight

This approach decomposes diagram generation into a part LLMs do well (describing relationships and structure as JSON) and a part algorithms do well (geometric optimization). The DRC layer acts as a guardrail that elevates mediocre LLM spatial output into polished diagrams — the same way DRC elevates a rough layout into a tape-out-ready design.

The three-layer architecture (`GraphSpec` -> `LayoutResult` -> rendered XML) with rule-based post-processing in the middle is a clean separation of concerns that maps naturally to LLM-assisted diagram generation.
