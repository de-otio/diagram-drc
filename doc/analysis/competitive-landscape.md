# Analysis: Competitive Landscape

## Summary

diagram-drc occupies a genuinely novel niche. No existing tool applies the IC-layout DRC metaphor (check + fix with pluggable rules) to post-layout diagram quality. The closest tools are either layout engines (which try to produce good layouts but do not validate after the fact), readability metric libraries (which measure but do not fix), or LLM diagram generation tools (which produce diagrams but lack systematic quality validation).

## Diagram Layout Quality Checking / Linting Tools

**This category is essentially empty.** No tool exists that "lints" a diagram layout the way ESLint lints code.

The closest precedent is **Design Lint** for Figma — a plugin that checks for missing styles against a design system. It validates UI component consistency, not diagram layout geometry. The concept of "linting a visual artifact" is analogous, but the domain is entirely different.

## Graph Layout Readability Metrics

These tools *measure* layout quality but do not *fix* issues. They are the closest conceptual relatives.

| Tool | What it does | Relation to diagram-drc |
|------|-------------|------------------------|
| **greadability.js** ([github](https://github.com/rpgove/greadability)) | JS library computing 4 readability metrics: edge crossings, crossing angle, angular resolution. Values 0-1. | Most directly complementary. Measures but does NOT fix. Last updated 2018. Could be used as a scoring layer on top of diagram-drc. |
| **GLAM** ([github](https://github.com/kwonoh/glam)) | C++ library for graph layout aesthetic metrics: crosslessness, edge length CV, min angle. | Complementary (metric computation). C++ only, not usable in Node. Academic. |
| **GraphOptima** ([github](https://github.com/smlabto/GraphOptima)) | HPC framework for multi-objective optimization of graph layouts using readability metrics. Uses GLAM. | Different approach (optimization during layout, not post-layout DRC). Requires HPC cluster. Python. |

**Gap:** No tool combines measurement AND fixing. greadability measures; GraphOptima optimizes during layout; diagram-drc uniquely checks AND fixes post-layout.

## Declarative Constraint Systems for Graph Layout

These are *layout engines* with constraint systems, not *validators*. They are upstream of diagram-drc.

| Tool | What it does | Relation to diagram-drc |
|------|-------------|------------------------|
| **WebCola (cola.js)** ([site](https://ialab.it.monash.edu/webcola/)) | Constraint-based graph layout using stress-majorization. Supports alignment, separation, non-overlap constraints. | Upstream complement. Could replace Dagre as layout engine. Constraints applied *during* layout, not checked afterwards. |
| **SetCoLa** ([github](https://github.com/uwdata/setcola)) | DSL for high-level graph layout constraints. Compiles to WebCola constraints. | Most declarative constraint system found. Similar "express constraints as data" philosophy, but for layout specification, not validation. Academic (UW, EuroVis 2018). |
| **ELK.js** ([github](https://github.com/kieler/elkjs)) | Eclipse Layout Kernel for JS. Layer-based layout with extensive configuration (hundreds of properties). | Much more powerful layout engine than Dagre. Rich declarative configuration. But no post-layout validation. |
| **Cytoscape.js (fCoSE)** ([site](https://js.cytoscape.org/)) | Graph visualization library. fCoSE layout supports fixed position, alignment, and relative placement constraints. | Layout engine, not validator. Constraint system tightly coupled to the visualization framework. |

**Gap:** All constraint systems work *during* layout. None validates constraints *after* layout. diagram-drc's post-hoc approach is unique.

## LLM Diagram Generation Tools

A rapidly growing space, but quality validation is conspicuously absent.

| Tool | What it does | Relation to diagram-drc |
|------|-------------|------------------------|
| **draw.io Native AI** ([docs](https://www.drawio.com/doc/faq/ai-drawio-generation)) | Built-in AI generation using Gemini/Claude/ChatGPT. Provides mxfile.xsd schema and a style reference with a "validation checklist." | Primary target environment. draw.io validates structure (valid XML, valid styles), not geometry (overlaps, spacing, crossings). diagram-drc fills the quality gap. |
| **draw.io MCP Server** (@drawio/mcp) ([github](https://github.com/jgraph/drawio-mcp)) | Official MCP server from JGraph. XML generation rules but NO layout quality checking. | Ideal integration target. diagram-drc could be a post-generation validation step. |
| **GenAI-DrawIO-Creator** ([arxiv](https://arxiv.org/abs/2601.05162)) | Academic framework (Jan 2026) using Claude via Bedrock. Two-level validation: XML well-formedness + semantic correctness. 94% first-attempt accuracy. | Directly complementary. Has XML and semantic checks but explicitly does NOT check layout quality. Relies on "inherent reasoning" for visual quality. |
| **Excalidraw Diagram Skill** ([github](https://github.com/coleam00/excalidraw-diagram-skill)) | Claude Code skill using render-view-fix loop with Playwright for visual validation. | Interesting approach (visual validation loop) but targets Excalidraw, not draw.io, and uses visual rendering rather than geometric rule checking. |

**Gap:** Every LLM diagram tool focuses on generation and structural validity. None performs automated geometric layout quality checking.

## Mermaid / Diagram-as-Code Validators

| Tool | What it does | Relation to diagram-drc |
|------|-------------|------------------------|
| **@probelabs/maid** | Fast Mermaid syntax validator CLI. | Syntax validation only, not layout quality. |
| **D2 (Terrastruct)** ([site](https://d2lang.com/)) | Declarative diagramming language with auto-layout. | Text-to-diagram with auto-layout. No post-layout quality validation. |
| **Structurizr / LikeC4** | C4 model DSLs for software architecture. | Architecture model to diagram. No layout quality validation. |

All diagram-as-code tools assume their layout engine produces good results. None validates the output.

## DRC Outside IC Design

No one has applied the DRC metaphor outside IC/PCB design. The only places DRC appears are IC layout (Synopsys, Cadence, Siemens/Calibre) and PCB design (KiCad, Altium, EasyEDA). diagram-drc appears to be the first project to apply the concept to software diagrams.

## Validation of the Need

Dagre (which diagram-drc uses as its layout engine) has well-documented quality issues:
- Node overlap issues ([dagrejs/dagre#67](https://github.com/dagrejs/dagre/issues/67))
- Edge overlap issues ([dagrejs/dagre#145](https://github.com/dagrejs/dagre/issues/145))
- Wrong positioning with different node widths ([dagrejs/dagre#264](https://github.com/dagrejs/dagre/issues/264))
- ELK.js also has edge overlap bugs ([kieler/elkjs#211](https://github.com/kieler/elkjs/issues/211))

Layout engines produce imperfect results. Post-hoc checking and fixing is a valid and underserved approach.

## Strategic Opportunities

- **draw.io MCP integration:** diagram-drc as a post-generation validation step in the @drawio/mcp pipeline.
- **greadability.js integration:** Add readability metrics (crossing angle, angular resolution) as additional rules or a scoring layer.
- **ELK.js as alternative layout engine:** Offer ELK alongside Dagre, with DRC as the quality equalizer across engines.
- **SetCoLa-inspired constraint DSL:** SetCoLa's approach to declarative constraints could inform the design of the proposed `constraint()` primitive system (see ai-agent-rule-authoring.md).

## Conclusions

1. **No direct competitor exists.** The check + fix + pluggable rules combination is unique.
2. **The DRC metaphor is entirely novel outside hardware.** Strong differentiator and branding opportunity.
3. **The LLM diagram space lacks a quality gate.** Every tool generates; none validates geometry. diagram-drc fills a clear gap.
4. **Complementary tools exist** (greadability for metrics, SetCoLa for constraint DSL inspiration, ELK for alternative layout) but none overlaps with diagram-drc's core function.
