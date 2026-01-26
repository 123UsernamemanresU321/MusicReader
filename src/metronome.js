/**
 * Metronome Module
 * BPM control with tap tempo and audio click
 */

import { supabase, getCurrentUser } from './supabaseClient.js';
import { storage, debounce } from './utils.js';

/**
 * Create a metronome instance
 * @param {HTMLElement} container - Container element
 * @param {number} initialBpm - Initial BPM
 * @returns {Object} Metronome control object
 */
export function createMetronome(container, initialBpm = 80) {
    let bpm = initialBpm;
    let isPlaying = false;
    let intervalId = null;
    let audioContext = null;
    let tapTimes = [];
    let beatCount = 0;

    // Render UI
    container.innerHTML = `
    <div class="metronome">
      <div class="metronome-header">
        <h3>Metronome</h3>
        <button class="metronome-close" title="Close">&times;</button>
      </div>
      
      <div class="metronome-display">
        <span class="bpm-value" id="bpm-value">${bpm}</span>
        <span class="bpm-label">BPM</span>
      </div>
      
      <div class="metronome-beat" id="beat-indicator"></div>
      
      <div class="metronome-controls">
        <button class="btn btn-ghost bpm-adjust" id="bpm-minus-10">-10</button>
        <button class="btn btn-ghost bpm-adjust" id="bpm-minus-1">-1</button>
        <button class="btn btn-primary metronome-play" id="play-btn">
          ▶ Start
        </button>
        <button class="btn btn-ghost bpm-adjust" id="bpm-plus-1">+1</button>
        <button class="btn btn-ghost bpm-adjust" id="bpm-plus-10">+10</button>
      </div>
      
      <div class="metronome-slider">
        <input 
          type="range" 
          id="bpm-slider" 
          min="30" 
          max="240" 
          value="${bpm}"
        />
      </div>
      
      <button class="btn btn-secondary tap-tempo" id="tap-btn">
        Tap Tempo
      </button>
    </div>
  `;

    // Elements
    const bpmValue = container.querySelector('#bpm-value');
    const bpmSlider = container.querySelector('#bpm-slider');
    const playBtn = container.querySelector('#play-btn');
    const tapBtn = container.querySelector('#tap-btn');
    const beatIndicator = container.querySelector('#beat-indicator');

    // Update BPM display
    function updateDisplay() {
        bpmValue.textContent = bpm;
        bpmSlider.value = bpm;

        if (isPlaying) {
            restart();
        }
    }

    // Set BPM
    function setBpm(newBpm) {
        bpm = Math.max(30, Math.min(240, Math.round(newBpm)));
        updateDisplay();
        saveBpm();
    }

    // Save BPM (debounced)
    const saveBpm = debounce(async () => {
        storage.set('metronomeBpm', bpm);

        // Also save to viewer_prefs if logged in
        try {
            const user = await getCurrentUser();
            if (user) {
                await supabase
                    .from('viewer_prefs')
                    .upsert({
                        user_id: user.id,
                        metronome_bpm: bpm
                    }, {
                        onConflict: 'user_id'
                    });
            }
        } catch (error) {
            console.warn('Failed to save BPM preference:', error);
        }
    }, 1000);

    // Play click sound
    function playClick() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Higher pitch on first beat
        oscillator.frequency.value = beatCount === 0 ? 1000 : 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);

        // Visual feedback
        beatIndicator.classList.add('beat');
        setTimeout(() => beatIndicator.classList.remove('beat'), 100);

        beatCount = (beatCount + 1) % 4;
    }

    // Start metronome
    function start() {
        if (isPlaying) return;

        isPlaying = true;
        beatCount = 0;
        playBtn.textContent = '⏸ Stop';

        const intervalMs = 60000 / bpm;
        playClick(); // Immediate first click
        intervalId = setInterval(playClick, intervalMs);
    }

    // Stop metronome
    function stop() {
        if (!isPlaying) return;

        isPlaying = false;
        playBtn.textContent = '▶ Start';

        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }

    // Restart (after BPM change)
    function restart() {
        if (isPlaying) {
            stop();
            start();
        }
    }

    // Toggle play
    function toggle() {
        if (isPlaying) {
            stop();
        } else {
            start();
        }
    }

    // Tap tempo
    function tap() {
        const now = Date.now();

        // Clear old taps (more than 2 seconds ago)
        tapTimes = tapTimes.filter(t => now - t < 2000);

        tapTimes.push(now);

        if (tapTimes.length >= 2) {
            // Calculate average interval
            let totalInterval = 0;
            for (let i = 1; i < tapTimes.length; i++) {
                totalInterval += tapTimes[i] - tapTimes[i - 1];
            }
            const avgInterval = totalInterval / (tapTimes.length - 1);
            const tappedBpm = Math.round(60000 / avgInterval);

            setBpm(tappedBpm);
        }

        // Visual feedback
        tapBtn.classList.add('tapped');
        setTimeout(() => tapBtn.classList.remove('tapped'), 100);
    }

    // Event listeners
    playBtn.addEventListener('click', toggle);
    tapBtn.addEventListener('click', tap);

    container.querySelector('#bpm-minus-10').addEventListener('click', () => setBpm(bpm - 10));
    container.querySelector('#bpm-minus-1').addEventListener('click', () => setBpm(bpm - 1));
    container.querySelector('#bpm-plus-1').addEventListener('click', () => setBpm(bpm + 1));
    container.querySelector('#bpm-plus-10').addEventListener('click', () => setBpm(bpm + 10));

    bpmSlider.addEventListener('input', (e) => {
        bpm = parseInt(e.target.value, 10);
        bpmValue.textContent = bpm;
    });

    bpmSlider.addEventListener('change', (e) => {
        setBpm(parseInt(e.target.value, 10));
    });

    container.querySelector('.metronome-close').addEventListener('click', () => {
        container.hidden = true;
        stop();
    });

    // Cleanup
    function destroy() {
        stop();
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
    }

    return {
        start,
        stop,
        toggle,
        setBpm,
        getBpm: () => bpm,
        destroy
    };
}
