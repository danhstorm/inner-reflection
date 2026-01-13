/**
 * INNER REFLECTION - State Engine
 * 
 * A 64-dimensional interconnected state space that drives all visual and audio parameters.
 * 
 * Architecture:
 * - 64 floating-point dimensions (0-1 range, some circular/wrapping)
 * - Each dimension has: current value, target value, velocity, drift direction
 * - Dimensions are interconnected via a sparse connection matrix
 * - External inputs (keyboard, mouse, face, audio) apply gentle influences
 * - Autonomous drift creates constant organic evolution
 * 
 * Dimension Groups:
 * - 0-15: Colors and gradients (hues, saturation, brightness)
 * - 16-31: Displacement effects (position, strength, rings, shapes)
 * - 32-39: Post-processing (blur, glow, grain)
 * - 40-51: Audio synthesis (pitch, volume, filters)
 * - 52-63: Global mood (intensity, speed, chaos)
 * 
 * Key Features:
 * - Smooth interpolation with velocity capping (no sudden jumps)
 * - Only hue values wrap (circular), all others clamp
 * - Keyboard keys affect 5-10 dimensions each
 * - Face position influences displacement center
 * - Connection matrix propagates changes across dimensions
 */

class StateEngine {
    constructor() {
        // Number of state dimensions
        this.dimensionCount = 64;
        
        // Core state arrays
        this.current = new Float32Array(this.dimensionCount);    // Current smoothed values
        this.target = new Float32Array(this.dimensionCount);     // Target values
        this.velocity = new Float32Array(this.dimensionCount);   // Rate of change
        this.drift = new Float32Array(this.dimensionCount);      // Autonomous drift direction
        this.influence = new Float32Array(this.dimensionCount);  // External influence accumulator
        
        // Smoothing parameters per dimension
        this.smoothing = new Float32Array(this.dimensionCount);
        this.driftSpeed = new Float32Array(this.dimensionCount);
        this.driftScale = new Float32Array(this.dimensionCount);
        
        // Interdependency matrix (sparse representation)
        this.connections = [];
        
        // Named dimension mappings for easy access
        this.dimensions = {};
        
        // Keyboard mappings
        this.keyMappings = {};
        
        // Time tracking
        this.time = 0;
        this.lastUpdate = 0;
        
        // Focus mode - creates smaller, more intense portal moments
        this.focusMode = {
            active: false,
            intensity: 0,        // 0-1 how focused we are
            targetIntensity: 0,
            lastTransition: 0,
            duration: 0,
            minInterval: 15,     // Minimum seconds between focus transitions
            maxInterval: 45      // Maximum seconds between transitions
        };
        this.nextFocusTime = 10 + Math.random() * 20;  // First focus after 10-30 seconds
        
        // Pendulum physics for super smooth camera-like movement
        this.pendulum = {
            x: { angle: 0, velocity: 0, target: 0.5 },
            y: { angle: Math.PI / 4, velocity: 0, target: 0.5 },
            rotation: { angle: 0, velocity: 0, target: 0 },
            scale: { angle: Math.PI / 2, velocity: 0, target: 0.5 }
        };
        // Pendulum parameters - very slow, smooth swinging
        this.pendulumDamping = 0.998;  // Very slow decay
        this.pendulumStiffness = 0.00003; // Very gentle pull
        this.pendulumDriftForce = 0.00001; // Tiny random drift
        
        // Initialize everything
        this.initialize();
    }
    
    initialize() {
        // Define named dimensions with their indices
        this.defineDimensions();
        
        // Set initial values with curated starting points for calm experience
        for (let i = 0; i < this.dimensionCount; i++) {
            this.current[i] = 0.5; // Start centered
            this.target[i] = 0.5;
            this.velocity[i] = 0;
            this.drift[i] = (Math.random() - 0.5) * 0.5; // Gentler drift
            this.influence[i] = 0;
            
            // MUCH smoother, slower transitions - like hanging pendulum
            this.smoothing[i] = 0.995 + Math.random() * 0.004; // 0.995-0.999
            
            // Very slow, meditative drift speeds
            this.driftSpeed[i] = 0.00005 + Math.random() * 0.00015;
            this.driftScale[i] = 0.005 + Math.random() * 0.01;
        }
        
        // Set specific starting values for varied, interesting colors
        // Like drops of different colors in liquid
        this.current[this.dimensions.colorHue1] = 0.5;   // Cyan
        this.current[this.dimensions.colorHue2] = 0.08;  // Orange (contrasting)
        this.current[this.dimensions.colorHue3] = 0.85;  // Magenta/pink
        this.current[this.dimensions.colorHue4] = 0.35;  // Green-teal
        this.current[this.dimensions.colorSaturation] = 0.7;
        this.current[this.dimensions.colorBrightness] = 0.5;  // Darker starting point
        
        // Copy to targets
        this.target[this.dimensions.colorHue1] = this.current[this.dimensions.colorHue1];
        this.target[this.dimensions.colorHue2] = this.current[this.dimensions.colorHue2];
        this.target[this.dimensions.colorHue3] = this.current[this.dimensions.colorHue3];
        this.target[this.dimensions.colorHue4] = this.current[this.dimensions.colorHue4];
        
        // Set displacement to centered
        this.current[this.dimensions.displacementX] = 0.5;
        this.current[this.dimensions.displacementY] = 0.5;
        this.target[this.dimensions.displacementX] = 0.5;
        this.target[this.dimensions.displacementY] = 0.5;
        
        // Set good defaults for shape/wave controls
        // Shape types: 0=circles, 1=torus, 2=linear, 3=skewed, 4=cylinder
        // 5=sphere, 6=hyperboloid, 7=spiral, 8=parallel, 9=conic, 10=möbius
        this.setDimensionValue('shapeType', 0);           // Start with circles
        this.setDimensionValue('waveDelay', 0.4);         // Nice wave delay
        this.setDimensionValue('waveAmplitude', 0.35);    // Strong visible wave
        this.setDimensionValue('waveSpeed', 0.4);         // Moderate wave speed
        this.setDimensionValue('edgeSharpness', 0.15);    // Sharper edges for optical effect
        this.setDimensionValue('minRadius', 0.08);        // Small center hole
        this.setDimensionValue('shapeRotation', 0);       // No rotation
        this.setDimensionValue('rotationSpeed', 0.05);    // Subtle auto-rotation
        
        // Make shapeType drift very slowly
        this.driftSpeed[this.dimensions.shapeType] = 0.00005;
        this.driftScale[this.dimensions.shapeType] = 0.008;
        this.smoothing[this.dimensions.shapeType] = 0.995;  // Very smooth transitions
        
        // Create interdependency connections
        this.createConnections();
        
        // Set up keyboard mappings
        this.createKeyMappings();
        
        console.log('StateEngine: Initialized with', this.dimensionCount, 'dimensions');
    }
    
