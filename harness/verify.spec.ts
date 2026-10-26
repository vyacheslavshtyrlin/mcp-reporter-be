import { describe, expect, it } from 'vitest';
import { getVerificationPlan, parseVerificationArguments } from './verify.js';

describe('verification harness', () => {
  it('uses progressively broader plans', () => {
    expect(getVerificationPlan('task')).toEqual([
      'docs:check',
      'format:check',
      'lint',
      'typecheck',
      'test',
      'build',
    ]);
    expect(getVerificationPlan('feature')).toEqual([
      'docs:check',
      'format:check',
      'lint',
      'typecheck',
      'test:cov',
      'build',
    ]);
    expect(getVerificationPlan('epic')).toEqual([
      'docs:check',
      'format:check',
      'lint',
      'typecheck',
      'test:cov',
      'test:e2e',
      'build',
    ]);
  });

  it('parses a supported scope and dry-run flag', () => {
    expect(parseVerificationArguments(['feature', '--dry-run'])).toEqual({
      scope: 'feature',
      dryRun: true,
    });
  });

  it.each([
    { args: [] },
    { args: ['unknown'] },
    { args: ['task', 'feature'] },
    { args: ['task', '--unknown'] },
  ])('rejects invalid arguments: $args', ({ args }) => {
    expect(() => parseVerificationArguments(args)).toThrow(
      'Usage: npm run verify -- <task|feature|epic> [--dry-run]',
    );
  });
});
