/**
 * V2 live.js - Live Flight Monitor Page Controller
 * Includes real-time Asterisk ARI Channels, Mission Control Cooldown Bar, and Search/Filters
 */

// Active Telephony Channels State
const activeChannelsMap = new Map();
let socket = null;
let searchDebounceTimer = null;
let isCampaignPaused = false;

// Table Pagination & Filter State
let liveCurrentPage = 1;
let livePageSize = 25;
let liveSearchQuery = '';
let liveStatusFilter = 'ALL';
let liveDtmfFilter = 'ALL';
let liveTotalRecords = 0;
let liveTotalPages = 1;

// Scorecard Scope & Cache State
let currentKpiPeriod = 'all_time';
let cachedMetricsAllTime = null;
let cachedMetricsToday = null;

async function initLivePage() {
    await window.appShell.mount({
        activePage: 'live',
        pageTitle: 'Live Flight Monitor',
        pageSubtitle: 'Real-time Asterisk ARI Channels, Connected Sessions & Call Feed',
        headerActionsHtml: `
            <button class="v2-btn v2-btn-primary v2-btn-sm" data-role="admin" onclick="openModal('initiate-call-modal')">
                <span>📞</span>
                <span>Initiate Call</span>
            </button>
        `
    });

    await Promise.all([
        fetchCampaignStatus(),
        refreshLiveData()
    ]);

    initWebSocket();

    // Auto-refresh polling every 12 seconds
    setInterval(() => {
        if (!document.hidden) {
            refreshLiveData(false);
            fetchCampaignStatus();
        }
    }, 12000);

    // Live elapsed timer ticker for active in-flight calls (every 1s)
    setInterval(updateActiveChannelsTimers, 1000);
}