    defineDimensions() {
        // Visual - Gradients & Colors (0-15)
        this.dimensions.colorHue1 = 0;
        this.dimensions.colorHue2 = 1;
        this.dimensions.colorHue3 = 2;
        this.dimensions.colorHue4 = 3;
        this.dimensions.colorSaturation = 4;
        this.dimensions.colorBrightness = 5;
        this.dimensions.gradientSpeed = 6;
        this.dimensions.gradientScale = 7;
        this.dimensions.gradientComplexity = 8;
        this.dimensions.gradientOffsetX = 9;
        this.dimensions.gradientOffsetY = 10;
        this.dimensions.colorBlend = 11;
        this.dimensions.colorContrast = 12;
        this.dimensions.colorWarmth = 13;
        this.dimensions.colorDepth = 14;
        this.dimensions.colorVibrance = 15;
        
        // Visual - Displacement Effect (16-31)
        this.dimensions.displacementX = 16;
        this.dimensions.displacementY = 17;
        this.dimensions.displacementStrength = 18;
        this.dimensions.displacementRadius = 19;
        this.dimensions.displacementRings = 20;
        this.dimensions.displacementRotation = 21;
        this.dimensions.displacementWobble = 22;
        this.dimensions.displacementChromatic = 23;
        this.dimensions.rippleOrigin2X = 24;
        this.dimensions.rippleOrigin2Y = 25;
        this.dimensions.rippleOrigin2Strength = 26;
        this.dimensions.rippleOrigin3X = 27;
        this.dimensions.rippleOrigin3Y = 28;
        this.dimensions.rippleOrigin3Strength = 29;
        this.dimensions.morphProgress = 30;
        this.dimensions.morphType = 31;
        
        // Visual - Post Processing (32-39)
        this.dimensions.blur = 32;
        this.dimensions.glow = 33;
        this.dimensions.vignette = 34;
        this.dimensions.saturationPost = 35;
        this.dimensions.brightnessPost = 36;
        this.dimensions.contrastPost = 37;
        this.dimensions.noiseAmount = 38;
        this.dimensions.filmGrain = 39;
        
        // Audio - Synthesis (40-51)
        this.dimensions.droneBasePitch = 40;
        this.dimensions.droneMidPitch = 41;
        this.dimensions.droneHighPitch = 42;
        this.dimensions.droneBaseVolume = 43;
        this.dimensions.droneMidVolume = 44;
        this.dimensions.droneHighVolume = 45;
        this.dimensions.filterCutoff = 46;
        this.dimensions.filterResonance = 47;
        this.dimensions.reverbAmount = 48;
        this.dimensions.delayAmount = 49;
        this.dimensions.chorusAmount = 50;
        this.dimensions.granularDensity = 51;
        
        // Global / Mood (52-63) - some repurposed for shape controls
        this.dimensions.overallIntensity = 52;
        this.dimensions.overallSpeed = 53;
        this.dimensions.overallChaos = 54;
        this.dimensions.overallWarmth = 55;
        
        // Shape & Wave Controls (56-63) - dedicated controls for debug panel
        this.dimensions.shapeType = 56;         // 0-1 maps to shape 0-10
        this.dimensions.waveDelay = 57;         // Wave delay between rings
        this.dimensions.waveAmplitude = 58;     // Wave displacement amount
        this.dimensions.waveSpeed = 59;         // Wave animation speed
        this.dimensions.edgeSharpness = 60;     // Ring edge transition width
        this.dimensions.minRadius = 61;         // Inner radius cutoff
        this.dimensions.shapeRotation = 62;     // Static rotation angle
        this.dimensions.rotationSpeed = 63;     // Auto-rotation speed
        
        // Aliases - these share indices with shape controls for backward compatibility
        this.dimensions.particleSpeed = 57;     // Shares with waveDelay
        this.dimensions.particleSize = 58;      // Shares with waveAmplitude
        this.dimensions.breathingRate = 59;     // Shares with waveSpeed
        this.dimensions.pulseRate = 60;         // Shares with edgeSharpness
        this.dimensions.entropyLevel = 63;      // Shares with rotationSpeed
        
        // Fold/invert use chaos/entropy
        this.dimensions.foldAmount = 54;        // Shares with overallChaos
        this.dimensions.invertAmount = 55;      // Shares with overallWarmth
        this.dimensions.secondaryWave = 52;     // Shares with overallIntensity
        this.dimensions.tertiaryWave = 53;      // Shares with overallSpeed
    }
    
