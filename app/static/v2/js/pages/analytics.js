/**
 * V2 analytics.js - Telephony Analytics & Reports Controller
 */

let selectedPreset = 'all_time';
let systemShiftALabel = 'Shift A';
let systemShiftBLabel = 'Shift B';

async function initAnalyticsPage() {
    await window.appShell.mount({
        activePage: 'analytics',
        pageTitle: 'Telephony Analytics & Audit Reports',
        pageSubtitle: 'Carrier Billed Minutes Reconciliation, Peak PKT Distribution & Answer Rates',
        headerActionsHtml: `
            <button class="v2-btn v2-btn-secondary v2-btn-sm" onclick="fetchAnalyticsData()">
                <span>🔄</span>
                <span>Refresh Metrics</span>
            </button>
        `
    });

    ensureAnalyticsDomIntegrity();
    await loadBranding();
    await fetchAnalyticsData();

    // Auto-refresh metrics every 45s if tab is visible
    setInterval(() => {
        if (!document.hidden) {
            fetchAnalyticsData();
        }
    }, 45000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            fetchAnalyticsData();
        }
    });
}

/**
 * Self-healing DOM integrity enforcement:
 * Ensures custom date range picker, 6 macro KPI cards, and all 10 DID audit
 * columns are always rendered even if the client browser served a cached HTML structure.
 */
