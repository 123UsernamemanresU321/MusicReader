/**
 * Settings Module
 * User preferences and configuration
 */

import { supabase, getCurrentUser } from './supabaseClient.js';
import { navigate } from './router.js';
import { showToast, storage } from './utils.js';

// Default preferences
const DEFAULT_PREFS = {
  trigger_next: 'double_blink',
  trigger_prev: 'long_blink',
  sensitivity: 1.0,
  cooldown_ms: 900,
  show_debug: false,
  metronome_bpm: 80,
  keyboard_next: 'ArrowRight',
  keyboard_prev: 'ArrowLeft',
  dark_mode: false,
  stage_mode: false
};

// Cache
let cachedPrefs = null;

/**
 * Get viewer preferences (from Supabase or defaults)
 * @returns {Object} Preferences object
 */
export async function getViewerPrefs() {
  if (cachedPrefs) return cachedPrefs;

  const user = await getCurrentUser();
  if (!user) {
    cachedPrefs = { ...DEFAULT_PREFS };
    return cachedPrefs;
  }

  try {
    const { data, error } = await supabase
      .from('viewer_prefs')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    cachedPrefs = { ...DEFAULT_PREFS, ...data };

    // Also load local storage overrides
    const localDarkMode = storage.get('darkMode');
    const localStageMode = storage.get('stageMode');
    if (localDarkMode !== null) cachedPrefs.dark_mode = localDarkMode;
    if (localStageMode !== null) cachedPrefs.stage_mode = localStageMode;

    return cachedPrefs;
  } catch (error) {
    console.error('Failed to load preferences:', error);
    cachedPrefs = { ...DEFAULT_PREFS };
    return cachedPrefs;
  }
}

/**
 * Save viewer preferences
 * @param {Object} prefs - Preferences to save
 */
