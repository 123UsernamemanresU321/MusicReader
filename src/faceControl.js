/**
 * Face Control Module
 * Uses MediaPipe Face Landmarker for gesture detection
 * All processing is LOCAL - no data is uploaded
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { movingAverage, clamp } from './utils.js';

// State
let faceLandmarker = null;
let videoElement = null;
let stream = null;
let animationId = null;
let isRunning = false;
let isPaused = false;

// Configuration
let config = {
    onNext: null,
    onPrev: null,
    debugElement: null,
    sensitivity: 1.0,
    cooldownMs: 900,
    triggerNext: 'double_blink',
    triggerPrev: 'long_blink'
};

// Detection state
let lastTriggerTime = 0;
let blinkHistory = [];
let earHistory = [];
let marHistory = [];
let yawHistory = [];

// Calibration baselines
let baseline = {
    ear: 0.25,     // Eye Aspect Ratio baseline
    mar: 0.3,      // Mouth Aspect Ratio baseline
    yaw: 0         // Head yaw baseline
};

// Thresholds (adjusted by sensitivity)
const BASE_THRESHOLDS = {
    blinkEarDrop: 0.15,       // EAR drop to detect blink
    longBlinkMs: 400,         // Duration for long blink
    doubleBlikWindowMs: 500,  // Window for double blink
    mouthOpenMar: 0.5,        // MAR threshold for mouth open
    headTurnDeg: 15           // Degrees for head turn
};

/**
 * Initialize face control
 * @param {Object} options - Configuration options
 */
export async function initFaceControl(options = {}) {
    config = { ...config, ...options };

    // Check for camera support
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported in this browser');
    }

    // Request camera permission
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            },
            audio: false
        });
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            throw new Error('Camera permission denied. Please allow camera access.');
        }
        throw new Error('Failed to access camera: ' + error.message);
    }

    // Create video element
    videoElement = document.createElement('video');
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;
    videoElement.style.display = 'none';
    document.body.appendChild(videoElement);

    // Wait for video to be ready
    await new Promise((resolve) => {
        videoElement.onloadeddata = resolve;
    });

    // Initialize MediaPipe Face Landmarker
    const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
    });

    // Quick calibration (capture baseline for 2 seconds)
    await calibrateBaseline();

    // Start detection loop
    isRunning = true;
    detectLoop();
}

/**
 * Calibrate baseline values
 */
async function calibrateBaseline() {
    const earSamples = [];
    const marSamples = [];
    const yawSamples = [];

    const startTime = Date.now();
    const calibrationDuration = 2000; // 2 seconds

    while (Date.now() - startTime < calibrationDuration) {
        const results = await faceLandmarker.detectForVideo(videoElement, Date.now());

        if (results.faceLandmarks?.length > 0) {
            const landmarks = results.faceLandmarks[0];

            earSamples.push(calculateEAR(landmarks));
            marSamples.push(calculateMAR(landmarks));
            yawSamples.push(calculateYaw(landmarks));
        }

        await new Promise(r => setTimeout(r, 50));
    }

    // Set baselines
    if (earSamples.length > 0) {
        baseline.ear = earSamples.reduce((a, b) => a + b) / earSamples.length;
    }
    if (marSamples.length > 0) {
        baseline.mar = marSamples.reduce((a, b) => a + b) / marSamples.length;
    }
    if (yawSamples.length > 0) {
        baseline.yaw = yawSamples.reduce((a, b) => a + b) / yawSamples.length;
    }

    console.log('Face control calibrated:', baseline);
}

/**
 * Main detection loop
 */
function detectLoop() {
    if (!isRunning || !faceLandmarker || !videoElement) return;

    if (!isPaused) {
        processFrame();
    }

    animationId = requestAnimationFrame(detectLoop);
}

/**
 * Process a single video frame
 */
