(function () {
    var LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];
    var PRODUCTION_ORIGINS = ['https://auxtho.com'];

    function resolveApiRoot() {
        if (PRODUCTION_ORIGINS.indexOf(window.location.origin) >= 0) return 'https://api.auxtho.com';
        if (LOCAL_HOSTS.indexOf(window.location.hostname) >= 0) return 'http://127.0.0.1:8000';
        return null;
    }

    var API_ROOT = resolveApiRoot();
    var VERIFY_ENDPOINT = API_ROOT ? API_ROOT + '/api/verify' : null;
    var STATUS_ENDPOINT = VERIFY_ENDPOINT ? VERIFY_ENDPOINT + '/status' : null;
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
            var response = await fetch(url, Object.assign({}, options || {}, {
                signal: controller.signal,
                redirect: 'error'
            }));
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

    function hasRegistryRecordBasis(signature) {
        return !!(signature && signature.validation_basis === 'registry_record');
    }

    function hasSignedControls(signature, mode) {
        return !!(signature && (signature.present === true || signature.enabled === true)) || mode === 'local_signed' || mode === 'production_signed';
    }

    function signatureLabel(signature, mode) {
        if (!hasSignedControls(signature, mode)) return 'NOT ATTACHED TO THIS ARTIFACT';
        if (signature.present === true && signature.signature_recorded_valid === true && hasRegistryRecordBasis(signature)) {
            return 'RECORDED VALID / NOT REVALIDATED';
        }
        if (signature.present === true && hasRegistryRecordBasis(signature)) {
            return 'RECORDED NOT VALID / NOT REVALIDATED';
        }
        return signature.present === true ? 'PRESENT / NOT REVALIDATED' : 'EXPECTED / NOT PRESENT';
    }

    function hasTimestamp(signature) {
        return !!(signature && signature.timestamp_present === true);
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
            return signature.timestamp_recorded_valid === true && hasRegistryRecordBasis(signature)
                ? 'LOCAL TEST TIMESTAMP / RECORDED VALID / NOT REVALIDATED'
                : 'LOCAL TEST TIMESTAMP / RECORDED NOT VALID / NOT REVALIDATED';
        }
        if (isPublicTsa(mode, provider)) {
            return signature.timestamp_recorded_valid === true && hasRegistryRecordBasis(signature)
                ? 'RECORDED VALID (PUBLIC TSA) / NOT REVALIDATED'
                : 'RECORDED NOT VALID / NOT REVALIDATED';
        }
        return 'PRESENT / PROVIDER NOT ESTABLISHED';
    }

    function timestampRowLabel(mode, provider) {
        if (isLocalTimestamp(mode, provider)) return 'Local Test Timestamp';
        if (isPublicTsa(mode, provider)) return 'External TSA Timestamp';
        return 'Timestamp Status';
    }

    function certificateChainLabel(signature, mode) {
        var status = signature.certificate_chain_recorded_status || '-';
        if (signature.present !== true || !hasRegistryRecordBasis(signature)) return 'NOT REVALIDATED';
        if (status === 'verified') {
            return mode === 'local_signed'
                ? 'LOCAL CHAIN RECORDED VERIFIED / NOT REVALIDATED'
                : 'RECORDED VERIFIED / NOT REVALIDATED';
        }
        return status === '-' ? 'NOT REVALIDATED' : 'RECORDED ' + String(status).toUpperCase() + ' / NOT REVALIDATED';
    }

    function recordedControlsConsistent(result) {
        var signature = (result && result.signature) || {};
        var mode = (result && (result.verification_mode || result.signing_mode)) || 'not_reported';
        if (!hasRegistryRecordBasis(signature)) return false;
        if (mode === 'pilot_hash_only') {
            return signature.enabled === false &&
                signature.present === false &&
                signature.signature_recorded_valid === false &&
                signature.certificate_chain_recorded_status === 'not_enabled' &&
                signature.timestamp_present === false &&
                signature.timestamp_recorded_valid === false &&
                signature.recorded_reason_code === 'SIGNATURE_NOT_ENABLED';
        }
        if (mode !== 'local_signed' && mode !== 'production_signed') return false;
        return signature.enabled === (mode === 'production_signed') &&
            signature.present === true &&
            signature.signature_recorded_valid === true &&
            signature.certificate_chain_recorded_status === 'verified' &&
            signature.timestamp_present === true &&
            signature.timestamp_recorded_valid === true &&
            signature.recorded_reason_code === 'SIG_VALID';
    }

    function recordedReasonCodeLabel(signature, mode) {
        var code = signature.recorded_reason_code || '-';
        if (!hasSignedControls(signature, mode)) return code;
        if (!hasRegistryRecordBasis(signature)) return 'NOT REVALIDATED';
        return 'RECORDED ' + code + ' / NOT REVALIDATED';
    }

    function normalizeReportId(value) {
        return String(value || '').trim().toUpperCase();
    }

    function normalizeExportEventId(value) {
        return String(value || '').trim();
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
                    ? 'Local signing state is recorded test evidence; it is not revalidated or externally trusted.'
                    : 'The registry lookup reports stored signature and timestamp states; it does not revalidate them.'
                : 'The hash-only lookup confirms matching registry identifiers; no signature or timestamp is attached.';
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
        var responseFileMatch = !!(
            result &&
            result.file_bytes_verified === true &&
            result.verification_scope === 'FILE'
        );
        var responseIdentifierMatch = !!(
            result &&
            result.file_bytes_verified === false &&
            result.verification_scope === 'IDENTIFIER'
        );
        var reportBindingMatches = normalizeReportId(artifact.report_id) === normalizeReportId(requestContext.reportId);
        var exportBindingMatches = !requestContext.exportEventId ||
            normalizeExportEventId(artifact.export_event_id) === normalizeExportEventId(requestContext.exportEventId);
        var scopeMatchesRequest = fileCheckRequested ? responseFileMatch : responseIdentifierMatch;
        var confirmed = !!(
            result &&
            result.verification_outcome === 'RECORDED_MATCH' &&
            result.record_match_confirmed === true &&
            result.artifact_hash_match === true &&
            reportBindingMatches &&
            exportBindingMatches &&
            recordedControlsConsistent(result) &&
            scopeMatchesRequest
        );
        if (!confirmed) {
            setText('verify-result-kicker', 'Verification Result');
            setText('verify-result-title', 'Not confirmed');
            setText('verify-result-message', 'The submitted values did not produce a recorded match under the requested scope. No record metadata is displayed.');
            grid.innerHTML = '<div class="verify-result-row"><span class="verify-result-key">Verification Outcome</span><span class="verify-result-value">NO_MATCH</span></div>';
            applyStatusPanel({
                signing_mode: CURRENT_STATUS.signing_mode,
                timestamp_provider: CURRENT_STATUS.timestamp_provider,
                empty_state: true
            });
            return;
        }

        var fileBytesMatched = fileCheckRequested && responseFileMatch;
        setText('verify-result-kicker', fileBytesMatched ? 'File Match Confirmed' : 'Recorded Match Confirmed');
        setText('verify-result-title', fileBytesMatched ? 'Artifact File Match' : 'Artifact Record Match');
        setText(
            'verify-result-message',
            fileBytesMatched
                ? 'The selected file bytes and submitted identifiers match the stored Auxtho artifact record.'
                : 'The submitted identifiers match a stored Auxtho artifact record. The surrounding file was not checked.'
        );

        var signature = result.signature || {};
        var verificationMode = result.verification_mode || result.signing_mode || 'record_not_reported';
        var timestampProvider = result.timestamp_provider || signature.timestamp_provider || 'not_reported';
        var rows = [
            ['Report ID', artifact.report_id || '-'],
            ['Export Event ID', artifact.export_event_id || '-'],
            ['Verification Outcome', result.verification_outcome],
            ['Verification Scope', result.verification_scope],
            ['Record Match Confirmed', result.record_match_confirmed === true ? 'YES' : 'NO'],
            ['Artifact Hash Match', result.artifact_hash_match === true ? 'YES' : 'NO'],
            ['Selected File Bytes Match', fileBytesMatched ? 'YES' : 'NOT CHECKED'],
            ['Public Mode', formatMode(result.mode || 'not_reported')],
            ['Verification Mode', formatMode(verificationMode)],
            ['PKCS#7 CMS Detached Signature', signatureLabel(signature, verificationMode)],
            ['Signature Format', signature.signature_format || '-'],
            ['Certificate Chain', certificateChainLabel(signature, verificationMode)],
            [timestampRowLabel(verificationMode, timestampProvider), timestampLabel(signature, verificationMode, timestampProvider)],
            ['Recorded Reason Code', recordedReasonCodeLabel(signature, verificationMode)]
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
            renderResult(result, {
                fileCheckRequested: !!artifactBytesSha256,
                reportId: reportId,
                exportEventId: exportEventId || null
            });
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
        if (!STATUS_ENDPOINT) {
            setVerificationUnavailable();
            return;
        }
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
        var hasVerificationParams = params.has('report') || params.has('h') || params.has('exp');
        if (hasVerificationParams && window.history && window.history.replaceState) {
            window.history.replaceState(null, document.title, window.location.pathname);
        }
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
