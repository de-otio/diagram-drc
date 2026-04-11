/**
 * Edge-Node Overlap Rule
 *
 * Detects cases where the straight-line path of an intra-group edge
 * passes through the bounding box of an unrelated node in the same
 * group.  The fix nudges the overlapped node perpendicular to the
 * edge so that the bounding box clears the line segment.
 *
 * Analogous to DRC clearance checks in IC layout: a wire must not
 * pass through an unrelated cell.
 */

import type {
  LayoutResult,
  GraphSpec,
  GraphGroup,
  LayoutRule,
  Violation,
  LayoutNode,
} from '../types.js';

export interface EdgeNodeOverlapOptions {
  /** Extra clearance around each node bbox (default 5). */
  margin?: number;
  /** Maximum number of nudge iterations (default 3). */
  iterations?: number;
  /** Nudge distance per step (default 15). */
  nudgeStep?: number;
}

export class EdgeNodeOverlapRule implements LayoutRule {
  id = 'edge-node-overlap';
  description =
    'Detect and fix edges that pass through unrelated node bounding boxes';
  severity = 'warning' as const;

  private margin: number;
  private iterations: number;
  private nudgeStep: number;

  constructor(options?: EdgeNodeOverlapOptions) {
    this.margin = options?.margin ?? 5;
    this.iterations = options?.iterations ?? 3;
    this.nudgeStep = options?.nudgeStep ?? 15;
  }

  // ── check ───────────────────────────────────────────────────────────

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    const seen = new Set<string>();

    for (const group of spec.groups ?? []) {
      const members = new Set(group.children);
      const intraEdges = spec.edges.filter(
        (e) => members.has(e.source) && members.has(e.target),
      );

      for (const edge of intraEdges) {
        const s = layout.nodes.get(edge.source);
        const t = layout.nodes.get(edge.target);
        if (!s || !t) continue;

        for (const nid of group.children) {
          if (nid === edge.source || nid === edge.target) continue;
          const n = layout.nodes.get(nid);
          if (!n) continue;

          if (segRectIntersect(s, t, n, this.margin)) {
            const key = `${edge.id ?? edge.source + '->' + edge.target}|${nid}`;
            if (seen.has(key)) continue;
            seen.add(key);
            violations.push({
              ruleId: this.id,
              severity: this.severity,
              message:
                `Edge ${edge.source}→${edge.target} passes through ` +
                `node "${nid}" in group "${group.id}"`,
              affectedElements: [edge.source, edge.target, nid],
            });
          }
        }
      }
    }
    return violations;
  }

  // ── fix ─────────────────────────────────────────────────────────────

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);

    for (let iter = 0; iter < this.iterations; iter++) {
      let moved = false;

      for (const group of spec.groups ?? []) {
        const members = new Set(group.children);
        const intraEdges = spec.edges.filter(
          (e) => members.has(e.source) && members.has(e.target),
        );

        for (const edge of intraEdges) {
          const s = result.nodes.get(edge.source);
          const t = result.nodes.get(edge.target);
          if (!s || !t) continue;

          for (const nid of group.children) {
            if (nid === edge.source || nid === edge.target) continue;
            const n = result.nodes.get(nid);
            if (!n) continue;

            if (segRectIntersect(s, t, n, this.margin)) {
              // Nudge the overlapped node perpendicular to the edge.
              const dx = t.x - s.x;
              const dy = t.y - s.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;

              // Perpendicular direction (choose the side away from edge midpoint).
              let px = -dy / len;
              let py = dx / len;
              const edgeMidX = (s.x + t.x) / 2;
              const edgeMidY = (s.y + t.y) / 2;
              const toNode = (n.x - edgeMidX) * px + (n.y - edgeMidY) * py;
              if (toNode < 0) {
                px = -px;
                py = -py;
              }

              n.x += px * this.nudgeStep;
              n.y += py * this.nudgeStep;
              moved = true;
            }
          }
        }

        // Refit group if anything moved.
        if (moved) fitGroup(result, group);
      }

      if (!moved) break;
    }

    return result;
  }
}

// ── geometry ──────────────────────────────────────────────────────────

/**
 * Test whether the line segment from `s` centre to `t` centre
 * intersects the axis-aligned bounding box of `n` (expanded by
 * `margin`).  Uses the parametric slab method.
 */
function segRectIntersect(
  s: LayoutNode,
  t: LayoutNode,
  n: LayoutNode,
  margin: number,
): boolean {
  const ax = s.x;
  const ay = s.y;
  const bx = t.x;
  const by = t.y;

  const left = n.x - n.width / 2 - margin;
  const right = n.x + n.width / 2 + margin;
  const top = n.y - n.height / 2 - margin;
  const bottom = n.y + n.height / 2 + margin;

  const dx = bx - ax;
  const dy = by - ay;
  let tmin = 0;
  let tmax = 1;

  if (dx !== 0) {
    let t1 = (left - ax) / dx;
    let t2 = (right - ax) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  } else {
    if (ax < left || ax > right) return false;
  }

  if (dy !== 0) {
    let t1 = (top - ay) / dy;
    let t2 = (bottom - ay) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  } else {
    if (ay < top || ay > bottom) return false;
  }

  return true;
}

// ── shared helpers ────────────────────────────────────────────────────

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