async function processFrame() {
    const startTime = performance.now();

    const results = faceLandmarker.detectForVideo(videoElement, Date.now());

    if (!results.faceLandmarks?.length) {
        updateDebug({ faceDetected: false });
        return;
    }

    const landmarks = results.faceLandmarks[0];
    const blendshapes = results.faceBlendshapes?.[0]?.categories || [];

    // Calculate metrics
    const ear = calculateEAR(landmarks);
    const mar = calculateMAR(landmarks);
    const yaw = calculateYaw(landmarks);

    // Add to history for smoothing
    earHistory.push(ear);
    marHistory.push(mar);
    yawHistory.push(yaw);

    // Keep history limited
    if (earHistory.length > 10) earHistory.shift();
    if (marHistory.length > 10) marHistory.shift();
    if (yawHistory.length > 10) yawHistory.shift();

    // Smoothed values
    const smoothEar = movingAverage(earHistory, 5);
    const smoothMar = movingAverage(marHistory, 5);
    const smoothYaw = movingAverage(yawHistory, 5);

    // Detect gestures
    const sensitivity = config.sensitivity;
    const thresholds = {
        blinkEarDrop: BASE_THRESHOLDS.blinkEarDrop / sensitivity,
        headTurnDeg: BASE_THRESHOLDS.headTurnDeg / sensitivity
    };

    // Blink detection
    const isEyesClosed = (baseline.ear - smoothEar) > thresholds.blinkEarDrop;

    // Track blink events
    const now = Date.now();
    const inCooldown = now - lastTriggerTime < config.cooldownMs;

    if (isEyesClosed) {
        if (!blinkHistory.length || now - blinkHistory[blinkHistory.length - 1].start > 1000) {
            blinkHistory.push({ start: now, end: null });
        }
    } else {
        if (blinkHistory.length && blinkHistory[blinkHistory.length - 1].end === null) {
            blinkHistory[blinkHistory.length - 1].end = now;
        }
    }

    // Clean old blinks
    blinkHistory = blinkHistory.filter(b => now - b.start < 2000);

    // Detect triggers
    let triggered = null;

    if (!inCooldown) {
        // Check double blink
        const completedBlinks = blinkHistory.filter(b => b.end !== null);
        const recentBlinks = completedBlinks.filter(b =>
            now - b.end < BASE_THRESHOLDS.doubleBlikWindowMs &&
            (b.end - b.start) < BASE_THRESHOLDS.longBlinkMs
        );

        if (recentBlinks.length >= 2) {
            if (config.triggerNext === 'double_blink') {
                triggered = 'next';
            } else if (config.triggerPrev === 'double_blink') {
                triggered = 'prev';
            }
        }

        // Check long blink
        const longBlinks = completedBlinks.filter(b =>
            (b.end - b.start) >= BASE_THRESHOLDS.longBlinkMs &&
            now - b.end < 300
        );

        if (longBlinks.length > 0 && !triggered) {
            if (config.triggerNext === 'long_blink') {
                triggered = 'next';
            } else if (config.triggerPrev === 'long_blink') {
                triggered = 'prev';
            }
        }

        // Check head turn
        const yawDelta = smoothYaw - baseline.yaw;

        if (Math.abs(yawDelta) > thresholds.headTurnDeg && !triggered) {
            if (yawDelta > 0) {
                // Head turned right
                if (config.triggerNext === 'head_right') {
                    triggered = 'next';
                } else if (config.triggerPrev === 'head_right') {
                    triggered = 'prev';
                }
            } else {
                // Head turned left
                if (config.triggerNext === 'head_left') {
                    triggered = 'next';
                } else if (config.triggerPrev === 'head_left') {
                    triggered = 'prev';
                }
            }
        }

        // Execute trigger
        if (triggered) {
            lastTriggerTime = now;
            blinkHistory = []; // Clear blink history

            if (triggered === 'next' && config.onNext) {
                config.onNext();
            } else if (triggered === 'prev' && config.onPrev) {
                config.onPrev();
            }
        }
    }

    // Update debug display
    updateDebug({
        faceDetected: true,
        ear: smoothEar.toFixed(3),
        mar: smoothMar.toFixed(3),
        yaw: smoothYaw.toFixed(1),
        baselineEar: baseline.ear.toFixed(3),
        isEyesClosed,
        blinkCount: blinkHistory.length,
        inCooldown,
        cooldownRemaining: inCooldown ? config.cooldownMs - (now - lastTriggerTime) : 0,
        triggered,
        fps: Math.round(1000 / (performance.now() - startTime))
    });
}

/**
 * Calculate Eye Aspect Ratio (EAR)
 * Higher when eyes open, lower when closed
 */
