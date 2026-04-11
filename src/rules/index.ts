import type { LayoutRule } from '../types.js';
import { BoundaryAffinityRule } from './boundary-affinity.js';
import { ContentMarginRule } from './content-margin.js';
import { CrossingMinimizationRule } from './crossing-minimization.js';
import { EdgeNodeOverlapRule } from './edge-node-overlap.js';
import { EdgeStraighteningRule } from './edge-straightening.js';
import { GroupProximityRule } from './group-proximity.js';
import { GroupSnapRule } from './group-snap.js';
import { MedianPositionRule } from './median-position.js';
import { RankCompactionRule } from './rank-compaction.js';
import { SpacingRule } from './spacing.js';
import { TargetYAlignmentRule } from './target-y-alignment.js';

export { BoundaryAffinityRule } from './boundary-affinity.js';
export { ContentMarginRule } from './content-margin.js';
export { CrossingMinimizationRule } from './crossing-minimization.js';
export { EdgeNodeOverlapRule } from './edge-node-overlap.js';
export { EdgeStraighteningRule } from './edge-straightening.js';
export { GroupProximityRule } from './group-proximity.js';
export { GroupSnapRule } from './group-snap.js';
export { MedianPositionRule } from './median-position.js';
export { RankCompactionRule } from './rank-compaction.js';
export { SpacingRule } from './spacing.js';
export { TargetYAlignmentRule } from './target-y-alignment.js';

/** Returns the default set of built-in rules in recommended evaluation order. */
export function builtinRules(): LayoutRule[] {
  return [
    new GroupProximityRule(),
    new CrossingMinimizationRule(),
    new MedianPositionRule(),
    new BoundaryAffinityRule(),
    new TargetYAlignmentRule(),
    new RankCompactionRule(),
    new SpacingRule(),
    new EdgeNodeOverlapRule(),
    new EdgeStraighteningRule(),
    new SpacingRule(),          // second pass — fix overlaps from steps 8–9
    new GroupSnapRule(),
    new ContentMarginRule(),
  ];
}
