/**
 * verify.js — QR Verification logic for verify.html
 * CSP-compliant: loaded as external script
 *
 * Reads ?report= and &h= URL params and populates the QR card.
 */
(function () {
    function init() {
        var search = window.location.search || '';
        if (!search) return;

        var params = new URLSearchParams(search);
        var reportId = params.get('report');
        var hash = params.get('h');

        if (!reportId || !hash) return;

        // Show QR card
        var card = document.getElementById('qr-verify');
        if (card) card.style.display = 'block';

        // Set Report ID
        var reportEl = document.getElementById('qr-report-id');
        if (reportEl) {
            reportEl.textContent = reportId;
        }

        // Set Hash
        var hashEl = document.getElementById('qr-hash');
        if (hashEl) {
            hashEl.textContent = hash;
        }

        // Build mailto
        var subject = encodeURIComponent('Audit Verification Request');
        var body = encodeURIComponent(
            'Please verify the following artifact:\n\nReport ID: ' + reportId +
            '\nSHA-256 Hash: ' + hash + '\n\nThank you.'
        );
        var mailto = 'mailto:hello@auxtho.com?subject=' + subject + '&body=' + body;

        var mailtoEl = document.getElementById('qr-mailto');
        if (mailtoEl) mailtoEl.href = mailto;

        var btnEl = document.getElementById('qr-verify-btn');
        if (btnEl) btnEl.href = mailto;
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