async function saveViewerPrefs(prefs) {
  const user = await getCurrentUser();
  if (!user) return;

  try {
    const { error } = await supabase
      .from('viewer_prefs')
      .upsert({
        user_id: user.id,
        ...prefs,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;

    // Update cache
    cachedPrefs = { ...cachedPrefs, ...prefs };

    showToast('Settings saved', 'success');
  } catch (error) {
    console.error('Failed to save preferences:', error);
    showToast('Failed to save settings', 'error');
  }
}

/**
 * Render the settings page
 */
export async function renderSettingsPage() {
  const app = document.getElementById('app');
  const prefs = await getViewerPrefs();

  app.innerHTML = `
    <div class="settings-container">
      <header class="settings-header">
        <a href="#/library" class="back-link">← Back to Library</a>
        <h1>Settings</h1>
      </header>
      
      <main class="settings-content">
        <section class="settings-section">
          <h2>Appearance</h2>
          
          <div class="setting-item">
            <label>
              <span class="setting-label">Dark Mode</span>
              <span class="setting-description">Use dark colors throughout the app</span>
            </label>
            <label class="toggle">
              <input type="checkbox" id="dark-mode" ${prefs.dark_mode ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div class="setting-item">
            <label>
              <span class="setting-label">Stage Mode</span>
              <span class="setting-description">High contrast, large controls for live performance</span>
            </label>
            <label class="toggle">
              <input type="checkbox" id="stage-mode" ${prefs.stage_mode ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </section>
        
        <section class="settings-section">
          <h2>Gesture Controls</h2>
          <p class="section-description">
            Configure how facial gestures trigger page turns. All camera processing
            happens locally on your device - video is never uploaded.
          </p>
          
          <div class="setting-item">
            <label for="trigger-next">
              <span class="setting-label">Next Page Trigger</span>
            </label>
            <select id="trigger-next" class="select-input">
              <option value="wink_right" ${prefs.trigger_next === 'wink_right' ? 'selected' : ''}>Wink Right Eye 👁️</option>
              <option value="wink_left" ${prefs.trigger_next === 'wink_left' ? 'selected' : ''}>Wink Left Eye 👁️</option>
              <option value="double_blink" ${prefs.trigger_next === 'double_blink' ? 'selected' : ''}>Double Blink</option>
              <option value="long_blink" ${prefs.trigger_next === 'long_blink' ? 'selected' : ''}>Long Blink (hold)</option>
              <option value="head_right" ${prefs.trigger_next === 'head_right' ? 'selected' : ''}>Head Turn Right</option>
              <option value="head_left" ${prefs.trigger_next === 'head_left' ? 'selected' : ''}>Head Turn Left</option>
            </select>
          </div>
          
          <div class="setting-item">
            <label for="trigger-prev">
              <span class="setting-label">Previous Page Trigger</span>
            </label>
            <select id="trigger-prev" class="select-input">
              <option value="wink_left" ${prefs.trigger_prev === 'wink_left' ? 'selected' : ''}>Wink Left Eye 👁️</option>
              <option value="wink_right" ${prefs.trigger_prev === 'wink_right' ? 'selected' : ''}>Wink Right Eye 👁️</option>
              <option value="double_blink" ${prefs.trigger_prev === 'double_blink' ? 'selected' : ''}>Double Blink</option>
              <option value="long_blink" ${prefs.trigger_prev === 'long_blink' ? 'selected' : ''}>Long Blink (hold)</option>
              <option value="head_right" ${prefs.trigger_prev === 'head_right' ? 'selected' : ''}>Head Turn Right</option>
              <option value="head_left" ${prefs.trigger_prev === 'head_left' ? 'selected' : ''}>Head Turn Left</option>
            </select>
          </div>
          
          <div class="setting-item">
            <label>
              <span class="setting-label">Sensitivity</span>
              <span class="setting-description">Higher = more sensitive, may increase false positives</span>
            </label>
            <div class="slider-with-value">
              <input type="range" id="sensitivity" min="0.5" max="2.0" step="0.1" value="${prefs.sensitivity}" />
              <span class="slider-value" id="sensitivity-value">${prefs.sensitivity.toFixed(1)}</span>
            </div>
          </div>
          
          <div class="setting-item">
            <label>
              <span class="setting-label">Cooldown (ms)</span>
              <span class="setting-description">Minimum time between triggers to prevent accidental double-flips</span>
            </label>
            <div class="slider-with-value">
              <input type="range" id="cooldown" min="300" max="2000" step="100" value="${prefs.cooldown_ms}" />
              <span class="slider-value" id="cooldown-value">${prefs.cooldown_ms}ms</span>
            </div>
          </div>
          
          <div class="setting-item">
            <label>
              <span class="setting-label">Show Debug Overlay</span>
              <span class="setting-description">Display gesture detection metrics while using camera controls</span>
            </label>
            <label class="toggle">
              <input type="checkbox" id="show-debug" ${prefs.show_debug ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </section>
        
        <section class="settings-section">
          <h2>Keyboard Controls</h2>
          <p class="section-description">
            <strong>Foot pedal support:</strong> USB foot pedals typically send keyboard keys. 
            Configure your pedal to send the keys below, or change these to match your pedal's output.
          </p>
          
          <div class="setting-item">
            <label for="keyboard-next">
              <span class="setting-label">Next Page Key</span>
            </label>
            <input 
              type="text" 
              id="keyboard-next" 
              class="key-input"
              value="${prefs.keyboard_next}" 
              readonly
              placeholder="Press a key..."
            />
          </div>
          
          <div class="setting-item">
            <label for="keyboard-prev">
              <span class="setting-label">Previous Page Key</span>
            </label>
            <input 
              type="text" 
              id="keyboard-prev" 
              class="key-input"
              value="${prefs.keyboard_prev}" 
              readonly
              placeholder="Press a key..."
            />
          </div>
          
          <p class="setting-hint">
            <strong>Default keys:</strong> Arrow keys always work in addition to your custom keys.
            Space and Enter also work for Next Page.
          </p>
        </section>
        
        <section class="settings-section">
          <h2>Metronome</h2>
          
          <div class="setting-item">
            <label for="metronome-bpm">
              <span class="setting-label">Default BPM</span>
            </label>
            <div class="slider-with-value">
              <input type="range" id="metronome-bpm" min="30" max="240" value="${prefs.metronome_bpm}" />
              <span class="slider-value" id="bpm-value">${prefs.metronome_bpm}</span>
            </div>
          </div>
        </section>
        
        <div class="settings-actions">
          <button id="save-settings" class="btn btn-primary btn-large">
            Save Settings
          </button>
        </div>
      </main>
    </div>
  `;

  // Dark mode toggle (immediate effect)
  document.getElementById('dark-mode').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    document.body.classList.toggle('dark-mode', enabled);
    storage.set('darkMode', enabled);
  });

  // Stage mode toggle (immediate effect)
  document.getElementById('stage-mode').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    document.body.classList.toggle('stage-mode', enabled);
    storage.set('stageMode', enabled);
  });

  // Slider value updates
  document.getElementById('sensitivity').addEventListener('input', (e) => {
    document.getElementById('sensitivity-value').textContent = parseFloat(e.target.value).toFixed(1);
  });

  document.getElementById('cooldown').addEventListener('input', (e) => {
    document.getElementById('cooldown-value').textContent = `${e.target.value}ms`;
  });

  document.getElementById('metronome-bpm').addEventListener('input', (e) => {
    document.getElementById('bpm-value').textContent = e.target.value;
  });

  // Key capture for keyboard remapping
  document.getElementById('keyboard-next').addEventListener('keydown', captureKey);
  document.getElementById('keyboard-prev').addEventListener('keydown', captureKey);

  function captureKey(e) {
    e.preventDefault();
    e.target.value = e.key;
  }

  // Save settings
  document.getElementById('save-settings').addEventListener('click', async () => {
    const newPrefs = {
      trigger_next: document.getElementById('trigger-next').value,
      trigger_prev: document.getElementById('trigger-prev').value,
      sensitivity: parseFloat(document.getElementById('sensitivity').value),
      cooldown_ms: parseInt(document.getElementById('cooldown').value, 10),
      show_debug: document.getElementById('show-debug').checked,
      metronome_bpm: parseInt(document.getElementById('metronome-bpm').value, 10),
      keyboard_next: document.getElementById('keyboard-next').value,
      keyboard_prev: document.getElementById('keyboard-prev').value,
      dark_mode: document.getElementById('dark-mode').checked,
      stage_mode: document.getElementById('stage-mode').checked
    };

    await saveViewerPrefs(newPrefs);
  });
}

/**
 * Clear cached preferences
 */
export function clearPrefsCache() {
  cachedPrefs = null;
}
