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
    
    updateShadersFromState(state) {
        if (!state) return;
        
        const grad = this.materials.gradient.uniforms;
        const disp = this.materials.displacement.uniforms;
        const post = this.materials.post.uniforms;
        
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
        
        // Organic color drop parameters
        grad.uColorDropSpeed.value = state.colorDropSpeed || 0.05;
        grad.uColorDropSpread.value = state.colorDropSpread || 0.5;
        grad.uColorMixIntensity.value = state.colorMixIntensity || 0.7;
        
        // Displacement uniforms - stronger refraction with focus mode
        disp.uCenter.value.set(state.displacementX, state.displacementY);
        disp.uStrength.value = state.displacementStrength;
        disp.uMaxRadius.value = state.displacementRadius;
        disp.uRings.value = state.displacementRings;
        disp.uRotation.value = state.displacementRotation;
        disp.uWobble.value = state.displacementWobble;
        disp.uChromaticAberration.value = state.displacementChromatic;
        disp.uRipple2Center.value.set(state.rippleOrigin2X || 0.3, state.rippleOrigin2Y || 0.3);
        disp.uRipple2Strength.value = state.rippleOrigin2Strength || 0;
        disp.uRipple3Center.value.set(state.rippleOrigin3X || 0.7, state.rippleOrigin3Y || 0.7);
        disp.uRipple3Strength.value = state.rippleOrigin3Strength || 0;
        
        // Shape and style - new parameters
        disp.uShapeType.value = state.shapeType || 0;
        disp.uMorphProgress.value = state.morphProgress;
        disp.uMorphType.value = state.morphType;
        disp.uFoldAmount.value = state.foldAmount || 0.5;
        disp.uInversion.value = state.invertAmount || 0.5;
        
        disp.uIntensity.value = state.overallIntensity;
        
        // Wave motion uniforms - THE KEY TO FLOWING DELAYED MOVEMENT
        const waveSpeed = state.waveSpeed || 1.0;
        disp.uWavePhase.value = this.time * waveSpeed * 0.6;  // Wave phase with controllable speed
        disp.uWaveDelay.value = state.waveDelay || 0.5;  // Delay between rings
        disp.uWaveAmplitude.value = state.waveAmplitude || 0.08;  // How much rings move
        disp.uSecondaryWave.value = state.secondaryWave || 0.3;  // Secondary wave intensity
        disp.uTertiaryWave.value = state.tertiaryWave || 0.1;  // Tertiary wave intensity
        disp.uSizeWave.value = 0.1 + state.breathingRate * 0.3;
        
        // Edge and shape controls
        disp.uEdgeSharpness.value = state.edgeSharpness || 0.03;  // Ring edge transition
        disp.uMinRadius.value = state.minRadius || 0.05;  // Center hole size
        const rotation = (state.shapeRotation || 0) + this.time * (state.rotationSpeed || 0);
        disp.uRotation.value = rotation;  // Combined static + animated rotation
        
        // Depth phase for 3D slice feel
        disp.uBreathingPhase.value = this.breathingPhase;
        disp.uDepthPhase.value = this.time * 0.15;  // Slow depth pulse
        
        // Post-processing uniforms - darker, no vignette
        post.uBlur.value = state.blur;
        post.uGlow.value = state.glow * 0.5;  // Reduced glow
        post.uVignette.value = 0;  // No vignette
        post.uSaturation.value = state.saturationPost;
        post.uBrightness.value = state.brightnessPost * 0.85;  // Darker
        post.uContrast.value = state.contrastPost;
        post.uNoiseAmount.value = state.noiseAmount;
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
