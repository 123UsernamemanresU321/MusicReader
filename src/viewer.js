/**
 * Main Viewer Module
 * Coordinates PDF/XML viewers, controls, face gesture, and metronome
 */

import { supabase, getCurrentUser, getSignedUrl } from './supabaseClient.js';
import { navigate, getParams } from './router.js';
import { createPdfViewer } from './pdfViewer.js';
import { createXmlViewer } from './xmlViewer.js';
import { initFaceControl, destroyFaceControl } from './faceControl.js';
import { createMetronome } from './metronome.js';
import { getViewerPrefs } from './settings.js';
import {
    showToast,
    storage,
    debounce,
    requestFullscreen,
    exitFullscreen,
    isFullscreen
} from './utils.js';

// State
let currentViewer = null;
let currentScore = null;
let setlistMode = null;
let prefs = null;
let metronome = null;
let faceControlActive = false;
let performanceMode = false;
let inactivityTimer = null;
let zoomLevel = 1.0;

/**
 * Render the viewer page
 * @param {Object} params - Route parameters
 */
export async function renderViewerPage(params) {
    const app = document.getElementById('app');
    const user = await getCurrentUser();

    if (!user) {
        navigate('/login');
        return;
    }

    const { scoreId, setlistId, index } = params;

    // Load user preferences
    prefs = await getViewerPrefs();

    // Load score data
    try {
        const { data: score, error } = await supabase
            .from('scores')
            .select('*')
            .eq('id', scoreId)
            .single();

        if (error || !score) throw new Error('Score not found');

        currentScore = score;

        // Check setlist mode
        if (setlistId) {
            setlistMode = {
                setlistId,
                currentIndex: parseInt(index, 10),
                items: []
            };
            // Load setlist items
            const { data: items } = await supabase
                .from('setlist_items')
                .select('score_id, sort_order')
                .eq('setlist_id', setlistId)
                .order('sort_order');

            if (items) {
                setlistMode.items = items;
            }
        }

    } catch (error) {
        console.error('Failed to load score:', error);
        app.innerHTML = `
      <div class="error-page">
        <h1>Score Not Found</h1>
        <p>The requested score could not be loaded.</p>
        <a href="#/library" class="btn btn-primary">Back to Library</a>
      </div>
    `;
        return;
    }

    // Apply theme modes
    document.body.classList.toggle('stage-mode', prefs.stage_mode);

    // Build viewer UI
    app.innerHTML = `
    <div class="viewer-container ${performanceMode ? 'performance-mode' : ''}" id="viewer-container">
      <header class="viewer-header" id="viewer-header">
        <div class="header-left">
          <button id="back-btn" class="btn btn-ghost" title="Back to Library">
            ← Back
          </button>
          <div class="score-info">
            <h1 class="score-title">${currentScore.title}</h1>
            ${currentScore.composer ? `<span class="score-composer">${currentScore.composer}</span>` : ''}
          </div>
        </div>
        <div class="header-center">
          <span class="page-info" id="page-info">Loading...</span>
        </div>
        <div class="header-right">
          <button id="zoom-out-btn" class="btn btn-ghost" title="Zoom Out">
            ➖
          </button>
          <span id="zoom-level" class="zoom-level">100%</span>
          <button id="zoom-in-btn" class="btn btn-ghost" title="Zoom In">
            ➕
          </button>
          <button id="metronome-btn" class="btn btn-ghost" title="Metronome">
            🎵
          </button>
          <button id="camera-btn" class="btn btn-ghost" title="Enable Camera Controls">
            📷
          </button>
          <button id="performance-btn" class="btn btn-ghost" title="Performance Mode">
            🎭
          </button>
          <button id="fullscreen-btn" class="btn btn-ghost" title="Fullscreen">
            ⛶
          </button>
        </div>
      </header>
      
      <main class="viewer-main" id="viewer-main">
        <!-- Score content will be rendered here -->
      </main>
      
      <div class="viewer-controls" id="viewer-controls">
        <button id="prev-btn" class="control-btn control-prev" title="Previous (${prefs.keyboard_prev})">
          ◀
        </button>
        
        ${setlistMode ? `
          <div class="setlist-nav">
            <button id="prev-score-btn" class="btn btn-ghost" title="Previous Score" ${setlistMode.currentIndex === 0 ? 'disabled' : ''}>
              ⏮
            </button>
            <span class="setlist-position">${setlistMode.currentIndex + 1} / ${setlistMode.items.length}</span>
            <button id="next-score-btn" class="btn btn-ghost" title="Next Score" ${setlistMode.currentIndex >= setlistMode.items.length - 1 ? 'disabled' : ''}>
              ⏭
            </button>
          </div>
        ` : ''}
        
        <button id="next-btn" class="control-btn control-next" title="Next (${prefs.keyboard_next})">
          ▶
        </button>
      </div>
      
      <div id="metronome-overlay" class="metronome-overlay" hidden></div>
      
      <div id="face-debug" class="face-debug" hidden></div>
      
      <div id="gesture-feedback" class="gesture-feedback" hidden>
        <span id="gesture-icon"></span>
      </div>
    </div>
  `;

    // Initialize viewer based on file type
    const viewerMain = document.getElementById('viewer-main');

    if (currentScore.file_type === 'pdf') {
        currentViewer = await createPdfViewer(viewerMain, currentScore, {
            onLoad: updatePageInfo,
            onPageChange: updatePageInfo
        });
    } else {
        currentViewer = await createXmlViewer(viewerMain, currentScore, {
            onLoad: updatePageInfo,
            onPageChange: updatePageInfo,
            onModeChange: updatePageInfo
        });
    }

    // Setup event listeners
    setupEventListeners();

    // Setup keyboard controls
    setupKeyboardControls();

    // Setup auto-dim
    setupAutoDim();

    // Focus container for keyboard
    viewerMain.focus();
}

