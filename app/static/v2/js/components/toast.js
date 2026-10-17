/**
 * V2 toast.js - Modern Glassmorphic Notification Alerts
 */

function ensureToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; top: 20px; right: 24px; z-index: 999999; display: flex; flex-direction: column; gap: 8px; pointer-events: none;';
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, type = 'info', duration = 3500) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');

    const styles = {
        success: { border: '#10b981', icon: '✓', text: '#059669' },
        error: { border: '#f43f5e', icon: '✕', text: '#e11d48' },
        warning: { border: '#f59e0b', icon: '⚠️', text: '#d97706' },
        info: { border: '#2563eb', icon: 'ℹ️', text: '#2563eb' }
    };

    const s = styles[type] || styles.info;

    toast.style.cssText = `
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        border-left: 4px solid ${s.border};
        border-radius: 8px;
        padding: 0.75rem 1rem;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.84rem;
        min-width: 280px;
        max-width: 420px;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(20px);
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    toast.innerHTML = `
        <span style="font-weight: 800; color: ${s.text}; font-size: 0.95rem;">${s.icon}</span>
        <span style="flex: 1; line-height: 1.4;">${message}</span>
        <button style="background: none; border: none; color: #64748b; cursor: pointer; font-size: 1rem; padding: 0 4px;" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

window.showToast = showToast;