function ensureAnalyticsDomIntegrity() {
    // 1. Ensure 'custom' option exists in preset dropdown
    const presetSelect = document.getElementById('date-preset-select');
    if (presetSelect) {
        let hasCustom = false;
        for (let i = 0; i < presetSelect.options.length; i++) {
            if (presetSelect.options[i].value === 'custom') {
                hasCustom = true;
                break;
            }
        }
        if (!hasCustom) {
            const opt = document.createElement('option');
            opt.value = 'custom';
            opt.text = 'Custom Date Range';
            presetSelect.appendChild(opt);
        }
        if (presetSelect.options[0] && presetSelect.options[0].value === 'all_time') {
            presetSelect.options[0].text = 'All Time (Campaign Inception)';
        }
    }

    // 2. Ensure custom-date-container exists
    let customContainer = document.getElementById('custom-date-container');
    if (!customContainer && presetSelect && presetSelect.parentElement) {
        customContainer = document.createElement('div');
        customContainer.id = 'custom-date-container';
        customContainer.style.display = 'none';
        customContainer.style.alignItems = 'center';
        customContainer.style.gap = '0.5rem';
        customContainer.style.flexWrap = 'wrap';
        customContainer.innerHTML = `
            <input type="date" id="start-date-input" class="v2-input" style="width: auto; min-width: 140px; padding: 0.4rem 0.75rem; font-size: 0.82rem;" onchange="onCustomDateChange()">
            <span style="color: var(--v2-text-muted); font-size: 0.85rem; font-weight: 600;">to</span>
            <input type="date" id="end-date-input" class="v2-input" style="width: auto; min-width: 140px; padding: 0.4rem 0.75rem; font-size: 0.82rem;" onchange="onCustomDateChange()">
            <button type="button" class="v2-btn v2-btn-secondary v2-btn-sm" onclick="fetchAnalyticsData()" style="padding: 0.4rem 0.75rem;">
                <span>Apply</span>
            </button>
        `;
        presetSelect.parentElement.appendChild(customContainer);
    }

    // 3. Ensure 6 Macro KPI Cards exist
    const kpiGrid = document.querySelector('.kpi-grid');
    if (kpiGrid && !document.getElementById('kpi-leads-count')) {
        kpiGrid.innerHTML = `
            <div class="kpi-card">
                <div class="kpi-header">
                    <span class="kpi-label">Total Outbound Dialed</span>
                    <span class="kpi-icon">📊</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value" id="kpi-total-dialed">0</span>
                </div>
                <span class="kpi-subtext">Completed + Attempted calls</span>
            </div>

            <div class="kpi-card">
                <div class="kpi-header">
                    <span class="kpi-label">Overall Answer Rate</span>
                    <span class="kpi-icon">📞</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value" style="color: var(--v2-primary);" id="kpi-answer-rate">0.0%</span>
                </div>
                <span class="kpi-subtext" id="kpi-answered-count">0 calls answered</span>
            </div>

            <div class="kpi-card">
                <div class="kpi-header">
                    <span class="kpi-label">Total Active Duration</span>
                    <span class="kpi-icon">⏱️</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value" style="color: var(--v2-emerald);" id="kpi-total-duration">0s</span>
                </div>
                <span class="kpi-subtext" id="kpi-avg-duration-sub">Avg: 0.0s per answered call</span>
            </div>

            <div class="kpi-card" style="border-left: 3px solid var(--v2-primary);">
                <div class="kpi-header">
                    <span class="kpi-label">Carrier Billed Minutes</span>
                    <span class="kpi-icon">🏛️</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value" style="color: var(--v2-primary);" id="kpi-billed-minutes">0 Mins</span>
                </div>
                <span class="kpi-subtext">Per-call 60s pulse billing ceiling</span>
            </div>

            <div class="kpi-card">
                <div class="kpi-header">
                    <span class="kpi-label">Mid-Call Drop-off Rate</span>
                    <span class="kpi-icon">⚠️</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value" style="color: var(--v2-amber);" id="kpi-drop-rate">0.0%</span>
                </div>
                <span class="kpi-subtext" id="kpi-drops-count">0 mid-call hangups</span>
            </div>

            <div class="kpi-card">
                <div class="kpi-header">
                    <span class="kpi-label">Interested Leads (Key 1)</span>
                    <span class="kpi-icon">🎯</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value" style="color: var(--v2-role-admin);" id="kpi-leads-count">0</span>
                </div>
                <span class="kpi-subtext" id="kpi-conversion-rate">0.0% conversion rate</span>
            </div>
        `;
    }

    // 4. Ensure DID Table has all 10 column headers
    const didTbody = document.getElementById('did-table-body') || document.getElementById('ext-perf-tbody');
    if (didTbody) {
        didTbody.id = 'did-table-body';
        const table = didTbody.closest('table');
        if (table) {
            const thead = table.querySelector('thead');
            if (thead) {
                thead.innerHTML = `
                    <tr>
                        <th>Extension</th>
                        <th>Outbound DID Number</th>
                        <th>Shift Group</th>
                        <th>Total Dialed</th>
                        <th>Answered Calls</th>
                        <th>Answer Rate %</th>
                        <th>Total Active Duration</th>
                        <th>Carrier Billed Mins</th>
                        <th>Mid-Call Drops</th>
                        <th>Leads Converted</th>
                    </tr>
                `;
            }
        }
    }

    // 5. Ensure Hourly Table has correct headers
    const hourlyTbody = document.getElementById('hourly-table-body') || document.getElementById('hourly-table-tbody');
    if (hourlyTbody) {
        hourlyTbody.id = 'hourly-table-body';
        const table = hourlyTbody.closest('table');
        if (table) {
            const thead = table.querySelector('thead');
            if (thead) {
                thead.innerHTML = `
                    <tr>
                        <th>Hour of Day (PKT)</th>
                        <th>Calls Dialed</th>
                        <th>Calls Answered</th>
                        <th>Hourly Answer Rate %</th>
                        <th>Interested Leads (Key 1)</th>
                    </tr>
                `;
            }
        }
    }
}

async function loadBranding() {
    try {
        const data = await window.apiClient.get('/api/v1/system/branding');
        if (data) {
            if (data.shift_a_label) systemShiftALabel = data.shift_a_label.split('(')[0].trim() || 'Shift A';
            if (data.shift_b_label) systemShiftBLabel = data.shift_b_label.split('(')[0].trim() || 'Shift B';
            if (data.extension_range_label) {
                const titleEl = document.getElementById('did-card-title-text');
                if (titleEl) titleEl.innerText = `📱 Line Extension DID Audit & Performance (Extensions ${data.extension_range_label})`;
            }
        }
    } catch (e) {
        console.warn('[Analytics] Failed to load branding:', e);
    }
}

