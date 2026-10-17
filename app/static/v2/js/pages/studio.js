/**
 * V2 studio.js - Voice Studio & Audio Messages Controller
 */

let presetsList = [];

async function initStudioPage() {
    await window.appShell.mount({
        activePage: 'studio',
        pageTitle: 'Voice Studio & Audio Messages',
        pageSubtitle: 'Manage Telephony Audio Prompts, Dynamic Voice Presets & 8kHz Phone Normalization',
        headerActionsHtml: `
            <button class="v2-btn v2-btn-primary v2-btn-sm" data-role="admin" onclick="openModal('upload-preset-modal')">
                <span>➕</span>
                <span>Upload New Voice Preset</span>
            </button>
        `
    });

    await fetchVoicePresets();
}

async function fetchVoicePresets() {
    const container = document.getElementById('presets-grid-container');
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--v2-text-muted); padding: 3rem;">Loading voice presets...</div>`;

    try {
        const presets = await window.apiClient.get('/api/v1/voice-presets');
        presetsList = presets;
        renderPresets(presets);
    } catch (err) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--v2-rose); padding: 3rem;">Error loading presets: ${err.message}</div>`;
    }
}

function renderPresets(presets) {
    const container = document.getElementById('presets-grid-container');
    if (presets.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--v2-text-muted); padding: 3rem;">No custom voice presets found.</div>`;
        return;
    }

    container.innerHTML = presets.map(p => {
        const isAct = p.is_active;
        const isDef = p.is_default;

        return `
            <div class="v2-card" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between; border-color: ${isAct ? 'var(--v2-emerald-border)' : 'var(--v2-border)'};">
                <div class="v2-card-header" style="background: ${isAct ? 'rgba(16, 185, 129, 0.04)' : 'transparent'};">
                    <div>
                        <div class="v2-card-title">${p.name}</div>
                        <div class="v2-card-subtitle">${p.description || 'Custom telephony voice message pair'}</div>
                    </div>
                    <div>
                        ${isAct ? `<span class="status-pill answered">● Currently Active</span>` : ''}
                        ${isDef ? `<span class="status-pill interested" style="margin-left: 4px;">System Default</span>` : ''}
                    </div>
                </div>

                <div class="v2-card-body" style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <span style="font-size: 0.74rem; font-weight: 700; color: var(--v2-text-muted); display: block; margin-bottom: 0.35rem;">
                            📢 1. INITIAL ANNOUNCEMENT AUDIO
                        </span>
                        <audio controls style="width: 100%; height: 36px; border-radius: 6px;" src="${p.initial_audio_url}"></audio>
                    </div>

                    <div>
                        <span style="font-size: 0.74rem; font-weight: 700; color: var(--v2-text-muted); display: block; margin-bottom: 0.35rem;">
                            🎵 2. THANKS CONFIRMATION AUDIO
                        </span>
                        <audio controls style="width: 100%; height: 36px; border-radius: 6px;" src="${p.thanks_audio_url}"></audio>
                    </div>

                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--v2-border-subtle);">
                        ${!isAct ? `
                            <button class="v2-btn v2-btn-primary v2-btn-sm" style="flex: 1;" data-role="admin" onclick="activatePreset('${p.id}')">
                                ⚡ Activate Voice Preset
                            </button>
                        ` : `
                            <button class="v2-btn v2-btn-secondary v2-btn-sm" style="flex: 1; opacity: 0.7;" disabled>
                                ✓ In Production
                            </button>
                        `}

                        ${(!isDef && !isAct) ? `
                            <button class="v2-btn v2-btn-danger v2-btn-sm" data-role="admin" onclick="deletePreset('${p.id}')" title="Delete Preset">
                                🗑️
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function activatePreset(id) {
    if (!window.rbac.checkPermission('activate voice presets')) return;

    try {
        const res = await window.apiClient.post(`/api/v1/voice-presets/${id}/activate`, {});
        window.showToast(`✓ ${res.message || 'Preset activated'}`, 'success');
        fetchVoicePresets();
    } catch (err) {
        window.showToast(`Error activating: ${err.message}`, 'error');
    }
}

async function deletePreset(id) {
    if (!window.rbac.checkPermission('delete voice presets')) return;
    if (!confirm('Are you sure you want to permanently delete this voice preset and its audio files?')) return;

    try {
        const res = await window.apiClient.delete(`/api/v1/voice-presets/${id}`);
        window.showToast(`🗑️ ${res.message || 'Preset deleted'}`, 'success');
        fetchVoicePresets();
    } catch (err) {
        window.showToast(`Error deleting: ${err.message}`, 'error');
    }
}

async function handleUploadPresetSubmit(e) {
    e.preventDefault();
    if (!window.rbac.checkPermission('upload voice presets')) return;

    const name = document.getElementById('new-preset-name').value.trim();
    const desc = document.getElementById('new-preset-desc').value.trim();
    const initFile = document.getElementById('new-preset-init-file').files[0];
    const thanksFile = document.getElementById('new-preset-thanks-file').files[0];
    const submitBtn = document.getElementById('btn-submit-upload-preset');

    if (!name || !initFile || !thanksFile) {
        window.showToast('Please provide a name and both audio files', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('name', name);
    if (desc) formData.append('description', desc);
    formData.append('initial_file', initFile);
    formData.append('thanks_file', thanksFile);

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Processing FFmpeg 8kHz Normalization...';

    try {
        const res = await window.apiClient.postFormData('/api/v1/voice-presets', formData);
        window.showToast(`✅ ${res.message || 'Voice preset uploaded'}`, 'success');
        closeModal('upload-preset-modal');
        fetchVoicePresets();
    } catch (err) {
        window.showToast(`✕ Error uploading preset: ${err.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Process & Save Preset';
    }
}

document.addEventListener('DOMContentLoaded', initStudioPage);
