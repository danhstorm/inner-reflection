/**
 * INNER REFLECTION - Visual Engine
 * 
 * WebGL rendering system using Three.js with multi-pass shader pipeline.
 * 
 * Render Pipeline:
 * 1. Gradient Pass - Renders flowing color background to texture
 * 2. Displacement Pass - Applies refraction effects, samples gradient texture
 * 3. Post-Processing Pass - Final color grading, blur, grain to screen
 * 4. Particle Overlay - Additive blended floating particles
 * 
 * Key Features:
 * - Aspect ratio preservation (circles stay circular on any viewport)
 * - All visual parameters driven by StateEngine
 * - Resolution-independent render targets
 * - Smooth resize handling
 * 
 * Uniforms are updated each frame from StateEngine.getVisualState()
 */

class VisualEngine {
    constructor() {
        this.isInitialized = false;
        
        // Three.js components
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        
        // Render targets for multi-pass rendering
        this.renderTargets = {};
        
        // Shader materials
        this.materials = {};
        
        // Meshes
        this.meshes = {};
        
        // Scenes for each pass
        this.scenes = {};
        
        // Animation state
        this.time = 0;
        this.breathingPhase = 0;
        
        // Particles
        this.particles = null;
        this.particleVelocities = null;
        
        // === START FADE - controls transition from preview to full experience ===
        // 0 = preview (dim), 1 = full experience
        this.startFade = 0;
        this.startFadeTarget = 0;
        
        // === SMOOTH BUFFER FOR ALL VISUAL VALUES (ANTI-GLITCH) ===
        // These smoothed values ensure EVERY parameter transitions gradually
        // No sudden jumps - everything flows like water
        this.smoothBuffer = {
            // Position
            centerX: 0.5,
            centerY: 0.5,
            ripple2X: 0.3,
            ripple2Y: 0.3,
            ripple3X: 0.7,
            ripple3Y: 0.7,
            // Displacement
            strength: 0.5,
            radius: 0.7,
            rings: 8,
            wobble: 0.1,
            chromatic: 0.2,
            // Shape
            shapeType: 0,
            rotation: 0,
            // Effects
            blur: 0.3,
            glow: 0.2,
            vignette: 0,
            // Secondary ripples
            ripple2Strength: 0.3,
            ripple3Strength: 0.2,
            // Wave parameters
            waveDelay: 0.4,
            waveAmplitude: 0.05,
            edgeSharpness: 0.03,
            minRadius: 0.05
        };
        
        // Ring lag centers for delayed motion
        this.ringLagCenters = {
            lag1: new THREE.Vector2(0.5, 0.5),
            lag2: new THREE.Vector2(0.5, 0.5),
            lag3: new THREE.Vector2(0.5, 0.5)
        };
        this.ringLagInitialized = false;

        this.handInertia = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0, 0)
        ];
        this.handInertiaDecay = 0.985;  // Very slow decay for lingering liquid effect
        this.fastSmoothingFrames = 0;
    }
    
    // =========================================
    // INITIALIZATION
    // =========================================
    
    async init(canvas) {
        if (this.isInitialized) return;
        
        console.log('VisualEngine: Initializing...');
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: CONFIG.performance.antialias,
            powerPreference: CONFIG.performance.powerPreference,
            alpha: false
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(CONFIG.performance.pixelRatio);
        
        // Create render targets
        this.createRenderTargets();
        
        // Create scenes
        this.createScenes();
        
        // Create materials
        this.createMaterials();
        
        // Create meshes
        this.createMeshes();
        
        // Create particles
        if (CONFIG.visual.particles.enabled) {
            this.createParticles();
        }
        
        // Handle resize
        window.addEventListener('resize', this.handleResize.bind(this));
        
        this.isInitialized = true;
        console.log('VisualEngine: Initialized');
    }
    
    createRenderTargets() {
        const width = window.innerWidth * CONFIG.performance.pixelRatio;
        const height = window.innerHeight * CONFIG.performance.pixelRatio;
        
        const options = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType
        };
        
        this.renderTargets.gradient = new THREE.WebGLRenderTarget(width, height, options);
        this.renderTargets.displacement = new THREE.WebGLRenderTarget(width, height, options);
        this.renderTargets.post = new THREE.WebGLRenderTarget(width, height, options);
        
        console.log('VisualEngine: Render targets created');
    }
    
    createScenes() {
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        this.scenes.gradient = new THREE.Scene();
        this.scenes.displacement = new THREE.Scene();
        this.scenes.post = new THREE.Scene();
        
        // Particle scene with perspective camera
        this.scenes.particles = new THREE.Scene();
        this.particleCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.particleCamera.position.z = 5;
        
        console.log('VisualEngine: Scenes created');
    }
    
    createMaterials() {
        this.materials.gradient = Shaders.createGradientMaterial();
        this.materials.displacement = Shaders.createDisplacementMaterial();
        this.materials.post = Shaders.createPostMaterial();
        
        console.log('VisualEngine: Materials created');
    }
    
    createMeshes() {
        const geometry = new THREE.PlaneGeometry(2, 2);
        
        this.meshes.gradient = new THREE.Mesh(geometry, this.materials.gradient);
        this.scenes.gradient.add(this.meshes.gradient);
        
        this.meshes.displacement = new THREE.Mesh(geometry, this.materials.displacement);
        this.scenes.displacement.add(this.meshes.displacement);
        
        this.meshes.post = new THREE.Mesh(geometry, this.materials.post);
        this.scenes.post.add(this.meshes.post);
        
        console.log('VisualEngine: Meshes created');
    }
    
    createParticles() {
        const count = CONFIG.visual.particles.count;
        
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const alphas = new Float32Array(count);
        const colors = new Float32Array(count * 3);
        
        this.particleVelocities = new Float32Array(count * 3);
        
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 3 + Math.random() * 2;
            
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            
            sizes[i] = Utils.random(CONFIG.visual.particles.size.min, CONFIG.visual.particles.size.max);
            alphas[i] = Utils.random(CONFIG.visual.particles.opacity.min, CONFIG.visual.particles.opacity.max);
            
            // Start with a neutral color, will be updated from state
            colors[i * 3] = 0.5;
            colors[i * 3 + 1] = 0.8;
            colors[i * 3 + 2] = 0.7;
            
            this.particleVelocities[i * 3] = Utils.random(-0.02, 0.02);
            this.particleVelocities[i * 3 + 1] = Utils.random(-0.02, 0.02);
            this.particleVelocities[i * 3 + 2] = Utils.random(-0.02, 0.02);
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: CONFIG.performance.pixelRatio }
            },
            vertexShader: Shaders.particleVertex,
            fragmentShader: Shaders.particleFragment,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        this.particles = new THREE.Points(geometry, material);
        this.scenes.particles.add(this.particles);
        
        console.log('VisualEngine: Particles created');
    }
    
    // =========================================
    // RENDER LOOP - Now driven by StateEngine
    // =========================================
    
    render(deltaTime, visualState) {
        if (!this.isInitialized) return;
        
        // Slow down time progression for calmer animation
        this.time += deltaTime * 0.3;
        this.breathingPhase += deltaTime * (visualState?.breathingRate || 0.05) * 0.5;
        
        if (visualState) {
            this.updateRingLagCenters(
                deltaTime,
                { x: visualState.displacementX, y: visualState.displacementY },
                visualState.ringDelay
            );
        }
        
        // Update all shader uniforms from state
        this.updateShadersFromState(visualState);
        
        // Update particles
        if (this.particles && visualState) {
            this.updateParticles(deltaTime, visualState);
        }
        
        // Multi-pass rendering
        
        // Pass 1: Gradient background
        this.materials.gradient.uniforms.uTime.value = this.time;
        this.renderer.setRenderTarget(this.renderTargets.gradient);
        this.renderer.render(this.scenes.gradient, this.camera);
        
        // Pass 2: Displacement effect
        this.materials.displacement.uniforms.uTexture.value = this.renderTargets.gradient.texture;
        this.materials.displacement.uniforms.uTime.value = this.time;
        this.materials.displacement.uniforms.uBreathingPhase.value = this.breathingPhase;
        this.renderer.setRenderTarget(this.renderTargets.displacement);
        this.renderer.render(this.scenes.displacement, this.camera);
        
        // Pass 3: Post-processing
        this.materials.post.uniforms.uTexture.value = this.renderTargets.displacement.texture;
        this.materials.post.uniforms.uTime.value = this.time;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scenes.post, this.camera);
        
        // Overlay particles
        if (this.particles) {
            this.renderer.autoClear = false;
            this.renderer.render(this.scenes.particles, this.particleCamera);
            this.renderer.autoClear = true;
        }
    }

    boostSmoothing(frames = 12) {
        this.fastSmoothingFrames = Math.max(this.fastSmoothingFrames, frames);
    }
    
    updateShadersFromState(state) {
        if (!state) return;
        
        const grad = this.materials.gradient.uniforms;
        const disp = this.materials.displacement.uniforms;
        const post = this.materials.post.uniforms;
        
        // === SMOOTHLY INTERPOLATE START FADE ===
        const fadeSpeed = 0.008; // Slow fade-in over ~2-3 seconds
        this.startFade += (this.startFadeTarget - this.startFade) * fadeSpeed;
        grad.uStartFade.value = this.startFade;
        
        // Gradient uniforms - more colors, darker
        grad.uHue1.value = state.colorHue1;
        grad.uHue2.value = state.colorHue2;
        grad.uHue3.value = state.colorHue3;
        grad.uHue4.value = state.colorHue4;
        grad.uSaturation.value = state.colorSaturation;
        grad.uBrightness.value = state.colorBrightness;
        grad.uContrast.value = state.colorContrast;
        grad.uWarmth.value = state.colorWarmth;
        grad.uSpeed.value = state.gradientSpeed;
        grad.uNoiseScale.value = state.gradientScale;
        grad.uComplexity.value = state.gradientComplexity;
        grad.uOffset.value.set(state.gradientOffsetX, state.gradientOffsetY);
        grad.uIntensity.value = state.overallIntensity;
        grad.uBreathingRate.value = state.breathingRate;
        grad.uPulseRate.value = state.pulseRate;
        
        // Brightness evolution control (from slider)
        grad.uBrightnessEvolution.value = state.brightnessEvolution || 0.5;
        
        // Organic color drop parameters
        grad.uColorDropSpeed.value = state.colorDropSpeed || 0.05;
        grad.uColorDropSpread.value = state.colorDropSpread || 0.5;
        grad.uColorMixIntensity.value = state.colorMixIntensity || 0.7;
        
        // Blob controls (manual parameters)
        grad.uBlobCount.value = state.blobCount ?? 10;
        grad.uBlobSpread.value = state.blobSpread ?? 0.75;
        grad.uBlobScale.value = state.blobScale ?? 0.9;
        grad.uBlobMotion.value = state.blobMotion ?? 0.5;
        grad.uBlobBlur.value = state.blobBlur ?? 0.7;
        grad.uBlobSmear.value = state.blobSmear ?? 0.7;
        grad.uBlobLighten.value = state.blobLighten ?? 0.25;
        grad.uBlobInvert.value = state.blobInvert ?? 0.15;
        grad.uBlobFade.value = state.blobFade ?? 0.7;
        grad.uBlobWarp.value = state.blobWarp ?? 0.3;
        grad.uBlobOffset.value.set(state.blobOffsetX ?? 0, state.blobOffsetY ?? 0);
        
        const hand = state.hand;
        if (hand) {
            const count = Math.min(hand.count || 0, 2);
            grad.uHandCount.value = count;
            grad.uHandInfluence.value = hand.influence ?? 0.5;
            disp.uHandCount.value = count;
            disp.uHandInfluence.value = hand.influence ?? 0.5;
            
            for (let i = 0; i < 2; i++) {
                const pos = hand.positions?.[i] || { x: 0.5, y: 0.5 };
                const vel = hand.velocities?.[i] || { x: 0, y: 0 };
                const strength = hand.strengths?.[i] || 0;
                const inertia = this.handInertia[i];
                const active = i < count && (strength > 0.01 || Math.abs(vel.x) + Math.abs(vel.y) > 0.001);
                const impulse = active ? (0.7 + strength * 1.5) : 0;  // Stronger impulse
                inertia.x = inertia.x * this.handInertiaDecay + vel.x * impulse;
                inertia.y = inertia.y * this.handInertiaDecay + vel.y * impulse;

                grad.uHandPos.value[i].set(pos.x, pos.y);
                grad.uHandVel.value[i].set(inertia.x, inertia.y);
                grad.uHandStrength.value[i] = Math.min(strength * 1.8, 1);  // Stronger visual effect
                disp.uHandPos.value[i].set(pos.x, pos.y);
                disp.uHandVel.value[i].set(inertia.x, inertia.y);
                disp.uHandStrength.value[i] = Math.min(strength * 1.8, 1);  // Stronger visual effect
            }
        } else {
            grad.uHandCount.value = 0;
            disp.uHandCount.value = 0;
            for (let i = 0; i < this.handInertia.length; i++) {
                this.handInertia[i].multiplyScalar(this.handInertiaDecay);
            }
        }
        
        // === CRITICAL: SMOOTH BUFFER FOR ALL VISUAL PARAMETERS ===
        // This ensures EVERY parameter transitions smoothly - no jumps allowed
        // Even if sliders change instantly, the visuals morph gradually
        const fastSmoothing = this.fastSmoothingFrames > 0;
        const smoothFactor = fastSmoothing ? 0.08 : 0.008;  // Smooth interpolation rate
        const slowFactor = fastSmoothing ? 0.04 : 0.004;    // Extra slow for discrete values like rings/shape
        if (fastSmoothing) {
            this.fastSmoothingFrames = Math.max(0, this.fastSmoothingFrames - 1);
        }
        
        // Smooth all center positions
        this.smoothBuffer.centerX += (state.displacementX - this.smoothBuffer.centerX) * smoothFactor;
        this.smoothBuffer.centerY += (state.displacementY - this.smoothBuffer.centerY) * smoothFactor;
        this.smoothBuffer.ripple2X += ((state.rippleOrigin2X || 0.3) - this.smoothBuffer.ripple2X) * smoothFactor;
        this.smoothBuffer.ripple2Y += ((state.rippleOrigin2Y || 0.3) - this.smoothBuffer.ripple2Y) * smoothFactor;
        this.smoothBuffer.ripple3X += ((state.rippleOrigin3X || 0.7) - this.smoothBuffer.ripple3X) * smoothFactor;
        this.smoothBuffer.ripple3Y += ((state.rippleOrigin3Y || 0.7) - this.smoothBuffer.ripple3Y) * smoothFactor;
        
        // Smooth displacement parameters
        this.smoothBuffer.strength += (state.displacementStrength - this.smoothBuffer.strength) * smoothFactor;
        this.smoothBuffer.radius += (state.displacementRadius - this.smoothBuffer.radius) * smoothFactor;
        this.smoothBuffer.rings += (state.displacementRings - this.smoothBuffer.rings) * slowFactor; // Very slow for rings
        this.smoothBuffer.wobble += (state.displacementWobble - this.smoothBuffer.wobble) * smoothFactor;
        this.smoothBuffer.chromatic += (state.displacementChromatic - this.smoothBuffer.chromatic) * smoothFactor;
        
        // Shape type - VERY slow for smooth morphing between shapes
        this.smoothBuffer.shapeType += ((state.shapeType || 0) - this.smoothBuffer.shapeType) * slowFactor * 0.5;
        
        // Smooth rotation (handle wraparound carefully)
        let rotDiff = state.displacementRotation - this.smoothBuffer.rotation;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        this.smoothBuffer.rotation += rotDiff * smoothFactor;
        
        // Smooth ripple strengths
        this.smoothBuffer.ripple2Strength += ((state.rippleOrigin2Strength || 0) - this.smoothBuffer.ripple2Strength) * smoothFactor;
        this.smoothBuffer.ripple3Strength += ((state.rippleOrigin3Strength || 0) - this.smoothBuffer.ripple3Strength) * smoothFactor;
        
        // Smooth wave parameters
        this.smoothBuffer.waveDelay += ((state.waveDelay || 0.4) - this.smoothBuffer.waveDelay) * smoothFactor;
        this.smoothBuffer.waveAmplitude += ((state.waveAmplitude || 0.05) - this.smoothBuffer.waveAmplitude) * smoothFactor;
        this.smoothBuffer.edgeSharpness += ((state.edgeSharpness || 0.02) - this.smoothBuffer.edgeSharpness) * smoothFactor;
        this.smoothBuffer.minRadius += ((state.minRadius || 0.05) - this.smoothBuffer.minRadius) * smoothFactor;
        
        // Smooth post-processing - reduced blur default for sharper circles
        this.smoothBuffer.blur += ((state.blur || 0.1) - this.smoothBuffer.blur) * smoothFactor;
        this.smoothBuffer.glow += ((state.glow || 0.2) - this.smoothBuffer.glow) * smoothFactor;
        this.smoothBuffer.vignette += ((state.vignette ?? 0) - (this.smoothBuffer.vignette ?? 0)) * smoothFactor;
        
        // === APPLY SMOOTHED VALUES TO DISPLACEMENT SHADER ===
        disp.uCenter.value.set(this.smoothBuffer.centerX, this.smoothBuffer.centerY);
        disp.uCenterLag1.value.set(this.ringLagCenters.lag1.x, this.ringLagCenters.lag1.y);
        disp.uCenterLag2.value.set(this.ringLagCenters.lag2.x, this.ringLagCenters.lag2.y);
        disp.uCenterLag3.value.set(this.ringLagCenters.lag3.x, this.ringLagCenters.lag3.y);
        disp.uRingDelayMix.value = state.ringDelay ?? 0.35;
        disp.uStrength.value = Math.min(this.smoothBuffer.strength, 3.5);  // Higher cap for stronger circles
        disp.uMaxRadius.value = this.smoothBuffer.radius;
        disp.uRings.value = this.smoothBuffer.rings;  // Now smooth!
        disp.uWobble.value = this.smoothBuffer.wobble;
        disp.uChromaticAberration.value = Math.min(this.smoothBuffer.chromatic, 0.4);
        disp.uRipple2Center.value.set(this.smoothBuffer.ripple2X, this.smoothBuffer.ripple2Y);
        disp.uRipple2Strength.value = this.smoothBuffer.ripple2Strength;
        disp.uRipple3Center.value.set(this.smoothBuffer.ripple3X, this.smoothBuffer.ripple3Y);
        disp.uRipple3Strength.value = this.smoothBuffer.ripple3Strength;
        
        // Shape and style - USE SMOOTHED VALUES
        disp.uShapeType.value = this.smoothBuffer.shapeType;  // Smooth morphing
        disp.uMorphProgress.value = state.morphProgress;
        disp.uMorphType.value = state.morphType;
        disp.uFoldAmount.value = state.foldAmount || 0.5;
        disp.uInversion.value = state.invertAmount || 0.5;
        
        disp.uIntensity.value = state.overallIntensity;
        
        // Wave motion uniforms - use smoothed values
        const waveSpeed = state.waveSpeed || 0.3;
        disp.uWavePhase.value = this.time * waveSpeed * 0.15;
        disp.uWaveDelay.value = this.smoothBuffer.waveDelay;
        disp.uWaveAmplitude.value = this.smoothBuffer.waveAmplitude * 0.5;
        disp.uSecondaryWave.value = (state.secondaryWave || 0.3) * 0.5;  // Reduced secondary
        disp.uTertiaryWave.value = (state.tertiaryWave || 0.1) * 0.3;  // Reduced tertiary
        disp.uSizeWave.value = 0.05 + state.breathingRate * 0.15;  // Smaller size wave
        
        // Ring overlay (manual)
        disp.uRingOverlayStrength.value = state.ringOverlayStrength ?? 0.35;
        disp.uRingOverlayWidth.value = state.ringOverlayWidth ?? 0.35;
        
        // Parallel plane controls (manual)
        disp.uParallelStrength.value = state.parallelStrength ?? 0.16;
        disp.uParallelZoom.value = state.parallelZoom ?? 0.42;
        disp.uParallelZoomDrift.value = state.parallelZoomDrift ?? 0.25;
        disp.uParallelSpin.value = state.parallelSpin ?? 0.25;
        disp.uParallelThickness.value = state.parallelThickness ?? 0.28;
        disp.uParallelPresence.value = state.parallelPresence ?? 0.12;
        
        // Edge and shape controls
        disp.uEdgeSharpness.value = state.edgeSharpness || 0.03;  // Ring edge transition
        disp.uMinRadius.value = this.smoothBuffer.minRadius;  // Smoothed center hole size
        disp.uEdgeSharpness.value = this.smoothBuffer.edgeSharpness;  // Smoothed edge
        
        // Rotation - USE SMOOTHED VALUE combined with MUCH SLOWER animated rotation
        const animatedRotation = this.time * (state.rotationSpeed || 0) * 0.1;  // 10x slower rotation
        disp.uRotation.value = this.smoothBuffer.rotation + animatedRotation;
        
        // Depth phase for 3D slice feel - slower
        disp.uBreathingPhase.value = this.breathingPhase;
        disp.uDepthPhase.value = this.time * 0.04;  // Much slower depth pulse
        
        // Post-processing uniforms - USE SMOOTHED VALUES
        post.uBlur.value = this.smoothBuffer.blur;
        post.uGlow.value = this.smoothBuffer.glow * 0.6;
        post.uVignette.value = this.smoothBuffer.vignette ?? state.vignette ?? 0;  // 0 = no vignette
        post.uVignetteShape.value = state.vignetteShape ?? 0.5;  // 0=rectangular, 1=oval
        post.uSaturation.value = state.saturationPost;
        post.uBrightness.value = state.brightnessPost;
        post.uContrast.value = state.contrastPost;
        post.uNoiseAmount.value = state.noiseAmount;
    }

    updateRingLagCenters(deltaTime, center, delayAmount) {
        if (!center) return;
        
        if (!this.ringLagInitialized) {
            this.ringLagCenters.lag1.set(center.x, center.y);
            this.ringLagCenters.lag2.set(center.x, center.y);
            this.ringLagCenters.lag3.set(center.x, center.y);
            this.ringLagInitialized = true;
        }
        
        const delay = Utils.clamp(delayAmount ?? 0.35, 0, 1);
        const baseSpeed = Utils.clamp(0.2 - delay * 0.16, 0.02, 0.2);
        const dt = Utils.clamp(deltaTime * 60, 0, 1);
        
        const step = (lag, speed) => {
            const t = Utils.clamp(speed * dt, 0, 1);
            lag.x += (center.x - lag.x) * t;
            lag.y += (center.y - lag.y) * t;
        };
        
        step(this.ringLagCenters.lag1, baseSpeed);
        step(this.ringLagCenters.lag2, baseSpeed * 0.65);
        step(this.ringLagCenters.lag3, baseSpeed * 0.45);
    }
    
    updateParticles(deltaTime, state) {
        if (!this.particles) return;
        
        const positions = this.particles.geometry.attributes.position.array;
        const alphas = this.particles.geometry.attributes.aAlpha.array;
        const colors = this.particles.geometry.attributes.aColor.array;
        const count = positions.length / 3;
        
        // Speed modulated by state
        const speedMod = state.particleSpeed || 0.01;
        const intensity = state.overallIntensity || 0.5;
        
        // Get color from state for particle tinting
        const hue1 = state.colorHue1 || 0.5;
        const hue2 = state.colorHue2 || 0.6;
        
        for (let i = 0; i < count; i++) {
            // Update positions with state-driven speed
            positions[i * 3] += this.particleVelocities[i * 3] * deltaTime * 60 * speedMod;
            positions[i * 3 + 1] += this.particleVelocities[i * 3 + 1] * deltaTime * 60 * speedMod;
            positions[i * 3 + 2] += this.particleVelocities[i * 3 + 2] * deltaTime * 60 * speedMod;
            
            // Wrap around
            const bound = 5;
            for (let j = 0; j < 3; j++) {
                if (positions[i * 3 + j] > bound) positions[i * 3 + j] = -bound;
                if (positions[i * 3 + j] < -bound) positions[i * 3 + j] = bound;
            }
            
            // Modulate alpha based on intensity (breathing effect)
            const baseAlpha = 0.1 + Math.sin(this.time * 0.5 + i * 0.1) * 0.05;
            alphas[i] = baseAlpha * (0.5 + intensity * 0.5);
            
            // Tint colors based on state hues (convert HSL to RGB simply)
            const particleHue = (i % 2 === 0) ? hue1 : hue2;
            const rgb = this.hslToRgb(particleHue, 0.3, 0.7);
            colors[i * 3] = rgb.r;
            colors[i * 3 + 1] = rgb.g;
            colors[i * 3 + 2] = rgb.b;
        }
        
        this.particles.geometry.attributes.position.needsUpdate = true;
        this.particles.geometry.attributes.aAlpha.needsUpdate = true;
        this.particles.geometry.attributes.aColor.needsUpdate = true;
        this.particles.material.uniforms.uTime.value = this.time;
        
        // Rotation driven by state
        this.particles.rotation.y += deltaTime * 0.02 * (1 + intensity);
        this.particles.rotation.x += deltaTime * 0.01 * (0.5 + intensity * 0.5);
    }
    
    // Simple HSL to RGB conversion
    hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return { r, g, b };
    }
    
    // =========================================
    // DIRECT MODULATION (kept for compatibility)
    // =========================================
    
    modulateFromAudio(audioData) {
        // Now handled through StateEngine
    }
    
    modulateFromFace(faceData) {
        // Now handled through StateEngine
    }
    
    modulateFromMotion(motionData) {
        // Now handled through StateEngine
    }
    
    // =========================================
    // START FADE CONTROL
    // =========================================
    
    // Call this when the experience starts to fade in the visuals
    startExperienceFade() {
        this.startFadeTarget = 1;
        console.log('VisualEngine: Starting experience fade-in');
    }
    
    // Call this to reset to preview mode
    resetToPreview() {
        this.startFade = 0;
        this.startFadeTarget = 0;
    }
    
    // =========================================
    // RESIZE HANDLING
    // =========================================
    
    handleResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Update renderer - use device pixel ratio for sharpness
        this.renderer.setSize(width, height, true);
        
        // Update render targets
        const pixelWidth = Math.floor(width * CONFIG.performance.pixelRatio);
        const pixelHeight = Math.floor(height * CONFIG.performance.pixelRatio);
        
        Object.values(this.renderTargets).forEach(target => {
            target.setSize(pixelWidth, pixelHeight);
        });
        
        // Update resolution uniforms with actual dimensions
        const resolution = new THREE.Vector2(width, height);
        this.materials.gradient.uniforms.uResolution.value = resolution;
        this.materials.displacement.uniforms.uResolution.value = resolution;
        this.materials.post.uniforms.uResolution.value = resolution;
        
        // Update particle camera
        if (this.particleCamera) {
            this.particleCamera.aspect = width / height;
            this.particleCamera.updateProjectionMatrix();
        }
        
        console.log('VisualEngine: Resized to', width, 'x', height);
    }
    
    // =========================================
    // CLEANUP
    // =========================================
    
    dispose() {
        // Dispose render targets
        Object.values(this.renderTargets).forEach(target => {
            target.dispose();
        });
        
        // Dispose materials
        Object.values(this.materials).forEach(material => {
            material.dispose();
        });
        
        // Dispose geometries
        Object.values(this.meshes).forEach(mesh => {
            mesh.geometry.dispose();
        });
        
        // Dispose particles
        if (this.particles) {
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }
        
        // Dispose renderer
        this.renderer.dispose();
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize.bind(this));
        
        console.log('VisualEngine: Disposed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VisualEngine;
}
