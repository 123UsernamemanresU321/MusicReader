/**
 * Main Application Entry Point
 * Initializes router, auth state, and registers all route handlers
 */

import { supabase, onAuthStateChange } from './supabaseClient.js';
import { initRouter, registerRoute, refreshRoute, navigate } from './router.js';
import { renderLoginPage, renderSignupPage } from './auth.js';
import { renderLibraryPage } from './library.js';
import { renderViewerPage } from './viewer.js';
import { renderSettingsPage } from './settings.js';
import { renderPrivacyPage, renderTermsPage } from './legal.js';
import { storage } from './utils.js';

// Initialize theme from storage
function initTheme() {
    const darkMode = storage.get('darkMode', false);
    const stageMode = storage.get('stageMode', false);

    document.body.classList.toggle('dark-mode', darkMode);
    document.body.classList.toggle('stage-mode', stageMode);
}

// Register Service Worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });
            console.log('Service Worker registered:', registration.scope);
        } catch (error) {
            console.warn('Service Worker registration failed:', error);
        }
    }
}

// Initialize the application
async function init() {
    console.log('MusicReader initializing...');

    // Initialize theme
    initTheme();

    // Register route handlers
    registerRoute('/login', renderLoginPage);
    registerRoute('/signup', renderSignupPage);
    registerRoute('/library', renderLibraryPage);
    registerRoute('/viewer/:scoreId', renderViewerPage);
    registerRoute('/viewer/:scoreId/setlist/:setlistId/:index', renderViewerPage);
    registerRoute('/settings', renderSettingsPage);
    registerRoute('/privacy', renderPrivacyPage);
    registerRoute('/terms', renderTermsPage);

    // Listen for auth state changes
    onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);

        if (event === 'SIGNED_OUT') {
            navigate('/login', true);
        } else if (event === 'SIGNED_IN') {
            // Refresh to let router decide redirect
            const currentHash = window.location.hash;
            if (currentHash === '#/login' || currentHash === '#/signup' || currentHash === '') {
                navigate('/library');
            }
        }
    });

    // Register service worker for PWA
    await registerServiceWorker();

    // Initialize router (will handle initial route)
    initRouter();

    console.log('MusicReader initialized');
}

// Wait for DOM and initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
