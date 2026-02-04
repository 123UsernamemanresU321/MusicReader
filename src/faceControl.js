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
let leftEarHistory = [];
let rightEarHistory = [];
let yawHistory = [];
let leftClosedSince = null;
let rightClosedSince = null;
let blinkState = null;
let openFrames = 0;
let rearmReady = true;
let lastFrameTime = 0;

// Wink state tracking
let winkState = 'none'; // 'none', 'left_winking', 'right_winking'
let winkStartTime = 0;
let lastWinkTrigger = 0;

// Head turn state tracking
let headTurnState = 'center'; // 'center', 'left', 'right'
let lastHeadTurnTrigger = 0;

// Calibration baselines
let baseline = {
    leftEar: 0.25,    // Left Eye Aspect Ratio baseline
    rightEar: 0.25,   // Right Eye Aspect Ratio baseline
    yaw: 0            // Head yaw baseline
};

let noise = {
    leftEar: 0.02,
    rightEar: 0.02,
    diff: 0.02,
    yaw: 0.5
};

// Thresholds (adjusted by sensitivity)
const BASE_THRESHOLDS = {
    minEarDrop: 0.12,         // Minimum EAR drop for closed detection
    minOpenDrop: 0.06,        // Minimum EAR drop for open detection (hysteresis)
    noiseMultClose: 6,        // Stddev multiplier for close threshold
    noiseMultOpen: 3,         // Stddev multiplier for open threshold
    diffMin: 0.04,            // Minimum left/right EAR difference for wink
    diffNoiseMult: 3,         // Stddev multiplier for wink diff threshold
    blinkMinMs: 60,           // Short blink min duration
    blinkMaxMs: 350,          // Short blink max duration
    longBlinkMs: 420,         // Long blink min duration
    longBlinkMaxMs: 900,      // Long blink max duration
    doubleBlinkWindowMs: 700, // Window for double blink
    blinkSyncMs: 80,          // Max offset between eye closures for a blink
    winkMinMs: 60,            // Minimum wink duration
    winkMaxMs: 500,           // Maximum wink duration
    winkCooldownMs: 300,      // Cooldown between wink detections
    headTurnDeg: 5,           // Degrees for head turn (very subtle!)
    headReturnDeg: 3,         // Degrees to return to center
    baselineEma: 0.01,        // Baseline adaptation rate
    rearmOpenFrames: 3,       // Open frames required to rearm triggers
    targetFps: 30             // Cap processing FPS for stability
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
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
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
    const leftEarSamples = [];
    const rightEarSamples = [];
    const yawSamples = [];
    const diffSamples = [];

    const startTime = Date.now();
    const calibrationDuration = 2000; // 2 seconds

    while (Date.now() - startTime < calibrationDuration) {
        const results = await faceLandmarker.detectForVideo(videoElement, Date.now());

        if (results.faceLandmarks?.length > 0) {
            const landmarks = results.faceLandmarks[0];
            const { left, right } = calculateSeparateEAR(landmarks);

            leftEarSamples.push(left);
            rightEarSamples.push(right);
            yawSamples.push(calculateYaw(landmarks));
            diffSamples.push(Math.abs(left - right));
        }

        await new Promise(r => setTimeout(r, 50));
    }

    // Set baselines
    if (leftEarSamples.length > 0) {
        baseline.leftEar = mean(leftEarSamples);
        baseline.rightEar = mean(rightEarSamples);
        noise.leftEar = Math.max(stddev(leftEarSamples), 0.005);
        noise.rightEar = Math.max(stddev(rightEarSamples), 0.005);
    }
    if (yawSamples.length > 0) {
        baseline.yaw = mean(yawSamples);
        noise.yaw = Math.max(stddev(yawSamples), 0.1);
    }
    if (diffSamples.length > 0) {
        noise.diff = Math.max(stddev(diffSamples), 0.005);
    }

    console.log('Face control calibrated:', { baseline, noise });
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
    if (startTime - lastFrameTime < (1000 / BASE_THRESHOLDS.targetFps)) {
        return;
    }
    lastFrameTime = startTime;

    const results = faceLandmarker.detectForVideo(videoElement, Date.now());

    if (!results.faceLandmarks?.length) {
        updateDebug({ faceDetected: false });
        return;
    }

    const landmarks = results.faceLandmarks[0];

    // Calculate separate left/right EAR for wink detection
    const { left: leftEar, right: rightEar } = calculateSeparateEAR(landmarks);
    const yaw = calculateYaw(landmarks);

    // Add to history for smoothing (short history for responsiveness)
    leftEarHistory.push(leftEar);
    rightEarHistory.push(rightEar);
    yawHistory.push(yaw);

    // Keep history limited (shorter = more responsive)
    if (leftEarHistory.length > 7) leftEarHistory.shift();
    if (rightEarHistory.length > 7) rightEarHistory.shift();
    if (yawHistory.length > 5) yawHistory.shift();

    // Smoothed values
    const smoothLeftEar = median(leftEarHistory);
    const smoothRightEar = median(rightEarHistory);
    const smoothYaw = movingAverage(yawHistory, 3);

    // Detect eye states
    const sensitivity = config.sensitivity;
    const leftCloseDrop = Math.max(BASE_THRESHOLDS.minEarDrop, noise.leftEar * BASE_THRESHOLDS.noiseMultClose) / sensitivity;
    const rightCloseDrop = Math.max(BASE_THRESHOLDS.minEarDrop, noise.rightEar * BASE_THRESHOLDS.noiseMultClose) / sensitivity;
    const leftOpenDrop = Math.max(BASE_THRESHOLDS.minOpenDrop, noise.leftEar * BASE_THRESHOLDS.noiseMultOpen) / sensitivity;
    const rightOpenDrop = Math.max(BASE_THRESHOLDS.minOpenDrop, noise.rightEar * BASE_THRESHOLDS.noiseMultOpen) / sensitivity;
    const leftCloseThreshold = baseline.leftEar - leftCloseDrop;
    const rightCloseThreshold = baseline.rightEar - rightCloseDrop;
    const leftOpenThreshold = baseline.leftEar - leftOpenDrop;
    const rightOpenThreshold = baseline.rightEar - rightOpenDrop;

    const leftClosed = smoothLeftEar < leftCloseThreshold;
    const rightClosed = smoothRightEar < rightCloseThreshold;
    const leftOpen = smoothLeftEar > leftOpenThreshold;
    const rightOpen = smoothRightEar > rightOpenThreshold;

    const earDifference = Math.abs(smoothLeftEar - smoothRightEar);
    if (leftClosed && leftClosedSince === null) leftClosedSince = now;
    if (!leftClosed) leftClosedSince = null;
    if (rightClosed && rightClosedSince === null) rightClosedSince = now;
    if (!rightClosed) rightClosedSince = null;

    const bothClosed = leftClosed && rightClosed &&
        leftClosedSince !== null && rightClosedSince !== null &&
        Math.abs(leftClosedSince - rightClosedSince) <= BASE_THRESHOLDS.blinkSyncMs;

    // Wink detection: one eye closed, other STRICTLY open, with difference
    // NOTE: Webcam is mirrored, so user's LEFT eye appears on RIGHT side of video
    // We swap the labels so user's physical left eye -> wink_left
    const winkDiffThreshold = Math.max(BASE_THRESHOLDS.diffMin, noise.diff * BASE_THRESHOLDS.diffNoiseMult) / sensitivity;
    const isLeftWink = rightClosed && leftOpen && earDifference > winkDiffThreshold;   // User's left
    const isRightWink = leftClosed && rightOpen && earDifference > winkDiffThreshold;  // User's right

    const now = Date.now();
    const inCooldown = now - lastTriggerTime < config.cooldownMs;
    const winkCooldown = now - lastWinkTrigger < BASE_THRESHOLDS.winkCooldownMs;

    // Wink state machine
    let winkTriggered = null;

    // Removed aggressive "abort if bothClosed" here to allow for "sloppy winks" (squinting)
    // The strict open check above handles the false positives from blinks.

    if (!winkCooldown) {
        if (isLeftWink && winkState !== 'left_winking' && !bothClosed) {
            winkState = 'left_winking';
            winkStartTime = now;
        } else if (isRightWink && winkState !== 'right_winking' && !bothClosed) {
            winkState = 'right_winking';
            winkStartTime = now;
        } else if ((!isLeftWink && !isRightWink) && winkState !== 'none') {
            // Wink ended - check duration
            const winkDuration = now - winkStartTime;
            if (winkDuration >= BASE_THRESHOLDS.winkMinMs && winkDuration <= BASE_THRESHOLDS.winkMaxMs) {
                if (winkState === 'left_winking') {
                    winkTriggered = 'wink_left';
                } else if (winkState === 'right_winking') {
                    winkTriggered = 'wink_right';
                }
            }
            winkState = 'none';
        }
    }

    // Blink detection (both eyes closed, near-synchronous)
    if (bothClosed) {
        if (!blinkState) {
            blinkState = { start: now, end: null };
        }
    } else if (blinkState && blinkState.end === null) {
        blinkState.end = now;
        blinkHistory.push(blinkState);
        blinkState = null;
    }

    // Clean old blinks
    blinkHistory = blinkHistory.filter(b => now - b.start < 3000);

    // Head turn state machine - track when head returns to center
    const yawDelta = smoothYaw - baseline.yaw;
    const absYaw = Math.abs(yawDelta);
    const headTurnThreshold = BASE_THRESHOLDS.headTurnDeg / sensitivity;

    if (absYaw < BASE_THRESHOLDS.headReturnDeg) {
        headTurnState = 'center';
    } else if (yawDelta > headTurnThreshold) {
        if (headTurnState === 'center') headTurnState = 'right';
    } else if (yawDelta < -headTurnThreshold) {
        if (headTurnState === 'center') headTurnState = 'left';
    }

    // Detect triggers
    let triggered = null;
    let triggerReason = '';

    // Check wink triggers FIRST (highest priority, fastest response)
    if (winkTriggered && !inCooldown) {
        if (winkTriggered === 'wink_left') {
            if (config.triggerNext === 'wink_left') {
                triggered = 'next';
                triggerReason = 'wink_left';
            } else if (config.triggerPrev === 'wink_left') {
                triggered = 'prev';
                triggerReason = 'wink_left';
            }
        } else if (winkTriggered === 'wink_right') {
            if (config.triggerNext === 'wink_right') {
                triggered = 'next';
                triggerReason = 'wink_right';
            } else if (config.triggerPrev === 'wink_right') {
                triggered = 'prev';
                triggerReason = 'wink_right';
            }
        }
        if (triggered) {
            lastWinkTrigger = now;
        }
    }

    if (!inCooldown && !triggered && rearmReady) {
        // Get completed short blinks (not long blinks)
        const completedBlinks = blinkHistory.filter(b => {
            if (b.end === null) return false;
            const dur = b.end - b.start;
            return dur >= BASE_THRESHOLDS.blinkMinMs && dur <= BASE_THRESHOLDS.blinkMaxMs;
        });

        // Double blink: Check if we have 2 quick blinks within the window
        if (completedBlinks.length >= 2) {
            const lastTwo = completedBlinks.slice(-2);
            const blink1 = lastTwo[0];
            const blink2 = lastTwo[1];
            const timeBetweenBlinks = blink2.start - blink1.end;

            if (now - blink2.end < 300 && timeBetweenBlinks < BASE_THRESHOLDS.doubleBlinkWindowMs && timeBetweenBlinks > 80) {
                if (config.triggerNext === 'double_blink') {
                    triggered = 'next';
                    triggerReason = 'double_blink';
                } else if (config.triggerPrev === 'double_blink') {
                    triggered = 'prev';
                    triggerReason = 'double_blink';
                }
            }
        }

        // Check long blink
        if (!triggered) {
            const longBlinks = blinkHistory.filter(b =>
                b.end !== null &&
                (b.end - b.start) >= BASE_THRESHOLDS.longBlinkMs &&
                (b.end - b.start) <= BASE_THRESHOLDS.longBlinkMaxMs &&
                now - b.end < 300
            );

            if (longBlinks.length > 0) {
                if (config.triggerNext === 'long_blink') {
                    triggered = 'next';
                    triggerReason = 'long_blink';
                } else if (config.triggerPrev === 'long_blink') {
                    triggered = 'prev';
                    triggerReason = 'long_blink';
                }
            }
        }

        // Check head turn
        if (!triggered) {
            if (headTurnState === 'right' && now - lastHeadTurnTrigger > config.cooldownMs) {
                if (config.triggerNext === 'head_right') {
                    triggered = 'next';
                    triggerReason = 'head_right';
                } else if (config.triggerPrev === 'head_right') {
                    triggered = 'prev';
                    triggerReason = 'head_right';
                }
                if (triggered) {
                    lastHeadTurnTrigger = now;
                    headTurnState = 'triggered_right';
                }
            } else if (headTurnState === 'left' && now - lastHeadTurnTrigger > config.cooldownMs) {
                if (config.triggerNext === 'head_left') {
                    triggered = 'next';
                    triggerReason = 'head_left';
                } else if (config.triggerPrev === 'head_left') {
                    triggered = 'prev';
                    triggerReason = 'head_left';
                }
                if (triggered) {
                    lastHeadTurnTrigger = now;
                    headTurnState = 'triggered_left';
                }
            }
        }
    }

    // Execute trigger
    if (triggered) {
        lastTriggerTime = now;
        blinkHistory = [];
        rearmReady = false;
        openFrames = 0;

        console.log(`Gesture triggered: ${triggerReason} -> ${triggered}`);

        if (triggered === 'next' && config.onNext) {
            config.onNext();
        } else if (triggered === 'prev' && config.onPrev) {
            config.onPrev();
        }
    }

    if (!rearmReady) {
        if (leftOpen && rightOpen) {
            openFrames += 1;
        } else {
            openFrames = 0;
        }
        if (openFrames >= BASE_THRESHOLDS.rearmOpenFrames) {
            rearmReady = true;
        }
    }

    // Slowly adapt baseline during open-eye state
    if (leftOpen && rightOpen && !inCooldown) {
        baseline.leftEar = baseline.leftEar * (1 - BASE_THRESHOLDS.baselineEma) + smoothLeftEar * BASE_THRESHOLDS.baselineEma;
        baseline.rightEar = baseline.rightEar * (1 - BASE_THRESHOLDS.baselineEma) + smoothRightEar * BASE_THRESHOLDS.baselineEma;
        baseline.yaw = baseline.yaw * (1 - BASE_THRESHOLDS.baselineEma) + smoothYaw * BASE_THRESHOLDS.baselineEma;
    }

    // Update debug display
    updateDebug({
        faceDetected: true,
        leftEar: smoothLeftEar.toFixed(3),
        rightEar: smoothRightEar.toFixed(3),
        earDiff: earDifference.toFixed(3),
        yawDelta: yawDelta.toFixed(1),
        headTurnState,
        winkState,
        leftClosed,
        rightClosed,
        leftOpen,
        rightOpen,
        baselineLeftEar: baseline.leftEar.toFixed(3),
        baselineRightEar: baseline.rightEar.toFixed(3),
        baselineYaw: baseline.yaw.toFixed(1),
        leftCloseThreshold: leftCloseThreshold.toFixed(3),
        rightCloseThreshold: rightCloseThreshold.toFixed(3),
        leftOpenThreshold: leftOpenThreshold.toFixed(3),
        rightOpenThreshold: rightOpenThreshold.toFixed(3),
        winkDiffThreshold: winkDiffThreshold.toFixed(3),
        blinkCount: blinkHistory.length,
        inCooldown,
        cooldownRemaining: inCooldown ? config.cooldownMs - (now - lastTriggerTime) : 0,
        triggered,
        triggerReason,
        fps: Math.round(1000 / (performance.now() - startTime))
    });
}

