const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');

function collectJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectJavaScriptFiles(fullPath));
    else if (entry.isFile() && /\.c?js$/.test(entry.name)) files.push(fullPath);
  }
  return files.sort();
}

function validateJavaScriptFiles(files) {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `JavaScript validation failed: ${file}`);
  }
  return files.length;
}

if (require.main === module) {
  try {
    const files = [
      ...collectJavaScriptFiles(path.join(root, 'scripts', 'release')).filter((file) => file.endsWith('.cjs')),
      ...collectJavaScriptFiles(path.join(root, 'assets')),
    ].sort();
    process.stdout.write(`javascript-contract checked=${validateJavaScriptFiles(files)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { collectJavaScriptFiles, validateJavaScriptFiles };