/**
 * Update page info display
 * @param {Object} state - Current viewer state
 */
function updatePageInfo(state) {
    const pageInfo = document.getElementById('page-info');
    if (!pageInfo) return;

    if (state.mode) {
        // XML viewer
        if (state.mode === 'page') {
            pageInfo.textContent = `Page ${state.currentPage} of ${state.totalPages}`;
        } else {
            pageInfo.textContent = 'Scroll Mode';
        }
    } else {
        // PDF viewer
        pageInfo.textContent = `Page ${state.currentPage} of ${state.totalPages}`;
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Back button
    document.getElementById('back-btn').addEventListener('click', async () => {
        await savePosition();
        if (currentViewer) {
            currentViewer.destroy();
            currentViewer = null;
        }
        destroyFaceControl();
        navigate('/library');
    });

    // Page navigation
    document.getElementById('prev-btn').addEventListener('click', () => navigatePage('prev'));
    document.getElementById('next-btn').addEventListener('click', () => navigatePage('next'));

    // Setlist navigation
    if (setlistMode) {
        document.getElementById('prev-score-btn')?.addEventListener('click', () => navigateSetlist('prev'));
        document.getElementById('next-score-btn')?.addEventListener('click', () => navigateSetlist('next'));
    }

    // Zoom controls
    document.getElementById('zoom-in-btn').addEventListener('click', () => adjustZoom(0.1));
    document.getElementById('zoom-out-btn').addEventListener('click', () => adjustZoom(-0.1));

    // Metronome
    document.getElementById('metronome-btn').addEventListener('click', toggleMetronome);

    // Camera controls
    document.getElementById('camera-btn').addEventListener('click', toggleCameraControls);

    // Performance mode
    document.getElementById('performance-btn').addEventListener('click', togglePerformanceMode);

    // Fullscreen
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);

    // Exit fullscreen on escape
    document.addEventListener('fullscreenchange', () => {
        const btn = document.getElementById('fullscreen-btn');
        if (btn) {
            btn.textContent = isFullscreen() ? '⊠' : '⛶';
        }
    });

    // Save position before leaving
    window.addEventListener('beforeunload', savePosition);
}

