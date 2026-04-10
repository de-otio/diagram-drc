import type { LayoutRule } from '../types.js';
import { ContentMarginRule } from './content-margin.js';
import { CrossingMinimizationRule } from './crossing-minimization.js';
import { RankCompactionRule } from './rank-compaction.js';
import { SpacingRule } from './spacing.js';

export { ContentMarginRule } from './content-margin.js';
export { CrossingMinimizationRule } from './crossing-minimization.js';
export { RankCompactionRule } from './rank-compaction.js';
export { SpacingRule } from './spacing.js';

/** Returns the default set of built-in rules in recommended evaluation order. */
export function builtinRules(): LayoutRule[] {
  return [
    new CrossingMinimizationRule(),
    new RankCompactionRule(),
    new SpacingRule(),
    new ContentMarginRule(),
  ];
}
