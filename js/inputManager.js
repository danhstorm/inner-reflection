/**
 * INNER REFLECTION - Input Manager
 * 
 * Handles all input sources: microphone, camera, accelerometer, touch, etc.
 * Processes and normalizes input data for use by visual and audio engines.
 */

class InputManager {
    constructor() {
        // State
        this.enabled = {
            microphone: false,
            camera: false,
            accelerometer: false
        };
        
        this.permissions = {
            microphone: 'pending',
            camera: 'pending',
            accelerometer: 'pending'
        };
        
        // Audio analysis
        this.audioContext = null;
        this.analyser = null;
        this.micStream = null;
        this.frequencyData = null;
        this.timeDomainData = null;
        
        // Processed audio values (smoothed)
        this.audio = {
            volume: Utils.createSmoother(0, 0.9),
            bass: Utils.createSmoother(0, 0.92),
            mid: Utils.createSmoother(0, 0.9),
            treble: Utils.createSmoother(0, 0.88),
            pitch: Utils.createSmoother(0, 0.85)
        };
        
        // Camera
        this.videoElement = null;
        this.cameraStream = null;
        
        // Accelerometer/Motion
        this.motion = {
            alpha: Utils.createSmoother(0, 0.8),  // Compass direction
            beta: Utils.createSmoother(0, 0.8),   // Front-back tilt
            gamma: Utils.createSmoother(0, 0.8),  // Left-right tilt
            accelerationX: Utils.createSmoother(0, 0.7),
            accelerationY: Utils.createSmoother(0, 0.7),
            accelerationZ: Utils.createSmoother(0, 0.7),
            shake: Utils.createSmoother(0, 0.6)
        };
        
        // Touch/Mouse
        this.pointer = {
            x: Utils.createSmoother(0.5, 0.8),
            y: Utils.createSmoother(0.5, 0.8),
            isDown: false,
            pressure: 0
        };
        
        // Touch gesture state
        this.gesture = {
            // Pinch gesture for zoom/intensity
            pinchScale: Utils.createSmoother(1.0, 0.85),
            pinchCenter: { x: 0.5, y: 0.5 },
            initialPinchDistance: 0,
            isPinching: false,
            
            // Two-finger rotation
            rotation: Utils.createSmoother(0, 0.85),
            initialRotation: 0,
            isRotating: false,
            
            // Swipe detection
            swipeVelocityX: Utils.createSmoother(0, 0.7),
            swipeVelocityY: Utils.createSmoother(0, 0.7),
            lastTouchX: 0,
            lastTouchY: 0,
            lastTouchTime: 0,
            
            // Multi-touch tracking
            touchCount: 0,
            touches: []
        };
        
        // Gesture callbacks
        this.onPinch = null;
        this.onRotate = null;
        this.onSwipe = null;
        
        // Shake detection
        this.lastAcceleration = { x: 0, y: 0, z: 0 };
        this.shakeThreshold = 15;
        
        // Callbacks
        this.onAudioData = null;
        this.onMotionData = null;
        this.onFaceData = null;
        
        this._boundHandlers = {};
    }
    
    // =========================================
    // INITIALIZATION
    // =========================================
    
    async init(options = {}) {
        console.log('InputManager: Initializing...');
        
        // Check device capabilities
        this.checkCapabilities();
        
        // Set up pointer events
        this.setupPointerEvents();
        
        return this;
    }
    
    checkCapabilities() {
        // Check for accelerometer support
        const hasMotion = Utils.hasDeviceMotion() || Utils.hasDeviceOrientation();
        const accelOption = document.getElementById('accelerometer-option');
        
        if (hasMotion && Utils.isMobile()) {
            if (accelOption) {
                accelOption.style.display = 'flex';
            }
        }
        
        console.log('InputManager: Device capabilities:', {
            isMobile: Utils.isMobile(),
            hasTouch: Utils.hasTouch(),
            hasMotion: hasMotion
        });
    }
    
    // =========================================
    // MICROPHONE
    // =========================================
    
    async requestMicrophone() {
        try {
            console.log('InputManager: Requesting microphone access...');
            
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            
            // Create audio context for analysis
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create analyser node
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = CONFIG.audio.mic.fftSize;
            this.analyser.smoothingTimeConstant = CONFIG.audio.mic.smoothing;
            
            // Connect microphone to analyser
            const source = this.audioContext.createMediaStreamSource(this.micStream);
            source.connect(this.analyser);
            
            // Create data arrays
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeDomainData = new Uint8Array(this.analyser.fftSize);
            
            this.enabled.microphone = true;
            this.permissions.microphone = 'granted';
            
            console.log('InputManager: Microphone enabled');
            return true;
            
        } catch (error) {
            console.error('InputManager: Microphone access denied:', error);
            this.permissions.microphone = 'denied';
            return false;
        }
    }
    
