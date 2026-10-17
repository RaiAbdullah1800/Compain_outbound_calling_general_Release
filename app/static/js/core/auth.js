/**
 * auth.js - Authentication State and Session Management (Frontend v2)
 */

class AuthService {
    constructor() {
        this.currentUser = null;
    }

    /**
     * Verify session with backend /api/v1/auth/me
     * @param {boolean} redirectOnFail - Whether to redirect to /login on 401
     * @returns {Promise<Object|null>} Current user payload or null
     */
    async checkAuth(redirectOnFail = true) {
        try {
            const user = await window.apiClient.get('/api/v1/auth/me');
            this.currentUser = user;
            try {
                localStorage.setItem('uor_user', JSON.stringify(user));
            } catch (_) {}
            return user;
        } catch (error) {
            this.currentUser = null;
            try {
                localStorage.removeItem('uor_user');
            } catch (_) {}

            if (redirectOnFail && !window.location.pathname.includes('/login')) {
                window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
            }
            return null;
        }
    }

    /**
     * Get currently authenticated user object (from memory or localStorage cache)
     */
    getCurrentUser() {
        if (this.currentUser) return this.currentUser;
        try {
            const cached = localStorage.getItem('uor_user');
            if (cached) {
                this.currentUser = JSON.parse(cached);
                return this.currentUser;
            }
        } catch (_) {}
        return null;
    }

    /**
     * Terminate active session and redirect to /login
     */
    async logout() {
        try {
            await window.apiClient.post('/api/v1/auth/logout', {});
        } catch (err) {
            console.warn('[Auth] Logout endpoint error:', err);
        }
        this.currentUser = null;
        try {
            localStorage.removeItem('uor_user');
        } catch (_) {}
        window.location.href = '/login';
    }
}

window.authService = new AuthService();
