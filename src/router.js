/**
 * Hash-based SPA Router
 * Handles client-side routing for GitHub Pages compatibility
 */

import { getCurrentUser } from './supabaseClient.js';

// Route definitions
const routes = {
    '/': { handler: null, auth: false, redirect: '/library' },
    '/login': { handler: null, auth: false },
    '/signup': { handler: null, auth: false },
    '/library': { handler: null, auth: true },
    '/viewer/:scoreId': { handler: null, auth: true },
    '/viewer/:scoreId/setlist/:setlistId/:index': { handler: null, auth: true },
    '/settings': { handler: null, auth: true },
    '/privacy': { handler: null, auth: false },
    '/terms': { handler: null, auth: false }
};

// Current route state
let currentRoute = null;
let currentParams = {};

/**
 * Register a route handler
 * @param {string} path - Route path (e.g., '/library' or '/viewer/:scoreId')
 * @param {Function} handler - Async function to render the route
 */
export function registerRoute(path, handler) {
    if (routes[path]) {
        routes[path].handler = handler;
    } else {
        console.warn(`Unknown route: ${path}`);
    }
}

/**
 * Navigate to a route
 * @param {string} path - Route path
 * @param {boolean} replace - Replace current history entry
 */
export function navigate(path, replace = false) {
    if (replace) {
        window.location.replace('#' + path);
    } else {
        window.location.hash = path;
    }
}

/**
 * Get current route parameters
 * @returns {Object} Route parameters
 */
export function getParams() {
    return { ...currentParams };
}

/**
 * Get current route path
 * @returns {string|null} Current route path
 */
export function getCurrentRoute() {
    return currentRoute;
}

/**
 * Parse hash path and extract route + params
 * @param {string} hash - Window location hash
 * @returns {{route: string|null, params: Object}}
 */
function parseHash(hash) {
    const path = hash.replace(/^#/, '') || '/';

    // Try exact match first
    if (routes[path]) {
        return { route: path, params: {} };
    }

    // Try parameterized routes
    for (const routePath of Object.keys(routes)) {
        const params = matchRoute(routePath, path);
        if (params !== null) {
            return { route: routePath, params };
        }
    }

    return { route: null, params: {} };
}

/**
 * Match a route pattern against a path
 * @param {string} pattern - Route pattern (e.g., '/viewer/:scoreId')
 * @param {string} path - Actual path
 * @returns {Object|null} Params object or null if no match
 */
function matchRoute(pattern, path) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
        return null;
    }

    const params = {};

    for (let i = 0; i < patternParts.length; i++) {
        const patternPart = patternParts[i];
        const pathPart = pathParts[i];

        if (patternPart.startsWith(':')) {
            // Parameter
            params[patternPart.slice(1)] = pathPart;
        } else if (patternPart !== pathPart) {
            // Mismatch
            return null;
        }
    }

    return params;
}

/**
 * Handle route change
 */
async function handleRouteChange() {
    const { route, params } = parseHash(window.location.hash);

    if (!route) {
        // 404 - redirect to library or login
        const user = await getCurrentUser();
        navigate(user ? '/library' : '/login', true);
        return;
    }

    const routeConfig = routes[route];

    // Check authentication
    if (routeConfig.auth) {
        const user = await getCurrentUser();
        if (!user) {
            navigate('/login', true);
            return;
        }
    }

    // Handle redirects
    if (routeConfig.redirect) {
        navigate(routeConfig.redirect, true);
        return;
    }

    // Update current state
    currentRoute = route;
    currentParams = params;

    // Hide loading screen
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }

    // Call route handler
    if (routeConfig.handler) {
        try {
            await routeConfig.handler(params);
        } catch (error) {
            console.error('Route handler error:', error);
            showError('Failed to load page');
        }
    } else {
        console.warn(`No handler registered for route: ${route}`);
    }
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
    const app = document.getElementById('app');
    app.innerHTML = `
    <div class="error-page">
      <h1>Error</h1>
      <p>${message}</p>
      <a href="#/library" class="btn btn-primary">Go to Library</a>
    </div>
  `;
}

/**
 * Initialize the router
 */
export function initRouter() {
    // Handle hash changes
    window.addEventListener('hashchange', handleRouteChange);

    // Handle initial load
    handleRouteChange();
}

/**
 * Re-run current route (useful after auth state changes)
 */
export function refreshRoute() {
    handleRouteChange();
}