    createConnections() {
        // Create interdependency network
        // Each connection: [sourceIndex, targetIndex, strength, delay]
        // Strength is how much source affects target (-1 to 1)
        
        // Color relationships
        this.addConnection('colorHue1', 'colorHue2', 0.3);
        this.addConnection('colorHue2', 'colorHue3', 0.25);
        this.addConnection('colorHue3', 'colorHue4', 0.2);
        this.addConnection('colorSaturation', 'colorVibrance', 0.5);
        this.addConnection('colorBrightness', 'glow', 0.3);
        this.addConnection('colorWarmth', 'colorHue1', 0.2);
        
        // Displacement relationships
        this.addConnection('displacementStrength', 'displacementChromatic', 0.4);
        this.addConnection('displacementRings', 'displacementWobble', -0.2);
        this.addConnection('overallIntensity', 'displacementStrength', 0.5);
        this.addConnection('displacementX', 'rippleOrigin2X', -0.3);
        this.addConnection('displacementY', 'rippleOrigin2Y', -0.3);
        
        // Audio-visual relationships
        this.addConnection('droneBaseVolume', 'displacementStrength', 0.2);
        this.addConnection('filterCutoff', 'colorBrightness', 0.3);
        this.addConnection('reverbAmount', 'blur', 0.4);
        this.addConnection('overallIntensity', 'droneBaseVolume', 0.3);
        
        // Chaos/entropy spreads
        this.addConnection('overallChaos', 'displacementWobble', 0.5);
        this.addConnection('overallChaos', 'granularDensity', 0.4);
        this.addConnection('overallChaos', 'noiseAmount', 0.3);
        this.addConnection('entropyLevel', 'overallChaos', 0.2);
        
        // Speed relationships
        this.addConnection('overallSpeed', 'gradientSpeed', 0.6);
        this.addConnection('overallSpeed', 'particleSpeed', 0.5);
        this.addConnection('breathingRate', 'pulseRate', 0.4);
        
        // Cross-modal influences
        this.addConnection('colorWarmth', 'overallWarmth', 0.5);
        this.addConnection('overallWarmth', 'droneBasePitch', -0.2);
        
        // Add some random subtle connections for complexity
        for (let i = 0; i < 30; i++) {
            const source = Math.floor(Math.random() * this.dimensionCount);
            const target = Math.floor(Math.random() * this.dimensionCount);
            if (source !== target) {
                const strength = (Math.random() - 0.5) * 0.15; // Subtle
                this.connections.push([source, target, strength]);
            }
        }
        
        console.log('StateEngine: Created', this.connections.length, 'connections');
    }
    
    addConnection(sourceName, targetName, strength) {
        const sourceIdx = this.dimensions[sourceName];
        const targetIdx = this.dimensions[targetName];
        if (sourceIdx !== undefined && targetIdx !== undefined) {
            this.connections.push([sourceIdx, targetIdx, strength]);
        }
    }
    
    createKeyMappings() {
        // Map keyboard keys to dimension influences
        // Each key affects multiple dimensions with different strengths
        
        const keys = 'qwertyuiopasdfghjklzxcvbnm1234567890';
        
        keys.split('').forEach((key, keyIndex) => {
            this.keyMappings[key] = [];
            
            // Each key affects 5-10 random dimensions
            const affectedCount = 5 + Math.floor(Math.random() * 6);
            const usedDimensions = new Set();
            
            for (let i = 0; i < affectedCount; i++) {
                let dim;
                do {
                    dim = Math.floor(Math.random() * this.dimensionCount);
                } while (usedDimensions.has(dim));
                usedDimensions.add(dim);
                
                // Random direction and strength
                const direction = Math.random() > 0.5 ? 1 : -1;
                const strength = 0.02 + Math.random() * 0.05; // Subtle per key
                
                this.keyMappings[key].push({
                    dimension: dim,
                    strength: strength * direction
                });
            }
        });
        
        // Add some structured mappings for musical feel
        // Number row: affects audio dimensions more
        '1234567890'.split('').forEach((key, i) => {
            const audioDim = 40 + (i % 12);
            this.keyMappings[key].push({
                dimension: audioDim,
                strength: 0.05 * (i % 2 === 0 ? 1 : -1)
            });
        });
        
        // QWERTY row: affects colors more
        'qwertyuiop'.split('').forEach((key, i) => {
            const colorDim = i % 16;
            this.keyMappings[key].push({
                dimension: colorDim,
                strength: 0.04 * ((i % 3) - 1)
            });
        });
        
        // ASDF row: affects displacement
        'asdfghjkl'.split('').forEach((key, i) => {
            const dispDim = 16 + (i % 16);
            this.keyMappings[key].push({
                dimension: dispDim,
                strength: 0.04 * (Math.sin(i) > 0 ? 1 : -1)
            });
        });
        
        // ZXCV row: affects mood/global
        'zxcvbnm'.split('').forEach((key, i) => {
            const moodDim = 52 + (i % 12);
            this.keyMappings[key].push({
                dimension: moodDim,
                strength: 0.05 * ((i % 2) - 0.5) * 2
            });
        });
        
        console.log('StateEngine: Created key mappings for', Object.keys(this.keyMappings).length, 'keys');
    }
    
    // =========================================
    // UPDATE LOOP
    // =========================================
    
    update(deltaTime) {
        this.time += deltaTime;
        
        // 0. Update pendulum physics for smooth camera-like movement
        this.updatePendulumPhysics(deltaTime);
        
        // 1. Update focus mode (creates dramatic portal moments)
        this.updateFocusMode(deltaTime);
        
        // 2. Apply autonomous drift
        this.applyDrift(deltaTime);
        
        // 3. Apply interdependencies
        this.applyConnections(deltaTime);
        
        // 4. Apply external influences (keyboard, mouse, etc.)
        this.applyInfluences(deltaTime);
        
        // 5. Smooth interpolation towards targets
        this.smoothUpdate(deltaTime);
        
        // 6. Wrap values to keep them circular (0-1)
        this.wrapValues();
        
        // 7. Decay influences
        this.decayInfluences(deltaTime);
    }
    
