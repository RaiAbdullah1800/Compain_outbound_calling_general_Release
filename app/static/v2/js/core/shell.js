/**
 * V2 shell.js - Shared Enterprise App Shell (Sidebar & Topbar)
 */

class V2AppShell {
    constructor() {
        this.activePage = '';
        this.branding = null;
    }

    /**
     * Mount the shell layout
     * @param {Object} options
     * @param {string} options.activePage - 'live' | 'queue' | 'controller' | 'studio' | 'analytics' | 'users'
     * @param {string} options.pageTitle - Title displayed in header
     * @param {string} options.pageSubtitle - Subtitle displayed in header
     * @param {string} [options.headerActionsHtml] - Optional action buttons in header
     */
    async mount({ activePage, pageTitle, pageSubtitle, headerActionsHtml = '' }) {
        this.activePage = activePage;

        // Verify auth first
        const user = await window.authService.checkAuth();
        if (!user) return;
        window.rbac.init(user);

        // Render Shell DOM
        this.renderSidebar(user);
        this.renderHeader(pageTitle, pageSubtitle, headerActionsHtml);

        // Fetch dynamic system branding
        this.loadBranding();

        // Listen for trunk and campaign events
        this.initTelemetry();

        // If Viewer, show viewer banner if placeholder exists
        if (window.rbac.isViewer()) {
            const vb = document.getElementById('viewer-banner-slot');
            if (vb) {
                vb.innerHTML = `
                    <div class="viewer-banner">
                        <div style="display: flex; align-items: center; gap: 0.65rem;">
                            <span style="font-size: 1.1rem;">👁️</span>
                            <span><strong>Viewer Mode:</strong> Real-time monitoring and analytics are active. All outbound call dispatching, queue purging, and configuration controls are locked for Administrators.</span>
                        </div>
                        <span class="status-pill busy">Read-Only</span>
                    </div>
                `;
            }
        }
    }

    renderSidebar(user) {
        const sidebarEl = document.getElementById('sidebar-slot');
        if (!sidebarEl) return;

        const isAdmin = window.rbac.isAdmin();
        const roleText = isAdmin ? '🛡️ Admin' : '👁️ Viewer';
        const roleClass = isAdmin ? 'admin' : 'viewer';

        sidebarEl.innerHTML = `
            <aside class="app-sidebar" id="app-sidebar">
                <div class="sidebar-brand">
                    <div class="brand-icon">🏛️</div>
                    <div class="brand-details">
                        <span class="brand-title" id="shell-project-title">Outbound Assistant</span>
                        <span class="brand-subtitle" id="shell-org-title">Telephony Control</span>
                    </div>
                </div>

                <div class="sidebar-nav">
                    <div>
                        <div class="nav-section-label">Real-Time Operations</div>
                        <ul class="nav-menu">
                            <li>
                                <a href="/v2/live" class="nav-link ${this.activePage === 'live' ? 'active' : ''}">
                                    <div class="nav-link-content">
                                        <span class="nav-link-icon">🔴</span>
                                        <span>Live Monitor</span>
                                    </div>
                                    <span class="nav-badge nav-badge-live" id="shell-active-channels-badge">Live</span>
                                </a>
                            </li>
                            <li>
                                <a href="/v2/queue" class="nav-link ${this.activePage === 'queue' ? 'active' : ''}">
                                    <div class="nav-link-content">
                                        <span class="nav-link-icon">📋</span>
                                        <span>Call Queue & Leads</span>
                                    </div>
                                    <span class="nav-badge nav-badge-count" id="shell-queue-count-badge">0</span>
                                </a>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <div class="nav-section-label">Telephony Engine</div>
                        <ul class="nav-menu">
                            <li>
                                <a href="/v2/controller" class="nav-link ${this.activePage === 'controller' ? 'active' : ''}">
                                    <div class="nav-link-content">
                                        <span class="nav-link-icon">⚙️</span>
                                        <span>Campaign & DIDs</span>
                                    </div>
                                </a>
                            </li>
                            <li>
                                <a href="/v2/studio" class="nav-link ${this.activePage === 'studio' ? 'active' : ''}">
                                    <div class="nav-link-content">
                                        <span class="nav-link-icon">🎙️</span>
                                        <span>Voice Studio</span>
                                    </div>
                                </a>
                            </li>
                            <li>
                                <a href="/v2/analytics" class="nav-link ${this.activePage === 'analytics' ? 'active' : ''}">
                                    <div class="nav-link-content">
                                        <span class="nav-link-icon">📈</span>
                                        <span>Telecom Analytics</span>
                                    </div>
                                </a>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <div class="nav-section-label">Administration</div>
                        <ul class="nav-menu">
                            ${isAdmin ? `
                            <li>
                                <a href="/v2/users" class="nav-link ${this.activePage === 'users' ? 'active' : ''}">
                                    <div class="nav-link-content">
                                        <span class="nav-link-icon">👥</span>
                                        <span>User Accounts</span>
                                    </div>
                                </a>
                            </li>
                            ` : ''}
                            <li>
                                <a href="/dashboard" class="nav-link" style="opacity: 0.65;" title="Switch to Legacy V1 View">
                                    <div class="nav-link-content">
                                        <span class="nav-link-icon">↩️</span>
                                        <span>Legacy V1 View</span>
                                    </div>
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="sidebar-footer">
                    <div class="user-card">
                        <div class="user-info">
                            <span class="user-email-text" title="${user.email}">${user.email}</span>
                            <span class="user-role-chip ${roleClass}">${roleText}</span>
                        </div>
                        <button class="btn-sidebar-logout" onclick="window.authService.logout()" title="Sign Out">
                            🚪
                        </button>
                    </div>
                </div>
            </aside>
        `;
    }

