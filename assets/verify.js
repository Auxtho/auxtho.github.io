(function () {
    var API_BASE = (window.location.origin.indexOf('127.0.0.1') >= 0 || window.location.origin.indexOf('localhost') >= 0) ? 'http://127.0.0.1:8000/api/verify' : 'https://api.auxtho.com/api/verify';

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
        var planned = byId('planned-milestone-block');
        var footnote = byId('status-footnote');
        if (!list) return;

        var items = ['Artifact integrity hash', 'Automated API verification'];
        if (result.signature && result.signature.enabled) {
            items.push('PKCS#7 CMS detached signature');
            if (result.signature.timestamp_valid) {
                items.push('RFC 3161 trusted timestamp');
            }
            toggle(planned, false);
            if (footnote) footnote.textContent = 'Production verification checks hash, signature, and timestamp for this artifact.';
        } else {
            items.push('Pilot email fallback');
            toggle(planned, true);
            if (footnote) footnote.textContent = 'Response target for pilot verification requests: within 1 business day.';
        }
        list.innerHTML = items.map(function (item) { return '<li>' + item + '</li>'; }).join('');
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
        var rows = [
            ['Report ID', artifact.report_id || '-'],
            ['Export Event ID', artifact.export_event_id || '-'],
            ['Policy Version', artifact.policy_version || '-'],
            ['Trace ID', artifact.trace_id || '-'],
            ['Mode', (result.mode || 'pilot').toUpperCase()],
            ['Hash Match', result.artifact_hash_match ? 'YES' : 'NO'],
            ['Signature', signature.enabled ? (signature.signature_valid ? 'VERIFIED' : 'INVALID') : 'NOT ENABLED FOR THIS ARTIFACT'],
            ['Timestamp', signature.enabled ? (signature.timestamp_valid ? (signature.tsa_signed_at || 'VERIFIED') : 'NOT VERIFIED') : 'PILOT HASH-ONLY'],
            ['Reason Code', signature.reason_code || result.reason || '-']
        ];

        if (signature.signer_dn) {
            rows.push(['Signer DN', signature.signer_dn]);
        }

        grid.innerHTML = rows.map(function (row) {
            return '<div class="verify-result-row"><span class="verify-result-key">' + row[0] + '</span><span class="verify-result-value">' + row[1] + '</span></div>';
        }).join('');

        applyStatusPanel(result);
    }

    async function runVerification(reportId, artifactHash, exportEventId) {
        setError('');
        var payload = { report_id: reportId, artifact_hash: artifactHash };
        if (exportEventId) payload.export_event_id = exportEventId;

        try {
            var response = await fetch(API_BASE, {
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
            setError('Verification API unavailable. Use pilot email fallback.');
        }
    }

    function bindManualForm() {
        var button = byId('manual-verify-btn');
        if (!button) return;
        button.addEventListener('click', function () {
            var reportId = (byId('manual-report-id') || {}).value || '';
            var artifactHash = (byId('manual-artifact-hash') || {}).value || '';
            if (!reportId || !artifactHash) {
                setError('Report ID and artifact integrity hash are required.');
                return;
            }
            runVerification(reportId, artifactHash, null);
        });
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
        if (reportInput) reportInput.value = reportId;
        if (hashInput) hashInput.value = hash;

        var mailto = 'mailto:verify@auxtho.com?subject=' + encodeURIComponent('Audit Verification Request') + '&body=' +
            encodeURIComponent('Please verify the following artifact:\n\nReport ID: ' + reportId + '\nArtifact Integrity Hash: ' + hash + (exportEventId ? '\nExport Event ID: ' + exportEventId : '') + '\n\nThank you.');
        var mailtoEl = byId('qr-mailto');
        if (mailtoEl) mailtoEl.href = mailto;

        var button = byId('qr-verify-btn');
        if (button) {
            button.addEventListener('click', function () {
                runVerification(reportId, hash, exportEventId);
            });
        }

        runVerification(reportId, hash, exportEventId);
    }

    function init() {
        bindManualForm();
        initQrFlow();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
