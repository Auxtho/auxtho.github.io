const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const {
  validateGeneratedRelease,
  validateReleaseTemplate,
  validateSourceSha,
} = require('../scripts/verify-release-contract.cjs');

const root = path.resolve(__dirname, '..');
const SOURCE_SHA = 'a'.repeat(40);

test('committed release metadata is the exact build revision template', () => {
  const releaseTemplate = fs.readFileSync(path.join(root, 'release.json'), 'utf8');
  assert.equal(validateReleaseTemplate(releaseTemplate), true);
});

test('generated release metadata accepts only the exact expected SHA', () => {
  assert.deepEqual(
    validateGeneratedRelease(JSON.stringify({ source_sha: SOURCE_SHA }), SOURCE_SHA),
    { source_sha: SOURCE_SHA },
  );
});

test('generated release metadata rejects weak or ambiguous bindings', () => {
  const invalidCases = [
    [JSON.stringify({ source_sha: 'b'.repeat(40) }), SOURCE_SHA, /does not match/],
    [JSON.stringify({}), SOURCE_SHA, /only source_sha/],
    [JSON.stringify({ source_sha: SOURCE_SHA, extra: true }), SOURCE_SHA, /only source_sha/],
    [JSON.stringify([SOURCE_SHA]), SOURCE_SHA, /JSON object/],
    ['not-json', SOURCE_SHA, /valid JSON/],
  ];
  for (const [document, expectedSha, expectedError] of invalidCases) {
    assert.throws(() => validateGeneratedRelease(document, expectedSha), expectedError);
  }
  assert.throws(() => validateSourceSha(SOURCE_SHA.toUpperCase()), /40 lowercase hexadecimal/);
  assert.throws(() => validateSourceSha(SOURCE_SHA.slice(1)), /40 lowercase hexadecimal/);
});

test('site CI covers generators and binds manual Pages release to verified output', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'site-ci.yml'), 'utf8');
  assert.equal((workflow.match(/- "_config\.yml"/g) || []).length, 2);
  assert.equal((workflow.match(/- "tailwind\.config\.js"/g) || []).length, 2);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /APPROVED_SITE_SHA: \$\{\{ vars\.PRODUCTION_VERIFY_SITE_APPROVED_SHA \}\}/);
  assert.match(workflow, /test "\$\{GITHUB_SHA\}" = "\$\{APPROVED_SITE_SHA\}"/);
  assert.match(workflow, /pages: read/);
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/pages" --jq '\.build_type'/);
  assert.match(workflow, /test "\$pages_build_type" = "workflow"/);
  assert.match(workflow, /git ls-files --error-unmatch -- assets\/style\.css/);
  assert.match(workflow, /git diff --exit-code/);
  assert.match(workflow, /actions\/jekyll-build-pages@44a6e6beabd48582f863aeeb6cb2151cc1716697/);
  assert.match(workflow, /build_revision: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /verify-release-contract\.cjs _site\/release\.json "\$SOURCE_SHA"/);
  assert.match(workflow, /actions\/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b/);
  assert.match(workflow, /needs: verify/);
  assert.match(workflow, /actions\/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
});