/**
 * Setup keyboard controls
 */
function setupKeyboardControls() {
    const handler = (e) => {
        // Skip if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const key = e.key;

        // Check mapped keys
        if (key === prefs.keyboard_next || key === 'ArrowRight' || key === ' ' || key === 'Enter') {
            e.preventDefault();
            navigatePage('next');
        } else if (key === prefs.keyboard_prev || key === 'ArrowLeft') {
            e.preventDefault();
            navigatePage('prev');
        } else if (key === 'Escape') {
            if (performanceMode) {
                togglePerformanceMode();
            } else if (isFullscreen()) {
                exitFullscreen();
            }
        } else if (key === 'f' || key === 'F') {
            toggleFullscreen();
        } else if (key === 'm' || key === 'M') {
            toggleMetronome();
        } else if (key === '+' || key === '=') {
            e.preventDefault();
            adjustZoom(0.1);
        } else if (key === '-' || key === '_') {
            e.preventDefault();
            adjustZoom(-0.1);
        } else if (key === '0') {
            e.preventDefault();
            setZoom(1.0); // Reset zoom
        }
    };

    document.addEventListener('keydown', handler);

    // Store for cleanup
    window._viewerKeyHandler = handler;
}

/**
 * Adjust zoom level
 * @param {number} delta - Amount to change zoom by
 */
function adjustZoom(delta) {
    const newZoom = Math.max(0.5, Math.min(3.0, zoomLevel + delta));
    setZoom(newZoom);
}

/**
 * Set zoom level
 * @param {number} level - New zoom level (1.0 = 100%)
 */
function setZoom(level) {
    zoomLevel = level;

    // Update UI display
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) {
        zoomDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
    }

    // Apply zoom to viewer
    if (currentViewer && currentViewer.setZoom) {
        currentViewer.setZoom(zoomLevel);
    } else {
        // Fallback: apply CSS transform to viewer main
        const viewerMain = document.getElementById('viewer-main');
        if (viewerMain) {
            const content = viewerMain.firstElementChild;
            if (content) {
                content.style.transform = `scale(${zoomLevel})`;
                content.style.transformOrigin = 'center top';
            }
        }
    }
}

/**
 * Navigate page
 * @param {'prev'|'next'} direction - Direction
 */
async function navigatePage(direction) {
    if (!currentViewer) return;

    let changed = false;
    if (direction === 'next') {
        changed = await currentViewer.nextPage();
    } else {
        changed = await currentViewer.prevPage();
    }

    // Show visual feedback
    if (changed) {
        showGestureFeedback(direction === 'next' ? '▶' : '◀');
    }
}

/**
 * Navigate within setlist
 * @param {'prev'|'next'} direction - Direction
 */
async function navigateSetlist(direction) {
    if (!setlistMode) return;

    await savePosition();

    let newIndex = setlistMode.currentIndex;
    if (direction === 'next' && newIndex < setlistMode.items.length - 1) {
        newIndex++;
    } else if (direction === 'prev' && newIndex > 0) {
        newIndex--;
    } else {
        return;
    }

    const nextItem = setlistMode.items[newIndex];
    if (nextItem) {
        if (currentViewer) {
            currentViewer.destroy();
            currentViewer = null;
        }
        navigate(`/viewer/${nextItem.score_id}/setlist/${setlistMode.setlistId}/${newIndex}`);
    }
}

/**
 * Save current position to database
 */
const savePosition = debounce(async () => {
    if (!currentViewer || !currentScore) return;

    const position = currentViewer.getPosition();

    try {
        await supabase
            .from('scores')
            .update({ last_position: position })
            .eq('id', currentScore.id);
    } catch (error) {
        console.warn('Failed to save position:', error);
    }
}, 1000);

