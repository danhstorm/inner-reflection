/**
 * INNER REFLECTION - Audio Engine
 * 
 * Handles all audio synthesis and processing using Tone.js
 * Creates layered drone soundscapes with granular synthesis
 * 
 * MIRRORING CONCEPT:
 * - Records microphone input and creates evolving loops
 * - Granular synthesis fragments and stretches these recordings
 * - Creates a "sound mirror" that reflects back transformed versions of the user's environment
 */

class AudioEngine {
    constructor() {
        this.isInitialized = false;
        this.isPlaying = false;
        
        // Main output
        this.masterGain = null;
        
        // Track which parameters are under manual control (sliders)
        // When set, modulateFromState won't override these
        this.manualControl = {
            masterVolume: true,
            masterReverb: false,
            masterDelay: false,
            masterFilter: false,
            droneBaseVolume: false,
            droneMidVolume: false,
            droneHighVolume: false,
            droneBaseFilter: false,
            droneMidFilter: false,
            droneHighFilter: false
        };
        
        // Drone layers
        this.drones = {};
        
        // Effects
        this.effects = {};
        
        // Granular players
        this.granularPlayers = {};
        
        // Microphone input
        this.micInput = null;
        this.micGain = null;
        
        // === MIC LOOP RECORDING SYSTEM ===
        // Multiple buffers for layered loop playback
        this.micLoops = [];
        this.maxMicLoops = 4;  // Keep up to 4 mic loops
        this.currentLoopIndex = 0;
        this.isCapturingLoop = false;
        this.lastLoopCaptureTime = 0;
        this.loopCaptureInterval = 12000;  // Capture new loop every 12 seconds when sound detected
        this.soundThreshold = 0.015;  // Lower threshold for better detection
        this.lastMicLevel = 0;
        
        // Recording buffer for granular
        this.recordingBuffer = null;
        this.recorder = null;
        this.isRecording = false;
        
        // Modulation sources
        this.lfos = {};
        
        // Slow evolution timers
        this.evolutionTime = 0;
        this.lastEvolutionUpdate = 0;
        this.isMuted = false;
        this.unmutedGain = null;
        this.lastAudioState = null;
        this.lastMicInput = null;
        this.micDelayMaxTime = 10;
        this.micDelayMaxTime2 = 10;
        this.micDelayParams = {
            time: 2,
            time2: 4,
            drift: 0.4,
            stretch: 0.35,
            scatter: 0.25,
            feedback: 0.6,
            feedbackDrift: 0.25,
            pitch: 0,
            pitchDrift: 0.4,
            pitchFlutter: 0.2,
            wow: 0.2,
            flutter: 0.15
        };
        this.micDelayEvolution = null;
        this.handDetune = 0;
        
        // Current state (for smooth transitions)
        this.state = {
            masterVolume: CONFIG.audio.masterVolume,
            droneVolumes: {},
            filterFrequencies: {}
        };
    }
    
    // =========================================
    // INITIALIZATION
    // =========================================
    
    /**
     * Preload audio structures without starting audio context
     * Called during intro screen to prepare everything
     */
    async preload() {
        if (this.isPreloaded) return;
        
        console.log('AudioEngine: Preloading structures...');
        
        // We can't create Tone.js nodes without audio context,
        // but we can prepare any non-audio data structures
        // The main benefit is that init() will be faster since
        // code is already parsed and ready
        
        this.isPreloaded = true;
        console.log('AudioEngine: Preload complete');
    }
    
    async init() {
        if (this.isInitialized) return;
        
        console.log('AudioEngine: Initializing...');
        
        try {
            // Start Tone.js audio context (requires user interaction)
            await Tone.start();
            console.log('AudioEngine: Tone.js started');
            
            // Create master output chain
            this.createMasterChain();
            
            // Create effects
            this.createEffects();
            
            // Create drone layers with slow evolving character
            this.createDrones();
            
            // Create additional ambient layers
            this.createAmbientLayers();
            
            // Create LFOs for modulation
            this.createLFOs();
            
            // Create synthetic buffer for granular (in case no mic)
            await this.createSyntheticBuffer();
            
            // Start granular layers with synthetic buffer
            this.startGranularLayers();
            
            // Start slow evolution timer
            this.startEvolution();
            
            this.isInitialized = true;
            console.log('AudioEngine: Initialized');
            
        } catch (error) {
            console.error('AudioEngine: Initialization failed:', error);
            throw error;
        }
    }
    
    createMasterChain() {
        // Final brick wall limiter - catches any peaks that got through
        this.limiter = new Tone.Limiter(-1).toDestination();
        
        // Soft limiter before the brick wall to avoid harsh limiting artifacts
        this.softLimiter = new Tone.Limiter(-3).connect(this.limiter);
        
        // Master compressor - more aggressive to prevent clipping
        this.compressor = new Tone.Compressor({
            threshold: -18,
            ratio: 12,
            attack: 0.003,  // Faster attack to catch transients
            release: 0.15,
            knee: 6
        }).connect(this.softLimiter);
        
        // Pre-compressor gain reduction to give more headroom
        this.preCompGain = new Tone.Gain(0.7).connect(this.compressor);
        
        // Master gain - reduced to prevent clipping
        this.masterGain = new Tone.Gain(Tone.dbToGain(CONFIG.audio.masterVolume - 3))
            .connect(this.preCompGain);
        this.unmutedGain = this.masterGain.gain.value;
        
        // Master filter for overall tonal control - reduce Q to avoid resonant peaks
        this.masterFilter = new Tone.Filter({
            type: 'lowpass',
            frequency: 8000,
            Q: 0.3  // Lower Q to avoid resonant buildup
        }).connect(this.masterGain);

        if (this.isMuted) {
            this.masterGain.gain.value = 0;
        }
    }
    
    createEffects() {
        const effectsConfig = CONFIG.audio.effects;
        
        // Main reverb
        this.effects.reverb = new Tone.Reverb({
            decay: effectsConfig.reverb.decay,
            preDelay: effectsConfig.reverb.preDelay,
            wet: effectsConfig.reverb.wet
        }).connect(this.masterFilter);
        
        // Ping-pong delay
        this.effects.delay = new Tone.PingPongDelay({
            delayTime: effectsConfig.delay.time,
            feedback: effectsConfig.delay.feedback,
            wet: effectsConfig.delay.wet
        }).connect(this.effects.reverb);
        
        // Chorus for width
        this.effects.chorus = new Tone.Chorus({
            frequency: effectsConfig.chorus.frequency,
            depth: effectsConfig.chorus.depth,
            wet: effectsConfig.chorus.wet
        }).connect(this.effects.delay);
        
        // Phaser for movement
        this.effects.phaser = new Tone.Phaser({
            frequency: 0.2,
            octaves: 3,
            baseFrequency: 400,
            wet: 0.2
        }).connect(this.effects.chorus);
        
        // Pre-effects gain
        this.effectsInput = new Tone.Gain(1).connect(this.effects.phaser);
        
        // Dry path (bypasses effects)
        this.dryGain = new Tone.Gain(0.3).connect(this.masterFilter);
        
        console.log('AudioEngine: Effects chain created');
    }
    
    createDrones() {
        const droneConfig = CONFIG.audio.drones;
        
        // BASE DRONE - Deep, slow oscillator
        this.drones.base = this.createDroneLayer({
            name: 'base',
            type: 'fatsawtooth',
            frequency: droneConfig.base.frequency,
            volume: droneConfig.base.volume,
            filterFreq: droneConfig.base.filterFreq,
            filterQ: droneConfig.base.filterQ,
            attack: droneConfig.base.attack,
            release: droneConfig.base.release,
            spread: 20,
            count: 3
        });
        
        // MID DRONE - Harmonic richness
        this.drones.mid = this.createDroneLayer({
            name: 'mid',
            type: 'fatsine',
            frequency: droneConfig.mid.frequency,
            volume: droneConfig.mid.volume,
            filterFreq: droneConfig.mid.filterFreq,
            filterQ: droneConfig.mid.filterQ,
            attack: droneConfig.mid.attack,
            release: droneConfig.mid.release,
            spread: 15,
            count: 4
        });
        
        // HIGH DRONE - Shimmer and air
        this.drones.high = this.createDroneLayer({
            name: 'high',
            type: 'sine',
            frequency: droneConfig.high.frequency,
            volume: droneConfig.high.volume,
            filterFreq: droneConfig.high.filterFreq,
            filterQ: droneConfig.high.filterQ,
            attack: droneConfig.high.attack,
            release: droneConfig.high.release,
            spread: 10,
            count: 5
        });
        
        // PAD DRONE - Smooth background texture
        this.drones.pad = this.createDroneLayer({
            name: 'pad',
            type: 'triangle',
            frequency: 82.41, // E2
            volume: -18,
            filterFreq: 600,
            filterQ: 1,
            attack: 5,
            release: 10,
            spread: 25,
            count: 2
        });
        
        console.log('AudioEngine: Drone layers created');
    }
    
