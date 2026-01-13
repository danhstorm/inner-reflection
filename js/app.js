/**
 * INNER REFLECTION - Main Application
 * 
 * Central orchestrator that initializes and coordinates all subsystems.
 * 
 * Components:
 * - StateEngine: 64-dimension interconnected parameter space
 * - VisualEngine: Three.js WebGL rendering with multi-pass shaders
 * - AudioEngine: Tone.js synthesis with reactive effects
 * - FaceTracker: MediaPipe face detection for position control
 * - InputManager: Keyboard, mouse, touch, accelerometer handling
 * 
 * Main Loop:
 * 1. Update StateEngine (drift, input processing, smoothing)
 * 2. Get visual state and pass to VisualEngine
 * 3. Get audio state and pass to AudioEngine
 * 4. Render frame
 * 
 * Debug panel (key 'D') provides real-time parameter adjustment and presets.
 */

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
];

class InnerReflectionApp {
    constructor() {
        // Core components
        this.inputManager = null;
        this.audioEngine = null;
        this.visualEngine = null;
        this.faceTracker = null;
        this.handTracker = null;
        this.stateEngine = null;
        
        // State
        this.isRunning = false;
        this.isStarting = false;
        this.isPaused = false;
        this.isMuted = false;
        this.lastTime = 0;
        this.frameCount = 0;
        
        // Track active slider interactions (don't update these from state)
        this.activeSliders = new Set();
        this.lockedSliders = new Map();
        this.stateSliderMeta = new Map();
        this.stateSliderByDimension = new Map();
        this.manualSliderMeta = new Map();
        this.manualSliderByKey = new Map();
        
        // Performance monitoring
        this.fps = 0;
        this.fpsHistory = [];
        
        // DOM elements
        this.canvas = null;
        this.startScreen = null;
        this.startButton = null;
        this.loadingScreen = null;
        this.faceOverlayWrap = null;
        this.handOverlayWrap = null;
        this.handOverlay = null;
        this.handCtx = null;
        this.handOverlayVisibility = 0;
        
        // Preloading state
        this.preloadComplete = false;
        this.preloadPromise = null;
        
        // User choices
        this.enabledInputs = {
            microphone: true,
            camera: true,
            accelerometer: false,
            sound: true,
            hands: true,
            faceTracking: true
        };

        this.showFaceOverlay = true;
        this.showHandOverlay = true;

        // Manual visual controls (not driven by state engine)
        this.manualVisual = {
            ringDelay: 0.35,
            ringOverlayStrength: 0.4,
            ringOverlayWidth: 0.35,
            parallelStrength: 0.0,     // Start with no parallel lines
            parallelZoom: 0.42,
            parallelZoomDrift: 0.15,
            parallelSpin: 0.15,
            parallelThickness: 0.28,
            parallelPresence: 0.0,     // Start with no parallel presence
            blobCount: 8,              // Fewer blobs for cleaner look
            blobSpread: 0.75,
            blobScale: 0.95,
            blobMotion: 0.4,
            blobBlur: 0.75,
            blobSmear: 0.6,
            blobLighten: 0.25,
            blobInvert: 0.1,
            blobFade: 0.7,
            blobWarp: 0.25,
            blobOffsetX: 0,
            blobOffsetY: 0
        };
        
        this.debugControlsInitialized = false;
        this.sliderInputState = new Map();
        this.columnStateKey = 'innerReflection.columnState';
        this.previewStartTime = 0;
        this.previewHoldDuration = 6;
        this.animSpeedMin = 0.12;
        this.animSpeedMax = 0.5;
        this.currentAnimSpeed = 0.2;
        
        // Face feature tracking state
        this.wasTalking = false;
        
        // Last known good face data for visualization persistence
        this.lastFaceData = {
            faceX: 0.5, faceY: 0.5, faceSize: 0.3,
            headYaw: 0, headPitch: 0, headRoll: 0,
            leftEyeOpen: 0.7, rightEyeOpen: 0.7,
            gazeX: 0, gazeY: 0,
            mouthOpen: 0, mouthWidth: 0.4,
            leftBrowRaise: 0, rightBrowRaise: 0, browFurrow: 0,
            engagement: 0.5, lookingAtScreen: 0.5,
            detected: false
        };

        this.pointerHand = {
            active: false,
            x: 0.5,
            y: 0.5,
            vx: 0,
            vy: 0,
            strength: 0.6,
            lastX: 0.5,
            lastY: 0.5,
            lastTime: 0
        };
        
        this.handPitch = {
            index: 4,
            targetCents: 0,
            currentCents: 0,
            lastStepTime: 0,
            scale: [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24]
        };
        
        // Face tracking smoothing - VERY heavy smoothing to prevent flickering
        this.faceSmoothing = {
            x: { value: 0.5, target: 0.5, velocity: 0 },
            y: { value: 0.5, target: 0.5, velocity: 0 },
            size: { value: 0.3, target: 0.3, velocity: 0 },
            // Push amounts (how much face tracking affects parameters)
            pushX: { value: 0, velocity: 0 },
            pushY: { value: 0, velocity: 0 },
            pushSize: { value: 0, velocity: 0 }
        };
        
        // Bound methods
        this.animate = this.animate.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleKeyup = this.handleKeyup.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
    }
    
    // =========================================
    // INITIALIZATION
    // =========================================
    
    async init() {
        console.log('InnerReflection: Initializing...');
        
        // Get DOM elements
        this.canvas = document.getElementById('main-canvas');
        this.startScreen = document.getElementById('start-screen');
        this.startButton = document.getElementById('start-button');
        this.loadingScreen = document.getElementById('loading');
        
        // Face overlay canvas
        this.faceOverlayWrap = document.getElementById('face-overlay-wrap');
        this.faceOverlay = document.getElementById('face-overlay');
        this.faceCloseButton = document.getElementById('face-close');
        this.faceCtx = this.faceOverlay?.getContext('2d');
        if (this.faceOverlay) {
            this.faceOverlay.width = 160;
            this.faceOverlay.height = 200;
        }

        // Hand overlay canvas
        this.handOverlayWrap = document.getElementById('hand-overlay-wrap');
        this.handOverlay = document.getElementById('hand-overlay');
        this.handCtx = this.handOverlay?.getContext('2d');
        this.updateHandOverlaySize();
        window.addEventListener('resize', () => this.updateHandOverlaySize());
        
        // Initialize components
        this.inputManager = new InputManager();
        this.audioEngine = new AudioEngine();
        this.visualEngine = new VisualEngine();
        this.faceTracker = new FaceTracker();
        this.handTracker = new HandTracker();
        this.stateEngine = new StateEngine();
        
        // Initialize input manager (sets up pointer events, checks capabilities)
        await this.inputManager.init();
        
        // Initialize visual engine (sets up Three.js, shaders)
        await this.visualEngine.init(this.canvas);
        
        // Set up UI event listeners
        this.setupUI();
        this.setupDebugControls();
        this.setupPointerHand();
        this.setFaceOverlayVisible(true);
        this.setHandOverlayVisible(true);
        
        // Set up keyboard and mouse controls
        document.addEventListener('keydown', this.handleKeydown);
        document.addEventListener('keyup', this.handleKeyup);
        document.addEventListener('mousemove', this.handleMouseMove);
        
        // Start preview render (behind glass blur)
        this.startPreview();
        
        // Start background preloading (audio structures, etc.)
        this.preloadInBackground();
        
        console.log('InnerReflection: Initialized');
    }
    
    async preloadInBackground() {
        // Preload everything we can without user interaction
        // This runs in background while user sees intro screen
        console.log('InnerReflection: Starting background preload...');
        
        this.preloadPromise = (async () => {
            try {
                // Preload audio engine structures (but not start audio context - that needs click)
                await this.audioEngine.preload();
                
                // Preload face mesh model files
                await this.preloadFaceMesh();
                
                this.preloadComplete = true;
                console.log('InnerReflection: Background preload complete ✓');
                
                // Update UI to show ready state - add subtle pulse to title
                const title = document.querySelector('.start-title');
                if (title) {
                    title.classList.add('ready');
                }
            } catch (error) {
                console.warn('InnerReflection: Background preload partial failure:', error);
                this.preloadComplete = true; // Continue anyway
            }
        })();
    }
    
    async preloadFaceMesh() {
        // Preload MediaPipe Face Mesh model files
        // Skip if FaceMesh is not available yet (script still loading)
        if (typeof FaceMesh === 'undefined') {
            console.log('InnerReflection: FaceMesh not yet loaded, skipping preload');
            return;
        }
        
        try {
            // Create a temporary FaceMesh just to trigger model download
            const tempMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });
            tempMesh.setOptions({
                maxNumFaces: this.faceTracker?.maxFaces || 2,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            // Close it - we'll create the real one when camera is ready
            if (tempMesh.close) {
                await tempMesh.close();
            }
            console.log('InnerReflection: Face Mesh models preloaded');
        } catch (e) {
            console.warn('InnerReflection: Face Mesh preload failed:', e);
        }
    }
    
