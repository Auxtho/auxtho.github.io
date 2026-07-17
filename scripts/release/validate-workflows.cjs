const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..', '..');
const workflowPaths = [
  '.github/workflows/site-ci.yml',
  '.github/workflows/deploy-pages.yml',
];

function fail(message) {
  throw new Error(`workflow-contract: ${message}`);
}

function parseWorkflow(relative) {
  const document = YAML.parseDocument(fs.readFileSync(path.join(root, relative), 'utf8'), {
    merge: true,
    uniqueKeys: true,
  });
  if (document.errors.length) fail(`${relative}: ${document.errors.map((error) => error.message).join('; ')}`);
  return document.toJS({ maxAliasCount: 100 });
}

function actionUses(workflow) {
  return Object.values(workflow.jobs || {}).flatMap((job) => (
    Array.isArray(job.steps) ? job.steps.map((step) => step.uses).filter(Boolean) : []
  ));
}

function validate() {
  const parsed = Object.fromEntries(workflowPaths.map((relative) => [relative, parseWorkflow(relative)]));
  for (const [relative, workflow] of Object.entries(parsed)) {
    if (!workflow.on || !workflow.jobs) fail(`${relative}: on and jobs are required`);
    for (const use of actionUses(workflow)) {
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/.test(use)) {
        fail(`${relative}: action must be pinned to a full commit SHA: ${use}`);
      }
    }
  }

  const site = parsed['.github/workflows/site-ci.yml'];
  if (site.jobs?.verify?.name !== 'Verify Site Contract') fail('required check name changed');
  if (!JSON.stringify(site.jobs.verify.steps).includes('assert-pages-bootstrap')) {
    fail('required check must assert workflow-mode Pages before merge');
  }

  const deploy = parsed['.github/workflows/deploy-pages.yml'];
  if (!JSON.stringify(deploy.on?.workflow_dispatch?.inputs || {}).includes('site_contract_mode')) {
    fail('manual deploy must require an explicit bootstrap or normal site contract mode');
  }
  const packageText = JSON.stringify(deploy.jobs?.package);
  const deployText = JSON.stringify(deploy.jobs?.deploy_and_verify);
  if ((JSON.stringify(deploy).match(/capture-and-validate/g) || []).length !== 3) {
    fail('authorize, package, and immediate predeploy must independently capture and validate platform state');
  }
  for (const jobName of ['authorize_release', 'package']) {
    if (deploy.jobs?.[jobName]?.environment?.deployment !== false) {
      fail(`${jobName} must consume environment approval without creating a deployment object`);
    }
  }
  if (!deployText.includes('predeploy-authorization-evidence/platform-state.json')) {
    fail('deploy job must recapture authorization immediately before the first publication mutation');
  }
  for (const required of ['REQUESTED_SITE_CONTRACT_MODE', 'APPROVED_SITE_CONTRACT_MODE']) {
    if (!JSON.stringify(deploy).includes(required)) fail(`site bootstrap mode binding is missing: ${required}`);
  }
  for (const artifactName of ['github-pages-candidate', 'github-pages-rollback']) {
    if (!packageText.includes(artifactName) || !deployText.includes(artifactName)) {
      fail(`separately named Pages artifact is not packaged and selected: ${artifactName}`);
    }
  }
  const deployUses = actionUses({ jobs: { deploy_and_verify: deploy.jobs.deploy_and_verify } });
  if (deployUses.filter((use) => use.startsWith('actions/deploy-pages@')).length !== 2) {
    fail('candidate and rollback deploy actions must remain in the same environment-gated job');
  }
  for (const required of [
    'backend-reported-site-sha',
    'final_backend_readback',
    'backend-finalize-required',
    'backend-rollback-required',
    'steps.final_backend_readback.outcome',
    'Hold without site rollback when the final backend transition is not yet proven',
  ]) {
    if (!deployText.includes(required)) fail(`migration/rollback control is missing: ${required}`);
  }
  process.stdout.write(`workflow-contract parsed=${workflowPaths.length} actions=${actionUses(site).length + actionUses(deploy).length}\n`);
}

try { validate(); } catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
