/* global fetch, AbortSignal, setTimeout */
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ensureBackendReference, realTestOrigin } from './real-origin.mjs';
import { redactRealLog } from './real-log.mjs';

// Validate before Docker, source access or any HTTP. This runner creates its own server.
const { origin, port } = realTestOrigin(process.env.E2E_BASE_URL);
const root = fileURLToPath(new URL('..', import.meta.url));
const backendCommit = '166f35d63366a0da6551158fee4f2ba9760473c5';
const reference = resolve(
  process.env.E2E_BACKEND_REFERENCE ?? join(root, '.cache/backend-166f35d'),
);
const template = join(root, 'tests/integration/backend-fixture');
const baseImage = 'iskendy-local-spike:mac-20261008';
const name = 'iskendy-frontend-real-' + randomUUID();
const image = name + ':synthetic';
await mkdir(join(root, 'artifacts'), { recursive: true });
const output = await mkdtemp(join(root, 'artifacts/real-backend-'));
const context = await mkdtemp(join(tmpdir(), 'iskendy-frontend-real-'));
const env = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: join(root, '.cache/ms-playwright'),
};
const summary = {
  origin,
  backendCommit,
  syntheticOnly: true,
  stages: [],
  passed: false,
};
let containerAttempted = false,
  imageAttempted = false,
  failure;
function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8' });
  if (result.error || result.status !== 0)
    throw new Error('Local integration prerequisite unavailable: ' + command);
  return result.stdout.trim();
}
async function run(stage, command, args) {
  console.log('Integration: ' + stage);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  await writeFile(
    join(output, stage + '.log'),
    redactRealLog((result.stdout ?? '') + (result.stderr ?? '')),
  );
  summary.stages.push({ stage, exitCode: result.status });
  if (result.error || result.status !== 0)
    throw new Error(stage + ' failed; see its local artifact log.');
}
try {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))
    throw new Error(
      'A local Docker unix socket is required; remote Docker is refused.',
    );
  const endpoint = capture('docker', [
    'context',
    'inspect',
    '--format',
    '{{.Endpoints.docker.Host}}',
  ]);
  if (!endpoint.startsWith('unix://'))
    throw new Error('A local Docker context is required.');
  ensureBackendReference(reference, backendCommit, {
    exists: existsSync,
    git: (args) => capture('git', args),
  });
  if (capture('git', ['-C', reference, 'rev-parse', 'HEAD']) !== backendCommit)
    throw new Error('Backend reference must match the reviewed pinned commit.');
  if (capture('git', ['-C', reference, 'status', '--porcelain']))
    throw new Error('Backend reference must be clean.');
  summary.baseImage = capture('docker', [
    'image',
    'inspect',
    baseImage,
    '--format',
    '{{.Id}}',
  ]);
  summary.frontendCommit = capture('git', ['rev-parse', 'HEAD']);
  summary.frontendDirty = Boolean(capture('git', ['status', '--porcelain']));
  // Local clone copies committed files, never ignored .env/databases from the reference checkout.
  await run('clone-reference', 'git', [
    'clone',
    '--local',
    '--no-hardlinks',
    '--no-checkout',
    reference,
    join(context, 'reference'),
  ]);
  await run('pin-reference', 'git', [
    '-C',
    join(context, 'reference'),
    'checkout',
    '--detach',
    backendCommit,
  ]);
  await run('frontend-build', 'npm', ['run', 'build']);
  await cp(join(root, 'dist'), join(context, 'dist'), { recursive: true });
  await cp(
    join(template, 'local-backend-spike.py'),
    join(context, 'local-backend-spike.py'),
  );
  await cp(join(template, 'Dockerfile'), join(context, 'Dockerfile'));
  imageAttempted = true;
  await run('docker-build', 'docker', [
    'build',
    '--network',
    'none',
    '-t',
    image,
    context,
  ]);
  containerAttempted = true;
  await run('docker-start', 'docker', [
    'run',
    '-d',
    '--name',
    name,
    '--label',
    'iskendy.scope=frontend-synthetic',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=128m',
    '-p',
    '127.0.0.1:' + port + ':8099',
    image,
  ]);
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin + '/api/health', {
        redirect: 'error',
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).ok === true) {
        ready = true;
        break;
      }
    } catch {
      /* Only our freshly created local server may still be starting. */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  if (!ready) throw new Error('Synthetic backend health timed out.');
  await run('container-source', 'docker', [
    'exec',
    name,
    'git',
    '-C',
    '/reference-current',
    'rev-parse',
    'HEAD',
  ]);
  if (
    (await readFile(join(output, 'container-source.log'), 'utf8')).trim() !==
    backendCommit
  )
    throw new Error('Container source revision mismatch.');
  for (const filename of [
    'http-contract-check.mjs',
    'chromium-rating-check.mjs',
    'webkit-rating-check.mjs',
    'status-browser-check.mjs',
    'legacy-current.spec.ts',
    'playwright.config.mjs',
  ]) {
    let source = (
      await readFile(
        [
          'status-browser-check.mjs',
          'chromium-rating-check.mjs',
          'webkit-rating-check.mjs',
        ].includes(filename)
          ? join(root, 'tests/integration', filename)
          : join(template, filename),
        'utf8',
      )
    ).replaceAll('http://127.0.0.1:8103', origin);
    if (filename === 'playwright.config.mjs') {
      source = source.replace("trace: 'retain-on-failure'", "trace: 'off'");
      source = source
        .replace(
          "resolve('playwright-report-spike')",
          JSON.stringify(join(output, 'playwright-report')),
        )
        .replace(
          "resolve('test-results-spike')",
          JSON.stringify(join(output, 'test-results')),
        );
    }
    await writeFile(join(output, filename), source);
  }
  for (const [stage, file] of [
    ['http-contract', 'http-contract-check.mjs'],
    ['chromium-rating', 'chromium-rating-check.mjs'],
    ['webkit-rating', 'webkit-rating-check.mjs'],
    ['status-browsers', 'status-browser-check.mjs'],
  ])
    await run(stage, process.execPath, [join(output, file)]);
  await run('legacy-csp', process.execPath, [
    join(root, 'node_modules/@playwright/test/cli.js'),
    'test',
    '--config',
    join(output, 'playwright.config.mjs'),
  ]);
  summary.passed = true;
} catch (error) {
  failure =
    error instanceof Error ? error.message : 'Local integration failed.';
  summary.failure = failure;
} finally {
  if (containerAttempted) {
    const result = spawnSync('docker', ['rm', '-f', name], {
      encoding: 'utf8',
    });
    summary.containerRemoved = result.status === 0;
    if (result.status !== 0) {
      summary.passed = false;
      failure ??= 'Own test container cleanup failed.';
    }
  }
  if (imageAttempted) {
    const result = spawnSync('docker', ['image', 'rm', image], {
      encoding: 'utf8',
    });
    summary.imageTagRemoved = result.status === 0;
  }
  await rm(context, { recursive: true, force: true });
  await writeFile(
    join(output, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
}
console.log('Local integration artifacts: ' + output);
if (failure) {
  console.error(failure);
  process.exitCode = 1;
} else
  console.log(
    'PASS: isolated HTTP contracts, 4 rating + 2 status flows and 18 legacy/CSP tests; own server removed.',
  );
