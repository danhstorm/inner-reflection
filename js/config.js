/**
 * INNER REFLECTION - Configuration
 * 
 * Central configuration file for all adjustable parameters.
 * This makes it easy to tweak the experience without diving into code.
 */

const CONFIG = {
    // =========================================
    // GENERAL
    // =========================================
    debug: false,
    
    // =========================================
    // VISUAL PARAMETERS
    // =========================================
    visual: {
        // Background gradient colors (can be dynamically changed)
        colors: {
            palette1: ['#00d4aa', '#00b4d8', '#0077b6', '#023e8a'],
            palette2: ['#ff6b9d', '#c9184a', '#ff758f', '#ffccd5'],
            palette3: ['#ffd93d', '#ff9f1c', '#ff6b35', '#f72585'],
            palette4: ['#7209b7', '#560bad', '#480ca8', '#3a0ca3'],
            current: ['#00d4aa', '#48cae4', '#ffb347', '#ff6b9d']
        },
        
        // Gradient animation
        gradient: {
            speed: 0.0003,           // Base animation speed
            complexity: 5,            // Number of gradient layers
            noiseScale: 0.5,          // Noise influence on gradients
            blendMode: 'soft-light'   // Color blend mode
        },
        
        // Displacement effect (the circular ripples) - PROMINENT
        displacement: {
            rings: 10,                // Number of concentric rings
            maxRadius: 0.9,           // Maximum radius (0-1, screen relative)
            minRadius: 0.02,          // Minimum inner radius
            strength: 0.35,           // Displacement intensity (stronger)
            stepSize: 0.08,           // Gap between rings
            rotationSpeed: 0.02,      // Ring rotation speed (slower)
            wobble: 0.015,            // Amount of organic wobble (subtle)
            chromaticAberration: 0.025 // Color separation amount
        },
        
        // Blur and glow
        effects: {
            blur: 0.5,                // Global blur amount
            glow: 0.3,                // Glow intensity
            vignette: 0.4,            // Edge darkening
            saturation: 1.2           // Color saturation boost
        },
        
        // Particle/fluid system (optional enhancement)
        particles: {
            enabled: true,
            count: 50,
            size: { min: 2, max: 8 },
            speed: { min: 0.1, max: 0.5 },
            opacity: { min: 0.1, max: 0.4 }
        }
    },
    
    // =========================================
    // AUDIO PARAMETERS
    // =========================================
    audio: {
        masterVolume: -16,  // dB - reduced further for softer default
        
        // Drone layers configuration - reduced volumes for gentler sound
        drones: {
            // Base drone - deep, slow-moving
            base: {
                enabled: true,
                type: 'granular',
                frequency: 55,          // Hz (A1)
                volume: -24,            // dB - reduced significantly
                attack: 5,              // seconds - slower attack
                release: 10,
                filterFreq: 180,        // Low-pass cutoff - darker
                filterQ: 0.8,
                reverbWet: 0.7,
                delayTime: 0.6,
                delayFeedback: 0.25
            },
            
            // Mid drone - harmonic content
            mid: {
                enabled: true,
                type: 'granular',
                frequency: 110,         // Hz (A2)
                volume: -26,            // dB - reduced significantly
                attack: 4,
                release: 8,
                filterFreq: 600,        // Darker
                filterQ: 1.5,
                reverbWet: 0.6,
                delayTime: 0.4,
                delayFeedback: 0.35
            },
            
            // High drone - shimmer and texture
            high: {
                enabled: true,
                type: 'granular',
                frequency: 440,         // Hz (A4)
                volume: -42,            // dB - reduced significantly
                attack: 3,
                release: 6,
                filterFreq: 3500,       // Slightly darker
                filterQ: 0.4,
                reverbWet: 0.8,
                delayTime: 0.15,
                delayFeedback: 0.45
            },
            
            // Glitch layer - chopped, rhythmic
            glitch: {
                enabled: true,
                type: 'granular',
                grainSize: 0.05,        // Very short grains
                grainOverlap: 0.1,
                volume: -28,            // dB - reduced
                filterFreq: 2000,
                delayTime: 0.0625,
                delayFeedback: 0.6,
                randomization: 0.8      // High randomization
            }
        },
        
        // Granular synthesis settings
        granular: {
            grainSize: { min: 0.1, max: 2.0 },    // seconds
            grainOverlap: { min: 0.1, max: 0.9 },
            pitch: { min: 0.5, max: 2.0 },
            position: { min: 0, max: 1 },
            spread: { min: 0, max: 1 }
        },
        
        // Effects chain
        effects: {
            reverb: {
                decay: 8,
                preDelay: 0.1,
                wet: 0.08
            },
            delay: {
                time: 0.4,
                feedback: 0.4,
                wet: 0.04
            },
            filter: {
                type: 'lowpass',
                frequency: 2000,
                Q: 1
            },
            chorus: {
                frequency: 0.5,
                depth: 0.5,
                wet: 0.2
            },
            distortion: {
                amount: 0,
                wet: 0
            }
        },
        
        // Microphone input processing
        mic: {
            gain: 1.0,
            noiseGate: -50,           // dB threshold
            smoothing: 0.8,           // FFT smoothing
            fftSize: 2048
        }
    },
    
    // =========================================
    // INPUT MAPPING
    // =========================================
    inputMapping: {
        // Maps input sources to visual/audio parameters
        // Each mapping: { source, target, min, max, smoothing }
        
        // Microphone mappings
        mic: {
            volume: [
                { target: 'visual.displacement.strength', min: 0.05, max: 0.3, smoothing: 0.9 },
                { target: 'visual.effects.glow', min: 0.2, max: 0.8, smoothing: 0.85 },
                { target: 'audio.drones.base.volume', min: -18, max: -6, smoothing: 0.95 }
            ],
            bass: [
                { target: 'visual.displacement.rings', min: 4, max: 12, smoothing: 0.9 },
                { target: 'visual.gradient.speed', min: 0.0002, max: 0.001, smoothing: 0.95 }
            ],
            treble: [
                { target: 'visual.effects.saturation', min: 1.0, max: 1.8, smoothing: 0.8 },
                { target: 'audio.drones.glitch.volume', min: -30, max: -18, smoothing: 0.85 }
            ]
        },
        
        // Face tracking mappings
        face: {
            positionX: [
                { target: 'visual.displacement.centerX', min: 0.2, max: 0.8, smoothing: 0.7 }
            ],
            positionY: [
                { target: 'visual.displacement.centerY', min: 0.2, max: 0.8, smoothing: 0.7 }
            ],
            distance: [
                { target: 'visual.displacement.maxRadius', min: 0.3, max: 0.8, smoothing: 0.8 }
            ]
        },
        
        // Accelerometer mappings (mobile)
        accelerometer: {
            tiltX: [
                { target: 'visual.gradient.offsetX', min: -0.5, max: 0.5, smoothing: 0.6 }
            ],
            tiltY: [
                { target: 'visual.gradient.offsetY', min: -0.5, max: 0.5, smoothing: 0.6 }
            ],
            shake: [
                { target: 'visual.effects.blur', min: 0, max: 2, smoothing: 0.5 },
                { target: 'audio.effects.distortion.amount', min: 0, max: 0.3, smoothing: 0.7 }
            ]
        }
    },
    
    // =========================================
    // FACE TRACKING
    // =========================================
    faceTracking: {
        enabled: true,
        modelPath: 'short',           // 'short' or 'full' model
        minDetectionConfidence: 0.5,
        maxFaces: 1,
        updateRate: 30                // Target FPS for tracking
    },
    
    // =========================================
    // PERFORMANCE
    // =========================================
    performance: {
        targetFPS: 60,
        pixelRatio: Math.min(window.devicePixelRatio, 2),  // Cap at 2x for performance
        antialias: true,
        powerPreference: 'high-performance'
    }
};

// Freeze config to prevent accidental modifications
// (Comment out during development if you need to modify at runtime)
// Object.freeze(CONFIG);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