    // Pendulum physics for super smooth, organic movement
    updatePendulumPhysics(deltaTime) {
        const dt = Math.min(deltaTime, 0.05); // Cap delta time
        
        // Update each pendulum axis
        for (const [key, p] of Object.entries(this.pendulum)) {
            // Add tiny random drift force (like wind on a pendulum)
            const driftForce = (Math.sin(this.time * 0.1 + p.angle * 2) * 0.5 + 
                               Math.sin(this.time * 0.07 + p.angle) * 0.3 +
                               Math.sin(this.time * 0.13) * 0.2) * this.pendulumDriftForce;
            
            // Spring force toward target (very gentle)
            const springForce = (p.target - 0.5 - Math.sin(p.angle) * 0.3) * this.pendulumStiffness;
            
            // Apply forces to velocity
            p.velocity += (driftForce + springForce) * dt * 60;
            
            // Apply damping (preserves momentum, slow decay)
            p.velocity *= Math.pow(this.pendulumDamping, dt * 60);
            
            // Update angle
            p.angle += p.velocity * dt * 60;
        }
        
        // Apply pendulum values to displacement parameters for smooth movement
        // Convert pendulum angles to smooth 0-1 values using sine
        const smoothX = 0.5 + Math.sin(this.pendulum.x.angle) * 0.15;
        const smoothY = 0.5 + Math.sin(this.pendulum.y.angle) * 0.12;
        const smoothRot = Math.sin(this.pendulum.rotation.angle) * 0.1;
        const smoothScale = 0.5 + Math.sin(this.pendulum.scale.angle) * 0.08;
        
        // Blend pendulum movement into targets (very gently)
        const blend = 0.02;
        this.target[this.dimensions.gradientOffsetX] += (smoothX - this.target[this.dimensions.gradientOffsetX]) * blend;
        this.target[this.dimensions.gradientOffsetY] += (smoothY - this.target[this.dimensions.gradientOffsetY]) * blend;
        this.target[this.dimensions.displacementRotation] += (smoothRot - this.target[this.dimensions.displacementRotation]) * blend * 0.5;
    }
    
    updateFocusMode(deltaTime) {
        // Check if it's time to transition focus mode
        if (this.time >= this.nextFocusTime) {
            // Toggle focus mode
            this.focusMode.active = !this.focusMode.active;
            this.focusMode.targetIntensity = this.focusMode.active ? Utils.random(0.6, 1.0) : 0;
            this.focusMode.lastTransition = this.time;
            this.focusMode.duration = this.focusMode.active ? 
                Utils.random(8, 20) :  // Stay focused for 8-20 seconds
                Utils.random(this.focusMode.minInterval, this.focusMode.maxInterval);
            this.nextFocusTime = this.time + this.focusMode.duration;
            
            console.log(`StateEngine: Focus mode ${this.focusMode.active ? 'ACTIVATED' : 'released'}, intensity: ${this.focusMode.targetIntensity.toFixed(2)}`);
        }
        
        // Smooth interpolation of focus intensity
        const focusSmoothing = this.focusMode.active ? 0.02 : 0.015;  // Faster into focus, slower out
        this.focusMode.intensity += (this.focusMode.targetIntensity - this.focusMode.intensity) * focusSmoothing;
    }
    
    applyDrift(deltaTime) {
        // Autonomous drift using Perlin-like noise patterns
        for (let i = 0; i < this.dimensionCount; i++) {
            // Slowly evolving drift direction
            const noiseTime = this.time * this.driftSpeed[i];
            const noiseOffset = i * 100;
            
            // Simple noise approximation using sin combinations
            const drift = Math.sin(noiseTime + noiseOffset) * 0.5 +
                         Math.sin(noiseTime * 1.7 + noiseOffset * 0.3) * 0.3 +
                         Math.sin(noiseTime * 0.4 + noiseOffset * 0.7) * 0.2;
            
            // Apply drift to target
            this.target[i] += drift * this.driftScale[i] * deltaTime;
        }
    }
    
    applyConnections(deltaTime) {
        // Calculate influences from connections
        const influences = new Float32Array(this.dimensionCount);
        
        for (const [source, target, strength] of this.connections) {
            // Use velocity of source to influence target
            const sourceChange = this.current[source] - 0.5; // Centered
            influences[target] += sourceChange * strength * deltaTime * 0.5;
        }
        
        // Apply accumulated influences
        for (let i = 0; i < this.dimensionCount; i++) {
            this.target[i] += influences[i];
        }
    }
    
    applyInfluences(deltaTime) {
        // Apply external influences to targets
        for (let i = 0; i < this.dimensionCount; i++) {
            if (Math.abs(this.influence[i]) > 0.0001) {
                this.target[i] += this.influence[i] * deltaTime;
            }
        }
    }
    
    smoothUpdate(deltaTime) {
        // Super smooth interpolation with momentum - like a heavy pendulum
        for (let i = 0; i < this.dimensionCount; i++) {
            // Calculate difference to target
            const diff = this.target[i] - this.current[i];
            
            // Very high momentum preservation (0.995) for smooth, slow movement
            // Multiplied by smoothing factor for gradual acceleration
            const momentumFactor = 0.995;
            const accelerationFactor = (1 - this.smoothing[i]) * 0.3;
            
            this.velocity[i] = this.velocity[i] * momentumFactor + diff * accelerationFactor;
            
            // Very strict velocity cap - prevents ANY sudden movements
            const maxVelocity = 0.003; // Much lower cap for super smooth motion
            this.velocity[i] = Math.max(-maxVelocity, Math.min(maxVelocity, this.velocity[i]));
            
            // Apply velocity
            this.current[i] += this.velocity[i] * Math.min(deltaTime * 60, 1);
        }
    }
    
    wrapValues() {
        // Only wrap HUE values (0-3), clamp everything else
        // This prevents sudden jumps/flashing
        for (let i = 0; i < this.dimensionCount; i++) {
            if (i <= 3) {
                // Hue values can wrap (circular)
                this.current[i] = ((this.current[i] % 1) + 1) % 1;
                this.target[i] = ((this.target[i] % 1) + 1) % 1;
            } else {
                // All other values should be clamped
                this.current[i] = Math.max(0, Math.min(1, this.current[i]));
                this.target[i] = Math.max(0, Math.min(1, this.target[i]));
            }
        }
    }
    
