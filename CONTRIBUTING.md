# Contributing to diagram-drc

Thanks for your interest in contributing!

## Getting started

```bash
git clone git@github.com:de-otio/diagram-drc.git
cd diagram-drc
npm install
npm test
```

## Development workflow

1. Fork the repo and create a feature branch
2. Write your code in `src/`
3. Add tests in `src/__tests__/`
4. Run `npm test` and `npm run typecheck`
5. Open a PR against `main`

## Code style

- TypeScript strict mode
- ESM imports with `.js` extensions (Node16 module resolution)
- No default exports

## Adding a new rule

Implement the `LayoutRule` interface from `src/types.ts`:

```typescript
import type { LayoutRule, LayoutResult, GraphSpec, Violation } from '../types.js';

export class MyRule implements LayoutRule {
  id = 'my-rule';
  description = 'What this rule checks';
  severity = 'warning' as const;

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    // Detect violations without mutating layout
    return [];
  }

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    // Return a new layout with violations fixed
    return layout;
  }
}
```

Then export it from `src/rules/index.ts` and add it to `builtinRules()`.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
