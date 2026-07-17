const fs = require('fs');
const path = require('path');

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RELEASE_TEMPLATE = [
  '---',
  'layout: null',
  'permalink: /release.json',
  '---',
  '{"source_sha": {{ site.github.build_revision | jsonify }}}',
].join('\n');

function validateSourceSha(sourceSha) {
  if (typeof sourceSha !== 'string' || !SHA_PATTERN.test(sourceSha)) {
    throw new Error('expected source SHA must be exactly 40 lowercase hexadecimal characters');
  }
  return sourceSha;
}

function validateGeneratedRelease(document, expectedSourceSha) {
  const sourceSha = validateSourceSha(expectedSourceSha);
  let payload;
  try {
    payload = JSON.parse(document);
  } catch (error) {
    throw new Error('generated release metadata must be valid JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('generated release metadata must be a JSON object');
  }
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'source_sha') {
    throw new Error('generated release metadata must contain only source_sha');
  }
  if (payload.source_sha !== sourceSha) {
    throw new Error(`generated source_sha ${String(payload.source_sha)} does not match ${sourceSha}`);
  }
  return payload;
}

function validateReleaseTemplate(document) {
  const normalized = String(document).replace(/\r\n/g, '\n').trimEnd();
  if (normalized !== RELEASE_TEMPLATE) {
    throw new Error('release.json must remain the exact build_revision template');
  }
  return true;
}

function run(arguments_) {
  if (arguments_.length !== 2) {
    throw new Error('usage: node scripts/verify-release-contract.cjs <generated-release.json> <source-sha>');
  }
  const releasePath = path.resolve(arguments_[0]);
  const payload = validateGeneratedRelease(fs.readFileSync(releasePath, 'utf8'), arguments_[1]);
  process.stdout.write(`release-contract source_sha=${payload.source_sha}\n`);
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`release-contract: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  RELEASE_TEMPLATE,
  validateGeneratedRelease,
  validateReleaseTemplate,
  validateSourceSha,
};