    decayInfluences(deltaTime) {
        // Very slow decay of external influences for smooth transitions
        for (let i = 0; i < this.dimensionCount; i++) {
            this.influence[i] *= Math.pow(0.98, deltaTime * 60);
        }
    }
    
    // =========================================
    // INPUT METHODS
    // =========================================
    
    handleKeyPress(key) {
        const lowerKey = key.toLowerCase();
        const mapping = this.keyMappings[lowerKey];
        
        if (mapping) {
            console.log('StateEngine: Key press', key, 'affecting', mapping.length, 'dimensions');
            for (const { dimension, strength } of mapping) {
                // Add to influence (gentle, cumulative effect)
                this.influence[dimension] += strength * 0.5;
            }
        }
    }
    
    handleMouseMove(x, y) {
        // x, y are normalized 0-1
        // Gentle influence on displacement center
        this.influence[this.dimensions.displacementX] += (x - 0.5) * 0.01;
        this.influence[this.dimensions.displacementY] += (y - 0.5) * 0.01;
        
        // Subtle color influence
        this.influence[this.dimensions.colorHue1] += (x - 0.5) * 0.005;
        this.influence[this.dimensions.colorWarmth] += (y - 0.5) * 0.005;
    }
    
    // Handle touch gesture controls (pinch, rotate, swipe)
    handleGestureInput(gestureData) {
        if (!gestureData) return;
        
        // Pinch affects portal size (radius) and intensity
        if (gestureData.isPinching) {
            const scale = gestureData.pinchScale;
            // Scale < 1 = pinching in = smaller, more focused portal
            // Scale > 1 = spreading = larger portal
            const radiusInfluence = (scale - 1.0) * 0.1;
            const strengthInfluence = (1.0 - scale) * 0.05;  // Smaller = stronger
            
            this.influence[this.dimensions.displacementRadius] += radiusInfluence;
            this.influence[this.dimensions.displacementStrength] += strengthInfluence;
            
            // Move center toward pinch center
            this.influence[this.dimensions.displacementX] += (gestureData.pinchCenterX - 0.5) * 0.02;
            this.influence[this.dimensions.displacementY] += (gestureData.pinchCenterY - 0.5) * 0.02;
        }
        
        // Two-finger rotation affects shape rotation
        if (gestureData.isRotating) {
            this.influence[this.dimensions.shapeRotation] += gestureData.rotation * 0.3;
        }
        
        // Swipe affects gradient offset and color flow
        if (Math.abs(gestureData.swipeVelocityX) > 0.01 || Math.abs(gestureData.swipeVelocityY) > 0.01) {
            this.influence[this.dimensions.gradientOffsetX] += gestureData.swipeVelocityX * 0.2;
            this.influence[this.dimensions.gradientOffsetY] += gestureData.swipeVelocityY * 0.2;
            
            // Fast swipes affect color hue
            const swipeSpeed = Math.sqrt(
                gestureData.swipeVelocityX * gestureData.swipeVelocityX + 
                gestureData.swipeVelocityY * gestureData.swipeVelocityY
            );
            this.influence[this.dimensions.colorHue1] += swipeSpeed * 0.5;
            this.influence[this.dimensions.overallIntensity] += swipeSpeed * 0.1;
        }
    }
    
    // Force focus mode on/off (for manual trigger)
    setFocusMode(active, intensity = 0.8) {
        this.focusMode.active = active;
        this.focusMode.targetIntensity = active ? intensity : 0;
        console.log(`StateEngine: Focus mode manually set to ${active ? 'ON' : 'OFF'}`);
    }
    
    handleAudioInput(volume, bass, mid, treble) {
        // Audio input - stronger influence for more visible reaction
        const strength = 0.15; // Base multiplier for mic reactivity
        
        // Volume affects overall intensity and chaos
        this.influence[this.dimensions.overallIntensity] += volume * strength * 0.8;
        this.influence[this.dimensions.overallChaos] += volume * strength * 0.3;
        
        // Bass affects displacement and low drones
        this.influence[this.dimensions.displacementStrength] += bass * strength * 0.6;
        this.influence[this.dimensions.droneBaseVolume] += bass * strength * 0.4;
        this.influence[this.dimensions.displacementRadius] += bass * strength * 0.3;
        
        // Mid affects filter and granular
        this.influence[this.dimensions.filterCutoff] += mid * strength * 0.5;
        this.influence[this.dimensions.granularDensity] += mid * strength * 0.4;
        this.influence[this.dimensions.droneMidVolume] += mid * strength * 0.3;
        
        // Treble affects glow and high frequencies
        this.influence[this.dimensions.glow] += treble * strength * 0.5;
        this.influence[this.dimensions.gradientBrightness] += treble * strength * 0.3;
        this.influence[this.dimensions.droneHighVolume] += treble * strength * 0.4;
        
        // General color and vibrance
        this.influence[this.dimensions.colorVibrance] += volume * strength * 0.2;
        this.influence[this.dimensions.gradientSaturation] += volume * strength * 0.15;
    }
    
    handleFacePosition(x, y, size) {
        // Face position gently influences displacement center
        const targetX = x;
        const targetY = y;
        
        // Smooth, gentle influence towards face position
        this.influence[this.dimensions.displacementX] += (targetX - this.current[this.dimensions.displacementX]) * 0.05;
        this.influence[this.dimensions.displacementY] += (targetY - this.current[this.dimensions.displacementY]) * 0.05;
        
        // Face size affects radius
        this.influence[this.dimensions.displacementRadius] += (size - this.current[this.dimensions.displacementRadius]) * 0.05;
    }
    
