/**
 * Legal Pages - Privacy Policy and Terms of Service
 */

import { getCurrentUser } from './supabaseClient.js';
import { navigate } from './router.js';

/**
 * Render the Privacy Policy page
 */
export async function renderPrivacyPage() {
    const app = document.getElementById('app');
    const user = await getCurrentUser();

    app.innerHTML = `
    <div class="legal-container">
      <header class="legal-header">
        <a href="#/${user ? 'library' : 'login'}" class="back-link">← Back</a>
        <h1>Privacy Policy</h1>
      </header>
      
      <div class="legal-content">
        <p class="last-updated">Last updated: January 2026</p>
        
        <section>
          <h2>Overview</h2>
          <p>
            MusicReader is a sheet music viewer application that respects your privacy.
            This policy explains how we handle your data.
          </p>
        </section>
        
        <section>
          <h2>Camera Data - Local Processing Only</h2>
          <p class="highlight-box">
            <strong>Your webcam video is NEVER uploaded, transmitted, or stored on any server.</strong>
          </p>
          <p>
            MusicReader uses your device's camera solely for facial gesture recognition 
            (e.g., detecting blinks or head turns to flip pages). All face detection 
            and gesture processing happens entirely on your device using MediaPipe 
            Face Landmarker technology.
          </p>
          <ul>
            <li>No video frames leave your device</li>
            <li>No facial data is transmitted over the internet</li>
            <li>No biometric data is stored</li>
            <li>Camera access requires explicit user permission</li>
            <li>You can disable camera controls at any time</li>
          </ul>
        </section>
        
        <section>
          <h2>Data We Store</h2>
          <p>When you create an account, we store:</p>
          <ul>
            <li><strong>Account Information:</strong> Email address (for login purposes)</li>
            <li><strong>Sheet Music Files:</strong> PDF and MusicXML files you upload</li>
            <li><strong>Metadata:</strong> Title, composer, tags for your scores</li>
            <li><strong>Preferences:</strong> Viewer settings, theme preferences</li>
            <li><strong>Usage Data:</strong> Last opened scores, page positions (for "continue where you left off")</li>
          </ul>
          <p>All data is stored securely in Supabase with row-level security policies.</p>
        </section>
        
        <section>
          <h2>Data Security</h2>
          <ul>
            <li>All file storage uses private buckets with signed URLs</li>
            <li>Row-level security ensures you can only access your own data</li>
            <li>HTTPS encryption for all data in transit</li>
            <li>Passwords are hashed and never stored in plain text</li>
          </ul>
        </section>
        
        <section>
          <h2>Third-Party Services</h2>
          <p>We use the following services:</p>
          <ul>
            <li><strong>Supabase:</strong> Authentication, database, and file storage</li>
            <li><strong>GitHub Pages:</strong> Hosting the web application</li>
            <li><strong>MediaPipe:</strong> On-device face detection (client-side only)</li>
          </ul>
        </section>
        
        <section>
          <h2>Your Rights</h2>
          <p>You can:</p>
          <ul>
            <li>Delete your account and all associated data at any time</li>
            <li>Export your data by downloading your uploaded files</li>
            <li>Disable camera controls without losing app functionality</li>
          </ul>
        </section>
        
        <section>
          <h2>Contact</h2>
          <p>
            For privacy concerns, please open an issue on our GitHub repository.
          </p>
        </section>
      </div>
    </div>
  `;
}

/**
 * Render the Terms of Service page
 */
export async function renderTermsPage() {
    const app = document.getElementById('app');
    const user = await getCurrentUser();

    app.innerHTML = `
    <div class="legal-container">
      <header class="legal-header">
        <a href="#/${user ? 'library' : 'login'}" class="back-link">← Back</a>
        <h1>Terms of Service</h1>
      </header>
      
      <div class="legal-content">
        <p class="last-updated">Last updated: January 2026</p>
        
        <section>
          <h2>Acceptance of Terms</h2>
          <p>
            By using MusicReader, you agree to these terms of service. 
            If you do not agree, please do not use the application.
          </p>
        </section>
        
        <section>
          <h2>Use of Service</h2>
          <ul>
            <li>MusicReader is provided for personal, non-commercial use</li>
            <li>You are responsible for the content you upload</li>
            <li>You must have the rights to any sheet music you upload</li>
            <li>Do not upload copyrighted material without permission</li>
          </ul>
        </section>
        
        <section>
          <h2>User Content</h2>
          <p>
            You retain all rights to the content you upload. We do not claim 
            ownership of your sheet music files.
          </p>
        </section>
        
        <section>
          <h2>Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the service for any illegal purposes</li>
            <li>Attempt to access other users' data</li>
            <li>Upload malicious files or content</li>
            <li>Circumvent security measures</li>
          </ul>
        </section>
        
        <section>
          <h2>Disclaimer</h2>
          <p>
            MusicReader is provided "as is" without warranties of any kind. 
            We are not responsible for data loss or service interruptions.
          </p>
        </section>
        
        <section>
          <h2>Changes to Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the 
            service constitutes acceptance of the updated terms.
          </p>
        </section>
      </div>
    </div>
  `;
}
