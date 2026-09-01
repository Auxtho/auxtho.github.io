// Capture bounded, public-safe panels from the exact terminal product tree.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const mode = process.argv[2];
const siteRoot = path.resolve(__dirname, '..', '..');
const outputRoot = path.join(siteRoot, 'assets', 'capabilities');

function outputPath(...parts) {
  const target = path.join(outputRoot, ...parts);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
}

async function screenshot(locator, ...parts) {
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: outputPath(...parts), animations: 'disabled' });
}

async function installAuditFixture(page) {
  const reviewer = {
    user_id: 'accountable-reviewer',
    email: 'reviewer@synthetic.example',
    name: 'Accountable reviewer',
    tier: 'enterprise',
    role: 'compliance_officer',
    active_workspace_id: 'synthetic-workspace',
  };
  await page.addInitScript((user) => {
    window.localStorage.setItem('auxtho_user', JSON.stringify(user));
    window.localStorage.setItem('auxtho_sessions_migrated', '1');
    window.localStorage.setItem('auxtho_locale', 'en');
  }, reviewer);

  const handleRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (url.pathname === '/auth/me') return json(reviewer);
    if (url.pathname === '/sessions') return json({ sessions: [], next_cursor: null });
    if (url.pathname === '/sessions/summary') {
      return json({
        needs_review: 0,
        blocked: 0,
        ready_for_release: 1,
        released: 0,
        in_progress: 0,
        released_today: 0,
        total: 1,
      });
    }
    if (url.pathname === '/dashboard/logs') return json([]);
    if (url.pathname === '/dashboard/history') {
      return json({
        schema_version: 'workspace-governance-history-page-v1',
        items: [{
          id: 'hitl-approved-public-safe',
          full_id: 'hitl_approved_public_safe',
          event_type: 'HITL_APPROVED',
          status: 'APPROVED',
          decision: 'APPROVED',
          reason: 'The selected evidence was inspected before this decision.',
          actor_uid: 'Accountable reviewer',
          requester_id: 'Workflow owner',
          resource_id: 'synthetic-review-run',
          thread_id: 'synthetic-reviewed-work',
          policy_version: 'review-policy-v1',
          timestamp: '2026-08-31T18:20:00Z',
        }],
        next_cursor: null,
      });
    }
    if (url.pathname === '/hitl/decision-receipt' && request.method() === 'GET') {
      return json({
        schema_version: 'general-hitl-decision-receipt-readback-v1',
        readback_verified: true,
        decision_receipt: {
          schema_version: 'general-hitl-decision-receipt-v1',
          decision: 'APPROVED',
          release_status: 'APPROVED',
          review_snapshot_hash: 'a'.repeat(64),
          authorization_event_id: 'authorization-event-public-safe',
          authorization_hash: 'b'.repeat(64),
          chain_event_id: 'audit-chain-event-public-safe',
          source_traceability_status: 'FINALIZED',
          source_traceability_release_snapshot_id: 'release-snapshot-public-safe',
          source_traceability_commitment_sha256: 'c'.repeat(64),
          canonical_source_reopen_ready: true,
          release_gate_status: 'GO',
          evidence_reference_set_sha256: 'd'.repeat(64),
          human_review_attestation_sha256: 'e'.repeat(64),
          automatic_retry_allowed: false,
          external_effect_performed: false,
          bindings: [{
            binding_id: 'binding-public-safe',
            release_snapshot_id: 'release-snapshot-public-safe',
            doc_id: 'public-source-document',
            source_title: 'Approved review source',
            page_number: 3,
            locator: 'page-3-passage-1',
            representation_kind: 'pdf_page',
            exactness_tier: 'page_exact',
            release_eligibility: 'release_eligible',
          }],
        },
      });
    }
    return json({ detail: 'Not required by the public-safe capture fixture' }, 404);
  };

  await page.route('http://localhost:8000/**', handleRoute);
  await page.route('http://127.0.0.1:8000/**', handleRoute);
  await page.route('https://api.auxtho.com/**', handleRoute);
}

async function captureAudit(page) {
  await installAuditFixture(page);
  await page.goto('http://127.0.0.1:3000/?view=audit', { waitUntil: 'networkidle' });
  await page.getByTestId('audit-history-row-HITL_APPROVED').click();
  const drawer = page.getByTestId('audit-history-drawer');
  await drawer.getByTestId('audit-history-load-receipt').click();
  const receipt = drawer.getByTestId('audit-history-decision-receipt');
  await receipt.getByText('Re-verified from durable records').waitFor();
  await screenshot(receipt, 'audit-history', 'decision-receipt.png');
}

async function captureSourcePack(page) {
  await page.goto('http://127.0.0.1:3008/source-packs/mas', { waitUntil: 'networkidle' });
  await page.getByTestId('source-pack-contracts').waitFor();
  await screenshot(page.getByTestId('source-pack-contracts'), 'source-pack', 'contract-identities.png');
  await screenshot(page.getByTestId('source-pack-lifecycle'), 'source-pack', 'lifecycle-readback.png');
  await screenshot(page.getByTestId('source-pack-sources'), 'source-pack', 'source-roles.png');
}

async function captureReviewException(page) {
  await page.goto(
    'http://127.0.0.1:3001/review-runs/review-run-m122-0001'
      + '?thread_id=synthetic-assurance-local-review&run_id=synthetic-run-m122-0001',
    { waitUntil: 'networkidle' },
  );
  await page.getByTestId('exception-queue').waitFor();
  await page.getByTestId('correct-C2').click();
  await page.getByTestId('human-disposition-C2').waitFor();
  await screenshot(page.getByTestId('exception-queue'), 'ai-review', 'exception-correction.png');
  await screenshot(page.getByTestId('review-gate'), 'ai-review', 'review-gate.png');
}

async function captureIncident(page) {
  const health = await fetch('http://127.0.0.1:8013/health');
  const { incident_id: incidentId } = await health.json();
  await page.goto(`http://127.0.0.1:3001/incidents/${incidentId}`, { waitUntil: 'networkidle' });
  for (let step = 0; step < 5; step += 1) {
    await page.getByTestId('advance-incident').click();
  }
  await page.getByTestId('response-package').waitFor();
  await screenshot(page.getByTestId('incident-timeline'), 'incident-recovery', 'incident-timeline.png');
  await screenshot(page.getByTestId('impact-inventory'), 'incident-recovery', 'impact-inventory.png');
  await screenshot(page.getByTestId('notification-boundary'), 'incident-recovery', 'notification-boundary.png');
  await screenshot(page.getByTestId('response-package'), 'incident-recovery', 'response-package.png');
}

async function captureIntegrated(page) {
  await page.goto(
    'http://127.0.0.1:3015/release-control/m125-compliance-assurance',
    { waitUntil: 'networkidle' },
  );
  await page.getByTestId('integrated-release').waitFor();
  await screenshot(page.getByTestId('integrated-release'), 'incident-recovery', 'release-receipt-readback.png');
  await screenshot(page.getByTestId('integrated-operations-handoff'), 'incident-recovery', 'recovery-handoff.png');
}

const captures = {
  audit: captureAudit,
  'source-pack': captureSourcePack,
  'review-exception': captureReviewException,
  incident: captureIncident,
  integrated: captureIntegrated,
};

async function main() {
  if (!captures[mode]) {
    throw new Error(`Unknown capture mode: ${String(mode)}`);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await captures[mode](page);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