    renderHeader(pageTitle, pageSubtitle, headerActionsHtml) {
        const headerEl = document.getElementById('header-slot');
        if (!headerEl) return;

        headerEl.innerHTML = `
            <header class="app-header">
                <div class="header-left">
                    <button class="mobile-menu-btn" onclick="window.appShell.toggleMobileSidebar()">☰</button>
                    <div class="header-breadcrumbs">
                        <h1 class="header-page-title">${pageTitle}</h1>
                        <span class="header-page-subtitle">${pageSubtitle}</span>
                    </div>
                </div>

                <div class="header-actions">
                    <div class="telephony-status-pill">
                        <span class="pulse-dot" id="shell-trunk-dot"></span>
                        <span id="shell-trunk-text" style="color: var(--v2-text-secondary);">Trunk Checking...</span>
                    </div>
                    ${headerActionsHtml}
                </div>
            </header>
        `;
    }

    toggleMobileSidebar() {
        const sb = document.getElementById('app-sidebar');
        if (sb) sb.classList.toggle('open');
    }

    async loadBranding() {
        try {
            const data = await window.apiClient.get('/api/v1/system/branding');
            this.branding = data;
            const pTitle = document.getElementById('shell-project-title');
            const oTitle = document.getElementById('shell-org-title');
            if (pTitle && data.project_name) pTitle.textContent = data.project_name;
            if (oTitle && data.organization_name) oTitle.textContent = data.organization_name;
        } catch (_) {}
    }

    initTelemetry() {
        // WebSocket for live trunk & queue updates
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/ws/dashboard`);
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.event === 'trunk_status') {
                        const dot = document.getElementById('shell-trunk-dot');
                        const text = document.getElementById('shell-trunk-text');
                        if (dot && text) {
                            if (data.online) {
                                dot.className = 'pulse-dot';
                                text.textContent = 'Nayatel SIP Online';
                            } else {
                                dot.className = 'pulse-dot error';
                                text.textContent = 'Trunk Unreachable';
                            }
                        }
                    }
                } catch (_) {}
            };
        } catch (_) {}

        // Poll trunk status fallback
        this.checkTrunkFallback();
    }

    async checkTrunkFallback() {
        try {
            const status = await window.apiClient.get('/api/v1/system/branding');
            const dot = document.getElementById('shell-trunk-dot');
            const text = document.getElementById('shell-trunk-text');
            if (dot && text) {
                dot.className = 'pulse-dot';
                text.textContent = 'Nayatel SIP Online';
            }
        } catch (_) {}
    }
}

window.appShell = new V2AppShell();

/**
 * Formats UTC ISO timestamps cleanly into Pakistan Standard Time (PKT / Asia/Karachi)
 * @param {string|Date} dateInput
 * @returns {string}
 */
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

window.formatPKTime = formatPKTime;
