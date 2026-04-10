/**
 * Content Margin Rule
 *
 * Ensures all layout content (nodes and groups) respects a minimum
 * distance from the diagram edges. Prevents nodes from overlapping
 * titles, legends, or other chrome placed outside the layout area.
 */

import type { LayoutResult, GraphSpec, LayoutRule, Violation, LayoutNode } from '../types.js';

export interface ContentMarginOptions {
  /** Minimum distance from top edge in pixels (default: 60). */
  top?: number;
  /** Minimum distance from left edge in pixels (default: 0 — Dagre handles this). */
  left?: number;
}

export class ContentMarginRule implements LayoutRule {
  id = 'content-margin';
  description = 'Ensure layout content does not overlap reserved margin areas';
  severity = 'warning' as const;
  private top: number;
  private left: number;

  constructor(options?: ContentMarginOptions) {
    this.top = options?.top ?? 60;
    this.left = options?.left ?? 0;
  }

  check(layout: LayoutResult, _spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];

    for (const [id, node] of layout.nodes) {
      const nodeTop = node.y - node.height / 2;
      if (this.top > 0 && nodeTop < this.top) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Node "${id}" top edge (${Math.round(nodeTop)}px) intrudes into reserved top margin (${this.top}px)`,
          affectedElements: [id],
        });
      }
      const nodeLeft = node.x - node.width / 2;
      if (this.left > 0 && nodeLeft < this.left) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Node "${id}" left edge (${Math.round(nodeLeft)}px) intrudes into reserved left margin (${this.left}px)`,
          affectedElements: [id],
        });
      }
    }

    return violations;
  }

  fix(layout: LayoutResult, _spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);

    // Find the topmost and leftmost content positions
    let minTop = Infinity;
    let minLeft = Infinity;
    for (const [, node] of result.nodes) {
      minTop = Math.min(minTop, node.y - node.height / 2);
      minLeft = Math.min(minLeft, node.x - node.width / 2);
    }

    // Compute shifts needed
    const shiftY = this.top > 0 && minTop < this.top ? this.top - minTop : 0;
    const shiftX = this.left > 0 && minLeft < this.left ? this.left - minLeft : 0;

    if (shiftY === 0 && shiftX === 0) return result;

    // Apply uniform shift to all nodes
    for (const [, node] of result.nodes) {
      node.y += shiftY;
      node.x += shiftX;
    }

    result.height += shiftY;
    result.width += shiftX;

    return result;
  }
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
