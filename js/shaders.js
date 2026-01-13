/**
 * INNER REFLECTION - GLSL Shaders
 * 
 * WebGL shader collection for the visual rendering pipeline.
 * 
 * Architecture:
 * 1. Gradient Shader - Creates flowing multi-color background using fractal noise
 * 2. Displacement Shader - Applies refraction effects with 11 shape modes
 * 3. Post-Processing Shader - Final color grading, blur, and grain
 * 
 * Key Features:
 * - Aspect ratio preservation (no stretching)
 * - Wave-delayed ring motion (outer rings follow inner with time delay)
 * - Sharp-edged stepped displacement for optical refraction look
 * - Strong chromatic aberration for color separation
 * - HSL color space for smooth hue transitions
 * 
 * Shape Modes (uShapeType 0-11):
 * 0: Circles, 1: Torus, 2: Linear bands, 3: Skewed lines, 4: Cylinder,
 * 5: Sphere, 6: Hyperboloid, 7: Spiral, 8: Parallel planes, 9: Conic,
 * 10: Moebius, 11: Pill/Capsule
 */

const Shaders = {
    // =========================================
    // GRADIENT BACKGROUND SHADER
    // Creates organic, flowing color fields using fractal Brownian motion
    // Four HSL colors blend like ink drops in liquid
    // =========================================
    
    gradientVertex: `
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    gradientFragment: `
        precision highp float;
        
        uniform float uTime;
        uniform vec2 uResolution;
        
        // Colors as HSL for smooth interpolation
        uniform float uHue1;
        uniform float uHue2;
        uniform float uHue3;
        uniform float uHue4;
        uniform float uSaturation;
        uniform float uBrightness;
        uniform float uContrast;
        uniform float uWarmth;
        
        uniform float uSpeed;
        uniform float uComplexity;
        uniform float uNoiseScale;
        uniform vec2 uOffset;
        
        // State-driven modulation
        uniform float uIntensity;
        uniform float uBreathingRate;
        uniform float uPulseRate;
        
        // Organic color drop parameters
        uniform float uColorDropSpeed;
        uniform float uColorDropSpread;
        uniform float uColorMixIntensity;
        
        // Start fade - 0 = preview (very dim), 1 = full experience
        uniform float uStartFade;
        
        // Brightness evolution control from slider (0-1.5)
        uniform float uBrightnessEvolution;

        // Blob controls
        uniform float uBlobCount;
        uniform float uBlobSpread;
        uniform float uBlobScale;
        uniform float uBlobMotion;
        uniform float uBlobBlur;
        uniform float uBlobSmear;
        uniform float uBlobLighten;
        uniform float uBlobInvert;
        uniform float uBlobFade;
        uniform float uBlobWarp;
        uniform vec2 uBlobOffset;
        
        // Hand interaction
        uniform float uHandCount;
        uniform vec2 uHandPos[2];
        uniform vec2 uHandVel[2];
        uniform float uHandStrength[2];
        uniform float uHandInfluence;
        
        varying vec2 vUv;
        
        // HSL to RGB conversion
        vec3 hsl2rgb(float h, float s, float l) {
            h = fract(h); // Wrap hue
            float c = (1.0 - abs(2.0 * l - 1.0)) * s;
            float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
            float m = l - c * 0.5;
            
            vec3 rgb;
            if (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
            else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
            else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
            else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
            else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
            else rgb = vec3(c, 0.0, x);
            
            return rgb + m;
        }
        
        // Simplex noise functions
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        
        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            
            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            
            i = mod289(i);
            vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
            
            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);
            
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;
            
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
        
        // Fractional Brownian Motion
        float fbm(vec3 p, float octaves) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;
            
            for (int i = 0; i < 6; i++) {
                if (float(i) >= octaves) break;
                value += amplitude * snoise(p * frequency);
                frequency *= 2.0;
                amplitude *= 0.5;
            }
            
            return value;
        }
        
        // Metaball-like distance function for concentrated color blobs
        float metaball(vec2 p, vec2 center, float radius) {
            float d = length(p - center);
            return radius / (d * d + 0.001);
        }
        
        // === ASYMMETRIC BLUR / SMUDGED SHAPE ===
        // Creates an elliptical, smudged shape instead of perfect circle
        float smudgedShape(vec2 p, vec2 center, float size, float smudgeAngle, float smudgeAmount, float softness) {
            vec2 toCenter = p - center;
            
            // Rotate to smudge direction
            float ca = cos(smudgeAngle);
            float sa = sin(smudgeAngle);
            vec2 rotated = vec2(toCenter.x * ca + toCenter.y * sa, -toCenter.x * sa + toCenter.y * ca);
            
            // Apply asymmetric scaling (more blur on one side)
            rotated.x /= (1.0 + smudgeAmount * 0.8);  // Stretch in smudge direction
            
            // Asymmetric softness - softer on trailing edge
            float dist = length(rotated);
            float asymSoftness = softness * (1.0 + sign(rotated.x) * smudgeAmount * 0.5);
            
            return 1.0 - smoothstep(size - asymSoftness, size + asymSoftness * 2.0, dist);
        }
        
        // Hash for pseudo-random values
        float hash(float n) { return fract(sin(n) * 43758.5453123); }
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        
        // Golden ratio for aesthetic placement
        const float PHI = 1.61803398875;
        const float PI = 3.14159265359;
        
        // Generate aesthetic position using golden angle spiral
        vec2 goldenPosition(float index, float time, float spread, float motion) {
            float angle = index * PHI * PI * 2.0;
            float radius = sqrt(index + 1.0) * spread * 0.15;
            // Add slow time-based drift
            angle += time * 0.01 * (1.0 + index * 0.1) * motion;
            radius += sin(time * 0.008 * motion + index) * 0.05 * motion;
            return vec2(0.5 + cos(angle) * radius, 0.5 + sin(angle) * radius);
        }
        
        // Blend modes for glow effects
        vec3 blendScreen(vec3 base, vec3 blend) {
            return 1.0 - (1.0 - base) * (1.0 - blend);
        }
        
        vec3 blendOverlay(vec3 base, vec3 blend) {
            return mix(
                2.0 * base * blend,
                1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
                step(0.5, base)
            );
        }
        
        vec3 blendSoftLight(vec3 base, vec3 blend) {
            return mix(
                2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
                sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
                step(0.5, blend)
            );
        }
        
        vec3 blendAdd(vec3 base, vec3 blend) {
            return min(base + blend, vec3(1.0));
        }
        
        vec3 blendLighten(vec3 base, vec3 blend) {
            return max(base, blend);
        }
        
        // Create gradient within a shape (not just solid color)
        vec3 gradientFill(vec2 p, vec2 center, vec3 color1, vec3 color2, float gradientAngle, float gradientType) {
            vec2 toCenter = p - center;
            float ca = cos(gradientAngle);
            float sa = sin(gradientAngle);
            vec2 rotated = vec2(toCenter.x * ca + toCenter.y * sa, -toCenter.x * sa + toCenter.y * ca);
            
            float t;
            if (gradientType < 0.33) {
                // Linear gradient
                t = rotated.x * 2.0 + 0.5;
            } else if (gradientType < 0.66) {
                // Radial gradient
                t = length(toCenter) * 3.0;
            } else {
                // Angular gradient
                t = (atan(toCenter.y, toCenter.x) / PI + 1.0) * 0.5;
            }
            t = clamp(t, 0.0, 1.0);
            
            // Smooth the gradient
            t = smoothstep(0.0, 1.0, t);
            
            return mix(color1, color2, t);
        }
        
        void main() {
            vec2 uv = vUv + uOffset;
            
            // Aspect ratio correction - crop/cover approach (no stretching)
            float aspectRatio = uResolution.x / uResolution.y;
            vec2 uvCorrected = uv;
            if (aspectRatio > 1.0) {
                uvCorrected.x = (uv.x - 0.5) * aspectRatio + 0.5;
            } else {
                uvCorrected.y = (uv.y - 0.5) / aspectRatio + 0.5;
            }
            
            // GLACIALLY slow time - barely perceptible movement
            float time = uTime * uSpeed * 0.08;
            float dropTime = uTime * uColorDropSpeed * 0.15;

            // Hand-driven liquid refraction - soft slimy physics
            // Gentle organic swirls like thick colorful slime
            vec2 uvFlow = uvCorrected;
            if (uHandCount > 0.0) {
                for (int i = 0; i < 2; i++) {
                    if (float(i) >= uHandCount) {
                        continue;
                    }
                    vec2 toHand = uvFlow - uHandPos[i];
                    float dist = length(toHand);
                    
                    // Soft, wide falloff zones for slimy liquid feel
                    // Using smoother exponential curves
                    float innerFalloff = exp(-dist * 3.5);   // Softer inner zone
                    float outerFalloff = exp(-dist * 1.5);   // Wide gentle ripples
                    float midFalloff = exp(-dist * 2.2);     // Organic mid-range
                    
                    // Reduced base strength for subtler effect
                    float strength = uHandStrength[i] * (0.3 + uHandInfluence * 0.4);
                    
                    // Swirl effect - gentle rotation like stirring honey
                    vec2 swirl = vec2(-toHand.y, toHand.x) * strength * midFalloff * 0.6;
                    
                    // Drag effect - soft trailing like thick slime
                    vec2 drag = uHandVel[i] * strength * outerFalloff * 0.7;
                    
                    // Bulge effect - very gentle outward push
                    vec2 bulge = normalize(toHand + 0.0001) * strength * innerFalloff * 0.06;
                    
                    uvFlow += swirl + drag + bulge;
                }
            }
            
            // === START FADE - controls transition from preview to full experience ===
            // uStartFade: 0 = preview (dim background), 1 = full experience
            float previewDim = 0.15; // How much color shows during preview
            float fadeMultiplier = mix(previewDim, 1.0, uStartFade);
            
            // === TIME-BASED BRIGHTNESS EVOLUTION ===
            // Controlled by uBrightnessEvolution uniform (from slider)
            // When slider is low, evolution is slow/subtle; when high, more dramatic
            float evolutionTime = uTime * 0.012 * uBrightnessEvolution;
            float brightnessEvolution = smoothstep(0.0, 1.0, evolutionTime) * uBrightnessEvolution;
            brightnessEvolution += sin(evolutionTime * 0.4) * 0.15 * uBrightnessEvolution;
            // Add slow pulsing brightness waves scaled by control
            brightnessEvolution += smoothstep(0.3, 1.0, sin(uTime * 0.008) * 0.5 + 0.5) * 0.3 * uBrightnessEvolution;
            brightnessEvolution = clamp(brightnessEvolution, 0.0, 1.5); // Allow over-bright
            
            // During preview, keep brightness very low
            brightnessEvolution *= fadeMultiplier;
            
            // Slow, organic breathing
            float breathing = sin(uTime * uBreathingRate * 0.15) * 0.5 + 0.5;
            float pulse = sin(uTime * uPulseRate * 0.2) * 0.5 + 0.5;
            
            // === COLOR BLOBS ===
            // More drops with motion, blur variation, lighting, and inversion controls
            const int MAX_BLOBS = 12;
            float blobCount = clamp(uBlobCount, 1.0, float(MAX_BLOBS));
            float blobSpread = mix(0.5, 1.35, uBlobSpread) * (0.7 + uColorDropSpread * 0.6);
            float blobScale = mix(0.6, 1.6, uBlobScale);
            float blobMotion = mix(0.4, 1.6, uBlobMotion);
            float blobBlur = mix(0.6, 1.6, uBlobBlur);
            float blobSmear = mix(0.2, 1.2, uBlobSmear);
            float blobLighten = clamp(uBlobLighten, 0.0, 1.0);
            float blobInvert = clamp(uBlobInvert, 0.0, 1.0);
            float blobFade = mix(0.4, 1.1, uBlobFade);
            vec2 blobOffset = uBlobOffset;
            
            // Base colors (2 per drop for gradients) - brighter and more saturated
            float baseBright = uBrightness * (0.8 + brightnessEvolution * 0.5);
            float baseSat = uSaturation * 1.15;
            
            // Base color - NEUTRAL dark base so color blobs stand out
            // Not affected by hue controls - those only affect the floating blobs
            float baseLight = 0.08 + brightnessEvolution * 0.12;
            vec3 baseColor = vec3(baseLight * 0.9, baseLight * 0.95, baseLight); // Slightly cool neutral
            vec3 color = baseColor;
            
            // === RENDER EACH DROP ===
            float mixStrength = uColorMixIntensity * (0.8 + brightnessEvolution * 0.4);
            
            for (int i = 0; i < MAX_BLOBS; i++) {
                float fi = float(i);
                if (fi > blobCount - 1.0) {
                    continue;
                }
                
                float seed = hash(fi * 12.37 + 0.17);
                float seed2 = hash(fi * 4.71 + 1.31);
                float seed3 = hash(fi * 7.19 + 2.73);
                
                float life = smoothstep(0.2, 0.8, sin(uTime * (0.004 + seed * 0.006) * blobFade + fi * 1.7) * 0.5 + 0.5);
                life = pow(life, mix(1.4, 0.8, uBlobFade));
                
                vec2 pos = goldenPosition(fi, time * blobMotion, blobSpread, blobMotion);
                pos = clamp(pos + blobOffset, vec2(0.05), vec2(0.95));
                
                float size = (0.12 + 0.12 * seed2 + breathing * 0.05 + pulse * 0.05) * blobScale;
                float smudgeAngle = time * (0.02 + seed * 0.08) + fi;
                float smudgeAmount = (0.2 + seed3 * 0.8) * blobSmear;
                float softness = (0.08 + seed2 * 0.12) * blobBlur;
                
                vec2 uvBlob = uvFlow;
                if (uBlobWarp > 0.001) {
                    float warp1 = snoise(vec3(uvFlow * 2.0 + fi, time * 0.03));
                    float warp2 = snoise(vec3(uvFlow * 2.4 - fi, time * 0.025));
                    uvBlob += vec2(warp1, warp2) * uBlobWarp * 0.05;
                }
                
                float shape = smudgedShape(
                    uvBlob, pos, size,
                    smudgeAngle, smudgeAmount, softness
                ) * life;
                
                if (shape > 0.001) {
                    float huePick = mod(fi, 4.0);
                    float hueBase = (huePick < 0.5) ? uHue1 : (huePick < 1.5) ? uHue2 : (huePick < 2.5) ? uHue3 : uHue4;
                    float hueA = fract(hueBase + (seed - 0.5) * 0.2);
                    float hueB = fract(hueBase + 0.08 + (seed2 - 0.5) * 0.2);
                    
                    vec3 colorA = hsl2rgb(hueA, baseSat * (0.8 + seed * 0.3), baseBright * (0.85 + seed2 * 0.6));
                    vec3 colorB = hsl2rgb(hueB, baseSat * (0.75 + seed3 * 0.35), baseBright * (0.9 + seed * 0.5));
                    
                    float gradAngle = time * (0.015 + seed * 0.08) + fi;
                    float gradType = fract(time * (0.002 + seed2 * 0.004) + seed);
                    
                    vec3 dropColor = gradientFill(
                        uvBlob, pos,
                        colorA, colorB,
                        gradAngle, gradType
                    );
                    
                    float blend = fract(time * (0.002 + seed3 * 0.005) + fi * 0.17);
                    vec3 blended;
                    
                    if (blend < 0.2) {
                        blended = dropColor;
                    } else if (blend < 0.4) {
                        blended = blendScreen(color, dropColor);
                    } else if (blend < 0.6) {
                        blended = blendAdd(color, dropColor * 0.75);
                    } else if (blend < 0.8) {
                        blended = blendSoftLight(color, dropColor);
                    } else {
                        blended = blendLighten(color, dropColor);
                    }
                    
                    float lightenMix = step(0.6, seed3) * blobLighten;
                    blended = mix(blended, blendAdd(color, dropColor * (0.7 + seed2 * 0.6)), lightenMix);
                    
                    float invertMix = step(0.7, seed) * blobInvert;
                    blended = mix(blended, vec3(1.0) - blended, invertMix);
                    
                    color = mix(color, blended, shape * mixStrength * (0.7 + fi * 0.03));
                }
            }
            
            // Subtle warm/cool shift
            float warmShift = (uWarmth - 0.5) * 0.05;
            color.r += warmShift;
            color.b -= warmShift;
            
            // Apply gentle contrast
            color = (color - 0.5) * uContrast + 0.5;
            
            // Clamp to valid range
            color = clamp(color, 0.0, 1.0);
            
            gl_FragColor = vec4(color, 1.0);
        }
    `,
    
    // =========================================
    // DISPLACEMENT SHADER
    // 
    // Creates the signature refraction effect by displacing UV coordinates
    // based on distance from center points. Features:
    // - 11 different shape modes (concentric, spiral, hexagonal, etc.)
    // - Wave-delayed motion where outer rings follow inner with time offset
    // - Sharp stepped edges for optical refraction appearance
    // - Chromatic aberration (RGB channel separation)
    // - Aspect ratio preservation
    // =========================================
    
    displacementVertex: `
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    displacementFragment: `
        precision highp float;
        
        uniform sampler2D uTexture;     // Gradient pass output
        uniform float uTime;
        uniform vec2 uResolution;
        
        // Primary displacement center (typically face position)
        uniform vec2 uCenter;           // 0-1 normalized position
        uniform vec2 uCenterLag1;       // Delayed center for outer rings
        uniform vec2 uCenterLag2;
        uniform vec2 uCenterLag3;
        uniform float uRingDelayMix;    // 0-1 blend amount for lagged center
        uniform float uRings;           // Number of concentric rings (6-16)
        uniform float uMaxRadius;       // Outer extent of effect
        uniform float uMinRadius;       // Inner core size
        uniform float uStrength;        // Displacement magnitude (0.4-1.0)
        uniform float uStepSize;
        uniform float uRotation;        // Overall rotation angle
        uniform float uWobble;          // Organic edge deformation
        uniform float uChromaticAberration;  // RGB separation amount
        uniform float uRingOverlayStrength;  // Extra ring edge refraction
        uniform float uRingOverlayWidth;     // Ring line thickness
        
        // Secondary displacement origins for layered effects
        uniform vec2 uRipple2Center;
        uniform float uRipple2Strength;
        uniform vec2 uRipple3Center;
        uniform float uRipple3Strength;
        
        // Shape and style parameters
        uniform float uShapeType;       // 0-11: circles, torus, linear, skewed, cylinder, sphere, hyperboloid, spiral, parallel, conic, moebius, pill
        uniform float uMorphProgress;   // Blend between current and morph target shape
        uniform float uMorphType;       // Target shape for morphing
        uniform float uInversion;       // 0-1: invert displacement direction
        uniform float uFoldAmount;      // 0-1: rings fold back on themselves
        
        // Parallel planes controls
        uniform float uParallelStrength;
        uniform float uParallelZoom;
        uniform float uParallelZoomDrift;
        uniform float uParallelSpin;
        uniform float uParallelThickness;
        uniform float uParallelPresence;
        
        // Wave motion - creates flowing, delayed ring movement
        uniform float uWavePhase;       // Global animation phase
        uniform float uWaveDelay;       // Time delay between successive rings
        uniform float uWaveAmplitude;   // How far each ring moves in wave
        uniform float uSecondaryWave;   // Secondary harmonic intensity (0-0.5)
        uniform float uTertiaryWave;    // Tertiary harmonic intensity (0-0.3)
        uniform float uSizeWave;
        
        // Edge and shape modifiers
        uniform float uEdgeSharpness;   // Ring edge transition width (0.01-0.25)
        // Note: uMinRadius already declared above in primary displacement section
        
        // Global modulation from state engine
        uniform float uIntensity;
        uniform float uBreathingPhase;
        uniform float uDepthPhase;     // For 3D slice feel
        
        // Hand interaction
        uniform float uHandCount;
        uniform vec2 uHandPos[2];
        uniform vec2 uHandVel[2];
        uniform float uHandStrength[2];
        uniform float uHandInfluence;
        
        varying vec2 vUv;
        
        #define PI 3.14159265359
        #define TAU 6.28318530718
        
        // Rotation matrix
        mat2 rotate2d(float angle) {
            float c = cos(angle);
            float s = sin(angle);
            return mat2(c, -s, s, c);
        }
        
        // Smooth minimum for organic blending
        float smin(float a, float b, float k) {
            float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
            return mix(b, a, h) - k * h * (1.0 - h);
        }

        // Apply distance-based lag so outer rings follow later center positions
        vec2 applyCenterLag(vec2 uv, vec2 center, vec2 lag1, vec2 lag2, vec2 lag3, float mixAmount) {
            if (mixAmount <= 0.001) return center;
            
            float dist = length(uv - center);
            float t = clamp(dist / max(uMaxRadius, 0.0001), 0.0, 1.0);
            
            vec2 lagged = mix(center, lag1, smoothstep(0.12, 0.42, t));
            lagged = mix(lagged, lag2, smoothstep(0.38, 0.72, t));
            lagged = mix(lagged, lag3, smoothstep(0.65, 0.95, t));
            
            return mix(center, lagged, mixAmount);
        }
        
        // ===========================================
        // WAVE MOTION CALCULATION
        // Each ring has its own delayed phase creating cascading movement
        // Like old-school video echo effect - center moves first, outer rings follow
        // ===========================================
        
        // Calculate wave offset for a specific ring - this creates the flowing delayed motion
        float getRingWaveOffset(float ringIndex, float totalRings, float phase, float delay, float amplitude) {
            // Each ring's phase is significantly delayed based on its index
            // Multiply delay for more dramatic cascade effect (like video echo)
            float cascadeDelay = delay * 2.5;
            float ringPhase = phase - ringIndex * cascadeDelay;
            
            // Primary wave - slow undulation
            float wave1 = sin(ringPhase) * amplitude;
            
            // Secondary wave - faster, smaller for organic feel
            float wave2 = sin(ringPhase * 2.3 + 0.5) * amplitude * uSecondaryWave;
            
            // Tertiary wave - even faster, creates ripple texture
            float wave3 = sin(ringPhase * 4.7 + 1.2) * amplitude * uTertiaryWave;
            
            // Combine waves - outer rings have MUCH stronger effect for dramatic cascade
            float ringFactor = pow((ringIndex + 1.0) / totalRings, 0.6);
            return (wave1 + wave2 + wave3) * ringFactor * 1.5;
        }
        
        // ===========================================
        // 3D SIGNED DISTANCE FUNCTIONS
        // Used for slicing through 3D shapes
        // ===========================================
        
        // SDF for a torus in 3D space
        float sdTorus(vec3 p, vec2 t) {
            vec2 q = vec2(length(p.xz) - t.x, p.y);
            return length(q) - t.y;
        }
        
        // SDF for a sphere
        float sdSphere(vec3 p, float r) {
            return length(p) - r;
        }
        
        // SDF for infinite cylinder
        float sdCylinder(vec3 p, float r) {
            return length(p.xz) - r;
        }
        
        // SDF for a capsule/pill shape (vertical)
        float sdCapsule(vec2 p, float h, float r) {
            p.y -= clamp(p.y, -h, h);
            return length(p) - r;
        }
        
        // SDF for rounded box (stadium/pill when one axis is 0)
        float sdRoundedBox(vec2 p, vec2 b, float r) {
            vec2 q = abs(p) - b;
            return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }
        
        // SDF for a cone
        float sdCone(vec3 p, vec2 c) {
            float q = length(p.xz);
            return dot(c, vec2(q, p.y));
        }
        
        // Rotation matrices for 3D
        mat3 rotateX(float a) {
            float c = cos(a), s = sin(a);
            return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
        }
        
        mat3 rotateY(float a) {
            float c = cos(a), s = sin(a);
            return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
        }
        
        mat3 rotateZ(float a) {
            float c = cos(a), s = sin(a);
            return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
        }
        
        // ===========================================
        // GLASS PLATE EFFECT
        // Creates stacked round glass plates with edge refraction
        // Stronger refraction at the edges of each plate
        // ===========================================
        
        // Calculate glass plate refraction - stronger at edges
        // Returns refraction strength based on distance from plate edge
        float glassPlateRefraction(float distFromCenter, float plateRadius, float edgeWidth) {
            // Distance from the edge of this plate
            float distFromEdge = abs(distFromCenter - plateRadius);
            
            // Refraction is strongest right at the edge, fades inward
            // Use smooth falloff from edge
            float edgeRefraction = 1.0 - smoothstep(0.0, edgeWidth, distFromEdge);
            
            // Add slight refraction across the whole plate (glass has some effect throughout)
            float plateInterior = smoothstep(plateRadius + edgeWidth, plateRadius - edgeWidth * 0.5, distFromCenter);
            float interiorRefraction = plateInterior * 0.15;
            
            return edgeRefraction + interiorRefraction;
        }
        
        // Calculate cumulative refraction from stacked glass plates
        float stackedGlassPlates(float dist, float maxRadius, float numPlates, float phase, float delay, float edgeSharpness) {
            float totalRefraction = 0.0;
            float plateSpacing = maxRadius / max(numPlates, 1.0);
            
            // Edge width controls how thick the refraction band is at each plate edge
            float edgeWidth = plateSpacing * mix(0.15, 0.45, 1.0 - edgeSharpness);
            
            for (float i = 1.0; i <= 16.0; i += 1.0) {
                if (i > numPlates) break;
                
                // Each plate has a slightly different radius (incremental sizes)
                float plateIndex = i;
                float waveOffset = getRingWaveOffset(plateIndex, numPlates, phase, delay, uWaveAmplitude);
                float plateRadius = plateSpacing * i + waveOffset * 0.3;
                
                // Calculate refraction contribution from this plate
                float refraction = glassPlateRefraction(dist, plateRadius, edgeWidth);
                
                // Plates further out have slightly less effect (depth attenuation)
                float depthFade = 1.0 - (i / numPlates) * 0.3;
                
                totalRefraction += refraction * depthFade;
            }
            
            // Normalize and add some variation
            return totalRefraction * 0.7;
        }
        
        // ===========================================
        // 3D SLICE SHAPE FUNCTIONS
        // Simulates slicing through 3D objects at various angles
        // Now using stacked glass plate effect
        // ===========================================
        
        // Shape 0: Circular glass plates - stacked round discs with edge refraction
        float shapeCircleSlice(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            float dist = length(toCenter);
            
            // Skip inner area
            float normalizedDist = dist / uMaxRadius;
            if (normalizedDist < uMinRadius) return 0.0;
            
            // Use stacked glass plates effect
            float glassEffect = stackedGlassPlates(dist, uMaxRadius, rings, phase, delay, uEdgeSharpness);
            
            // Add subtle organic wobble
            float angle = atan(toCenter.y, toCenter.x);
            float wobble = sin(angle * 3.0 + phase * 0.15) * uWobble * 0.5;
            
            return glassEffect * (1.0 + wobble) * 1.3;
        }
        
        // Shape 1: Torus slice - elliptical glass plates with tilt
        float shapeTorusSlice(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Slice angle slowly evolves - creates elliptical plates
            float sliceAngle = phase * 0.1;
            float tilt = sin(sliceAngle) * 0.6;
            
            // Apply elliptical distortion (tilted view of circular plates)
            vec2 stretched = toCenter;
            stretched.y *= (1.0 + tilt * 0.5);
            float dist = length(stretched);
            
            // Use stacked glass plates with the stretched distance
            float glassEffect = stackedGlassPlates(dist, uMaxRadius * 0.85, rings, phase, delay, uEdgeSharpness);
            
            // Add depth-based intensity variation
            float depthMod = 1.0 + tilt * 0.2;
            
            return glassEffect * depthMod * 1.3;
        }
        
        // Shape 2: Linear glass bands - parallel glass plates
        float shapeLinearBands(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Line angle evolves over time
            float lineAngle = phase * 0.08 + uRotation;
            vec2 lineDir = vec2(cos(lineAngle), sin(lineAngle));
            
            // Project position onto line direction (distance from center line)
            float lineDist = abs(dot(toCenter, lineDir)) + 0.5;
            
            // Use glass plate effect along this axis
            float plateSpacing = uMaxRadius / max(rings, 1.0);
            float totalRefraction = 0.0;
            float edgeWidth = plateSpacing * mix(0.2, 0.5, 1.0 - uEdgeSharpness);
            
            for (float i = 1.0; i <= 16.0; i += 1.0) {
                if (i > rings) break;
                float waveOffset = getRingWaveOffset(i, rings, phase, delay, uWaveAmplitude);
                float platePos = plateSpacing * i + waveOffset * 0.2;
                float distFromEdge = abs(lineDist - platePos);
                float edgeRefraction = 1.0 - smoothstep(0.0, edgeWidth, distFromEdge);
                totalRefraction += edgeRefraction * (1.0 - i / rings * 0.3);
            }
            
            return totalRefraction * 0.8;
        }
        
        // Shape 3: Skewed glass plates - diagonal with perspective
        float shapeSkewedLines(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Skew angle with slow drift
            float skewAngle = phase * 0.06 + PI * 0.25;
            float skewAmount = sin(phase * 0.12) * 0.4 + 0.3;
            
            // Apply perspective skew to simulate tilted glass plates
            vec2 skewed = toCenter;
            skewed.x += skewed.y * skewAmount;
            float dist = length(skewed);
            
            // Use glass plates with skewed distance
            float glassEffect = stackedGlassPlates(dist, uMaxRadius, rings * 0.8, phase, delay, uEdgeSharpness);
            
            return glassEffect * 1.2;
        }
        
        // Shape 4: Cylinder slice - stretched elliptical glass plates
        float shapeCylinderSlice(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Slice angle through cylinder - creates elliptical stretch
            float sliceAngle = sin(phase * 0.08) * 0.7;
            float stretch = 1.0 / (cos(sliceAngle) + 0.1);
            stretch = min(stretch, 4.0);
            
            // Apply anisotropic scaling (tilted cylinder view)
            float stretchAngle = phase * 0.05;
            mat2 stretchMat = mat2(
                cos(stretchAngle), -sin(stretchAngle),
                sin(stretchAngle), cos(stretchAngle)
            );
            vec2 stretched = stretchMat * toCenter;
            stretched.x *= stretch;
            stretched = transpose(stretchMat) * stretched;
            
            float dist = length(stretched);
            
            // Use glass plates with stretched distance
            float glassEffect = stackedGlassPlates(dist, uMaxRadius * stretch * 0.5, rings, phase, delay, uEdgeSharpness);
            
            return glassEffect * 1.2;
        }
        
        // Shape 5: Sphere slice - rotating view of spherical glass shells
        float shapeSphereSlice(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // 3D rotation for different viewing angles
            vec3 p = vec3(toCenter, 0.0);
            float rotX = sin(phase * 0.07) * 0.5;
            float rotY = cos(phase * 0.09) * 0.4;
            p = rotateX(rotX) * p;
            p = rotateY(rotY) * p;
            
            // Distance in rotated space
            float dist = length(p.xy);
            
            // Use glass plates (spherical shells viewed from angle)
            float glassEffect = stackedGlassPlates(dist, uMaxRadius * 0.8, rings, phase, delay, uEdgeSharpness);
            
            // Depth-based intensity variation
            float depthFade = 1.0 - abs(p.z) * 1.5;
            depthFade = max(depthFade, 0.4);
            
            return glassEffect * depthFade * 1.3;
        }
        
        // Shape 6: Hyperboloid - warped glass plates
        float shapeHyperboloid(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Hyperboloid parameter - creates warped elliptical plates
            float k = sin(phase * 0.1) * 0.3 + 0.5;
            // On our 2D slice, this creates hyperbolic curves
            // Warped distance creates elliptical glass plates
            float hyperDist = sqrt(abs(toCenter.x * toCenter.x * (1.0 + k) + 
                                       toCenter.y * toCenter.y * (1.0 - k)));
            
            // Use glass plates with hyperboloid distance
            float glassEffect = stackedGlassPlates(hyperDist, uMaxRadius, rings, phase, delay, uEdgeSharpness);
            
            return glassEffect * 1.2;
        }
        
        // Shape 7: Spiral glass plates - twisted arrangement
        float shapeSpiralRamp(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            float dist = length(toCenter);
            float angle = atan(toCenter.y, toCenter.x);
            
            // Spiral offset - each plate is slightly rotated
            float spiralTwist = angle / TAU * 0.3;
            float adjustedDist = dist + spiralTwist * uMaxRadius * 0.2;
            
            // Use glass plates with spiral-adjusted distance
            float glassEffect = stackedGlassPlates(adjustedDist, uMaxRadius, rings, phase, delay, uEdgeSharpness);
            
            // Add subtle angle-based variation
            float angleMod = sin(angle * 3.0 + phase * 0.1) * 0.15;
            
            return glassEffect * (1.0 + angleMod) * 1.1;
        }
        
        // Shape 8: Parallel glass planes - creates interference pattern
        float shapeParallelPlanes(vec2 uv, vec2 center, float rings, float phase, float delay) {
            // Early exit if parallel planes are disabled
            if (uParallelStrength < 0.01 && uParallelPresence < 0.01) {
                return 0.0;
            }
            
            vec2 toCenter = uv - center;
            
            // Two sets of parallel glass planes at different angles
            float spin = mix(0.02, 0.12, uParallelSpin);
            float angle1 = phase * spin;
            float angle2 = phase * spin + PI * 0.5 + sin(phase * 0.08) * 0.3;
            
            float zoomBase = mix(0.6, 1.6, uParallelZoom);
            float zoomPulse = 1.0 + sin(phase * (0.04 + uParallelZoomDrift * 0.2)) * uParallelZoomDrift * 0.35;
            vec2 scaled = toCenter * zoomBase * zoomPulse;
            
            vec2 dir1 = vec2(cos(angle1), sin(angle1));
            vec2 dir2 = vec2(cos(angle2), sin(angle2));
            
            float dist1 = abs(dot(scaled, dir1));
            float dist2 = abs(dot(scaled, dir2));
            
            // Glass plate effect for parallel planes
            float plateSpacing = uMaxRadius / max(rings * 0.5, 1.0);
            float edgeWidth = plateSpacing * mix(0.2, 0.5, 1.0 - uEdgeSharpness) * uParallelThickness;
            
            float refraction1 = 0.0;
            float refraction2 = 0.0;
            
            for (float i = 1.0; i <= 12.0; i += 1.0) {
                if (i > rings * 0.6) break;
                float waveOffset1 = getRingWaveOffset(i, rings, phase, delay, uWaveAmplitude);
                float waveOffset2 = getRingWaveOffset(i, rings, phase * 1.1, delay * 0.9, uWaveAmplitude);
                
                float platePos1 = plateSpacing * i + waveOffset1 * 0.15;
                float platePos2 = plateSpacing * i + waveOffset2 * 0.15;
                
                float edge1 = 1.0 - smoothstep(0.0, edgeWidth, abs(dist1 - platePos1));
                float edge2 = 1.0 - smoothstep(0.0, edgeWidth, abs(dist2 - platePos2));
                
                refraction1 += edge1 * (1.0 - i / rings * 0.4);
                refraction2 += edge2 * (1.0 - i / rings * 0.4);
            }
            
            // Combine with interference
            float combined = max(refraction1, refraction2) + refraction1 * refraction2 * 0.4;
            float presence = smoothstep(0.2, 0.8, sin(phase * 0.05 + uParallelPresence * 2.0) * 0.5 + 0.5);
            float appear = mix(0.0, presence, uParallelPresence);
            
            // Scale by strength
            return combined * 0.3 * uParallelStrength * uParallelStrength * appear;
        }
        
        // Shape 9: Conic glass plates - elliptical with varying eccentricity
        float shapeConicSection(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Eccentricity varies over time
            float e = sin(phase * 0.06) * 0.4 + 0.5;
            
            // Apply eccentricity to create elliptical distortion
            float angle = atan(toCenter.y, toCenter.x);
            float distMod = 1.0 + e * cos(angle - phase * 0.1) * 0.3;
            float dist = length(toCenter) * distMod;
            
            // Use glass plates with modified distance
            float glassEffect = stackedGlassPlates(dist, uMaxRadius * 0.9, rings, phase, delay, uEdgeSharpness);
            
            return glassEffect * 1.2;
        }
        
        // Shape 10: Twisted glass plates - Möbius-like arrangement
        float shapeMoebiusBands(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            float dist = length(toCenter);
            float angle = atan(toCenter.y, toCenter.x);
            
            // Möbius twist: plates are offset based on angle
            float twistAmount = sin(phase * 0.08) * 0.5 + 0.5;
            float twistedDist = dist + sin(angle * 2.0 + phase * 0.15) * uMaxRadius * 0.12 * twistAmount;
            
            // Use glass plates with twisted distance
            float phaseShift = angle * twistAmount * 0.5;
            float glassEffect = stackedGlassPlates(twistedDist, uMaxRadius, rings, phase + phaseShift, delay, uEdgeSharpness);
            
            return glassEffect * 1.2;
        }
        
        // Shape 11: Pill/Capsule glass plates - elongated rounded shape
        float shapePillCapsule(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Pill orientation slowly rotates
            float pillAngle = phase * 0.04 + uRotation;
            mat2 rot = mat2(cos(pillAngle), -sin(pillAngle), sin(pillAngle), cos(pillAngle));
            vec2 rotated = rot * toCenter;
            
            // Pill dimensions
            float pillHeight = uMaxRadius * (0.5 + sin(phase * 0.1) * 0.1);
            float pillRadius = uMaxRadius * 0.35;
            
            // Distance to pill shape edge
            float pillDist = sdCapsule(rotated, pillHeight, pillRadius);
            
            // For points inside the pill, use distance from center
            // For points outside, use distance from edge
            float effectiveDist = pillDist > 0.0 ? pillDist + pillRadius : length(rotated) * 0.8;
            
            // Use glass plates with pill-based distance
            float glassEffect = stackedGlassPlates(effectiveDist, uMaxRadius * 0.8, rings * 0.7, phase, delay, uEdgeSharpness);
            
            // Add soft glow inside the pill
            float insidePill = smoothstep(0.02, -0.08, pillDist);
            float interiorGlow = insidePill * 0.4;
            
            return glassEffect * 1.3 + interiorGlow;
        }
        
        // ===========================================
        // MAIN DISPLACEMENT CALCULATION
        // ===========================================
        
        // Get shape value for a specific integer shape index
        float getShapeValue(float idx, vec2 uv, vec2 center, float rings, float phase, float delay) {
            float modIdx = mod(idx, 12.0);
            if (modIdx < 0.5) return shapeCircleSlice(uv, center, rings, phase, delay);
            if (modIdx < 1.5) return shapeTorusSlice(uv, center, rings, phase, delay);
            if (modIdx < 2.5) return shapeLinearBands(uv, center, rings, phase, delay);
            if (modIdx < 3.5) return shapeSkewedLines(uv, center, rings, phase, delay);
            if (modIdx < 4.5) return shapeCylinderSlice(uv, center, rings, phase, delay);
            if (modIdx < 5.5) return shapeSphereSlice(uv, center, rings, phase, delay);
            if (modIdx < 6.5) return shapeHyperboloid(uv, center, rings, phase, delay);
            if (modIdx < 7.5) return shapeSpiralRamp(uv, center, rings, phase, delay);
            if (modIdx < 8.5) return shapeParallelPlanes(uv, center, rings, phase, delay);
            if (modIdx < 9.5) return shapeConicSection(uv, center, rings, phase, delay);
            if (modIdx < 10.5) return shapeMoebiusBands(uv, center, rings, phase, delay);
            return shapePillCapsule(uv, center, rings, phase, delay);
        }
        
        vec2 calculateDisplacement(vec2 uv, vec2 center, float strength, float shapeType, float phase, float delay) {
            vec2 toCenter = uv - center;
            float dist = length(toCenter);
            float angle = atan(toCenter.y, toCenter.x);
            
            // Extended range for full-screen effects
            if (dist > uMaxRadius * 2.5) return vec2(0.0);
            
            // Smooth shape blending between adjacent shapes (now 12 shapes)
            float shapeIdx = mod(shapeType, 12.0);
            float lowerShape = floor(shapeIdx);
            float upperShape = mod(lowerShape + 1.0, 12.0);
            float blendFactor = fract(shapeIdx);
            
            // Smooth the blend factor for less abrupt transitions
            blendFactor = smoothstep(0.0, 1.0, blendFactor);
            
            // Get values from both shapes and blend
            float shapeLower = getShapeValue(lowerShape, uv, center, uRings, phase, delay);
            float shapeUpper = getShapeValue(upperShape, uv, center, uRings, phase, delay);
            float shapeValue = mix(shapeLower, shapeUpper, blendFactor);
            
            // SOFTEN the shape value to prevent harsh edges
            // Clamp to reasonable range and apply smoothing
            shapeValue = clamp(shapeValue, 0.0, 2.0);
            shapeValue = pow(shapeValue, 1.5) * 1.2;  // Gentler power curve
            
            // Organic wobble for softer movement
            float wobble = sin(angle * 2.0 + phase * 0.1) * uWobble * 1.5;
            wobble += sin(angle * 3.0 - phase * 0.08) * uWobble * 0.8;
            
            // Direction calculation - radial with tangential component
            vec2 radialDir = normalize(toCenter + 0.0001);
            vec2 tangentDir = vec2(-radialDir.y, radialDir.x);
            
            // For linear shapes, use more perpendicular direction
            float linearBias = smoothstep(1.5, 3.5, shapeIdx) * smoothstep(4.5, 3.5, shapeIdx);
            linearBias += smoothstep(7.5, 8.5, shapeIdx) * smoothstep(9.5, 8.5, shapeIdx);
            
            // Mix directions based on shape type
            float tangentMix = sin(phase * 0.1) * 0.3 + linearBias * 0.5;
            vec2 direction = normalize(radialDir + tangentDir * tangentMix);
            
            // Calculate displacement amount - strong but smooth
            float displaceAmount = shapeValue * strength * (1.0 + wobble) * 2.2;
            
            // Apply inversion if set
            if (uInversion > 0.0) {
                displaceAmount = mix(displaceAmount, -displaceAmount * 0.8, uInversion);
            }
            
            // Softer fades for full-screen coverage
            float innerFade = smoothstep(0.0, uMinRadius * 3.0, dist);
            float outerFade = smoothstep(uMaxRadius * 2.0, uMaxRadius * 0.5, dist);
            
            // Final displacement with smooth falloff
            vec2 result = direction * displaceAmount * innerFade * outerFade;
            
            // Limit maximum displacement to prevent extreme artifacts
            float maxDisp = 0.15;
            float resultLen = length(result);
            if (resultLen > maxDisp) {
                result = result * (maxDisp / resultLen);
            }
            
            return result;
        }
        
        void main() {
            vec2 uv = vUv;
            
            // Aspect ratio correction - COVER approach (no stretching)
            float aspectRatio = uResolution.x / uResolution.y;
            vec2 uvCorrected = uv;
            if (aspectRatio > 1.0) {
                uvCorrected.x = (uv.x - 0.5) * aspectRatio + 0.5;
            } else {
                uvCorrected.y = (uv.y - 0.5) / aspectRatio + 0.5;
            }
            
            // Breathing modulation - slow, organic
            float breathe = sin(uBreathingPhase) * 0.5 + 0.5;
            float depthPulse = sin(uDepthPhase) * 0.5 + 0.5;
            
            // Strength modulation - can get very strong sometimes
            float strengthMod = 0.7 + uIntensity * 0.6 + breathe * 0.2;
            
            // Wave phase with slow, flowing motion
            float wavePhase = uTime * 0.25 + uBreathingPhase * 0.3;
            float waveDelay = uWaveDelay;
            
            // Convert centers to aspect-corrected space
            vec2 center1 = uCenter;
            vec2 center2 = uRipple2Center;
            vec2 center3 = uRipple3Center;
            vec2 lag1 = uCenterLag1;
            vec2 lag2 = uCenterLag2;
            vec2 lag3 = uCenterLag3;
            
            if (aspectRatio > 1.0) {
                center1.x = (center1.x - 0.5) * aspectRatio + 0.5;
                center2.x = (center2.x - 0.5) * aspectRatio + 0.5;
                center3.x = (center3.x - 0.5) * aspectRatio + 0.5;
                lag1.x = (lag1.x - 0.5) * aspectRatio + 0.5;
                lag2.x = (lag2.x - 0.5) * aspectRatio + 0.5;
                lag3.x = (lag3.x - 0.5) * aspectRatio + 0.5;
            } else {
                center1.y = (center1.y - 0.5) / aspectRatio + 0.5;
                center2.y = (center2.y - 0.5) / aspectRatio + 0.5;
                center3.y = (center3.y - 0.5) / aspectRatio + 0.5;
                lag1.y = (lag1.y - 0.5) / aspectRatio + 0.5;
                lag2.y = (lag2.y - 0.5) / aspectRatio + 0.5;
                lag3.y = (lag3.y - 0.5) / aspectRatio + 0.5;
            }
            
            vec2 center1Lagged = applyCenterLag(uvCorrected, center1, lag1, lag2, lag3, uRingDelayMix);
            
            // Calculate displacement from each origin with different shapes
            vec2 disp1 = calculateDisplacement(uvCorrected, center1Lagged, uStrength * strengthMod, uShapeType, wavePhase, waveDelay);
            vec2 disp2 = calculateDisplacement(uvCorrected, center2, uRipple2Strength * strengthMod, uShapeType + 1.0, wavePhase * 1.1, waveDelay * 0.85);
            vec2 disp3 = calculateDisplacement(uvCorrected, center3, uRipple3Strength * strengthMod, uShapeType + 2.0, wavePhase * 0.9, waveDelay * 1.15);
            
            // Combine displacements - can be very strong
            vec2 totalDisp = disp1 + disp2 * 0.8 + disp3 * 0.6;

            // Hand-driven drag - soft slimy liquid refraction
            // Gentle organic movement like thick colorful slime
            if (uHandCount > 0.0) {
                vec2 handWarp = vec2(0.0);
                for (int i = 0; i < 2; i++) {
                    if (float(i) >= uHandCount) {
                        continue;
                    }
                    vec2 toHand = uvCorrected - uHandPos[i];
                    float dist = length(toHand);
                    
                    // Soft, organic falloff zones - slimy and floaty
                    float innerFalloff = exp(-dist * 3.0);   // Soft core
                    float midFalloff = exp(-dist * 1.8);     // Wide liquid zone
                    float outerFalloff = exp(-dist * 1.0);   // Very wide gentle ripples
                    
                    // Reduced strength for subtler, dreamier effect
                    float strength = uHandStrength[i] * (0.3 + uHandInfluence * 0.5);
                    
                    // Drag effect - soft trailing follows hand
                    vec2 drag = uHandVel[i] * strength * outerFalloff * 0.6;
                    
                    // Pull effect - very gentle attraction toward center
                    vec2 pull = -toHand * strength * midFalloff * 0.04;
                    
                    // Swirl effect - organic rotation like stirring
                    vec2 swirl = vec2(-toHand.y, toHand.x) * strength * midFalloff * 0.25;
                    
                    // Bulge effect - subtle outward push
                    vec2 bulge = normalize(toHand + 0.0001) * strength * innerFalloff * 0.08;
                    
                    handWarp += drag + pull + swirl + bulge;
                }
                totalDisp += handWarp * 0.5;  // Reduced overall hand contribution
            }
            
            // Apply rotation
            totalDisp = rotate2d(uRotation * 0.5) * totalDisp;
            
            // 3D slice feel - subtle depth modulation
            float depthWarp = sin(uDepthPhase + length(uvCorrected - 0.5) * 2.0) * 0.02 * depthPulse;
            totalDisp *= 1.0 + depthWarp;
            
            // Morph between current and alternate shape
            if (uMorphProgress > 0.01) {
                vec2 morphDisp = calculateDisplacement(uvCorrected, center1Lagged, uStrength * strengthMod, uMorphType, wavePhase * 1.2, waveDelay * 0.7);
                totalDisp = mix(totalDisp, morphDisp, uMorphProgress);
            }
            
            // Glass plate overlay - additional edge refraction at plate boundaries
            if (uRingOverlayStrength > 0.001) {
                vec2 plateVec = uvCorrected - center1Lagged;
                float plateDist = length(plateVec);
                float plateSpacing = uMaxRadius / max(uRings * 0.5, 1.0);
                float edgeWidth = plateSpacing * mix(0.1, 0.3, uRingOverlayWidth);
                
                // Accumulate refraction from multiple plate edges
                float plateRefraction = 0.0;
                for (float i = 1.0; i <= 10.0; i += 1.0) {
                    if (i > uRings * 0.6) break;
                    float plateRadius = plateSpacing * i;
                    float distFromEdge = abs(plateDist - plateRadius);
                    float edgeEffect = 1.0 - smoothstep(0.0, edgeWidth, distFromEdge);
                    plateRefraction += edgeEffect * (1.0 - i / uRings * 0.5);
                }
                
                vec2 plateDir = normalize(plateVec + 0.0001);
                totalDisp += plateDir * plateRefraction * uRingOverlayStrength * 0.06;
            }
            
            // Convert back to UV space (undo aspect correction)
            if (aspectRatio > 1.0) {
                totalDisp.x /= aspectRatio;
            } else {
                totalDisp.y *= aspectRatio;
            }
            
            vec2 finalUv = uv + totalDisp;
            vec2 uvClamp = clamp(finalUv, vec2(0.005), vec2(0.995));
            
            // Strong chromatic aberration based on displacement magnitude
            float dispMagnitude = length(totalDisp);
            float edgeDist = min(min(uvClamp.x, 1.0 - uvClamp.x), min(uvClamp.y, 1.0 - uvClamp.y));
            float edgeFade = smoothstep(0.0, 0.12, edgeDist);
            float aberration = uChromaticAberration * (0.6 + dispMagnitude * 4.0);
            aberration = min(aberration, 0.05) * edgeFade;
            vec2 aberrationDir = normalize(totalDisp + 0.0001);
            
            // Aspect-correct the aberration direction
            if (aspectRatio > 1.0) {
                aberrationDir.x /= aspectRatio;
            } else {
                aberrationDir.y *= aspectRatio;
            }
            
            // Sample with chromatic aberration - creates the color separation
            vec2 uvR = clamp(uvClamp + aberrationDir * aberration * 1.2, vec2(0.001), vec2(0.999));
            vec2 uvB = clamp(uvClamp - aberrationDir * aberration * 1.2, vec2(0.001), vec2(0.999));
            float r = texture2D(uTexture, uvR).r;
            float g = texture2D(uTexture, uvClamp).g;
            float b = texture2D(uTexture, uvB).b;
            
            vec3 color = vec3(r, g, b);
            
            gl_FragColor = vec4(color, 1.0);
        }
    `,
    
    // =========================================
    // POST-PROCESSING SHADER
    // Enhanced with film grain and noise
    // =========================================
    
    postVertex: `
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    postFragment: `
        precision highp float;
        
        uniform sampler2D uTexture;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uBlur;
        uniform float uGlow;
        uniform float uVignette;
        uniform float uVignetteShape;
        uniform float uSaturation;
        uniform float uBrightness;
        uniform float uContrast;
        uniform float uNoiseAmount;
        uniform float uFilmGrain;
        
        varying vec2 vUv;
        
        // Simple hash for noise
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        // Gaussian blur approximation
        vec3 blur(sampler2D tex, vec2 uv, vec2 resolution, float amount) {
            vec3 result = vec3(0.0);
            vec2 pixel = 1.0 / resolution;
            
            // 9-tap blur
            float weights[9];
            weights[0] = 0.0625; weights[1] = 0.125; weights[2] = 0.0625;
            weights[3] = 0.125;  weights[4] = 0.25;  weights[5] = 0.125;
            weights[6] = 0.0625; weights[7] = 0.125; weights[8] = 0.0625;
            
            int idx = 0;
            for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                    vec2 offset = vec2(float(x), float(y)) * pixel * amount * 3.0;
                    result += texture2D(tex, uv + offset).rgb * weights[idx];
                    idx++;
                }
            }
            
            return result;
        }
        
        // Saturation adjustment
        vec3 adjustSaturation(vec3 color, float saturation) {
            float grey = dot(color, vec3(0.299, 0.587, 0.114));
            return mix(vec3(grey), color, saturation);
        }
        
        // Contrast adjustment
        vec3 adjustContrast(vec3 color, float contrast) {
            return (color - 0.5) * contrast + 0.5;
        }
        
        void main() {
            vec2 uv = vUv;
            
            // Get blurred version
            vec3 blurred = blur(uTexture, uv, uResolution, uBlur);
            vec3 original = texture2D(uTexture, uv).rgb;
            
            // Mix based on blur amount
            vec3 color = mix(original, blurred, clamp(uBlur * 0.5, 0.0, 1.0));
            
            // Subtle glow (bloom effect from bright areas) - reduced
            vec3 glowColor = blur(uTexture, uv, uResolution, uBlur * 3.0);
            float luminance = dot(glowColor, vec3(0.299, 0.587, 0.114));
            color += glowColor * smoothstep(0.5, 1.0, luminance) * uGlow * 0.5;
            
            // Color adjustments - apply saturation BOOST before brightness
            // This keeps colors vivid even when brightness increases
            color = adjustSaturation(color, uSaturation);
            color = adjustContrast(color, uContrast);
            
            // Brightness that preserves color vibrancy:
            // Instead of simple multiply (which washes out), we use a curve
            // that lifts darks while keeping highlights saturated
            float brightFactor = uBrightness;
            // Apply brightness via power curve to preserve saturation
            color = pow(color, vec3(1.0 / max(brightFactor, 0.1)));
            // Boost saturation slightly to counteract any wash-out
            color = adjustSaturation(color, 1.0 + (brightFactor - 1.0) * 0.3);
            
            // === VIGNETTE - adjustable from rectangle → pill → circle ===
            // uVignette controls amount (0 = none, 0.5 = edges black, 1 = deep inward)
            // uVignetteShape controls geometry (0 = rectangle, 0.5 = pill, 1 = circle)
            
            if (uVignette > 0.001) {
                vec2 centered = uv - 0.5;
                float aspect = uResolution.x / uResolution.y;
                vec2 p = vec2(centered.x * aspect, centered.y);
                vec2 halfSize = vec2(0.5 * aspect, 0.5);
                vec2 norm = vec2(p.x / halfSize.x, p.y / halfSize.y);
                vec2 n = abs(norm);
                
                float shape = clamp(uVignetteShape, 0.0, 1.0);
                float exponent = shape < 0.5
                    ? mix(20.0, 4.0, shape * 2.0)
                    : mix(4.0, 2.0, (shape - 0.5) * 2.0);
                
                float super = pow(pow(n.x, exponent) + pow(n.y, exponent), 1.0 / exponent);
                float edgeDist = max(0.0, 1.0 - super);
                
                float amount = clamp(uVignette, 0.0, 1.0);
                float edgeMix = smoothstep(0.0, 0.5, amount);
                float expand = smoothstep(0.5, 1.0, amount);
                float baseFade = mix(0.15, 0.45, edgeMix);
                float fadeEnd = mix(baseFade, 0.85, expand);
                
                float vignette = smoothstep(0.0, fadeEnd, edgeDist);
                vignette = mix(1.0, vignette, edgeMix);
                vignette = pow(vignette, mix(1.0, 2.2, expand));
                
                color *= vignette;
            }
            
            // Subtle film grain / noise
            float noise = hash(uv * uResolution + uTime * 100.0) * 2.0 - 1.0;
            color += noise * uNoiseAmount * 0.5;
            
            // Film grain (multiplicative) - subtle
            float grain = hash(uv * uResolution * 0.5 + fract(uTime * 60.0) * 100.0);
            color *= 1.0 + (grain - 0.5) * uFilmGrain * 0.5;
            
            // Ensure valid range
            color = clamp(color, 0.0, 1.0);
            
            gl_FragColor = vec4(color, 1.0);
        }
    `,
    
    // =========================================
    // PARTICLE / FLUID SHADER
    // =========================================
    
    particleVertex: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        
        varying float vAlpha;
        varying vec3 vColor;
        
        uniform float uTime;
        uniform float uPixelRatio;
        
        void main() {
            vAlpha = aAlpha;
            vColor = aColor;
            
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uPixelRatio * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    
    particleFragment: `
        precision highp float;
        
        varying float vAlpha;
        varying vec3 vColor;
        
        void main() {
            // Circular particle with soft edge
            vec2 center = gl_PointCoord - 0.5;
            float dist = length(center);
            float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
            
            gl_FragColor = vec4(vColor, alpha);
        }
    `,
    
    // =========================================
    // HELPER: Create shader materials
    // Updated to work with StateEngine
    // =========================================
    
    createGradientMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                
                // HSL-based colors - varied palette
                uHue1: { value: 0.5 },   // Cyan
                uHue2: { value: 0.08 },  // Orange
                uHue3: { value: 0.85 },  // Magenta
                uHue4: { value: 0.35 },  // Green-teal
                uSaturation: { value: 0.75 },
                uBrightness: { value: 0.5 },  // Darker
                uContrast: { value: 1.05 },
                uWarmth: { value: 0.5 },
                
                // Animation
                uSpeed: { value: 0.0003 },
                uComplexity: { value: 4.0 },
                uNoiseScale: { value: 0.7 },
                uOffset: { value: new THREE.Vector2(0, 0) },
                
                // State modulation
                uIntensity: { value: 0.5 },
                uBreathingRate: { value: 0.1 },
                uPulseRate: { value: 0.2 },
                
                // Organic color drop parameters
                uColorDropSpeed: { value: 0.05 },
                uColorDropSpread: { value: 0.5 },
                uColorMixIntensity: { value: 0.7 },
                
                // Start fade - controls preview vs full experience
                uStartFade: { value: 0 },
                
                // Brightness evolution control (from slider)
                uBrightnessEvolution: { value: 0.5 },
                
                // Blob controls
                uBlobCount: { value: 10 },
                uBlobSpread: { value: 0.75 },
                uBlobScale: { value: 0.9 },
                uBlobMotion: { value: 0.5 },
                uBlobBlur: { value: 0.7 },
                uBlobSmear: { value: 0.7 },
                uBlobLighten: { value: 0.25 },
                uBlobInvert: { value: 0.15 },
                uBlobFade: { value: 0.7 },
                uBlobWarp: { value: 0.3 },
                uBlobOffset: { value: new THREE.Vector2(0, 0) },
                
                // Hand interaction
                uHandCount: { value: 0 },
                uHandPos: { value: [new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0.5, 0.5)] },
                uHandVel: { value: [new THREE.Vector2(0, 0), new THREE.Vector2(0, 0)] },
                uHandStrength: { value: [0, 0] },
                uHandInfluence: { value: 0.5 }
            },
            vertexShader: this.gradientVertex,
            fragmentShader: this.gradientFragment
        });
    },
    
    createDisplacementMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: null },
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                
                // Primary ripple
                uCenter: { value: new THREE.Vector2(0.5, 0.5) },
                uCenterLag1: { value: new THREE.Vector2(0.5, 0.5) },
                uCenterLag2: { value: new THREE.Vector2(0.5, 0.5) },
                uCenterLag3: { value: new THREE.Vector2(0.5, 0.5) },
                uRingDelayMix: { value: 0.35 },
                uRings: { value: 10 },
                uMaxRadius: { value: 1.0 },
                uMinRadius: { value: 0.02 },
                uStrength: { value: 0.5 },
                uStepSize: { value: 0.1 },
                uRotation: { value: 0 },
                uWobble: { value: 0.04 },
                uChromaticAberration: { value: 0.04 },
                uRingOverlayStrength: { value: 0.35 },
                uRingOverlayWidth: { value: 0.35 },
                
                // Additional ripple origins
                uRipple2Center: { value: new THREE.Vector2(0.3, 0.3) },
                uRipple2Strength: { value: 0.3 },
                uRipple3Center: { value: new THREE.Vector2(0.7, 0.7) },
                uRipple3Strength: { value: 0.2 },
                
                // Shape and style (0-11 different modes)
                uShapeType: { value: 0 },
                uMorphProgress: { value: 0 },
                uMorphType: { value: 0 },
                uInversion: { value: 0 },
                uFoldAmount: { value: 0 },
                
                // Parallel planes controls
                uParallelStrength: { value: 0.16 },
                uParallelZoom: { value: 0.42 },
                uParallelZoomDrift: { value: 0.25 },
                uParallelSpin: { value: 0.25 },
                uParallelThickness: { value: 0.28 },
                uParallelPresence: { value: 0.12 },
                
                // Wave motion - critical for flowing movement
                uWavePhase: { value: 0 },
                uWaveDelay: { value: 0.5 },
                uWaveAmplitude: { value: 0.08 },
                uSecondaryWave: { value: 0.3 },
                uTertiaryWave: { value: 0.1 },
                uSizeWave: { value: 0.1 },
                
                // Edge and shape modifiers
                uEdgeSharpness: { value: 0.03 },
                
                // Global modulation
                uIntensity: { value: 0.6 },
                uBreathingPhase: { value: 0 },
                uDepthPhase: { value: 0 },
                
                // Hand interaction
                uHandCount: { value: 0 },
                uHandPos: { value: [new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0.5, 0.5)] },
                uHandVel: { value: [new THREE.Vector2(0, 0), new THREE.Vector2(0, 0)] },
                uHandStrength: { value: [0, 0] },
                uHandInfluence: { value: 0.5 }
            },
            vertexShader: this.displacementVertex,
            fragmentShader: this.displacementFragment
        });
    },
    
    createPostMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: null },
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                uBlur: { value: 0.2 },
                uGlow: { value: 0.15 },
                uVignette: { value: 0 },
                uVignetteShape: { value: 0.5 },  // 0 = rectangular, 1 = oval
                uSaturation: { value: 1.1 },
                uBrightness: { value: 0.85 },  // Darker
                uContrast: { value: 1.05 },
                uNoiseAmount: { value: 0.008 },
                uFilmGrain: { value: 0.015 }
            },
            vertexShader: this.postVertex,
            fragmentShader: this.postFragment
        });
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Shaders;
}