    // Handle face position with heavy smoothing - receives push values, not absolute positions
    // pushX, pushY, pushSize are -1 to 1 values indicating direction to push parameters
    handleFacePositionSmooth(pushX, pushY, pushSize) {
        // Push multipliers - gentle but noticeable
        const pushStrength = 0.015;
        
        // X position pushes displacement center horizontally
        // Looking left/right shifts the portal
        this.influence[this.dimensions.displacementX] += pushX * pushStrength * 0.6;
        
        // Y position affects multiple parameters
        // Looking up: increase glow, brightness
        // Looking down: increase saturation, depth
        this.influence[this.dimensions.glow] += -pushY * pushStrength * 0.4;
        this.influence[this.dimensions.gradientBrightness] += -pushY * pushStrength * 0.3;
        this.influence[this.dimensions.gradientSaturation] += pushY * pushStrength * 0.3;
        
        // Subtle Y influence on displacement center
        this.influence[this.dimensions.displacementY] += pushY * pushStrength * 0.4;
        
        // Face size/proximity affects intensity and scale
        // Closer (larger): more intense, tighter patterns
        // Further (smaller): calmer, more expansive
        this.influence[this.dimensions.displacementStrength] += pushSize * pushStrength * 0.5;
        this.influence[this.dimensions.displacementRadius] += -pushSize * pushStrength * 0.4;
        this.influence[this.dimensions.overallIntensity] += pushSize * pushStrength * 0.4;
        this.influence[this.dimensions.displacementChromatic] += pushSize * pushStrength * 0.3;
        
        // Head tilt (X deviation from center) affects rotation and shape
        this.influence[this.dimensions.shapeRotation] += pushX * pushStrength * 0.2;
        
        // Subtle color drift based on position
        this.influence[this.dimensions.hue1] += pushX * pushStrength * 0.08;
        this.influence[this.dimensions.hue2] += -pushX * pushStrength * 0.08;
        
        // === AUDIO PARAMETERS ===
        // Face position also affects audio state for more connected experience
        
        // Looking up/down affects filter brightness
        this.influence[this.dimensions.filterCutoff] += -pushY * pushStrength * 0.4;
        
        // Distance (size) affects reverb and granular density
        this.influence[this.dimensions.reverbAmount] += -pushSize * pushStrength * 0.3; // Further = more reverb
        this.influence[this.dimensions.granularDensity] += pushSize * pushStrength * 0.35;
        
        // Left/right affects delay and chorus subtly
        this.influence[this.dimensions.delayAmount] += Math.abs(pushX) * pushStrength * 0.2;
        this.influence[this.dimensions.chorusAmount] += Math.abs(pushX) * pushStrength * 0.15;
        
        // Drone volumes respond to face size (proximity engagement)
        this.influence[this.dimensions.droneBaseVolume] += pushSize * pushStrength * 0.25;
        this.influence[this.dimensions.droneMidVolume] += pushSize * pushStrength * 0.2;
        this.influence[this.dimensions.droneHighVolume] += -pushY * pushStrength * 0.2; // Looking up = higher drones
    }
    
    // =========================================
    // RICH FACE FEATURES (Face Mesh)
    // =========================================
    
    /**
     * Handle all rich face features from Face Mesh
     * @param {Object} faceData - Complete face data from FaceTracker
     */
    handleFaceFeatures(faceData) {
        if (!faceData || !faceData.detected) return;
        
        const str = 0.04; // Base influence strength - increased for more visible effect
        
        // === HEAD ROTATION ===
        // Yaw (turning left/right) - affects horizontal displacement and color shift
        this.influence[this.dimensions.displacementX] += faceData.headYaw * str * 1.5;
        this.influence[this.dimensions.hue1] += faceData.headYaw * str * 0.3;
        this.influence[this.dimensions.shapeRotation] += faceData.headYaw * str * 0.4;
        
        // Pitch (looking up/down) - affects vertical position and brightness
        this.influence[this.dimensions.displacementY] += faceData.headPitch * str * 1.2;
        this.influence[this.dimensions.gradientBrightness] += -faceData.headPitch * str * 0.8;
        this.influence[this.dimensions.glow] += -faceData.headPitch * str * 0.6;
        this.influence[this.dimensions.filterCutoff] += -faceData.headPitch * str * 0.8;
        
        // Roll (tilting head sideways) - affects rotation and wave patterns
        this.influence[this.dimensions.shapeRotation] += faceData.headRoll * str * 0.8;
        this.influence[this.dimensions.colorRotation] += faceData.headRoll * str * 0.5;
        this.influence[this.dimensions.displacementRotation] += faceData.headRoll * str * 0.6;
        
        // === EYE OPENNESS ===
        // Eyes open = more alert, intense visuals
        // Eyes closing = calmer, dreamier
        const eyeOpenness = faceData.eyesOpen || (faceData.leftEyeOpen + faceData.rightEyeOpen) / 2;
        this.influence[this.dimensions.overallIntensity] += (eyeOpenness - 0.5) * str * 1.2;
        this.influence[this.dimensions.displacementStrength] += (eyeOpenness - 0.5) * str * 1.0;
        this.influence[this.dimensions.gradientBrightness] += (eyeOpenness - 0.5) * str * 0.8;
        
        // Asymmetric eye openness (winking) - creates visual asymmetry
        const eyeAsymmetry = faceData.leftEyeOpen - faceData.rightEyeOpen;
        this.influence[this.dimensions.displacementX] += eyeAsymmetry * str * 0.8;
        this.influence[this.dimensions.gradientOffsetX] += eyeAsymmetry * str * 0.6;
        
        // === GAZE DIRECTION ===
        // Where you're looking affects where the visuals "pull"
        this.influence[this.dimensions.displacementX] += faceData.gazeX * str * 1.2;
        this.influence[this.dimensions.displacementY] += faceData.gazeY * str * 1.0;
        
        // === MOUTH ===
        // Mouth open = more chaotic, organic, granular audio
        this.influence[this.dimensions.overallChaos] += faceData.mouthOpen * str * 1.5;
        this.influence[this.dimensions.granularDensity] += faceData.mouthOpen * str * 1.2;
        this.influence[this.dimensions.reverbAmount] += faceData.mouthOpen * str * 0.8;
        this.influence[this.dimensions.displacementStrength] += faceData.mouthOpen * str * 0.8;
        
        // Mouth width (smile) = brighter, more saturated, happier frequencies
        this.influence[this.dimensions.gradientSaturation] += faceData.mouthWidth * str * 1.0;
        this.influence[this.dimensions.gradientBrightness] += faceData.mouthWidth * str * 0.8;
        this.influence[this.dimensions.droneHighVolume] += faceData.mouthWidth * str * 0.6;
        this.influence[this.dimensions.glow] += faceData.mouthWidth * str * 0.5;
        
        // === EYEBROWS ===
        // Raised brows = surprise, expanded visuals
        const browRaise = faceData.browRaise || (faceData.leftBrowRaise + faceData.rightBrowRaise) / 2;
        this.influence[this.dimensions.displacementRadius] += browRaise * str * 1.2;
        this.influence[this.dimensions.glow] += browRaise * str * 0.8;
        this.influence[this.dimensions.overallIntensity] += browRaise * str * 0.6;
        
        // Furrowed brows = tension, darker, more bass
        this.influence[this.dimensions.gradientBrightness] += -faceData.browFurrow * str * 1.0;
        this.influence[this.dimensions.droneBaseVolume] += faceData.browFurrow * str * 0.8;
        this.influence[this.dimensions.displacementStrength] += faceData.browFurrow * str * 0.8;
        this.influence[this.dimensions.filterResonance] += faceData.browFurrow * str * 0.5;
        
        // === ATTENTION/ENGAGEMENT ===
        // Looking at screen = more focused, coherent visuals
        this.influence[this.dimensions.overallChaos] += -(faceData.lookingAtScreen - 0.5) * str * 0.8;
        
        // Overall engagement affects overall intensity
        this.influence[this.dimensions.overallIntensity] += (faceData.engagement - 0.5) * str * 0.8;
    }
    
