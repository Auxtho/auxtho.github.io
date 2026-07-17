const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const files = [
  ...fs.readdirSync(path.join(root, 'scripts', 'release'))
    .filter((name) => name.endsWith('.cjs'))
    .map((name) => path.join(root, 'scripts', 'release', name)),
  ...fs.readdirSync(path.join(root, 'assets'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(root, 'assets', name)),
].sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}
process.stdout.write(`javascript-contract checked=${files.length}\n`);
