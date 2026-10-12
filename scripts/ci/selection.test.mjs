import { test } from 'node:test';
import assert from 'node:assert/strict';
import { select, parseDiff, difyTests, documentTest, adaptAvailableSuites, acceptanceTests, acceptanceExclusions } from './selection.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pick = (...paths) => select(paths.map(path => ({ path })));
test('PR validation skips unchanged acceptance journeys, not changed tests or full validation', () => {
  const shared = { mode: 'pr', ...pick('db/experiment-repository.ts') };
  assert.deepEqual(acceptanceExclusions(shared), acceptanceTests);
  const changed = { mode: 'pr', ...pick('db/experiment-repository.ts', acceptanceTests[0]) };
  assert.deepEqual(acceptanceExclusions(changed), [acceptanceTests[1]]);
  assert.deepEqual(acceptanceExclusions({ ...shared, mode: 'full' }), []);
  assert.deepEqual(acceptanceExclusions({ mode: 'affected', ...pick(acceptanceTests[1]) }), [acceptanceTests[0]]);
});
test('docs-only branches skip absent Dify contracts but implementations require them', () => {
  const paths = ['docs/accepted/2026-09-16_agent-platform-decision/tools.openapi.json'];
  const absent = pick(...paths);
  adaptAvailableSuites(absent, () => false);
  assert.deepEqual(absent.tests, []);
  assert.equal(absent.flags.node, false);
  const fixture = pick('docs/accepted/2026-09-16_agent-platform-decision/fixtures.json');
  adaptAvailableSuites(fixture, () => false);
  assert.deepEqual(fixture.tests, []);
  assert.equal(fixture.flags.node, false);
  const mixed = pick('docs/accepted/2026-09-16_agent-platform-decision/fixtures.json', 'tests/unit/other.test.ts');
  adaptAvailableSuites(mixed, () => false);
  assert.deepEqual(mixed.tests, ['tests/unit/other.test.ts']);
  assert.equal(mixed.flags.static, true);
  for (const present of [documentTest, 'lib/dify-experiment']) {
    const available = pick(...paths);
    adaptAvailableSuites(available, p => p === present);
    assert.deepEqual(available.tests, [documentTest]);
    assert.equal(available.flags.node, true);
  }
});
test('documentation does not install dependencies', () => {
  assert.equal(pick('README.md', 'docs/deployment/runbook.md', '.agents/skills/example/SKILL.md').flags.node, false);
});
test('Dify executable documents use pure contracts', () => {
  for (const name of ['tools.openapi.json', 'illustrate-panel.yml']) {
    const s = pick(`docs/accepted/2026-09-16_agent-platform-decision/${name}`);
    assert.deepEqual(s.tests, [documentTest]);
    assert.equal(s.flags.app, false);
  }
});
test('isolated Dify selects only its suite', () => {
  const s = pick('lib/dify-experiment/service.ts');
  assert.deepEqual(s.tests, [...difyTests].sort());
  assert.equal(s.flags.app, false);
  assert.equal(s.flags.static, true);
});
test('mockup and deployment categories combine without full app', () => {
  const s = pick('lib/mockups/specialty-management/state.ts', 'deploy/compose.yml');
  assert.equal(s.flags.mockup, true);
  assert.equal(s.flags.shell, true);
  assert.equal(s.flags.app, false);
});
test('shared and unknown paths retain broad coverage', () => {
  assert.equal(pick('lib/config/env.ts').flags.app, true);
  for (const p of ['proxy.ts', 'package-lock.json', 'unknown.config', '.github/workflows/validate.yml']) {
    assert.equal(Object.values(pick(p).flags).every(Boolean), true);
  }
});
test('full app deduplicates focused contracts', () => {
  assert.deepEqual(pick('lib/application/booklet-service.ts', 'lib/dify-experiment/service.ts', '.github/workflows/deploy.yml').tests, []);
});
test('test changes and deleted tests select appropriate scope', () => {
  assert.deepEqual(pick('tests/unit/a.test.ts').tests, ['tests/unit/a.test.ts']);
  assert.equal(select([{path:'tests/unit/a.test.ts',deleted:true}]).flags.app, true);
  assert.equal(select([{path:'tests/mockups/a.test.ts',deleted:true}]).flags.mockup, true);
});
test('NUL diff handles renames, deletions, and spaces', () => {
  assert.deepEqual(parseDiff('R100\0old name.ts\0new name.ts\0D\0gone.ts\0'), [
    {path:'old name.ts',deleted:true}, {path:'new name.ts',deleted:false}, {path:'gone.ts',deleted:true},
  ]);
  assert.throws(() => parseDiff('R100\0old\0'));
});
test('empty selection skips checks; full selection runs all', () => {
  assert.equal(Object.values(select([]).flags).some(Boolean), false);
  assert.equal(Object.values(select([], true).flags).every(Boolean), true);
});
test('Terraform documentation skips initialization and roots are independent', () => {
  assert.equal(pick('infra/terraform/README.md').flags.terraform, false);
  const s = pick('infra/terraform/bootstrap/main.tf');
  assert.equal(s.flags.bootstrap, true);
  assert.equal(s.flags.terraform, false);
});

test('CLI rejects missing/invalid refs and supports full and affected modes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-selection-'));
  try {
    const file = path.join(dir, 'selection.json');
    const invoke = extra => spawnSync(process.execPath, ['scripts/ci/validate.mjs', 'select'], {
      encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: 'HEAD', GITHUB_OUTPUT: '', CI_SELECTION_FILE: file, ...extra },
    });
    assert.notEqual(invoke({ CI_MODE: 'affected', BASE_REF: '' }).status, 0);
    assert.notEqual(invoke({ CI_MODE: 'affected', BASE_REF: 'refs/heads/nonexistent-ci-test' }).status, 0);
    assert.equal(invoke({ CI_MODE: 'affected', BASE_REF: 'HEAD' }).status, 0);
    assert.equal(JSON.parse(readFileSync(file)).flags.node, false);
    assert.equal(invoke({ CI_MODE: 'full' }).status, 0);
    assert.equal(JSON.parse(readFileSync(file)).flags.app, true);
    const mockupPresent = ['vitest.mockup.config.ts', 'tests/mockups', 'lib/mockups/specialty-management', 'components/mockups/specialty-management', 'app/mockups/specialty-management'].some(p => existsSync(p));
    assert.equal(JSON.parse(readFileSync(file)).flags.mockup, mockupPresent);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runner fails on missing tests and stops after first failed command', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-runner-'));
  const cli = fileURLToPath(new URL('./validate.mjs', import.meta.url));
  try {
    const file = path.join(dir, 'selection.json');
    const s = select([{ path: 'tests/unit/missing.test.ts' }]);
    writeFileSync(file, JSON.stringify(s));
    const invoke = () => spawnSync(process.execPath, [cli, 'tests'], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI_SELECTION_FILE: file } });
    assert.match(invoke().stderr, /Expected test missing/);
    mkdirSync(path.join(dir, 'node_modules/vitest'), { recursive: true });
    writeFileSync(path.join(dir, 'node_modules/vitest/vitest.mjs'), 'console.log(JSON.stringify(process.argv.slice(2))); process.exit(1);');
    writeFileSync(file, JSON.stringify(select([], true)));
    const result = invoke();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /--bail=1/);
    assert.match(result.stdout, /--retry=0/);
    assert.doesNotMatch(result.stdout, /vitest.mockup/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
