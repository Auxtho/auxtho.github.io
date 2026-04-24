(function () {
    var API_ROOT = (window.location.origin.indexOf('127.0.0.1') >= 0 || window.location.origin.indexOf('localhost') >= 0) ? 'http://127.0.0.1:8000' : 'https://api.auxtho.com';
    var VERIFY_ENDPOINT = API_ROOT + '/api/verify';
    var STATUS_ENDPOINT = VERIFY_ENDPOINT + '/status';
    var DEFAULT_BUTTON_TEXT = {};

    function byId(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        var el = byId(id);
        if (el) el.textContent = value;
    }

    function toggle(el, visible) {
        if (!el) return;
        el.hidden = !visible;
    }

    function setButtonLoading(id, isLoading, loadingText) {
        var el = byId(id);
        if (!el) return;
        if (!DEFAULT_BUTTON_TEXT[id]) DEFAULT_BUTTON_TEXT[id] = el.textContent;
        el.disabled = !!isLoading;
        el.setAttribute('aria-busy', isLoading ? 'true' : 'false');
        el.classList.toggle('is-busy', !!isLoading);
        el.textContent = isLoading ? loadingText : DEFAULT_BUTTON_TEXT[id];
    }

    function showVerificationPending() {
        var card = byId('verify-result');
        var grid = byId('verify-result-grid');
        if (!card || !grid) return;
        toggle(card, true);
        setText('verify-result-kicker', 'Verification In Progress');
        setText('verify-result-title', 'Verifying Artifact...');
        setText('verify-result-message', 'Please wait while we verify the artifact. This can take a few seconds.');
        grid.innerHTML = '';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function formatMode(value) {
        return String(value || 'pilot_hash_only').replace(/_/g, ' ').toUpperCase();
    }

    function hasSignedControls(signature, mode) {
        return !!(signature && (signature.present || signature.enabled)) || mode === 'local_signed' || mode === 'production_signed';
    }

    function signatureLabel(signature, mode) {
        if (!hasSignedControls(signature, mode)) return 'NOT ATTACHED TO THIS ARTIFACT';
        if (signature.signature_valid) return 'PRESENT / VALID';
        return signature.present ? 'PRESENT / NOT VERIFIED' : 'EXPECTED / NOT PRESENT';
    }

    function timestampLabel(signature, mode) {
        if (!hasSignedControls(signature, mode)) return 'NOT ATTACHED TO THIS ARTIFACT';
        if (!signature.timestamp_present) return 'NOT ATTACHED';
        return signature.timestamp_valid ? 'PRESENT / VALID' : 'PRESENT / NOT VERIFIED';
    }

    function certificateChainLabel(signature, mode) {
        var status = signature.certificate_chain_status || '-';
        if (mode === 'local_signed' && status === 'verified') return 'local chain verified';
        if (mode === 'local_signed' && status !== '-') return status + ' in local signing mode';
        return status;
    }

    function setError(message) {
        var el = byId('verify-error');
        if (!el) return;
        if (!message) {
            el.hidden = true;
            el.textContent = '';
            return;
        }
        el.hidden = false;
        el.textContent = message;
    }

    function applyStatusPanel(result) {
        var list = byId('status-active-items');
        var cryptoBlock = byId('artifact-crypto-block');
        var cryptoItems = byId('artifact-crypto-items');
        var footnote = byId('status-footnote');
        if (!list) return;

        result = result || {};
        var signature = result.signature || {};
        var mode = result.verification_mode || result.signing_mode || 'pilot_hash_only';
        var emptyState = !!result.empty_state;
        var signed = hasSignedControls(signature, mode);
        var items = ['Artifact integrity hash', 'Automated API verification'];
        if (emptyState) {
            items.push('Manual verification support');
        } else if (signed) {
            items.push('PKCS#7 CMS detached signature');
            if (signature.timestamp_present || mode === 'local_signed' || mode === 'production_signed') {
                items.push('RFC 3161 trusted timestamp');
            }
        } else {
            items.push('Manual verification support');
        }
        list.innerHTML = items.map(function (item) { return '<li>' + item + '</li>'; }).join('');

        if (cryptoBlock && cryptoItems) {
            toggle(cryptoBlock, true);
            cryptoItems.innerHTML = (emptyState
                ? [
                    'Verification mode will appear after artifact verification.',
                    'PKCS#7 CMS detached signature status will appear after verification.',
                    'RFC 3161 trusted timestamp status will appear after verification.'
                ]
                : [
                    'Verification mode: ' + formatMode(mode),
                    'PKCS#7 CMS detached signature: ' + signatureLabel(signature, mode),
                    'RFC 3161 trusted timestamp: ' + timestampLabel(signature, mode)
                ]
            ).map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('');
        }

        if (footnote) {
            footnote.textContent = emptyState
                ? 'Load an artifact to see its signature, timestamp, and release-package verification status.'
                : signed
                ? 'Signed artifacts verify the hash plus registry-stored signature and timestamp values.'
                : 'Hash-only artifacts verify the registry hash. Signed exports return signature and timestamp values when attached.';
        }
    }

    function renderResult(result) {
        var card = byId('verify-result');
        var grid = byId('verify-result-grid');
        if (!card || !grid) return;

        toggle(card, true);
        setText('verify-result-kicker', result.verified ? 'Verification Passed' : 'Verification Review');
        setText('verify-result-title', result.verified ? 'Artifact Verified' : 'Verification Incomplete');
        setText('verify-result-message', result.message || 'Verification response received.');

        var artifact = result.artifact || {};
        var signature = result.signature || {};
        var verificationMode = result.verification_mode || result.mode || 'pilot_hash_only';
        var rows = [
            ['Report ID', artifact.report_id || '-'],
            ['Export Event ID', artifact.export_event_id || '-'],
            ['Artifact Policy Version', artifact.policy_version || '-'],
            ['Release Package Hash', (artifact.release_package || {}).hash || '-'],
            ['Release Package Trace ID', (artifact.release_package || {}).trace_id || '-'],
            ['Verification Profile', 'SG-MAS-TRM-2024'],
            ['Trace ID', artifact.trace_id || '-'],
            ['Public Mode', (result.mode || 'pilot').toUpperCase()],
            ['Verification Mode', formatMode(verificationMode)],
            ['Hash Match', result.artifact_hash_match ? 'YES' : 'NO'],
            ['PKCS#7 CMS Detached Signature', signatureLabel(signature, verificationMode)],
            ['Signature Format', signature.signature_format || '-'],
            ['Certificate Chain', certificateChainLabel(signature, verificationMode)],
            ['RFC 3161 Trusted Timestamp', timestampLabel(signature, verificationMode)],
            ['TSA / Timestamp', signature.tsa_signed_at || signature.tsa_name || '-'],
            ['Reason Code', signature.reason_code || result.reason || '-']
        ];

        if (signature.signer_dn) {
            rows.push(['Signer DN', signature.signer_dn]);
        }
        if (signature.signer_cert_serial) {
            rows.push(['Signer Certificate Serial', signature.signer_cert_serial]);
        }
        if (signature.tsa_name && signature.tsa_signed_at) {
            rows.push(['Timestamp Authority', signature.tsa_name]);
        }

        grid.innerHTML = rows.map(function (row) {
            return '<div class="verify-result-row"><span class="verify-result-key">' + escapeHtml(row[0]) + '</span><span class="verify-result-value">' + escapeHtml(row[1]) + '</span></div>';
        }).join('');

        applyStatusPanel(result);
    }

    async function runVerification(reportId, artifactHash, exportEventId, buttonId) {
        setError('');
        showVerificationPending();
        if (buttonId) setButtonLoading(buttonId, true, 'Please wait...');
        var payload = { report_id: reportId, artifact_hash: artifactHash };
        if (exportEventId) payload.export_event_id = exportEventId;

        try {
            var response = await fetch(VERIFY_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'same-origin'
            });
            var result = await response.json();
            if (!response.ok) {
                setError((result.detail && result.detail.message) || result.message || 'Verification failed.');
                return;
            }
            renderResult(result);
        } catch (err) {
            setError('Verification API unavailable. Use manual verification support.');
        } finally {
            if (buttonId) setButtonLoading(buttonId, false, '');
        }
    }

    function bindManualForm() {
        var button = byId('manual-verify-btn');
        if (!button) return;
        button.addEventListener('click', function () {
            var reportId = (byId('manual-report-id') || {}).value || '';
            var artifactHash = (byId('manual-artifact-hash') || {}).value || '';
            var exportEventId = (byId('manual-export-event-id') || {}).value || '';
            if (!reportId || !artifactHash) {
                setError('Report ID and artifact integrity hash are required.');
                return;
            }
            runVerification(reportId, artifactHash, exportEventId || null, 'manual-verify-btn');
        });
    }

    async function loadStatusPanel() {
        try {
            var response = await fetch(STATUS_ENDPOINT, { method: 'GET', credentials: 'same-origin' });
            if (!response.ok) return;
            var result = await response.json();
            applyStatusPanel({ ...result, empty_state: true });
        } catch (err) {
            applyStatusPanel({ signing_mode: 'pilot_hash_only', empty_state: true });
        }
    }

    function initQrFlow() {
        var params = new URLSearchParams(window.location.search || '');
        var reportId = params.get('report');
        var hash = params.get('h');
        var exportEventId = params.get('exp');
        if (!reportId || !hash) return;

        var card = byId('qr-verify');
        if (card) card.classList.add('qr-card-visible');
        setText('qr-report-id', reportId);
        setText('qr-hash', hash);
        var reportInput = byId('manual-report-id');
        var hashInput = byId('manual-artifact-hash');
        var exportInput = byId('manual-export-event-id');
        if (reportInput) reportInput.value = reportId;
        if (hashInput) hashInput.value = hash;
        if (exportInput && exportEventId) exportInput.value = exportEventId;

        var mailto = 'mailto:verify@auxtho.com?subject=' + encodeURIComponent('Audit Verification Request') + '&body=' +
            encodeURIComponent('Please verify the following artifact:\n\nReport ID: ' + reportId + '\nArtifact Integrity Hash: ' + hash + (exportEventId ? '\nExport Event ID: ' + exportEventId : '') + '\n\nThank you.');
        var mailtoEl = byId('qr-mailto');
        if (mailtoEl) mailtoEl.href = mailto;

        var button = byId('qr-verify-btn');
        if (button) {
            button.addEventListener('click', function () {
                runVerification(reportId, hash, exportEventId, 'qr-verify-btn');
            });
        }

        runVerification(reportId, hash, exportEventId, 'qr-verify-btn');
    }

    function init() {
        bindManualForm();
        loadStatusPanel();
        initQrFlow();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
