/**
 * rbac.js - Role-Based Access Control Engine (Frontend v2)
 * Manages permissions, UI locking, and declarative gating for Admin & Viewer roles.
 */

class RBACEngine {
    constructor() {
        this.currentRole = 'viewer';
        this.currentUser = null;
        this.isInitialized = false;
    }

    /**
     * Initialize RBAC with user object
     * @param {Object} user - User payload from /api/v1/auth/me
     */
    init(user) {
        if (!user) return;
        this.currentUser = user;
        this.currentRole = (user.role || (user.is_superuser ? 'admin' : 'viewer')).toLowerCase();
        window.currentRole = this.currentRole;
        this.isInitialized = true;

        this.updateHeaderProfile();
        this.applyGating();
        this.setupDynamicObserver();
    }

    /**
     * Update user email and role badge in header
     */
    updateHeaderProfile() {
        if (!this.currentUser) return;

        const emailEl = document.getElementById('header-user-email');
        if (emailEl) {
            emailEl.textContent = this.currentUser.email;
        }

        const roleEl = document.getElementById('header-user-role');
        if (roleEl) {
            roleEl.className = 'user-role-badge ' + (this.isAdmin() ? 'role-admin' : 'role-viewer');
            roleEl.innerHTML = this.isAdmin() ? '🛡️ ADMIN' : '👁️ VIEWER';
            roleEl.title = this.isAdmin() 
                ? 'System Administrator (Full Operational & User Control)' 
                : 'Viewer Mode (Real-Time Monitoring & Read-Only Access)';
        }

        // Show/hide viewer notice banner
        const viewerBanner = document.getElementById('viewer-notice-banner');
        if (viewerBanner) {
            viewerBanner.style.display = this.isViewer() ? 'flex' : 'none';
        }

        // Show/hide manage users button
        const manageUsersBtn = document.getElementById('btn-manage-users');
        if (manageUsersBtn) {
            manageUsersBtn.style.display = this.isAdmin() ? 'inline-flex' : 'none';
        }
    }

    /**
     * Check if active user is Admin
     * @returns {boolean}
     */
    isAdmin() {
        return this.currentRole === 'admin' || (this.currentUser && this.currentUser.is_superuser);
    }

    /**
     * Check if active user is Viewer
     * @returns {boolean}
     */
    isViewer() {
        return !this.isAdmin();
    }

    /**
     * Guard function for interactive calls
     * @param {string} actionName
     * @returns {boolean}
     */
    checkPermission(actionName = 'perform this action') {
        if (this.isAdmin()) return true;
        
        if (typeof showToast === 'function') {
            showToast(`🔒 Restricted: Admin privileges required to ${actionName}.`, 'warning');
        } else {
            alert(`Restricted: Admin privileges required to ${actionName}.`);
        }
        return false;
    }

    /**
     * Apply declarative gating across document or sub-tree
     * Targets elements with [data-role="admin"]
     * @param {HTMLElement|Document} root
     */
    applyGating(root = document) {
        const isViewer = this.isViewer();
        const adminElements = root.querySelectorAll('[data-role="admin"]');

        adminElements.forEach(el => {
            if (isViewer) {
                // If designated to be hidden
                if (el.getAttribute('data-rbac-action') === 'hide' || el.classList.contains('rbac-hide-for-viewer')) {
                    el.style.display = 'none';
                    return;
                }

                // If button or input, disable it
                if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                    el.disabled = true;
                }

                el.classList.add('rbac-locked');
                el.setAttribute('data-original-title', el.title || '');
                el.title = '🔒 Action restricted: Viewer account is read-only.';

                // Click interceptor to show toast if clicked
                if (!el._rbacBound) {
                    el.addEventListener('click', (e) => {
                        if (this.isViewer()) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            this.checkPermission('execute this command');
                        }
                    }, true);
                    el._rbacBound = true;
                }
            } else {
                // Restore for admin
                if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                    // Only re-enable if not intentionally disabled by business logic
                    if (!el.hasAttribute('data-business-disabled')) {
                        el.disabled = false;
                    }
                }
                el.classList.remove('rbac-locked');
                const orig = el.getAttribute('data-original-title');
                if (orig) el.title = orig;
                if (el.getAttribute('data-rbac-action') === 'hide') {
                    el.style.display = '';
                }
            }
        });
    }

    /**
     * Watch for dynamically injected DOM elements (e.g., table rows, modal content)
     */
    setupDynamicObserver() {
        if (this._observer) return;
        this._observer = new MutationObserver((mutations) => {
            if (this.isViewer()) {
                mutations.forEach(m => {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches('[data-role="admin"]')) {
                                this.applyGating(node.parentElement || document);
                            } else if (node.querySelectorAll) {
                                const found = node.querySelectorAll('[data-role="admin"]');
                                if (found.length > 0) {
                                    this.applyGating(node);
                                }
                            }
                        }
                    });
                });
            }
        });

        this._observer.observe(document.body, { childList: true, subtree: true });
    }
}

window.rbac = new RBACEngine();
