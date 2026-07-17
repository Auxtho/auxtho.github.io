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
  const dispatchInputs = deploy.on?.workflow_dispatch?.inputs || {};
  if (dispatchInputs.site_contract_mode?.required !== true) {
    fail('manual deploy must require an explicit site contract mode');
  }
  if (
    dispatchInputs.release_purpose?.required !== true
    || dispatchInputs.release_purpose?.type !== 'choice'
    || JSON.stringify(dispatchInputs.release_purpose?.options) !== JSON.stringify([
      'approved-site-release',
      'bootstrap-migration',
    ])
  ) {
    fail('manual deploy must use the exact non-secret release purpose choices');
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
  const exactAuthorityBindings = {
    REQUESTED_SITE_CONTRACT_MODE: '${{ inputs.site_contract_mode }}',
    APPROVED_SITE_CONTRACT_MODE: '${{ vars.PRODUCTION_VERIFY_SITE_CONTRACT_MODE }}',
    REQUESTED_RELEASE_PURPOSE: '${{ inputs.release_purpose }}',
    APPROVED_RELEASE_AUTHORITY_MODE: '${{ vars.PRODUCTION_VERIFY_RELEASE_AUTHORITY_MODE }}',
    APPROVED_ENVIRONMENT_REVIEWER_IDS: '${{ vars.PRODUCTION_VERIFY_ENVIRONMENT_REVIEWER_IDS }}',
    APPROVED_SOLO_FOUNDER_ACTOR_ID: '${{ vars.PRODUCTION_VERIFY_SOLO_FOUNDER_ACTOR_ID }}',
    APPROVED_SOLO_FOUNDER_ACTOR_LOGIN: '${{ vars.PRODUCTION_VERIFY_SOLO_FOUNDER_ACTOR_LOGIN }}',
    RELEASE_ACTOR_ID: '${{ github.actor_id }}',
    RELEASE_ACTOR_LOGIN: '${{ github.actor }}',
    RELEASE_TRIGGERING_ACTOR_LOGIN: '${{ github.triggering_actor }}',
    RELEASE_EVENT_NAME: '${{ github.event_name }}',
    RELEASE_REF: '${{ github.ref }}',
    RELEASE_WORKFLOW_REF: '${{ github.workflow_ref }}',
    RELEASE_RUN_ID: '${{ github.run_id }}',
    RELEASE_RUN_ATTEMPT: '${{ github.run_attempt }}',
  };
  const exactCaptureCommands = {
    authorize_release: 'node scripts/release/platform-controls.cjs capture-and-validate authorization-evidence/platform-state.json',
    package: 'node scripts/release/platform-controls.cjs capture-and-validate package-authorization-evidence/platform-state.json',
    deploy_and_verify: 'node scripts/release/platform-controls.cjs capture-and-validate predeploy-authorization-evidence/platform-state.json',
  };
  for (const [jobName, exactCaptureCommand] of Object.entries(exactCaptureCommands)) {
    const job = deploy.jobs?.[jobName];
    const jobEnv = job?.env || {};
    for (const [name, expected] of Object.entries(exactAuthorityBindings)) {
      if (jobEnv[name] !== expected) {
        fail(`${jobName} release authority binding must be exact: ${name}`);
      }
    }
    const captureSteps = (job?.steps || []).filter((step) => String(step?.run || '').includes('capture-and-validate'));
    if (captureSteps.length !== 1 || captureSteps[0].run !== exactCaptureCommand) {
      fail(`${jobName} must run the exact fail-closed platform capture command once`);
    }
    const stepEnv = captureSteps[0].env || {};
    for (const name of Object.keys(exactAuthorityBindings)) {
      if (Object.prototype.hasOwnProperty.call(stepEnv, name)) {
        fail(`${jobName} capture step must not override release authority binding: ${name}`);
      }
    }
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
    '--source-sha',
    '--compatible-json',
    'candidate_readback',
    'rollback_readback',
    'steps.candidate_readback.outcome',
    'Keep the release failed after deterministic restoration',
  ]) {
    if (!deployText.includes(required)) fail(`static publication/rollback control is missing: ${required}`);
  }
  if (/BACKEND_(?:BRIDGE|FINAL|ROLLBACK)_SHA|backend-reported-site-sha/.test(deployText)) {
    fail('static site deployment must not depend on backend revision bindings');
  }
  if (/^\s*<<:/m.test(deployText)) {
    fail('deploy workflow must use supported YAML aliases without merge keys');
  }
  process.stdout.write(`workflow-contract parsed=${workflowPaths.length} actions=${actionUses(site).length + actionUses(deploy).length}\n`);
}

try { validate(); } catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