// -----------------------------------------------------------------------------
// Live Telemetry & Campaign Mission Control Bar
// -----------------------------------------------------------------------------
async function fetchCampaignStatus() {
    try {
        const data = await window.apiClient.get('/api/v1/campaigns/status');
        isCampaignPaused = data.is_paused || !data.is_running;

        // 1. Campaign Status Badge & Toggle Button
        const statusBadge = document.getElementById('dash-campaign-status');
        const toggleBtn = document.getElementById('btn-dash-toggle-worker');
        const pauseIcon = document.getElementById('dash-pause-icon');
        const pauseText = document.getElementById('dash-pause-text');

        if (statusBadge) {
            if (isCampaignPaused) {
                statusBadge.className = 'status-pill ringing';
                statusBadge.innerHTML = '<span class="live-dot paused"></span><span>PAUSED</span>';
                if (toggleBtn) {
                    toggleBtn.className = 'btn-control-resume';
                    if (pauseIcon) pauseIcon.textContent = '▶️';
                    if (pauseText) pauseText.textContent = 'Resume Campaign';
                }
            } else {
                statusBadge.className = 'status-pill answered';
                statusBadge.innerHTML = '<span class="live-dot active"></span><span>RUNNING</span>';
                if (toggleBtn) {
                    toggleBtn.className = 'btn-control-pause';
                    if (pauseIcon) pauseIcon.textContent = '⏸️';
                    if (pauseText) pauseText.textContent = 'Pause Campaign';
                }
            }
        }

        // 2. Trunk Status
        const trunkBadge = document.getElementById('dash-trunk-status');
        if (trunkBadge) {
            trunkBadge.className = 'status-pill answered';
            trunkBadge.innerHTML = '<span class="live-dot active"></span><span>ONLINE</span>';
        }

        // 3. Carrier Circuit Breaker & Cooldown Safeguard
        const cbBadge = document.getElementById('dash-circuit-breaker-badge');
        const btnResumeCb = document.getElementById('btn-dash-resume-cb');

        if (cbBadge && data.circuit_breaker) {
            const cb = data.circuit_breaker;
            const threshold = cb.threshold || 20;
            const declines = cb.consecutive_declines || 0;

            if (cb.is_active) {
                const remMins = Math.ceil((cb.remaining_seconds || 0) / 60);
                cbBadge.className = 'status-pill busy';
                cbBadge.innerHTML = `<span class="live-dot danger"></span><span>COOLDOWN (${remMins}m)</span>`;
                if (btnResumeCb) btnResumeCb.style.display = 'inline-flex';
            } else if (declines > 0) {
                cbBadge.className = 'status-pill ringing';
                cbBadge.innerHTML = `<span class="live-dot paused"></span><span>${declines}/${threshold} Declines</span>`;
                if (btnResumeCb) btnResumeCb.style.display = 'none';
            } else {
                cbBadge.className = 'status-pill safe';
                cbBadge.innerHTML = `<span class="live-dot active"></span><span>0/${threshold} Safe</span>`;
                if (btnResumeCb) btnResumeCb.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('[Live] Error fetching campaign status:', err);
    }
}

async function togglePauseCampaign() {
    if (!window.rbac.checkPermission('toggle campaign worker state')) return;

    const endpoint = isCampaignPaused ? '/api/v1/campaigns/resume' : '/api/v1/campaigns/pause';
    try {
        await window.apiClient.post(endpoint, {});
        window.showToast(isCampaignPaused ? '▶️ Campaign resumed' : '⏸️ Campaign paused', 'success');
        fetchCampaignStatus();
    } catch (err) {
        window.showToast(`Error: ${err.message}`, 'error');
    }
}

async function triggerEmergencyStop() {
    if (!window.rbac.checkPermission('trigger emergency stop')) return;
    if (!confirm("🛑 EMERGENCY STOP:\nAre you sure you want to PAUSE dialing and immediately HANG UP all active in-flight calls?")) return;

    try {
        const res = await window.apiClient.post('/api/v1/campaigns/emergency-stop', {});
        window.showToast(`🛑 ${res.message || 'Emergency stop executed'}`, 'warning');
        activeChannelsMap.clear();
        renderActiveChannelsRack();
        fetchCampaignStatus();
        refreshLiveData(true);
    } catch (err) {
        window.showToast(`Error: ${err.message}`, 'error');
    }
}

async function resumeCircuitBreaker() {
    if (!window.rbac.checkPermission('reset carrier circuit breaker')) return;

    try {
        const res = await window.apiClient.post('/api/v1/campaigns/circuit-breaker/resume', {});
        window.showToast(res.message || 'Circuit breaker reset. Dialing resumed.', 'success');
        fetchCampaignStatus();
    } catch (err) {
        window.showToast(`Error: ${err.message}`, 'error');
    }
}

// -----------------------------------------------------------------------------
// Live Data Retrieval & Active Channels Hydration
// -----------------------------------------------------------------------------
async function refreshLiveData(resetFeed = false) {
    try {
        let url = `/api/v1/calls/paginated?page=${liveCurrentPage}&page_size=${livePageSize}`;
        if (liveStatusFilter !== 'ALL') url += `&status=${encodeURIComponent(liveStatusFilter)}`;
        if (liveDtmfFilter !== 'ALL') url += `&dtmf=${liveDtmfFilter}`;
        if (liveSearchQuery) url += `&search=${encodeURIComponent(liveSearchQuery)}`;

        const [callsData, allTimeData, todayData] = await Promise.all([
            window.apiClient.get(url),
            window.apiClient.get('/api/v1/analytics/overview?preset=all_time'),
            window.apiClient.get('/api/v1/analytics/overview?preset=today')
        ]);

        cachedMetricsAllTime = allTimeData;
        cachedMetricsToday = todayData;

        liveTotalRecords = callsData.total_records || 0;
        liveTotalPages = callsData.total_pages || 1;
        liveCurrentPage = callsData.current_page || 1;

        // Hydrate active channels from returned calls
        hydrateActiveChannels(callsData.calls || []);

        // Render UI
        renderMetrics();
        renderCallFeed(callsData.calls || []);
        updateLivePaginationUI();
    } catch (err) {
        console.error('[Live] Refresh error:', err);
    }
}

function hydrateActiveChannels(calls) {
    const activeStatuses = new Set(['RINGING', 'ANSWERED', 'IN_PROGRESS', 'IN_CALL']);
    const now = Date.now();

    calls.forEach(call => {
        if (!call || !call.id) return;
        const statusUpper = (call.status || '').toUpperCase();

        if (activeStatuses.has(statusUpper)) {
            let startTime = now;
            const rawIso = call.updated_at || call.created_at;
            if (rawIso) {
                let iso = typeof rawIso === 'string' ? rawIso.trim() : rawIso;
                if (typeof iso === 'string') {
                    if (!iso.includes('T') && iso.includes(' ')) iso = iso.replace(' ', 'T');
                    if (!iso.endsWith('Z') && !iso.includes('+')) iso += 'Z';
                }
                const parsed = new Date(iso).getTime();
                if (!isNaN(parsed)) startTime = parsed;
            }

            activeChannelsMap.set(call.id, {
                id: call.id,
                to_number: call.to_number,
                candidate_name: call.candidate_name || (call.custom_vars && call.custom_vars.name) || 'Lead',
                caller_id: call.caller_id || (call.extension_used ? `Ext ${call.extension_used}` : '415393002'),
                status: statusUpper,
                duration: call.duration || 0,
                start_time: startTime,
                channel_id: call.channel_id || ''
            });
        } else {
            // Completed or failed -> remove from active channels
            activeChannelsMap.delete(call.id);
        }
    });

    renderActiveChannelsRack();
}

function formatCallerId(callerId) {
    if (!callerId) return 'Ext Line';
    const extMatch = callerId.match(/Ext\s*\d+/i);
    if (extMatch) return extMatch[0];
    if (/^\d{3,5}$/.test(callerId)) return `Ext ${callerId}`;
    const angleMatch = callerId.match(/<(\d+)>/);
    if (angleMatch) return `Line ${angleMatch[1].slice(-4)}`;
    return callerId.length > 10 ? callerId.slice(0, 10) : callerId;
}

function renderActiveChannelsRack() {
    const container = document.getElementById('active-channels-container');
    const activeCount = activeChannelsMap.size;

    // Update KPI scorecard
    const activeEl = document.getElementById('metric-active-channels');
    if (activeEl) activeEl.textContent = `${activeCount} / 5`;

    // Update sidebar badge
    const badge = document.getElementById('shell-active-channels-badge');
    if (badge) badge.textContent = `${activeCount} Live`;

    if (!container) return;

    const now = Date.now();
    const activeList = Array.from(activeChannelsMap.values());
    const totalSlots = 5;

    let slotsHtml = '';
    for (let i = 0; i < totalSlots; i++) {
        if (i < activeList.length) {
            const c = activeList[i];
            const elapsedSec = Math.max(0, Math.floor((now - c.start_time) / 1000));
            const mins = Math.floor(elapsedSec / 60);
            const secs = elapsedSec % 60;
            const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

            const isAnswered = c.status === 'ANSWERED' || c.status === 'IN_PROGRESS';
            const statusClass = isAnswered ? 'answered' : 'ringing';
            const statusLabel = isAnswered ? 'ANSWERED' : 'RINGING';

            slotsHtml += `
                <div class="channel-strip ${statusClass}">
                    <div class="channel-strip-header">
                        <span class="channel-strip-num">CH ${i + 1}</span>
                        <span class="status-pill ${statusClass}" style="font-size: 0.62rem; padding: 0.1rem 0.45rem;">
                            <span class="live-dot ${isAnswered ? 'active' : 'paused'}" style="width: 5px; height: 5px;"></span>
                            <span>${statusLabel}</span>
                        </span>
                    </div>
                    <div class="channel-strip-body">
                        <span class="channel-strip-phone" title="${c.to_number}">
                            ${c.to_number}
                        </span>
                        <span class="channel-strip-timer">
                            ⏱ ${timeStr}
                        </span>
                    </div>
                    <div class="channel-strip-name" title="${c.candidate_name}">
                        ${c.candidate_name}
                    </div>
                    <div class="channel-strip-footer">
                        <span class="channel-strip-ext">DID: ${formatCallerId(c.caller_id)}</span>
                        <span class="channel-strip-status-live">● In-Flight</span>
                    </div>
                </div>
            `;
        } else {
            slotsHtml += `
                <div class="channel-strip idle">
                    <div class="channel-strip-header">
                        <span class="channel-strip-num">CH ${i + 1}</span>
                        <span class="status-pill-standby">STANDBY</span>
                    </div>
                    <div class="channel-strip-body">
                        <span class="channel-strip-phone" style="color: var(--v2-text-muted); font-size: 0.85rem; font-weight: 500;">
                            Line Standby
                        </span>
                        <span class="channel-strip-idle-tag">Ready</span>
                    </div>
                    <div class="channel-strip-name" style="color: var(--v2-text-muted); opacity: 0.5;">
                        Awaiting dispatch...
                    </div>
                    <div class="channel-strip-footer">
                        <span>Nayatel Trunk</span>
                        <span>Available</span>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = slotsHtml;
}

function updateActiveChannelsTimers() {
    if (activeChannelsMap.size === 0) return;
    renderActiveChannelsRack();
}

function setKpiPeriod(period) {
    currentKpiPeriod = period;
    const btnAll = document.getElementById('btn-kpi-alltime');
    const btnToday = document.getElementById('btn-kpi-today');
    if (btnAll && btnToday) {
        if (period === 'all_time') {
            btnAll.classList.add('active');
            btnToday.classList.remove('active');
        } else {
            btnToday.classList.add('active');
            btnAll.classList.remove('active');
        }
    }
    renderMetrics();
}
window.setKpiPeriod = setKpiPeriod;

function renderMetrics() {
    const data = (currentKpiPeriod === 'today') ? cachedMetricsToday : cachedMetricsAllTime;
    if (!data) return;

    const dialedEl = document.getElementById('metric-total-dialed');
    const answeredEl = document.getElementById('metric-total-answered');
    const rateEl = document.getElementById('metric-answer-rate');
    const subtextDialed = document.getElementById('metric-subtext-dialed');
    const subtextAnswered = document.getElementById('metric-subtext-answered');

    if (dialedEl) dialedEl.textContent = (data.total_dialed || 0).toLocaleString();
    if (answeredEl) answeredEl.textContent = (data.total_answered || 0).toLocaleString();
    if (rateEl) rateEl.textContent = `${data.answer_rate_pct || 0}%`;

    if (currentKpiPeriod === 'all_time') {
        if (subtextDialed) {
            const todayCount = (cachedMetricsToday?.total_dialed || 0).toLocaleString();
            subtextDialed.innerHTML = `All-time campaign total · <strong style="color: var(--v2-primary);">Today: ${todayCount}</strong>`;
        }
        if (subtextAnswered) {
            const todayAns = (cachedMetricsToday?.total_answered || 0).toLocaleString();
            const todayRate = cachedMetricsToday?.answer_rate_pct || 0;
            subtextAnswered.innerHTML = `All-time confirmed · <strong style="color: var(--v2-emerald);">Today: ${todayAns} (${todayRate}%)</strong>`;
        }
    } else {
        if (subtextDialed) {
            const allCount = (cachedMetricsAllTime?.total_dialed || 0).toLocaleString();
            subtextDialed.innerHTML = `Today's shift volume · <strong style="color: var(--v2-primary);">All-Time: ${allCount}</strong>`;
        }
        if (subtextAnswered) {
            const allAns = (cachedMetricsAllTime?.total_answered || 0).toLocaleString();
            const allRate = cachedMetricsAllTime?.answer_rate_pct || 0;
            subtextAnswered.innerHTML = `Today's connections · <strong style="color: var(--v2-emerald);">All-Time: ${allAns} (${allRate}%)</strong>`;
        }
    }
}

// Formats UTC ISO timestamps cleanly into Pakistan Standard Time (PKT / Asia/Karachi)
function formatPKTime(dateInput) {
    if (!dateInput) return '—';
    let iso = typeof dateInput === 'string' ? dateInput.trim() : dateInput;
    if (typeof iso === 'string') {
        if (!iso.includes('T') && iso.includes(' ')) {
            iso = iso.replace(' ', 'T');
        }
        if (!iso.endsWith('Z') && !iso.includes('+')) {
            iso += 'Z';
        }
    }
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';

    return d.toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

function renderCallFeed(calls) {
    const tbody = document.getElementById('live-feed-tbody');
    if (!tbody) return;

    if (!calls || calls.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--v2-text-muted); padding: 2.5rem;">No call records matching current filter criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = calls.map(c => {
        const timeStr = formatPKTime(c.updated_at || c.created_at);
        const durStr = (typeof c.duration === 'number' && c.duration > 0) ? `${c.duration}s` : '—';
        const statusUpper = (c.status || '').toUpperCase();
        const pillClass = statusUpper.toLowerCase().replace(/_/g, '-');

        const custom = c.custom_vars || {};
        const pressed1 = c.user_pressed_1 === true || c.dtmf_pressed === '1' || custom.user_pressed_1 === true || custom.dtmf_pressed === '1';
        const dtmf = pressed1 
            ? `<span class="status-pill answered" style="font-weight: 700;">YES (Key 1)</span>` 
            : `<span style="color: var(--v2-text-muted); font-size: 0.8rem;">No</span>`;

        const name = c.candidate_name || custom.name || custom.candidate_name || '';
        const father = c.father_name || custom.father_name || '';
        const nameDisplay = name 
            ? `<div style="font-size: 0.76rem; color: var(--v2-text-muted);">${name}${father ? ' S/O ' + father : ''}</div>` 
            : '';
        const extCaller = c.caller_id || (c.extension_used ? `Ext ${c.extension_used}` : 'Default DID');

        return `
            <tr>
                <td>
                    <div style="font-weight: 600; font-family: monospace; color: var(--v2-text-primary);">${c.to_number}</div>
                    ${nameDisplay}
                </td>
                <td><span class="status-pill ${pillClass}">${statusUpper}</span></td>
                <td>${durStr}</td>
                <td>${dtmf}</td>
                <td style="color: var(--v2-text-muted); font-size: 0.78rem;">${extCaller}</td>
                <td style="color: var(--v2-text-muted); font-size: 0.78rem;">${timeStr}</td>
            </tr>
        `;
    }).join('');
}

// -----------------------------------------------------------------------------
// Pagination & Filter Handlers
// -----------------------------------------------------------------------------
function updateLivePaginationUI() {
    const start = liveTotalRecords === 0 ? 0 : (liveCurrentPage - 1) * livePageSize + 1;
    const end = Math.min(liveCurrentPage * livePageSize, liveTotalRecords);

    const info = document.getElementById('live-pagination-info');
    if (info) info.innerHTML = `Showing <strong>${start.toLocaleString()}</strong> – <strong>${end.toLocaleString()}</strong> of <strong>${liveTotalRecords.toLocaleString()}</strong> calls`;

    const pageNum = document.getElementById('live-page-num');
    if (pageNum) pageNum.textContent = `Page ${liveCurrentPage} of ${liveTotalPages}`;

    const prevBtn = document.getElementById('btn-live-prev');
    const nextBtn = document.getElementById('btn-live-next');
    if (prevBtn) prevBtn.disabled = liveCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = liveCurrentPage >= liveTotalPages;
}

function changeLivePage(delta) {
    const target = liveCurrentPage + delta;
    if (target >= 1 && target <= liveTotalPages) {
        liveCurrentPage = target;
        refreshLiveData(false);
    }
}

function onLiveSearchInput() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        liveSearchQuery = document.getElementById('live-search-input').value.trim();
        liveCurrentPage = 1;
        refreshLiveData(false);
    }, 300);
}