function calculateEAR(landmarks) {
    // MediaPipe landmark indices for eyes
    // Left eye: 33, 160, 158, 133, 153, 144
    // Right eye: 362, 385, 387, 263, 373, 380

    const leftEye = {
        p1: landmarks[33],  // outer corner
        p2: landmarks[160], // top-left
        p3: landmarks[158], // top-right
        p4: landmarks[133], // inner corner
        p5: landmarks[153], // bottom-left
        p6: landmarks[144]  // bottom-right
    };

    const rightEye = {
        p1: landmarks[362], // outer corner
        p2: landmarks[385], // top-right
        p3: landmarks[387], // top-left
        p4: landmarks[263], // inner corner
        p5: landmarks[373], // bottom-right
        p6: landmarks[380]  // bottom-left
    };

    const leftEAR = eyeAspectRatio(leftEye);
    const rightEAR = eyeAspectRatio(rightEye);

    return (leftEAR + rightEAR) / 2;
}

function eyeAspectRatio(eye) {
    const verticalA = distance(eye.p2, eye.p6);
    const verticalB = distance(eye.p3, eye.p5);
    const horizontal = distance(eye.p1, eye.p4);

    return (verticalA + verticalB) / (2 * horizontal);
}

/**
 * Calculate Mouth Aspect Ratio (MAR)
 */
function calculateMAR(landmarks) {
    // Mouth landmarks
    const top = landmarks[13];     // top lip
    const bottom = landmarks[14];  // bottom lip
    const left = landmarks[61];    // left corner
    const right = landmarks[291];  // right corner

    const vertical = distance(top, bottom);
    const horizontal = distance(left, right);

    return vertical / horizontal;
}

/**
 * Calculate head yaw (rotation around vertical axis)
 */
function calculateYaw(landmarks) {
    // Use nose and face edges to estimate yaw
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    const leftDist = distance(nose, leftCheek);
    const rightDist = distance(nose, rightCheek);

    // Positive = turned right, negative = turned left
    const ratio = (rightDist - leftDist) / (rightDist + leftDist);
    return ratio * 90; // Approximate degrees
}

/**
 * Calculate 3D distance between two landmarks
 */
function distance(p1, p2) {
    return Math.sqrt(
        Math.pow(p2.x - p1.x, 2) +
        Math.pow(p2.y - p1.y, 2) +
        Math.pow((p2.z || 0) - (p1.z || 0), 2)
    );
}

/**
 * Update debug display
 */
function updateDebug(data) {
    if (!config.debugElement) return;

    config.debugElement.innerHTML = `
    <div class="debug-content">
      <div class="debug-row">
        <span class="debug-label">Face:</span>
        <span class="debug-value ${data.faceDetected ? 'success' : 'error'}">
          ${data.faceDetected ? '✓ Detected' : '✗ Not Found'}
        </span>
      </div>
      ${data.faceDetected ? `
        <div class="debug-row">
          <span class="debug-label">EAR:</span>
          <span class="debug-value">${data.ear} (base: ${data.baselineEar})</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">MAR:</span>
          <span class="debug-value">${data.mar}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Yaw:</span>
          <span class="debug-value">${data.yaw}°</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Eyes:</span>
          <span class="debug-value ${data.isEyesClosed ? 'active' : ''}">
            ${data.isEyesClosed ? 'CLOSED' : 'Open'}
          </span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Blinks:</span>
          <span class="debug-value">${data.blinkCount}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Cooldown:</span>
          <span class="debug-value ${data.inCooldown ? 'active' : ''}">
            ${data.inCooldown ? `${data.cooldownRemaining}ms` : 'Ready'}
          </span>
        </div>
        ${data.triggered ? `
          <div class="debug-row triggered">
            <span class="debug-label">TRIGGERED:</span>
            <span class="debug-value">${data.triggered.toUpperCase()}</span>
          </div>
        ` : ''}
        <div class="debug-row">
          <span class="debug-label">FPS:</span>
          <span class="debug-value">${data.fps}</span>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Pause face control
 */
export function pauseFaceControl() {
    isPaused = true;
}

/**
 * Resume face control
 */
export function resumeFaceControl() {
    isPaused = false;
}

/**
 * Destroy face control and cleanup
 */
export function destroyFaceControl() {
    isRunning = false;
    isPaused = false;

    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    if (videoElement) {
        videoElement.remove();
        videoElement = null;
    }

    if (faceLandmarker) {
        faceLandmarker.close();
        faceLandmarker = null;
    }

    // Reset state
    blinkHistory = [];
    earHistory = [];
    marHistory = [];
    yawHistory = [];
    lastTriggerTime = 0;
}
