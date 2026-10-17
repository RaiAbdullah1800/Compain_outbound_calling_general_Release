/**
 * V2 queue.js - Call Queue & Leads Management Controller
 */

let currentPage = 1;
let pageSize = 50;
let totalRecords = 0;
let totalPages = 1;
let selectedIds = new Set();
let searchQuery = '';

async function initQueuePage() {
    await window.appShell.mount({
        activePage: 'queue',
        pageTitle: 'Call Queue & Lead Processing',
        pageSubtitle: 'Pending Outbound Queue, Batch CSV Ingestion & Targeted Missed Retries',
        headerActionsHtml: `
            <button class="v2-btn v2-btn-secondary v2-btn-sm" data-role="admin" onclick="openModal('quick-skip-modal')">
                <span>📋</span>
                <span>Paste Numbers to Skip</span>
            </button>
            <button class="v2-btn v2-btn-primary v2-btn-sm" data-role="admin" onclick="document.getElementById('queue-csv-file-input').click()">
                <span>📁</span>
                <span>Upload CSV Leads</span>
            </button>
            <input type="file" id="queue-csv-file-input" accept=".csv" style="display: none;" onchange="handleCSVUpload(event)">
        `
    });

    await Promise.all([
        fetchQueueData(),
        fetchRetryStats()
    ]);
}

async function fetchQueueData() {
    const tbody = document.getElementById('queue-table-tbody');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--v2-text-muted); padding: 2rem;">Loading pending queue...</td></tr>`;

    try {
        let url = `/api/v1/calls/paginated?page=${currentPage}&page_size=${pageSize}&status=queued`;
        if (searchQuery) {
            url += `&search=${encodeURIComponent(searchQuery)}`;
        }

        const data = await window.apiClient.get(url);

        totalRecords = data.total_records || 0;
        totalPages = data.total_pages || 1;
        currentPage = data.current_page || 1;

        renderQueueTable(data.calls || []);
        updatePagination(totalRecords, totalPages);

        const badge = document.getElementById('shell-queue-count-badge');
        if (badge) badge.textContent = totalRecords.toLocaleString();

        const countEl = document.getElementById('queue-total-count-text');
        if (countEl) countEl.textContent = `${totalRecords.toLocaleString()} Leads Pending`;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--v2-rose); padding: 2rem;">Error: ${err.message}</td></tr>`;
    }
}

function renderQueueTable(calls) {
    const tbody = document.getElementById('queue-table-tbody');
    if (!calls || calls.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--v2-text-muted); padding: 2.5rem;">No pending leads matching your filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = calls.map(r => {
        const isChecked = selectedIds.has(r.id) ? 'checked' : '';
        const custom = r.custom_vars || {};
        const name = r.candidate_name || custom.name || custom.candidate_name || 'N/A';
        const father = r.father_name || custom.father_name || '—';
        const timeStr = typeof formatPKTime === 'function' ? formatPKTime(r.created_at) : (window.formatPKTime ? window.formatPKTime(r.created_at) : (r.created_at || '—'));
        const retryLvl = typeof r.retry_count === 'number' ? r.retry_count : 0;

        return `
            <tr>
                <td style="width: 40px; text-align: center;">
                    <input type="checkbox" value="${r.id}" ${isChecked} onchange="toggleSelectRow('${r.id}', this.checked)">
                </td>
                <td style="font-weight: 600;">${name}</td>
                <td style="color: var(--v2-text-muted);">${father}</td>
                <td style="font-family: monospace; font-weight: 600; color: var(--v2-primary);">${r.to_number}</td>
                <td>
                    <span class="status-pill queued">QUEUED</span>
                    ${retryLvl > 0 ? `<span style="font-size: 0.72rem; color: var(--v2-role-admin); font-weight: 600; margin-left: 4px;">(Attempt #${retryLvl})</span>` : ''}
                </td>
                <td style="color: var(--v2-text-muted); font-size: 0.78rem;">${timeStr}</td>
                <td style="text-align: right;">
                    <button class="v2-btn v2-btn-danger v2-btn-sm" data-role="admin" onclick="skipSingleCall('${r.id}', '${r.to_number}')">
                        ✕ Skip
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function updatePagination(total, maxPages) {
    const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);

    const info = document.getElementById('queue-pagination-info');
    if (info) info.innerHTML = `Showing <strong>${start.toLocaleString()}</strong> – <strong>${end.toLocaleString()}</strong> of <strong>${total.toLocaleString()}</strong> leads`;

    const pageNum = document.getElementById('queue-page-num');
    if (pageNum) pageNum.textContent = `Page ${currentPage} of ${maxPages}`;

    const prevBtn = document.getElementById('btn-queue-prev');
    const nextBtn = document.getElementById('btn-queue-next');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= maxPages;
}

function changePage(delta) {
    currentPage += delta;
    fetchQueueData();
}

function toggleSelectRow(id, checked) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkButtonState();
}

function toggleSelectAll(checked) {
    document.querySelectorAll('#queue-table-tbody input[type="checkbox"]').forEach(cb => {
        cb.checked = checked;
        if (checked) selectedIds.add(cb.value);
        else selectedIds.delete(cb.value);
    });
    updateBulkButtonState();
}

