// Core types
export type {
  GraphSpec, GraphNode, GraphEdge, GraphGroup, Point,
  LayoutResult, LayoutNode, LayoutEdge,
  LayoutRule, Violation, Severity,
  RuleResult, DrcReport, EngineOptions,
} from './types.js';

// Engine
export { DrcEngine, createEngine } from './engine.js';

// Built-in rules
export { builtinRules, BoundaryAffinityRule, ContentMarginRule, CrossingMinimizationRule, EdgeNodeOverlapRule, EdgeStraighteningRule, GroupProximityRule, GroupSnapRule, MedianPositionRule, RankCompactionRule, SpacingRule, TargetYAlignmentRule } from './rules/index.js';

// Layout
export { dagreLayout } from './layout/index.js';
export type { LayoutOptions } from './layout/index.js';

// Render
export { renderMxGraph } from './render/index.js';
export type { RenderOptions, RenderStyles, NodeStyle, EdgeStyle, GroupStyle } from './render/index.js';