/**
 * Toggle metronome overlay
 */
function toggleMetronome() {
    const overlay = document.getElementById('metronome-overlay');
    const btn = document.getElementById('metronome-btn');

    if (overlay.hidden) {
        overlay.hidden = false;
        metronome = createMetronome(overlay, prefs.metronome_bpm);
        btn.classList.add('active');
    } else {
        if (metronome) {
            metronome.destroy();
            metronome = null;
        }
        overlay.hidden = true;
        btn.classList.remove('active');
    }
}

/**
 * Toggle camera/face controls
 */
async function toggleCameraControls() {
    const btn = document.getElementById('camera-btn');
    const debugEl = document.getElementById('face-debug');

    if (faceControlActive) {
        destroyFaceControl();
        faceControlActive = false;
        btn.classList.remove('active');
        btn.textContent = '📷';
        debugEl.hidden = true;
        showToast('Camera controls disabled', 'info');
    } else {
        btn.textContent = '⏳';
        btn.disabled = true;

        try {
            await initFaceControl({
                onNext: () => navigatePage('next'),
                onPrev: () => navigatePage('prev'),
                debugElement: prefs.show_debug ? debugEl : null,
                sensitivity: prefs.sensitivity,
                cooldownMs: prefs.cooldown_ms,
                triggerNext: prefs.trigger_next,
                triggerPrev: prefs.trigger_prev
            });

            faceControlActive = true;
            btn.classList.add('active');
            btn.textContent = '📷✓';
            if (prefs.show_debug) {
                debugEl.hidden = false;
            }
            showToast('Camera controls enabled', 'success');
        } catch (error) {
            console.error('Failed to init face control:', error);
            showToast(error.message || 'Failed to enable camera', 'error');
            btn.textContent = '📷';
        }

        btn.disabled = false;
    }
}

/**
 * Toggle performance mode
 */
function togglePerformanceMode() {
    performanceMode = !performanceMode;

    const container = document.getElementById('viewer-container');
    const btn = document.getElementById('performance-btn');

    container.classList.toggle('performance-mode', performanceMode);
    btn.classList.toggle('active', performanceMode);

    showToast(performanceMode ? 'Performance mode on' : 'Performance mode off', 'info');
}

/**
 * Toggle fullscreen
 */
function toggleFullscreen() {
    const container = document.getElementById('viewer-container');

    if (isFullscreen()) {
        exitFullscreen();
    } else {
        requestFullscreen(container);
    }
}

/**
 * Show gesture feedback
 * @param {string} icon - Icon to display
 */
function showGestureFeedback(icon) {
    const feedback = document.getElementById('gesture-feedback');
    const iconEl = document.getElementById('gesture-icon');

    if (!feedback || !iconEl) return;

    iconEl.textContent = icon;
    feedback.hidden = false;
    feedback.classList.add('visible');

    setTimeout(() => {
        feedback.classList.remove('visible');
        setTimeout(() => {
            feedback.hidden = true;
        }, 200);
    }, 300);
}

/**
 * Setup auto-dim UI after inactivity
 */
function setupAutoDim() {
    const header = document.getElementById('viewer-header');
    const controls = document.getElementById('viewer-controls');

    const showUI = () => {
        header.classList.remove('dimmed');
        controls.classList.remove('dimmed');

        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            if (performanceMode) {
                header.classList.add('dimmed');
                controls.classList.add('dimmed');
            }
        }, 3000);
    };

    document.addEventListener('mousemove', showUI);
    document.addEventListener('touchstart', showUI);
    document.addEventListener('keydown', showUI);

    // Initial dim if in performance mode
    if (performanceMode) {
        inactivityTimer = setTimeout(() => {
            header.classList.add('dimmed');
            controls.classList.add('dimmed');
        }, 3000);
    }
}