function updateBulkButtonState() {
    const btn = document.getElementById('btn-remove-selected-queue');
    if (btn) {
        btn.disabled = selectedIds.size === 0;
        btn.textContent = `🗑️ Remove Selected (${selectedIds.size})`;
    }
}

async function removeSelectedQueue() {
    if (!window.rbac.checkPermission('remove selected queued leads')) return;
    if (selectedIds.size === 0) return;

    if (!confirm(`Are you sure you want to remove ${selectedIds.size} selected leads from the queue?`)) return;

    try {
        const res = await window.apiClient.post('/api/v1/campaigns/queue/remove-calls', {
            call_ids: Array.from(selectedIds),
            reason: 'Removed by admin via V2 queue console'
        });
        window.showToast(`✓ Removed ${res.removed_count} leads`, 'success');
        selectedIds.clear();
        updateBulkButtonState();
        fetchQueueData();
    } catch (err) {
        window.showToast(`Error removing calls: ${err.message}`, 'error');
    }
}

async function skipSingleCall(callId, phoneNumber) {
    if (!window.rbac.checkPermission('skip queued calls')) return;

    try {
        await window.apiClient.delete(`/api/v1/campaigns/queue/calls/${callId}`);
        window.showToast(`✓ Call to ${phoneNumber} skipped`, 'success');
        selectedIds.delete(callId);
        fetchQueueData();
    } catch (err) {
        window.showToast(`Error skipping call: ${err.message}`, 'error');
    }
}

async function clearEntireQueue() {
    if (!window.rbac.checkPermission('clear entire call queue')) return;
    if (!confirm("⚠️ WARNING:\nAre you sure you want to completely PURGE all pending leads from the database queue? This cannot be undone.")) return;

    try {
        const res = await window.apiClient.delete('/api/v1/campaigns/clear-queue');
        window.showToast(`🗑️ ${res.message || 'Queue cleared'}`, 'success');
        selectedIds.clear();
        updateBulkButtonState();
        fetchQueueData();
    } catch (err) {
        window.showToast(`Error clearing queue: ${err.message}`, 'error');
    }
}

async function handleCSVUpload(event) {
    if (!window.rbac.checkPermission('upload CSV lead batches')) {
        event.target.value = '';
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    window.showToast(`⏳ Uploading & parsing ${file.name}...`, 'info');

    try {
        const res = await window.apiClient.postFormData('/api/v1/contacts/upload-csv', formData);
        window.showToast(`✅ Uploaded! ${res.queued_calls || res.imported_contacts || 'Contacts'} leads queued`, 'success');
        fetchQueueData();
    } catch (err) {
        window.showToast(`✕ Upload failed: ${err.message}`, 'error');
    } finally {
        event.target.value = '';
    }
}

async function submitQuickSkipNumbers() {
    if (!window.rbac.checkPermission('skip numbers in bulk')) return;

    const input = document.getElementById('quick-skip-textarea').value.trim();
    if (!input) {
        window.showToast('Please paste at least one phone number', 'warning');
        return;
    }

    // Parse list of phone numbers by newlines, commas, spaces
    const phoneNumbers = input.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
    if (phoneNumbers.length === 0) {
        window.showToast('No valid phone numbers found in input', 'warning');
        return;
    }

    closeModal('quick-skip-modal');
    window.showToast('⏳ Processing skip list...', 'info');

    try {
        const res = await window.apiClient.post('/api/v1/campaigns/queue/remove-numbers', {
            phone_numbers: phoneNumbers,
            reason: 'Skipped by admin from V2 queue console'
        });
        window.showToast(`✓ ${res.removed_count || 0} matching calls canceled`, 'success');
        document.getElementById('quick-skip-textarea').value = '';
        fetchQueueData();
    } catch (err) {
        window.showToast(`✕ Error skipping numbers: ${err.message}`, 'error');
    }
}

async function fetchRetryStats() {
    try {
        const data = await window.apiClient.get('/api/v1/calls/retry-stats');
        const sel = document.getElementById('retry-level-select');
        if (sel && data) {
            sel.options[0].text = `Attempt #0 (Initial Missed Calls) — ${data.attempt_0_count || 0} leads`;
            sel.options[1].text = `Attempt #1 (1st Retry Missed Calls) — ${data.attempt_1_count || 0} leads`;
            sel.options[2].text = `Attempt #2 (2nd Retry Missed Calls) — ${data.attempt_2_count || 0} leads`;
        }
    } catch (_) {}
}

async function triggerTargetedReiteration() {
    if (!window.rbac.checkPermission('re-queue missed calls')) return;

    const sel = document.getElementById('retry-level-select');
    const level = parseInt(sel.value, 10);
    const label = sel.options[sel.selectedIndex].text;

    if (!confirm(`Are you sure you want to re-queue missed leads for:\n${label}?`)) return;

    try {
        const res = await window.apiClient.post('/api/v1/calls/reiterate', { retry_level: level });
        window.showToast(`🚀 Re-queued ${res.requeued_count || 0} calls`, 'success');
        fetchQueueData();
        fetchRetryStats();
    } catch (err) {
        window.showToast(`Error reiterating: ${err.message}`, 'error');
    }
}

function handleSearchChange(val) {
    searchQuery = val.trim();
    currentPage = 1;
    fetchQueueData();
}

document.addEventListener('DOMContentLoaded', initQueuePage);
