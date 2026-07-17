const fs = require('node:fs');
const path = require('node:path');

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function exactSha(name, value) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) throw new Error(`HOLD: ${name} must be an exact SHA`);
  return value;
}

function createRollbackSignal(values) {
  return {
    schema_version: 1,
    signal: 'BACKEND_ROLLBACK_REQUIRED',
    candidate_site_sha: exactSha('candidate site SHA', values.candidateSiteSha),
    restored_site_sha: exactSha('restored site SHA', values.restoredSiteSha),
    candidate_backend_sha: exactSha('candidate backend SHA', values.candidateBackendSha),
    required_backend_rollback_sha: exactSha('required backend rollback SHA', values.rollbackBackendSha),
    completion_condition: 'site and backend readbacks both report the restored approved SHAs',
  };
}

function createFinalizeSignal(values) {
  return {
    schema_version: 1,
    signal: 'BACKEND_FINALIZE_REQUIRED',
    published_site_sha: exactSha('published site SHA', values.candidateSiteSha),
    bridge_reported_site_sha: exactSha('bridge-reported legacy site SHA', values.restoredSiteSha),
    bridge_backend_sha: exactSha('bridge backend SHA', values.candidateBackendSha),
    required_final_backend_sha: exactSha('required final backend SHA', values.finalBackendSha),
    required_final_reported_site_sha: exactSha('required final reported site SHA', values.candidateSiteSha),
    completion_condition: 'final backend status reports the published site SHA before the release succeeds',
  };
}

function run(argv) {
  if (argv.length !== 2 || !['finalize', 'rollback'].includes(argv[0])) {
    throw new Error('HOLD: usage: rollback-signal.cjs <finalize|rollback> <output.json>');
  }
  const values = {
    candidateSiteSha: process.env.REQUESTED_SITE_SHA,
    restoredSiteSha: process.env.REQUESTED_ROLLBACK_SITE_SHA,
    candidateBackendSha: process.env.REQUESTED_BACKEND_BRIDGE_SHA,
    rollbackBackendSha: process.env.REQUESTED_ROLLBACK_BACKEND_SHA,
    finalBackendSha: process.env.REQUESTED_FINAL_BACKEND_SHA,
  };
  const signal = argv[0] === 'finalize' ? createFinalizeSignal(values) : createRollbackSignal(values);
  const output = path.resolve(argv[1]);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(signal, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${signal.signal} written=${output}\n`);
}

if (require.main === module) {
  try { run(process.argv.slice(2)); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { createFinalizeSignal, createRollbackSignal };
