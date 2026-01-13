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

class InnerReflectionApp {
    constructor() {
        // Core components
        this.inputManager = null;
        this.audioEngine = null;
        this.visualEngine = null;
        this.faceTracker = null;
        this.stateEngine = null;
        
        // State
        this.isRunning = false;
        this.isPaused = false;
        this.lastTime = 0;
        this.frameCount = 0;
        
        // Performance monitoring
        this.fps = 0;
        this.fpsHistory = [];
        
        // DOM elements
        this.canvas = null;
        this.startScreen = null;
        this.startButton = null;
        this.loadingScreen = null;
        
        // User choices
        this.enabledInputs = {
            microphone: true,
            camera: true,
            accelerometer: false,
            sound: true
        };
        
        // Face feature tracking state
        this.wasTalking = false;
        
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
        this.faceOverlay = document.getElementById('face-overlay');
        this.faceCtx = this.faceOverlay?.getContext('2d');
        if (this.faceOverlay) {
            this.faceOverlay.width = 160;
            this.faceOverlay.height = 200;
        }
        
        // Initialize components
        this.inputManager = new InputManager();
        this.audioEngine = new AudioEngine();
        this.visualEngine = new VisualEngine();
        this.faceTracker = new FaceTracker();
        this.stateEngine = new StateEngine();
        
        // Initialize input manager (sets up pointer events, checks capabilities)
        await this.inputManager.init();
        
        // Initialize visual engine (sets up Three.js, shaders)
        await this.visualEngine.init(this.canvas);
        
        // Set up UI event listeners
        this.setupUI();
        
        // Set up keyboard and mouse controls
        document.addEventListener('keydown', this.handleKeydown);
        document.addEventListener('keyup', this.handleKeyup);
        document.addEventListener('mousemove', this.handleMouseMove);
        
        // Start preview render (behind glass blur)
        this.startPreview();
        
        console.log('InnerReflection: Initialized');
    }
    
