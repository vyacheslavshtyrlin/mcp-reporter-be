import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export type VerificationScope = 'task' | 'feature' | 'epic';

export interface VerificationOptions {
  readonly scope: VerificationScope;
  readonly dryRun: boolean;
}

const commonChecks = [
  'docs:check',
  'format:check',
  'lint',
  'typecheck',
] as const;

const verificationPlans: Readonly<
  Record<VerificationScope, readonly string[]>
> = {
  task: [...commonChecks, 'test', 'build'],
  feature: [...commonChecks, 'test:cov', 'build'],
  epic: [...commonChecks, 'test:cov', 'test:e2e', 'build'],
};

export function parseVerificationArguments(
  args: readonly string[],
): VerificationOptions {
  const positionalArguments = args.filter(
    (argument) => !argument.startsWith('--'),
  );
  const unknownFlags = args.filter(
    (argument) => argument.startsWith('--') && argument !== '--dry-run',
  );
  const scope = positionalArguments[0];

  if (
    positionalArguments.length !== 1 ||
    unknownFlags.length > 0 ||
    (scope !== 'task' && scope !== 'feature' && scope !== 'epic')
  ) {
    throw new Error('Usage: npm run verify -- <task|feature|epic> [--dry-run]');
  }

  return {
    scope,
    dryRun: args.includes('--dry-run'),
  };
}

export function getVerificationPlan(
  scope: VerificationScope,
): readonly string[] {
  return verificationPlans[scope];
}

export function runVerification(options: VerificationOptions): number {
  const plan = getVerificationPlan(options.scope);

  console.log(`Verification scope: ${options.scope}`);
  console.log(`Checks: ${plan.join(' -> ')}`);

  if (options.dryRun) {
    console.log('Dry run: no checks executed.');
    return 0;
  }

  const npmCliPath = process.env.npm_execpath;

  if (npmCliPath === undefined || npmCliPath.length === 0) {
    console.error(
      '[harness] npm_execpath is unavailable. Run the harness through npm run verify.',
    );
    return 1;
  }

  for (const scriptName of plan) {
    console.log(`\n[harness] npm run ${scriptName}`);

    const result = spawnSync(
      process.execPath,
      [npmCliPath, 'run', scriptName],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit',
        windowsHide: true,
      },
    );

    if (result.error !== undefined) {
      console.error(`[harness] Failed to start ${scriptName}:`, result.error);
      return 1;
    }

    if (result.status !== 0) {
      console.error(
        `[harness] ${scriptName} failed with exit code ${result.status ?? 1}.`,
      );
      return result.status ?? 1;
    }
  }

  console.log(`\n[harness] ${options.scope} verification passed.`);
  return 0;
}

function main(): number {
  try {
    return runVerification(parseVerificationArguments(process.argv.slice(2)));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

const entryPoint = process.argv[1];

if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  process.exitCode = main();
}
