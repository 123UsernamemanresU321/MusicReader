/**
 * Supabase Client Module
 * Initializes and exports the Supabase client instance
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

/**
 * Get the current authenticated user
 * @returns {Promise<Object|null>} User object or null
 */
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * Get the current session
 * @returns {Promise<Object|null>} Session object or null
 */
export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Called with (event, session) on auth changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
    return () => subscription.unsubscribe();
}

/**
 * Generate a signed URL for accessing files in private storage
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @param {number} expiresIn - URL expiry in seconds (default 120 = 2 minutes)
 * @returns {Promise<string|null>} Signed URL or null on error
 */
export async function getSignedUrl(bucket, path, expiresIn = 120) {
    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

    if (error) {
        console.error('Error creating signed URL:', error);
        return null;
    }

    return data.signedUrl;
}

/**
 * Upload a file to storage
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @param {File} file - File to upload
 * @returns {Promise<{data: Object|null, error: Object|null}>}
 */
export async function uploadFile(bucket, path, file) {
    return await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: '3600',
        upsert: false
    });
}

/**
 * Delete a file from storage
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path within bucket
 * @returns {Promise<{data: Object|null, error: Object|null}>}
 */
export async function deleteFile(bucket, path) {
    return await supabase.storage.from(bucket).remove([path]);
}
