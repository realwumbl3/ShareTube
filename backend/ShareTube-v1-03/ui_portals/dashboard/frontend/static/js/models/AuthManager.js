// AuthManager handles authentication tokens and API calls for the dashboard
// Adapted from the extension's AuthManager but uses cookies instead of chrome.storage
export default class AuthManager {
    constructor() {
        this.baseUrl = window.location.origin;
        this.apiBase = window.__DASHBOARD_API_BASE__ || "/dashboard";
    }

    async authToken() {
        // Get auth token from cookies
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'auth_token') {
                return decodeURIComponent(value);
            }
        }
        return null;
    }

    async isAuthenticated() {
        const token = await this.authToken();
        return token !== null;
    }

    async getUserInfo() {
        const token = await this.authToken();
        if (!token) {
            return null;
        }

        try {
            // Decode JWT token to get user info
            const payload = JSON.parse(atob(token.split('.')[1]));
            return {
                id: payload.sub,
                name: payload.name,
                picture: payload.picture
            };
        } catch (e) {
            console.error('Failed to decode user token:', e);
            return null;
        }
    }

    async logout() {
        try {
            const response = await fetch(`${this.apiBase}/api/auth/logout`);
            if (response.ok) {
                // Clear any local state if needed
                return true;
            }
            return false;
        } catch (error) {
            console.error('Logout error:', error);
            return false;
        }
    }

    async checkAuthStatus() {
        try {
            const response = await fetch(`${this.apiBase}/api/auth/status`);
            if (!response.ok) {
                return { authenticated: false };
            }
            return await response.json();
        } catch (error) {
            console.error('Auth status check failed:', error);
            return { authenticated: false };
        }
    }

    // Helper method to start OAuth flow - redirect instead of popup for reliability
    startOAuthFlow() {
        console.log('startOAuthFlow', this.baseUrl);
        // Redirect to OAuth URL with dashboard redirect parameter
        window.location.href = `${this.baseUrl}/auth/google/start?redirect=dashboard`;
        // This will never resolve since we're redirecting away
        return new Promise(() => {});
    }
}
