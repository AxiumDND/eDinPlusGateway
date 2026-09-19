const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');

test('package-lock version matches package.json', () => {
  const lock = require('../package-lock.json');
  assert.equal(lock.version, pkg.version);
});

test('changelog has a section for the current package version', () => {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, new RegExp(`^## \\[${pkg.version.replace(/\./g, '\\.')}\\]`, 'm'));
});

test('changelog-notes prints the current version section', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'changelog-notes.js'), pkg.version], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(pkg.version));
  assert.doesNotMatch(result.stdout, /^## \[Unreleased\]/m);
});

test('renderer version fallback is not a hardcoded semver', () => {
  const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
  const fn = renderer.match(/async function loadAppVersion\([\s\S]*?\n\}/);
  assert.ok(fn, 'loadAppVersion is defined');
  const fallback = fn[0].match(/return '([^']*)';\s*$/m);
  assert.ok(fallback, 'loadAppVersion has a string fallback');
  assert.doesNotMatch(fallback[1], /^\d+\.\d+\.\d+$/);
});

test('Windows portable artifact name is unversioned-pattern stable', () => {
  assert.equal(pkg.build.win.target[0].target, 'portable');
  assert.equal(pkg.build.portable.artifactName, 'eDIN-Plus-Gateway-Control-${version}.exe');
});

test('README points at the live repo, changelog, and MIT license', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /github\.com\/AxiumDND\/eDinPlusGateway/);
  assert.match(readme, /CHANGELOG\.md/);
  assert.match(readme, /LICENSE/);
  assert.match(readme, /1\.5\.0/);
});

test('Dependabot stack is on current majors', () => {
  assert.equal(pkg.devDependencies.electron, '^44.4.1');
  assert.equal(pkg.devDependencies['electron-builder'], '^26.15.3');
  assert.equal(pkg.dependencies, undefined);
  const release = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
  const tests = fs.readFileSync(path.join(root, '.github/workflows/test.yml'), 'utf8');
  assert.match(tests, /actions\/checkout@v7/);
  assert.match(tests, /actions\/setup-node@v7/);
  assert.match(release, /actions\/checkout@v7/);
  assert.match(release, /softprops\/action-gh-release@v3/);
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.doesNotMatch(main, /node-fetch/);
});

test('release workflow publishes SHA256SUMS and the portable exe', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
  assert.match(workflow, /tags:\s*\n\s*-\s*'v\*'/);
  assert.match(workflow, /SHA256SUMS\.txt/);
  assert.match(workflow, /electron-builder --win portable/);
});