    setupUI() {
        // Permission toggles
        const toggles = document.querySelectorAll('.permission-toggle input[type="checkbox"]');
        toggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const permission = e.target.closest('.permission-toggle').dataset.permission;
                this.enabledInputs[permission] = e.target.checked;
                console.log(`InnerReflection: ${permission} ${e.target.checked ? 'enabled' : 'disabled'}`);
            });
        });
        
        // Start button
        this.startButton.addEventListener('click', () => this.start());
        
        // Also allow clicking the title to start
        const title = document.querySelector('.start-title');
        if (title) {
            title.style.cursor = 'pointer';
            title.addEventListener('click', () => this.start());
        }
    }
    
    startPreview() {
        // Run a simplified render loop for the preview behind the start screen
        const previewLoop = (time) => {
            if (this.isRunning) return; // Stop preview when main experience starts
            
            const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
            this.lastTime = time;
            
            // Update state engine even in preview for drift effect
            this.stateEngine.update(deltaTime);
            
            // Render at reduced rate for preview
            if (this.frameCount % 2 === 0) {
                const visualState = this.stateEngine.getVisualState();
                this.visualEngine.render(deltaTime, visualState);
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
        console.log('InnerReflection: Starting experience...');
        
        // Show loading
        this.showLoading(true);
        this.startButton.disabled = true;
        
        try {
            // Request permissions and initialize inputs
            await this.initializeInputs();
            
            // Initialize audio engine (but only start if sound enabled)
            await this.audioEngine.init();
            
            // Check sound toggle
            const soundToggle = document.getElementById('toggle-sound');
            this.enabledInputs.sound = soundToggle ? soundToggle.checked : true;
            
            // Connect microphone to audio engine if enabled
            if (this.enabledInputs.microphone && this.inputManager.enabled.microphone) {
                await this.audioEngine.connectMicrophone(this.inputManager.micStream);
            }
            
            // Start face tracking if camera is enabled
            if (this.enabledInputs.camera && this.inputManager.enabled.camera) {
                await this.faceTracker.init(this.inputManager.getVideoElement());
                await this.faceTracker.start();
                
                // Set up face tracking callbacks
                this.faceTracker.onFaceDetected = (data) => {
                    console.log('Face detected');
                };
                
                this.faceTracker.onFaceLost = () => {
                    console.log('Face lost');
                };
            }
            
            // Hide start screen
            this.hideStartScreen();
            
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
        } finally {
            this.showLoading(false);
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
        
        // Update FPS counter
        this.updateFPS(deltaTime);
        
        if (!this.isPaused) {
            // Update inputs
            this.inputManager.update();
            
            // Get input data
            const audioData = this.inputManager.getAudioData();
            const motionData = this.inputManager.getMotionData();
            const faceData = this.faceTracker.getFaceData();
            const gestureData = this.inputManager.getGestureData();
            
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
            if (this.inputManager.enabled.camera && faceData.detected) {
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
            this.stateEngine.update(deltaTime);
            
            // Get state for rendering
            const visualState = this.stateEngine.getVisualState();
            const audioState = this.stateEngine.getAudioState();
            
            // Modulate audio engine (only if sound enabled)
            if (this.enabledInputs.sound) {
                this.audioEngine.modulateFromState(audioState);
                
                // Apply generative behaviors
                this.audioEngine.applySpeedDrift?.(deltaTime);
            }
            
            // Render visuals
            this.visualEngine.render(deltaTime, visualState);
            
            // Draw face visualization overlay
            if (this.inputManager.enabled.camera) {
                this.drawFaceOverlay(faceData);
            }
            
            // Update debug FPS display
            if (this.frameCount % 30 === 0) {
                this.updateDebugFPS();
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
        
        if (!faceData || !faceData.detected) {
            // Draw "no face" indicator
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
        const mirroredX = 1 - (faceData.faceX || 0.5);
        const faceY = faceData.faceY || 0.5;
        
        // Map face position to overlay canvas
        // Allow face to move within the overlay area
        const moveRangeX = 50; // pixels of movement range
        const moveRangeY = 40;
        const cx = w/2 + (mirroredX - 0.5) * moveRangeX;
        const cy = h/2 - 15 + (faceY - 0.5) * moveRangeY;
        
        // Face size for scaling (based on distance)
        const baseScale = 0.65 + (faceData.faceSize || 0.3) * 0.5;
        const scale = Math.max(0.5, Math.min(1.0, baseScale));
        
        // === HEAD ROTATION ===
        // Yaw: turning head left/right - FLIP for mirror
        const yaw = -(faceData.headYaw || 0);
        // Pitch: tilting up/down
        const pitch = faceData.headPitch || 0;
        // Roll: tilting head sideways - FLIP for mirror
        const roll = -(faceData.headRoll || 0);
        
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
        
        // Swap left/right brow data due to mirror
        const leftBrowRaise = (faceData.rightBrowRaise || 0) * 6 * scale;
        const rightBrowRaise = (faceData.leftBrowRaise || 0) * 6 * scale;
        const browFurrow = (faceData.browFurrow || 0) * 4 * scale;
        
        // Left eyebrow (viewer's left = person's right due to mirror)
        const leftBrowShow = yaw < 0.5; // hide when turned far right
        if (leftBrowShow) {
            ctx.beginPath();
            const lbx = -14 * scale * yawSquish + yawOffset;
            ctx.moveTo(lbx - browW * 0.6, browY - leftBrowRaise + browFurrow);
            ctx.quadraticCurveTo(lbx, browY - leftBrowRaise - 3 * scale, lbx + browW * 0.4 - browFurrow, browY - leftBrowRaise/2);
            ctx.stroke();
        }
        
        // Right eyebrow
        const rightBrowShow = yaw > -0.5;
        if (rightBrowShow) {
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
        
        // Swap eye openness due to mirror
        const leftEyeOpen = Math.max(0.15, faceData.rightEyeOpen || 0.7);
        const rightEyeOpen = Math.max(0.15, faceData.leftEyeOpen || 0.7);
        
        // Gaze direction - flip X for mirror
        const gazeX = -(faceData.gazeX || 0) * 2.5 * scale;
        const gazeY = (faceData.gazeY || 0) * 2 * scale;
        
        // Left eye
        const leftEyeShow = yaw < 0.6;
        if (leftEyeShow) {
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
        
        // Right eye
        const rightEyeShow = yaw > -0.6;
        if (rightEyeShow) {
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
        const mouthW = mouthBaseW + (faceData.mouthWidth || 0.4) * 8 * scale * yawSquish;
        const mouthOpen = (faceData.mouthOpen || 0) * 10 * scale;
        
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
        
        if (faceData.talking) {
            ctx.fillText('💬', statusX, statusY);
            statusX += 20;
        }
        if (faceData.blinking) {
            ctx.fillText('😑', statusX, statusY);
            statusX += 20;
        }
        if ((faceData.lookingAtScreen || 0) > 0.6) {
            ctx.fillText('👁', statusX, statusY);
            statusX += 20;
        }
        
        // Engagement bar
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(5, h - 8, w - 10, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        const engagement = Math.max(0, Math.min(1, faceData.engagement || 0.5));
        ctx.fillRect(5, h - 8, (w - 10) * engagement, 4);
    }
    
    // =========================================
    // FACE TRACKING SMOOTHING
    // Heavy smoothing with spring physics to prevent flickering
    // =========================================
    
    updateFaceSmoothing(faceData, deltaTime) {
        // Spring constants for VERY smooth motion
        const stiffness = 0.8;  // Low stiffness = slower response
        const damping = 0.92;   // High damping = less oscillation
        const pushRate = 0.05;  // How fast push values change
        
        // Update smoothed position targets
        this.faceSmoothing.x.target = faceData.faceX || faceData.x || 0.5;
        this.faceSmoothing.y.target = faceData.faceY || faceData.y || 0.5;
        this.faceSmoothing.size.target = faceData.faceSize || faceData.size || 0.3;
        
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
        const xOffset = (this.faceSmoothing.x.value - 0.5) * 2; // -1 to 1
        const yOffset = (this.faceSmoothing.y.value - 0.5) * 2; // -1 to 1  
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
        const debugPanel = document.getElementById('debug-panel');
        const debugToggle = document.getElementById('debug-toggle');
        const debugClose = document.getElementById('debug-close');
        
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
        this.setupSlider('ctrl-hue1', 'val-hue1', (v) => this.setStateDimension('colorHue1', v));
        this.setupSlider('ctrl-hue2', 'val-hue2', (v) => this.setStateDimension('colorHue2', v));
        this.setupSlider('ctrl-saturation', 'val-saturation', (v) => this.setStateDimension('colorSaturation', v));
        this.setupSlider('ctrl-brightness', 'val-brightness', (v) => this.setStateDimension('colorBrightness', v));
        
        this.setupSlider('ctrl-strength', 'val-strength', (v) => this.setStateDimension('displacementStrength', v));
        this.setupSlider('ctrl-radius', 'val-radius', (v) => this.setStateDimension('displacementRadius', v));
        this.setupSlider('ctrl-rings', 'val-rings', (v) => this.setStateDimension('displacementRings', v / 20));
        this.setupSlider('ctrl-centerX', 'val-centerX', (v) => this.setStateDimension('displacementX', v));
        this.setupSlider('ctrl-centerY', 'val-centerY', (v) => this.setStateDimension('displacementY', v));
        this.setupSlider('ctrl-chromatic', 'val-chromatic', (v) => this.setStateDimension('displacementChromatic', v * 10));
        this.setupSlider('ctrl-wobble', 'val-wobble', (v) => this.setStateDimension('displacementWobble', v * 10));
        
        this.setupSlider('ctrl-circle2', 'val-circle2', (v) => this.setStateDimension('rippleOrigin2Strength', v * 2));
        this.setupSlider('ctrl-circle3', 'val-circle3', (v) => this.setStateDimension('rippleOrigin3Strength', v * 2));
        
        this.setupSlider('ctrl-morph', 'val-morph', (v) => this.setStateDimension('morphProgress', v));
        this.setupSlider('ctrl-morphType', 'val-morphType', (v) => this.setStateDimension('morphType', v / 2));
        
        // Shape & Wave Motion controls
        this.setupSlider('ctrl-shapeType', 'val-shapeType', (v) => this.setStateDimension('shapeType', v / 10));
        this.setupSlider('ctrl-waveDelay', 'val-waveDelay', (v) => this.setStateDimension('waveDelay', v / 2));
        this.setupSlider('ctrl-waveAmplitude', 'val-waveAmplitude', (v) => this.setStateDimension('waveAmplitude', v / 0.3));
        this.setupSlider('ctrl-waveSpeed', 'val-waveSpeed', (v) => this.setStateDimension('waveSpeed', v / 3));
        this.setupSlider('ctrl-edgeSharpness', 'val-edgeSharpness', (v) => this.setStateDimension('edgeSharpness', v / 0.3));
        this.setupSlider('ctrl-minRadius', 'val-minRadius', (v) => this.setStateDimension('minRadius', v / 0.5));
        this.setupSlider('ctrl-rotation', 'val-rotation', (v) => this.setStateDimension('shapeRotation', v / 6.28));
        this.setupSlider('ctrl-rotationSpeed', 'val-rotationSpeed', (v) => this.setStateDimension('rotationSpeed', v));
        this.setupSlider('ctrl-foldAmount', 'val-foldAmount', (v) => this.setStateDimension('foldAmount', v));
        this.setupSlider('ctrl-invertAmount', 'val-invertAmount', (v) => this.setStateDimension('invertAmount', v));
        this.setupSlider('ctrl-secondaryWave', 'val-secondaryWave', (v) => this.setStateDimension('secondaryWave', v));
        this.setupSlider('ctrl-tertiaryWave', 'val-tertiaryWave', (v) => this.setStateDimension('tertiaryWave', v));
        
        this.setupSlider('ctrl-blur', 'val-blur', (v) => this.setStateDimension('blur', v / 2));
        this.setupSlider('ctrl-glow', 'val-glow', (v) => this.setStateDimension('glow', v));
        this.setupSlider('ctrl-vignette', 'val-vignette', (v) => this.setStateDimension('vignette', v));
        
        this.setupSlider('ctrl-timeSpeed', 'val-timeSpeed', (v) => { this.timeSpeedMultiplier = v; });
        this.setupSlider('ctrl-driftSpeed', 'val-driftSpeed', (v) => { this.driftSpeedMultiplier = v; });
        
        // =========================================
        // AUDIO CONTROLS - Master
        // =========================================
        
        this.setupSlider('ctrl-volume', 'val-volume', (v) => {
            if (this.audioEngine && this.audioEngine.masterGain) {
                this.audioEngine.masterGain.gain.rampTo(v, 0.1);
            }
        });
        this.setupSlider('ctrl-reverb', 'val-reverb', (v) => {
            if (this.audioEngine && this.audioEngine.effects && this.audioEngine.effects.reverb) {
                this.audioEngine.effects.reverb.wet.rampTo(v, 0.1);
            }
        });
        this.setupSlider('ctrl-masterDelay', 'val-masterDelay', (v) => {
            if (this.audioEngine && this.audioEngine.effects && this.audioEngine.effects.delay) {
                this.audioEngine.effects.delay.wet.rampTo(v, 0.1);
            }
        });
        this.setupSlider('ctrl-masterFilter', 'val-masterFilter', (v) => {
            if (this.audioEngine && this.audioEngine.masterFilter) {
                this.audioEngine.masterFilter.frequency.rampTo(v, 0.2);
            }
        });
        
        // Mute checkbox
        const muteCheckbox = document.getElementById('ctrl-mute');
        if (muteCheckbox) {
            muteCheckbox.addEventListener('change', (e) => {
                if (this.audioEngine) {
                    if (e.target.checked) {
                        this.audioEngine.stop();
                    } else if (this.enabledInputs.sound) {
                        this.audioEngine.start();
                    }
                }
            });
        }
        
        // =========================================
        // AUDIO CONTROLS - Drone Layers
        // =========================================
        
        this.setupDroneToggle('ctrl-drone-base', 'base');
        this.setupDroneToggle('ctrl-drone-mid', 'mid');
        this.setupDroneToggle('ctrl-drone-high', 'high');
        this.setupDroneToggle('ctrl-drone-pad', 'pad');
        
        this.setupSlider('ctrl-droneBase', 'val-droneBase', (v) => {
            this.audioEngine?.setDroneVolume('base', v);
        });
        this.setupSlider('ctrl-droneBaseFilter', 'val-droneBaseFilter', (v) => {
            this.audioEngine?.setDroneFilter('base', v);
        });
        this.setupSlider('ctrl-droneMid', 'val-droneMid', (v) => {
            this.audioEngine?.setDroneVolume('mid', v);
        });
        this.setupSlider('ctrl-droneMidFilter', 'val-droneMidFilter', (v) => {
            this.audioEngine?.setDroneFilter('mid', v);
        });
        this.setupSlider('ctrl-droneHigh', 'val-droneHigh', (v) => {
            this.audioEngine?.setDroneVolume('high', v);
        });
        this.setupSlider('ctrl-droneHighFilter', 'val-droneHighFilter', (v) => {
            this.audioEngine?.setDroneFilter('high', v);
        });
        this.setupSlider('ctrl-dronePad', 'val-dronePad', (v) => {
            this.audioEngine?.setDroneVolume('pad', v);
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
        this.setupSlider('ctrl-granAmbientVol', 'val-granAmbientVol', (v) => {
            this.audioEngine?.setGranularParam('ambient', 'volume', v);
        });
        this.setupSlider('ctrl-granAmbientSize', 'val-granAmbientSize', (v) => {
            this.audioEngine?.setGranularParam('ambient', 'grainSize', v);
        });
        this.setupSlider('ctrl-granAmbientOverlap', 'val-granAmbientOverlap', (v) => {
            this.audioEngine?.setGranularParam('ambient', 'overlap', v);
        });
        this.setupSlider('ctrl-granAmbientSpeed', 'val-granAmbientSpeed', (v) => {
            this.audioEngine?.setGranularParam('ambient', 'playbackRate', v);
        });
        this.setupSlider('ctrl-granAmbientFilter', 'val-granAmbientFilter', (v) => {
            this.audioEngine?.setGranularParam('ambient', 'filterFreq', v);
        });
        this.setupSlider('ctrl-granAmbientReverb', 'val-granAmbientReverb', (v) => {
            this.audioEngine?.setGranularParam('ambient', 'reverbWet', v);
        });
        this.setupSlider('ctrl-granAmbientDelay', 'val-granAmbientDelay', (v) => {
            this.audioEngine?.setGranularParam('ambient', 'delayWet', v);
        });
        this.setupSlider('ctrl-granAmbientDelayTime', 'val-granAmbientDelayTime', (v) => {
            this.audioEngine?.setGranularParam('ambient', 'delayTime', v);
        });
        
        // Choppy layer controls
        this.setupSlider('ctrl-granChoppyVol', 'val-granChoppyVol', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'volume', v);
        });
        this.setupSlider('ctrl-granChoppySize', 'val-granChoppySize', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'grainSize', v);
        });
        this.setupSlider('ctrl-granChoppyOverlap', 'val-granChoppyOverlap', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'overlap', v);
        });
        this.setupSlider('ctrl-granChoppySpeed', 'val-granChoppySpeed', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'playbackRate', v);
        });
        this.setupSlider('ctrl-granChoppyFilter', 'val-granChoppyFilter', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'filterFreq', v);
        });
        this.setupSlider('ctrl-granChoppyQ', 'val-granChoppyQ', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'filterQ', v);
        });
        this.setupSlider('ctrl-granChoppyReverb', 'val-granChoppyReverb', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'reverbWet', v);
        });
        this.setupSlider('ctrl-granChoppyDelay', 'val-granChoppyDelay', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'delayWet', v);
        });
        this.setupSlider('ctrl-granChoppyDelayTime', 'val-granChoppyDelayTime', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'delayTime', v);
        });
        this.setupSlider('ctrl-granChoppyRandom', 'val-granChoppyRandom', (v) => {
            this.audioEngine?.setGranularParam('choppy', 'randomness', v);
        });
        
        // Shimmer layer controls
        this.setupSlider('ctrl-granShimmerVol', 'val-granShimmerVol', (v) => {
            this.audioEngine?.setGranularParam('shimmer', 'volume', v);
        });
        this.setupSlider('ctrl-granShimmerSize', 'val-granShimmerSize', (v) => {
            this.audioEngine?.setGranularParam('shimmer', 'grainSize', v);
        });
        this.setupSlider('ctrl-granShimmerOverlap', 'val-granShimmerOverlap', (v) => {
            this.audioEngine?.setGranularParam('shimmer', 'overlap', v);
        });
        this.setupSlider('ctrl-granShimmerSpeed', 'val-granShimmerSpeed', (v) => {
            this.audioEngine?.setGranularParam('shimmer', 'playbackRate', v);
        });
        this.setupSlider('ctrl-granShimmerFilter', 'val-granShimmerFilter', (v) => {
            this.audioEngine?.setGranularParam('shimmer', 'filterFreq', v);
        });
        this.setupSlider('ctrl-granShimmerReverb', 'val-granShimmerReverb', (v) => {
            this.audioEngine?.setGranularParam('shimmer', 'reverbWet', v);
        });
        this.setupSlider('ctrl-granShimmerDelay', 'val-granShimmerDelay', (v) => {
            this.audioEngine?.setGranularParam('shimmer', 'delayWet', v);
        });
        this.setupSlider('ctrl-granShimmerPitch', 'val-granShimmerPitch', (v) => {
            this.audioEngine?.setGranularParam('shimmer', 'pitchShift', v);
        });
        
        // Deep layer controls
        this.setupSlider('ctrl-granDeepVol', 'val-granDeepVol', (v) => {
            this.audioEngine?.setGranularParam('deep', 'volume', v);
        });
        this.setupSlider('ctrl-granDeepSize', 'val-granDeepSize', (v) => {
            this.audioEngine?.setGranularParam('deep', 'grainSize', v);
        });
        this.setupSlider('ctrl-granDeepOverlap', 'val-granDeepOverlap', (v) => {
            this.audioEngine?.setGranularParam('deep', 'overlap', v);
        });
        this.setupSlider('ctrl-granDeepSpeed', 'val-granDeepSpeed', (v) => {
            this.audioEngine?.setGranularParam('deep', 'playbackRate', v);
        });
        this.setupSlider('ctrl-granDeepFilter', 'val-granDeepFilter', (v) => {
            this.audioEngine?.setGranularParam('deep', 'filterFreq', v);
        });
        this.setupSlider('ctrl-granDeepQ', 'val-granDeepQ', (v) => {
            this.audioEngine?.setGranularParam('deep', 'filterQ', v);
        });
        this.setupSlider('ctrl-granDeepReverb', 'val-granDeepReverb', (v) => {
            this.audioEngine?.setGranularParam('deep', 'reverbWet', v);
        });
        this.setupSlider('ctrl-granDeepDelay', 'val-granDeepDelay', (v) => {
            this.audioEngine?.setGranularParam('deep', 'delayWet', v);
        });
        this.setupSlider('ctrl-granDeepDelayTime', 'val-granDeepDelayTime', (v) => {
            this.audioEngine?.setGranularParam('deep', 'delayTime', v);
        });
        
        // =========================================
        // AUDIO CONTROLS - Mic Processing
        // =========================================
        
        this.setupMicToggle('ctrl-mic-enabled');
        
        this.setupSlider('ctrl-micVolume', 'val-micVolume', (v) => {
            this.audioEngine?.setMicParam('volume', v);
        });
        this.setupSlider('ctrl-micFilter', 'val-micFilter', (v) => {
            this.audioEngine?.setMicParam('filterFreq', v);
        });
        this.setupSlider('ctrl-micReverb', 'val-micReverb', (v) => {
            this.audioEngine?.setMicParam('reverbWet', v);
        });
        this.setupSlider('ctrl-micDelay', 'val-micDelay', (v) => {
            this.audioEngine?.setMicParam('delayWet', v);
        });
        this.setupSlider('ctrl-micDelayFeedback', 'val-micDelayFeedback', (v) => {
            this.audioEngine?.setMicParam('delayFeedback', v);
        });
        this.setupSlider('ctrl-micChorus', 'val-micChorus', (v) => {
            this.audioEngine?.setMicParam('chorusDepth', v);
        });
        
        // =========================================
        // AUDIO CONTROLS - Global Effects
        // =========================================
        
        this.setupSlider('ctrl-reverbDecay', 'val-reverbDecay', (v) => {
            this.audioEngine?.setGlobalEffect('reverbDecay', v);
        });
        this.setupSlider('ctrl-delayFeedback', 'val-delayFeedback', (v) => {
            this.audioEngine?.setGlobalEffect('delayFeedback', v);
        });
        this.setupSlider('ctrl-chorusRate', 'val-chorusRate', (v) => {
            this.audioEngine?.setGlobalEffect('chorusRate', v);
        });
        this.setupSlider('ctrl-chorusDepth', 'val-chorusDepth', (v) => {
            this.audioEngine?.setGlobalEffect('chorusDepth', v);
        });
        this.setupSlider('ctrl-phaserRate', 'val-phaserRate', (v) => {
            this.audioEngine?.setGlobalEffect('phaserRate', v);
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
        
        // Initialize multipliers
        this.timeSpeedMultiplier = 0.3;
        this.driftSpeedMultiplier = 0.5;
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
    
    setupSlider(sliderId, valueId, callback) {
        const slider = document.getElementById(sliderId);
        const valueSpan = document.getElementById(valueId);
        
        if (slider && valueSpan) {
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                valueSpan.textContent = value.toFixed(2);
                callback(value);
            });
        }
    }
    
    setStateDimension(name, value) {
        if (this.stateEngine && this.stateEngine.dimensions[name] !== undefined) {
            const idx = this.stateEngine.dimensions[name];
            this.stateEngine.current[idx] = value;
            this.stateEngine.target[idx] = value;
        }
    }
    
    applyPreset(presetName) {
        console.log('Applying preset:', presetName);
        
        const presets = {
            calm: {
                colorHue1: 0.55, colorHue2: 0.5, colorSaturation: 0.5, colorBrightness: 0.55,
                displacementStrength: 0.4, displacementRadius: 0.6, displacementRings: 0.4,
                displacementX: 0.5, displacementY: 0.5, displacementChromatic: 0.3, displacementWobble: 0.2,
                rippleOrigin2Strength: 0, rippleOrigin3Strength: 0,
                morphProgress: 0, blur: 0.4, glow: 0.3, vignette: 0.3
            },
            softBlobs: {
                colorHue1: 0.5, colorHue2: 0.85, colorSaturation: 0.7, colorBrightness: 0.6,
                displacementStrength: 0.2, displacementRadius: 0.4, displacementRings: 0.15,
                displacementX: 0.3, displacementY: 0.4, displacementChromatic: 0.4, displacementWobble: 0.5,
                rippleOrigin2Strength: 0.3, rippleOrigin3Strength: 0.2,
                morphProgress: 0, blur: 0.8, glow: 0.5, vignette: 0.2
            },
            singleRing: {
                colorHue1: 0.9, colorHue2: 0.85, colorSaturation: 0.8, colorBrightness: 0.6,
                displacementStrength: 0.6, displacementRadius: 0.7, displacementRings: 0.1,
                displacementX: 0.5, displacementY: 0.5, displacementChromatic: 0.5, displacementWobble: 0.1,
                rippleOrigin2Strength: 0, rippleOrigin3Strength: 0,
                morphProgress: 0, blur: 0.1, glow: 0.2, vignette: 0.5
            },
            multiRings: {
                colorHue1: 0.55, colorHue2: 0.1, colorSaturation: 0.9, colorBrightness: 0.55,
                displacementStrength: 0.5, displacementRadius: 0.9, displacementRings: 0.6,
                displacementX: 0.5, displacementY: 0.5, displacementChromatic: 0.6, displacementWobble: 0.15,
                rippleOrigin2Strength: 0.4, rippleOrigin3Strength: 0.3,
                morphProgress: 0, blur: 0.2, glow: 0.3, vignette: 0.3
            },
            chromatic: {
                colorHue1: 0.0, colorHue2: 0.33, colorSaturation: 1.0, colorBrightness: 0.6,
                displacementStrength: 0.7, displacementRadius: 1.0, displacementRings: 0.8,
                displacementX: 0.5, displacementY: 0.5, displacementChromatic: 1.0, displacementWobble: 0.1,
                rippleOrigin2Strength: 0.2, rippleOrigin3Strength: 0.15,
                morphProgress: 0, blur: 0.1, glow: 0.4, vignette: 0.2
            },
            angular: {
                colorHue1: 0.95, colorHue2: 0.45, colorSaturation: 0.85, colorBrightness: 0.5,
                displacementStrength: 0.5, displacementRadius: 0.8, displacementRings: 0.5,
                displacementX: 0.5, displacementY: 0.5, displacementChromatic: 0.3, displacementWobble: 0,
                rippleOrigin2Strength: 0, rippleOrigin3Strength: 0,
                morphProgress: 0.8, morphType: 0.5, blur: 0, glow: 0.3, vignette: 0.4
            },
            minimal: {
                colorHue1: 0.6, colorHue2: 0.58, colorSaturation: 0.3, colorBrightness: 0.7,
                displacementStrength: 0.2, displacementRadius: 0.5, displacementRings: 0.25,
                displacementX: 0.5, displacementY: 0.5, displacementChromatic: 0.1, displacementWobble: 0.05,
                rippleOrigin2Strength: 0, rippleOrigin3Strength: 0,
                morphProgress: 0, blur: 0.5, glow: 0.1, vignette: 0.5
            }
        };
        
        const preset = presets[presetName];
        if (preset) {
            Object.entries(preset).forEach(([key, value]) => {
                this.setStateDimension(key, value);
            });
            
            // Update slider positions
            this.updateSliderFromState();
        }
    }
    
    updateSliderFromState() {
        const updateSlider = (id, dimension, multiplier = 1) => {
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
        
        updateSlider('ctrl-hue1', 'colorHue1');
        updateSlider('ctrl-hue2', 'colorHue2');
        updateSlider('ctrl-saturation', 'colorSaturation');
        updateSlider('ctrl-brightness', 'colorBrightness');
        updateSlider('ctrl-strength', 'displacementStrength');
        updateSlider('ctrl-radius', 'displacementRadius');
        updateSlider('ctrl-rings', 'displacementRings', 20);
        updateSlider('ctrl-centerX', 'displacementX');
        updateSlider('ctrl-centerY', 'displacementY');
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
            audioEl.textContent = `Audio: ${audioOn ? '🔊 Playing' : '🔇 Off'}`;
        }
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
        
        // Dispose components
        this.inputManager?.dispose();
        this.audioEngine?.dispose();
        this.visualEngine?.dispose();
        this.faceTracker?.dispose();
        
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