    /**
     * Handle blink events - can trigger visual flashes or transitions
     */
    handleBlink() {
        // Brief intensity spike on blink
        this.influence[this.dimensions.glow] += 0.25;
        this.influence[this.dimensions.displacementStrength] += 0.15;
        this.influence[this.dimensions.overallIntensity] += 0.12;
    }
    
    /**
     * Handle talking detection - adds rhythmic modulation
     */
    handleTalking(isTalking) {
        if (isTalking) {
            // Talking adds subtle rhythmic chaos
            this.influence[this.dimensions.overallChaos] += 0.02;
            this.influence[this.dimensions.granularDensity] += 0.015;
        }
    }
    
    handleMotion(tiltX, tiltY, shake) {
        // Device motion influences gradients and chaos
        this.influence[this.dimensions.gradientOffsetX] += tiltX * 0.05;
        this.influence[this.dimensions.gradientOffsetY] += tiltY * 0.05;
        this.influence[this.dimensions.overallChaos] += shake * 0.1;
    }
    
    // =========================================
    // GETTERS FOR CURRENT STATE
    // =========================================
    
    get(dimensionName) {
        const idx = this.dimensions[dimensionName];
        return idx !== undefined ? this.current[idx] : 0;
    }
    
    getScaled(dimensionName, min, max) {
        const value = this.get(dimensionName);
        return min + value * (max - min);
    }
    
    getArray(dimensionNames) {
        return dimensionNames.map(name => this.get(name));
    }
    
    // Set a dimension's current and target value directly
    setDimensionValue(dimensionName, value) {
        const idx = this.dimensions[dimensionName];
        if (idx !== undefined) {
            this.current[idx] = value;
            this.target[idx] = value;
        }
    }
    
    // Calculate orbital X position for secondary ripples
    // Orbits around the main displacement center at different speeds
    calculateOrbitX(index, radius) {
        const centerX = this.get('displacementX') || 0.5;
        const speed = 0.15 / index;  // Slower for outer orbits
        const phase = index * Math.PI * 0.667;  // Different starting phases
        const offset = Math.cos((this.time || 0) * speed + phase) * radius;
        return Math.max(0, Math.min(1, centerX + offset));
    }
    
    // Calculate orbital Y position for secondary ripples
    calculateOrbitY(index, radius) {
        const centerY = this.get('displacementY') || 0.5;
        const speed = 0.15 / index;
        const phase = index * Math.PI * 0.667;
        const offset = Math.sin((this.time || 0) * speed + phase) * radius;
        return Math.max(0, Math.min(1, centerY + offset));
    }
    
