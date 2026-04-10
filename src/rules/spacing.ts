/**
 * Spacing Rule
 *
 * Ensures minimum distance between node bounding boxes.
 * Detects overlapping or too-close nodes and nudges them apart.
 */

import type { LayoutResult, GraphSpec, LayoutRule, Violation, LayoutNode } from '../types.js';

export interface SpacingOptions {
  /** Minimum gap between node bounding boxes (default: 20) */
  minGap?: number;
}

export class SpacingRule implements LayoutRule {
  id = 'spacing';
  description = 'Ensure minimum distance between node bounding boxes';
  severity = 'warning' as const;
  private minGap: number;

  constructor(options?: SpacingOptions) {
    this.minGap = options?.minGap ?? 20;
  }

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    const nodes = [...layout.nodes.values()].filter((n) => !isGroup(n.id, spec));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const gap = computeGap(nodes[i], nodes[j]);
        if (gap < this.minGap) {
          violations.push({
            ruleId: this.id,
            severity: this.severity,
            message: `Nodes "${nodes[i].id}" and "${nodes[j].id}" are ${Math.round(gap)}px apart (min: ${this.minGap}px)`,
            affectedElements: [nodes[i].id, nodes[j].id],
            region: boundingBox(nodes[i], nodes[j]),
          });
        }
      }
    }

    return violations;
  }

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);
    const nodes = [...result.nodes.values()].filter((n) => !isGroup(n.id, spec));

    // Simple iterative repulsion: push overlapping pairs apart
    for (let iter = 0; iter < 10; iter++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const gap = computeGap(nodes[i], nodes[j]);
          if (gap < this.minGap) {
            const push = (this.minGap - gap) / 2 + 1;
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            nodes[i].x -= (dx / dist) * push;
            nodes[i].y -= (dy / dist) * push;
            nodes[j].x += (dx / dist) * push;
            nodes[j].y += (dy / dist) * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    return result;
  }
}

function computeGap(a: LayoutNode, b: LayoutNode): number {
  const aLeft = a.x - a.width / 2;
  const aRight = a.x + a.width / 2;
  const aTop = a.y - a.height / 2;
  const aBottom = a.y + a.height / 2;
  const bLeft = b.x - b.width / 2;
  const bRight = b.x + b.width / 2;
  const bTop = b.y - b.height / 2;
  const bBottom = b.y + b.height / 2;

  const gapX = Math.max(0, Math.max(aLeft - bRight, bLeft - aRight));
  const gapY = Math.max(0, Math.max(aTop - bBottom, bTop - aBottom));

  // If they overlap on one axis, the gap is on the other axis
  if (gapX === 0 && gapY === 0) return 0; // overlapping
  if (gapX === 0) return gapY;
  if (gapY === 0) return gapX;
  return Math.sqrt(gapX * gapX + gapY * gapY);
}

function boundingBox(a: LayoutNode, b: LayoutNode) {
  const x = Math.min(a.x - a.width / 2, b.x - b.width / 2);
  const y = Math.min(a.y - a.height / 2, b.y - b.height / 2);
  const right = Math.max(a.x + a.width / 2, b.x + b.width / 2);
  const bottom = Math.max(a.y + a.height / 2, b.y + b.height / 2);
  return { x, y, width: right - x, height: bottom - y };
}

function isGroup(id: string, spec: GraphSpec): boolean {
  return (spec.groups ?? []).some((g) => g.id === id);
}

function cloneLayout(layout: LayoutResult): LayoutResult {
  const nodes = new Map<string, LayoutNode>();
  for (const [id, node] of layout.nodes) {
    nodes.set(id, { ...node });
  }
  return {
    nodes,
    edges: layout.edges.map((e) => ({ ...e, points: e.points.map((p) => ({ ...p })) })),
    width: layout.width,
    height: layout.height,
  };
}
