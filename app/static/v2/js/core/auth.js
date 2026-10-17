/**
 * V2 auth.js - Session & Authentication Service
 */

class V2AuthService {
    constructor() {
        this.currentUser = null;
    }

    async checkAuth(redirectOnFail = true) {
        try {
            const user = await window.apiClient.get('/api/v1/auth/me');
            this.currentUser = user;
            try { localStorage.setItem('uor_user', JSON.stringify(user)); } catch (_) {}
            return user;
        } catch (error) {
            this.currentUser = null;
            try { localStorage.removeItem('uor_user'); } catch (_) {}

            if (redirectOnFail && !window.location.pathname.includes('/login')) {
                window.location.href = '/v2/login?redirect=' + encodeURIComponent(window.location.pathname);
            }
            return null;
        }
    }

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

    async logout() {
        try {
            await window.apiClient.post('/api/v1/auth/logout', {});
        } catch (_) {}
        this.currentUser = null;
        try { localStorage.removeItem('uor_user'); } catch (_) {}
        window.location.href = '/v2/login';
    }
}

window.authService = new V2AuthService();
