(function () {
    var API_ROOT = (window.location.origin.indexOf('127.0.0.1') >= 0 || window.location.origin.indexOf('localhost') >= 0) ? 'http://127.0.0.1:8000' : 'https://api.auxtho.com';
    var VERIFY_ENDPOINT = API_ROOT + '/api/verify';
    var STATUS_ENDPOINT = VERIFY_ENDPOINT + '/status';
    var DEFAULT_BUTTON_TEXT = {};
    var CURRENT_STATUS = { signing_mode: 'not_reported', timestamp_provider: 'not_reported' };
    var SERVICE_AVAILABLE = false;
    var VERIFICATION_BUTTON_IDS = ['qr-verify-btn', 'manual-verify-btn'];
    var configuredTimeoutMs = Number(window.__AUXTHO_VERIFY_TIMEOUT_MS__);
    var FETCH_TIMEOUT_MS = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs >= 50
        ? configuredTimeoutMs
        : 20000;
    var MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;
    var VERIFICATION_GENERATION = 0;
    var ACTIVE_VERIFICATION = null;

    function byId(id) {
        return document.getElementById(id);
    }

    function isValidArtifactRecordHash(value) {
        return /^(?:sha256:)?(?:[0-9a-fA-F]{16}|[0-9a-fA-F]{64})$/.test((value || '').trim());
    }

    async function hashSelectedFile(file) {
        if (!file) return null;
        if (file.size > MAX_LOCAL_FILE_BYTES) {
            throw new Error('The selected file exceeds the 25 MB local verification limit.');
        }
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Local file hashing is unavailable in this browser.');
        }
        var bytes = await file.arrayBuffer();
        var digest = await window.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(function (value) {
            return value.toString(16).padStart(2, '0');
        }).join('');
    }

    async function selectedFileHash() {
        var input = byId('manual-artifact-file');
        var file = input && input.files && input.files[0];
        return hashSelectedFile(file || null);
    }

    function setText(id, value) {
        var el = byId(id);
        if (el) el.textContent = value;
    }

    function toggle(el, visible) {
        if (!el) return;
        el.hidden = !visible;
    }

    function setVerificationButtonsEnabled(enabled) {
        SERVICE_AVAILABLE = !!enabled;
        VERIFICATION_BUTTON_IDS.forEach(function (id) {
            var el = byId(id);
            if (!el) return;
            el.disabled = !SERVICE_AVAILABLE;
            el.setAttribute('aria-disabled', SERVICE_AVAILABLE ? 'false' : 'true');
        });
    }

    function setServiceStatus(state) {
        var el = byId('verification-service-status');
        if (!el) return;
        el.classList.remove('checking', 'active', 'unavailable');
        el.classList.add(state);
        el.textContent = state === 'active'
            ? 'Endpoint ready / request not yet checked'
            : state === 'unavailable'
            ? 'Verification unavailable'
            : 'Checking / Not confirmed';
    }

    function setListItems(id, items) {
        var el = byId(id);
        if (!el) return;
        el.innerHTML = items.map(function (item) {
            return '<li>' + escapeHtml(item) + '</li>';
        }).join('');
    }

    function clearVerificationResult() {
        var card = byId('verify-result');
        var grid = byId('verify-result-grid');
        toggle(card, false);
        if (grid) grid.innerHTML = '';
    }

    function cancelActiveVerification() {
        VERIFICATION_GENERATION += 1;
        if (ACTIVE_VERIFICATION && ACTIVE_VERIFICATION.controller) {
            ACTIVE_VERIFICATION.controller.abort();
        }
        ACTIVE_VERIFICATION = null;
        VERIFICATION_BUTTON_IDS.forEach(function (id) {
            setButtonLoading(id, false, '');
        });
    }

    function beginVerification() {
        cancelActiveVerification();
        var state = {
            generation: VERIFICATION_GENERATION,
            controller: new AbortController()
        };
        ACTIVE_VERIFICATION = state;
        return state;
    }

    function isActiveVerificationState(state) {
        return !!(
            state &&
            ACTIVE_VERIFICATION === state &&
            state.generation === VERIFICATION_GENERATION
        );
    }

    function isCurrentVerification(state) {
        return isActiveVerificationState(state) && !state.controller.signal.aborted;
    }

    function finishVerification(state) {
        if (ACTIVE_VERIFICATION === state) ACTIVE_VERIFICATION = null;
    }

    function invalidateVerificationResult() {
        cancelActiveVerification();
        clearVerificationResult();
        setError('');
    }

    function setVerificationUnavailable() {
        clearVerificationResult();
        setServiceStatus('unavailable');
        setVerificationButtonsEnabled(false);
        setListItems('status-active-items', [
            'Verification service status not confirmed',
            'Automated verification disabled',
            'Manual email support available'
        ]);
        setListItems('artifact-crypto-items', [
            'Verification mode unavailable.',
            'Signature status unavailable.',
            'Timestamp status unavailable.'
        ]);
        setText('status-footnote', 'Automated verification is disabled because service status could not be confirmed. Use email support instead.');
    }

    function showVerificationTerminal(title, message) {
        var card = byId('verify-result');
        var grid = byId('verify-result-grid');
        if (!card || !grid) return;
        toggle(card, true);
        setText('verify-result-kicker', 'Verification Result');
        setText('verify-result-title', title);
        setText('verify-result-message', message);
        grid.innerHTML = '';
    }

    async function fetchJsonWithTimeout(url, options, suppliedController) {
        var controller = suppliedController || new AbortController();
        var didTimeout = false;
        var timeoutId = window.setTimeout(function () {
            didTimeout = true;
            controller.abort();
        }, FETCH_TIMEOUT_MS);
        try {
            var response = await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
            var result = await response.json();
            return { response: response, result: result };
        } catch (err) {
            if (didTimeout) {
                var timeoutError = new Error('Verification request timed out.');
                timeoutError.name = 'TimeoutError';
                throw timeoutError;
            }
            throw err;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function setButtonLoading(id, isLoading, loadingText) {
        var el = byId(id);
        if (!el) return;
        if (!DEFAULT_BUTTON_TEXT[id]) DEFAULT_BUTTON_TEXT[id] = el.textContent;
        el.disabled = !!isLoading || !SERVICE_AVAILABLE;
        el.setAttribute('aria-disabled', el.disabled ? 'true' : 'false');
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
        return String(value || 'not_reported').replace(/_/g, ' ').toUpperCase();
    }

    function hasSignedControls(signature, mode) {
        return !!(signature && (signature.present || signature.enabled)) || mode === 'local_signed' || mode === 'production_signed';
    }

    function signatureLabel(signature, mode) {
        if (!hasSignedControls(signature, mode)) return 'NOT ATTACHED TO THIS ARTIFACT';
        if (signature.signature_valid) return 'PRESENT / VALID';
        return signature.present ? 'PRESENT / NOT VERIFIED' : 'EXPECTED / NOT PRESENT';
    }

    function hasTimestamp(signature) {
        return !!(signature && (signature.timestamp_present || signature.timestamp_valid || signature.tsa_signed_at));
    }

    function isLocalTimestamp(mode, provider) {
        return mode === 'local_signed' || provider === 'local_mock';
    }

    function isPublicTsa(mode, provider) {
        return mode === 'production_signed' && provider === 'public_tsa';
    }

    function timestampLabel(signature, mode, provider) {
        if (!hasSignedControls(signature, mode)) return 'NOT ATTACHED TO THIS ARTIFACT';
        if (!hasTimestamp(signature)) return 'NOT ATTACHED';
        if (isLocalTimestamp(mode, provider)) {
            return signature.timestamp_valid
                ? 'LOCAL TEST TIMESTAMP / NOT EXTERNALLY TRUSTED'
                : 'LOCAL TEST TIMESTAMP / NOT VERIFIED';
        }
        if (isPublicTsa(mode, provider)) {
            return signature.timestamp_valid ? 'PRESENT / VALID (PUBLIC TSA)' : 'PRESENT / NOT VERIFIED';
        }
        return 'PRESENT / PROVIDER NOT ESTABLISHED';
    }

    function timestampRowLabel(mode, provider) {
        if (isLocalTimestamp(mode, provider)) return 'Local Test Timestamp';
        if (isPublicTsa(mode, provider)) return 'External TSA Timestamp';
        return 'Timestamp Status';
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
        var mode = result.verification_mode || result.signing_mode || CURRENT_STATUS.signing_mode || 'not_reported';
        var provider = result.timestamp_provider || signature.timestamp_provider || CURRENT_STATUS.timestamp_provider || 'not_reported';
        var emptyState = !!result.empty_state;
        var signed = hasSignedControls(signature, mode);
        var items = ['Artifact record hash', 'Verification endpoint configured'];
        if (emptyState) {
            if (isLocalTimestamp(mode, provider)) {
                items.push('Local test signing mode');
                items.push('Local test timestamp (not externally trusted)');
            } else {
                items.push('Manual verification support');
            }
        } else if (signed) {
            items.push('PKCS#7 CMS detached signature');
            if (hasTimestamp(signature) || mode === 'local_signed' || mode === 'production_signed') {
                items.push(isLocalTimestamp(mode, provider)
                    ? 'Local test timestamp (not externally trusted)'
                    : isPublicTsa(mode, provider)
                    ? 'External TSA timestamp'
                    : 'Timestamp status');
            }
        } else {
            items.push('Manual verification support');
        }
        setListItems('status-active-items', items);

        if (cryptoBlock && cryptoItems) {
            toggle(cryptoBlock, true);
            setListItems('artifact-crypto-items', emptyState
                ? isLocalTimestamp(mode, provider)
                    ? [
                        'Verification mode: LOCAL SIGNED TEST MODE',
                        'Signature status will appear after artifact verification.',
                        'Timestamp provider: LOCAL MOCK / NOT EXTERNALLY TRUSTED'
                    ]
                    : [
                    'Verification mode will appear after artifact verification.',
                    'PKCS#7 CMS detached signature status will appear after verification.',
                    'Timestamp provider and trust status will appear after verification.'
                    ]
                : [
                    'Verification mode: ' + formatMode(mode),
                    'PKCS#7 CMS detached signature: ' + signatureLabel(signature, mode),
                    timestampRowLabel(mode, provider) + ': ' + timestampLabel(signature, mode, provider)
                ]
            );
        }

        if (footnote) {
            footnote.textContent = emptyState
                ? isLocalTimestamp(mode, provider)
                    ? 'Current service status reports local test signing. It is not an externally trusted TSA result.'
                    : 'Load an artifact to see its signature, timestamp, and release-package verification status.'
                : signed
                ? isLocalTimestamp(mode, provider)
                    ? 'Local signing evidence is test-only and is not an externally trusted TSA result.'
                    : 'Signed artifacts verify the hash plus registry-stored signature and timestamp values.'
                : 'Hash-only artifacts verify the registry hash. Signed exports return signature and timestamp values when attached.';
        }
    }

    function renderResult(result, requestContext) {
        var card = byId('verify-result');
        var grid = byId('verify-result-grid');
        if (!card || !grid) return;

        toggle(card, true);
        var artifact = (result && result.artifact) || {};
        requestContext = requestContext || {};
        var fileCheckRequested = requestContext.fileCheckRequested === true;
        var responseFileVerified = !!(
            result &&
            result.file_bytes_verified === true &&
            result.verification_scope === 'record_and_file_bytes'
        );
        var confirmed = !!(
            result &&
            result.verified === true &&
            result.record_match_confirmed === true &&
            result.artifact_hash_match === true &&
            artifact.report_id &&
            (!fileCheckRequested || responseFileVerified)
        );
        if (!confirmed) {
            setText('verify-result-kicker', 'Verification Result');
            setText('verify-result-title', 'Not confirmed');
            setText('verify-result-message', 'The submitted identifiers did not produce a verified match. No record metadata is displayed for an unconfirmed result.');
            grid.innerHTML = '<div class="verify-result-row"><span class="verify-result-key">Outcome</span><span class="verify-result-value">NOT CONFIRMED</span></div>';
            applyStatusPanel({
                signing_mode: CURRENT_STATUS.signing_mode,
                timestamp_provider: CURRENT_STATUS.timestamp_provider,
                empty_state: true
            });
            return;
        }

        var fileBytesVerified = fileCheckRequested && responseFileVerified;
        setText('verify-result-kicker', fileBytesVerified ? 'File Verification Passed' : 'Record Match Confirmed');
        setText('verify-result-title', fileBytesVerified ? 'Artifact File Verified' : 'Artifact Record Match');
        setText(
            'verify-result-message',
            fileBytesVerified
                ? 'The selected file bytes and submitted identifiers match the stored Auxtho artifact record.'
                : 'The submitted identifiers match a stored Auxtho artifact record. The surrounding file was not checked.'
        );

        var signature = result.signature || {};
        var verificationMode = result.verification_mode || result.signing_mode || 'record_not_reported';
        var timestampProvider = result.timestamp_provider || signature.timestamp_provider || 'not_reported';
        var rows = [
            ['Report ID', artifact.report_id || '-'],
            ['Export Event ID', artifact.export_event_id || '-'],
            ['Verification Scope', 'Auxtho artifact record and integrity hash'],
            ['Result Scope', fileBytesVerified ? 'RECORD + SELECTED FILE BYTES' : 'REGISTRY IDENTIFIERS ONLY'],
            ['Selected File Bytes Match', fileBytesVerified ? 'YES' : 'NOT CHECKED'],
            ['Public Mode', formatMode(result.mode || 'not_reported')],
            ['Verification Mode', formatMode(verificationMode)],
            ['Hash Match', result.artifact_hash_match ? 'YES' : 'NO'],
            ['PKCS#7 CMS Detached Signature', signatureLabel(signature, verificationMode)],
            ['Signature Format', signature.signature_format || '-'],
            ['Certificate Chain', certificateChainLabel(signature, verificationMode)],
            [timestampRowLabel(verificationMode, timestampProvider), timestampLabel(signature, verificationMode, timestampProvider)],
            ['Reason Code', signature.reason_code || result.reason || '-']
        ];

        grid.innerHTML = rows.map(function (row) {
            return '<div class="verify-result-row"><span class="verify-result-key">' + escapeHtml(row[0]) + '</span><span class="verify-result-value">' + escapeHtml(row[1]) + '</span></div>';
        }).join('');

        applyStatusPanel({ ...result, signing_mode: verificationMode, timestamp_provider: timestampProvider });
    }

    async function runVerification(reportId, artifactHash, exportEventId, buttonId, artifactBytesSha256, requestState) {
        var state = requestState || beginVerification();
        clearVerificationResult();
        if (!isValidArtifactRecordHash(artifactHash)) {
            if (isCurrentVerification(state)) setError('Enter the complete artifact record hash exactly as shown in the export.');
            finishVerification(state);
            return;
        }
        if (!SERVICE_AVAILABLE) {
            if (isCurrentVerification(state)) setError('Verification unavailable. Use manual email support.');
            finishVerification(state);
            return;
        }
        setError('');
        showVerificationPending();
        if (buttonId) setButtonLoading(buttonId, true, 'Please wait...');
        var payload = { report_id: reportId, artifact_hash: artifactHash };
        if (exportEventId) payload.export_event_id = exportEventId;
        if (artifactBytesSha256) payload.artifact_bytes_sha256 = artifactBytesSha256;

        try {
            var requestResult = await fetchJsonWithTimeout(VERIFY_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'same-origin'
            }, state.controller);
            if (!isCurrentVerification(state)) return;
            var response = requestResult.response;
            var result = requestResult.result;
            if (!response.ok) {
                var detail = result && result.detail;
                var errorCode = (detail && detail.error) || (result && result.error);
                if (response.status === 503 || errorCode === 'VERIFICATION_UNAVAILABLE') {
                    setVerificationUnavailable();
                }
                setError((result.detail && result.detail.message) || result.message || 'Verification failed.');
                showVerificationTerminal(
                    'Verification not completed',
                    'The verification request did not complete successfully. No record metadata is displayed.'
                );
                return;
            }
            renderResult(result, { fileCheckRequested: !!artifactBytesSha256 });
        } catch (err) {
            if (!isActiveVerificationState(state)) return;
            if (err && err.name === 'TimeoutError') {
                setError('Verification timed out. You can retry this request.');
                showVerificationTerminal(
                    'Verification timed out',
                    'The service did not respond within the bounded wait. No record metadata is displayed.'
                );
                return;
            }
            setVerificationUnavailable();
            setError('Verification API unavailable. Use manual verification support.');
            showVerificationTerminal(
                'Verification unavailable',
                'The verification service could not complete this request. No record metadata is displayed.'
            );
        } finally {
            if (isActiveVerificationState(state) && buttonId) setButtonLoading(buttonId, false, '');
            finishVerification(state);
        }
    }

    function bindManualForm() {
        var button = byId('manual-verify-btn');
        if (!button) return;
        ['manual-report-id', 'manual-artifact-hash', 'manual-export-event-id'].forEach(function (id) {
            var input = byId(id);
            if (input) input.addEventListener('input', invalidateVerificationResult);
        });
        var fileInput = byId('manual-artifact-file');
        if (fileInput) fileInput.addEventListener('change', invalidateVerificationResult);
        button.addEventListener('click', async function () {
            clearVerificationResult();
            var reportId = ((byId('manual-report-id') || {}).value || '').trim();
            var artifactHash = ((byId('manual-artifact-hash') || {}).value || '').trim();
            var exportEventId = ((byId('manual-export-event-id') || {}).value || '').trim();
            if (!reportId || !artifactHash) {
                setError('Report ID and artifact integrity hash are required.');
                return;
            }
            var requestState = beginVerification();
            setButtonLoading('manual-verify-btn', true, 'Hashing locally...');
            var fileHash = null;
            try {
                fileHash = await selectedFileHash();
            } catch (err) {
                if (isCurrentVerification(requestState)) {
                    setButtonLoading('manual-verify-btn', false, '');
                    setError(err.message || 'The selected file could not be hashed locally.');
                }
                finishVerification(requestState);
                return;
            }
            if (!isCurrentVerification(requestState)) return;
            runVerification(reportId, artifactHash, exportEventId || null, 'manual-verify-btn', fileHash, requestState);
        });
    }

    async function loadStatusPanel() {
        setServiceStatus('checking');
        setVerificationButtonsEnabled(false);
        try {
            var requestResult = await fetchJsonWithTimeout(STATUS_ENDPOINT, { method: 'GET', credentials: 'same-origin' });
            var response = requestResult.response;
            if (!response.ok) throw new Error('Verification status request failed.');
            var result = requestResult.result;
            if (!result || result.status !== 'operational') throw new Error('Verification status was not operational.');
            CURRENT_STATUS = {
                signing_mode: result.signing_mode || 'not_reported',
                timestamp_provider: result.timestamp_provider || 'not_reported'
            };
            applyStatusPanel({ ...result, empty_state: true });
            setServiceStatus('active');
            setVerificationButtonsEnabled(true);
        } catch (err) {
            setVerificationUnavailable();
        }
    }

    function initQrFlow() {
        var params = new URLSearchParams(window.location.search || '');
        var reportId = params.get('report');
        var hash = params.get('h');
        var exportEventId = params.get('exp');
        if (!reportId || !hash) return;

        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, document.title, window.location.pathname);
        }

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

        var mailto = 'mailto:verify@auxtho.com?subject=' + encodeURIComponent('Artifact Verification Support');
        var mailtoEl = byId('qr-mailto');
        if (mailtoEl) mailtoEl.href = mailto;

        var button = byId('qr-verify-btn');
        if (button) {
            button.addEventListener('click', async function () {
                clearVerificationResult();
                var requestState = beginVerification();
                setButtonLoading('qr-verify-btn', true, 'Hashing locally...');
                var fileHash = null;
                try {
                    fileHash = await selectedFileHash();
                } catch (err) {
                    if (isCurrentVerification(requestState)) {
                        setButtonLoading('qr-verify-btn', false, '');
                        setError(err.message || 'The selected file could not be hashed locally.');
                    }
                    finishVerification(requestState);
                    return;
                }
                if (!isCurrentVerification(requestState)) return;
                runVerification(reportId, hash, exportEventId, 'qr-verify-btn', fileHash, requestState);
            });
        }
    }

    function init() {
        bindManualForm();
        initQrFlow();
        loadStatusPanel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
