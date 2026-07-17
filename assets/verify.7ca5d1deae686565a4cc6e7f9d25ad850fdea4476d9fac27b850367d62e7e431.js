(function () {
    var LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];
    var PRODUCTION_ORIGINS = ['https://auxtho.com'];

    function resolveApiRoot() {
        if (PRODUCTION_ORIGINS.indexOf(window.location.origin) >= 0) return 'https://api.auxtho.com';
        if (LOCAL_HOSTS.indexOf(window.location.hostname) >= 0) return window.location.origin;
        return null;
    }

    var API_ROOT = resolveApiRoot();
    var VERIFY_ENDPOINT = API_ROOT ? API_ROOT + '/api/verify' : null;
    var STATUS_ENDPOINT = VERIFY_ENDPOINT ? VERIFY_ENDPOINT + '/status' : null;
    var RELEASE_METADATA_PATH = '/release.json';
    var DEFAULT_BUTTON_TEXT = {};
    var SERVICE_AVAILABLE = false;
    var VERIFICATION_BUTTON_IDS = ['qr-verify-btn', 'manual-verify-btn'];
    var configuredTimeoutMs = Number(window.__AUXTHO_VERIFY_TIMEOUT_MS__);
    var FETCH_TIMEOUT_MS = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs >= 50
        ? configuredTimeoutMs
        : 20000;
    var MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;
    var VERIFICATION_GENERATION = 0;
    var ACTIVE_VERIFICATION = null;
    var RETIRED_LEGACY_QR_BINDING = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function isValidArtifactRecordHash(value) {
        return /^(?:sha256:)?[0-9a-fA-F]{64}$/.test((value || '').trim());
    }

    function isRetiredLegacyArtifactRecordHash(value) {
        return /^(?:sha256:)?[0-9a-fA-F]{16}$/.test((value || '').trim());
    }

    function artifactRecordHashError(value) {
        if (isRetiredLegacyArtifactRecordHash(value)) {
            return 'This 16-character legacy artifact binding was retired on July 17, 2026 and is not accepted. Request a current export with a 64-character record binding checksum or use manual verification support.';
        }
        return 'Enter the complete 64-character record binding checksum exactly as shown in the current export.';
    }

    function isFortyHex(value) {
        return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
    }

    function isReviewedCompatibleBackendSiteSha(release, backendSiteSha) {
        if (!release || !isFortyHex(release.source_sha) || !isFortyHex(backendSiteSha)) return false;
        var compatible = release.compatible_backend_site_shas;
        if (!Array.isArray(compatible) || compatible.length < 1 || compatible.length > 2) return false;
        if (JSON.stringify(compatible) !== JSON.stringify(compatible.slice().sort())) return false;
        var seen = Object.create(null);
        for (var index = 0; index < compatible.length; index += 1) {
            var siteSha = compatible[index];
            if (!isFortyHex(siteSha) || seen[siteSha]) return false;
            seen[siteSha] = true;
        }
        if (!seen[release.source_sha]) return false;
        return seen[backendSiteSha] === true;
    }

    function releaseMetadataUrl() {
        var url = new URL(RELEASE_METADATA_PATH, window.location.origin);
        url.searchParams.set('cache_bust', String(Date.now()));
        return url.toString();
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
            var controlEnabled = SERVICE_AVAILABLE && !(id === 'qr-verify-btn' && RETIRED_LEGACY_QR_BINDING);
            el.disabled = !controlEnabled;
            el.setAttribute('aria-disabled', controlEnabled ? 'false' : 'true');
        });
    }

    function setServiceStatus(state) {
        var el = byId('verification-service-status');
        if (!el) return;
        el.classList.remove('checking', 'active', 'unavailable');
        el.classList.add(state === 'retired' ? 'unavailable' : state);
        el.textContent = state === 'active'
            ? 'Endpoint ready / request not yet checked'
            : state === 'retired'
            ? 'Legacy link retired / no request sent'
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

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    function recordedControlProfile(result) {
        if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
        var signature = result.signature;
        if (!signature || typeof signature !== 'object' || Array.isArray(signature)) return null;

        var requiredSignatureFields = [
            'enabled',
            'present',
            'signature_recorded_valid',
            'signature_format',
            'certificate_chain_recorded_status',
            'timestamp_present',
            'timestamp_recorded_valid',
            'validation_basis',
            'recorded_evidence_type',
            'live_cryptographic_revalidation_performed',
            'recorded_reason_code'
        ];
        if (!requiredSignatureFields.every(function (field) { return hasOwn(signature, field); })) return null;
        if (!hasOwn(result, 'mode') || !hasOwn(result, 'verification_mode') || !hasOwn(result, 'timestamp_provider')) return null;
        if (signature.validation_basis !== 'registry_record') return null;

        if (
            result.mode === 'pilot' &&
            result.verification_mode === 'pilot_hash_only' &&
            result.timestamp_provider === 'none' &&
            signature.enabled === false &&
            signature.present === false &&
            signature.signature_recorded_valid === false &&
            signature.signature_format === null &&
            signature.certificate_chain_recorded_status === 'not_enabled' &&
            signature.timestamp_present === false &&
            signature.timestamp_recorded_valid === false &&
            signature.recorded_evidence_type === 'HASH_ONLY' &&
            signature.live_cryptographic_revalidation_performed === false &&
            signature.recorded_reason_code === 'SIGNATURE_NOT_ENABLED'
        ) {
            return { kind: 'hash_only', signature: signature };
        }

        var completeSignedFields = signature.present === true &&
            signature.signature_recorded_valid === true &&
            signature.signature_format === 'PKCS7_CMS_DETACHED_DER' &&
            signature.certificate_chain_recorded_status === 'verified' &&
            signature.timestamp_present === true &&
            signature.timestamp_recorded_valid === true &&
            signature.live_cryptographic_revalidation_performed === false &&
            signature.recorded_reason_code === 'SIG_VALID';
        if (!completeSignedFields) return null;

        if (
            result.mode === 'pilot' &&
            result.verification_mode === 'local_signed' &&
            result.timestamp_provider === 'local_mock' &&
            signature.enabled === false &&
            signature.recorded_evidence_type === 'LOCAL_SIGNED_TEST'
        ) {
            return { kind: 'local_signed', signature: signature, timestampProvider: 'local_mock' };
        }
        if (
            result.mode === 'production' &&
            result.verification_mode === 'production_signed' &&
            result.timestamp_provider === 'rfc3161_http' &&
            signature.enabled === true &&
            signature.recorded_evidence_type === 'PRODUCTION_SIGNED'
        ) {
            return { kind: 'production_signed', signature: signature, timestampProvider: 'rfc3161_http' };
        }
        return null;
    }

    function recordedAtExportLabel(value) {
        return 'API RECORDED AS ' + value + ' AT EXPORT / NOT REVALIDATED BY THIS BROWSER';
    }

    function recordedReasonCodeLabel(signature) {
        return 'API RECORDED: ' + signature.recorded_reason_code + ' / NOT REVALIDATED BY THIS BROWSER';
    }

    function signatureFormatLabel(signature) {
        return signature.signature_format === 'PKCS7_CMS_DETACHED_DER'
            ? 'PKCS#7 CMS DETACHED DER (API RECORD)'
            : 'NOT ATTACHED';
    }

    function timestampRowLabel(profile) {
        return profile.kind === 'local_signed'
            ? 'Local Test Timestamp Stored Status'
            : 'RFC 3161 Timestamp Stored Status';
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
        var emptyState = !!result.empty_state;
        var profile = emptyState ? null : recordedControlProfile(result);
        var items = ['Record binding checksum', 'Verification endpoint configured'];
        if (!profile) {
            items.push('Manual verification support');
        } else if (profile.kind === 'hash_only') {
            items.push('Hash-only artifact record');
        } else {
            items.push('Signature metadata returned by the artifact API');
            items.push('Timestamp metadata returned by the artifact API');
        }
        setListItems('status-active-items', items);

        if (cryptoBlock && cryptoItems) {
            toggle(cryptoBlock, true);
            if (!profile) {
                setListItems('artifact-crypto-items', [
                    'Artifact cryptographic metadata appears only after a confirmed artifact response.',
                    'Signature and timestamp claims require a complete, consistent API field set.',
                    'This browser does not cryptographically revalidate stored metadata.'
                ]);
            } else if (profile.kind === 'hash_only') {
                setListItems('artifact-crypto-items', [
                    'Verification mode (API record): PILOT HASH ONLY',
                    'Evidence type (API record): HASH ONLY',
                    'Signature metadata (API record): NOT ATTACHED',
                    'Timestamp metadata (API record): NOT ATTACHED',
                    'Live cryptographic revalidation: NOT PERFORMED'
                ]);
            } else {
                setListItems('artifact-crypto-items', [
                    'Verification mode (API record): ' + formatMode(result.verification_mode),
                    'Evidence type (API record): ' + formatMode(profile.signature.recorded_evidence_type),
                    'Signature format (API record): ' + signatureFormatLabel(profile.signature),
                    'Signature stored status: ' + recordedAtExportLabel('VALID'),
                    'Timestamp provider (API record): ' + formatMode(profile.timestampProvider),
                    'Timestamp stored status: ' + recordedAtExportLabel('VALID'),
                    'Live cryptographic revalidation: NOT PERFORMED'
                ]);
            }
        }

        if (footnote) {
            footnote.textContent = !profile
                ? 'Load an artifact to see only the complete cryptographic metadata returned for that stored record.'
                : profile.kind === 'hash_only'
                ? 'The hash-only API record reports no attached signature or timestamp.'
                : 'The browser displays historical API-recorded cryptographic metadata and does not revalidate the signature, certificate chain, or timestamp.';
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
        var artifactHashBindingMatches = !!(
            result &&
            typeof requestContext.artifactHash === 'string' &&
            typeof result.artifact_hash === 'string' &&
            result.artifact_hash === requestContext.artifactHash
        );
        var responseHasFileBinding = !!(
            result &&
            hasOwn(result, 'artifact_bytes_sha256') &&
            result.artifact_bytes_sha256 != null
        );
        var fileBindingMatches = fileCheckRequested
            ? !!(
                typeof requestContext.artifactBytesSha256 === 'string' &&
                typeof result.artifact_bytes_sha256 === 'string' &&
                result.artifact_bytes_sha256 === requestContext.artifactBytesSha256
            )
            : !responseHasFileBinding;
        var scopeMatchesRequest = fileCheckRequested ? responseFileMatch : responseIdentifierMatch;
        var controlProfile = recordedControlProfile(result);
        var confirmed = !!(
            result &&
            result.verification_outcome === 'RECORDED_MATCH' &&
            result.record_match_confirmed === true &&
            result.artifact_hash_match === true &&
            reportBindingMatches &&
            exportBindingMatches &&
            artifactHashBindingMatches &&
            fileBindingMatches &&
            controlProfile &&
            scopeMatchesRequest
        );
        if (!confirmed) {
            setText('verify-result-kicker', 'Verification Result');
            setText('verify-result-title', 'Not confirmed');
            setText('verify-result-message', 'The submitted values did not produce a recorded match under the requested scope. No record metadata is displayed.');
            grid.innerHTML = '<div class="verify-result-row"><span class="verify-result-key">Verification Outcome</span><span class="verify-result-value">NO_MATCH</span></div>';
            applyStatusPanel({ empty_state: true });
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

        var rows = [
            ['Report ID', artifact.report_id || '-'],
            ['Export Event ID', artifact.export_event_id || '-'],
            ['Verification Outcome', result.verification_outcome],
            ['Verification Scope', result.verification_scope],
            ['Record Match Confirmed', result.record_match_confirmed === true ? 'YES' : 'NO'],
            ['Record Binding Checksum Match', result.artifact_hash_match === true ? 'YES' : 'NO'],
            ['Selected File Bytes Match', fileBytesMatched ? 'YES' : 'NOT CHECKED'],
            ['Public Mode', formatMode(result.mode || 'not_reported')],
            ['Verification Mode', formatMode(result.verification_mode)]
        ];

        if (controlProfile.kind === 'hash_only') {
            rows.push(
                ['Cryptographic Controls (API Record)', 'NOT ATTACHED'],
                ['Evidence Type (API Record)', formatMode(controlProfile.signature.recorded_evidence_type)],
                ['Live Cryptographic Revalidation', 'NOT PERFORMED'],
                ['Recorded Reason Code', recordedReasonCodeLabel(controlProfile.signature)]
            );
        } else {
            rows.push(
                ['Evidence Type (API Record)', formatMode(controlProfile.signature.recorded_evidence_type)],
                ['Signature Format (API Record)', signatureFormatLabel(controlProfile.signature)],
                ['Signature Stored Status', recordedAtExportLabel('VALID')],
                ['Certificate Chain Stored Status', recordedAtExportLabel('VERIFIED')],
                ['Timestamp Provider (API Record)', formatMode(controlProfile.timestampProvider)],
                [timestampRowLabel(controlProfile), recordedAtExportLabel('VALID')],
                ['Live Cryptographic Revalidation', 'NOT PERFORMED'],
                ['Recorded Reason Code', recordedReasonCodeLabel(controlProfile.signature)]
            );
        }

        grid.innerHTML = rows.map(function (row) {
            return '<div class="verify-result-row"><span class="verify-result-key">' + escapeHtml(row[0]) + '</span><span class="verify-result-value">' + escapeHtml(row[1]) + '</span></div>';
        }).join('');

        applyStatusPanel(result);
    }

    async function runVerification(reportId, artifactHash, exportEventId, buttonId, artifactBytesSha256, requestState) {
        var state = requestState || beginVerification();
        clearVerificationResult();
        if (!isValidArtifactRecordHash(artifactHash)) {
            if (isCurrentVerification(state)) {
                if (buttonId) setButtonLoading(buttonId, false, '');
                setError(artifactRecordHashError(artifactHash));
            }
            finishVerification(state);
            return;
        }
        if (!SERVICE_AVAILABLE) {
            if (isCurrentVerification(state)) {
                if (buttonId) setButtonLoading(buttonId, false, '');
                setError('Verification unavailable. Use manual email support.');
            }
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
                exportEventId: exportEventId || null,
                artifactHash: artifactHash,
                artifactBytesSha256: artifactBytesSha256 || null
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
        var form = byId('manual-verify-form');
        var button = byId('manual-verify-btn');
        if (!form || !button) return;
        ['manual-report-id', 'manual-artifact-hash', 'manual-export-event-id'].forEach(function (id) {
            var input = byId(id);
            if (input) input.addEventListener('input', invalidateVerificationResult);
        });
        var fileInput = byId('manual-artifact-file');
        if (fileInput) fileInput.addEventListener('change', invalidateVerificationResult);
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            if (ACTIVE_VERIFICATION) return;
            clearVerificationResult();
            var reportId = ((byId('manual-report-id') || {}).value || '').trim();
            var artifactHash = ((byId('manual-artifact-hash') || {}).value || '').trim();
            var exportEventId = ((byId('manual-export-event-id') || {}).value || '').trim();
            if (!reportId || !artifactHash) {
                setError('Report ID and record binding checksum are required.');
                return;
            }
            if (!isValidArtifactRecordHash(artifactHash)) {
                setButtonLoading('manual-verify-btn', false, '');
                setError(artifactRecordHashError(artifactHash));
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
            await runVerification(reportId, artifactHash, exportEventId || null, 'manual-verify-btn', fileHash, requestState);
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
            var releaseRequest = await fetchJsonWithTimeout(releaseMetadataUrl(), {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store'
            });
            if (!releaseRequest.response.ok) throw new Error('Public site release metadata was unavailable.');
            var release = releaseRequest.result;
            if (!isReviewedCompatibleBackendSiteSha(release, release.source_sha)) {
                throw new Error('Public site release identity was not confirmed.');
            }
            applyStatusPanel({ empty_state: true });
            setServiceStatus('active');
            setVerificationButtonsEnabled(true);
        } catch (err) {
            setVerificationUnavailable();
        }
    }

    function initQrFlow() {
        var fragmentParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
        var queryParams = new URLSearchParams(window.location.search || '');
        var fragmentHasVerificationParams = fragmentParams.has('report') || fragmentParams.has('h') || fragmentParams.has('exp');
        var legacyQueryParamsPresent = queryParams.has('report') || queryParams.has('h') || queryParams.has('exp');
        var legacyQueryHash = queryParams.get('h');
        var retiredLegacyQuery = legacyQueryParamsPresent && isRetiredLegacyArtifactRecordHash(legacyQueryHash);
        // Current identifier tuples are accepted only from the fragment so they
        // never reach the public site's CDN or origin. A retired query-form
        // 16-character link is recognized only to render a local tombstone. Its
        // identifiers are scrubbed before any readiness or comparison request.
        var params = retiredLegacyQuery ? queryParams : fragmentParams;
        var reportId = params.get('report');
        var hash = params.get('h');
        var exportEventId = params.get('exp');
        var hasVerificationParams = fragmentHasVerificationParams || legacyQueryParamsPresent;
        if (hasVerificationParams && window.history && window.history.replaceState) {
            window.history.replaceState(null, document.title, window.location.pathname);
        }
        if (legacyQueryParamsPresent && !retiredLegacyQuery) return 'ignored-query';
        if (!reportId || !hash) return 'none';

        RETIRED_LEGACY_QR_BINDING = isRetiredLegacyArtifactRecordHash(hash);

        var card = byId('qr-verify');
        if (card) card.classList.add('qr-card-visible');
        toggle(byId('legacy-binding-tombstone'), RETIRED_LEGACY_QR_BINDING);
        setText('qr-report-id', RETIRED_LEGACY_QR_BINDING ? 'Retired legacy link' : reportId);
        setText('qr-hash', RETIRED_LEGACY_QR_BINDING ? '16-character binding retired' : hash);
        var reportInput = byId('manual-report-id');
        var hashInput = byId('manual-artifact-hash');
        var exportInput = byId('manual-export-event-id');
        if (reportInput) reportInput.value = RETIRED_LEGACY_QR_BINDING ? '' : reportId;
        if (hashInput) hashInput.value = RETIRED_LEGACY_QR_BINDING ? '' : hash;
        if (exportInput) exportInput.value = RETIRED_LEGACY_QR_BINDING ? '' : (exportEventId || '');

        var mailto = 'mailto:verify@auxtho.com?subject=' + encodeURIComponent('Artifact Verification Support');
        var mailtoEl = byId('qr-mailto');
        if (mailtoEl) mailtoEl.href = mailto;

        var button = byId('qr-verify-btn');
        if (button) {
            if (RETIRED_LEGACY_QR_BINDING) {
                button.disabled = true;
                button.setAttribute('aria-disabled', 'true');
                button.textContent = 'Legacy Binding Retired';
                setError(artifactRecordHashError(hash));
                return 'retired';
            }
            button.addEventListener('click', async function () {
                if (ACTIVE_VERIFICATION) return;
                clearVerificationResult();
                if (!isValidArtifactRecordHash(hash)) {
                    setButtonLoading('qr-verify-btn', false, '');
                    setError(artifactRecordHashError(hash));
                    return;
                }
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
                await runVerification(reportId, hash, exportEventId, 'qr-verify-btn', fileHash, requestState);
            });
        }
        return 'current';
    }

    function init() {
        bindManualForm();
        var qrFlowState = initQrFlow();
        if (qrFlowState === 'retired') {
            setServiceStatus('retired');
            setVerificationButtonsEnabled(false);
            return;
        }
        loadStatusPanel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
