/**
 * user-modal.js - User Management Modal Component (Frontend v2)
 * Allows Administrators to view accounts and create new Admin / Viewer users.
 */

class UserManagementModal {
    constructor() {
        this.modalEl = null;
        this.selectedRole = 'viewer';
        this.isLoading = false;
        this.users = [];
    }

    /**
     * Mount and initialize the modal inside the DOM
     */
    init() {
        if (document.getElementById('user-mgmt-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'user-mgmt-modal-overlay';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width: 680px;">
                <div class="modal-header">
                    <h3>
                        <span>👥</span>
                        <span>User & Role Management</span>
                    </h3>
                    <button class="modal-close-btn" onclick="window.userModal.close()" title="Close">&times;</button>
                </div>
                <div class="modal-body" style="padding: 1.25rem 1.5rem;">
                    <!-- Top Navigation Tabs -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                        <div class="user-mgmt-tabs">
                            <button id="tab-btn-users-list" class="user-mgmt-tab-btn active" onclick="window.userModal.switchTab('list')">
                                Active Accounts (<span id="user-count-badge">0</span>)
                            </button>
                            <button id="tab-btn-users-create" class="user-mgmt-tab-btn" onclick="window.userModal.switchTab('create')">
                                ➕ Add New User
                            </button>
                        </div>
                        <button class="btn btn-outline btn-sm" onclick="window.userModal.fetchUsers()" title="Refresh user list">
                            🔄 Refresh
                        </button>
                    </div>

                    <!-- TAB 1: User List View -->
                    <div id="view-users-list">
                        <div class="table-scroll" style="max-height: 380px;">
                            <table class="user-list-table">
                                <thead>
                                    <tr>
                                        <th>Account</th>
                                        <th>Role</th>
                                        <th>Access</th>
                                        <th>Created</th>
                                    </tr>
                                </thead>
                                <tbody id="user-table-tbody">
                                    <tr>
                                        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                                            Loading user accounts...
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- TAB 2: Create User View -->
                    <div id="view-users-create" style="display: none;">
                        <form id="create-user-form" onsubmit="window.userModal.handleCreateSubmit(event)">
                            <div class="form-group">
                                <label for="new-user-email">Email Address *</label>
                                <input type="email" id="new-user-email" class="form-control" required placeholder="operator@university.edu.pk" autocomplete="off">
                            </div>

                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="form-group">
                                    <label for="new-user-name">Full Name (Optional)</label>
                                    <input type="text" id="new-user-name" class="form-control" placeholder="e.g. Campaign Supervisor">
                                </div>
                                <div class="form-group">
                                    <label for="new-user-password">Password *</label>
                                    <input type="password" id="new-user-password" class="form-control" required placeholder="Min 8 characters" minlength="6" autocomplete="new-password">
                                </div>
                            </div>

                            <div class="form-group">
                                <label>Assign Role & Privileges *</label>
                                <div class="role-choice-grid">
                                    <!-- Admin Choice Card -->
                                    <div id="role-card-admin" class="role-choice-card" onclick="window.userModal.selectRole('admin')">
                                        <div class="role-choice-title">
                                            <span>🛡️ Admin</span>
                                            <span style="font-size: 0.72rem; color: #c084fc;">Full Control</span>
                                        </div>
                                        <p class="role-choice-desc">
                                            Complete operational authority: Dialing, CSV queue upload, pause/emergency stop, and managing user roles.
                                        </p>
                                    </div>

                                    <!-- Viewer Choice Card -->
                                    <div id="role-card-viewer" class="role-choice-card selected role-viewer-card" onclick="window.userModal.selectRole('viewer')">
                                        <div class="role-choice-title">
                                            <span>👁️ Viewer</span>
                                            <span style="font-size: 0.72rem; color: #38bdf8;">Read-Only</span>
                                        </div>
                                        <p class="role-choice-desc">
                                            Real-time monitoring only: Inspect live calls, queue status, and analytics. All dialing controls locked.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                                <button type="button" class="btn btn-outline" onclick="window.userModal.switchTab('list')">Cancel</button>
                                <button type="submit" id="btn-submit-new-user" class="btn btn-primary">
                                    <span>✓</span>
                                    <span>Create User Account</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.modalEl = overlay;

        // Close on background click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('open')) {
                this.close();
            }
        });
    }

    /**
     * Open modal dialog
     */
    open() {
        if (!window.rbac || !window.rbac.isAdmin()) {
            if (typeof showToast === 'function') {
                showToast('🔒 Access Denied: Only administrators can manage users.', 'error');
            }
            return;
        }

        this.init();
        this.modalEl.classList.add('open');
        this.switchTab('list');
        this.fetchUsers();
    }

    /**
     * Close modal dialog
     */
    close() {
        if (this.modalEl) {
            this.modalEl.classList.remove('open');
        }
    }

    /**
     * Switch view tab between 'list' and 'create'
     * @param {'list'|'create'} tab
     */
    switchTab(tab) {
        const btnList = document.getElementById('tab-btn-users-list');
        const btnCreate = document.getElementById('tab-btn-users-create');
        const viewList = document.getElementById('view-users-list');
        const viewCreate = document.getElementById('view-users-create');

        if (tab === 'list') {
            btnList.classList.add('active');
            btnCreate.classList.remove('active');
            viewList.style.display = 'block';
            viewCreate.style.display = 'none';
        } else {
            btnList.classList.remove('active');
            btnCreate.classList.add('active');
            viewList.style.display = 'none';
            viewCreate.style.display = 'block';
        }
    }

    /**
     * Select role in creation form
     * @param {'admin'|'viewer'} role
     */
    selectRole(role) {
        this.selectedRole = role;
        const adminCard = document.getElementById('role-card-admin');
        const viewerCard = document.getElementById('role-card-viewer');

        if (role === 'admin') {
            adminCard.classList.add('selected');
            viewerCard.classList.remove('selected');
        } else {
            adminCard.classList.remove('selected');
            viewerCard.classList.add('selected');
        }
    }

    /**
     * Fetch all users from GET /api/v1/auth/users
     */
    async fetchUsers() {
        const tbody = document.getElementById('user-table-tbody');
        const badge = document.getElementById('user-count-badge');
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Refreshing user list...</td></tr>`;

        try {
            const users = await window.apiClient.get('/api/v1/auth/users');
            this.users = users;
            if (badge) badge.textContent = users.length;

            if (!users || users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No user accounts found.</td></tr>`;
                return;
            }

            tbody.innerHTML = users.map(u => {
                const isAdmin = (u.role === 'admin') || u.is_superuser;
                const roleBadgeClass = isAdmin ? 'role-admin' : 'role-viewer';
                const roleText = isAdmin ? '🛡️ ADMIN' : '👁️ VIEWER';
                const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

                return `
                    <tr>
                        <td>
                            <div style="font-weight: 600; color: #f8fafc;">${u.email}</div>
                            <div style="font-size: 0.74rem; color: #94a3b8;">${u.full_name || 'No name set'}</div>
                        </td>
                        <td>
                            <span class="user-role-badge ${roleBadgeClass}">${roleText}</span>
                        </td>
                        <td>
                            <span style="font-size: 0.75rem; color: ${u.is_superuser ? '#c084fc' : '#94a3b8'};">
                                ${u.is_superuser ? 'Superuser' : 'Standard'}
                            </span>
                        </td>
                        <td style="color: #94a3b8; font-size: 0.78rem;">
                            ${dateStr}
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('[UserModal] Failed to load users:', err);
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #f87171; padding: 1.5rem;">Failed to load users: ${err.message}</td></tr>`;
        }
    }

    /**
     * Submit new user creation form
     */
    async handleCreateSubmit(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-submit-new-user');
        const emailInput = document.getElementById('new-user-email');
        const nameInput = document.getElementById('new-user-name');
        const passwordInput = document.getElementById('new-user-password');

        const email = emailInput.value.trim();
        const full_name = nameInput.value.trim() || null;
        const password = passwordInput.value;
        const role = this.selectedRole;
        const is_superuser = (role === 'admin');

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳ Creating...</span>`;

        try {
            await window.apiClient.post('/api/v1/auth/users', {
                email,
                password,
                full_name,
                role,
                is_superuser
            });

            if (typeof showToast === 'function') {
                showToast(`✓ Account for ${email} (${role.toUpperCase()}) created successfully!`, 'success');
            }

            // Reset form
            emailInput.value = '';
            nameInput.value = '';
            passwordInput.value = '';
            this.selectRole('viewer');

            // Switch to list tab and refresh
            this.switchTab('list');
            await this.fetchUsers();
        } catch (err) {
            console.error('[UserModal] Error creating user:', err);
            if (typeof showToast === 'function') {
                showToast(`✕ Error creating user: ${err.message}`, 'error');
            } else {
                alert(`Error creating user: ${err.message}`);
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>✓</span><span>Create User Account</span>`;
        }
    }
}

window.userModal = new UserManagementModal();
window.openUserModal = () => window.userModal.open();
window.closeUserModal = () => window.userModal.close();