    analyzeMicrophone() {
        if (!this.enabled.microphone || !this.analyser) return;
        
        // Get frequency data
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeDomainData);
        
        const bufferLength = this.frequencyData.length;
        
        // Calculate overall volume (RMS)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += this.frequencyData[i];
        }
        const rawVolume = sum / bufferLength / 255;
        this.audio.volume.update(rawVolume);
        
        // Calculate frequency bands
        // Bass (20-250 Hz)
        const bassEnd = Math.floor(250 / (this.audioContext.sampleRate / 2) * bufferLength);
        let bassSum = 0;
        for (let i = 0; i < bassEnd; i++) {
            bassSum += this.frequencyData[i];
        }
        this.audio.bass.update(bassSum / bassEnd / 255);
        
        // Mid (250-2000 Hz)
        const midStart = bassEnd;
        const midEnd = Math.floor(2000 / (this.audioContext.sampleRate / 2) * bufferLength);
        let midSum = 0;
        for (let i = midStart; i < midEnd; i++) {
            midSum += this.frequencyData[i];
        }
        this.audio.mid.update(midSum / (midEnd - midStart) / 255);
        
        // Treble (2000-16000 Hz)
        const trebleStart = midEnd;
        const trebleEnd = Math.min(Math.floor(16000 / (this.audioContext.sampleRate / 2) * bufferLength), bufferLength);
        let trebleSum = 0;
        for (let i = trebleStart; i < trebleEnd; i++) {
            trebleSum += this.frequencyData[i];
        }
        this.audio.treble.update(trebleSum / (trebleEnd - trebleStart) / 255);
        
        // Call callback if set
        if (this.onAudioData) {
            this.onAudioData({
                volume: this.audio.volume.getValue(),
                bass: this.audio.bass.getValue(),
                mid: this.audio.mid.getValue(),
                treble: this.audio.treble.getValue(),
                frequencyData: this.frequencyData,
                timeDomainData: this.timeDomainData
            });
        }
    }
    
    getAudioData() {
        return {
            volume: this.audio.volume.getValue(),
            bass: this.audio.bass.getValue(),
            mid: this.audio.mid.getValue(),
            treble: this.audio.treble.getValue(),
            frequencyData: this.frequencyData,
            timeDomainData: this.timeDomainData
        };
    }
    
    // =========================================
    // CAMERA
    // =========================================
    
    async requestCamera() {
        try {
            console.log('InputManager: Requesting camera access...');
            
            this.videoElement = document.getElementById('camera-feed');
            
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            
            this.videoElement.srcObject = this.cameraStream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    resolve();
                };
            });
            
            this.enabled.camera = true;
            this.permissions.camera = 'granted';
            
            console.log('InputManager: Camera enabled');
            return true;
            
        } catch (error) {
            console.error('InputManager: Camera access denied:', error);
            this.permissions.camera = 'denied';
            return false;
        }
    }
    
    getVideoElement() {
        return this.videoElement;
    }
    
    getCameraStream() {
        return this.cameraStream;
    }
    
    // =========================================
    // ACCELEROMETER / DEVICE MOTION
    // =========================================
    
    async requestAccelerometer() {
        try {
            console.log('InputManager: Requesting accelerometer access...');
            
            // iOS 13+ requires permission request
            if (typeof DeviceOrientationEvent !== 'undefined' &&
                typeof DeviceOrientationEvent.requestPermission === 'function') {
                
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission !== 'granted') {
                    throw new Error('Permission denied');
                }
            }
            
            if (typeof DeviceMotionEvent !== 'undefined' &&
                typeof DeviceMotionEvent.requestPermission === 'function') {
                
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') {
                    throw new Error('Permission denied');
                }
            }
            
            // Set up event listeners
            this._boundHandlers.orientation = this.handleOrientation.bind(this);
            this._boundHandlers.motion = this.handleMotion.bind(this);
            
            window.addEventListener('deviceorientation', this._boundHandlers.orientation);
            window.addEventListener('devicemotion', this._boundHandlers.motion);
            
            this.enabled.accelerometer = true;
            this.permissions.accelerometer = 'granted';
            
            console.log('InputManager: Accelerometer enabled');
            return true;
            
        } catch (error) {
            console.error('InputManager: Accelerometer access denied:', error);
            this.permissions.accelerometer = 'denied';
            return false;
        }
    }
    
    handleOrientation(event) {
        // alpha: compass direction (0-360)
        // beta: front-back tilt (-180 to 180)
        // gamma: left-right tilt (-90 to 90)
        
        this.motion.alpha.update(event.alpha || 0);
        this.motion.beta.update(event.beta || 0);
        this.motion.gamma.update(event.gamma || 0);
    }
    
    handleMotion(event) {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;
        
        this.motion.accelerationX.update(acc.x || 0);
        this.motion.accelerationY.update(acc.y || 0);
        this.motion.accelerationZ.update(acc.z || 0);
        
        // Shake detection
        const deltaX = Math.abs(acc.x - this.lastAcceleration.x);
        const deltaY = Math.abs(acc.y - this.lastAcceleration.y);
        const deltaZ = Math.abs(acc.z - this.lastAcceleration.z);
        
        const shakeIntensity = (deltaX + deltaY + deltaZ) / 3;
        
        if (shakeIntensity > this.shakeThreshold) {
            this.motion.shake.update(Math.min(shakeIntensity / 30, 1));
        } else {
            this.motion.shake.update(0);
        }
        
        this.lastAcceleration = { x: acc.x, y: acc.y, z: acc.z };
        
        if (this.onMotionData) {
            this.onMotionData(this.getMotionData());
        }
    }
    
    getMotionData() {
        return {
            alpha: this.motion.alpha.getValue(),
            beta: this.motion.beta.getValue(),
            gamma: this.motion.gamma.getValue(),
            accelerationX: this.motion.accelerationX.getValue(),
            accelerationY: this.motion.accelerationY.getValue(),
            accelerationZ: this.motion.accelerationZ.getValue(),
            shake: this.motion.shake.getValue(),
            // Normalized tilt values (-1 to 1)
            tiltX: Utils.clamp(this.motion.gamma.getValue() / 90, -1, 1),
            tiltY: Utils.clamp(this.motion.beta.getValue() / 90, -1, 1)
        };
    }
    
    // =========================================
    // POINTER / TOUCH
    // =========================================
    
    setupPointerEvents() {
        const canvas = document.getElementById('main-canvas');
        
        const handleMove = (x, y) => {
            this.pointer.x.update(x / window.innerWidth);
            this.pointer.y.update(y / window.innerHeight);
        };
        
        // Mouse events
        canvas.addEventListener('mousemove', (e) => {
            handleMove(e.clientX, e.clientY);
        });
        
        canvas.addEventListener('mousedown', () => {
            this.pointer.isDown = true;
        });
        
        canvas.addEventListener('mouseup', () => {
            this.pointer.isDown = false;
        });
        
        // Touch events with gesture detection
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleTouchMove(e);
        }, { passive: false });
        
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTouchStart(e);
        }, { passive: false });
        
        canvas.addEventListener('touchend', (e) => {
            this.handleTouchEnd(e);
        });
    }
    
    // =========================================
    // TOUCH GESTURE HANDLING
    // =========================================
    
    handleTouchStart(e) {
        const touches = e.touches;
        this.gesture.touchCount = touches.length;
        this.pointer.isDown = true;
        
        if (touches.length === 1) {
            // Single touch - track position and swipe
            const touch = touches[0];
            this.pointer.x.update(touch.clientX / window.innerWidth);
            this.pointer.y.update(touch.clientY / window.innerHeight);
            this.gesture.lastTouchX = touch.clientX;
            this.gesture.lastTouchY = touch.clientY;
            this.gesture.lastTouchTime = performance.now();
            
            // Check for pressure (Force Touch / 3D Touch)
            if (touch.force) {
                this.pointer.pressure = touch.force;
            }
        } else if (touches.length === 2) {
            // Two fingers - start pinch and rotation tracking
            this.gesture.isPinching = true;
            this.gesture.isRotating = true;
            this.gesture.initialPinchDistance = this.getTouchDistance(touches[0], touches[1]);
            this.gesture.initialRotation = this.getTouchAngle(touches[0], touches[1]);
            
            // Calculate pinch center
            this.gesture.pinchCenter = {
                x: (touches[0].clientX + touches[1].clientX) / 2 / window.innerWidth,
                y: (touches[0].clientY + touches[1].clientY) / 2 / window.innerHeight
            };
        }
        
        // Store all touches for tracking
        this.gesture.touches = Array.from(touches).map(t => ({
            id: t.identifier,
            x: t.clientX,
            y: t.clientY
        }));
    }
    
    handleTouchMove(e) {
        const touches = e.touches;
        this.gesture.touchCount = touches.length;
        
        if (touches.length === 1) {
            // Single touch - update position and calculate swipe velocity
            const touch = touches[0];
            const now = performance.now();
            const dt = (now - this.gesture.lastTouchTime) / 1000;
            
            if (dt > 0) {
                const dx = touch.clientX - this.gesture.lastTouchX;
                const dy = touch.clientY - this.gesture.lastTouchY;
                
                // Calculate velocity (pixels per second, normalized)
                this.gesture.swipeVelocityX.update((dx / dt) / window.innerWidth * 0.1);
                this.gesture.swipeVelocityY.update((dy / dt) / window.innerHeight * 0.1);
                
                // Callback for swipe
                if (this.onSwipe) {
                    this.onSwipe({
                        velocityX: this.gesture.swipeVelocityX.getValue(),
                        velocityY: this.gesture.swipeVelocityY.getValue(),
                        x: touch.clientX / window.innerWidth,
                        y: touch.clientY / window.innerHeight
                    });
                }
            }
            
            this.pointer.x.update(touch.clientX / window.innerWidth);
            this.pointer.y.update(touch.clientY / window.innerHeight);
            this.gesture.lastTouchX = touch.clientX;
            this.gesture.lastTouchY = touch.clientY;
            this.gesture.lastTouchTime = now;
            
            // Update pressure
            if (touch.force) {
                this.pointer.pressure = touch.force;
            }
            
        } else if (touches.length === 2) {
            // Two fingers - calculate pinch and rotation
            const currentDistance = this.getTouchDistance(touches[0], touches[1]);
            const currentAngle = this.getTouchAngle(touches[0], touches[1]);
            
            // Pinch scale (1.0 = no change, >1 = zoom in, <1 = zoom out)
            if (this.gesture.initialPinchDistance > 0) {
                const scale = currentDistance / this.gesture.initialPinchDistance;
                this.gesture.pinchScale.update(scale);
                
                // Callback for pinch
                if (this.onPinch) {
                    this.onPinch({
                        scale: this.gesture.pinchScale.getValue(),
                        centerX: this.gesture.pinchCenter.x,
                        centerY: this.gesture.pinchCenter.y
                    });
                }
            }
            
            // Rotation (in radians)
            const deltaRotation = currentAngle - this.gesture.initialRotation;
            this.gesture.rotation.update(deltaRotation);
            
            // Callback for rotation
            if (this.onRotate) {
                this.onRotate({
                    rotation: this.gesture.rotation.getValue(),
                    centerX: this.gesture.pinchCenter.x,
                    centerY: this.gesture.pinchCenter.y
                });
            }
            
            // Update pinch center
            this.gesture.pinchCenter = {
                x: (touches[0].clientX + touches[1].clientX) / 2 / window.innerWidth,
                y: (touches[0].clientY + touches[1].clientY) / 2 / window.innerHeight
            };
        }
    }
    
    handleTouchEnd(e) {
        const touches = e.touches;
        this.gesture.touchCount = touches.length;
        
        if (touches.length === 0) {
            // All fingers lifted
            this.pointer.isDown = false;
            this.pointer.pressure = 0;
            this.gesture.isPinching = false;
            this.gesture.isRotating = false;
            
            // Decay velocities
            this.gesture.swipeVelocityX.update(0);
            this.gesture.swipeVelocityY.update(0);
        } else if (touches.length === 1) {
            // Went from 2 to 1 finger
            this.gesture.isPinching = false;
            this.gesture.isRotating = false;
            this.gesture.pinchScale.update(1.0);
            this.gesture.rotation.update(0);
            
            // Reset for single finger tracking
            const touch = touches[0];
            this.gesture.lastTouchX = touch.clientX;
            this.gesture.lastTouchY = touch.clientY;
            this.gesture.lastTouchTime = performance.now();
        }
    }
    
    getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getTouchAngle(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.atan2(dy, dx);
    }
    
    getGestureData() {
        return {
            pinchScale: this.gesture.pinchScale.getValue(),
            pinchCenterX: this.gesture.pinchCenter.x,
            pinchCenterY: this.gesture.pinchCenter.y,
            isPinching: this.gesture.isPinching,
            rotation: this.gesture.rotation.getValue(),
            isRotating: this.gesture.isRotating,
            swipeVelocityX: this.gesture.swipeVelocityX.getValue(),
            swipeVelocityY: this.gesture.swipeVelocityY.getValue(),
            touchCount: this.gesture.touchCount
        };
    }
    
    getPointerData() {
        return {
            x: this.pointer.x.getValue(),
            y: this.pointer.y.getValue(),
            isDown: this.pointer.isDown,
            pressure: this.pointer.pressure
        };
    }
    
    // =========================================
    // UPDATE LOOP
    // =========================================
    
    update() {
        // Analyze microphone data
        if (this.enabled.microphone) {
            this.analyzeMicrophone();
        }
    }
    
    // =========================================
    // CLEANUP
    // =========================================
    
    dispose() {
        // Stop microphone
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
        }
        
        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        // Stop camera
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
        }
        
        // Remove event listeners
        if (this._boundHandlers.orientation) {
            window.removeEventListener('deviceorientation', this._boundHandlers.orientation);
        }
        if (this._boundHandlers.motion) {
            window.removeEventListener('devicemotion', this._boundHandlers.motion);
        }
        
        console.log('InputManager: Disposed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InputManager;
}
