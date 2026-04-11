/**
 * Edge Straightening Rule
 *
 * Nudges the less-constrained endpoint of an intra-group edge so that
 * the edge is closer to vertical or horizontal.  Orthogonal routers
 * (like draw.io) add a bend for every axis change, so aligning
 * connected nodes on one axis eliminates unnecessary bends.
 *
 * For each intra-group edge the rule measures the angle: if it is
 * significantly diagonal (between 20° and 70°), the node with fewer
 * intra-group edges is nudged toward the other node's x (for mostly-
 * vertical edges) or y (for mostly-horizontal edges).
 *
 * Must run late — after spacing and edge-node-overlap have finished
 * moving nodes.
 */

import type {
  LayoutResult,
  GraphSpec,
  GraphGroup,
  LayoutRule,
  Violation,
  LayoutNode,
} from '../types.js';

export interface EdgeStraighteningOptions {
  /** Pull strength toward axis alignment (0–1, default 0.85). */
  strength?: number;
  /**
   * Minimum angle from an axis (in degrees) to consider the edge
   * "diagonal" and worth straightening (default 20).
   */
  minAngle?: number;
}

export class EdgeStraighteningRule implements LayoutRule {
  id = 'edge-straightening';
  description =
    'Nudge connected nodes toward axis alignment to reduce edge bends';
  severity = 'info' as const;

  private strength: number;
  private minAngle: number;

  constructor(options?: EdgeStraighteningOptions) {
    this.strength = options?.strength ?? 0.85;
    this.minAngle = options?.minAngle ?? 20;
  }

  // ── check ───────────────────────────────────────────────────────────

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    const groups = spec.groups ?? [];

    for (const group of groups) {
      const members = new Set(group.children);
      for (const edge of spec.edges) {
        if (!members.has(edge.source) || !members.has(edge.target)) continue;
        const s = layout.nodes.get(edge.source);
        const t = layout.nodes.get(edge.target);
        if (!s || !t) continue;

        const angle = axisAngle(s, t);
        if (angle >= this.minAngle && angle <= 90 - this.minAngle) {
          violations.push({
            ruleId: this.id,
            severity: this.severity,
            message:
              `Edge ${edge.source}→${edge.target} is ${Math.round(angle)}° ` +
              `from horizontal in group "${group.id}" (causes extra bends)`,
            affectedElements: [edge.source, edge.target],
          });
        }
      }
    }
    return violations;
  }

  // ── fix ─────────────────────────────────────────────────────────────

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);
    const groups = spec.groups ?? [];

    for (const group of groups) {
      const members = new Set(group.children);
      const edgeCounts = countIntraEdges(group, spec);
      const intraEdges = spec.edges.filter(
        (e) => members.has(e.source) && members.has(e.target),
      );

      for (const edge of intraEdges) {
        const s = result.nodes.get(edge.source);
        const t = result.nodes.get(edge.target);
        if (!s || !t) continue;

        const dx = Math.abs(s.x - t.x);
        const dy = Math.abs(s.y - t.y);
        if (dx < 5 || dy < 5) continue; // already axis-aligned

        const angle = axisAngle(s, t);
        if (angle < this.minAngle || angle > 90 - this.minAngle) continue;

        // Only move leaf nodes (1 intra-group edge). Nodes with multiple
        // edges are too constrained — moving them cascades into overlaps.
        const sCount = edgeCounts.get(edge.source) ?? 0;
        const tCount = edgeCounts.get(edge.target) ?? 0;
        const movableNode = tCount < sCount ? t : sCount < tCount ? s : null;
        if (!movableNode) continue; // both equal — skip
        const movableCount = movableNode === t ? tCount : sCount;
        if (movableCount > 1) continue; // not a leaf — skip
        const anchorNode = movableNode === t ? s : t;

        // In top-down layouts, vertical edges are natural. Align x to
        // make the edge more vertical (fewer bends in orthogonal routing).
        movableNode.x += (anchorNode.x - movableNode.x) * this.strength;
      }

      // Refit group.
      fitGroup(result, group);
    }

    return result;
  }
}

// ── helpers ───────────────────────────────────────────────────────────

/** Angle from the horizontal axis, in degrees (0–90). */
function axisAngle(a: LayoutNode, b: LayoutNode): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Count intra-group edges per node. */
function countIntraEdges(
  group: GraphGroup,
  spec: GraphSpec,
): Map<string, number> {
  const members = new Set(group.children);
  const counts = new Map<string, number>();
  for (const c of group.children) counts.set(c, 0);
  for (const edge of spec.edges) {
    if (members.has(edge.source) && members.has(edge.target)) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    }
  }
  return counts;
}

function fitGroup(layout: LayoutResult, group: GraphGroup): void {
  const groupNode = layout.nodes.get(group.id);
  if (!groupNode) return;
  const children = group.children
    .map((id) => layout.nodes.get(id))
    .filter((n): n is LayoutNode => n !== undefined);
  if (children.length === 0) return;
  const pad = 30;
  const minX = Math.min(...children.map((c) => c.x - c.width / 2)) - pad;
  const maxX = Math.max(...children.map((c) => c.x + c.width / 2)) + pad;
  const minY = Math.min(...children.map((c) => c.y - c.height / 2)) - pad;
  const maxY = Math.max(...children.map((c) => c.y + c.height / 2)) + pad;
  groupNode.width = maxX - minX;
  groupNode.height = maxY - minY;
  groupNode.x = minX + groupNode.width / 2;
  groupNode.y = minY + groupNode.height / 2;
}

function cloneLayout(layout: LayoutResult): LayoutResult {
  const nodes = new Map<string, LayoutNode>();
  for (const [id, node] of layout.nodes) {
    nodes.set(id, { ...node });
  }
  return {
    nodes,
    edges: layout.edges.map((e) => ({
      ...e,
      points: e.points.map((p) => ({ ...p })),
    })),
    width: layout.width,
    height: layout.height,
  };
}
