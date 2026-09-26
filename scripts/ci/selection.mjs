export const difyTests = ['tests/integration/dify-experiment.test.ts', ...['adapter', 'http', 'routes', 'availability', 'openapi'].map(name => `tests/unit/dify-experiment-${name}.test.ts`)];
export const deploymentTests = ['tests/unit/deployment-contracts.test.ts', 'tests/unit/recovery-storage.test.ts', 'tests/unit/config/env.test.ts'];
export const documentTest = 'tests/unit/dify-experiment-openapi.test.ts';

export function parseDiff(text) {
  const tokens = text.split('\0');
  const changes = [];
  while (tokens.length && tokens[0]) {
    const status = tokens.shift();
    const path = tokens.shift();
    if (!path) throw new Error('Malformed Git diff');
    if (/^[RC]/.test(status)) {
      const target = tokens.shift();
      if (!target) throw new Error('Malformed Git rename');
      changes.push({ path, deleted: status.startsWith('R') }, { path: target, deleted: false });
    } else changes.push({ path, deleted: status === 'D' });
  }
  return changes;
}

export function select(changes, full = false) {
  const flags = Object.fromEntries(['static', 'app', 'mockup', 'agent', 'workflow', 'shell', 'terraform', 'bootstrap', 'selector', 'node'].map(key => [key, false]));
  const tests = new Set();
  const mockupTests = new Set();
  const browserTests = new Set();
  const reasons = [];
  const all = () => Object.keys(flags).forEach(key => { flags[key] = true; });
  const app = () => { flags.static = flags.app = flags.agent = true; };
  const deploy = () => deploymentTests.forEach(test => tests.add(test));
  if (full) all();
  for (const { path: p, deleted = false } of changes) {
    let category;
    if (p.startsWith('scripts/ci/') || p === '.github/workflows/validate.yml' || /^(package(-lock)?\.json|tsconfig.*|eslint\.config.*|vitest.*|playwright.*)$/.test(p) || /^tests\/(helpers\/|global-)/.test(p)) { all(); category = 'full'; }
    else if (p.startsWith('.agents/') || /\.md$/i.test(p) || /^(LICENSE|NOTICE)(\.|$)/.test(p) || p === 'skills-lock.json' || /^docs\/.*\.(png|jpg|jpeg|svg|webp|pdf)$/i.test(p)) category = 'documentation';
    else if (/^docs\/accepted\/2026-09-16_agent-platform-decision\/(tools.openapi.json|illustrate-panel.yml)$/.test(p)) { tests.add(documentTest); category = 'Dify documents'; }
    else if (/^(lib\/dify-experiment\/|lib\/contracts\/dify-experiment.ts$|app\/(api\/)?experiments\/dify\/|components\/dify-experiment\/|docs\/accepted\/2026-09-16_agent-platform-decision\/)/.test(p)) { flags.static = true; difyTests.forEach(t => tests.add(t)); category = 'Dify'; }
    else if (/^(lib\/mockups\/specialty-management\/|components\/mockups\/specialty-management\/|app\/mockups\/specialty-management\/|public\/mockups\/specialty-management\/|scripts\/.*(management-mockup|management-guideline-seed))/.test(p)) { flags.static = flags.mockup = true; category = 'mockup'; }
    else if (/^tests\/.*\.spec\.[jt]sx?$/.test(p)) { flags.static = true; if (!deleted) browserTests.add(p); category = 'browser discovery'; }
    else if (/^tests\/(unit|integration|mockups)\/.*\.test\.[jt]sx?$/.test(p)) {
      flags.static = true;
      if (p.startsWith('tests/mockups/')) { if (deleted) flags.mockup = true; else mockupTests.add(p); }
      else if (!deleted) tests.add(p);
      else if (p.includes('dify-experiment')) difyTests.forEach(t => { if (t !== p) tests.add(t); });
      else app();
      category = 'changed tests';
    }
    else if (p.startsWith('tests/agent/') || p === 'scripts/test-agent-fixtures.ts') { flags.agent = true; category = 'agent'; }
    else if (/^(deploy\/|infra\/config\/|scripts\/deploy\/|tests\/shell\/)/.test(p)) { flags.shell = true; deploy(); category = 'deployment'; }
    else if (p.startsWith('infra/terraform/bootstrap/')) { flags.bootstrap = true; category = 'bootstrap'; }
    else if (p.startsWith('infra/terraform/')) { flags.terraform = true; category = 'terraform'; }
    else if (/^\.github\/(workflows|actions)\//.test(p)) { flags.workflow = true; deploy(); category = 'workflow'; }
    else if (/^(Dockerfile|\.dockerignore|next\.config\.|scripts\/build)/.test(p)) { app(); deploy(); category = 'build inputs'; }
    else if (/^(app\/|components\/|lib\/|db\/|public\/|seeds\/)/.test(p)) { app(); category = 'shared application'; }
    else { all(); category = 'full fallback'; }
    reasons.push({ path: p, category });
  }
  if (flags.app) tests.clear();
  if (flags.mockup) mockupTests.clear();
  flags.node = flags.static || flags.app || flags.mockup || flags.agent || tests.size > 0 || mockupTests.size > 0 || browserTests.size > 0;
  return { flags, tests: [...tests].sort(), mockupTests: [...mockupTests].sort(), browserTests: [...browserTests].sort(), reasons };
}