    createDroneLayer(config) {
        // Create synth with oscillator type
        const synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: config.type,
                spread: config.spread,
                count: config.count
            }
        });
        
        // Envelope
        synth.set({
            envelope: {
                attack: config.attack,
                decay: 0.5,
                sustain: 1,
                release: config.release
            }
        });
        
        // Filter
        const filter = new Tone.Filter({
            type: 'lowpass',
            frequency: config.filterFreq,
            Q: config.filterQ
        });
        
        // Layer-specific gain
        const gain = new Tone.Gain(Tone.dbToGain(config.volume));
        
        // Auto-panner for stereo width
        const panner = new Tone.AutoPanner({
            frequency: Utils.random(0.05, 0.15),
            depth: 0.3
        }).start();
        
        // Connect chain
        synth.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(this.effectsInput);
        gain.connect(this.dryGain);
        
        return {
            synth,
            filter,
            gain,
            panner,
            frequency: config.frequency,
            volume: config.volume,
            isPlaying: false
        };
    }
    
    // Create additional ambient texture layers for richer soundscape
    createAmbientLayers() {
        this.ambientLayers = {};
        
        // Sub-bass rumble - very low, felt more than heard
        this.ambientLayers.subBass = new Tone.Oscillator({
            type: 'sine',
            frequency: 32  // Very low
        });
        const subFilter = new Tone.Filter({ type: 'lowpass', frequency: 50 });
        const subGain = new Tone.Gain(Tone.dbToGain(-28));  // Reduced
        this.ambientLayers.subBass.connect(subFilter);
        subFilter.connect(subGain);
        subGain.connect(this.masterFilter);
        
        // Breath layer - slow filtered noise like breathing
        this.ambientLayers.breath = new Tone.Noise('pink');
        const breathFilter = new Tone.Filter({ type: 'bandpass', frequency: 350, Q: 1.5 });
        const breathLFO = new Tone.LFO({ frequency: 0.06, min: 200, max: 500 }).start();
        breathLFO.connect(breathFilter.frequency);
        const breathGain = new Tone.Gain(Tone.dbToGain(-32));  // Reduced
        const breathEnvLFO = new Tone.LFO({ frequency: 0.04, min: 0, max: 0.35 }).start();
        this.ambientLayers.breath.connect(breathFilter);
        breathFilter.connect(breathGain);
        breathEnvLFO.connect(breathGain.gain);
        breathGain.connect(this.effects.reverb);
        
        // Shimmer pad - high harmonics that slowly evolve
        this.ambientLayers.shimmerPad = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 6, decay: 3, sustain: 0.7, release: 10 }
        });
        const shimmerFilter = new Tone.Filter({ type: 'highpass', frequency: 2500 });
        const shimmerChorus = new Tone.Chorus({ frequency: 0.2, depth: 0.9, wet: 0.7 }).start();
        const shimmerGain = new Tone.Gain(Tone.dbToGain(-28));  // Reduced
        this.ambientLayers.shimmerPad.connect(shimmerFilter);
        shimmerFilter.connect(shimmerChorus);
        shimmerChorus.connect(shimmerGain);
        shimmerGain.connect(this.effects.reverb);
        
        // === NEW: Glitter/sparkle texture - gentle high frequency sparkles ===
        this.ambientLayers.glitter = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 1.5 }
        });
        const glitterFilter = new Tone.Filter({ type: 'highpass', frequency: 3000, Q: 0.5 });
        const glitterDelay = new Tone.PingPongDelay({ delayTime: 0.25, feedback: 0.4, wet: 0.5 });
        const glitterReverb = new Tone.Reverb({ decay: 4, wet: 0.8 });
        const glitterGain = new Tone.Gain(Tone.dbToGain(-34));
        this.ambientLayers.glitter.connect(glitterFilter);
        glitterFilter.connect(glitterDelay);
        glitterDelay.connect(glitterReverb);
        glitterReverb.connect(glitterGain);
        glitterGain.connect(this.masterFilter);
        
        // === NEW: Melodic pad - slow evolving chords ===
        this.ambientLayers.melodicPad = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 8, decay: 4, sustain: 0.6, release: 12 }
        });
        const melodicFilter = new Tone.Filter({ type: 'lowpass', frequency: 1200, Q: 0.7 });
        const melodicChorus = new Tone.Chorus({ frequency: 0.15, depth: 0.5, wet: 0.4 }).start();
        const melodicReverb = new Tone.Reverb({ decay: 6, wet: 0.7 });
        const melodicGain = new Tone.Gain(Tone.dbToGain(-26));
        this.ambientLayers.melodicPad.connect(melodicFilter);
        melodicFilter.connect(melodicChorus);
        melodicChorus.connect(melodicReverb);
        melodicReverb.connect(melodicGain);
        melodicGain.connect(this.masterFilter);
        
        // === NEW: Texture layer - gentle granular-like filtered noise ===
        this.ambientLayers.texture = new Tone.Noise('white');
        const textureFilter = new Tone.Filter({ type: 'bandpass', frequency: 800, Q: 8 });
        const textureFilterLFO = new Tone.LFO({ frequency: 0.03, min: 400, max: 2000 }).start();
        textureFilterLFO.connect(textureFilter.frequency);
        const textureGain = new Tone.Gain(Tone.dbToGain(-42));
        const textureEnvLFO = new Tone.LFO({ frequency: 0.02, min: 0, max: 0.2 }).start();
        this.ambientLayers.texture.connect(textureFilter);
        textureFilter.connect(textureGain);
        textureEnvLFO.connect(textureGain.gain);
        textureGain.connect(this.effects.reverb);
        
        // Store references for control
        this.ambientLayers.subFilter = subFilter;
        this.ambientLayers.subGain = subGain;
        this.ambientLayers.breathFilter = breathFilter;
        this.ambientLayers.breathGain = breathGain;
        this.ambientLayers.shimmerFilter = shimmerFilter;
        this.ambientLayers.shimmerGain = shimmerGain;
        this.ambientLayers.glitterGain = glitterGain;
        this.ambientLayers.glitterDelay = glitterDelay;
        this.ambientLayers.melodicFilter = melodicFilter;
        this.ambientLayers.melodicGain = melodicGain;
        this.ambientLayers.textureGain = textureGain;
        this.ambientLayers.textureFilter = textureFilter;
        
        // Initialize glitter and melodic note scheduling
        this.glitterScheduled = false;
        this.melodicScheduled = false;
        
        console.log('AudioEngine: Ambient layers created (with glitter, melodic pad, and texture)');
    }
    
    // Start slow evolution of all sound parameters
    // More pronounced changes over time
    startEvolution() {
        this.evolutionInterval = setInterval(() => {
            if (!this.isPlaying) return;
            
            this.evolutionTime += 0.1;
            
            // Slowly evolve drone pitches (micro-detuning) - MORE noticeable
            Object.values(this.drones).forEach((drone, i) => {
                if (drone.synth && drone.isPlaying) {
                    const detune = Math.sin(this.evolutionTime * 0.08 + i) * 12 + 
                                  Math.sin(this.evolutionTime * 0.05 + i * 2) * 8 +
                                  Math.sin(this.evolutionTime * 0.03) * 5;
                    drone.synth.set({ detune });
                    
                    // Also evolve filter cutoff for each drone
                    if (drone.filter) {
                        const baseFreq = drone.filter.frequency.value || 800;
                        const freqMod = Math.sin(this.evolutionTime * 0.04 + i * 0.5) * 300;
                        drone.filter.frequency.rampTo(Math.max(200, baseFreq + freqMod), 2);
                    }
                }
            });
            
            // Slowly evolve ambient layer volumes - creates breathing texture
            if (this.ambientLayers?.breathGain) {
                const breathVol = Tone.dbToGain(-26 + Math.sin(this.evolutionTime * 0.06) * 6);
                this.ambientLayers.breathGain.gain.rampTo(breathVol, 3);
            }
            
            if (this.ambientLayers?.shimmerGain) {
                const shimmerVol = Tone.dbToGain(-22 + Math.sin(this.evolutionTime * 0.04 + 1) * 8);
                this.ambientLayers.shimmerGain.gain.rampTo(shimmerVol, 4);
            }
            
            if (this.ambientLayers?.subGain) {
                const subVol = Tone.dbToGain(-20 + Math.sin(this.evolutionTime * 0.025) * 5);
                this.ambientLayers.subGain.gain.rampTo(subVol, 5);
            }
            
            // Slowly evolve filter frequencies - more range
            if (this.ambientLayers?.breathFilter) {
                const breathFreq = 350 + Math.sin(this.evolutionTime * 0.06) * 200 +
                                  Math.sin(this.evolutionTime * 0.09) * 100;
                this.ambientLayers.breathFilter.frequency.rampTo(breathFreq, 2);
            }
            
            // Evolve new ambient layers
            if (this.ambientLayers?.melodicGain) {
                const melodicVol = Tone.dbToGain(-24 + Math.sin(this.evolutionTime * 0.025 + 2) * 6);
                this.ambientLayers.melodicGain.gain.rampTo(melodicVol, 5);
            }
            
            if (this.ambientLayers?.melodicFilter) {
                const melodicFreq = 1000 + Math.sin(this.evolutionTime * 0.03) * 400;
                this.ambientLayers.melodicFilter.frequency.rampTo(melodicFreq, 3);
            }
            
            if (this.ambientLayers?.glitterGain) {
                const glitterVol = Tone.dbToGain(-32 + Math.sin(this.evolutionTime * 0.08) * 8);
                this.ambientLayers.glitterGain.gain.rampTo(glitterVol, 2);
            }
            
            if (this.ambientLayers?.textureGain) {
                const textureVol = Tone.dbToGain(-40 + Math.sin(this.evolutionTime * 0.04 + 3) * 10);
                this.ambientLayers.textureGain.gain.rampTo(textureVol, 4);
            }
            
            // Evolve glitter delay feedback for rhythmic interest
            if (this.ambientLayers?.glitterDelay) {
                const delayFeedback = 0.3 + Math.sin(this.evolutionTime * 0.05) * 0.2;
                this.ambientLayers.glitterDelay.feedback.rampTo(delayFeedback, 2);
            }
            
            // Note: Effect parameters (chorus, phaser, delay, reverb) are now controlled by sliders
            // Automatic evolution is disabled to allow manual control
            // The effects wet/dry levels are still controlled by state via modulateFromState
            
            // Granular parameters evolution - disabled when sliders are available
            // Sliders provide direct control over grain size, playback rate, etc.
            // Only evolve loop position which has no slider
            if (this.granularLayers) {
                Object.values(this.granularLayers).forEach((layer, i) => {
                    if (layer.player && layer.player.buffer?.duration) {
                        // Slowly shift loop position (no slider for this)
                        const loopStart = (Math.sin(this.evolutionTime * 0.015 + i * 0.5) * 0.5 + 0.5) * 
                                        (layer.player.buffer.duration * 0.8);
                        layer.player.loopStart = loopStart;
                    }
                });
            }
            
            // Evolve mic effects if connected
            if (this.micEffects?.filter) {
                const micFilterFreq = 1200 + Math.sin(this.evolutionTime * 0.07) * 600;
                this.micEffects.filter.frequency.rampTo(micFilterFreq, 2);
            }
            this.updateMicDelayEvolution();
            
        }, 100);  // Update every 100ms for smooth evolution
    }

    updateMicDelayEvolution() {
        if (!this.micEffects?.delay || !this.micEffects?.delay2) return;
        
        const inputBoost = Math.min(
            1,
            (this.lastMicInput?.volume || 0) * 2 +
            (this.lastAudioState?.audioDelay || 0) * 0.6 +
            (this.lastAudioState?.audioReverb || 0) * 0.3
        );
        
        if (!this.micDelayEvolution) {
            const feedbackBase = this.micDelayParams.feedback ?? 0.6;
            this.micDelayEvolution = {
                nextChangeAt: this.evolutionTime + 10 + Math.random() * 50,
                targetTime: this.micDelayParams.time,
                targetTime2: this.micDelayParams.time2,
                currentTime: this.micDelayParams.time,
                currentTime2: this.micDelayParams.time2,
                targetPitch: this.micDelayParams.pitch,
                currentPitch: this.micDelayParams.pitch,
                targetFeedback: feedbackBase,
                currentFeedback: feedbackBase,
                targetFeedback2: feedbackBase * 0.85,
                currentFeedback2: feedbackBase * 0.85
            };
        }
        
        if (this.evolutionTime >= this.micDelayEvolution.nextChangeAt) {
            const driftScale = this.micDelayParams.drift * (0.6 + inputBoost);
            const pitchDriftScale = this.micDelayParams.pitchDrift * (0.6 + inputBoost);
            const stretchScale = this.micDelayParams.stretch * (0.5 + inputBoost);
            const scatterScale = this.micDelayParams.scatter * (0.5 + inputBoost);
            const feedbackScale = this.micDelayParams.feedbackDrift * (0.5 + inputBoost);
            
            const stretchRange = 0.65 * stretchScale;
            const stretchFactor = Utils.clamp(
                1 + Utils.random(-stretchRange, stretchRange),
                0.3,
                3.0
            );
            
            const scatterRange = 0.6 * scatterScale;
            const scatterOffset = Utils.random(-scatterRange, scatterRange);
            
            const timeOffset = Math.max(0.05, this.micDelayParams.time * 0.6) * driftScale;
            const timeOffset2 = Math.max(0.05, this.micDelayParams.time2 * 0.6) * driftScale;
            
            const baseTime = this.micDelayParams.time * stretchFactor;
            const baseTime2 = this.micDelayParams.time2 * stretchFactor;
            
            this.micDelayEvolution.targetTime = Utils.clamp(
                baseTime + Utils.random(-timeOffset, timeOffset),
                0.05,
                this.micDelayMaxTime
            );
            
            const scatteredTime2 = baseTime2 * (1 + scatterOffset);
            const blendedTime2 = Utils.lerp(baseTime2, scatteredTime2, scatterScale);
            this.micDelayEvolution.targetTime2 = Utils.clamp(
                blendedTime2 + Utils.random(-timeOffset2, timeOffset2),
                0.05,
                this.micDelayMaxTime2
            );
            
            const pitchOffset = 1200 * pitchDriftScale;
            this.micDelayEvolution.targetPitch = this.micDelayParams.pitch +
                Utils.random(-pitchOffset, pitchOffset);
            
            const feedbackBase = this.micDelayParams.feedback ?? 0.6;
            const feedbackOffset = 0.25 * feedbackScale;
            const targetFeedback = Utils.clamp(
                feedbackBase + Utils.random(-feedbackOffset, feedbackOffset),
                0.05,
                0.95
            );
            const feedbackSpread = 0.12 * scatterScale;
            
            this.micDelayEvolution.targetFeedback = targetFeedback;
            this.micDelayEvolution.targetFeedback2 = Utils.clamp(
                targetFeedback * (0.85 + Utils.random(-feedbackSpread, feedbackSpread)),
                0.05,
                0.95
            );
            
            this.micDelayEvolution.nextChangeAt = this.evolutionTime + 10 + Math.random() * 50;
        }
        
        const follow = 0.01;
        this.micDelayEvolution.currentTime +=
            (this.micDelayEvolution.targetTime - this.micDelayEvolution.currentTime) * follow;
        this.micDelayEvolution.currentTime2 +=
            (this.micDelayEvolution.targetTime2 - this.micDelayEvolution.currentTime2) * follow;
        this.micDelayEvolution.currentPitch +=
            (this.micDelayEvolution.targetPitch - this.micDelayEvolution.currentPitch) * follow;
        this.micDelayEvolution.currentFeedback +=
            (this.micDelayEvolution.targetFeedback - this.micDelayEvolution.currentFeedback) * follow;
        this.micDelayEvolution.currentFeedback2 +=
            (this.micDelayEvolution.targetFeedback2 - this.micDelayEvolution.currentFeedback2) * follow;
        
        const modBoost = 0.6 + inputBoost * 0.6;
        const wowAmount = this.micDelayParams.wow * modBoost;
        const flutterAmount = (this.micDelayParams.flutter ?? 0) * modBoost;
        
        const wow1 = Math.sin(this.evolutionTime * 0.6 + 1.3) * 0.08 * wowAmount;
        const wow2 = Math.sin(this.evolutionTime * 0.53 + 2.1) * 0.1 * wowAmount;
        const flutterRate = 1.4 + flutterAmount * 2.2;
        const flutter1 = Math.sin(this.evolutionTime * flutterRate + 0.9) * 0.035 * flutterAmount;
        const flutter2 = Math.sin(this.evolutionTime * (flutterRate * 1.15) + 2.4) * 0.04 * flutterAmount;
        
        const delayTime = Utils.clamp(
            this.micDelayEvolution.currentTime + wow1 + flutter1,
            0.05,
            this.micDelayMaxTime
        );
        const delayTime2 = Utils.clamp(
            this.micDelayEvolution.currentTime2 + wow2 + flutter2,
            0.05,
            this.micDelayMaxTime2
        );
        
        this.micEffects.delay.delayTime.rampTo(delayTime, 0.5);
        this.micEffects.delay2.delayTime.rampTo(delayTime2, 0.5);
        
        const reactiveBoost = (this.lastMicInput?.volume || 0) * 0.12;
        const feedback1 = Utils.clamp(this.micDelayEvolution.currentFeedback + reactiveBoost, 0.05, 0.95);
        const feedback2 = Utils.clamp(this.micDelayEvolution.currentFeedback2 + reactiveBoost * 0.85, 0.05, 0.95);
        
        this.micEffects.delay.feedback.rampTo(feedback1, 0.25);
        this.micEffects.delay2.feedback.rampTo(feedback2, 0.25);
        
        if (this.micEffects.pitchShift) {
            const pitchFlutter = (this.micDelayParams.pitchFlutter ?? 0) * modBoost;
            const flutterCents = Math.sin(this.evolutionTime * (0.9 + pitchFlutter * 2.4) + 0.4) *
                90 * pitchFlutter;
            const semitones = (this.micDelayEvolution.currentPitch + flutterCents) / 100;
            this.micEffects.pitchShift.pitch = semitones;
        }
    }
    
    createLFOs() {
        // Very slow LFO for overall modulation
        this.lfos.slow = new Tone.LFO({
            frequency: 0.02,
            min: 0,
            max: 1
        }).start();
        
        // Medium LFO for filter movement
        this.lfos.medium = new Tone.LFO({
            frequency: 0.1,
            min: 0,
            max: 1
        }).start();
        
        // Fast LFO for subtle vibrato
        this.lfos.fast = new Tone.LFO({
            frequency: 0.5,
            min: -10,
            max: 10
        }).start();
        
        // Connect slow LFO to master filter
        this.lfos.slow.connect(new Tone.ScaleExp(0, 1, 2)
            .connect(new Tone.Scale(4000, 12000)
            .connect(this.masterFilter.frequency)));
        
        console.log('AudioEngine: LFOs created');
    }
    
    // =========================================
    // GRANULAR SYNTHESIS
    // =========================================
    
    async createSyntheticBuffer() {
        // Create a synthetic buffer with harmonic content for granular
        // This ensures granular works even without mic
        const duration = 4;
        const sampleRate = Tone.context.sampleRate;
        const buffer = Tone.context.createBuffer(2, duration * sampleRate, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < data.length; i++) {
                const t = i / sampleRate;
                // Create rich harmonic content
                let sample = 0;
                // Fundamental and harmonics
                sample += Math.sin(2 * Math.PI * 110 * t) * 0.3;
                sample += Math.sin(2 * Math.PI * 165 * t) * 0.2; // Fifth
                sample += Math.sin(2 * Math.PI * 220 * t) * 0.15; // Octave
                sample += Math.sin(2 * Math.PI * 330 * t) * 0.1; // Twelfth
                // Add some noise texture
                sample += (Math.random() * 2 - 1) * 0.05;
                // Apply envelope to create interesting texture
                const env = Math.sin(Math.PI * (i / data.length));
                // Add some amplitude modulation
                const am = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t);
                data[i] = sample * env * am * 0.5;
            }
        }
        
        const toneBuffer = new Tone.ToneAudioBuffer(buffer);
        await this.setupGranular(toneBuffer);
        console.log('AudioEngine: Synthetic granular buffer created');
    }
    
    async setupGranular(audioBuffer) {
        if (!audioBuffer) {
            console.warn('AudioEngine: No audio buffer for granular synthesis');
            return;
        }
        
        // Convert to ToneAudioBuffer if needed
        let toneBuffer;
        if (audioBuffer instanceof Tone.ToneAudioBuffer) {
            toneBuffer = audioBuffer;
        } else if (audioBuffer instanceof AudioBuffer) {
            toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
        } else {
            // Assume it's already compatible
            toneBuffer = audioBuffer;
        }
        
        // Create multiple granular layers with different characteristics
        this.granularLayers = {};
        
        // Layer 1: Slow, stretched grains with lots of reverb
        this.granularLayers.ambient = this.createGranularLayer({
            buffer: toneBuffer,
            grainSize: 0.4,
            overlap: 0.3,
            playbackRate: 0.5,
            volume: -18,
            filterFreq: 800,
            filterQ: 1,
            reverbWet: 0.8,
            delayWet: 0.5,
            delayTime: 0.5
        });
        
        // Layer 2: Textural layer - gentle variations instead of choppy
        this.granularLayers.choppy = this.createGranularLayer({
            buffer: toneBuffer,
            grainSize: 0.25,       // Much larger grains - no clicks
            overlap: 0.15,         // More overlap for smoothness
            playbackRate: 0.8,     // Slightly slower
            volume: -24,           // Quieter
            filterFreq: 1800,
            filterQ: 1,            // Lower Q = smoother
            reverbWet: 0.7,        // More reverb
            delayWet: 0.6,
            delayTime: 0.2
        });
        
        // Layer 3: Soft shimmer - no harsh high frequencies
        this.granularLayers.shimmer = this.createGranularLayer({
            buffer: toneBuffer,
            grainSize: 0.3,        // Larger grains
            overlap: 0.2,          // Good overlap
            playbackRate: 1.5,     // Less extreme pitch
            volume: -28,           // Quieter
            filterFreq: 3000,      // Lower cutoff
            filterQ: 0.3,          // Very smooth
            reverbWet: 0.9,
            delayWet: 0.5,
            delayTime: 0.4
        });
        
        // Layer 4: Deep, slow grains
        this.granularLayers.deep = this.createGranularLayer({
            buffer: toneBuffer,
            grainSize: 0.6,
            overlap: 0.4,
            playbackRate: 0.25,
            volume: -20,
            filterFreq: 400,
            filterQ: 3,
            reverbWet: 0.7,
            delayWet: 0.6,
            delayTime: 0.75
        });
        
        console.log('AudioEngine: Granular layers created');
    }
    
    createGranularLayer(config) {
        // Create GrainPlayer - use buffer property for ToneAudioBuffer, not url
        const player = new Tone.GrainPlayer({
            grainSize: config.grainSize,
            overlap: config.overlap,
            playbackRate: config.playbackRate,
            loop: true,
            loopStart: 0,
            loopEnd: config.buffer?.duration || 4
        });
        
        // Set buffer directly (not via url which expects a string)
        if (config.buffer) {
            player.buffer = config.buffer;
        }
        
        // Filter for each layer
        const filter = new Tone.Filter({
            type: 'bandpass',
            frequency: config.filterFreq,
            Q: config.filterQ
        });
        
        // Layer-specific delay
        const delay = new Tone.FeedbackDelay({
            delayTime: config.delayTime,
            feedback: 0.4,
            wet: config.delayWet
        });
        
        // Layer-specific reverb
        const reverb = new Tone.Reverb({
            decay: 4 + Math.random() * 4,
            wet: config.reverbWet
        });
        
        // Gain
        const gain = new Tone.Gain(Tone.dbToGain(config.volume));
        
        // Panner for stereo spread
        const panner = new Tone.Panner(Math.random() * 2 - 1);
        
        // Connect chain: player -> filter -> delay -> reverb -> panner -> gain -> master
        player.connect(filter);
        filter.connect(delay);
        delay.connect(reverb);
        reverb.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterFilter);
        
        return {
            player,
            filter,
            delay,
            reverb,
            gain,
            panner,
            config
        };
    }
    
    // =========================================
    // MICROPHONE INPUT PROCESSING
    // =========================================
    
    async connectMicrophone(stream) {
        if (!this.isInitialized) {
            await this.init();
        }
        
        try {
            // Create mic input
            this.micInput = Tone.getContext().createMediaStreamSource(stream);
            
            // Create Tone.js-compatible gain
            this.micGain = new Tone.Gain(CONFIG.audio.mic.gain);
            
            // Connect mic to Tone.js
            Tone.connect(this.micInput, this.micGain);
            
            // Create mic processing chain for reactive sound
            this.setupMicProcessing();
            
            console.log('AudioEngine: Microphone connected');
            
            // Start recording buffer for granular
            this.startMicRecording(stream);
            
        } catch (error) {
            console.error('AudioEngine: Failed to connect microphone:', error);
        }
    }
    
    setupMicProcessing() {
        // Mic analyzer for level detection
        this.micAnalyzer = new Tone.Analyser('waveform', 256);
        this.micGain.connect(this.micAnalyzer);
        
        // Mic effects chain - for clear, audible processed mic sound
        this.micEffects = {};
        
        // Reverb for mic - longer decay, moderate wet for ambience
        this.micEffects.reverb = new Tone.Reverb({
            decay: 8,        // Longer reverb tail
            preDelay: 0.05,  // Slight pre-delay for clarity
            wet: 1.0         // Wet only
        });
        
        // Delay for mic - creates evolving echoes
        this.micEffects.delay = new Tone.FeedbackDelay({
            delayTime: this.micDelayParams.time,
            feedback: this.micDelayParams.feedback,      // More feedback for evolving echoes
            maxDelay: this.micDelayMaxTime,
            wet: 1.0
        });
        
        // Second delay for stereo interest
        this.micEffects.delay2 = new Tone.FeedbackDelay({
            delayTime: this.micDelayParams.time2,
            feedback: this.micDelayParams.feedback * 0.85,
            maxDelay: this.micDelayMaxTime2,
            wet: 1.0
        });

        // Pitch shift for warped feedback tails
        this.micEffects.pitchShift = new Tone.PitchShift({
            pitch: 0
        });
        
        // Filter to shape mic input - lowpass to smooth harsh frequencies
        this.micEffects.filter = new Tone.Filter({
            type: 'lowpass',
            frequency: 3000,
            Q: 0.5  // Smooth
        });
        
        // Soft compressor to even out levels
        this.micEffects.compressor = new Tone.Compressor({
            threshold: -20,
            ratio: 4,
            attack: 0.1,
            release: 0.3
        });
        
        // Gain for mic processing
        this.micEffectsGain = new Tone.Gain(0.5);
        
        // Connect mic -> compressor -> filter -> delays -> pitch shift -> reverb -> gain -> master
        this.micGain.connect(this.micEffects.compressor);
        this.micEffects.compressor.connect(this.micEffects.filter);
        this.micEffects.filter.connect(this.micEffects.delay);
        this.micEffects.filter.connect(this.micEffects.delay2);  // Parallel delays
        this.micEffects.delay.connect(this.micEffects.pitchShift);
        this.micEffects.delay2.connect(this.micEffects.pitchShift);
        this.micEffects.pitchShift.connect(this.micEffects.reverb);
        this.micEffects.reverb.connect(this.micEffectsGain);
        this.micEffectsGain.connect(this.masterFilter);
        
        console.log('AudioEngine: Mic processing chain created with reverb and delay');
    }
    
    // Handle real-time mic input for sound modulation
    handleMicInput(audioData) {
        if (!this.isPlaying || !this.micEffects) return;
        
        const { volume, bass, mid, treble } = audioData;
        this.lastMicInput = audioData;
        
        // Modulate mic effects based on input level
        // Higher volume = wider chorus
        if (this.micEffects.chorus) {
            this.micEffects.chorus.depth = 0.3 + volume * 0.5;
        }
        
        // Filter follows frequency content - slower ramp
        if (this.micEffects.filter) {
            const freq = 500 + bass * 500 + mid * 1000 + treble * 2000;
            this.micEffects.filter.frequency.rampTo(freq, 0.5);  // Slower = smoother
        }
        
        // Modulate granular layers based on mic input - GENTLE modulation only
        if (this.granularLayers) {
            // Bass triggers deep layer - volume only, no grain size changes
            if (this.granularLayers.deep) {
                this.granularLayers.deep.gain.gain.rampTo(
                    Tone.dbToGain(-22 + bass * 6), 0.5  // Slower ramp, less range
                );
            }
            
            // Mid triggers textural layer - volume only
            if (this.granularLayers.choppy) {
                this.granularLayers.choppy.gain.gain.rampTo(
                    Tone.dbToGain(-26 + mid * 6), 0.5  // Slower, gentler
                );
            }
            
            // Treble triggers shimmer - volume only, no grain changes
            if (this.granularLayers.shimmer) {
                this.granularLayers.shimmer.gain.gain.rampTo(
                    Tone.dbToGain(-30 + treble * 8), 0.5  // Slower, quieter base
                );
            }
            
            // Overall volume affects ambient layer
            if (this.granularLayers.ambient) {
                this.granularLayers.ambient.gain.gain.rampTo(
                    Tone.dbToGain(-20 + volume * 6), 0.5  // Slower ramp
                );
            }
        }
        
        // === MIC LOOP CAPTURE SYSTEM ===
        // Detect significant sound and capture loops when new sounds come in
        this.lastMicLevel = volume;
        const now = Date.now();
        
        // Capture new loop when:
        // 1. Sound is above threshold
        // 2. Enough time has passed since last capture
        // 3. Not currently capturing
        if (volume > this.soundThreshold && 
            now - this.lastLoopCaptureTime > this.loopCaptureInterval &&
            !this.isCapturingLoop) {
            this.captureNewMicLoop();
        }
    }
    
    // Capture a new mic loop to use in granular synthesis
    async captureNewMicLoop() {
        if (!this.micGain || this.isCapturingLoop) return;
        
        this.isCapturingLoop = true;
        this.lastLoopCaptureTime = Date.now();
        
        console.log('AudioEngine: Capturing new mic loop...');
        
        try {
            const recorder = new Tone.Recorder();
            this.micGain.connect(recorder);
            await recorder.start();
            
            // Record for 6-10 seconds - longer loops for more recognizable sound
            const duration = 6000 + Math.random() * 4000;
            
            setTimeout(async () => {
                try {
                    const recording = await recorder.stop();
                    
                    // Disconnect and dispose recorder
                    try {
                        this.micGain.disconnect(recorder);
                        recorder.dispose();
                    } catch (e) {}
                    
                    const arrayBuffer = await recording.arrayBuffer();
                    const audioBuffer = await Tone.getContext().decodeAudioData(arrayBuffer);
                    const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
                    
                    // Store this loop
                    this.micLoops[this.currentLoopIndex] = toneBuffer;
                    this.currentLoopIndex = (this.currentLoopIndex + 1) % this.maxMicLoops;
                    
                    // Randomly assign this new buffer to one of the granular layers
                    if (this.granularLayers) {
                        const layers = Object.keys(this.granularLayers);
                        const randomLayer = layers[Math.floor(Math.random() * layers.length)];
                        const layer = this.granularLayers[randomLayer];
                        
                        if (layer?.player && toneBuffer?.duration > 0) {
                            // Crossfade to new buffer (ramp down, switch, ramp up) - slower for smoothness
                            const originalGain = layer.gain.gain.value;
                            layer.gain.gain.rampTo(0, 1.0);  // 1 second fade out
                            
                            setTimeout(() => {
                                try {
                                    layer.player.buffer = toneBuffer;
                                    layer.player.loopEnd = toneBuffer.duration;
                                    layer.gain.gain.rampTo(originalGain, 1.0);  // 1 second fade in
                                    console.log(`AudioEngine: Mic loop assigned to ${randomLayer} (${toneBuffer.duration.toFixed(1)}s)`);
                                } catch (e) {
                                    console.warn('AudioEngine: Failed to assign buffer:', e);
                                }
                            }, 1100);  // Wait for fade out
                        }
                    }
                    
                    console.log('AudioEngine: New mic loop captured');
                } catch (e) {
                    console.warn('AudioEngine: Failed to process mic loop:', e);
                }
                
                this.isCapturingLoop = false;
            }, duration);
            
        } catch (e) {
            console.warn('AudioEngine: Failed to start mic loop capture:', e);
            this.isCapturingLoop = false;
        }
    }
    
    async startMicRecording(stream) {
        // Record initial buffer for granular synthesis
        const recorder = new Tone.Recorder();
        this.micGain.connect(recorder);
        
        // Record for 8 seconds - longer initial recording for richer source material
        await recorder.start();
        
        setTimeout(async () => {
            try {
                const recording = await recorder.stop();
                
                // Disconnect recorder to prevent audio routing issues
                this.micGain.disconnect(recorder);
                recorder.dispose();
                
                // Convert to audio buffer
                const arrayBuffer = await recording.arrayBuffer();
                const audioBuffer = await Tone.getContext().decodeAudioData(arrayBuffer);
                
                // Convert to ToneAudioBuffer
                const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
                
                // Set up granular with the recorded buffer
                await this.setupGranular(toneBuffer);
                
                // Start granular layers
                this.startGranularLayers();
                
                console.log('AudioEngine: Initial mic recording captured for granular (8s)');
                
                // Store as first mic loop
                this.micLoops[0] = toneBuffer;
                this.currentLoopIndex = 1;
            } catch (e) {
                console.warn('AudioEngine: Failed to process initial mic recording:', e);
            }
        }, 8000);
    }
    
    startGranularLayers() {
        if (!this.granularLayers) return;
        
        Object.keys(this.granularLayers).forEach(key => {
            const layer = this.granularLayers[key];
            if (layer && layer.player) {
                try {
                    // Only start if buffer is loaded and has duration
                    if (layer.player.buffer && layer.player.buffer.duration > 0) {
                        if (layer.player.state !== 'started') {
                            layer.player.start();
                            console.log(`AudioEngine: Started granular layer ${key}`);
                        }
                    } else {
                        console.warn(`AudioEngine: Granular layer ${key} has no valid buffer yet`);
                    }
                } catch (e) {
                    console.warn(`AudioEngine: Could not start granular layer ${key}:`, e);
                }
            }
        });
        
        console.log('AudioEngine: Granular layers started');
    }
    
    stopGranularLayers() {
        if (!this.granularLayers) return;
        
        Object.keys(this.granularLayers).forEach(key => {
            const layer = this.granularLayers[key];
            if (layer && layer.player) {
                try {
                    layer.player.stop();
                } catch (e) {
                    // Silent fail
                }
            }
        });
    }
    
    // =========================================
    // PLAYBACK CONTROL
    // =========================================
    
    start() {
        if (!this.isInitialized) {
            console.warn('AudioEngine: Not initialized');
            return;
        }
        
        console.log('AudioEngine: Starting playback...');
        
        // Fade up master gain from 0 over 3 seconds for smooth start
        const targetGain = this.unmutedGain || this.masterGain.gain.value || Tone.dbToGain(CONFIG.audio.masterVolume + 2);
        this.masterGain.gain.value = 0;
        this.masterGain.gain.rampTo(targetGain, 3.0);
        
        // Start each drone layer
        Object.keys(this.drones).forEach(key => {
            const drone = this.drones[key];
            if (drone && drone.synth) {
                // Play a sustained note
                const notes = this.getHarmonicNotes(drone.frequency);
                drone.synth.triggerAttack(notes);
                drone.isPlaying = true;
            }
        });
        
        // Start ambient layers
        this.startAmbientLayers();
        
        // Start granular layers (they have synthetic buffer by default)
        this.startGranularLayers();
        
        this.isPlaying = true;
        console.log('AudioEngine: Playback started with fade-up');
    }
    
    startAmbientLayers() {
        if (!this.ambientLayers) return;
        
        try {
            // Start sub bass
            if (this.ambientLayers.subBass) {
                this.ambientLayers.subBass.start();
            }
            
            // Start breath noise
            if (this.ambientLayers.breath) {
                this.ambientLayers.breath.start();
            }
            
            // Start texture noise
            if (this.ambientLayers.texture) {
                this.ambientLayers.texture.start();
            }
            
            // Start shimmer pad with evolving chord
            if (this.ambientLayers.shimmerPad) {
                // Play high ethereal notes
                const notes = ['C5', 'E5', 'G5', 'B5'];
                this.ambientLayers.shimmerPad.triggerAttack(notes);
            }
            
            // Start melodic pad with slow evolving chord
            if (this.ambientLayers.melodicPad) {
                const melodicNotes = ['E3', 'B3', 'D4', 'G4'];
                this.ambientLayers.melodicPad.triggerAttack(melodicNotes);
                this.startMelodicEvolution();
            }
            
            // Start glitter sparkle scheduling
            this.startGlitterScheduler();
            
            console.log('AudioEngine: Ambient layers started (with new atmospheric textures)');
        } catch (e) {
            console.warn('AudioEngine: Could not start ambient layers:', e);
        }
    }
    
    // Schedule random glitter sparkles
    startGlitterScheduler() {
        if (this.glitterInterval) clearInterval(this.glitterInterval);
        
        const glitterNotes = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'E7'];
        
        this.glitterInterval = setInterval(() => {
            if (!this.isPlaying || !this.ambientLayers?.glitter) return;
            
            // Random chance to play a sparkle (about every 2-5 seconds on average)
            if (Math.random() < 0.15) {
                const note = glitterNotes[Math.floor(Math.random() * glitterNotes.length)];
                const velocity = 0.1 + Math.random() * 0.2;  // Gentle velocity
                try {
                    this.ambientLayers.glitter.triggerAttackRelease(note, '4n', undefined, velocity);
                } catch(e) {}
            }
        }, 500);
    }
    
    // Slowly evolve the melodic pad chord
    startMelodicEvolution() {
        if (this.melodicEvolutionInterval) clearInterval(this.melodicEvolutionInterval);
        
        const chordProgressions = [
            ['E3', 'B3', 'D4', 'G4'],   // Em7
            ['A3', 'C4', 'E4', 'G4'],   // Am7
            ['D3', 'A3', 'C4', 'F4'],   // Dm7
            ['G3', 'B3', 'D4', 'F4'],   // G7
            ['C3', 'E3', 'G3', 'B3'],   // Cmaj7
            ['F3', 'A3', 'C4', 'E4'],   // Fmaj7
        ];
        
        let chordIndex = 0;
        
        this.melodicEvolutionInterval = setInterval(() => {
            if (!this.isPlaying || !this.ambientLayers?.melodicPad) return;
            
            try {
                // Slowly release current and start new chord
                this.ambientLayers.melodicPad.releaseAll();
                
                setTimeout(() => {
                    if (!this.isPlaying) return;
                    chordIndex = (chordIndex + 1) % chordProgressions.length;
                    this.ambientLayers.melodicPad.triggerAttack(chordProgressions[chordIndex]);
                }, 2000);
            } catch(e) {}
        }, 25000);  // Change chord every ~25 seconds
    }
    
    stopAmbientLayers() {
        if (!this.ambientLayers) return;
        
        try {
            if (this.ambientLayers.subBass) this.ambientLayers.subBass.stop();
            if (this.ambientLayers.breath) this.ambientLayers.breath.stop();
            if (this.ambientLayers.texture) this.ambientLayers.texture.stop();
            if (this.ambientLayers.shimmerPad) this.ambientLayers.shimmerPad.releaseAll();
            if (this.ambientLayers.melodicPad) this.ambientLayers.melodicPad.releaseAll();
            
            if (this.glitterInterval) clearInterval(this.glitterInterval);
            if (this.melodicEvolutionInterval) clearInterval(this.melodicEvolutionInterval);
        } catch (e) {}
    }
    
    stop() {
        console.log('AudioEngine: Stopping playback...');
        
        // Stop each drone layer
        Object.keys(this.drones).forEach(key => {
            const drone = this.drones[key];
            if (drone && drone.synth && drone.isPlaying) {
                drone.synth.triggerRelease();
                drone.isPlaying = false;
            }
        });
        
        // Stop ambient layers
        this.stopAmbientLayers();
        
        // Stop granular layers
        this.stopGranularLayers();
        
        // Clear buffer update interval
        if (this.bufferUpdateInterval) {
            clearInterval(this.bufferUpdateInterval);
        }
        
        // Clear evolution interval
        if (this.evolutionInterval) {
            clearInterval(this.evolutionInterval);
        }
        
        this.isPlaying = false;
        console.log('AudioEngine: Playback stopped');
    }
    
    getHarmonicNotes(baseFreq) {
        // Return base note plus harmonics for richer sound
        return [
            baseFreq,
            baseFreq * 1.5,    // Perfect fifth
            baseFreq * 2,      // Octave
        ];
    }
    
    // =========================================
    // MODULATION FROM STATE ENGINE
    // =========================================
    
    modulateFromState(audioState) {
        if (!this.isPlaying || !audioState) return;
        this.lastAudioState = audioState;
        
        // Master volume - only if not under manual control
        if (this.masterGain && !this.manualControl.masterVolume) {
            const targetDb = -20 + audioState.audioVolume * 15; // -20 to -5 dB range
            const targetGain = Tone.dbToGain(targetDb);
            if (this.isMuted) {
                this.unmutedGain = targetGain;
            } else {
                this.masterGain.gain.rampTo(targetGain, 0.3);
            }
        }
        
        // Drone volumes - map state 0-1 to full slider range (-40 to 0 dB)
        // Only apply if not under manual slider control
        if (this.drones.base && !this.manualControl.droneBaseVolume) {
            const baseDb = -40 + audioState.audioBass * 40; // 0→-40dB, 1→0dB
            this.drones.base.gain.gain.rampTo(Tone.dbToGain(baseDb), 0.3);
        }
        if (this.drones.mid && !this.manualControl.droneMidVolume) {
            const midDb = -40 + audioState.audioMid * 40;
            this.drones.mid.gain.gain.rampTo(Tone.dbToGain(midDb), 0.3);
        }
        if (this.drones.high && !this.manualControl.droneHighVolume) {
            const highDb = -40 + audioState.audioHigh * 40;
            this.drones.high.gain.gain.rampTo(Tone.dbToGain(highDb), 0.3);
        }
        
        // Filter frequencies (mapped from state) - match slider ranges
        // Only apply if not under manual slider control
        if (this.drones.base && !this.manualControl.droneBaseFilter) {
            const baseFreq = 50 + audioState.audioFilterBase * 950; // 50-1000 Hz
            this.drones.base.filter.frequency.rampTo(baseFreq, 0.5);
        }
        if (this.drones.mid && !this.manualControl.droneMidFilter) {
            const midFreq = 50 + audioState.audioFilterMid * 2450; // 50-2500 Hz
            this.drones.mid.filter.frequency.rampTo(midFreq, 0.5);
        }
        if (this.drones.high && !this.manualControl.droneHighFilter) {
            const highFreq = 800 + audioState.audioFilterHigh * 4000;
            this.drones.high.filter.frequency.rampTo(highFreq, 0.5);
        }
        
        // Effects wet/dry levels - only if not under manual control
        if (this.effects.reverb && !this.manualControl.masterReverb) {
            this.effects.reverb.wet.rampTo(0.05 + audioState.audioReverb * 0.25, 0.8);
        }
        if (this.effects.delay && !this.manualControl.masterDelay) {
            this.effects.delay.wet.rampTo(0.015 + audioState.audioDelay * 0.18, 0.8);
        }
        
        // Note: Chorus/phaser depth/rate are now controlled by sliders only (setGlobalEffect)
        // This allows users to dial in specific effect settings
        
        // Granular layer modulation from state
        // Note: Granular layer parameters are controlled directly by sliders
        // The automatic modulation is commented out to allow manual slider control
        // Uncomment below if you want automatic state-driven granular modulation
        /*
        if (this.granularLayers) {
            // Ambient layer responds to overall state
            if (this.granularLayers.ambient) {
                this.granularLayers.ambient.player.grainSize = 0.2 + audioState.audioGrain * 0.5;
                this.granularLayers.ambient.delay.wet.rampTo(0.3 + audioState.audioDelay * 0.4, 0.3);
            }
            
            // Choppy layer responds to modulation
            if (this.granularLayers.choppy) {
                this.granularLayers.choppy.player.grainSize = 0.03 + audioState.audioModulation * 0.1;
                this.granularLayers.choppy.player.playbackRate = 0.7 + audioState.audioModulation * 0.6;
            }
            
            // Shimmer responds to high frequencies
            if (this.granularLayers.shimmer) {
                this.granularLayers.shimmer.player.playbackRate = 1.5 + audioState.audioHigh * 1.0;
                this.granularLayers.shimmer.reverb.wet.rampTo(0.7 + audioState.audioReverb * 0.25, 0.4);
            }
            
            // Deep layer responds to bass
            if (this.granularLayers.deep) {
                this.granularLayers.deep.player.playbackRate = 0.2 + audioState.audioBass * 0.2;
                this.granularLayers.deep.filter.frequency.rampTo(200 + audioState.audioFilterBase * 400, 0.5);
            }
        }
        */
        
        // Mic effects wet/dry is controlled by sliders to keep dry at 0 by default
    }
    
    modulateFromAudio(audioData) {
        if (!this.isPlaying) return;
        
        const { volume, bass, mid, treble } = audioData;
        
        // Modulate filter frequencies based on input
        if (this.drones.base) {
            const baseFilterFreq = Utils.mapRange(bass, 0, 1, 100, 400);
            this.drones.base.filter.frequency.rampTo(baseFilterFreq, 0.1);
        }
        
        if (this.drones.mid) {
            const midFilterFreq = Utils.mapRange(mid, 0, 1, 400, 2000);
            this.drones.mid.filter.frequency.rampTo(midFilterFreq, 0.1);
        }
        
        if (this.drones.high) {
            const highFilterFreq = Utils.mapRange(treble, 0, 1, 1000, 8000);
            this.drones.high.filter.frequency.rampTo(highFilterFreq, 0.1);
        }
        
        // Modulate effect wet/dry based on volume
        this.effects.reverb.wet.rampTo(Utils.mapRange(volume, 0, 1, 0.3, 0.8), 0.2);
        this.effects.delay.wet.rampTo(Utils.mapRange(volume, 0, 1, 0.1, 0.5), 0.2);
        
        // Modulate granular parameters
        if (this.granularPlayers.main) {
            this.granularPlayers.main.grainSize = Utils.mapRange(bass, 0, 1, 0.05, 0.5);
            this.granularPlayers.main.playbackRate = Utils.mapRange(mid, 0, 1, 0.8, 1.2);
        }
    }
    
    modulateFromMotion(motionData) {
        if (!this.isPlaying) return;
        
        const { tiltX, tiltY, shake } = motionData;
        
        // Tilt affects stereo panning and filter
        if (this.drones.base) {
            this.drones.base.panner.depth = Utils.mapRange(Math.abs(tiltX), 0, 1, 0.1, 0.8);
        }
        
        // Shake adds distortion/chaos
        if (shake > 0.1) {
            this.effects.delay.feedback.rampTo(Utils.mapRange(shake, 0, 1, 0.3, 0.7), 0.05);
        }
    }
    
    // =========================================
    // PARAMETER CONTROL
    // =========================================
    
    setMasterVolume(db, rampTime = 0.1) {
        if (!this.masterGain) return;
        const gainValue = Tone.dbToGain(db);
        this.unmutedGain = gainValue;
        if (this.isMuted) return;
        this.masterGain.gain.rampTo(gainValue, rampTime);
    }

    setMuted(muted) {
        this.isMuted = muted;
        if (!this.masterGain) return;
        if (muted) {
            this.unmutedGain = this.masterGain.gain.value;
            this.masterGain.gain.rampTo(0, 0.2);
        } else {
            const restoreGain = this.unmutedGain ?? this.masterGain.gain.value;
            this.masterGain.gain.rampTo(restoreGain, 0.2);
        }
    }
    
    setDroneVolume(droneName, db, rampTime = 0.1) {
        if (this.drones[droneName]) {
            this.drones[droneName].gain.gain.rampTo(Tone.dbToGain(db), rampTime);
        }
    }
    
    setDroneFilter(droneName, frequency, rampTime = 0.2) {
        if (this.drones[droneName]) {
            this.drones[droneName].filter.frequency.rampTo(frequency, rampTime);
        }
    }
    
    setEffectWet(effectName, wet, rampTime = 0.1) {
        if (this.effects[effectName]) {
            this.effects[effectName].wet.rampTo(wet, rampTime);
        }
    }

    setHandDetune(cents) {
        const clamped = Utils.clamp(cents, -2400, 2400);
        this.handDetune = clamped;
        
        // Apply detune to different drones with varying amounts for rich harmonic movement
        const droneNames = ['base', 'mid', 'high', 'pad'];
        const detuneMultipliers = [1.0, 0.75, 1.25, 0.5];  // Different amounts for each drone
        
        droneNames.forEach((name, index) => {
            const drone = this.drones[name];
            if (drone && drone.synth && drone.isPlaying) {
                const droneDetune = clamped * detuneMultipliers[index];
                drone.synth.set({ detune: droneDetune });
            }
        });
        
        // Also affect shimmer pad
        if (this.ambientLayers?.shimmerPad) {
            this.ambientLayers.shimmerPad.set({ detune: clamped * 0.8 });
        }
    }
    
    // Per-hand sound control - pitch (cents) and shape (0-1 filter/character)
    applyHandSoundControl(soundName, pitchCents, shapeAmount) {
        if (!this.isPlaying) return;
        
        const clamped = Utils.clamp(pitchCents, -1200, 1200);  // ±1 octave range
        const shape = Utils.clamp(shapeAmount, 0, 1);
        
        // Different sounds have different controllable parameters
        switch (soundName) {
            case 'base':
                // Base drone - pitch + filter cutoff
                if (this.drones.base?.synth) {
                    this.drones.base.synth.set({ detune: clamped });
                }
                if (this.drones.base?.filter) {
                    const baseFreq = 200;
                    const freq = baseFreq * Math.pow(4, shape);  // 200Hz - 800Hz
                    this.drones.base.filter.frequency.rampTo(freq, 0.1);
                }
                break;
                
            case 'mid':
                // Mid drone - pitch + filter resonance
                if (this.drones.mid?.synth) {
                    this.drones.mid.synth.set({ detune: clamped });
                }
                if (this.drones.mid?.filter) {
                    const freq = 400 + shape * 1600;  // 400Hz - 2000Hz
                    this.drones.mid.filter.frequency.rampTo(freq, 0.1);
                    this.drones.mid.filter.Q.rampTo(1 + shape * 8, 0.1);  // More resonance at right
                }
                break;
                
            case 'high':
                // High drone - pitch + delay feedback
                if (this.drones.high?.synth) {
                    this.drones.high.synth.set({ detune: clamped });
                }
                if (this.effects.delay) {
                    this.effects.delay.feedback.rampTo(0.2 + shape * 0.5, 0.1);  // 0.2 - 0.7
                }
                break;
                
            case 'shimmer':
                // Shimmer pad - pitch + reverb wet
                if (this.ambientLayers?.shimmerPad) {
                    this.ambientLayers.shimmerPad.set({ detune: clamped });
                }
                if (this.effects.reverb) {
                    this.effects.reverb.wet.rampTo(0.3 + shape * 0.5, 0.1);  // 0.3 - 0.8
                }
                // Also affect chorus for more movement
                if (this.effects.chorus) {
                    this.effects.chorus.depth.rampTo(shape * 0.8, 0.1);
                }
                break;
        }
    }
    
    // Reset a sound to its default state after hand releases
    resetHandSoundControl(soundName) {
        if (!this.isPlaying) return;
        
        const rampTime = 4.0;  // Much longer decay - let the pitch linger
        const filterRampTime = 2.0;  // Filters can return faster
        
        switch (soundName) {
            case 'base':
                if (this.drones.base?.synth) {
                    // Smooth ramp detune back to 0 to avoid dissonance
                    try {
                        const currentDetune = this.drones.base.synth.get().detune || 0;
                        this.drones.base.synth.set({ detune: currentDetune });
                        // Gradually ramp to 0
                        const startTime = Tone.now();
                        const rampDetune = () => {
                            const elapsed = Tone.now() - startTime;
                            const progress = Math.min(1, elapsed / rampTime);
                            // Use easeOut curve for more natural decay
                            const eased = 1 - Math.pow(1 - progress, 2);
                            const newDetune = currentDetune * (1 - eased);
                            if (this.drones.base?.synth) {
                                this.drones.base.synth.set({ detune: Math.abs(newDetune) < 1 ? 0 : newDetune });
                            }
                            if (progress < 1) requestAnimationFrame(rampDetune);
                        };
                        requestAnimationFrame(rampDetune);
                    } catch (e) {
                        this.drones.base.synth.set({ detune: 0 });
                    }
                }
                if (this.drones.base?.filter) {
                    this.drones.base.filter.frequency.rampTo(200, filterRampTime);
                }
                break;
                
            case 'mid':
                if (this.drones.mid?.synth) {
                    try {
                        const currentDetune = this.drones.mid.synth.get().detune || 0;
                        this.drones.mid.synth.set({ detune: currentDetune });
                        const startTime = Tone.now();
                        const rampDetune = () => {
                            const elapsed = Tone.now() - startTime;
                            const progress = Math.min(1, elapsed / rampTime);
                            // Use easeOut curve for more natural decay
                            const eased = 1 - Math.pow(1 - progress, 2);
                            const newDetune = currentDetune * (1 - eased);
                            if (this.drones.mid?.synth) {
                                this.drones.mid.synth.set({ detune: Math.abs(newDetune) < 1 ? 0 : newDetune });
                            }
                            if (progress < 1) requestAnimationFrame(rampDetune);
                        };
                        requestAnimationFrame(rampDetune);
                    } catch (e) {
                        this.drones.mid.synth.set({ detune: 0 });
                    }
                }
                if (this.drones.mid?.filter) {
                    this.drones.mid.filter.frequency.rampTo(800, filterRampTime);
                    this.drones.mid.filter.Q.rampTo(2, filterRampTime);
                }
                break;
                
            case 'high':
                if (this.drones.high?.synth) {
                    try {
                        const currentDetune = this.drones.high.synth.get().detune || 0;
                        this.drones.high.synth.set({ detune: currentDetune });
                        const startTime = Tone.now();
                        const rampDetune = () => {
                            const elapsed = Tone.now() - startTime;
                            const progress = Math.min(1, elapsed / rampTime);
                            // Use easeOut curve for more natural decay
                            const eased = 1 - Math.pow(1 - progress, 2);
                            const newDetune = currentDetune * (1 - eased);
                            if (this.drones.high?.synth) {
                                this.drones.high.synth.set({ detune: Math.abs(newDetune) < 1 ? 0 : newDetune });
                            }
                            if (progress < 1) requestAnimationFrame(rampDetune);
                        };
                        requestAnimationFrame(rampDetune);
                    } catch (e) {
                        this.drones.high.synth.set({ detune: 0 });
                    }
                }
                if (this.effects.delay) {
                    this.effects.delay.feedback.rampTo(0.4, filterRampTime);
                }
                break;
                
            case 'shimmer':
                if (this.ambientLayers?.shimmerPad) {
                    try {
                        const currentDetune = this.ambientLayers.shimmerPad.get().detune || 0;
                        this.ambientLayers.shimmerPad.set({ detune: currentDetune });
                        const startTime = Tone.now();
                        const rampDetune = () => {
                            const elapsed = Tone.now() - startTime;
                            const progress = Math.min(1, elapsed / rampTime);
                            // Use easeOut curve for more natural decay
                            const eased = 1 - Math.pow(1 - progress, 2);
                            const newDetune = currentDetune * (1 - eased);
                            if (this.ambientLayers?.shimmerPad) {
                                this.ambientLayers.shimmerPad.set({ detune: Math.abs(newDetune) < 1 ? 0 : newDetune });
                            }
                            if (progress < 1) requestAnimationFrame(rampDetune);
                        };
                        requestAnimationFrame(rampDetune);
                    } catch (e) {
                        this.ambientLayers.shimmerPad.set({ detune: 0 });
                    }
                }
                if (this.effects.reverb) {
                    this.effects.reverb.wet.rampTo(0.5, filterRampTime);
                }
                if (this.effects.chorus) {
                    this.effects.chorus.depth.rampTo(0.3, filterRampTime);
                }
                break;
        }
    }
    
    // Set hand gesture pitch effect that fades out over time
    applyHandGesturePitch(cents, fadeTime = 5.0) {
        // This creates a new pitch effect that will fade out
        const clamped = Utils.clamp(cents, -2400, 2400);
        
        // Apply to a subset of sounds to create variation
        const targetIndex = Math.floor(Math.random() * 4);
        const droneNames = ['base', 'mid', 'high', 'pad'];
        const drone = this.drones[droneNames[targetIndex]];
        
        if (drone && drone.synth && drone.isPlaying) {
            // Set the detune then schedule a fade back
            drone.synth.set({ detune: clamped });
            
            // Slowly return to base detune over fadeTime
            const startTime = Tone.now();
            const fadeInterval = setInterval(() => {
                const elapsed = Tone.now() - startTime;
                const progress = Math.min(1, elapsed / fadeTime);
                const currentDetune = clamped * (1 - progress);
                drone.synth.set({ detune: currentDetune });
                
                if (progress >= 1) {
                    clearInterval(fadeInterval);
                }
            }, 100);
        }
    }
    
    // Apply finger count mode - introduces new layers/modulations
    applyFingerMode(fingerCount, intensity) {
        if (!this.isPlaying) return;
        
        // Each finger count triggers different sound modifications
        // intensity 0-1 controls how strong the effect is
        const vol = Utils.clamp(intensity, 0, 1);
        
        switch(fingerCount) {
            case 1:
                // One finger - boost sub bass, add depth
                if (this.ambientLayers?.subGain) {
                    const targetDb = -22 + vol * 12;  // Bring up sub bass
                    this.ambientLayers.subGain.gain.rampTo(Tone.dbToGain(targetDb), 0.5);
                }
                break;
            case 2:
                // Two fingers - boost shimmer and breath
                if (this.ambientLayers?.shimmerGain) {
                    const targetDb = -24 + vol * 14;
                    this.ambientLayers.shimmerGain.gain.rampTo(Tone.dbToGain(targetDb), 0.5);
                }
                if (this.ambientLayers?.breathGain) {
                    const targetDb = -28 + vol * 12;
                    this.ambientLayers.breathGain.gain.rampTo(Tone.dbToGain(targetDb), 0.5);
                }
                break;
            case 3:
                // Three fingers - boost granular layers
                if (this.granularLayers) {
                    ['ambient', 'shimmer'].forEach(name => {
                        const layer = this.granularLayers[name];
                        if (layer) {
                            const baseDb = layer.config?.volume || -18;
                            const targetDb = baseDb + vol * 8;
                            layer.gain.gain.rampTo(Tone.dbToGain(targetDb), 0.5);
                        }
                    });
                }
                break;
            case 4:
                // Four fingers - boost effects, more chaotic
                if (this.effects.reverb) {
                    this.effects.reverb.wet.rampTo(0.3 + vol * 0.5, 0.3);
                }
                if (this.effects.delay) {
                    this.effects.delay.wet.rampTo(0.2 + vol * 0.4, 0.3);
                }
                if (this.effects.phaser) {
                    this.effects.phaser.wet.rampTo(0.2 + vol * 0.5, 0.3);
                }
                break;
        }
        
        // Also apply faster modulation to all drones during finger gestures
        if (fingerCount > 0 && vol > 0.3) {
            Object.values(this.drones).forEach((drone, i) => {
                if (drone && drone.filter) {
                    // Faster filter movement
                    const baseFreq = drone.filter.frequency.value;
                    const modAmount = vol * 400 * Math.sin(Tone.now() * 3 + i);
                    drone.filter.frequency.rampTo(
                        Math.max(100, baseFreq + modAmount), 
                        0.15
                    );
                }
            });
        }
    }
    
    // Reset finger mode effects
    resetFingerMode() {
        // Return ambient layers to default
        if (this.ambientLayers?.subGain) {
            this.ambientLayers.subGain.gain.rampTo(Tone.dbToGain(-22), 2.0);
        }
        if (this.ambientLayers?.shimmerGain) {
            this.ambientLayers.shimmerGain.gain.rampTo(Tone.dbToGain(-24), 2.0);
        }
        if (this.ambientLayers?.breathGain) {
            this.ambientLayers.breathGain.gain.rampTo(Tone.dbToGain(-28), 2.0);
        }
        
        // Return effects to normal if not manually controlled
        if (this.effects.reverb && !this.manualControl.masterReverb) {
            this.effects.reverb.wet.rampTo(0.15, 2.0);
        }
        if (this.effects.delay && !this.manualControl.masterDelay) {
            this.effects.delay.wet.rampTo(0.1, 2.0);
        }
        if (this.effects.phaser) {
            this.effects.phaser.wet.rampTo(0.2, 2.0);
        }
        
        // Return granular to default
        if (this.granularLayers) {
            ['ambient', 'shimmer'].forEach(name => {
                const layer = this.granularLayers[name];
                if (layer && layer.config) {
                    layer.gain.gain.rampTo(Tone.dbToGain(layer.config.volume), 2.0);
                }
            });
        }
    }
    
    // Randomly change all parameters for thumb-down gesture
    randomizeParameters() {
        if (!this.isPlaying) return;
        
        // Randomly shift drone frequencies and filters
        Object.values(this.drones).forEach(drone => {
            if (drone && drone.synth && drone.isPlaying) {
                const randomDetune = (Math.random() - 0.5) * 400;  // ±200 cents
                drone.synth.set({ detune: randomDetune });
            }
            if (drone && drone.filter) {
                const currentFreq = drone.filter.frequency.value;
                const randomFreq = currentFreq * (0.5 + Math.random());
                drone.filter.frequency.rampTo(Math.max(100, Math.min(8000, randomFreq)), 0.3);
            }
        });
        
        // Randomize effects
        if (this.effects.delay) {
            this.effects.delay.delayTime.rampTo(0.1 + Math.random() * 0.8, 0.5);
        }
        if (this.effects.phaser) {
            this.effects.phaser.frequency.value = 0.1 + Math.random() * 2;
        }
        if (this.effects.chorus) {
            this.effects.chorus.frequency.value = 0.1 + Math.random() * 3;
        }
        
        // Randomize granular playback rates
        if (this.granularLayers) {
            Object.values(this.granularLayers).forEach(layer => {
                if (layer && layer.player) {
                    const randomRate = 0.3 + Math.random() * 2.5;
                    layer.player.playbackRate = randomRate;
                }
            });
        }
    }
    
    // Toggle individual drone on/off
    toggleDrone(droneName, enabled) {
        const drone = this.drones[droneName];
        if (!drone) return;
        
        if (enabled) {
            if (!drone.isPlaying && this.isPlaying) {
                // Restore gain first
                const targetDb = drone.volume || -18;
                drone.gain.gain.rampTo(Tone.dbToGain(targetDb), 0.5);
                
                const notes = this.getHarmonicNotes(drone.frequency);
                drone.synth.triggerAttack(notes);
                drone.isPlaying = true;
            }
        } else {
            if (drone.isPlaying) {
                // Fade out gain first, then release
                drone.gain.gain.rampTo(0, 0.5);
                setTimeout(() => {
                    try {
                        drone.synth.triggerRelease();
                    } catch (e) {}
                }, 500);
                drone.isPlaying = false;
            }
        }
        console.log(`AudioEngine: Drone ${droneName} ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // Toggle granular layer on/off
    toggleGranularLayer(layerName, enabled) {
        if (!this.granularLayers || !this.granularLayers[layerName]) {
            console.warn(`AudioEngine: Granular layer ${layerName} not found`);
            return;
        }
        
        const layer = this.granularLayers[layerName];
        
        if (enabled) {
            try {
                // Check if buffer is valid
                if (!layer.player.buffer || layer.player.buffer.duration <= 0) {
                    console.warn(`AudioEngine: Granular layer ${layerName} has no valid buffer`);
                    return;
                }
                if (layer.player.state !== 'started') {
                    layer.player.start();
                }
                layer.gain.gain.rampTo(Tone.dbToGain(layer.config?.volume || -18), 0.5);
                layer.isEnabled = true;
            } catch (e) {
                console.warn(`Could not start granular layer ${layerName}:`, e);
            }
        } else {
            // Fade out then stop completely
            layer.gain.gain.rampTo(0, 0.5);
            layer.isEnabled = false;
            setTimeout(() => {
                try {
                    if (!layer.isEnabled && layer.player.state === 'started') {
                        layer.player.stop();
                    }
                } catch (e) {}
            }, 600);
        }
        
        console.log(`AudioEngine: Granular layer ${layerName} ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // Set granular layer parameter
    setGranularParam(layerName, param, value, rampTime = 0.2) {
        if (!this.granularLayers || !this.granularLayers[layerName]) return;
        
        const layer = this.granularLayers[layerName];
        
        switch (param) {
            case 'volume':
                layer.gain.gain.rampTo(Tone.dbToGain(value), rampTime);
                break;
            case 'grainSize':
                if (layer.player) layer.player.grainSize = value;
                break;
            case 'overlap':
                if (layer.player) layer.player.overlap = value;
                break;
            case 'playbackRate':
                if (layer.player) layer.player.playbackRate = value;
                break;
            case 'filterFreq':
                if (layer.filter) layer.filter.frequency.rampTo(value, rampTime);
                break;
            case 'filterQ':
                if (layer.filter) layer.filter.Q.rampTo(value, rampTime);
                break;
            case 'reverbWet':
                if (layer.reverb) layer.reverb.wet.rampTo(value, rampTime);
                break;
            case 'delayWet':
                if (layer.delay) layer.delay.wet.rampTo(value, rampTime);
                break;
            case 'delayTime':
                if (layer.delay) layer.delay.delayTime.rampTo(value, rampTime);
                break;
            case 'randomness':
                // Store for use in generative updates
                layer.randomness = value;
                break;
            case 'pitchShift':
                // Convert cents to playback rate multiplier
                if (layer.player) {
                    const semitones = value / 100;
                    const pitchMult = Math.pow(2, semitones / 12);
                    layer.pitchMultiplier = pitchMult;
                }
                break;
        }
    }
    
    // Toggle mic effects
    toggleMicEffects(enabled) {
        if (!this.micEffectsGain) return;
        
        if (enabled) {
            this.micEffectsGain.gain.rampTo(0.15, 0.5);
        } else {
            this.micEffectsGain.gain.rampTo(0, 0.5);
        }
        
        console.log(`AudioEngine: Mic effects ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // Toggle ambient layers (sub bass, breath, shimmer pad)
    toggleAmbientLayer(layerName, enabled) {
        if (!this.ambientLayers) return;
        
        switch(layerName) {
            case 'subBass':
                if (enabled) {
                    if (this.ambientLayers.subBass && this.ambientLayers.subBass.state !== 'started') {
                        this.ambientLayers.subBass.start();
                    }
                    if (this.ambientLayers.subGain) {
                        this.ambientLayers.subGain.gain.rampTo(Tone.dbToGain(-22), 0.5);
                    }
                } else {
                    if (this.ambientLayers.subGain) {
                        this.ambientLayers.subGain.gain.rampTo(0, 0.5);
                    }
                    setTimeout(() => {
                        try {
                            if (this.ambientLayers.subBass) this.ambientLayers.subBass.stop();
                        } catch(e) {}
                    }, 600);
                }
                break;
            case 'breath':
                if (enabled) {
                    if (this.ambientLayers.breath && this.ambientLayers.breath.state !== 'started') {
                        this.ambientLayers.breath.start();
                    }
                    if (this.ambientLayers.breathGain) {
                        this.ambientLayers.breathGain.gain.rampTo(Tone.dbToGain(-28), 0.5);
                    }
                } else {
                    if (this.ambientLayers.breathGain) {
                        this.ambientLayers.breathGain.gain.rampTo(0, 0.5);
                    }
                    setTimeout(() => {
                        try {
                            if (this.ambientLayers.breath) this.ambientLayers.breath.stop();
                        } catch(e) {}
                    }, 600);
                }
                break;
            case 'shimmerPad':
                if (enabled) {
                    if (this.ambientLayers.shimmerPad) {
                        const notes = ['C5', 'E5', 'G5', 'B5'];
                        this.ambientLayers.shimmerPad.triggerAttack(notes);
                    }
                    if (this.ambientLayers.shimmerGain) {
                        this.ambientLayers.shimmerGain.gain.rampTo(Tone.dbToGain(-24), 0.5);
                    }
                } else {
                    if (this.ambientLayers.shimmerGain) {
                        this.ambientLayers.shimmerGain.gain.rampTo(0, 0.5);
                    }
                    setTimeout(() => {
                        try {
                            if (this.ambientLayers.shimmerPad) this.ambientLayers.shimmerPad.releaseAll();
                        } catch(e) {}
                    }, 600);
                }
                break;
        }
        console.log(`AudioEngine: Ambient layer ${layerName} ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // Set ambient layer volume
    setAmbientVolume(layerName, db, rampTime = 0.2) {
        if (!this.ambientLayers) return;
        
        switch(layerName) {
            case 'subBass':
                if (this.ambientLayers.subGain) {
                    this.ambientLayers.subGain.gain.rampTo(Tone.dbToGain(db), rampTime);
                }
                break;
            case 'breath':
                if (this.ambientLayers.breathGain) {
                    this.ambientLayers.breathGain.gain.rampTo(Tone.dbToGain(db), rampTime);
                }
                break;
            case 'shimmerPad':
                if (this.ambientLayers.shimmerGain) {
                    this.ambientLayers.shimmerGain.gain.rampTo(Tone.dbToGain(db), rampTime);
                }
                break;
        }
    }
    
    // Set mic processing parameter
    setMicParam(param, value, rampTime = 0.2) {
        switch (param) {
            case 'volume':
                if (this.micEffectsGain) this.micEffectsGain.gain.rampTo(value, rampTime);
                break;
            case 'filterFreq':
                if (this.micEffects?.filter) this.micEffects.filter.frequency.rampTo(value, rampTime);
                break;
            case 'reverbWet':
                if (this.micEffects?.reverb) this.micEffects.reverb.wet.rampTo(value, rampTime);
                break;
            case 'delayWet':
                if (this.micEffects?.delay) this.micEffects.delay.wet.rampTo(value, rampTime);
                break;
            case 'delayWet2':
                if (this.micEffects?.delay2) this.micEffects.delay2.wet.rampTo(value, rampTime);
                break;
            case 'delayTime':
                this.micDelayParams.time = value;
                if (this.micEffects?.delay) this.micEffects.delay.delayTime.rampTo(value, rampTime);
                if (this.micDelayEvolution) {
                    this.micDelayEvolution.currentTime = value;
                    this.micDelayEvolution.targetTime = value;
                }
                break;
            case 'delayTime2':
                this.micDelayParams.time2 = value;
                if (this.micEffects?.delay2) this.micEffects.delay2.delayTime.rampTo(value, rampTime);
                if (this.micDelayEvolution) {
                    this.micDelayEvolution.currentTime2 = value;
                    this.micDelayEvolution.targetTime2 = value;
                }
                break;
            case 'delayDrift':
                this.micDelayParams.drift = value;
                break;
            case 'delayStretch':
                this.micDelayParams.stretch = value;
                break;
            case 'delayScatter':
                this.micDelayParams.scatter = value;
                break;
            case 'delayPitch':
                this.micDelayParams.pitch = value;
                if (this.micEffects?.pitchShift) this.micEffects.pitchShift.pitch = value / 100;
                if (this.micDelayEvolution) {
                    this.micDelayEvolution.currentPitch = value;
                    this.micDelayEvolution.targetPitch = value;
                }
                break;
            case 'delayPitchDrift':
                this.micDelayParams.pitchDrift = value;
                break;
            case 'delayPitchFlutter':
                this.micDelayParams.pitchFlutter = value;
                break;
            case 'delayWow':
                this.micDelayParams.wow = value;
                break;
            case 'delayFlutter':
                this.micDelayParams.flutter = value;
                break;
            case 'delayFeedback':
                this.micDelayParams.feedback = value;
                if (this.micEffects?.delay) this.micEffects.delay.feedback.rampTo(value, rampTime);
                if (this.micEffects?.delay2) this.micEffects.delay2.feedback.rampTo(value * 0.85, rampTime);
                if (this.micDelayEvolution) {
                    this.micDelayEvolution.currentFeedback = value;
                    this.micDelayEvolution.targetFeedback = value;
                    this.micDelayEvolution.currentFeedback2 = value * 0.85;
                    this.micDelayEvolution.targetFeedback2 = value * 0.85;
                }
                break;
            case 'delayFeedbackDrift':
                this.micDelayParams.feedbackDrift = value;
                break;
            case 'chorusDepth':
                if (this.micEffects?.chorus) this.micEffects.chorus.depth = value;
                break;
        }
    }
    
    // Set global effect parameter
    setGlobalEffect(param, value, rampTime = 0.2) {
        switch (param) {
            case 'reverbDecay':
                // Reverb decay requires recreation - store for next reverb
                this.pendingReverbDecay = value;
                // Try to update if possible (some Tone.js versions support this)
                if (this.effects.reverb && this.effects.reverb.decay) {
                    try {
                        this.effects.reverb.decay = value;
                    } catch (e) {
                        console.log('Reverb decay will apply on next buffer');
                    }
                }
                break;
            case 'delayFeedback':
                if (this.effects.delay) this.effects.delay.feedback.rampTo(value, rampTime);
                break;
            case 'chorusRate':
                if (this.effects.chorus) this.effects.chorus.frequency.value = value;
                break;
            case 'chorusDepth':
                if (this.effects.chorus) this.effects.chorus.depth = value;
                break;
            case 'phaserRate':
                if (this.effects.phaser) this.effects.phaser.frequency.value = value;
                break;
        }
    }
    
    // Set generative behavior parameter
    setGenerativeParam(param, value) {
        // Store generative parameters
        if (!this.generativeParams) {
            this.generativeParams = {
                grainRandomPosition: 0,
                speedDrift: 0,
                bufferUpdateRate: 15,
                micReactivity: 0.5
            };
        }
        
        this.generativeParams[param] = value;
        
        // Apply specific generative behaviors
        switch (param) {
            case 'bufferUpdateRate':
                // Update the buffer refresh interval
                if (this.bufferUpdateInterval) {
                    clearInterval(this.bufferUpdateInterval);
                    this.bufferUpdateInterval = setInterval(() => {
                        this.updateGranularBuffer();
                    }, value * 1000);
                }
                break;
            case 'grainRandomPosition':
                // Apply random loop position to all granular layers
                if (this.granularLayers) {
                    Object.values(this.granularLayers).forEach(layer => {
                        if (layer.player && layer.player.buffer) {
                            const duration = layer.player.buffer.duration;
                            if (value > 0 && duration > 0) {
                                const randomStart = Math.random() * duration * value;
                                layer.player.loopStart = randomStart;
                                layer.player.loopEnd = randomStart + duration * (1 - value);
                            }
                        }
                    });
                }
                break;
            case 'speedDrift':
                // Start/stop speed drift LFO modulation
                this.speedDriftAmount = value;
                break;
        }
    }
    
    // Update granular buffer (called periodically)
    async updateGranularBuffer() {
        if (!this.isPlaying || !this.micGain) return;
        
        try {
            const recorder = new Tone.Recorder();
            this.micGain.connect(recorder);
            await recorder.start();
            
            setTimeout(async () => {
                try {
                    const recording = await recorder.stop();
                    const arrayBuffer = await recording.arrayBuffer();
                    const audioBuffer = await Tone.getContext().decodeAudioData(arrayBuffer);
                    
                    // Update random layer with new buffer
                    if (this.granularLayers) {
                        const layers = Object.keys(this.granularLayers);
                        if (layers.length > 0) {
                            const randomLayer = layers[Math.floor(Math.random() * layers.length)];
                            const layer = this.granularLayers[randomLayer];
                            if (layer && layer.player) {
                                layer.player.buffer = new Tone.ToneAudioBuffer(audioBuffer);
                                console.log(`AudioEngine: Updated ${randomLayer} buffer`);
                            }
                        }
                    }
                } catch (e) {
                    // Silent fail
                }
            }, 3000);
        } catch (e) {
            // Silent fail
        }
    }
    
    // Apply speed drift modulation (called in update loop)
    applySpeedDrift(deltaTime) {
        if (!this.speedDriftAmount || this.speedDriftAmount <= 0) return;
        if (!this.granularLayers) return;
        
        const time = Tone.now();
        
        Object.values(this.granularLayers).forEach((layer, i) => {
            if (layer.player && layer.config) {
                // Slowly varying speed based on LFO
                const baseSpeed = layer.config.playbackRate || 1;
                const driftAmount = Math.sin(time * 0.1 + i * 1.5) * this.speedDriftAmount * 0.3;
                const pitchMult = layer.pitchMultiplier || 1;
                layer.player.playbackRate = baseSpeed * (1 + driftAmount) * pitchMult;
            }
        });
    }
    
    /**
     * Apply face-driven audio modulation (mouth openness).
     * Mouth open = more reverb, granular density, filter modulation.
     * @param {number} mouthMod - Mouth openness 0-1
     */
    applyFaceAudio(mouthMod) {
        if (!this.isPlaying || typeof mouthMod !== 'number') return;
        
        // Smooth the mouth modulation
        if (!this._faceMouthSmooth) this._faceMouthSmooth = 0;
        this._faceMouthSmooth += (mouthMod - this._faceMouthSmooth) * 0.08;
        
        const m = this._faceMouthSmooth;
        
        // Mouth open increases reverb wetness slightly (unless manually controlled)
        if (this.effects.reverb && !this.manualControl.masterReverb) {
            const baseWet = this.lastAudioState?.audioReverb ?? 0.3;
            const targetWet = Math.min(0.8, 0.05 + baseWet * 0.25 + m * 0.2);
            this.effects.reverb.wet.rampTo(targetWet, 0.15);
        }
        
        // Mouth open increases delay feedback slightly
        if (this.effects.delay && !this.manualControl.masterDelay) {
            const baseDelay = this.lastAudioState?.audioDelay ?? 0.2;
            const targetWet = Math.min(0.4, 0.015 + baseDelay * 0.18 + m * 0.1);
            this.effects.delay.wet.rampTo(targetWet, 0.15);
        }
        
        // Mouth open modulates granular grain size (larger grains = more ambient)
        if (this.granularLayers) {
            Object.values(this.granularLayers).forEach(layer => {
                if (layer?.player && layer.config) {
                    const baseGrain = layer.config.grainSize || 0.1;
                    layer.player.grainSize = baseGrain * (1 + m * 0.5);
                }
            });
        }
        
        // Mouth open also slightly opens high filter
        if (this.drones.high && !this.manualControl.droneHighFilter) {
            const baseFreq = this.lastAudioState?.audioFilterHigh ?? 0.5;
            const targetFreq = 800 + baseFreq * 4000 + m * 1000;
            this.drones.high.filter.frequency.rampTo(targetFreq, 0.2);
        }
    }

    // =========================================
    // CLEANUP
    // =========================================
    
    dispose() {
        this.stop();
        
        // Dispose all drones
        Object.values(this.drones).forEach(drone => {
            if (drone) {
                drone.synth?.dispose();
                drone.filter?.dispose();
                drone.gain?.dispose();
                drone.panner?.dispose();
            }
        });
        
        // Dispose effects
        Object.values(this.effects).forEach(effect => {
            effect?.dispose();
        });
        
        // Dispose granular layers
        if (this.granularLayers) {
            Object.values(this.granularLayers).forEach(layer => {
                if (layer) {
                    layer.player?.dispose();
                    layer.filter?.dispose();
                    layer.delay?.dispose();
                    layer.reverb?.dispose();
                    layer.gain?.dispose();
                    layer.panner?.dispose();
                }
            });
        }
        
        // Dispose mic effects
        if (this.micEffects) {
            Object.values(this.micEffects).forEach(effect => {
                effect?.dispose();
            });
        }
        
        // Dispose mic processing
        this.micAnalyzer?.dispose();
        this.micEffectsGain?.dispose();
        this.micGain?.dispose();
        
        // Dispose master chain
        this.masterGain?.dispose();
        this.masterFilter?.dispose();
        this.compressor?.dispose();
        this.limiter?.dispose();
        
        // Clear intervals
        if (this.bufferUpdateInterval) {
            clearInterval(this.bufferUpdateInterval);
        }
        
        console.log('AudioEngine: Disposed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioEngine;
}