/**
 * Calculate separate EAR for left and right eyes (for wink detection)
 */
function calculateSeparateEAR(landmarks) {
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

    return {
        left: eyeAspectRatio(leftEye),
        right: eyeAspectRatio(rightEye)
    };
}

/**
 * Calculate Eye Aspect Ratio (EAR) - combined
 */
function calculateEAR(landmarks) {
    const { left, right } = calculateSeparateEAR(landmarks);
    return (left + right) / 2;
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

function mean(values) {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values) {
    if (values.length < 2) return 0;
    const avg = mean(values);
    const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
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
          <span class="debug-label">Left Eye:</span>
          <span class="debug-value ${data.leftClosed ? 'active' : ''}">${data.leftEar} ${data.leftClosed ? '👁️' : '○'}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Right Eye:</span>
          <span class="debug-value ${data.rightClosed ? 'active' : ''}">${data.rightEar} ${data.rightClosed ? '👁️' : '○'}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Diff:</span>
          <span class="debug-value">${data.earDiff}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Wink:</span>
          <span class="debug-value ${data.winkState !== 'none' ? 'active' : ''}">${data.winkState.toUpperCase()}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Thresh:</span>
          <span class="debug-value">L${data.leftCloseThreshold}/O${data.leftOpenThreshold} • R${data.rightCloseThreshold}/O${data.rightOpenThreshold}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Wink Diff:</span>
          <span class="debug-value">${data.winkDiffThreshold}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Yaw:</span>
          <span class="debug-value">${data.yawDelta}°</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Head:</span>
          <span class="debug-value ${data.headTurnState !== 'center' ? 'active' : ''}">${data.headTurnState.toUpperCase()}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Blinks:</span>
          <span class="debug-value">${data.blinkCount}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Status:</span>
          <span class="debug-value ${data.inCooldown ? 'active' : 'success'}">${data.inCooldown ? `Cooldown ${data.cooldownRemaining}ms` : 'Ready'}</span>
        </div>
        ${data.triggered ? `
          <div class="debug-row triggered">
            <span class="debug-label">TRIGGERED:</span>
            <span class="debug-value">${data.triggerReason} → ${data.triggered.toUpperCase()}</span>
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
    leftEarHistory = [];
    rightEarHistory = [];
    yawHistory = [];
    lastTriggerTime = 0;
    headTurnState = 'center';
    lastHeadTurnTrigger = 0;
    winkState = 'none';
    winkStartTime = 0;
    lastWinkTrigger = 0;
}