function handleDatePresetChange(val) {
    selectedPreset = val;
    const customContainer = document.getElementById('custom-date-container');
    if (val === 'custom') {
        if (customContainer) customContainer.style.display = 'inline-flex';
        // If dates not set, default start to 7 days ago and end to today
        const startInput = document.getElementById('start-date-input');
        const endInput = document.getElementById('end-date-input');
        if (startInput && !startInput.value) {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            startInput.value = d.toISOString().split('T')[0];
        }
        if (endInput && !endInput.value) {
            endInput.value = new Date().toISOString().split('T')[0];
        }
    } else {
        if (customContainer) customContainer.style.display = 'none';
    }
    fetchAnalyticsData();
}

function onCustomDateChange() {
    if (selectedPreset === 'custom') {
        fetchAnalyticsData();
    }
}

function getAnalyticsQueryParams() {
    let query = `preset=${encodeURIComponent(selectedPreset)}`;
    if (selectedPreset === 'custom') {
        const startInput = document.getElementById('start-date-input');
        const endInput = document.getElementById('end-date-input');
        if (startInput && startInput.value) {
            query += `&start_date=${encodeURIComponent(startInput.value)}`;
        }
        if (endInput && endInput.value) {
            query += `&end_date=${encodeURIComponent(endInput.value)}`;
        }
    }
    return query;
}

async function fetchAnalyticsData() {
    try {
        ensureAnalyticsDomIntegrity();
        const query = getAnalyticsQueryParams();
        const [overview, dids, hourly] = await Promise.all([
            window.apiClient.get(`/api/v1/analytics/overview?${query}`),
            window.apiClient.get(`/api/v1/analytics/did-performance?${query}`),
            window.apiClient.get(`/api/v1/analytics/hourly-distribution?${query}`)
        ]);

        renderScorecards(overview);
        renderDidTable(dids || []);
        renderHourlyTable(hourly || []);
    } catch (err) {
        console.error('[Analytics] Error:', err);
    }
}

function renderScorecards(data) {
    if (!data) return;

    const totalDialedEl = document.getElementById('kpi-total-dialed') || document.getElementById('metric-total-dialed');
    if (totalDialedEl) totalDialedEl.textContent = (data.total_dialed || 0).toLocaleString();

    const answerRateEl = document.getElementById('kpi-answer-rate') || document.getElementById('metric-answer-rate');
    if (answerRateEl) answerRateEl.textContent = `${data.answer_rate_pct || 0}%`;

    const answeredCountEl = document.getElementById('kpi-answered-count') || document.getElementById('metric-total-answered');
    if (answeredCountEl) answeredCountEl.textContent = `${(data.total_answered || 0).toLocaleString()} calls answered`;

    const durationEl = document.getElementById('kpi-total-duration');
    if (durationEl) durationEl.textContent = data.total_duration_formatted || `${data.total_duration_sec || 0}s`;

    const avgDurationEl = document.getElementById('kpi-avg-duration-sub');
    if (avgDurationEl) avgDurationEl.textContent = `Avg: ${data.avg_duration_sec || 0}s per answered call`;

    const billedEl = document.getElementById('kpi-billed-minutes') || document.getElementById('metric-billed-mins');
    if (billedEl) billedEl.textContent = `${(data.total_billed_minutes || 0).toLocaleString()} Mins`;

    const dropRateEl = document.getElementById('kpi-drop-rate');
    if (dropRateEl) dropRateEl.textContent = `${data.mid_call_drop_rate_pct || 0}%`;

    const dropsCountEl = document.getElementById('kpi-drops-count');
    if (dropsCountEl) dropsCountEl.textContent = `${(data.mid_call_drops || 0).toLocaleString()} mid-call hangups`;

    const leadsCountEl = document.getElementById('kpi-leads-count');
    if (leadsCountEl) leadsCountEl.textContent = (data.interested_leads || 0).toLocaleString();

    const conversionRateEl = document.getElementById('kpi-conversion-rate');
    if (conversionRateEl) conversionRateEl.textContent = `${data.conversion_rate_pct || 0}% conversion rate`;
}

