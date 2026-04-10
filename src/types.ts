/**
 * Core type definitions for diagram-drc.
 *
 * Three layers:
 *  1. Graph representation (format-agnostic)
 *  2. Layout result (positioned graph)
 *  3. DRC rule system (check + fix)
 */

// ── Layer 1: Graph representation ──────────────────────────────────────────

export interface GraphSpec {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups?: GraphGroup[];
  metadata?: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  label: string;
  width: number;
  height: number;
  type?: string;
  group?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphGroup {
  id: string;
  label: string;
  children: string[];
  metadata?: Record<string, unknown>;
}

export interface Point {
  x: number;
  y: number;
}

// ── Layer 2: Layout result ─────────────────────────────────────────────────

export interface LayoutResult {
  nodes: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
  points: Point[];
}

// ── Layer 3: DRC rule system ───────────────────────────────────────────────

export type Severity = 'error' | 'warning' | 'info';

export interface Violation {
  /** Rule that produced this violation */
  ruleId: string;
  severity: Severity;
  message: string;
  /** IDs of affected nodes or edges */
  affectedElements: string[];
  /** Bounding box of the violation region */
  region?: { x: number; y: number; width: number; height: number };
}

/**
 * A layout rule that can detect violations and optionally fix them.
 *
 * Inspired by IC layout Design Rule Checks (DRC): each rule encodes
 * a single quality constraint (spacing, crossing, overlap, etc.).
 * Rules are composable — the engine runs them in sequence.
 */
export interface LayoutRule {
  /** Unique identifier, e.g. "crossing-minimization" */
  id: string;
  /** Human-readable description */
  description: string;
  /** Default severity for violations produced by this rule */
  severity: Severity;
  /**
   * Check mode: detect violations without modifying the layout.
   * Must be side-effect free.
   */
  check(layout: LayoutResult, spec: GraphSpec): Violation[];
  /**
   * Fix mode: return a new LayoutResult with violations resolved.
   * The engine calls check() after fix() to verify.
   */
  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult;
}

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  violations: Violation[];
}

export interface DrcReport {
  /** All violations across all rules */
  violations: Violation[];
  /** Per-rule breakdown */
  results: RuleResult[];
  /** Overall pass/fail */
  passed: boolean;
  timestamp: string;
}

export interface EngineOptions {
  /** Rules to evaluate (defaults to builtinRules()) */
  rules?: LayoutRule[];
  /** Minimum severity to include in reports (default: 'info') */
  minSeverity?: Severity;
}
