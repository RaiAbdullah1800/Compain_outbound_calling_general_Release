/**
 * toast.js - Standalone Notification Component (Frontend v2)
 */

function ensureToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Display a modern toast notification.
 * @param {string} message - Message text to display
 * @param {'info'|'success'|'error'|'warning'} type - Notification type
 * @param {number} duration - Milliseconds before auto-dismiss
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const colors = {
        success: { bg: 'rgba(16, 185, 129, 0.95)', border: '#10b981', text: '#ffffff' },
        error: { bg: 'rgba(239, 68, 68, 0.95)', border: '#ef4444', text: '#ffffff' },
        warning: { bg: 'rgba(245, 158, 11, 0.95)', border: '#f59e0b', text: '#ffffff' },
        info: { bg: 'rgba(59, 130, 246, 0.95)', border: '#3b82f6', text: '#ffffff' }
    };

    const style = colors[type] || colors.info;

    toast.style.cssText = `
        background: #1e293b;
        color: #f8fafc;
        border-left: 4px solid ${style.border};
        border-radius: 8px;
        padding: 0.75rem 1rem;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.86rem;
        min-width: 280px;
        max-width: 420px;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(30px);
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 999999;
    `;

    toast.innerHTML = `
        <span style="font-weight: 800; color: ${style.border}; font-size: 1rem;">${icons[type] || icons.info}</span>
        <span style="flex: 1; line-height: 1.4;">${message}</span>
        <button style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1rem; padding: 0 4px;" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    // Auto dismiss
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

window.showToast = showToast;
