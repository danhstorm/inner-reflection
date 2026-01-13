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
 * Shape Modes (uShapeType 0-10):
 * 0: Concentric rings, 1: Spiral, 2: Hexagonal, 3: Diamond, 4: Square,
 * 5: Flower, 6: Star, 7: Wave interference, 8: Organic blob, 9: Folding, 10: Inverted
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
            
            float time = uTime * uSpeed * 0.3; // Slower overall
            float dropTime = uTime * uColorDropSpeed * 0.5;
            
            // Slow, organic breathing
            float breathing = sin(uTime * uBreathingRate * 0.3) * 0.5 + 0.5;
            float pulse = sin(uTime * uPulseRate * 0.4) * 0.5 + 0.5;
            
            // === CONCENTRATED COLOR BLOBS ===
            // Create 6-8 moving blob centers that drift slowly
            vec2 blob1 = vec2(
                0.3 + sin(time * 0.07) * 0.25 + sin(time * 0.11) * 0.1,
                0.4 + cos(time * 0.09) * 0.2 + sin(time * 0.13) * 0.1
            );
            vec2 blob2 = vec2(
                0.7 + sin(time * 0.08 + 1.0) * 0.2,
                0.6 + cos(time * 0.06 + 2.0) * 0.25
            );
            vec2 blob3 = vec2(
                0.5 + sin(time * 0.05 + 2.5) * 0.3,
                0.3 + cos(time * 0.07 + 1.5) * 0.2
            );
            vec2 blob4 = vec2(
                0.25 + sin(time * 0.06 + 4.0) * 0.15,
                0.7 + cos(time * 0.08 + 3.0) * 0.15
            );
            vec2 blob5 = vec2(
                0.8 + sin(time * 0.04 + 5.0) * 0.12,
                0.35 + cos(time * 0.05 + 4.0) * 0.2
            );
            vec2 blob6 = vec2(
                0.6 + sin(time * 0.09 + 3.0) * 0.2,
                0.8 + cos(time * 0.07 + 5.0) * 0.12
            );
            
            // Blob sizes that breathe
            float size1 = 0.04 + breathing * 0.02;
            float size2 = 0.035 + pulse * 0.015;
            float size3 = 0.045 + breathing * 0.025;
            float size4 = 0.03 + pulse * 0.02;
            float size5 = 0.025 + breathing * 0.015;
            float size6 = 0.038 + pulse * 0.018;
            
            // Calculate metaball influence for each color
            float field1 = metaball(uvCorrected, blob1, size1) + 
                          metaball(uvCorrected, blob4, size4 * 0.7);
            float field2 = metaball(uvCorrected, blob2, size2) + 
                          metaball(uvCorrected, blob5, size5 * 0.8);
            float field3 = metaball(uvCorrected, blob3, size3);
            float field4 = metaball(uvCorrected, blob6, size6);
            
            // Add some gentle noise to the fields for organic edges
            float noise1 = fbm(vec3(uvCorrected * 2.0, time * 0.1), 2.0) * 0.3;
            float noise2 = fbm(vec3(uvCorrected * 2.5 + 50.0, time * 0.08), 2.0) * 0.25;
            
            field1 += noise1;
            field2 += noise2;
            field3 += noise1 * 0.8;
            field4 += noise2 * 0.7;
            
            // Create sharp-edged concentrated blobs with smooth falloff
            float threshold = uColorDropSpread * 1.5 + 0.3;
            float edge = 0.15; // Edge softness
            
            float blob1Strength = smoothstep(threshold - edge, threshold + edge * 0.5, field1);
            float blob2Strength = smoothstep(threshold - edge, threshold + edge * 0.5, field2);
            float blob3Strength = smoothstep(threshold - edge * 0.8, threshold + edge * 0.3, field3);
            float blob4Strength = smoothstep(threshold - edge * 0.6, threshold + edge * 0.4, field4);
            
            // Create 4 colors with good saturation
            float darkBrightness = uBrightness * 0.65;
            vec3 color1 = hsl2rgb(uHue1, uSaturation * 0.95, darkBrightness);
            vec3 color2 = hsl2rgb(uHue2, uSaturation * 0.9, darkBrightness * 1.1);
            vec3 color3 = hsl2rgb(uHue3, uSaturation * 0.85, darkBrightness * 0.95);
            vec3 color4 = hsl2rgb(uHue4, uSaturation * 0.88, darkBrightness * 1.05);
            
            // Dark base color (very dark, almost black with hint of hue1)
            vec3 baseColor = hsl2rgb(uHue1, uSaturation * 0.3, 0.08);
            
            // Build color by layering concentrated blobs
            vec3 color = baseColor;
            
            // Layer blobs with smooth mixing - concentrated areas of color
            float mixStrength = uColorMixIntensity;
            color = mix(color, color1, blob1Strength * mixStrength);
            color = mix(color, color2, blob2Strength * mixStrength * 0.95);
            color = mix(color, color3, blob3Strength * mixStrength * 0.9);
            color = mix(color, color4, blob4Strength * mixStrength * 0.85);
            
            // Subtle glow/bleed around blob edges
            float edgeGlow = max(max(blob1Strength, blob2Strength), max(blob3Strength, blob4Strength));
            edgeGlow = smoothstep(0.0, 0.5, edgeGlow) - smoothstep(0.5, 1.0, edgeGlow);
            vec3 glowColor = mix(color2, color3, pulse);
            color = mix(color, glowColor, edgeGlow * 0.15 * breathing);
            
            // Subtle warm/cool shift
            float warmShift = (uWarmth - 0.5) * 0.06;
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
        uniform float uRings;           // Number of concentric rings (6-16)
        uniform float uMaxRadius;       // Outer extent of effect
        uniform float uMinRadius;       // Inner core size
        uniform float uStrength;        // Displacement magnitude (0.4-1.0)
        uniform float uStepSize;
        uniform float uRotation;        // Overall rotation angle
        uniform float uWobble;          // Organic edge deformation
        uniform float uChromaticAberration;  // RGB separation amount
        
        // Secondary displacement origins for layered effects
        uniform vec2 uRipple2Center;
        uniform float uRipple2Strength;
        uniform vec2 uRipple3Center;
        uniform float uRipple3Strength;
        
        // Shape and style parameters
        uniform float uShapeType;       // 0-10: concentric, spiral, hex, diamond, square, flower, star, wave, organic, fold, invert
        uniform float uMorphProgress;   // Blend between current and morph target shape
        uniform float uMorphType;       // Target shape for morphing
        uniform float uInversion;       // 0-1: invert displacement direction
        uniform float uFoldAmount;      // 0-1: rings fold back on themselves
        
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
        
        // ===========================================
        // WAVE MOTION CALCULATION
        // Each ring has its own delayed phase creating cascading movement
        // ===========================================
        
        // Calculate wave offset for a specific ring - this creates the flowing delayed motion
        float getRingWaveOffset(float ringIndex, float totalRings, float phase, float delay, float amplitude) {
            // Each ring's phase is delayed based on its index
            float ringPhase = phase - ringIndex * delay;
            
            // Primary wave - slow undulation
            float wave1 = sin(ringPhase) * amplitude;
            
            // Secondary wave - faster, smaller for organic feel
            float wave2 = sin(ringPhase * 2.3 + 0.5) * amplitude * uSecondaryWave;
            
            // Tertiary wave - even faster, creates ripple texture
            float wave3 = sin(ringPhase * 4.7 + 1.2) * amplitude * uTertiaryWave;
            
            // Combine waves - outer rings have stronger effect
            float ringFactor = (ringIndex + 1.0) / totalRings;
            return (wave1 + wave2 + wave3) * ringFactor;
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
        // 3D SLICE SHAPE FUNCTIONS
        // Simulates slicing through 3D objects at various angles
        // ===========================================
        
        // Shape 0: Soft concentric gradients (smooth lens-like distortion)
        float shapeCircleSlice(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            float dist = length(toCenter);
            
            // Skip inner area
            float normalizedDist = dist / uMaxRadius;
            if (normalizedDist < uMinRadius) return 0.0;
            
            // Soft wave-based gradient - not sharp rings
            float ringIndex = floor(normalizedDist * rings * 0.5);
            float waveOffset = getRingWaveOffset(ringIndex, rings, phase, delay, uWaveAmplitude * 1.5);
            
            // Smooth sinusoidal waves instead of fract for sharp rings
            float waveValue = sin((dist + waveOffset) / uMaxRadius * rings * PI) * 0.5 + 0.5;
            
            // Very soft edges - large edge value
            float edge = uEdgeSharpness * 3.0 + 0.3;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            // Smooth gradient, not sharp lensing
            return softness * 1.2;
        }
        
        // Shape 1: Torus slice - soft elliptical gradients
        float shapeTorusSlice(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Slice angle slowly evolves
            float sliceAngle = phase * 0.1;
            
            // Transform to 3D slice through torus
            float tilt = sin(sliceAngle) * 0.6;
            vec3 p = vec3(toCenter.x, toCenter.y * (1.0 + tilt * 0.5), tilt * 0.3);
            
            // Torus parameters
            float majorRadius = uMaxRadius * 0.6;
            float minorRadius = uMaxRadius * 0.25;
            
            // Distance to torus surface
            float torusDist = sdTorus(p, vec2(majorRadius, minorRadius));
            
            // Smooth sinusoidal gradient instead of sharp rings
            float waveOffset = getRingWaveOffset(0.0, rings, phase, delay, uWaveAmplitude);
            float waveValue = sin((abs(torusDist) + waveOffset) * rings * 1.5 + phase * 0.05) * 0.5 + 0.5;
            
            // Very soft edges
            float edge = uEdgeSharpness * 2.5 + 0.25;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            return softness * 1.2;
        }
        
        // Shape 2: Linear bands - soft flowing gradients across screen
        float shapeLinearBands(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Line angle evolves over time
            float lineAngle = phase * 0.08 + uRotation;
            
            // Project onto line direction
            vec2 lineDir = vec2(cos(lineAngle), sin(lineAngle));
            float lineDist = dot(toCenter, lineDir);
            
            // Offset from center for asymmetric feel
            lineDist += sin(phase * 0.15) * 0.2;
            
            // Soft wave gradient instead of sharp bands
            float waveOffset = getRingWaveOffset(0.0, rings, phase, delay, uWaveAmplitude * 1.2);
            float waveValue = sin((lineDist + waveOffset) * rings * 0.8 * PI) * 0.5 + 0.5;
            
            // Very soft edges for flowing gradient
            float edge = uEdgeSharpness * 3.0 + 0.35;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            return softness * 1.3;
        }
        
        // Shape 3: Skewed lines - diagonal bands with perspective
        float shapeSkewedLines(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Skew angle with slow drift
            float skewAngle = phase * 0.06 + PI * 0.25;
            float skewAmount = sin(phase * 0.12) * 0.4 + 0.3;
            
            // Apply perspective skew
            vec2 skewed = toCenter;
            skewed.x += skewed.y * skewAmount;
            
            // Line direction with skew
            vec2 lineDir = vec2(cos(skewAngle), sin(skewAngle));
            float lineDist = dot(skewed, lineDir);
            
            // Create bands with varying width
            float widthMod = 1.0 + sin(lineDist * 3.0 + phase * 0.2) * 0.2;
            float bandIndex = floor((lineDist + 1.5) * rings * 0.4 * widthMod);
            float waveOffset = getRingWaveOffset(abs(bandIndex), rings, phase, delay, uWaveAmplitude * 1.2);
            
            // Soft sinusoidal gradient
            float waveValue = sin((lineDist + waveOffset) * rings * 0.6 * widthMod * PI) * 0.5 + 0.5;
            
            // Very soft edge
            float edge = uEdgeSharpness * 2.5 + 0.3;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            return softness * 1.3;
        }
        
        // Shape 4: Cylinder slice - ovals that become lines at extreme angles
        float shapeCylinderSlice(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Slice angle through cylinder
            float sliceAngle = sin(phase * 0.08) * 0.7;
            
            // Transform: as angle increases, circles become ellipses then lines
            float stretch = 1.0 / (cos(sliceAngle) + 0.1);
            stretch = min(stretch, 5.0); // Cap the stretch
            
            // Apply anisotropic scaling
            float stretchAngle = phase * 0.05;
            mat2 stretchMat = mat2(
                cos(stretchAngle), -sin(stretchAngle),
                sin(stretchAngle), cos(stretchAngle)
            );
            vec2 stretched = stretchMat * toCenter;
            stretched.x *= stretch;
            stretched = transpose(stretchMat) * stretched;
            
            float dist = length(stretched);
            
            // Ring calculation
            float normalizedDist = dist / uMaxRadius;
            if (normalizedDist < uMinRadius * stretch) return 0.0;
            
            float ringIndex = floor(normalizedDist * rings);
            float waveOffset = getRingWaveOffset(ringIndex, rings, phase, delay, uWaveAmplitude * 1.3);
            
            // Soft wave gradient
            float waveValue = sin((dist + waveOffset) / uMaxRadius * rings * PI * 0.8) * 0.5 + 0.5;
            
            // Soft edges
            float edge = uEdgeSharpness * 2.5 + 0.25;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            return softness * (1.0 + stretch * 0.1);
        }
        
        // Shape 5: Sphere with rotating slice plane - creates moving oval
        float shapeSphereSlice(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // 3D position on slice plane
            vec3 p = vec3(toCenter, 0.0);
            
            // Rotate slice plane in 3D
            float rotX = sin(phase * 0.07) * 0.5;
            float rotY = cos(phase * 0.09) * 0.4;
            
            p = rotateX(rotX) * p;
            p = rotateY(rotY) * p;
            
            // Distance to nested spheres
            float sphereScale = uMaxRadius * 0.8;
            float dist = length(p) / sphereScale;
            
            // Create concentric shells with soft gradient
            float ringIndex = floor(dist * rings);
            float waveOffset = getRingWaveOffset(ringIndex, rings, phase, delay, uWaveAmplitude * 1.2);
            
            // Soft wave instead of sharp rings
            float waveValue = sin((dist + waveOffset * 0.5) * rings * PI) * 0.5 + 0.5;
            
            // Soft edge
            float edge = uEdgeSharpness * 2.5 + 0.25;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            // Add depth-based intensity
            float depthFade = 1.0 - abs(p.z) * 2.0;
            depthFade = max(depthFade, 0.3);
            
            return softness * 1.4 * depthFade;
        }
        
        // Shape 6: Hyperboloid slice - creates hyperbolic curves
        float shapeHyperboloid(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Hyperboloid parameter
            float k = sin(phase * 0.1) * 0.3 + 0.5;
            
            // Hyperboloid distance: x² + y² - z² = k
            // On our 2D slice, this creates hyperbolic curves
            float hyperDist = sqrt(abs(toCenter.x * toCenter.x * (1.0 + k) + 
                                       toCenter.y * toCenter.y * (1.0 - k)));
            
            float normalizedDist = hyperDist / uMaxRadius;
            float ringIndex = floor(normalizedDist * rings);
            float waveOffset = getRingWaveOffset(ringIndex, rings, phase, delay, uWaveAmplitude * 1.2);
            
            // Soft wave gradient
            float waveValue = sin((hyperDist + waveOffset) / uMaxRadius * rings * PI * 0.9) * 0.5 + 0.5;
            
            // Soft edge
            float edge = uEdgeSharpness * 2.5 + 0.25;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            return softness * 1.3;
        }
        
        // Shape 7: Spiral ramp slice - like slicing through a parking garage
        float shapeSpiralRamp(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            float dist = length(toCenter);
            float angle = atan(toCenter.y, toCenter.x);
            
            // Spiral: z = angle (unwrapped height)
            // Slice at different z heights creates spiral pattern
            float sliceHeight = sin(phase * 0.1) * 2.0;
            float spiralZ = angle / TAU + dist * 1.5;
            
            // Distance to slice plane
            float spiralDist = abs(fract(spiralZ - sliceHeight * 0.5) - 0.5) * 2.0;
            
            float waveOffset = getRingWaveOffset(0.0, rings, phase, delay, uWaveAmplitude * 1.2);
            
            // Soft sinusoidal wave
            float waveValue = sin((spiralDist + waveOffset * 0.3) * rings * PI) * 0.5 + 0.5;
            
            // Soft edge
            float edge = uEdgeSharpness * 2.5 + 0.25;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            return softness * 1.2;
        }
        
        // Shape 8: Parallel planes - creates interference pattern
        float shapeParallelPlanes(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Two sets of parallel lines at different angles
            float angle1 = phase * 0.05;
            float angle2 = phase * 0.05 + PI * 0.5 + sin(phase * 0.08) * 0.3;
            
            vec2 dir1 = vec2(cos(angle1), sin(angle1));
            vec2 dir2 = vec2(cos(angle2), sin(angle2));
            
            float dist1 = dot(toCenter, dir1);
            float dist2 = dot(toCenter, dir2);
            
            // Create bands from both directions
            float bandIndex1 = floor((dist1 + 1.0) * rings * 0.3);
            float bandIndex2 = floor((dist2 + 1.0) * rings * 0.3);
            float waveOffset1 = getRingWaveOffset(abs(bandIndex1), rings, phase, delay, uWaveAmplitude);
            float waveOffset2 = getRingWaveOffset(abs(bandIndex2), rings, phase * 1.1, delay * 0.9, uWaveAmplitude);
            
            float band1 = fract((dist1 + 1.0 + waveOffset1) * rings * 0.3);
            float band2 = fract((dist2 + 1.0 + waveOffset2) * rings * 0.3);
            
            // Soft sinusoidal waves
            float wave1 = sin(band1 * PI * 2.0) * 0.5 + 0.5;
            float wave2 = sin(band2 * PI * 2.0) * 0.5 + 0.5;
            
            // Soft edges
            float edge = uEdgeSharpness * 2.5 + 0.3;
            float soft1 = smoothstep(0.0, edge, wave1) * smoothstep(1.0, 1.0 - edge, wave1);
            float soft2 = smoothstep(0.0, edge, wave2) * smoothstep(1.0, 1.0 - edge, wave2);
            
            // Combine with interference
            float combined = max(soft1, soft2) + soft1 * soft2 * 0.5;
            
            return combined * 1.2;
        }
        
        // Shape 9: Cone slice - conic sections (circles, ellipses, parabolas, hyperbolas)
        float shapeConicSection(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Cone angle determines the conic section type
            float coneAngle = sin(phase * 0.06) * 0.4 + 0.5; // 0=circle, 0.5=parabola, >0.5=hyperbola
            
            // Eccentricity based on slice angle
            float e = coneAngle;
            
            // Conic section in polar form: r = l / (1 + e*cos(theta))
            float angle = atan(toCenter.y, toCenter.x);
            float targetR = uMaxRadius * 0.5 / (1.0 + e * cos(angle - phase * 0.1));
            targetR = abs(targetR);
            
            float dist = length(toCenter);
            float conicDist = abs(dist - targetR);
            
            // Create rings around the conic
            float normalizedDist = dist / uMaxRadius;
            float ringIndex = floor(normalizedDist * rings);
            float waveOffset = getRingWaveOffset(ringIndex, rings, phase, delay, uWaveAmplitude);
            
            // Blend between radial rings and conic distance
            float blendedDist = mix(dist, dist + conicDist * 0.5, 0.3) + waveOffset;
            
            // Soft sinusoidal wave
            float waveValue = sin(blendedDist / uMaxRadius * rings * PI * 0.9) * 0.5 + 0.5;
            
            // Soft edge
            float edge = uEdgeSharpness * 2.5 + 0.25;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            return softness * 1.3;
        }
        
        // Shape 10: Möbius-like twisted bands
        float shapeMoebiusBands(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            float dist = length(toCenter);
            float angle = atan(toCenter.y, toCenter.x);
            
            // Möbius twist: as you go around, the band twists
            float twist = angle / TAU; // 0 to 1 around the circle
            float twistAmount = sin(phase * 0.08) * 0.5 + 0.5;
            
            // Apply twist to radial distance
            float twistedDist = dist + sin(angle * 2.0 + phase * 0.15) * uMaxRadius * 0.15 * twistAmount;
            
            // Phase shifts based on angle (creates the twist illusion)
            float phaseShift = angle * twistAmount;
            
            float normalizedDist = twistedDist / uMaxRadius;
            float ringIndex = floor(normalizedDist * rings);
            float waveOffset = getRingWaveOffset(ringIndex, rings, phase + phaseShift, delay, uWaveAmplitude * 1.2);
            
            // Soft sinusoidal wave
            float waveValue = sin((twistedDist + waveOffset) / uMaxRadius * rings * PI) * 0.5 + 0.5;
            
            // Soft edge
            float edge = uEdgeSharpness * 2.5 + 0.25;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            return softness * 1.3;
        }
        
        // Shape 11: Pill/Capsule - soft glowing rounded shape
        float shapePillCapsule(vec2 uv, vec2 center, float rings, float phase, float delay) {
            vec2 toCenter = uv - center;
            
            // Pill orientation slowly rotates
            float pillAngle = phase * 0.04 + uRotation;
            mat2 rot = mat2(cos(pillAngle), -sin(pillAngle), sin(pillAngle), cos(pillAngle));
            vec2 rotated = rot * toCenter;
            
            // Pill dimensions - elongated vertically, breathing
            float pillHeight = uMaxRadius * (0.6 + sin(phase * 0.1) * 0.15);
            float pillRadius = uMaxRadius * 0.35;
            
            // Distance to pill shape
            float pillDist = sdCapsule(rotated, pillHeight, pillRadius);
            
            // Soft sinusoidal gradient based on distance
            float waveOffset = getRingWaveOffset(0.0, rings, phase, delay, uWaveAmplitude * 1.2);
            float waveValue = sin((abs(pillDist) + waveOffset) / uMaxRadius * rings * PI * 0.8) * 0.5 + 0.5;
            
            // Very soft edges for smooth glow
            float edge = uEdgeSharpness * 3.0 + 0.35;
            float softness = smoothstep(0.0, edge, waveValue) * smoothstep(1.0, 1.0 - edge, waveValue);
            
            // Inside vs outside the pill - soft glow inside
            float insidePill = smoothstep(0.05, -0.05, pillDist);
            
            // Blend: soft gradient inside and outside
            float result = mix(softness, 0.7 + sin(phase * 0.15) * 0.15, insidePill * 0.5);
            
            return result * 1.4;
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
            
            // Smooth optical effect - keep gradients soft
            shapeValue = pow(shapeValue, 1.2) * 1.8;
            
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
            float innerFade = smoothstep(0.0, uMinRadius * 2.0, dist);
            float outerFade = smoothstep(uMaxRadius * 2.0, uMaxRadius * 0.7, dist);
            
            return direction * displaceAmount * innerFade * outerFade;
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
            
            if (aspectRatio > 1.0) {
                center1.x = (center1.x - 0.5) * aspectRatio + 0.5;
                center2.x = (center2.x - 0.5) * aspectRatio + 0.5;
                center3.x = (center3.x - 0.5) * aspectRatio + 0.5;
            } else {
                center1.y = (center1.y - 0.5) / aspectRatio + 0.5;
                center2.y = (center2.y - 0.5) / aspectRatio + 0.5;
                center3.y = (center3.y - 0.5) / aspectRatio + 0.5;
            }
            
            // Calculate displacement from each origin with different shapes
            vec2 disp1 = calculateDisplacement(uvCorrected, center1, uStrength * strengthMod, uShapeType, wavePhase, waveDelay);
            vec2 disp2 = calculateDisplacement(uvCorrected, center2, uRipple2Strength * strengthMod, uShapeType + 1.0, wavePhase * 1.1, waveDelay * 0.85);
            vec2 disp3 = calculateDisplacement(uvCorrected, center3, uRipple3Strength * strengthMod, uShapeType + 2.0, wavePhase * 0.9, waveDelay * 1.15);
            
            // Combine displacements - can be very strong
            vec2 totalDisp = disp1 + disp2 * 0.8 + disp3 * 0.6;
            
            // Apply rotation
            totalDisp = rotate2d(uRotation * 0.5) * totalDisp;
            
            // 3D slice feel - subtle depth modulation
            float depthWarp = sin(uDepthPhase + length(uvCorrected - 0.5) * 2.0) * 0.02 * depthPulse;
            totalDisp *= 1.0 + depthWarp;
            
            // Morph between current and alternate shape
            if (uMorphProgress > 0.01) {
                vec2 morphDisp = calculateDisplacement(uvCorrected, center1, uStrength * strengthMod, uMorphType, wavePhase * 1.2, waveDelay * 0.7);
                totalDisp = mix(totalDisp, morphDisp, uMorphProgress);
            }
            
            // Convert back to UV space (undo aspect correction)
            if (aspectRatio > 1.0) {
                totalDisp.x /= aspectRatio;
            } else {
                totalDisp.y *= aspectRatio;
            }
            
            vec2 finalUv = uv + totalDisp;
            
            // Strong chromatic aberration based on displacement magnitude
            float dispMagnitude = length(totalDisp);
            float aberration = uChromaticAberration * (0.8 + dispMagnitude * 5.0);
            vec2 aberrationDir = normalize(totalDisp + 0.0001);
            
            // Aspect-correct the aberration direction
            if (aspectRatio > 1.0) {
                aberrationDir.x /= aspectRatio;
            } else {
                aberrationDir.y *= aspectRatio;
            }
            
            // Sample with chromatic aberration - creates the color separation
            float r = texture2D(uTexture, finalUv + aberrationDir * aberration * 1.2).r;
            float g = texture2D(uTexture, finalUv).g;
            float b = texture2D(uTexture, finalUv - aberrationDir * aberration * 1.2).b;
            
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
            
            // NO VIGNETTE - removed as requested
            
            // Color adjustments - darker overall
            color = adjustSaturation(color, uSaturation);
            color = adjustContrast(color, uContrast);
            color *= uBrightness * 0.85; // Darken overall
            
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
                uColorMixIntensity: { value: 0.7 }
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
                uRings: { value: 10 },
                uMaxRadius: { value: 1.0 },
                uMinRadius: { value: 0.02 },
                uStrength: { value: 0.5 },
                uStepSize: { value: 0.1 },
                uRotation: { value: 0 },
                uWobble: { value: 0.04 },
                uChromaticAberration: { value: 0.04 },
                
                // Additional ripple origins
                uRipple2Center: { value: new THREE.Vector2(0.3, 0.3) },
                uRipple2Strength: { value: 0.3 },
                uRipple3Center: { value: new THREE.Vector2(0.7, 0.7) },
                uRipple3Strength: { value: 0.2 },
                
                // Shape and style (0-10 different modes)
                uShapeType: { value: 0 },
                uMorphProgress: { value: 0 },
                uMorphType: { value: 0 },
                uInversion: { value: 0 },
                uFoldAmount: { value: 0 },
                
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
                uDepthPhase: { value: 0 }
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
                uVignette: { value: 0 },  // No vignette
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
