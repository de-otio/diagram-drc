import type { LayoutRule } from '../types.js';
import { CrossingMinimizationRule } from './crossing-minimization.js';
import { SpacingRule } from './spacing.js';

export { CrossingMinimizationRule } from './crossing-minimization.js';
export { SpacingRule } from './spacing.js';

/** Returns the default set of built-in rules in recommended evaluation order. */
export function builtinRules(): LayoutRule[] {
  return [
    new CrossingMinimizationRule(),
    new SpacingRule(),
  ];
}
