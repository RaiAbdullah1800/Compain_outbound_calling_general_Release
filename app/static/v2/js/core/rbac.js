/**
 * V2 rbac.js - Role-Based Access Control Engine
 */

class V2RBACEngine {
    constructor() {
        this.currentRole = 'viewer';
        this.currentUser = null;
    }

    init(user) {
        if (!user) return;
        this.currentUser = user;
        this.currentRole = (user.role || (user.is_superuser ? 'admin' : 'viewer')).toLowerCase();
        window.currentRole = this.currentRole;

        this.applyGating();
        this.setupDynamicObserver();
    }

    isAdmin() {
        return this.currentRole === 'admin' || (this.currentUser && this.currentUser.is_superuser);
    }

    isViewer() {
        return !this.isAdmin();
    }

    checkPermission(actionName = 'perform this action') {
        if (this.isAdmin()) return true;

        if (typeof window.showToast === 'function') {
            window.showToast(`🔒 Restricted: Administrator privileges required to ${actionName}.`, 'warning');
        } else {
            alert(`Restricted: Administrator privileges required to ${actionName}.`);
        }
        return false;
    }

    applyGating(root = document) {
        const isViewer = this.isViewer();
        const adminElements = root.querySelectorAll('[data-role="admin"]');

        adminElements.forEach(el => {
            if (isViewer) {
                if (el.getAttribute('data-rbac-action') === 'hide' || el.classList.contains('rbac-hide')) {
                    el.style.display = 'none';
                    return;
                }

                if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                    el.disabled = true;
                }
                el.classList.add('rbac-locked');
                el.title = '🔒 Restricted: Administrator privileges required.';

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
                if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                    if (!el.hasAttribute('data-busy')) {
                        el.disabled = false;
                    }
                }
                el.classList.remove('rbac-locked');
                if (el.getAttribute('data-rbac-action') === 'hide') {
                    el.style.display = '';
                }
            }
        });
    }

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
                                if (node.querySelectorAll('[data-role="admin"]').length > 0) {
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

window.rbac = new V2RBACEngine();
