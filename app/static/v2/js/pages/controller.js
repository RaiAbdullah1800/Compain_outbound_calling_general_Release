/**
 * V2 controller.js - Campaign Mission Control & 10 DID Hardware Rack
 */

let isPaused = false;
let extensionSuite = [];

async function initControllerPage() {
    await window.appShell.mount({
        activePage: 'controller',
        pageTitle: 'Campaign Mission Control & PBX Rack',
        pageSubtitle: 'Automation Worker State, 10 Dedicated Extension DIDs & Carrier Safeguards',
        headerActionsHtml: `
            <button class="v2-btn v2-btn-danger v2-btn-sm" data-role="admin" onclick="triggerEmergencyStop()">
                <span>🛑</span>
                <span>Emergency Stop</span>
            </button>
        `
    });

    await Promise.all([
        fetchCampaignStatus(),
        fetchExtensionsSuite()
    ]);

    setInterval(() => {
        if (!document.hidden) fetchCampaignStatus();
    }, 8000);
}

async function fetchCampaignStatus() {
    try {
        const data = await window.apiClient.get('/api/v1/campaigns/status');
        isPaused = data.is_paused || !data.is_running;

        const statusBadge = document.getElementById('worker-status-badge');
        const toggleBtn = document.getElementById('btn-toggle-worker');

        if (statusBadge && toggleBtn) {
            if (isPaused) {
                statusBadge.className = 'status-pill ringing';
                statusBadge.textContent = '🟡 PAUSED';
                toggleBtn.textContent = '▶️ Resume Campaign Worker';
                toggleBtn.className = 'v2-btn v2-btn-primary';
            } else {
                statusBadge.className = 'status-pill answered';
                statusBadge.textContent = '🟢 RUNNING (10:00 AM – 08:00 PM PKT)';
                toggleBtn.textContent = '⏸️ Pause Campaign Dispatcher';
                toggleBtn.className = 'v2-btn v2-btn-secondary';
            }
        }

        // Circuit Breaker Telemetry
        const cbCard = document.getElementById('circuit-breaker-card');
        const cbCount = document.getElementById('cb-decline-count');
        const cbStatus = document.getElementById('cb-status-text');
        const btnResumeCb = document.getElementById('btn-resume-cb');

        if (cbCard && data.circuit_breaker) {
            const cb = data.circuit_breaker;
            const threshold = cb.threshold || 20;
            if (cbCount) cbCount.textContent = `${cb.consecutive_declines || 0} / ${threshold}`;

            if (cb.is_active) {
                const remMins = Math.ceil((cb.remaining_seconds || 0) / 60);
                cbStatus.innerHTML = `<span style="color: var(--v2-rose); font-weight: 700;">🛑 TRIPPED (Cooldown Active: ${remMins}m remaining)</span>`;
                if (btnResumeCb) btnResumeCb.style.display = 'inline-flex';
            } else {
                cbStatus.innerHTML = `<span style="color: var(--v2-emerald); font-weight: 600;">🟢 Healthy (SIP Trunk Normal)</span>`;
                if (btnResumeCb) btnResumeCb.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('[Controller] Status error:', err);
    }
}

async function toggleWorker() {
    if (!window.rbac.checkPermission('toggle campaign worker state')) return;

    const endpoint = isPaused ? '/api/v1/campaigns/resume' : '/api/v1/campaigns/pause';
    try {
        await window.apiClient.post(endpoint, {});
        window.showToast(isPaused ? '▶️ Campaign resumed' : '⏸️ Campaign paused', 'success');
        fetchCampaignStatus();
    } catch (err) {
        window.showToast(`Error: ${err.message}`, 'error');
    }
}

async function triggerEmergencyStop() {
    if (!window.rbac.checkPermission('trigger emergency stop')) return;
    if (!confirm("🛑 EMERGENCY STOP:\nAre you sure you want to PAUSE dialing and immediately HANG UP all active calls?")) return;

    try {
        const res = await window.apiClient.post('/api/v1/campaigns/emergency-stop', {});
        window.showToast(`🛑 ${res.message || 'Emergency stop executed'}`, 'warning');
        fetchCampaignStatus();
    } catch (err) {
        window.showToast(`Error: ${err.message}`, 'error');
    }
}

async function resumeCircuitBreaker() {
    if (!window.rbac.checkPermission('reset carrier circuit breaker')) return;

    try {
        const res = await window.apiClient.post('/api/v1/campaigns/circuit-breaker/resume', {});
        window.showToast(res.message || 'Circuit breaker reset', 'success');
        fetchCampaignStatus();
    } catch (err) {
        window.showToast(`Error: ${err.message}`, 'error');
    }
}

async function clearEntireQueue() {
    if (!window.rbac.checkPermission('clear entire call queue')) return;
    if (!confirm("⚠️ WARNING:\nAre you sure you want to completely PURGE all pending leads from the database queue? This cannot be undone.")) return;

    try {
        const res = await window.apiClient.delete('/api/v1/campaigns/clear-queue');
        window.showToast(`🗑️ ${res.message || 'Queue cleared'}`, 'success');
    } catch (err) {
        window.showToast(`Error: ${err.message}`, 'error');
    }
}

async function fetchExtensionsSuite() {
    try {
        const data = await window.apiClient.get('/api/v1/system/branding');
        extensionSuite = data.extension_suite || [];
        renderExtensionRack(data);
    } catch (err) {
        console.error('[Controller] Extensions error:', err);
    }
}

function renderExtensionRack(branding) {
    const rackA = document.getElementById('ext-rack-shift-a');
    const rackB = document.getElementById('ext-rack-shift-b');
    if (!rackA || !rackB || extensionSuite.length === 0) return;

    const labelA = branding.shift_a_label || 'Shift A (Lines 1–5)';
    const labelB = branding.shift_b_label || 'Shift B (Lines 6–10)';

    const labelAEl = document.getElementById('shift-a-title');
    const labelBEl = document.getElementById('shift-b-title');
    if (labelAEl) labelAEl.textContent = labelA;
    if (labelBEl) labelBEl.textContent = labelB;

    const shiftA = extensionSuite.slice(0, 5);
    const shiftB = extensionSuite.slice(5, 10);

    const renderCard = (extObj, idx) => `
        <div class="kpi-card" style="padding: 1rem 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-size: 0.72rem; font-weight: 700; color: var(--v2-text-muted);">LINE #${idx + 1}</span>
                <span class="status-pill answered" style="font-size: 0.68rem;">READY</span>
            </div>
            <div style="font-size: 1.2rem; font-weight: 800; font-family: monospace; color: var(--v2-text-primary);">
                Ext ${extObj.ext}
            </div>
            <div style="font-size: 0.76rem; font-family: monospace; color: var(--v2-primary); margin-top: 0.25rem;">
                DID: ${extObj.caller_id}
            </div>
        </div>
    `;

    rackA.innerHTML = shiftA.map((e, i) => renderCard(e, i)).join('');
    rackB.innerHTML = shiftB.map((e, i) => renderCard(e, i + 5)).join('');
}

document.addEventListener('DOMContentLoaded', initControllerPage);
