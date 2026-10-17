/**
 * api.js - Centralized HTTP client wrapper for Frontend v2
 */

class ApiClient {
    async request(url, options = {}) {
        const defaultHeaders = {
            'Accept': 'application/json',
        };

        if (options.body && !(options.body instanceof FormData)) {
            defaultHeaders['Content-Type'] = 'application/json';
        }

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);

            if (response.status === 401) {
                // If unauthorized and not on login page, redirect to login
                if (!window.location.pathname.includes('/login')) {
                    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
                }
                throw new Error('Session expired or unauthorized');
            }

            if (!response.ok) {
                let errorMsg = `HTTP Error ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.detail || errorData.message || JSON.stringify(errorData);
                } catch (_) {
                    const text = await response.text();
                    if (text) errorMsg = text;
                }
                const err = new Error(errorMsg);
                err.status = response.status;
                throw err;
            }

            // Return json or empty if no content
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return await response.text();
        } catch (error) {
            console.error(`[API] Error on ${options.method || 'GET'} ${url}:`, error.message);
            throw error;
        }
    }

    get(url, headers = {}) {
        return this.request(url, { method: 'GET', headers });
    }

    post(url, data, headers = {}) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data),
            headers
        });
    }

    postFormData(url, formData, headers = {}) {
        return this.request(url, {
            method: 'POST',
            body: formData,
            headers
        });
    }

    put(url, data, headers = {}) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data),
            headers
        });
    }

    delete(url, headers = {}) {
        return this.request(url, { method: 'DELETE', headers });
    }
}

window.apiClient = new ApiClient();