    setupUI() {
        // Permission toggles - click on checkbox
        const toggles = document.querySelectorAll('.permission-toggle input[type="checkbox"]');
        toggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const permission = e.target.closest('.permission-toggle').dataset.permission;
                this.enabledInputs[permission] = e.target.checked;
                console.log(`InnerReflection: ${permission} ${e.target.checked ? 'enabled' : 'disabled'}`);
            });
        });
        
        // Make entire toggle row clickable
        const toggleRows = document.querySelectorAll('.permission-toggle');
        toggleRows.forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't toggle if clicking directly on the checkbox (it handles itself)
                if (e.target.type === 'checkbox') return;
                const checkbox = row.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
        
        // Start button
        this.startButton.addEventListener('click', () => this.start());
        
        // Start screen settings button
        const startSettings = document.getElementById('start-settings');
        if (startSettings) {
            startSettings.addEventListener('click', () => {
                const debugPanel = document.getElementById('debug-panel');
                if (debugPanel) {
                    debugPanel.style.display = 'block';
                }
            });
        }

        // Face overlay close button
        if (this.faceCloseButton) {
            this.faceCloseButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleFaceTracking(false);
            });
        }
        
        // Also allow clicking the title to start, with kerning animation
        const title = document.querySelector('.start-title');
        if (title) {
            title.style.cursor = 'pointer';
            title.addEventListener('click', (e) => {
                e.preventDefault();
                // Prevent double-triggering
                if (title.classList.contains('clicked')) return;
                // Add clicked class for slower kerning shrink animation (0.9s)
                title.classList.add('clicked');
                
                // Fade out glass overlay smoothly
                const glassOverlay = document.querySelector('.glass-overlay');
                if (glassOverlay) {
                    glassOverlay.classList.add('fading-out');
                }
                
                // After kerning completes (0.9s), fade out title and toggles together
                const permissionsContainer = document.querySelector('.permissions-container');
                setTimeout(() => {
                    title.classList.add('fading-out');
                    if (permissionsContainer) {
                        permissionsContainer.classList.add('fading-out');
                    }
                    // Start the experience after fade completes (1.2s)
                    setTimeout(() => this.start(), 1200);
                }, 900);
            });
            
            // For touch devices, also handle touchstart for immediate feedback
            title.addEventListener('touchstart', (e) => {
                if (!title.classList.contains('clicked')) {
                    title.classList.add('clicked');
                }
            }, { passive: true });
        }
    }
    
    startPreview() {
        // Run a simplified render loop for the preview behind the start screen
        this.previewStartTime = performance.now();
        const previewLoop = (time) => {
            if (this.isRunning) return; // Stop preview when main experience starts
            
            const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
            this.lastTime = time;
            
            // Keep the starting look for longer, then slowly let drift evolve
            const elapsed = (time - this.previewStartTime) / 1000;
            const holdProgress = Utils.clamp(elapsed / this.previewHoldDuration, 0, 1);
            const previewScale = 0.05 + Utils.smoothstep(0, 1, holdProgress) * 0.95;
            this.updateAnimationSpeed();
            const previewDelta = deltaTime * previewScale * this.currentAnimSpeed;
            this.stateEngine.update(previewDelta);
            
            // Render at reduced rate for preview
            if (this.frameCount % 2 === 0) {
                const visualState = this.stateEngine.getVisualState();
                this.applyManualVisualParams(visualState);
                // Add vignetteShape from local slider
                visualState.vignetteShape = this.vignetteShape ?? 0.5;
                this.visualEngine.render(deltaTime * this.currentAnimSpeed, visualState);
            }
            
            this.frameCount++;
            requestAnimationFrame(previewLoop);
        };
        
        requestAnimationFrame(previewLoop);
    }
    
    // =========================================
    // START EXPERIENCE
    // =========================================
    
    async start() {
        // Prevent multiple starts
        if (this.isStarting || this.isRunning) return;
        this.isStarting = true;
        
        console.log('InnerReflection: Starting experience...');
        
        // Hide start screen IMMEDIATELY for seamless transition
        // Don't show loading - preload should have everything ready
        this.hideStartScreen();
        this.startButton.disabled = true;
        
        try {
            // Wait for any remaining preload if needed (should be done by now)
            if (this.preloadPromise) {
                await this.preloadPromise;
            }
            
            // Request permissions and initialize inputs (this is the only blocking part)
            // Run in parallel with audio init for speed
            const [inputResults] = await Promise.all([
                this.initializeInputs(),
                this.audioEngine.init() // Finalize audio (starts context on user click)
            ]);
            
            // Check sound toggle
            const soundToggle = document.getElementById('toggle-sound');
            this.enabledInputs.sound = soundToggle ? soundToggle.checked : true;
            
            // Connect microphone to audio engine if enabled (fast, streams already obtained)
            if (this.enabledInputs.microphone && this.inputManager.enabled.microphone) {
                this.audioEngine.connectMicrophone(this.inputManager.micStream); // No await needed
            }
            
            // Start face tracking if camera is enabled (models preloaded)
            if (this.enabledInputs.camera && this.inputManager.enabled.camera && this.enabledInputs.faceTracking) {
                await this.startFaceTracking();
                
                // Set up face tracking callbacks
                this.faceTracker.onFaceDetected = (data) => {
                    console.log('Face detected');
                };
                
                this.faceTracker.onFaceLost = () => {
                    console.log('Face lost');
                };
            }
            
            this.setFaceOverlayVisible(true);
            
            if (this.enabledInputs.camera && this.inputManager.enabled.camera && this.enabledInputs.hands) {
                await this.startHandTracking();
            }
            
            this.setHandOverlayVisible(true);
            
            // Start the visual fade-in immediately
            // Start screen is already fading, so visuals can intensify right away
            this.visualEngine.startExperienceFade();
            
            // Handle fullscreen if requested
            const fullscreenToggle = document.getElementById('toggle-fullscreen');
            if (fullscreenToggle && fullscreenToggle.checked) {
                Utils.requestFullscreen();
            }
            
            // Show debug toggle button
            const debugToggle = document.getElementById('debug-toggle');
            if (debugToggle) {
                debugToggle.style.display = 'flex';
            }
            
            // Initialize debug controls
            this.setupDebugControls();
            
            // Start audio playback only if sound is enabled
            if (this.enabledInputs.sound) {
                this.audioEngine.start();
            }
            
            // Start main render loop
            this.isRunning = true;
            this.lastTime = performance.now();
            requestAnimationFrame(this.animate);
            
            console.log('InnerReflection: Experience started');
            console.log('🎹 Play keys A-Z and 0-9 like a piano to influence the visuals!');
            console.log('🖱️ Move mouse to control displacement center');
            
        } catch (error) {
            console.error('InnerReflection: Failed to start:', error);
            this.showError('Failed to start experience. Please refresh and try again.');
        }
    }
    
    async initializeInputs() {
        const results = {
            microphone: false,
            camera: false,
            accelerometer: false
        };
        
        // Request microphone
        if (this.enabledInputs.microphone) {
            results.microphone = await this.inputManager.requestMicrophone();
            this.updatePermissionUI('microphone', results.microphone);
        }
        
        // Request camera
        if (this.enabledInputs.camera) {
            results.camera = await this.inputManager.requestCamera();
            this.updatePermissionUI('camera', results.camera);
        }
        
        // Request accelerometer
        if (this.enabledInputs.accelerometer) {
            results.accelerometer = await this.inputManager.requestAccelerometer();
            this.updatePermissionUI('accelerometer', results.accelerometer);
        }
        
        console.log('InnerReflection: Input initialization results:', results);
        return results;
    }
    
    updatePermissionUI(permission, granted) {
        const toggle = document.querySelector(`[data-permission="${permission}"]`);
        if (!toggle) return;
        
        const status = toggle.querySelector('.toggle-status');
        
        if (granted) {
            toggle.classList.add('granted');
            toggle.classList.remove('denied');
            if (status) status.textContent = 'Active';
            if (status) status.classList.add('active');
        } else {
            toggle.classList.add('denied');
            toggle.classList.remove('granted');
            if (status) status.textContent = 'Denied';
            if (status) status.classList.remove('active');
        }
    }
    
    // =========================================
    // MAIN RENDER LOOP
    // =========================================
    
    animate(time) {
        if (!this.isRunning) return;
        
        // Calculate delta time
        const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1); // Cap at 100ms
        this.lastTime = time;
        this.updateAnimationSpeed();
        const scaledDelta = deltaTime * this.currentAnimSpeed;
        
        // Update FPS counter
        this.updateFPS(deltaTime);
        
        if (!this.isPaused) {
            // Update inputs
            this.inputManager.update();
            
            // Get input data
            const audioData = this.inputManager.getAudioData();
            const motionData = this.inputManager.getMotionData();
            const faceData = this.enabledInputs.faceTracking ? this.faceTracker.getFaceData() : { detected: false };
            const gestureData = this.inputManager.getGestureData();
            
            if (this.handTracker?.isRunning && this.inputManager.enabled.camera) {
                this.handTracker.processFrame(this.inputManager.getVideoElement());
            }
            
            // Feed inputs to state engine
            if (this.inputManager.enabled.microphone) {
                this.stateEngine.handleAudioInput(
                    audioData.volume,
                    audioData.bass,
                    audioData.mid,
                    audioData.treble
                );
                
                // Also feed audio to the audio engine for reactive sound
                if (this.enabledInputs.sound) {
                    this.audioEngine.handleMicInput(audioData);
                }
            }
            
            // Face tracking with rich features
            if (this.inputManager.enabled.camera && this.enabledInputs.faceTracking && faceData.detected) {
                // Basic position smoothing (legacy)
                this.updateFaceSmoothing(faceData, deltaTime);
                this.stateEngine.handleFacePositionSmooth(
                    this.faceSmoothing.pushX.value,
                    this.faceSmoothing.pushY.value,
                    this.faceSmoothing.pushSize.value
                );
                
                // Rich face features (Face Mesh) - head rotation, eyes, mouth, brows
                this.stateEngine.handleFaceFeatures(faceData);
                
                // Handle discrete events
                if (faceData.blinking) {
                    this.stateEngine.handleBlink();
                }
                if (faceData.talking !== this.wasTalking) {
                    this.stateEngine.handleTalking(faceData.talking);
                    this.wasTalking = faceData.talking;
                }
            } else {
                // Gradually decay push values when no face
                this.decayFaceSmoothing(deltaTime);
            }
            
            // Accelerometer
            if (this.inputManager.enabled.accelerometer) {
                this.stateEngine.handleMotion(motionData.tiltX, motionData.tiltY, motionData.shake);
            }
            
            // Touch gestures (pinch, rotate, swipe)
            if (gestureData.touchCount > 0 || gestureData.isPinching || gestureData.isRotating) {
                this.stateEngine.handleGestureInput(gestureData);
            }
            
            // Update state engine (drift, interpolation, connections)
            this.stateEngine.update(scaledDelta);
            
            // Get state for rendering
            const visualState = this.stateEngine.getVisualState();
            const audioState = this.stateEngine.getAudioState();
            this.applyManualVisualParams(visualState);
            const rawHandState = this.handTracker?.getHandState();
            const mergedHandState = this.composeHandState(rawHandState);
            if (mergedHandState) {
                visualState.hand = mergedHandState;
            }
            
            // Add vignetteShape from local slider
            visualState.vignetteShape = this.vignetteShape ?? 0.5;
            
            // Modulate audio engine (only if sound enabled)
            if (this.enabledInputs.sound) {
                this.audioEngine.modulateFromState(audioState);
                
                // Apply generative behaviors
                this.audioEngine.applySpeedDrift?.(scaledDelta);
                this.applyHandAudio(mergedHandState, deltaTime);
            }
            
            // Render visuals
            this.visualEngine.render(scaledDelta, visualState);
            
            // Draw face visualization overlay
            if (this.inputManager.enabled.camera) {
                if (this.showFaceOverlay) {
                    this.drawFaceOverlay(faceData);
                }
                if (this.showHandOverlay) {
                    this.drawHandOverlay(rawHandState);
                }
            }
            
            // Update debug FPS display and sliders
            if (this.frameCount % 30 === 0) {
                this.updateDebugFPS();
            }
            
            // Update sliders to reflect current state (every 10 frames for performance)
            if (this.frameCount % 10 === 0) {
                this.updateSlidersFromState();
            }
        }
        
        this.frameCount++;
        requestAnimationFrame(this.animate);
    }
    
    // =========================================
    // FACE VISUALIZATION OVERLAY
    // =========================================
    
    drawFaceOverlay(faceData) {
        if (!this.faceCtx || !this.faceOverlay) return;
        
        const ctx = this.faceCtx;
        const w = this.faceOverlay.width;
        const h = this.faceOverlay.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, w, h);
        
        // Draw subtle background border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);
        
        // Smoothing factor for face data persistence
        const smooth = 0.15; // Lower = smoother/slower transitions
        
        // Update last known face data with smooth interpolation
        if (faceData && faceData.detected) {
            this.lastFaceData.detected = true;
            // Smoothly interpolate all values toward current detection
            const keys = ['faceX', 'faceY', 'faceSize', 'headYaw', 'headPitch', 'headRoll',
                         'leftEyeOpen', 'rightEyeOpen', 'gazeX', 'gazeY',
                         'mouthOpen', 'mouthWidth', 'leftBrowRaise', 'rightBrowRaise', 'browFurrow',
                         'engagement', 'lookingAtScreen'];
            keys.forEach(key => {
                if (faceData[key] !== undefined && faceData[key] !== null) {
                    this.lastFaceData[key] += (faceData[key] - this.lastFaceData[key]) * smooth;
                }
            });
            // Copy boolean/transient values directly
            this.lastFaceData.talking = faceData.talking;
            this.lastFaceData.blinking = faceData.blinking;
        }
        
        // Use the smoothed/persisted face data for drawing
        const drawData = this.lastFaceData;

        if (faceData && Array.isArray(faceData.faces) && faceData.faces.length > 1) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            const moveRangeX = w * 0.28;
            const moveRangeY = h * 0.28;
            faceData.faces.forEach((face) => {
                const fx = 1 - (face.faceX ?? 0.5);
                const fy = face.faceY ?? 0.5;
                const cx = w / 2 + (fx - 0.5) * moveRangeX;
                const cy = h / 2 - 15 + (fy - 0.5) * moveRangeY;
                ctx.beginPath();
                ctx.arc(cx, cy, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        
        if (!drawData.detected) {
            // Draw "no face" indicator only if never detected
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.ellipse(w/2, h/2 - 15, 35, 45, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No face detected', w/2, h - 12);
            return;
        }
        
        // === FACE POSITION TRACKING ===
        // faceX: 0 = left side of camera, 1 = right side
        // Webcams are mirrored, so we flip X
        const mirroredX = 1 - drawData.faceX;
        const faceY = drawData.faceY;
        
        // Map face position to overlay canvas
        // Allow face to move within the overlay area
        const moveRangeX = 50; // pixels of movement range
        const moveRangeY = 40;
        const cx = w/2 + (mirroredX - 0.5) * moveRangeX;
        const cy = h/2 - 15 + (faceY - 0.5) * moveRangeY;
        
        // Face size for scaling (based on distance)
        const baseScale = 0.65 + drawData.faceSize * 0.5;
        const scale = Math.max(0.5, Math.min(1.0, baseScale));
        
        // === HEAD ROTATION ===
        // Yaw: turning head left/right - FLIP for mirror
        const yaw = -drawData.headYaw;
        // Pitch: tilting up/down
        const pitch = drawData.headPitch;
        // Roll: tilting head sideways - FLIP for mirror
        const roll = -drawData.headRoll;
        
        // Set line style
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.save();
        ctx.translate(cx, cy);
        
        // Apply roll rotation
        ctx.rotate(roll * 0.4);
        
        // === FACE OUTLINE ===
        // Squish face based on yaw (turning makes face narrower)
        const yawSquish = 1 - Math.abs(yaw) * 0.3;
        const faceW = 35 * scale * yawSquish;
        const faceH = 48 * scale;
        
        ctx.beginPath();
        ctx.ellipse(0, 0, faceW, faceH, 0, 0, Math.PI * 2);
        ctx.stroke();
        
        // Offset features based on yaw (turning)
        const yawOffset = yaw * 8 * scale;
        
        // === EYEBROWS ===
        const browY = -22 * scale - pitch * 5;
        const browW = 15 * scale * yawSquish;
        
        // Swap left/right brow data due to mirror - use smoothed drawData
        const leftBrowRaise = drawData.rightBrowRaise * 6 * scale;
        const rightBrowRaise = drawData.leftBrowRaise * 6 * scale;
        const browFurrow = drawData.browFurrow * 4 * scale;
        
        // Left eyebrow (viewer's left = person's right due to mirror)
        // Always show - no more hiding based on yaw
        {
            ctx.beginPath();
            const lbx = -14 * scale * yawSquish + yawOffset;
            ctx.moveTo(lbx - browW * 0.6, browY - leftBrowRaise + browFurrow);
            ctx.quadraticCurveTo(lbx, browY - leftBrowRaise - 3 * scale, lbx + browW * 0.4 - browFurrow, browY - leftBrowRaise/2);
            ctx.stroke();
        }
        
        // Right eyebrow - always show
        {
            ctx.beginPath();
            const rbx = 14 * scale * yawSquish + yawOffset;
            ctx.moveTo(rbx + browW * 0.6, browY - rightBrowRaise + browFurrow);
            ctx.quadraticCurveTo(rbx, browY - rightBrowRaise - 3 * scale, rbx - browW * 0.4 + browFurrow, browY - rightBrowRaise/2);
            ctx.stroke();
        }
        
        // === EYES ===
        const eyeY = -10 * scale - pitch * 3;
        const eyeSpacing = 14 * scale * yawSquish;
        const eyeW = 8 * scale * yawSquish;
        const eyeH = 5 * scale;
        
        // Swap eye openness due to mirror - use smoothed drawData
        const leftEyeOpen = Math.max(0.15, drawData.rightEyeOpen);
        const rightEyeOpen = Math.max(0.15, drawData.leftEyeOpen);
        
        // Gaze direction - flip X for mirror - use smoothed drawData
        const gazeX = -drawData.gazeX * 2.5 * scale;
        const gazeY = drawData.gazeY * 2 * scale;
        
        // Left eye - always show
        {
            const lex = -eyeSpacing + yawOffset;
            ctx.beginPath();
            ctx.ellipse(lex, eyeY, eyeW, eyeH * leftEyeOpen, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            // Left pupil
            if (leftEyeOpen > 0.25) {
                ctx.beginPath();
                ctx.arc(lex + gazeX, eyeY + gazeY * leftEyeOpen, 2 * scale, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fill();
            }
        }
        
        // Right eye - always show
        {
            const rex = eyeSpacing + yawOffset;
            ctx.beginPath();
            ctx.ellipse(rex, eyeY, eyeW, eyeH * rightEyeOpen, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            // Right pupil
            if (rightEyeOpen > 0.25) {
                ctx.beginPath();
                ctx.arc(rex + gazeX, eyeY + gazeY * rightEyeOpen, 2 * scale, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fill();
            }
        }
        
        // === NOSE ===
        const noseY = 5 * scale - pitch * 2;
        ctx.beginPath();
        ctx.moveTo(yawOffset, -4 * scale);
        ctx.lineTo(yawOffset - 3 * scale + yaw * 2, noseY);
        ctx.lineTo(yawOffset, noseY + 3 * scale);
        ctx.lineTo(yawOffset + 3 * scale + yaw * 2, noseY);
        ctx.stroke();
        
        // === MOUTH ===
        const mouthY = 20 * scale - pitch * 2;
        const mouthBaseW = 10 * scale * yawSquish;
        const mouthW = mouthBaseW + drawData.mouthWidth * 8 * scale * yawSquish;
        const mouthOpen = drawData.mouthOpen * 25 * scale; // Increased multiplier for more visible opening
        
        // Upper lip
        ctx.beginPath();
        ctx.moveTo(-mouthW + yawOffset, mouthY);
        ctx.quadraticCurveTo(yawOffset, mouthY - 2 * scale, mouthW + yawOffset, mouthY);
        ctx.stroke();
        
        // Lower lip
        ctx.beginPath();
        ctx.moveTo(-mouthW + yawOffset, mouthY);
        ctx.quadraticCurveTo(yawOffset, mouthY + 2 * scale + mouthOpen, mouthW + yawOffset, mouthY);
        ctx.stroke();
        
        // Mouth interior (if open)
        if (mouthOpen > 1.5) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.ellipse(yawOffset, mouthY + mouthOpen/2, mouthW * 0.65, mouthOpen/2.5, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
        
        // === STATUS INDICATORS ===
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        
        let statusX = 5;
        const statusY = h - 20;
        
        if (drawData.talking) {
            ctx.fillText('💬', statusX, statusY);
            statusX += 20;
        }
        if (drawData.blinking) {
            ctx.fillText('😑', statusX, statusY);
            statusX += 20;
        }
        if (drawData.lookingAtScreen > 0.6) {
            ctx.fillText('👁', statusX, statusY);
            statusX += 20;
        }
        
        // Engagement bar
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(5, h - 8, w - 10, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        const engagement = Math.max(0, Math.min(1, drawData.engagement));
        ctx.fillRect(5, h - 8, (w - 10) * engagement, 4);
    }

    // =========================================
    // HAND VISUALIZATION OVERLAY
    // =========================================
    
    drawHandOverlay(handState) {
        if (!this.handCtx || !this.handOverlay || !this.handOverlayWrap) return;
        
        const ctx = this.handCtx;
        const w = this.handOverlay.width;
        const h = this.handOverlay.height;
        
        ctx.clearRect(0, 0, w, h);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);
        
        const visibility = handState?.visibility ?? 0;
        const baseOpacity = this.showHandOverlay ? 0.35 : 0;
        const finalOpacity = Utils.clamp(baseOpacity + visibility * 0.65, 0, 1);
        this.handOverlayWrap.style.opacity = `${finalOpacity}`;
        
        if (!handState || handState.count === 0 || !handState.landmarks?.length) return;
        
        for (let i = 0; i < handState.count; i++) {
            const landmarks = handState.landmarks[i];
            if (!landmarks) continue;
            
            const palmFacing = handState.palmFacing?.[i];
            const strokeColor = palmFacing ? 'rgba(140, 255, 220, 0.8)' : 'rgba(255, 255, 255, 0.65)';
            ctx.strokeStyle = strokeColor;
            ctx.fillStyle = strokeColor;
            ctx.lineWidth = 1.2;
            
            HAND_CONNECTIONS.forEach(([a, b]) => {
                const pa = landmarks[a];
                const pb = landmarks[b];
                if (!pa || !pb) return;
                const ax = (1 - pa.x) * w;
                const ay = pa.y * h;
                const bx = (1 - pb.x) * w;
                const by = pb.y * h;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(bx, by);
                ctx.stroke();
            });
            
            const tips = [4, 8, 12, 16, 20];
            tips.forEach((idx) => {
                const p = landmarks[idx];
                if (!p) return;
                const x = (1 - p.x) * w;
                const y = p.y * h;
                ctx.beginPath();
                ctx.arc(x, y, 2.8, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }
    
    // =========================================
    // FACE TRACKING SMOOTHING
    // Heavy smoothing with spring physics to prevent flickering
    // =========================================
    
    updateFaceSmoothing(faceData, deltaTime) {
        // Spring constants for responsive motion
        const stiffness = 1.7;
        const damping = 0.82;
        const pushRate = 0.2;
        
        // Update smoothed position targets
        this.faceSmoothing.x.target = faceData.faceX ?? faceData.x ?? 0.5;
        this.faceSmoothing.y.target = faceData.faceY ?? faceData.y ?? 0.5;
        this.faceSmoothing.size.target = faceData.faceSize ?? faceData.size ?? 0.3;
        
        // Apply spring physics to position
        ['x', 'y', 'size'].forEach(key => {
            const smooth = this.faceSmoothing[key];
            const diff = smooth.target - smooth.value;
            smooth.velocity += diff * stiffness * deltaTime * 60;
            smooth.velocity *= damping;
            smooth.value += smooth.velocity * deltaTime * 60;
        });
        
        // Calculate push amounts - difference from center, heavily smoothed
        // X: left/right of center affects certain parameters
        const yawBoost = faceData.headYaw ?? 0;
        const pitchBoost = faceData.headPitch ?? 0;
        const xOffset = (this.faceSmoothing.x.value - 0.5) * 2 + yawBoost * 0.8; // -1 to 1
        const yOffset = (this.faceSmoothing.y.value - 0.5) * 2 + pitchBoost * 0.6; // -1 to 1  
        const sizeOffset = (this.faceSmoothing.size.value - 0.3) * 2; // roughly -0.6 to 1.4
        
        // Smoothly push towards target push values
        this.faceSmoothing.pushX.value += (xOffset - this.faceSmoothing.pushX.value) * pushRate;
        this.faceSmoothing.pushY.value += (yOffset - this.faceSmoothing.pushY.value) * pushRate;
        this.faceSmoothing.pushSize.value += (sizeOffset - this.faceSmoothing.pushSize.value) * pushRate;
    }
    
    decayFaceSmoothing(deltaTime) {
        // Slowly decay push values back to zero when no face detected
        const decayRate = 0.02;
        
        this.faceSmoothing.pushX.value *= (1 - decayRate);
        this.faceSmoothing.pushY.value *= (1 - decayRate);
        this.faceSmoothing.pushSize.value *= (1 - decayRate);
        
        // Also smoothly return to center
        this.faceSmoothing.x.target = 0.5;
        this.faceSmoothing.y.target = 0.5;
        this.faceSmoothing.size.target = 0.3;
        
        ['x', 'y', 'size'].forEach(key => {
            const smooth = this.faceSmoothing[key];
            const diff = smooth.target - smooth.value;
            smooth.velocity += diff * 0.3 * deltaTime * 60;
            smooth.velocity *= 0.95;
            smooth.value += smooth.velocity * deltaTime * 60;
        });
    }
    
    updateFPS(deltaTime) {
        const fps = 1 / deltaTime;
        this.fpsHistory.push(fps);
        
        if (this.fpsHistory.length > 60) {
            this.fpsHistory.shift();
        }
        
        this.fps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    }
    
    // =========================================
    // UI HELPERS
    // =========================================
    
    hideStartScreen() {
        this.startScreen.classList.add('hidden');
    }
    
    showStartScreen() {
        this.startScreen.classList.remove('hidden');
    }
    
    showLoading(show) {
        this.loadingScreen.style.display = show ? 'flex' : 'none';
    }
    
    showError(message) {
        alert(message);
    }
    
    // =========================================
    // KEYBOARD CONTROLS - Like a piano!
    // =========================================
    
    handleKeydown(e) {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Tab key - always allow for settings toggle (even on start screen)
        if (e.key === 'Tab') {
            e.preventDefault(); // Prevent default tab behavior
            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel) {
                debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
            }
            return;
        }
        
        // Allow Enter to start experience from start screen
        if (!this.startScreen.classList.contains('hidden')) {
            if (e.key === 'Enter') {
                this.start();
            }
            return; // Don't process other keys while start screen is visible
        }
        
        const key = e.key.toLowerCase();
        
        // System controls (not passed to state engine)
        switch (key) {
            case 'escape':
                // Toggle pause
                this.isPaused = !this.isPaused;
                console.log(`InnerReflection: ${this.isPaused ? 'Paused' : 'Resumed'}`);
                return;
                
            case 'f':
                // Toggle fullscreen (only with ctrl/cmd)
                if (e.ctrlKey || e.metaKey) {
                    if (document.fullscreenElement) {
                        Utils.exitFullscreen();
                    } else {
                        Utils.requestFullscreen();
                    }
                    return;
                }
                break;
                
            case 'd':
            case 's':  // S for Settings
                // Toggle debug panel
                const debugPanel = document.getElementById('debug-panel');
                if (debugPanel) {
                    debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
                }
                return;
                
            case 'g':
                // Toggle focus mode (concentrated portal)
                const currentFocus = this.stateEngine.focusMode.active;
                this.stateEngine.setFocusMode(!currentFocus, Utils.random(0.6, 1.0));
                return;
        }
        
        // Pass all other keys to state engine (piano-like input)
        this.stateEngine.handleKeyPress(key);
    }
    
    handleKeyup(e) {
        // Could be used for key release effects in future
    }
    
    handleMouseMove(e) {
        if (!this.isRunning) return;
        
        // Normalize mouse position to 0-1
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        
        // Feed to state engine (affects displacement center and more)
        this.stateEngine.handleMouseMove(x, y);
    }

    setupPointerHand() {
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        
        document.addEventListener('mousedown', this.handlePointerDown);
        document.addEventListener('mousemove', this.handlePointerMove);
        document.addEventListener('mouseup', this.handlePointerUp);
        document.addEventListener('touchstart', this.handlePointerDown, { passive: false });
        document.addEventListener('touchmove', this.handlePointerMove, { passive: false });
        document.addEventListener('touchend', this.handlePointerUp, { passive: true });
        document.addEventListener('touchcancel', this.handlePointerUp, { passive: true });
    }

    handlePointerDown(e) {
        if (!this.shouldHandlePointer(e)) return;
        const point = this.getPointerFromEvent(e);
        if (!point) return;
        this.pointerHand.active = true;
        this.updatePointerHand(point.x, point.y, point.time);
    }

    handlePointerMove(e) {
        if (!this.pointerHand.active) return;
        const point = this.getPointerFromEvent(e);
        if (!point) return;
        this.updatePointerHand(point.x, point.y, point.time);
    }

    handlePointerUp() {
        if (!this.pointerHand.active) return;
        this.pointerHand.active = false;
        this.pointerHand.vx = 0;
        this.pointerHand.vy = 0;
    }

    shouldHandlePointer(e) {
        const target = e.target;
        if (target && target.closest) {
            if (target.closest('#debug-panel')) return false;
            if (target.closest('#start-screen')) return false;
        }
        return true;
    }

    getPointerFromEvent(e) {
        const time = performance.now();
        if (e.touches && e.touches.length > 0) {
            const touch = e.touches[0];
            const point = this.normalizeClientPoint(touch.clientX, touch.clientY);
            return point ? { ...point, time } : null;
        }
        if (typeof e.clientX === 'number') {
            const point = this.normalizeClientPoint(e.clientX, e.clientY);
            return point ? { ...point, time } : null;
        }
        return null;
    }

    normalizeClientPoint(clientX, clientY) {
        if (!this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        const x = Utils.clamp((clientX - rect.left) / rect.width, 0, 1);
        const y = Utils.clamp((clientY - rect.top) / rect.height, 0, 1);
        return { x, y };
    }

    updatePointerHand(x, y, time) {
        const lastTime = this.pointerHand.lastTime || time;
        const dt = Math.max(0.016, (time - lastTime) / 1000);
        const vx = (x - this.pointerHand.lastX) / dt;
        const vy = (y - this.pointerHand.lastY) / dt;
        
        this.pointerHand.x = x;
        this.pointerHand.y = y;
        this.pointerHand.vx = Utils.clamp(vx, -1.5, 1.5);
        this.pointerHand.vy = Utils.clamp(vy, -1.5, 1.5);
        this.pointerHand.lastX = x;
        this.pointerHand.lastY = y;
        this.pointerHand.lastTime = time;
    }
    
    // =========================================
    // DEBUG
    // =========================================
    
    updateDebug(audioData, faceData, motionData, visualState) {
        const debugContent = document.getElementById('debug-content');
        if (!debugContent) return;
        
        const info = {
            fps: this.fps.toFixed(1),
            state: {
                intensity: visualState.overallIntensity.toFixed(3),
                hue1: visualState.colorHue1.toFixed(3),
                hue2: visualState.colorHue2.toFixed(3),
                breathing: visualState.breathingRate.toFixed(3)
            },
            audio: {
                volume: audioData.volume.toFixed(3),
                bass: audioData.bass.toFixed(3)
            },
            face: faceData.detected ? {
                x: faceData.x.toFixed(3),
                y: faceData.y.toFixed(3)
            } : 'Not detected'
        };
        
        debugContent.innerHTML = `<pre>${JSON.stringify(info, null, 2)}</pre>`;
    }
    
    // =========================================
    // DEBUG CONTROLS & PRESETS
    // =========================================
    
    setupDebugControls() {
        if (this.debugControlsInitialized) {
            const cameraToggle = document.getElementById('ctrl-camera-enabled');
            const faceToggle = document.getElementById('ctrl-face-enabled');
            const faceVisualToggle = document.getElementById('ctrl-face-visualizer');
            const handToggle = document.getElementById('ctrl-hand-enabled');
            const handVisualToggle = document.getElementById('ctrl-hand-visualizer');
            const maxFacesSlider = document.getElementById('ctrl-maxFaces');
            const maxFacesValue = document.getElementById('val-maxFaces');
            if (cameraToggle) cameraToggle.checked = this.enabledInputs.camera;
            if (faceToggle) faceToggle.checked = this.enabledInputs.faceTracking;
            if (faceVisualToggle) faceVisualToggle.checked = this.showFaceOverlay;
            if (handToggle) handToggle.checked = this.enabledInputs.hands;
            if (handVisualToggle) handVisualToggle.checked = this.showHandOverlay;
            if (maxFacesSlider) {
                maxFacesSlider.value = this.faceTracker?.maxFaces ?? 2;
                if (maxFacesValue) {
                    maxFacesValue.textContent = maxFacesSlider.value;
                }
            }
            this.syncLockedSlidersUI();
            this.applyColumnState();
            return;
        }
        this.debugControlsInitialized = true;

        const debugPanel = document.getElementById('debug-panel');
        const debugToggle = document.getElementById('debug-toggle');
        const debugClose = document.getElementById('debug-close');
        const soundToggle = document.getElementById('sound-toggle');
        const muteCheckbox = document.getElementById('ctrl-mute');
        const cameraToggle = document.getElementById('ctrl-camera-enabled');
        const faceToggle = document.getElementById('ctrl-face-enabled');
        const faceVisualToggle = document.getElementById('ctrl-face-visualizer');
        const handToggle = document.getElementById('ctrl-hand-enabled');
        const handVisualToggle = document.getElementById('ctrl-hand-visualizer');
        const maxFacesSlider = document.getElementById('ctrl-maxFaces');
        const maxFacesValue = document.getElementById('val-maxFaces');
        const applyMuteState = (muted) => {
            this.isMuted = muted;
            if (soundToggle) {
                const stateEl = soundToggle.querySelector('.sound-toggle-state');
                if (stateEl) {
                    stateEl.textContent = this.isMuted ? 'Muted' : 'On';
                }
                soundToggle.classList.toggle('muted', this.isMuted);
            }
            if (muteCheckbox) {
                muteCheckbox.checked = this.isMuted;
            }
            this.audioEngine?.setMuted(this.isMuted);
        };
        const sliderRamp = (fast, slow = 0.2, fastTime = 0.03) => (fast ? fastTime : slow);
        
        // Toggle debug panel
        if (debugToggle) {
            debugToggle.addEventListener('click', () => {
                debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
            });
        }
        
        // Close debug panel
        if (debugClose) {
            debugClose.addEventListener('click', () => {
                debugPanel.style.display = 'none';
            });
        }
        
        // Sound on/off toggle
        if (soundToggle) {
            soundToggle.addEventListener('click', () => {
                applyMuteState(!this.isMuted);
            });
        }
        applyMuteState(this.isMuted);

        if (cameraToggle) {
            cameraToggle.checked = this.enabledInputs.camera;
            cameraToggle.addEventListener('change', (e) => {
                this.toggleCamera(e.target.checked);
            });
        }

        if (faceToggle) {
            faceToggle.checked = this.enabledInputs.faceTracking;
            faceToggle.addEventListener('change', (e) => {
                this.toggleFaceTracking(e.target.checked);
            });
        }

        if (faceVisualToggle) {
            faceVisualToggle.checked = this.showFaceOverlay;
            faceVisualToggle.addEventListener('change', (e) => {
                this.showFaceOverlay = e.target.checked;
                this.setFaceOverlayVisible(true);
            });
        }
        
        if (handToggle) {
            handToggle.checked = this.enabledInputs.hands;
            handToggle.addEventListener('change', (e) => {
                this.toggleHandTracking(e.target.checked);
            });
        }

        if (handVisualToggle) {
            handVisualToggle.checked = this.showHandOverlay;
            handVisualToggle.addEventListener('change', (e) => {
                this.showHandOverlay = e.target.checked;
                this.setHandOverlayVisible(true);
            });
        }

        if (maxFacesSlider) {
            maxFacesSlider.value = this.faceTracker?.maxFaces ?? 2;
            if (maxFacesValue) {
                maxFacesValue.textContent = maxFacesSlider.value;
            }
            maxFacesSlider.addEventListener('input', (e) => {
                const count = parseInt(e.target.value, 10);
                if (maxFacesValue) {
                    maxFacesValue.textContent = count.toString();
                }
                this.faceTracker?.setMaxFaces(count);
            });
        }
        
        // Setup preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const preset = e.target.dataset.preset;
                this.applyPreset(preset);
                
                // Update active state
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        // Setup sliders
        this.setupStateSlider('ctrl-hue1', 'val-hue1', 'colorHue1');
        this.setupStateSlider('ctrl-hue2', 'val-hue2', 'colorHue2');
        this.setupStateSlider('ctrl-hue3', 'val-hue3', 'colorHue3');
        this.setupStateSlider('ctrl-hue4', 'val-hue4', 'colorHue4');
        this.setupStateSlider('ctrl-saturation', 'val-saturation', 'colorSaturation');
        this.setupStateSlider('ctrl-brightness', 'val-brightness', 'colorBrightness');
        
        this.setupStateSlider('ctrl-strength', 'val-strength', 'displacementStrength');
        this.setupStateSlider('ctrl-radius', 'val-radius', 'displacementRadius');
        this.setupStateSlider('ctrl-rings', 'val-rings', 'displacementRings', 20);
        this.setupStateSlider('ctrl-centerX', 'val-centerX', 'displacementX');
        this.setupStateSlider('ctrl-centerY', 'val-centerY', 'displacementY');
        this.setupStateSlider('ctrl-chromatic', 'val-chromatic', 'displacementChromatic', 0.1);
        this.setupStateSlider('ctrl-wobble', 'val-wobble', 'displacementWobble', 0.1);
        
        this.setupStateSlider('ctrl-circle2', 'val-circle2', 'rippleOrigin2Strength', 0.5);
        this.setupStateSlider('ctrl-circle3', 'val-circle3', 'rippleOrigin3Strength', 0.5);
        
        this.setupStateSlider('ctrl-morph', 'val-morph', 'morphProgress');
        this.setupStateSlider('ctrl-morphType', 'val-morphType', 'morphType', 2);
        
        // Shape & Wave Motion controls
        this.setupStateSlider('ctrl-shapeType', 'val-shapeType', 'shapeType', 11);
        this.setupStateSlider('ctrl-waveDelay', 'val-waveDelay', 'waveDelay', 2);
        this.setupStateSlider('ctrl-waveAmplitude', 'val-waveAmplitude', 'waveAmplitude', 0.3);
        this.setupStateSlider('ctrl-waveSpeed', 'val-waveSpeed', 'waveSpeed', 3);
        this.setupStateSlider('ctrl-edgeSharpness', 'val-edgeSharpness', 'edgeSharpness', 0.3);
        this.setupStateSlider('ctrl-minRadius', 'val-minRadius', 'minRadius', 0.5);
        this.setupStateSlider('ctrl-rotation', 'val-rotation', 'shapeRotation', 6.28);
        this.setupStateSlider('ctrl-rotationSpeed', 'val-rotationSpeed', 'rotationSpeed');
        this.setupStateSlider('ctrl-foldAmount', 'val-foldAmount', 'foldAmount');
        this.setupStateSlider('ctrl-invertAmount', 'val-invertAmount', 'invertAmount');
        this.setupStateSlider('ctrl-secondaryWave', 'val-secondaryWave', 'secondaryWave');
        this.setupStateSlider('ctrl-tertiaryWave', 'val-tertiaryWave', 'tertiaryWave');
        
        this.setupStateSlider('ctrl-blur', 'val-blur', 'blur', 2);
        this.setupStateSlider('ctrl-glow', 'val-glow', 'glow');
        this.setupStateSlider('ctrl-vignette', 'val-vignette', 'vignette');
        this.registerManualSlider('ctrl-vignetteShape', 'vignetteShape');
        this.setupSlider('ctrl-vignetteShape', 'val-vignetteShape', (v) => { this.vignetteShape = v; });
        
        // Brightness evolution control
        this.setupStateSlider('ctrl-brightnessEvolution', 'val-brightnessEvolution', 'brightnessEvolution');
        this.setupAnimationSpeedRange('ctrl-animSpeedMin', 'ctrl-animSpeedMax', 'val-animationSpeed');
        
        // =========================================
        // MANUAL VISUAL CONTROLS
        // =========================================
        
        this.registerManualSlider('ctrl-ringDelay', 'ringDelay');
        this.setupSlider('ctrl-ringDelay', 'val-ringDelay', (v) => { this.manualVisual.ringDelay = v; });
        this.registerManualSlider('ctrl-ringOverlayStrength', 'ringOverlayStrength');
        this.setupSlider('ctrl-ringOverlayStrength', 'val-ringOverlayStrength', (v) => { this.manualVisual.ringOverlayStrength = v; });
        this.registerManualSlider('ctrl-ringOverlayWidth', 'ringOverlayWidth');
        this.setupSlider('ctrl-ringOverlayWidth', 'val-ringOverlayWidth', (v) => { this.manualVisual.ringOverlayWidth = v; });
        
        this.registerManualSlider('ctrl-parallelStrength', 'parallelStrength');
        this.setupSlider('ctrl-parallelStrength', 'val-parallelStrength', (v) => { this.manualVisual.parallelStrength = v; });
        this.registerManualSlider('ctrl-parallelPresence', 'parallelPresence');
        this.setupSlider('ctrl-parallelPresence', 'val-parallelPresence', (v) => { this.manualVisual.parallelPresence = v; });
        this.registerManualSlider('ctrl-parallelZoom', 'parallelZoom');
        this.setupSlider('ctrl-parallelZoom', 'val-parallelZoom', (v) => { this.manualVisual.parallelZoom = v; });
        this.registerManualSlider('ctrl-parallelZoomDrift', 'parallelZoomDrift');
        this.setupSlider('ctrl-parallelZoomDrift', 'val-parallelZoomDrift', (v) => { this.manualVisual.parallelZoomDrift = v; });
        this.registerManualSlider('ctrl-parallelThickness', 'parallelThickness');
        this.setupSlider('ctrl-parallelThickness', 'val-parallelThickness', (v) => { this.manualVisual.parallelThickness = v; });
        this.registerManualSlider('ctrl-parallelSpin', 'parallelSpin');
        this.setupSlider('ctrl-parallelSpin', 'val-parallelSpin', (v) => { this.manualVisual.parallelSpin = v; });
        
        this.registerManualSlider('ctrl-blobCount', 'blobCount');
        this.setupSlider('ctrl-blobCount', 'val-blobCount', (v) => {
            this.manualVisual.blobCount = Math.round(v);
        }, (v) => Math.round(v).toString());
        this.registerManualSlider('ctrl-blobSpread', 'blobSpread');
        this.setupSlider('ctrl-blobSpread', 'val-blobSpread', (v) => { this.manualVisual.blobSpread = v; });
        this.registerManualSlider('ctrl-blobScale', 'blobScale');
        this.setupSlider('ctrl-blobScale', 'val-blobScale', (v) => { this.manualVisual.blobScale = v; });
        this.registerManualSlider('ctrl-blobMotion', 'blobMotion');
        this.setupSlider('ctrl-blobMotion', 'val-blobMotion', (v) => { this.manualVisual.blobMotion = v; });
        this.registerManualSlider('ctrl-blobBlur', 'blobBlur');
        this.setupSlider('ctrl-blobBlur', 'val-blobBlur', (v) => { this.manualVisual.blobBlur = v; });
        this.registerManualSlider('ctrl-blobSmear', 'blobSmear');
        this.setupSlider('ctrl-blobSmear', 'val-blobSmear', (v) => { this.manualVisual.blobSmear = v; });
        this.registerManualSlider('ctrl-blobLighten', 'blobLighten');
        this.setupSlider('ctrl-blobLighten', 'val-blobLighten', (v) => { this.manualVisual.blobLighten = v; });
        this.registerManualSlider('ctrl-blobInvert', 'blobInvert');
        this.setupSlider('ctrl-blobInvert', 'val-blobInvert', (v) => { this.manualVisual.blobInvert = v; });
        this.registerManualSlider('ctrl-blobFade', 'blobFade');
        this.setupSlider('ctrl-blobFade', 'val-blobFade', (v) => { this.manualVisual.blobFade = v; });
        this.registerManualSlider('ctrl-blobWarp', 'blobWarp');
        this.setupSlider('ctrl-blobWarp', 'val-blobWarp', (v) => { this.manualVisual.blobWarp = v; });
        this.registerManualSlider('ctrl-blobOffsetX', 'blobOffsetX');
        this.setupSlider('ctrl-blobOffsetX', 'val-blobOffsetX', (v) => { this.manualVisual.blobOffsetX = v; });
        this.registerManualSlider('ctrl-blobOffsetY', 'blobOffsetY');
        this.setupSlider('ctrl-blobOffsetY', 'val-blobOffsetY', (v) => { this.manualVisual.blobOffsetY = v; });
        
        // =========================================
        // AUDIO CONTROLS - Master
        // =========================================
        
        this.setupSlider('ctrl-volume', 'val-volume', (v, fast) => {
            if (this.audioEngine && this.audioEngine.masterGain) {
                // Mark as manual control so modulateFromState won't override
                this.audioEngine.manualControl.masterVolume = true;
                // Convert 0-1 slider to dB range (-60 to +6 dB)
                const db = v === 0 ? -Infinity : -60 + v * 66;
                this.audioEngine.setMasterVolume(db, sliderRamp(fast, 0.15, 0.02));
            }
        });
        this.setupSlider('ctrl-reverb', 'val-reverb', (v, fast) => {
            if (this.audioEngine && this.audioEngine.effects && this.audioEngine.effects.reverb) {
                // Mark as manual control
                this.audioEngine.manualControl.masterReverb = true;
                this.audioEngine.effects.reverb.wet.rampTo(v, sliderRamp(fast, 0.2, 0.03));
            }
        });
        this.setupSlider('ctrl-masterDelay', 'val-masterDelay', (v, fast) => {
            if (this.audioEngine && this.audioEngine.effects && this.audioEngine.effects.delay) {
                // Mark as manual control
                this.audioEngine.manualControl.masterDelay = true;
                this.audioEngine.effects.delay.wet.rampTo(v, sliderRamp(fast, 0.2, 0.03));
            }
        });
        this.setupSlider('ctrl-masterFilter', 'val-masterFilter', (v, fast) => {
            if (this.audioEngine && this.audioEngine.masterFilter) {
                // Mark as manual control
                this.audioEngine.manualControl.masterFilter = true;
                this.audioEngine.masterFilter.frequency.rampTo(v, sliderRamp(fast, 0.25, 0.05));
            }
        });
        
        // Mute checkbox
        if (muteCheckbox) {
            muteCheckbox.addEventListener('change', (e) => {
                applyMuteState(e.target.checked);
            });
        }
        
        // =========================================
        // AUDIO CONTROLS - Drone Layers
        // =========================================
        
        this.setupDroneToggle('ctrl-drone-base', 'base');
        this.setupDroneToggle('ctrl-drone-mid', 'mid');
        this.setupDroneToggle('ctrl-drone-high', 'high');
        this.setupDroneToggle('ctrl-drone-pad', 'pad');
        
        // Drone volume sliders - call audioEngine directly for immediate effect
        // Also set manual control flag to prevent modulateFromState override
        this.setupSlider('ctrl-droneBase', 'val-droneBase', (v, fast) => {
            if (this.audioEngine) {
                this.audioEngine.manualControl.droneBaseVolume = true;
                this.audioEngine.setDroneVolume('base', v, sliderRamp(fast, 0.15, 0.03));
            }
        });
        this.setupSlider('ctrl-droneBaseFilter', 'val-droneBaseFilter', (v, fast) => {
            if (this.audioEngine) {
                this.audioEngine.manualControl.droneBaseFilter = true;
                this.audioEngine.setDroneFilter('base', v, sliderRamp(fast, 0.2, 0.05));
            }
        });
        this.setupSlider('ctrl-droneMid', 'val-droneMid', (v, fast) => {
            if (this.audioEngine) {
                this.audioEngine.manualControl.droneMidVolume = true;
                this.audioEngine.setDroneVolume('mid', v, sliderRamp(fast, 0.15, 0.03));
            }
        });
        this.setupSlider('ctrl-droneMidFilter', 'val-droneMidFilter', (v, fast) => {
            if (this.audioEngine) {
                this.audioEngine.manualControl.droneMidFilter = true;
                this.audioEngine.setDroneFilter('mid', v, sliderRamp(fast, 0.2, 0.05));
            }
        });
        this.setupSlider('ctrl-droneHigh', 'val-droneHigh', (v, fast) => {
            if (this.audioEngine) {
                this.audioEngine.manualControl.droneHighVolume = true;
                this.audioEngine.setDroneVolume('high', v, sliderRamp(fast, 0.15, 0.03));
            }
        });
        this.setupSlider('ctrl-droneHighFilter', 'val-droneHighFilter', (v, fast) => {
            if (this.audioEngine) {
                this.audioEngine.manualControl.droneHighFilter = true;
                this.audioEngine.setDroneFilter('high', v, sliderRamp(fast, 0.2, 0.05));
            }
        });
        this.setupSlider('ctrl-dronePad', 'val-dronePad', (v, fast) => {
            // Pad volume is direct control (not in state system)
            this.audioEngine?.setDroneVolume('pad', v, sliderRamp(fast, 0.15, 0.03));
        });
        
        // =========================================
        // AUDIO CONTROLS - Granular Layers
        // =========================================
        
        // Granular layer toggles
        this.setupGranularToggle('ctrl-gran-ambient', 'ambient');
        this.setupGranularToggle('ctrl-gran-choppy', 'choppy');
        this.setupGranularToggle('ctrl-gran-shimmer', 'shimmer');
        this.setupGranularToggle('ctrl-gran-deep', 'deep');
        
        // Ambient layer controls
        this.setupSlider('ctrl-granAmbientVol', 'val-granAmbientVol', (v, fast) => {
            this.audioEngine?.setGranularParam('ambient', 'volume', v, sliderRamp(fast, 0.15, 0.03));
        });
        this.setupSlider('ctrl-granAmbientSize', 'val-granAmbientSize', (v, fast) => {
            this.audioEngine?.setGranularParam('ambient', 'grainSize', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granAmbientOverlap', 'val-granAmbientOverlap', (v, fast) => {
            this.audioEngine?.setGranularParam('ambient', 'overlap', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granAmbientSpeed', 'val-granAmbientSpeed', (v, fast) => {
            this.audioEngine?.setGranularParam('ambient', 'playbackRate', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granAmbientFilter', 'val-granAmbientFilter', (v, fast) => {
            this.audioEngine?.setGranularParam('ambient', 'filterFreq', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granAmbientReverb', 'val-granAmbientReverb', (v, fast) => {
            this.audioEngine?.setGranularParam('ambient', 'reverbWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granAmbientDelay', 'val-granAmbientDelay', (v, fast) => {
            this.audioEngine?.setGranularParam('ambient', 'delayWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granAmbientDelayTime', 'val-granAmbientDelayTime', (v, fast) => {
            this.audioEngine?.setGranularParam('ambient', 'delayTime', v, sliderRamp(fast, 0.25, 0.05));
        });
        
        // Choppy layer controls
        this.setupSlider('ctrl-granChoppyVol', 'val-granChoppyVol', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'volume', v, sliderRamp(fast, 0.15, 0.03));
        });
        this.setupSlider('ctrl-granChoppySize', 'val-granChoppySize', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'grainSize', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granChoppyOverlap', 'val-granChoppyOverlap', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'overlap', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granChoppySpeed', 'val-granChoppySpeed', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'playbackRate', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granChoppyFilter', 'val-granChoppyFilter', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'filterFreq', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granChoppyQ', 'val-granChoppyQ', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'filterQ', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granChoppyReverb', 'val-granChoppyReverb', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'reverbWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granChoppyDelay', 'val-granChoppyDelay', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'delayWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granChoppyDelayTime', 'val-granChoppyDelayTime', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'delayTime', v, sliderRamp(fast, 0.25, 0.05));
        });
        this.setupSlider('ctrl-granChoppyRandom', 'val-granChoppyRandom', (v, fast) => {
            this.audioEngine?.setGranularParam('choppy', 'randomness', v, sliderRamp(fast, 0.2, 0.05));
        });
        
        // Shimmer layer controls
        this.setupSlider('ctrl-granShimmerVol', 'val-granShimmerVol', (v, fast) => {
            this.audioEngine?.setGranularParam('shimmer', 'volume', v, sliderRamp(fast, 0.15, 0.03));
        });
        this.setupSlider('ctrl-granShimmerSize', 'val-granShimmerSize', (v, fast) => {
            this.audioEngine?.setGranularParam('shimmer', 'grainSize', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granShimmerOverlap', 'val-granShimmerOverlap', (v, fast) => {
            this.audioEngine?.setGranularParam('shimmer', 'overlap', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granShimmerSpeed', 'val-granShimmerSpeed', (v, fast) => {
            this.audioEngine?.setGranularParam('shimmer', 'playbackRate', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granShimmerFilter', 'val-granShimmerFilter', (v, fast) => {
            this.audioEngine?.setGranularParam('shimmer', 'filterFreq', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granShimmerReverb', 'val-granShimmerReverb', (v, fast) => {
            this.audioEngine?.setGranularParam('shimmer', 'reverbWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granShimmerDelay', 'val-granShimmerDelay', (v, fast) => {
            this.audioEngine?.setGranularParam('shimmer', 'delayWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granShimmerPitch', 'val-granShimmerPitch', (v, fast) => {
            this.audioEngine?.setGranularParam('shimmer', 'pitchShift', v, sliderRamp(fast, 0.2, 0.05));
        });
        
        // Deep layer controls
        this.setupSlider('ctrl-granDeepVol', 'val-granDeepVol', (v, fast) => {
            this.audioEngine?.setGranularParam('deep', 'volume', v, sliderRamp(fast, 0.15, 0.03));
        });
        this.setupSlider('ctrl-granDeepSize', 'val-granDeepSize', (v, fast) => {
            this.audioEngine?.setGranularParam('deep', 'grainSize', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granDeepOverlap', 'val-granDeepOverlap', (v, fast) => {
            this.audioEngine?.setGranularParam('deep', 'overlap', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granDeepSpeed', 'val-granDeepSpeed', (v, fast) => {
            this.audioEngine?.setGranularParam('deep', 'playbackRate', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granDeepFilter', 'val-granDeepFilter', (v, fast) => {
            this.audioEngine?.setGranularParam('deep', 'filterFreq', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granDeepQ', 'val-granDeepQ', (v, fast) => {
            this.audioEngine?.setGranularParam('deep', 'filterQ', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granDeepReverb', 'val-granDeepReverb', (v, fast) => {
            this.audioEngine?.setGranularParam('deep', 'reverbWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granDeepDelay', 'val-granDeepDelay', (v, fast) => {
            this.audioEngine?.setGranularParam('deep', 'delayWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-granDeepDelayTime', 'val-granDeepDelayTime', (v, fast) => {
            this.audioEngine?.setGranularParam('deep', 'delayTime', v, sliderRamp(fast, 0.25, 0.05));
        });
        
        // =========================================
        // AUDIO CONTROLS - Mic Processing
        // =========================================
        
        this.setupMicToggle('ctrl-mic-enabled');
        
        this.setupSlider('ctrl-micVolume', 'val-micVolume', (v, fast) => {
            this.audioEngine?.setMicParam('volume', v, sliderRamp(fast, 0.15, 0.03));
        });
        this.setupSlider('ctrl-micFilter', 'val-micFilter', (v, fast) => {
            this.audioEngine?.setMicParam('filterFreq', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micReverb', 'val-micReverb', (v, fast) => {
            this.audioEngine?.setMicParam('reverbWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelay', 'val-micDelay', (v, fast) => {
            this.audioEngine?.setMicParam('delayWet', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelay2', 'val-micDelay2', (v, fast) => {
            this.audioEngine?.setMicParam('delayWet2', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayTime', 'val-micDelayTime', (v, fast) => {
            this.audioEngine?.setMicParam('delayTime', v, sliderRamp(fast, 0.25, 0.05));
        });
        this.setupSlider('ctrl-micDelayTime2', 'val-micDelayTime2', (v, fast) => {
            this.audioEngine?.setMicParam('delayTime2', v, sliderRamp(fast, 0.25, 0.05));
        });
        this.setupSlider('ctrl-micDelayFeedback', 'val-micDelayFeedback', (v, fast) => {
            this.audioEngine?.setMicParam('delayFeedback', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayFeedbackDrift', 'val-micDelayFeedbackDrift', (v, fast) => {
            this.audioEngine?.setMicParam('delayFeedbackDrift', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayStretch', 'val-micDelayStretch', (v, fast) => {
            this.audioEngine?.setMicParam('delayStretch', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayScatter', 'val-micDelayScatter', (v, fast) => {
            this.audioEngine?.setMicParam('delayScatter', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayDrift', 'val-micDelayDrift', (v, fast) => {
            this.audioEngine?.setMicParam('delayDrift', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayPitch', 'val-micDelayPitch', (v, fast) => {
            this.audioEngine?.setMicParam('delayPitch', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayPitchDrift', 'val-micDelayPitchDrift', (v, fast) => {
            this.audioEngine?.setMicParam('delayPitchDrift', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayPitchFlutter', 'val-micDelayPitchFlutter', (v, fast) => {
            this.audioEngine?.setMicParam('delayPitchFlutter', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayWow', 'val-micDelayWow', (v, fast) => {
            this.audioEngine?.setMicParam('delayWow', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micDelayFlutter', 'val-micDelayFlutter', (v, fast) => {
            this.audioEngine?.setMicParam('delayFlutter', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-micChorus', 'val-micChorus', (v, fast) => {
            this.audioEngine?.setMicParam('chorusDepth', v, sliderRamp(fast, 0.2, 0.05));
        });
        
        // =========================================
        // AUDIO CONTROLS - Global Effects
        // =========================================
        
        this.setupSlider('ctrl-reverbDecay', 'val-reverbDecay', (v, fast) => {
            this.audioEngine?.setGlobalEffect('reverbDecay', v, sliderRamp(fast, 0.3, 0.05));
        });
        this.setupSlider('ctrl-delayFeedback', 'val-delayFeedback', (v, fast) => {
            this.audioEngine?.setGlobalEffect('delayFeedback', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-chorusRate', 'val-chorusRate', (v, fast) => {
            this.audioEngine?.setGlobalEffect('chorusRate', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-chorusDepth', 'val-chorusDepth', (v, fast) => {
            this.audioEngine?.setGlobalEffect('chorusDepth', v, sliderRamp(fast, 0.2, 0.05));
        });
        this.setupSlider('ctrl-phaserRate', 'val-phaserRate', (v, fast) => {
            this.audioEngine?.setGlobalEffect('phaserRate', v, sliderRamp(fast, 0.2, 0.05));
        });
        
        // =========================================
        // AUDIO CONTROLS - Generative Behavior
        // =========================================
        
        this.setupSlider('ctrl-grainRandomPos', 'val-grainRandomPos', (v) => {
            this.audioEngine?.setGenerativeParam('grainRandomPosition', v);
        });
        this.setupSlider('ctrl-speedDrift', 'val-speedDrift', (v) => {
            this.audioEngine?.setGenerativeParam('speedDrift', v);
        });
        this.setupSlider('ctrl-bufferUpdate', 'val-bufferUpdate', (v) => {
            this.audioEngine?.setGenerativeParam('bufferUpdateRate', v);
        });
        this.setupSlider('ctrl-micReactivity', 'val-micReactivity', (v) => {
            this.audioEngine?.setGenerativeParam('micReactivity', v);
        });
        
        // Initialize shape values
        this.vignetteShape = 0.5;  // Default: blend between rectangular and oval
        this.updateManualSliders();
        this.setupColumnToggles();
        this.setupAudioGroups();
    }

    loadColumnState() {
        try {
            const raw = localStorage.getItem(this.columnStateKey);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    saveColumnState(state) {
        try {
            localStorage.setItem(this.columnStateKey, JSON.stringify(state));
        } catch (e) {}
    }

    applyColumnState() {
        const state = this.loadColumnState();
        document.querySelectorAll('.debug-column').forEach((column) => {
            const id = column.dataset.columnId;
            if (!id) return;
            column.classList.toggle('collapsed', Boolean(state[id]));
        });
    }

    setupColumnToggles() {
        const state = this.loadColumnState();
        document.querySelectorAll('.debug-column').forEach((column) => {
            const id = column.dataset.columnId;
            if (!id) return;
            column.classList.toggle('collapsed', Boolean(state[id]));
            const title = column.querySelector('.debug-column-title');
            if (!title || title.dataset.bound) return;
            title.dataset.bound = 'true';
            title.addEventListener('click', () => {
                const collapsed = column.classList.toggle('collapsed');
                state[id] = collapsed;
                this.saveColumnState(state);
            });
        });
    }

    setupAudioGroups() {
        document.querySelectorAll('.audio-group').forEach((group) => {
            const toggle = group.querySelector('.audio-group-toggle');
            if (!toggle || toggle.dataset.bound) return;
            toggle.dataset.bound = 'true';
            const update = () => {
                const collapsed = group.classList.contains('collapsed');
                toggle.textContent = collapsed ? '>' : 'v';
                toggle.setAttribute('aria-expanded', (!collapsed).toString());
            };
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                group.classList.toggle('collapsed');
                update();
            });
            update();
        });
    }
    
    applyManualVisualParams(visualState) {
        if (!visualState || !this.manualVisual) return;
        Object.assign(visualState, {
            ringDelay: this.manualVisual.ringDelay,
            ringOverlayStrength: this.manualVisual.ringOverlayStrength,
            ringOverlayWidth: this.manualVisual.ringOverlayWidth,
            parallelStrength: this.manualVisual.parallelStrength,
            parallelZoom: this.manualVisual.parallelZoom,
            parallelZoomDrift: this.manualVisual.parallelZoomDrift,
            parallelSpin: this.manualVisual.parallelSpin,
            parallelThickness: this.manualVisual.parallelThickness,
            parallelPresence: this.manualVisual.parallelPresence,
            blobCount: this.manualVisual.blobCount,
            blobSpread: this.manualVisual.blobSpread,
            blobScale: this.manualVisual.blobScale,
            blobMotion: this.manualVisual.blobMotion,
            blobBlur: this.manualVisual.blobBlur,
            blobSmear: this.manualVisual.blobSmear,
            blobLighten: this.manualVisual.blobLighten,
            blobInvert: this.manualVisual.blobInvert,
            blobFade: this.manualVisual.blobFade,
            blobWarp: this.manualVisual.blobWarp,
            blobOffsetX: this.manualVisual.blobOffsetX,
            blobOffsetY: this.manualVisual.blobOffsetY
        });
    }

    applyHandAudio(handState, deltaTime) {
        if (!this.enabledInputs.sound || !this.audioEngine) return;
        
        const now = performance.now();
        let bestFist = 0;
        let bestVelY = 0;
        let bestPalm = false;
        
        if (handState && handState.count > 0) {
            for (let i = 0; i < handState.count; i++) {
                const fist = handState.fists?.[i] ?? 0;
                if (fist > bestFist) {
                    bestFist = fist;
                    bestVelY = handState.velocities?.[i]?.y ?? 0;
                    bestPalm = handState.palmFacing?.[i] ?? false;
                }
            }
        }
        
        const upwardSpeed = -bestVelY;
        const moveThreshold = 0.35;
        const fistThreshold = 0.65;
        const stepCooldown = 360;
        
        if (bestFist > fistThreshold && bestPalm && Math.abs(upwardSpeed) > moveThreshold) {
            if (now - this.handPitch.lastStepTime > stepCooldown) {
                const direction = upwardSpeed > 0 ? 1 : -1;
                const maxIndex = this.handPitch.scale.length - 1;
                this.handPitch.index = Utils.clamp(this.handPitch.index + direction, 0, maxIndex);
                this.handPitch.targetCents = this.handPitch.scale[this.handPitch.index] * 100;
                this.handPitch.lastStepTime = now;
            }
        }
        
        if (bestFist < 0.4) {
            this.handPitch.targetCents = 0;
        }
        
        const glide = Utils.clamp(deltaTime * 2.2, 0, 1);
        this.handPitch.currentCents += (this.handPitch.targetCents - this.handPitch.currentCents) * glide;
        if (this.audioEngine.setHandDetune) {
            this.audioEngine.setHandDetune(this.handPitch.currentCents);
        }
    }

    updateAnimationSpeed() {
        if (!this.stateEngine) return;
        const min = Math.min(this.animSpeedMin, this.animSpeedMax);
        const max = Math.max(this.animSpeedMin, this.animSpeedMax);
        const driver = this.stateEngine.get('overallSpeed');
        this.currentAnimSpeed = Utils.mapRange(driver, 0, 1, min, max);
    }

    composeHandState(handState) {
        const maxHands = this.handTracker?.maxHands ?? 2;
        const baseCount = handState?.count || 0;
        const merged = {
            count: Math.min(baseCount, maxHands),
            positions: Array.from({ length: maxHands }, (_, i) => handState?.positions?.[i] || { x: 0.5, y: 0.5 }),
            velocities: Array.from({ length: maxHands }, (_, i) => handState?.velocities?.[i] || { x: 0, y: 0 }),
            strengths: Array.from({ length: maxHands }, (_, i) => handState?.strengths?.[i] || 0),
            palmFacing: Array.from({ length: maxHands }, (_, i) => handState?.palmFacing?.[i] || false),
            fists: Array.from({ length: maxHands }, (_, i) => handState?.fists?.[i] || 0),
            influence: handState?.influence || 0,
            visibility: handState?.visibility || 0,
            landmarks: handState?.landmarks || []
        };
        
        if (this.pointerHand.active) {
            const slot = merged.count < maxHands ? merged.count : maxHands - 1;
            if (merged.count < maxHands) merged.count += 1;
            merged.positions[slot] = { x: this.pointerHand.x, y: this.pointerHand.y };
            merged.velocities[slot] = { x: this.pointerHand.vx, y: this.pointerHand.vy };
            merged.strengths[slot] = this.pointerHand.strength;
            merged.palmFacing[slot] = true;
            merged.fists[slot] = 0;
            merged.influence = Math.max(merged.influence, this.pointerHand.strength);
            merged.visibility = 1;
        }
        
        return merged;
    }
    
    updateHandOverlaySize() {
        if (!this.handOverlay || !this.handOverlayWrap) return;
        const aspect = window.innerWidth / window.innerHeight;
        let width = 200;
        let height = Math.round(width / aspect);
        if (height > 240) {
            height = 240;
            width = Math.round(height * aspect);
        }
        
        this.handOverlay.width = width;
        this.handOverlay.height = height;
        this.handOverlayWrap.style.width = `${width}px`;
        this.handOverlayWrap.style.height = `${height}px`;
    }

    setFaceOverlayVisible(visible) {
        if (!this.faceOverlayWrap) return;
        const show = Boolean(visible) && this.showFaceOverlay;
        this.faceOverlayWrap.style.display = show ? 'block' : 'none';
        if (this.faceCloseButton) {
            this.faceCloseButton.style.display = show && this.isRunning ? 'block' : 'none';
        }
    }
    
    setHandOverlayVisible(visible) {
        if (!this.handOverlayWrap) return;
        const show = Boolean(visible) && this.showHandOverlay;
        this.handOverlayWrap.style.display = show ? 'block' : 'none';
        if (!show) {
            this.handOverlayWrap.style.opacity = '0';
        } else {
            this.handOverlayWrap.style.opacity = '0.35';
        }
    }

    async startFaceTracking() {
        if (!this.enabledInputs.faceTracking || !this.inputManager.enabled.camera) return false;
        await this.faceTracker.init(this.inputManager.getVideoElement());
        this.faceTracker.stop();
        await this.faceTracker.start();
        return true;
    }

    async startHandTracking() {
        if (!this.enabledInputs.hands || !this.inputManager.enabled.camera) return false;
        await this.handTracker.init(this.inputManager.getVideoElement());
        this.handTracker.start();
        return true;
    }

    async toggleCamera(enabled) {
        const cameraToggle = document.getElementById('ctrl-camera-enabled');
        const cameraEnabled = Boolean(enabled);
        this.enabledInputs.camera = cameraEnabled;
        
        if (!cameraEnabled) {
            this.faceTracker?.stop();
            this.handTracker?.stop();
            this.inputManager?.stopCamera();
            if (cameraToggle) {
                cameraToggle.checked = false;
            }
            this.setFaceOverlayVisible(true);
            this.setHandOverlayVisible(true);
            return false;
        }
        
        const granted = await this.inputManager.requestCamera();
        if (!granted) {
            this.enabledInputs.camera = false;
            if (cameraToggle) {
                cameraToggle.checked = false;
            }
            this.setFaceOverlayVisible(false);
            this.setHandOverlayVisible(false);
            return false;
        }
        
        if (cameraToggle) {
            cameraToggle.checked = true;
        }
        await this.startFaceTracking();
        await this.startHandTracking();
        this.setFaceOverlayVisible(true);
        this.setHandOverlayVisible(true);
        return true;
    }

    async toggleFaceTracking(enabled) {
        const faceToggle = document.getElementById('ctrl-face-enabled');
        const faceEnabled = Boolean(enabled);
        this.enabledInputs.faceTracking = faceEnabled;
        
        if (!faceEnabled) {
            this.faceTracker?.stop();
            if (faceToggle) {
                faceToggle.checked = false;
            }
            this.setFaceOverlayVisible(true);
            return;
        }
        
        if (!this.inputManager.enabled.camera) {
            const granted = await this.toggleCamera(true);
            if (!granted) {
                this.enabledInputs.faceTracking = false;
                if (faceToggle) {
                    faceToggle.checked = false;
                }
                this.setFaceOverlayVisible(false);
                return;
            }
        }
        
        const started = await this.startFaceTracking();
        if (!started) {
            this.enabledInputs.faceTracking = false;
            if (faceToggle) {
                faceToggle.checked = false;
            }
            this.setFaceOverlayVisible(false);
            return;
        }
        
        if (faceToggle) {
            faceToggle.checked = true;
        }
        this.setFaceOverlayVisible(true);
    }

    async toggleHandTracking(enabled) {
        const handToggle = document.getElementById('ctrl-hand-enabled');
        const handEnabled = Boolean(enabled);
        this.enabledInputs.hands = handEnabled;
        
        if (!handEnabled) {
            this.handTracker?.stop();
            if (handToggle) {
                handToggle.checked = false;
            }
            this.setHandOverlayVisible(true);
            return;
        }
        
        if (!this.inputManager.enabled.camera) {
            const granted = await this.toggleCamera(true);
            if (!granted) {
                this.enabledInputs.hands = false;
                if (handToggle) {
                    handToggle.checked = false;
                }
                this.setHandOverlayVisible(false);
                return;
            }
        }
        
        await this.startHandTracking();
        if (handToggle) {
            handToggle.checked = true;
        }
        this.setHandOverlayVisible(true);
    }
    
    setupDroneToggle(checkboxId, droneName) {
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                this.audioEngine?.toggleDrone(droneName, e.target.checked);
            });
        }
    }
    
    setupGranularToggle(checkboxId, layerName) {
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                this.audioEngine?.toggleGranularLayer(layerName, e.target.checked);
            });
        }
    }
    
    setupMicToggle(checkboxId) {
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                this.audioEngine?.toggleMicEffects(e.target.checked);
            });
        }
    }
    
    setupSlider(sliderId, valueId, callback, formatValue) {
        const slider = document.getElementById(sliderId);
        const valueSpan = document.getElementById(valueId);
        
        if (slider && valueSpan) {
            // Track when user starts interacting
            slider.addEventListener('mousedown', () => {
                this.activeSliders.add(sliderId);
            });
            slider.addEventListener('touchstart', () => {
                this.activeSliders.add(sliderId);
            }, { passive: true });
            
            // Track when user stops interacting (with delay to let value settle)
            slider.addEventListener('mouseup', () => {
                setTimeout(() => this.activeSliders.delete(sliderId), 500);
            });
            slider.addEventListener('touchend', () => {
                setTimeout(() => this.activeSliders.delete(sliderId), 500);
            }, { passive: true });
            
            // Also handle mouse leaving the slider while dragging
            slider.addEventListener('mouseleave', () => {
                // Only clear if mouse button is not pressed
                setTimeout(() => this.activeSliders.delete(sliderId), 1000);
            });
            
            slider.addEventListener('dblclick', (e) => {
                e.preventDefault();
                this.toggleSliderLock(sliderId);
            });
            
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                const displayValue = typeof formatValue === 'function' ? formatValue(value) : value.toFixed(2);
                valueSpan.textContent = displayValue;
                const now = performance.now();
                const last = this.sliderInputState.get(sliderId) || { time: now, value };
                const range = parseFloat(slider.max) - parseFloat(slider.min);
                const dv = Math.abs(value - last.value);
                const dt = Math.max(1, now - last.time);
                const fastChange = dv > range * 0.08 || dt < 45;
                this.sliderInputState.set(sliderId, { time: now, value });
                callback(value, fastChange);
                
                if (this.lockedSliders.has(sliderId)) {
                    this.updateLockedSlider(sliderId, value);
                }
            });
        }
    }

    setupAnimationSpeedRange(minId, maxId, valueId) {
        const minSlider = document.getElementById(minId);
        const maxSlider = document.getElementById(maxId);
        const valueSpan = document.getElementById(valueId);
        if (!minSlider || !maxSlider) return;
        
        const sync = () => {
            let min = parseFloat(minSlider.value);
            let max = parseFloat(maxSlider.value);
            if (min > max) {
                const temp = min;
                min = max;
                max = temp;
                minSlider.value = min;
                maxSlider.value = max;
            }
            this.animSpeedMin = min;
            this.animSpeedMax = max;
            if (valueSpan) {
                valueSpan.textContent = `${min.toFixed(2)}-${max.toFixed(2)}x`;
            }
        };
        
        const bringToFront = (el) => {
            minSlider.style.zIndex = el === minSlider ? '2' : '1';
            maxSlider.style.zIndex = el === maxSlider ? '2' : '1';
        };
        
        minSlider.addEventListener('input', () => {
            if (parseFloat(minSlider.value) > parseFloat(maxSlider.value)) {
                maxSlider.value = minSlider.value;
            }
            sync();
        });
        maxSlider.addEventListener('input', () => {
            if (parseFloat(maxSlider.value) < parseFloat(minSlider.value)) {
                minSlider.value = maxSlider.value;
            }
            sync();
        });
        minSlider.addEventListener('pointerdown', () => bringToFront(minSlider));
        maxSlider.addEventListener('pointerdown', () => bringToFront(maxSlider));
        
        sync();
    }

    setupStateSlider(sliderId, valueId, dimension, scale = 1, formatValue) {
        this.registerStateSlider(sliderId, dimension, scale);
        const callback = (value, fast) => this.setStateDimension(dimension, value / scale, fast);
        this.setupSlider(sliderId, valueId, callback, formatValue);
    }

    registerStateSlider(sliderId, dimension, scale = 1) {
        this.stateSliderMeta.set(sliderId, { dimension, scale });
        this.stateSliderByDimension.set(dimension, sliderId);
    }

    registerManualSlider(sliderId, key) {
        this.manualSliderMeta.set(sliderId, { key });
        this.manualSliderByKey.set(key, sliderId);
    }

    toggleSliderLock(sliderId) {
        const slider = document.getElementById(sliderId);
        if (!slider) return;
        const sliderGroup = slider.closest('.slider-group');
        const isLocked = this.lockedSliders.has(sliderId);
        if (isLocked) {
            this.lockedSliders.delete(sliderId);
            if (sliderGroup) sliderGroup.classList.remove('slider-locked');
            const meta = this.stateSliderMeta.get(sliderId);
            if (meta) {
                this.stateEngine?.unlockDimension(meta.dimension);
            }
            return;
        }
        
        const value = parseFloat(slider.value);
        this.lockedSliders.set(sliderId, value);
        if (sliderGroup) sliderGroup.classList.add('slider-locked');
        this.updateLockedSlider(sliderId, value);
    }

    updateLockedSlider(sliderId, value) {
        this.lockedSliders.set(sliderId, value);
        const meta = this.stateSliderMeta.get(sliderId);
        if (meta) {
            const lockedValue = value / meta.scale;
            this.stateEngine?.lockDimension(meta.dimension, lockedValue);
            return;
        }
        
        const manualMeta = this.manualSliderMeta.get(sliderId);
        if (manualMeta) {
            if (manualMeta.key === 'vignetteShape') {
                this.vignetteShape = value;
            } else if (this.manualVisual && this.manualVisual[manualMeta.key] !== undefined) {
                this.manualVisual[manualMeta.key] = value;
            }
        }
    }

    syncLockedSlidersUI() {
        this.lockedSliders.forEach((value, sliderId) => {
            const slider = document.getElementById(sliderId);
            if (!slider) return;
            const sliderGroup = slider.closest('.slider-group');
            if (sliderGroup) sliderGroup.classList.add('slider-locked');
        });
    }
    
    setStateDimension(name, value, fastChange = false) {
        if (this.stateEngine && this.stateEngine.dimensions[name] !== undefined) {
            // Manual slider change: hold steady before slow drift resumes
            this.stateEngine.setManualValue(name, value);
            if (fastChange) {
                this.visualEngine?.boostSmoothing(14);
            }
        }
    }
    
    // For instant changes (presets, initialization) - same as setStateDimension now
    setStateDimensionInstant(name, value) {
        if (this.stateEngine && this.stateEngine.dimensions[name] !== undefined) {
            this.stateEngine.setDimensionValue(name, value);
        }
    }
    
    applyPreset(presetName) {
        console.log('Applying preset:', presetName);
        
        const baseState = {
            colorHue1: 0.5,
            colorHue2: 0.08,
            colorHue3: 0.85,
            colorHue4: 0.35,
            colorSaturation: 0.7,
            colorBrightness: 0.55,
            displacementStrength: 0.35,
            displacementRadius: 0.6,
            displacementRings: 0.4,
            displacementX: 0.5,
            displacementY: 0.5,
            displacementChromatic: 0.25,
            displacementWobble: 0.15,
            rippleOrigin2Strength: 0.2,
            rippleOrigin3Strength: 0.15,
            morphProgress: 0,
            morphType: 0.1,
            shapeType: 0.0,
            waveDelay: 0.45,
            waveAmplitude: 0.2,
            waveSpeed: 0.4,
            edgeSharpness: 0.2,
            minRadius: 0.08,
            shapeRotation: 0,
            rotationSpeed: 0.1,
            foldAmount: 0.4,
            invertAmount: 0.2,
            secondaryWave: 0.3,
            tertiaryWave: 0.1,
            blur: 0.2,
            glow: 0.25,
            vignette: 0.2,
            brightnessEvolution: 0.5
        };
        
        const baseManual = {
            ringDelay: 0.35,
            ringOverlayStrength: 0.4,
            ringOverlayWidth: 0.35,
            parallelStrength: 0.0,      // No parallel lines by default
            parallelZoom: 0.42,
            parallelZoomDrift: 0.15,
            parallelSpin: 0.15,
            parallelThickness: 0.28,
            parallelPresence: 0.0,      // No parallel presence by default
            blobCount: 8,
            blobSpread: 0.75,
            blobScale: 0.95,
            blobMotion: 0.4,
            blobBlur: 0.75,
            blobSmear: 0.6,
            blobLighten: 0.25,
            blobInvert: 0.1,
            blobFade: 0.7,
            blobWarp: 0.25,
            blobOffsetX: 0,
            blobOffsetY: 0
        };
        
        const presets = {
            // === REFERENCE IMAGE INSPIRED PRESETS ===
            
            // Glowing pill/capsule on dark background (ref image 1)
            glowingPill: {
                state: {
                    ...baseState,
                    colorHue1: 0.33,     // Green
                    colorHue2: 0.08,     // Orange/red
                    colorHue3: 0.35,     // Green-yellow
                    colorHue4: 0.05,     // Red-orange
                    colorSaturation: 0.95,
                    colorBrightness: 0.65,
                    displacementStrength: 0.65,
                    displacementRadius: 0.55,
                    displacementRings: 0.12,  // Minimal rings - solid shape
                    displacementChromatic: 0.35,
                    displacementWobble: 0.02,
                    shapeType: 1.0,       // Pill/capsule shape
                    waveDelay: 0.3,
                    waveAmplitude: 0.1,
                    edgeSharpness: 0.45,
                    blur: 0.35,
                    glow: 0.65,
                    vignette: 0.5,
                    brightnessEvolution: 0.7
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.0,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 5,
                    blobSpread: 0.4,
                    blobScale: 1.3,
                    blobBlur: 0.95,
                    blobLighten: 0.45
                },
                vignetteShape: 0.65
            },
            
            // Dark sphere on pink/magenta background (ref image 2)
            darkSphere: {
                state: {
                    ...baseState,
                    colorHue1: 0.92,     // Pink/magenta
                    colorHue2: 0.58,     // Blue-cyan
                    colorHue3: 0.12,     // Yellow-orange
                    colorHue4: 0.88,     // Pink
                    colorSaturation: 0.85,
                    colorBrightness: 0.62,
                    displacementStrength: 0.72,
                    displacementRadius: 0.4,
                    displacementRings: 0.08,  // Almost no rings
                    displacementChromatic: 0.55,
                    displacementWobble: 0.01,
                    shapeType: 0.0,       // Circle
                    waveDelay: 0.2,
                    waveAmplitude: 0.08,
                    edgeSharpness: 0.35,
                    blur: 0.25,
                    glow: 0.5,
                    vignette: 0.1
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.0,
                    parallelStrength: 0.0,
                    blobCount: 6,
                    blobScale: 1.4,
                    blobBlur: 0.85,
                    blobInvert: 0.35
                },
                vignetteShape: 0.5
            },
            
            // Iridescent egg on black (ref image 3)
            iridescentEgg: {
                state: {
                    ...baseState,
                    colorHue1: 0.45,     // Cyan
                    colorHue2: 0.92,     // Magenta
                    colorHue3: 0.33,     // Green
                    colorHue4: 0.15,     // Yellow-orange
                    colorSaturation: 0.95,
                    colorBrightness: 0.58,
                    displacementStrength: 0.55,
                    displacementRadius: 0.65,
                    displacementRings: 0.15,
                    displacementChromatic: 0.75,  // Strong chromatic for iridescence
                    displacementWobble: 0.08,
                    shapeType: 0.95,      // Near pill shape
                    waveDelay: 0.4,
                    waveAmplitude: 0.15,
                    edgeSharpness: 0.5,
                    blur: 0.15,
                    glow: 0.35,
                    vignette: 0.55
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.15,
                    parallelStrength: 0.0,
                    blobCount: 7,
                    blobScale: 1.1,
                    blobBlur: 0.7,
                    blobSmear: 0.8
                },
                vignetteShape: 0.7
            },
            
            // Concentric rings tunnel (ref images 14-15, 18)
            concentricTunnel: {
                state: {
                    ...baseState,
                    colorHue1: 0.08,     // Orange
                    colorHue2: 0.55,     // Cyan
                    colorHue3: 0.92,     // Magenta
                    colorHue4: 0.33,     // Green
                    colorSaturation: 1.0,
                    colorBrightness: 0.6,
                    displacementStrength: 0.6,
                    displacementRadius: 1.0,
                    displacementRings: 0.85,  // Many rings
                    displacementChromatic: 0.65,
                    displacementWobble: 0.05,
                    shapeType: 0.0,       // Circles
                    waveDelay: 0.7,
                    waveAmplitude: 0.35,
                    edgeSharpness: 0.2,
                    blur: 0.08,
                    glow: 0.4,
                    vignette: 0.15
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.55,
                    ringOverlayWidth: 0.25,
                    parallelStrength: 0.0,
                    blobCount: 8,
                    blobBlur: 0.6
                },
                vignetteShape: 0.5
            },
            
            // Glowing orb with halo (ref image 11 - green circle on purple)
            glowingOrb: {
                state: {
                    ...baseState,
                    colorHue1: 0.52,     // Teal-green
                    colorHue2: 0.75,     // Purple
                    colorHue3: 0.45,     // Cyan
                    colorHue4: 0.7,      // Violet
                    colorSaturation: 0.85,
                    colorBrightness: 0.55,
                    displacementStrength: 0.5,
                    displacementRadius: 0.5,
                    displacementRings: 0.2,
                    displacementChromatic: 0.4,
                    displacementWobble: 0.03,
                    shapeType: 0.0,
                    waveDelay: 0.35,
                    waveAmplitude: 0.12,
                    edgeSharpness: 0.55,
                    blur: 0.4,
                    glow: 0.7,
                    vignette: 0.25
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.3,
                    parallelStrength: 0.0,
                    blobCount: 5,
                    blobScale: 1.2,
                    blobBlur: 0.95,
                    blobLighten: 0.5
                },
                vignetteShape: 0.8
            },
            
            // Warm sunset sphere (ref image 19 - yellow sphere on purple)
            warmSunset: {
                state: {
                    ...baseState,
                    colorHue1: 0.12,     // Yellow-orange
                    colorHue2: 0.75,     // Purple
                    colorHue3: 0.05,     // Red
                    colorHue4: 0.52,     // Cyan
                    colorSaturation: 0.8,
                    colorBrightness: 0.6,
                    displacementStrength: 0.45,
                    displacementRadius: 0.55,
                    displacementRings: 0.1,
                    displacementChromatic: 0.3,
                    displacementWobble: 0.02,
                    shapeType: 0.0,
                    waveDelay: 0.25,
                    waveAmplitude: 0.08,
                    edgeSharpness: 0.5,
                    blur: 0.35,
                    glow: 0.55,
                    vignette: 0.2
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.1,
                    parallelStrength: 0.0,
                    blobCount: 6,
                    blobScale: 1.15,
                    blobBlur: 0.85
                },
                vignetteShape: 0.6
            },
            
            // Layered echoes/pyramids (ref image 7 - layered glowing shapes)
            layeredEchoes: {
                state: {
                    ...baseState,
                    colorHue1: 0.03,     // Red-orange
                    colorHue2: 0.58,     // Cyan
                    colorHue3: 0.15,     // Yellow
                    colorHue4: 0.42,     // Green-cyan
                    colorSaturation: 0.88,
                    colorBrightness: 0.55,
                    displacementStrength: 0.4,
                    displacementRadius: 0.85,
                    displacementRings: 0.55,
                    displacementChromatic: 0.45,
                    displacementWobble: 0.15,
                    shapeType: 0.45,      // Torus-ish
                    waveDelay: 0.75,
                    waveAmplitude: 0.4,
                    edgeSharpness: 0.35,
                    blur: 0.2,
                    glow: 0.45,
                    vignette: 0.35
                },
                manual: {
                    ...baseManual,
                    ringDelay: 0.6,
                    ringOverlayStrength: 0.5,
                    ringOverlayWidth: 0.4,
                    parallelStrength: 0.0,
                    blobCount: 7
                },
                vignetteShape: 0.4
            },
            
            // Soft focus abstract (ref image 9 - soft green/teal spiral)
            softFocus: {
                state: {
                    ...baseState,
                    colorHue1: 0.35,     // Green
                    colorHue2: 0.45,     // Cyan
                    colorHue3: 0.12,     // Yellow
                    colorHue4: 0.75,     // Purple
                    colorSaturation: 0.65,
                    colorBrightness: 0.65,
                    displacementStrength: 0.25,
                    displacementRadius: 0.6,
                    displacementRings: 0.25,
                    displacementChromatic: 0.2,
                    displacementWobble: 0.12,
                    shapeType: 0.65,      // Spiral-ish
                    waveDelay: 0.45,
                    waveAmplitude: 0.2,
                    edgeSharpness: 0.7,
                    blur: 0.55,
                    glow: 0.35,
                    vignette: 0.15
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.15,
                    parallelStrength: 0.0,
                    blobCount: 9,
                    blobScale: 1.0,
                    blobBlur: 1.0,
                    blobSmear: 0.85
                },
                vignetteShape: 0.55
            },
            
            // Split/dual sphere (ref images 17, 19 with split effect)
            dualSphere: {
                state: {
                    ...baseState,
                    colorHue1: 0.55,     // Cyan
                    colorHue2: 0.35,     // Green
                    colorHue3: 0.75,     // Purple
                    colorHue4: 0.05,     // Red
                    colorSaturation: 0.78,
                    colorBrightness: 0.58,
                    displacementStrength: 0.55,
                    displacementRadius: 0.5,
                    displacementRings: 0.18,
                    displacementChromatic: 0.5,
                    displacementWobble: 0.05,
                    rippleOrigin2Strength: 0.45,  // Second ripple visible
                    rippleOrigin3Strength: 0.25,
                    shapeType: 0.0,
                    waveDelay: 0.4,
                    waveAmplitude: 0.15,
                    edgeSharpness: 0.4,
                    blur: 0.2,
                    glow: 0.4,
                    vignette: 0.1
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.25,
                    parallelStrength: 0.0,
                    blobCount: 6,
                    blobScale: 1.1
                },
                vignetteShape: 0.5
            },
            
            // === ORIGINAL PRESETS (updated with reduced parallel lines) ===
            
            calm: {
                state: {
                    ...baseState,
                    colorHue1: 0.55,
                    colorHue2: 0.48,
                    colorHue3: 0.75,
                    colorHue4: 0.3,
                    colorSaturation: 0.5,
                    colorBrightness: 0.52,
                    displacementStrength: 0.28,
                    displacementRings: 0.3,
                    displacementChromatic: 0.18,
                    displacementWobble: 0.08,
                    blur: 0.25,
                    glow: 0.2,
                    vignette: 0.18,
                    brightnessEvolution: 0.35
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.25,
                    ringOverlayWidth: 0.3,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 8,
                    blobSpread: 0.65,
                    blobScale: 0.8,
                    blobMotion: 0.35,
                    blobBlur: 0.9,
                    blobLighten: 0.2
                },
                vignetteShape: 0.45
            },
            softBlobs: {
                state: {
                    ...baseState,
                    colorHue1: 0.5,
                    colorHue2: 0.85,
                    colorHue3: 0.2,
                    colorHue4: 0.62,
                    colorSaturation: 0.75,
                    colorBrightness: 0.62,
                    displacementStrength: 0.18,
                    displacementRadius: 0.4,
                    displacementRings: 0.18,
                    displacementChromatic: 0.25,
                    displacementWobble: 0.35,
                    blur: 0.65,
                    glow: 0.45,
                    vignette: 0.15,
                    brightnessEvolution: 0.6
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.15,
                    ringOverlayWidth: 0.55,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 12,
                    blobScale: 1.15,
                    blobBlur: 1.0,
                    blobSmear: 0.85,
                    blobMotion: 0.65,
                    blobWarp: 0.45,
                    blobLighten: 0.35
                },
                vignetteShape: 0.6
            },
            singleRing: {
                state: {
                    ...baseState,
                    colorHue1: 0.9,
                    colorHue2: 0.85,
                    colorHue3: 0.1,
                    colorHue4: 0.5,
                    colorSaturation: 0.8,
                    colorBrightness: 0.6,
                    displacementStrength: 0.7,
                    displacementRadius: 0.7,
                    displacementRings: 0.1,
                    displacementChromatic: 0.45,
                    displacementWobble: 0.05,
                    waveDelay: 0.6,
                    waveAmplitude: 0.25,
                    edgeSharpness: 0.15,
                    blur: 0.1,
                    glow: 0.25,
                    vignette: 0.45
                },
                manual: {
                    ...baseManual,
                    ringDelay: 0.45,
                    ringOverlayStrength: 0.6,
                    ringOverlayWidth: 0.2,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 6,
                    blobScale: 0.7,
                    blobBlur: 0.4,
                    blobLighten: 0.15
                },
                vignetteShape: 0.75
            },
            multiRings: {
                state: {
                    ...baseState,
                    colorHue1: 0.55,
                    colorHue2: 0.1,
                    colorHue3: 0.9,
                    colorHue4: 0.32,
                    colorSaturation: 0.9,
                    colorBrightness: 0.55,
                    displacementStrength: 0.55,
                    displacementRadius: 0.9,
                    displacementRings: 0.65,
                    displacementChromatic: 0.55,
                    displacementWobble: 0.12,
                    waveDelay: 0.7,
                    waveAmplitude: 0.3,
                    blur: 0.18,
                    glow: 0.32,
                    vignette: 0.28
                },
                manual: {
                    ...baseManual,
                    ringDelay: 0.5,
                    ringOverlayStrength: 0.45,
                    ringOverlayWidth: 0.35,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 9,
                    blobSpread: 0.8
                },
                vignetteShape: 0.5
            },
            chromatic: {
                state: {
                    ...baseState,
                    colorHue1: 0.0,
                    colorHue2: 0.33,
                    colorHue3: 0.66,
                    colorHue4: 0.92,
                    colorSaturation: 1.0,
                    colorBrightness: 0.6,
                    displacementStrength: 0.75,
                    displacementRadius: 1.0,
                    displacementRings: 0.85,
                    displacementChromatic: 0.9,
                    displacementWobble: 0.12,
                    waveDelay: 0.65,
                    waveAmplitude: 0.28,
                    blur: 0.1,
                    glow: 0.4,
                    vignette: 0.2
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.4,
                    ringOverlayWidth: 0.25,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 10,
                    blobLighten: 0.35,
                    blobInvert: 0.2
                },
                vignetteShape: 0.55
            },
            angular: {
                state: {
                    ...baseState,
                    colorHue1: 0.95,
                    colorHue2: 0.45,
                    colorHue3: 0.2,
                    colorHue4: 0.6,
                    colorSaturation: 0.85,
                    colorBrightness: 0.5,
                    displacementStrength: 0.5,
                    displacementRadius: 0.8,
                    displacementRings: 0.5,
                    displacementChromatic: 0.28,
                    displacementWobble: 0.05,
                    morphProgress: 0.8,
                    morphType: 0.6,
                    shapeType: 0.35,
                    edgeSharpness: 0.12,
                    blur: 0.05,
                    glow: 0.3,
                    vignette: 0.35
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.35,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    parallelZoom: 0.6,
                    parallelSpin: 0.55,
                    blobCount: 7,
                    blobBlur: 0.5
                },
                vignetteShape: 0.25
            },
            minimal: {
                state: {
                    ...baseState,
                    colorHue1: 0.6,
                    colorHue2: 0.58,
                    colorHue3: 0.62,
                    colorHue4: 0.55,
                    colorSaturation: 0.3,
                    colorBrightness: 0.7,
                    displacementStrength: 0.18,
                    displacementRadius: 0.5,
                    displacementRings: 0.25,
                    displacementChromatic: 0.08,
                    displacementWobble: 0.03,
                    blur: 0.35,
                    glow: 0.08,
                    vignette: 0.45,
                    brightnessEvolution: 0.25
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.2,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 6,
                    blobLighten: 0.1,
                    blobInvert: 0.05
                },
                vignetteShape: 0.8
            },
            halo: {
                state: {
                    ...baseState,
                    colorHue1: 0.62,
                    colorHue2: 0.12,
                    colorHue3: 0.78,
                    colorHue4: 0.28,
                    colorSaturation: 0.75,
                    colorBrightness: 0.58,
                    displacementStrength: 0.55,
                    displacementRadius: 0.85,
                    displacementRings: 0.45,
                    waveDelay: 0.7,
                    waveAmplitude: 0.25,
                    blur: 0.18,
                    glow: 0.5,
                    vignette: 0.25
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.7,
                    ringOverlayWidth: 0.25,
                    ringDelay: 0.55,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 8,
                    blobLighten: 0.35
                },
                vignetteShape: 0.65
            },
            liquid: {
                state: {
                    ...baseState,
                    colorHue1: 0.48,
                    colorHue2: 0.9,
                    colorHue3: 0.18,
                    colorHue4: 0.7,
                    colorSaturation: 0.8,
                    colorBrightness: 0.6,
                    displacementStrength: 0.32,
                    displacementRadius: 0.7,
                    displacementRings: 0.35,
                    displacementWobble: 0.25,
                    shapeType: 0.1,
                    waveDelay: 0.5,
                    waveAmplitude: 0.22,
                    blur: 0.3,
                    glow: 0.28,
                    vignette: 0.18
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.25,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 12,
                    blobMotion: 0.8,
                    blobSmear: 0.95,
                    blobBlur: 0.9,
                    blobWarp: 0.5,
                    blobLighten: 0.4,
                    blobInvert: 0.25
                },
                vignetteShape: 0.55
            },
            prism: {
                state: {
                    ...baseState,
                    colorHue1: 0.05,
                    colorHue2: 0.35,
                    colorHue3: 0.62,
                    colorHue4: 0.9,
                    colorSaturation: 0.95,
                    colorBrightness: 0.58,
                    displacementStrength: 0.62,
                    displacementRadius: 0.9,
                    displacementRings: 0.55,
                    displacementChromatic: 0.75,
                    shapeType: 0.55,
                    morphProgress: 0.5,
                    morphType: 0.75,
                    waveDelay: 0.55,
                    waveAmplitude: 0.28,
                    blur: 0.1,
                    glow: 0.35,
                    vignette: 0.2
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.4,
                    ringOverlayWidth: 0.3,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    parallelZoom: 0.7,
                    parallelSpin: 0.6,
                    blobCount: 9,
                    blobLighten: 0.3,
                    blobInvert: 0.2
                },
                vignetteShape: 0.5
            },
            nocturne: {
                state: {
                    ...baseState,
                    colorHue1: 0.62,
                    colorHue2: 0.7,
                    colorHue3: 0.05,
                    colorHue4: 0.25,
                    colorSaturation: 0.4,
                    colorBrightness: 0.45,
                    displacementStrength: 0.3,
                    displacementRadius: 0.65,
                    displacementRings: 0.4,
                    displacementChromatic: 0.15,
                    waveDelay: 0.5,
                    waveAmplitude: 0.18,
                    blur: 0.4,
                    glow: 0.18,
                    vignette: 0.6,
                    brightnessEvolution: 0.2
                },
                manual: {
                    ...baseManual,
                    ringOverlayStrength: 0.3,
                    parallelStrength: 0.0,
                    parallelPresence: 0.0,
                    blobCount: 7,
                    blobBlur: 0.8,
                    blobLighten: 0.15
                },
                vignetteShape: 0.7
            },
            interference: {
                state: {
                    ...baseState,
                    colorHue1: 0.52,
                    colorHue2: 0.2,
                    colorHue3: 0.78,
                    colorHue4: 0.38,
                    colorSaturation: 0.85,
                    colorBrightness: 0.55,
                    displacementStrength: 0.48,
                    displacementRadius: 0.8,
                    displacementRings: 0.5,
                    shapeType: 0.8,
                    waveDelay: 0.6,
                    waveAmplitude: 0.25,
                    blur: 0.12,
                    glow: 0.3
                },
                manual: {
                    ...baseManual,
                    parallelStrength: 0.85,
                    parallelPresence: 0.85,
                    parallelZoom: 0.7,
                    parallelZoomDrift: 0.6,
                    parallelSpin: 0.7,
                    parallelThickness: 0.6,
                    ringOverlayStrength: 0.25,
                    blobCount: 8
                },
                vignetteShape: 0.35
            }
        };
        
        const preset = presets[presetName];
        if (preset) {
            if (preset.state) {
                Object.entries(preset.state).forEach(([key, value]) => {
                    const sliderId = this.stateSliderByDimension.get(key);
                    if (sliderId && this.lockedSliders.has(sliderId)) return;
                    this.setStateDimensionInstant(key, value);
                });
            }
            
            if (preset.manual) {
                Object.entries(preset.manual).forEach(([key, value]) => {
                    const sliderId = this.manualSliderByKey.get(key);
                    if (sliderId && this.lockedSliders.has(sliderId)) return;
                    this.manualVisual[key] = value;
                });
            }
            
            if (preset.vignetteShape !== undefined) {
                const vignetteSlider = this.manualSliderByKey.get('vignetteShape') || 'ctrl-vignetteShape';
                if (!this.lockedSliders.has(vignetteSlider)) {
                    this.vignetteShape = preset.vignetteShape;
                }
            }
            
            // Update slider positions
            this.updateSliderFromState();
            this.updateManualSliders();
        }
    }
    
    updateSliderFromState() {
        const updateSlider = (id, dimension, multiplier = 1) => {
            if (this.lockedSliders.has(id)) return;
            const slider = document.getElementById(id);
            const valueSpan = document.getElementById(id.replace('ctrl-', 'val-'));
            if (slider && this.stateEngine) {
                const idx = this.stateEngine.dimensions[dimension];
                if (idx !== undefined) {
                    const value = this.stateEngine.current[idx] * multiplier;
                    slider.value = value;
                    if (valueSpan) valueSpan.textContent = value.toFixed(2);
                }
            }
        };
        
        this.stateSliderMeta.forEach((meta, sliderId) => {
            updateSlider(sliderId, meta.dimension, meta.scale);
        });
    }

    updateManualSliders() {
        const updateManual = (id, value, formatter) => {
            if (this.lockedSliders.has(id)) return;
            const slider = document.getElementById(id);
            const valueSpan = document.getElementById(id.replace('ctrl-', 'val-'));
            if (slider) {
                slider.value = value;
                if (valueSpan) {
                    valueSpan.textContent = formatter ? formatter(value) : value.toFixed(2);
                }
            }
        };
        
        updateManual('ctrl-ringDelay', this.manualVisual.ringDelay);
        updateManual('ctrl-ringOverlayStrength', this.manualVisual.ringOverlayStrength);
        updateManual('ctrl-ringOverlayWidth', this.manualVisual.ringOverlayWidth);
        
        updateManual('ctrl-parallelStrength', this.manualVisual.parallelStrength);
        updateManual('ctrl-parallelPresence', this.manualVisual.parallelPresence);
        updateManual('ctrl-parallelZoom', this.manualVisual.parallelZoom);
        updateManual('ctrl-parallelZoomDrift', this.manualVisual.parallelZoomDrift);
        updateManual('ctrl-parallelThickness', this.manualVisual.parallelThickness);
        updateManual('ctrl-parallelSpin', this.manualVisual.parallelSpin);
        
        updateManual('ctrl-blobCount', this.manualVisual.blobCount, (v) => Math.round(v).toString());
        updateManual('ctrl-blobSpread', this.manualVisual.blobSpread);
        updateManual('ctrl-blobScale', this.manualVisual.blobScale);
        updateManual('ctrl-blobMotion', this.manualVisual.blobMotion);
        updateManual('ctrl-blobBlur', this.manualVisual.blobBlur);
        updateManual('ctrl-blobSmear', this.manualVisual.blobSmear);
        updateManual('ctrl-blobLighten', this.manualVisual.blobLighten);
        updateManual('ctrl-blobInvert', this.manualVisual.blobInvert);
        updateManual('ctrl-blobFade', this.manualVisual.blobFade);
        updateManual('ctrl-blobWarp', this.manualVisual.blobWarp);
        updateManual('ctrl-blobOffsetX', this.manualVisual.blobOffsetX);
        updateManual('ctrl-blobOffsetY', this.manualVisual.blobOffsetY);
        if (!this.lockedSliders.has('ctrl-vignetteShape')) {
            updateManual('ctrl-vignetteShape', this.vignetteShape ?? 0.5);
        }
    }
    
    updateDebugFPS() {
        const fpsEl = document.getElementById('debug-fps');
        if (fpsEl) {
            fpsEl.textContent = `FPS: ${this.fps.toFixed(1)}`;
        }
        
        // Update face tracking status
        const stateEl = document.getElementById('debug-state');
        if (stateEl && this.faceTracker) {
            const faceData = this.faceTracker.getFaceData();
            if (faceData.detected) {
                // Show rich face data
                const lines = [
                    `Face: ✓`,
                    `Yaw:${faceData.headYaw?.toFixed(2)||0} Pitch:${faceData.headPitch?.toFixed(2)||0}`,
                    `Eyes:${faceData.eyesOpen?.toFixed(2)||1} Mouth:${faceData.mouthOpen?.toFixed(2)||0}`,
                    `👀:${faceData.lookingAtScreen?.toFixed(2)||0.5} ${faceData.talking?'💬':''} ${faceData.blinking?'😑':''}`
                ];
                stateEl.innerHTML = lines.join('<br>');
                stateEl.style.color = '#4f4';
            } else {
                stateEl.textContent = `Face: Not detected`;
                stateEl.style.color = '#f88';
            }
        }
        
        // Update audio status
        const audioEl = document.getElementById('debug-audio');
        if (audioEl) {
            const audioOn = this.enabledInputs.sound && this.audioEngine?.isPlaying;
            const isMuted = this.audioEngine?.isMuted;
            const label = !audioOn ? '🔇 Off' : (isMuted ? '🔇 Muted' : '🔊 Playing');
            audioEl.textContent = `Audio: ${label}`;
        }
    }
    
    /**
     * Update slider positions to reflect current state values
     * This shows how face/audio input is affecting parameters in real-time
     * Skips sliders that user is currently interacting with
     */
    updateSlidersFromState() {
        if (!this.stateEngine) return;
        
        this.stateSliderMeta.forEach((meta, sliderId) => {
            if (this.activeSliders.has(sliderId)) return;
            if (this.lockedSliders.has(sliderId)) return;
            
            const sliderEl = document.getElementById(sliderId);
            const valueEl = document.getElementById(sliderId.replace('ctrl-', 'val-'));
            if (!sliderEl) return;
            
            const value = this.stateEngine.get(meta.dimension);
            if (value !== undefined) {
                const displayValue = value * meta.scale;
                sliderEl.value = displayValue;
                if (valueEl) {
                    valueEl.textContent = displayValue.toFixed(2);
                }
            }
        });
    }
    
    // =========================================
    // CLEANUP
    // =========================================
    
    dispose() {
        this.isRunning = false;
        
        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeydown);
        document.removeEventListener('keyup', this.handleKeyup);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mousedown', this.handlePointerDown);
        document.removeEventListener('mousemove', this.handlePointerMove);
        document.removeEventListener('mouseup', this.handlePointerUp);
        document.removeEventListener('touchstart', this.handlePointerDown);
        document.removeEventListener('touchmove', this.handlePointerMove);
        document.removeEventListener('touchend', this.handlePointerUp);
        document.removeEventListener('touchcancel', this.handlePointerUp);
        
        // Dispose components
        this.inputManager?.dispose();
        this.audioEngine?.dispose();
        this.visualEngine?.dispose();
        this.faceTracker?.dispose();
        this.handTracker?.dispose();
        
        console.log('InnerReflection: Disposed');
    }
}

// =========================================
// APPLICATION ENTRY POINT
// =========================================

let app = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✨ Inner Reflection - Initializing...');
    
    app = new InnerReflectionApp();
    await app.init();
    
    // Handle visibility change (pause when tab is hidden)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            app.isPaused = true;
        } else {
            app.isPaused = false;
        }
    });
    
    // Handle beforeunload (cleanup)
    window.addEventListener('beforeunload', () => {
        app.dispose();
    });
    
    console.log('✨ Inner Reflection - Ready');
    console.log('🎹 Controls: ESC=pause, `=debug, Ctrl+F=fullscreen');
    console.log('🎹 Play keys A-Z and 0-9 like a piano to influence the visuals!');
});
