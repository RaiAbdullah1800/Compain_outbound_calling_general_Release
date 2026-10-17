/**
 * V2 users.js - User Accounts & Access Control Page Controller
 */

let selectedRole = 'viewer';

async function initUsersPage() {
    await window.appShell.mount({
        activePage: 'users',
        pageTitle: 'User Accounts & Roles',
        pageSubtitle: 'Manage Operator Logins, Role-Based Access Control (Admin vs Viewer)',
        headerActionsHtml: `
            <button class="v2-btn v2-btn-primary v2-btn-sm" data-role="admin" onclick="openModal('create-user-modal')">
                <span>➕</span>
                <span>Add New User</span>
            </button>
        `
    });

    if (!window.rbac.isAdmin()) {
        window.location.href = '/v2/live';
        return;
    }

    await fetchUsersList();
}

async function fetchUsersList() {
    const tbody = document.getElementById('users-table-tbody');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--v2-text-muted); padding: 2rem;">Loading accounts...</td></tr>`;

    try {
        const users = await window.apiClient.get('/api/v1/auth/users');
        renderUsersTable(users || []);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--v2-rose); padding: 2rem;">Error: ${err.message}</td></tr>`;
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('users-table-tbody');
    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--v2-text-muted); padding: 2rem;">No accounts found.</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => {
        const isAdmin = u.role === 'admin' || u.is_superuser;
        const roleClass = isAdmin ? 'role-admin' : 'role-viewer';
        const roleText = isAdmin ? '🛡️ Admin' : '👁️ Viewer';
        const dateStr = typeof formatPKTime === 'function' ? formatPKTime(u.created_at) : (window.formatPKTime ? window.formatPKTime(u.created_at) : (u.created_at || '—'));

        return `
            <tr>
                <td>
                    <div style="font-weight: 600; color: var(--v2-text-primary);">${u.email}</div>
                    <div style="font-size: 0.74rem; color: var(--v2-text-muted);">${u.full_name || 'No name set'}</div>
                </td>
                <td>
                    <span class="user-role-chip ${isAdmin ? 'admin' : 'viewer'}">${roleText}</span>
                </td>
                <td>
                    <span style="font-size: 0.76rem; font-weight: 600; color: ${u.is_superuser ? 'var(--v2-role-admin)' : 'var(--v2-text-muted)'};">
                        ${u.is_superuser ? 'Superuser' : 'Standard'}
                    </span>
                </td>
                <td>
                    <span class="status-pill ${u.is_active ? 'answered' : 'declined'}">${u.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                </td>
                <td style="color: var(--v2-text-muted); font-size: 0.78rem;">${dateStr}</td>
            </tr>
        `;
    }).join('');
}

function selectRole(role) {
    selectedRole = role;
    const cardAdmin = document.getElementById('role-card-admin');
    const cardViewer = document.getElementById('role-card-viewer');

    if (role === 'admin') {
        if (cardAdmin) cardAdmin.style.borderColor = 'var(--v2-role-admin)';
        if (cardAdmin) cardAdmin.style.background = 'var(--v2-role-admin-bg)';
        if (cardViewer) cardViewer.style.borderColor = 'var(--v2-border)';
        if (cardViewer) cardViewer.style.background = 'var(--v2-bg-surface-elevated)';
    } else {
        if (cardViewer) cardViewer.style.borderColor = 'var(--v2-role-viewer)';
        if (cardViewer) cardViewer.style.background = 'var(--v2-role-viewer-bg)';
        if (cardAdmin) cardAdmin.style.borderColor = 'var(--v2-border)';
        if (cardAdmin) cardAdmin.style.background = 'var(--v2-bg-surface-elevated)';
    }
}

async function handleCreateUserSubmit(e) {
    e.preventDefault();
    if (!window.rbac.checkPermission('create user accounts')) return;

    const email = document.getElementById('new-user-email').value.trim();
    const full_name = document.getElementById('new-user-name').value.trim() || undefined;
    const password = document.getElementById('new-user-password').value;
    const role = selectedRole;
    const is_superuser = (role === 'admin');

    const submitBtn = document.getElementById('btn-submit-create-user');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Creating...';

    try {
        await window.apiClient.post('/api/v1/auth/users', {
            email,
            password,
            full_name,
            role,
            is_superuser
        });

        window.showToast(`✓ Account for ${email} created!`, 'success');
        closeModal('create-user-modal');

        document.getElementById('new-user-email').value = '';
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-password').value = '';
        selectRole('viewer');

        fetchUsersList();
    } catch (err) {
        window.showToast(`Error creating user: ${err.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create User Account';
    }
}

document.addEventListener('DOMContentLoaded', initUsersPage);