function onLiveFilterChange() {
    liveStatusFilter = document.getElementById('live-status-filter').value;
    liveDtmfFilter = document.getElementById('live-dtmf-filter').value;
    liveCurrentPage = 1;
    refreshLiveData(false);
}

function onLivePageSizeChange() {
    livePageSize = parseInt(document.getElementById('live-pagesize-select').value, 10) || 25;
    liveCurrentPage = 1;
    refreshLiveData(false);
}

// -----------------------------------------------------------------------------
// Real-Time Event-Driven WebSocket Engine
// -----------------------------------------------------------------------------
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/dashboard`;

    try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => console.log('⚡ [Live] Real-time WebSocket connected');

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.event === 'call_updated' || data.event === 'campaign_updated') {
                    // Call state changed in Asterisk ARI -> trigger immediate live data refresh
                    refreshLiveData(false);
                } else if (data.event === 'circuit_breaker_update' || data.event === 'circuit_breaker_tripped' || data.event === 'circuit_breaker_reset') {
                    fetchCampaignStatus();
                } else if (data.event === 'trunk_status') {
                    const trunkBadge = document.getElementById('dash-trunk-status');
                    if (trunkBadge) {
                        trunkBadge.className = data.online ? 'status-pill answered' : 'status-pill busy';
                        trunkBadge.textContent = data.online ? '🟢 ONLINE' : '🔴 OFFLINE';
                    }
                }
            } catch (_) {}
        };

        socket.onclose = () => {
            setTimeout(initWebSocket, 3500);
        };
    } catch (_) {}
}

async function handleInitiateCallSubmit(e) {
    e.preventDefault();
    if (!window.rbac.checkPermission('initiate outbound calls')) return;

    const phoneInput = document.getElementById('modal-call-phone');
    const callerInput = document.getElementById('modal-call-callerid');
    const to_number = phoneInput.value.trim();
    const caller_id = callerInput.value.trim() || undefined;

    closeModal('initiate-call-modal');

    try {
        await window.apiClient.post('/api/v1/calls/initiate', { to_number, caller_id });
        window.showToast(`🚀 Call initiated to ${to_number}`, 'success');
        refreshLiveData(false);
    } catch (err) {
        window.showToast(`Error initiating call: ${err.message}`, 'error');
    }
}

document.addEventListener('DOMContentLoaded', initLivePage);