function renderDidTable(dids) {
    const tbody = document.getElementById('did-table-body') || document.getElementById('ext-perf-tbody');
    if (!tbody) return;

    if (!dids || dids.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--v2-text-muted); padding: 2.5rem;">No DID call data available for this range.</td></tr>`;
        return;
    }

    tbody.innerHTML = dids.map(d => {
        const rawShift = d.shift_group === 'SHIFT_A' ? systemShiftALabel : systemShiftBLabel;
        const cleanShiftText = (rawShift || '').split('(')[0].trim() || (d.shift_group === 'SHIFT_A' ? 'Shift A' : 'Shift B');
        const shiftColor = d.shift_group === 'SHIFT_A' ? 'var(--v2-primary)' : 'var(--v2-role-admin)';
        const shiftBadge = `<span style="font-weight: 600; color: ${shiftColor};">${cleanShiftText}</span>`;

        let ratePillClass = 'answered';
        if (d.answer_rate_pct < 40) ratePillClass = 'failed';
        else if (d.answer_rate_pct < 60) ratePillClass = 'ringing';

        const formattedDur = (d.total_duration_formatted && d.total_duration_formatted !== 'undefined')
            ? d.total_duration_formatted
            : (d.total_duration_sec ? `${d.total_duration_sec}s` : '0s');
        const avgSec = d.avg_duration_sec !== undefined ? d.avg_duration_sec : 0;
        const billedMins = d.total_billed_minutes !== undefined ? d.total_billed_minutes : 0;

        return `
            <tr>
                <td style="font-weight: 700; font-family: monospace; color: #0f172a;">Ext ${d.extension}</td>
                <td style="font-weight: 600; font-family: monospace; color: var(--v2-role-admin);">${d.did_number || 'Default DID'}</td>
                <td>${shiftBadge}</td>
                <td style="font-weight: 600; color: #0f172a;">${(d.total_dialed || 0).toLocaleString()}</td>
                <td style="color: var(--v2-primary); font-weight: 600;">${(d.total_answered || 0).toLocaleString()}</td>
                <td><span class="status-pill ${ratePillClass}">${d.answer_rate_pct || 0}%</span></td>
                <td style="font-weight: 600; color: var(--v2-emerald);">${formattedDur} <span style="font-size: 0.72rem; color: var(--v2-text-muted); font-weight: normal;">(${avgSec}s avg)</span></td>
                <td style="font-weight: 700; color: var(--v2-primary);">${billedMins.toLocaleString()} Mins</td>
                <td style="color: var(--v2-amber); font-weight: 600;">${(d.mid_call_drops || 0).toLocaleString()}</td>
                <td style="font-weight: 700; color: var(--v2-role-admin);">${(d.interested_leads || 0).toLocaleString()}</td>
            </tr>
        `;
    }).join('');
}

function renderHourlyTable(hourly) {
    const tbody = document.getElementById('hourly-table-body') || document.getElementById('hourly-table-tbody');
    if (!tbody) return;

    const activeHours = (hourly || []).filter(h => h.dialed > 0);
    if (activeHours.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--v2-text-muted); padding: 2.5rem;">No hourly campaign telemetry available for this range.</td></tr>`;
        return;
    }

    tbody.innerHTML = activeHours.map(h => {
        const rate = h.dialed > 0 ? (h.answered / h.dialed * 100).toFixed(1) : '0.0';
        return `
            <tr>
                <td style="font-weight: 700; color: #0f172a; font-family: monospace;">${h.hour} PKT</td>
                <td style="font-weight: 600; color: #0f172a;">${(h.dialed || 0).toLocaleString()}</td>
                <td style="color: var(--v2-primary); font-weight: 600;">${(h.answered || 0).toLocaleString()}</td>
                <td><span class="status-pill answered">${rate}%</span></td>
                <td style="font-weight: 700; color: var(--v2-role-admin);">${(h.leads || 0).toLocaleString()}</td>
            </tr>
        `;
    }).join('');
}

document.addEventListener('DOMContentLoaded', initAnalyticsPage);
