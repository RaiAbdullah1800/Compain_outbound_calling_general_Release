/**
 * V2 api.js - Centralized HTTP client
 */

class V2ApiClient {
    async request(url, options = {}) {
        const defaultHeaders = { 'Accept': 'application/json' };

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
                if (!window.location.pathname.includes('/v2/login') && !window.location.pathname.includes('/login')) {
                    window.location.href = '/v2/login?redirect=' + encodeURIComponent(window.location.pathname);
                }
                throw new Error('Unauthorized');
            }

            if (!response.ok) {
                let errorMsg = `HTTP Error ${response.status}`;
                try {
                    const err = await response.json();
                    errorMsg = err.detail || err.message || JSON.stringify(err);
                } catch (_) {
                    const text = await response.text();
                    if (text) errorMsg = text;
                }
                const e = new Error(errorMsg);
                e.status = response.status;
                throw e;
            }

            const ct = response.headers.get('content-type');
            if (ct && ct.includes('application/json')) {
                return await response.json();
            }
            return await response.text();
        } catch (error) {
            console.error(`[V2 API Error] ${options.method || 'GET'} ${url}:`, error.message);
            throw error;
        }
    }

    get(url, headers = {}) { return this.request(url, { method: 'GET', headers }); }
    post(url, data, headers = {}) {
        return this.request(url, { method: 'POST', body: JSON.stringify(data), headers });
    }
    postFormData(url, formData, headers = {}) {
        return this.request(url, { method: 'POST', body: formData, headers });
    }
    put(url, data, headers = {}) {
        return this.request(url, { method: 'PUT', body: JSON.stringify(data), headers });
    }
    delete(url, headers = {}) { return this.request(url, { method: 'DELETE', headers }); }
}

window.apiClient = new V2ApiClient();