    // Get all visual-related state for shaders
    getVisualState() {
        return {
            // Colors (as hue values 0-1, will be converted to RGB)
            colorHue1: this.get('colorHue1'),
            colorHue2: this.get('colorHue2'),
            colorHue3: this.get('colorHue3'),
            colorHue4: this.get('colorHue4'),
            colorSaturation: this.getScaled('colorSaturation', 0.5, 1.0),
            colorBrightness: this.getScaled('colorBrightness', 0.35, 0.7),  // Darker range
            colorContrast: this.getScaled('colorContrast', 0.9, 1.2),
            colorWarmth: this.get('colorWarmth'),
            
            // Gradient - slow, smooth with organic color drop parameters
            gradientSpeed: this.getScaled('gradientSpeed', 0.0001, 0.0006),
            gradientScale: this.getScaled('gradientScale', 0.3, 1.2),
            gradientComplexity: this.getScaled('gradientComplexity', 2.5, 5.5),
            gradientOffsetX: this.getScaled('gradientOffsetX', -0.4, 0.4),
            gradientOffsetY: this.getScaled('gradientOffsetY', -0.4, 0.4),
            
            // Organic color drop parameters
            colorDropSpeed: this.getScaled('overallSpeed', 0.02, 0.08),
            colorDropSpread: this.getScaled('overallChaos', 0.3, 0.8),
            colorMixIntensity: this.getScaled('overallIntensity', 0.4, 0.9),
            
            // Displacement - STRONGER optical effects, 3D slice paradigm
            // Focus mode creates smaller, more intense portal
            displacementX: this.get('displacementX'),
            displacementY: this.get('displacementY'),
            displacementStrength: this.getScaled('displacementStrength', 0.6, 2.2) * (1 + this.focusMode.intensity * 0.7),
            displacementRadius: this.getScaled('displacementRadius', 0.5, 2.2) * (1 - this.focusMode.intensity * 0.4),
            displacementRings: Math.floor(this.getScaled('displacementRings', 4, 14)),
            displacementRotation: this.get('displacementRotation') * Math.PI * 2,
            displacementWobble: this.getScaled('displacementWobble', 0.02, 0.18),
            displacementChromatic: this.getScaled('displacementChromatic', 0.05, 0.35) * (1 + this.focusMode.intensity * 0.5),
            
            // Focus mode intensity for shader use
            focusIntensity: this.focusMode.intensity,
            
            // Additional ripple origins - orbit around main center
            // Calculate orbital positions based on time for smooth movement
            rippleOrigin2X: this.calculateOrbitX(2, 0.25),
            rippleOrigin2Y: this.calculateOrbitY(2, 0.25),
            rippleOrigin2Strength: this.getScaled('rippleOrigin2Strength', 0.2, 0.6),
            rippleOrigin3X: this.calculateOrbitX(3, 0.35),
            rippleOrigin3Y: this.calculateOrbitY(3, 0.35),
            rippleOrigin3Strength: this.getScaled('rippleOrigin3Strength', 0.1, 0.4),
            
            // Shape and style - 12 different 3D slice modes
            // 0: circles, 1: torus, 2: linear bands, 3: skewed lines, 4: cylinder
            // 5: sphere, 6: hyperboloid, 7: spiral ramp, 8: parallel planes, 9: conic, 10: möbius, 11: pill
            shapeType: this.getScaled('shapeType', 0, 12),  // Allow fractional for blending
            
            // Wave motion - dedicated controls for flowing delayed movement
            waveDelay: this.getScaled('waveDelay', 0.15, 1.2),
            waveAmplitude: this.getScaled('waveAmplitude', 0.03, 0.25),
            waveSpeed: this.getScaled('waveSpeed', 0.3, 2.5),
            
            // Edge and shape controls - SHARPER for stronger optical effect
            edgeSharpness: this.getScaled('edgeSharpness', 0.02, 0.15),
            minRadius: this.getScaled('minRadius', 0, 0.35),
            shapeRotation: this.getScaled('shapeRotation', 0, 6.28),
            rotationSpeed: this.getScaled('rotationSpeed', 0, 0.4),
            
            // Fold and inversion (for shapes 9 & 10)
            foldAmount: this.getScaled('foldAmount', 0, 1),
            invertAmount: this.getScaled('invertAmount', 0, 1),
            
            // Secondary/tertiary wave intensity
            secondaryWave: this.getScaled('secondaryWave', 0, 0.5),
            tertiaryWave: this.getScaled('tertiaryWave', 0, 0.3),
            
            // Morph
            morphProgress: this.get('morphProgress'),
            morphType: Math.floor(this.get('morphType') * 3),
            
            // Post processing - darker overall, no vignette
            blur: this.getScaled('blur', 0, 1.0),
            glow: this.getScaled('glow', 0.05, 0.3),
            vignette: 0,  // No vignette
            saturationPost: this.getScaled('saturationPost', 0.9, 1.3),
            brightnessPost: this.getScaled('brightnessPost', 0.75, 0.95),  // Darker
            contrastPost: this.getScaled('contrastPost', 0.95, 1.15),
            noiseAmount: this.getScaled('noiseAmount', 0, 0.015),
            
            // Particles
            particleSpeed: this.getScaled('particleSpeed', 0.005, 0.03),
            particleSize: this.getScaled('particleSize', 0.5, 1.5),
            
            // Global - slow, meditative
            overallIntensity: this.get('overallIntensity'),
            breathingRate: this.getScaled('breathingRate', 0.02, 0.08),
            pulseRate: this.getScaled('pulseRate', 0.03, 0.12)
        };
    }
    
    // Get audio-related state
    getAudioState() {
        return {
            // Volume levels (normalized 0-1 for modulateFromState)
            audioVolume: this.get('overallIntensity'),
            audioBass: this.getScaled('droneBaseVolume', 0, 1),
            audioMid: this.getScaled('droneMidVolume', 0, 1),
            audioHigh: this.getScaled('droneHighVolume', 0, 1),
            
            // Filter settings (normalized 0-1)
            audioFilterBase: this.getScaled('filterCutoff', 0, 1),
            audioFilterMid: this.getScaled('filterResonance', 0, 1),
            audioFilterHigh: this.get('colorBrightness'), // Use brightness for high filter
            
            // Effects (normalized 0-1)
            audioReverb: this.getScaled('reverbAmount', 0, 1),
            audioDelay: this.getScaled('delayAmount', 0, 1),
            audioModulation: this.getScaled('chorusAmount', 0, 1),
            audioGrain: this.getScaled('granularDensity', 0, 1),
            
            // Legacy properties for compatibility
            droneBasePitch: this.getScaled('droneBasePitch', 40, 80),
            droneMidPitch: this.getScaled('droneMidPitch', 80, 200),
            droneHighPitch: this.getScaled('droneHighPitch', 300, 600),
            filterCutoff: this.getScaled('filterCutoff', 100, 4000),
            filterResonance: this.getScaled('filterResonance', 0.5, 8),
            reverbAmount: this.getScaled('reverbAmount', 0.2, 0.8),
            delayAmount: this.getScaled('delayAmount', 0.1, 0.5),
            chorusAmount: this.getScaled('chorusAmount', 0.1, 0.4),
            granularDensity: this.getScaled('granularDensity', 0.1, 0.8)
        };
    }
    
    // Debug: get all values
    getAllState() {
        const state = {};
        for (const [name, idx] of Object.entries(this.dimensions)) {
            state[name] = this.current[idx].toFixed(3);
        }
        return state;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StateEngine;
}
