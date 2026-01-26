/**
 * Authentication Module
 * Handles login, signup, and auth state management
 */

import { supabase, getCurrentUser } from './supabaseClient.js';
import { navigate } from './router.js';
import { showToast } from './utils.js';

/**
 * Render the login page
 */
export async function renderLoginPage() {
    const app = document.getElementById('app');

    app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h1 class="auth-logo">🎵 MusicReader</h1>
          <p class="auth-subtitle">Sheet music viewer with gesture controls</p>
        </div>
        
        <form id="login-form" class="auth-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input 
              type="email" 
              id="email" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="your@email.com"
            />
          </div>
          
          <div class="form-group">
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              required 
              autocomplete="current-password"
              placeholder="Your password"
              minlength="6"
            />
          </div>
          
          <button type="submit" class="btn btn-primary btn-block">
            Log In
          </button>
        </form>
        
        <div class="auth-footer">
          <p>Don't have an account? <a href="#/signup">Sign up</a></p>
        </div>
      </div>
      
      <div class="auth-links">
        <a href="#/privacy">Privacy Policy</a>
        <span>•</span>
        <a href="#/terms">Terms of Service</a>
      </div>
    </div>
  `;

    // Handle form submission
    const form = document.getElementById('login-form');
    form.addEventListener('submit', handleLogin);
}

/**
 * Render the signup page
 */
export async function renderSignupPage() {
    const app = document.getElementById('app');

    app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h1 class="auth-logo">🎵 MusicReader</h1>
          <p class="auth-subtitle">Create your account</p>
        </div>
        
        <form id="signup-form" class="auth-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input 
              type="email" 
              id="email" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="your@email.com"
            />
          </div>
          
          <div class="form-group">
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              required 
              autocomplete="new-password"
              placeholder="At least 6 characters"
              minlength="6"
            />
          </div>
          
          <div class="form-group">
            <label for="confirm-password">Confirm Password</label>
            <input 
              type="password" 
              id="confirm-password" 
              name="confirm-password" 
              required 
              autocomplete="new-password"
              placeholder="Confirm your password"
              minlength="6"
            />
          </div>
          
          <button type="submit" class="btn btn-primary btn-block">
            Create Account
          </button>
        </form>
        
        <div class="auth-footer">
          <p>Already have an account? <a href="#/login">Log in</a></p>
        </div>
      </div>
      
      <div class="auth-links">
        <a href="#/privacy">Privacy Policy</a>
        <span>•</span>
        <a href="#/terms">Terms of Service</a>
      </div>
    </div>
  `;

    // Handle form submission
    const form = document.getElementById('signup-form');
    form.addEventListener('submit', handleSignup);
}

/**
 * Handle login form submission
 * @param {Event} e - Form submit event
 */
async function handleLogin(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const email = form.email.value.trim();
    const password = form.password.value;

    // Disable form
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        showToast('Welcome back!', 'success');
        navigate('/library');
    } catch (error) {
        console.error('Login error:', error);
        showToast(error.message || 'Failed to log in', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log In';
    }
}

/**
 * Handle signup form submission
 * @param {Event} e - Form submit event
 */
async function handleSignup(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirmPassword = form['confirm-password'].value;

    // Validate passwords match
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    // Disable form
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });

        if (error) throw error;

        if (data.user && !data.user.confirmed_at) {
            showToast('Check your email to confirm your account', 'info', 5000);
            navigate('/login');
        } else {
            showToast('Account created! Welcome to MusicReader', 'success');
            navigate('/library');
        }
    } catch (error) {
        console.error('Signup error:', error);
        showToast(error.message || 'Failed to create account', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
    }
}

/**
 * Log out the current user
 */
export async function logout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        showToast('Logged out successfully', 'info');
        navigate('/login');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Failed to log out', 'error');
    }
}
