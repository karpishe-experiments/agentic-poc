import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { select, parseDiff, deploymentTests, documentTest, adaptAvailableSuites, acceptanceExclusions } from './selection.mjs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const file = process.env.CI_SELECTION_FILE ?? path.join(process.env.RUNNER_TEMP ?? tmpdir(), 'ci-selection.json');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const resolve = ref => {
  if (!ref) throw new Error('A comparison ref is required');
  return git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`);
};
function run(bin, args) { execFileSync(bin, args, { stdio: 'inherit' }); }
const vitest = args => run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--bail=1', '--retry=0', ...args]);
const command = process.argv[2];
if (command === 'select') {
  const mode = process.env.GITHUB_EVENT_NAME === 'pull_request' ? 'pr' : (process.env.CI_MODE ?? 'full');
  if (!['pr', 'full', 'affected'].includes(mode)) throw new Error('Invalid validation mode');
  const head = resolve(process.env.GITHUB_SHA ?? 'HEAD');
  let base = null;
  if (mode !== 'full') {
    base = resolve(mode === 'pr' ? process.env.BASE_SHA : process.env.BASE_REF);
    if (mode === 'affected') base = git('merge-base', base, head);
  }
  const changes = base ? parseDiff(execFileSync('git', ['diff', '--name-status', '-z', '--find-renames', base, head, '--'], { encoding: 'utf8' })) : [];
  const selection = { mode, head, base, ...select(changes, mode === 'full') };
  adaptAvailableSuites(selection, existsSync);
  // Older release lines do not contain the optional specialty mockup suite.
  // Existing mockup sources still require their configuration and must fail if it is missing.
  if (selection.flags.mockup && !existsSync('vitest.mockup.config.ts') &&
      !['tests/mockups', 'lib/mockups/specialty-management', 'components/mockups/specialty-management', 'app/mockups/specialty-management'].some(p => existsSync(p))) {
    selection.flags.mockup = false;
    selection.reasons.push({ path: 'vitest.mockup.config.ts', category: 'mockup suite absent on this branch' });
  }
  writeFileSync(file, JSON.stringify(selection, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(selection.flags).map(([k,v]) => `${k}=${v}\n`).join(''));
  console.log(JSON.stringify(selection, null, 2));
} else if (command === 'summary') {
  const selection = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const text = `## Validation\n\nOutcome: ${process.env.CI_OUTCOME}\n\n${selection ? `Mode: ${selection.mode}\n\nBase: ${selection.base ?? 'all checks'}\nHead: ${selection.head}\n\n${Object.entries(selection.flags).map(([k,v]) => `- ${k}: ${v ? 'selected' : 'skipped'}`).join('\n')}` : 'Selection failed before checks could run.'}\n\nProduction/container builds are performed during deployment. Browser checks perform discovery only.\n`;
  const exclusions = selection ? acceptanceExclusions(selection) : [];
  const summary = text + (exclusions.length ? `\nUnchanged acceptance journeys excluded from this scope (available in full mode):\n${exclusions.map(p => `- ${p}`).join('\n')}\n` : '');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  else console.log(summary);
} else if (command === 'contracts' || command === 'tests') {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  for (const p of [...s.tests, ...s.mockupTests, ...s.browserTests]) if (!existsSync(p)) throw new Error(`Expected test missing: ${p}`);
  const pure = s.tests.filter(p => deploymentTests.includes(p) || p === documentTest);
  if (command === 'contracts') { if (pure.length) vitest(['--config', 'vitest.ci-contracts.config.ts', ...pure]); }
  else {
    const appTests = s.tests.filter(p => !pure.includes(p));
    if (s.flags.app || appTests.length) vitest([...appTests, ...acceptanceExclusions(s).flatMap(p => ['--exclude', p])]);
    if (s.flags.mockup || s.mockupTests.length) vitest(['--config', 'vitest.mockup.config.ts', ...s.mockupTests]);
    for (const config of ['playwright.config.ts', 'playwright.mockup.config.ts']) {
      const paths = s.browserTests.filter(p => p.startsWith('tests/mockups/') === config.includes('mockup'));
      if (paths.length) run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--list', '--config', config, ...paths.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))]);
    }
  }
} else throw new Error('Expected select, contracts, tests, or summary');
