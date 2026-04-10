/**
 * Dagre layout engine wrapper.
 *
 * Takes a GraphSpec and assigns x/y coordinates to all nodes using
 * the Dagre directed graph layout algorithm. Groups are laid out as
 * compound nodes.
 */

import dagre from '@dagrejs/dagre';
import type { GraphSpec, LayoutResult, LayoutNode, LayoutEdge } from '../types.js';

export interface LayoutOptions {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
  ranksep?: number;
  nodesep?: number;
  marginx?: number;
  marginy?: number;
  /** Minimum group width/height */
  groupMinWidth?: number;
  groupMinHeight?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
  rankdir: 'TB',
  ranksep: 120,
  nodesep: 80,
  marginx: 60,
  marginy: 60,
  groupMinWidth: 250,
  groupMinHeight: 140,
};

export function dagreLayout(spec: GraphSpec, options?: LayoutOptions): LayoutResult {
  const opts = { ...DEFAULTS, ...options };

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: opts.rankdir,
    ranksep: opts.ranksep,
    nodesep: opts.nodesep,
    marginx: opts.marginx,
    marginy: opts.marginy,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add group (compound) nodes
  for (const group of spec.groups ?? []) {
    g.setNode(group.id, {
      label: group.label,
      width: opts.groupMinWidth,
      height: opts.groupMinHeight,
      clusterLabelPos: 'top',
    });
  }

  // Add nodes
  for (const node of spec.nodes) {
    g.setNode(node.id, {
      label: node.label,
      width: node.width,
      height: node.height,
    });
  }

  // Assign children to parent groups
  for (const group of spec.groups ?? []) {
    for (const childId of group.children) {
      if (g.hasNode(childId)) {
        g.setParent(childId, group.id);
      }
    }
  }

  // Add edges
  for (const edge of spec.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target, { label: edge.label ?? '' });
    }
  }

  dagre.layout(g);

  // Extract results
  const nodeMap = new Map<string, LayoutNode>();
  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId);
    if (node) {
      nodeMap.set(nodeId, {
        id: nodeId,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      });
    }
  }

  const layoutEdges: LayoutEdge[] = [];
  for (const edgeObj of g.edges()) {
    const edge = g.edge(edgeObj);
    if (edge) {
      layoutEdges.push({
        source: edgeObj.v,
        target: edgeObj.w,
        points: edge.points ?? [],
      });
    }
  }

  const graphInfo = g.graph();

  return {
    nodes: nodeMap,
    edges: layoutEdges,
    width: graphInfo?.width ?? 800,
    height: graphInfo?.height ?? 600,
  };
}
