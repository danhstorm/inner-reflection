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
        this.loopCaptureInterval = 8000;  // Capture new loop every 8 seconds when sound detected
        this.soundThreshold = 0.02;  // Minimum level to trigger loop capture
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
    
    async init() {
        if (this.isInitialized) return;
        
        console.log('AudioEngine: Initializing...');
        
        try {
            // Start Tone.js audio context
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
        // Master limiter to prevent clipping
        this.limiter = new Tone.Limiter(-1).toDestination();
        
        // Master compressor for glue
        this.compressor = new Tone.Compressor({
            threshold: -20,
            ratio: 4,
            attack: 0.1,
            release: 0.3
        }).connect(this.limiter);
        
        // Master gain - start louder
        this.masterGain = new Tone.Gain(Tone.dbToGain(CONFIG.audio.masterVolume + 6))
            .connect(this.compressor);
        
        // Master filter for overall tonal control
        this.masterFilter = new Tone.Filter({
            type: 'lowpass',
            frequency: 8000,
            Q: 0.5
        }).connect(this.masterGain);
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
        const subFilter = new Tone.Filter({ type: 'lowpass', frequency: 60 });
        const subGain = new Tone.Gain(Tone.dbToGain(-22));
        this.ambientLayers.subBass.connect(subFilter);
        subFilter.connect(subGain);
        subGain.connect(this.masterFilter);
        
        // Breath layer - slow filtered noise like breathing
        this.ambientLayers.breath = new Tone.Noise('pink');
        const breathFilter = new Tone.Filter({ type: 'bandpass', frequency: 400, Q: 2 });
        const breathLFO = new Tone.LFO({ frequency: 0.08, min: 200, max: 600 }).start();
        breathLFO.connect(breathFilter.frequency);
        const breathGain = new Tone.Gain(Tone.dbToGain(-28));
        const breathEnvLFO = new Tone.LFO({ frequency: 0.05, min: 0, max: 0.4 }).start();
        this.ambientLayers.breath.connect(breathFilter);
        breathFilter.connect(breathGain);
        breathEnvLFO.connect(breathGain.gain);
        breathGain.connect(this.effects.reverb);
        
        // Shimmer pad - high harmonics that slowly evolve
        this.ambientLayers.shimmerPad = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 4, decay: 2, sustain: 0.8, release: 8 }
        });
        const shimmerFilter = new Tone.Filter({ type: 'highpass', frequency: 2000 });
        const shimmerChorus = new Tone.Chorus({ frequency: 0.3, depth: 0.8, wet: 0.6 }).start();
        const shimmerGain = new Tone.Gain(Tone.dbToGain(-24));
        this.ambientLayers.shimmerPad.connect(shimmerFilter);
        shimmerFilter.connect(shimmerChorus);
        shimmerChorus.connect(shimmerGain);
        shimmerGain.connect(this.effects.reverb);
        
        // Store references for control
        this.ambientLayers.subFilter = subFilter;
        this.ambientLayers.subGain = subGain;
        this.ambientLayers.breathFilter = breathFilter;
        this.ambientLayers.breathGain = breathGain;
        this.ambientLayers.shimmerFilter = shimmerFilter;
        this.ambientLayers.shimmerGain = shimmerGain;
        
        console.log('AudioEngine: Ambient layers created');
    }
    
    // Start slow evolution of all sound parameters
    startEvolution() {
        this.evolutionInterval = setInterval(() => {
            if (!this.isPlaying) return;
            
            this.evolutionTime += 0.1;
            
            // Slowly evolve drone pitches (micro-detuning)
            Object.values(this.drones).forEach((drone, i) => {
                if (drone.synth && drone.isPlaying) {
                    const detune = Math.sin(this.evolutionTime * 0.1 + i) * 5 + 
                                  Math.sin(this.evolutionTime * 0.07 + i * 2) * 3;
                    drone.synth.set({ detune });
                }
            });
            
            // Slowly evolve filter frequencies
            if (this.ambientLayers?.breathFilter) {
                const breathFreq = 300 + Math.sin(this.evolutionTime * 0.08) * 150 +
                                  Math.sin(this.evolutionTime * 0.12) * 100;
                this.ambientLayers.breathFilter.frequency.rampTo(breathFreq, 2);
            }
            
            // Evolve effect parameters
            if (this.effects.chorus) {
                this.effects.chorus.frequency.value = 0.3 + Math.sin(this.evolutionTime * 0.05) * 0.2;
            }
            if (this.effects.phaser) {
                this.effects.phaser.frequency.value = 0.15 + Math.sin(this.evolutionTime * 0.07) * 0.1;
            }
            
            // Evolve granular parameters very slowly
            if (this.granularLayers) {
                Object.values(this.granularLayers).forEach((layer, i) => {
                    if (layer.player) {
                        // Slowly shift grain size
                        const baseSize = layer.config?.grainSize || 0.2;
                        const size = baseSize * (0.8 + Math.sin(this.evolutionTime * 0.03 + i) * 0.4);
                        layer.player.grainSize = Math.max(0.02, Math.min(1, size));
                        
                        // Slowly shift loop position
                        if (layer.player.buffer?.duration) {
                            const loopStart = (Math.sin(this.evolutionTime * 0.02 + i * 0.5) * 0.5 + 0.5) * 
                                            (layer.player.buffer.duration * 0.8);
                            layer.player.loopStart = loopStart;
                        }
                    }
                });
            }
            
        }, 100);  // Update every 100ms for smooth evolution
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
        
        // Create multiple granular layers with different characteristics
        this.granularLayers = {};
        
        // Layer 1: Slow, stretched grains with lots of reverb
        this.granularLayers.ambient = this.createGranularLayer({
            buffer: audioBuffer,
            grainSize: 0.4,
            overlap: 0.3,
            playbackRate: 0.5,
            volume: -18,
            filterFreq: 800,
            filterQ: 1,
            reverbWet: 0.8,
            delayWet: 0.4,
            delayTime: 0.5
        });
        
        // Layer 2: Choppy, stuttering grains
        this.granularLayers.choppy = this.createGranularLayer({
            buffer: audioBuffer,
            grainSize: 0.05,
            overlap: 0.02,
            playbackRate: 1.0,
            volume: -22,
            filterFreq: 2000,
            filterQ: 2,
            reverbWet: 0.5,
            delayWet: 0.6,
            delayTime: 0.125
        });
        
        // Layer 3: Pitched up shimmer
        this.granularLayers.shimmer = this.createGranularLayer({
            buffer: audioBuffer,
            grainSize: 0.15,
            overlap: 0.1,
            playbackRate: 2.0,
            volume: -25,
            filterFreq: 4000,
            filterQ: 0.5,
            reverbWet: 0.9,
            delayWet: 0.3,
            delayTime: 0.333
        });
        
        // Layer 4: Deep, slow grains
        this.granularLayers.deep = this.createGranularLayer({
            buffer: audioBuffer,
            grainSize: 0.6,
            overlap: 0.4,
            playbackRate: 0.25,
            volume: -20,
            filterFreq: 400,
            filterQ: 3,
            reverbWet: 0.7,
            delayWet: 0.5,
            delayTime: 0.75
        });
        
        console.log('AudioEngine: Granular layers created');
    }
    
    createGranularLayer(config) {
        // Create GrainPlayer
        const player = new Tone.GrainPlayer({
            url: config.buffer,
            grainSize: config.grainSize,
            overlap: config.overlap,
            playbackRate: config.playbackRate,
            loop: true,
            loopStart: 0,
            loopEnd: config.buffer.duration
        });
        
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
        
        // Mic effects chain - heavily processed for texture
        // 1. Pitch shifter effect (simulated with delay)
        this.micEffects = {};
        
        // Reverb for mic (very wet)
        this.micEffects.reverb = new Tone.Reverb({
            decay: 8,
            wet: 0.9
        });
        
        // Delay for mic (creates echoes)
        this.micEffects.delay = new Tone.PingPongDelay({
            delayTime: '8n',
            feedback: 0.6,
            wet: 0.7
        });
        
        // Filter to shape mic input
        this.micEffects.filter = new Tone.Filter({
            type: 'bandpass',
            frequency: 1200,
            Q: 2
        });
        
        // Chorus for width
        this.micEffects.chorus = new Tone.Chorus({
            frequency: 0.5,
            depth: 0.8,
            wet: 0.5
        }).start();
        
        // Very quiet mic to effects gain
        this.micEffectsGain = new Tone.Gain(0.15);
        
        // Connect mic -> filter -> chorus -> delay -> reverb -> gain -> master
        this.micGain.connect(this.micEffects.filter);
        this.micEffects.filter.connect(this.micEffects.chorus);
        this.micEffects.chorus.connect(this.micEffects.delay);
        this.micEffects.delay.connect(this.micEffects.reverb);
        this.micEffects.reverb.connect(this.micEffectsGain);
        this.micEffectsGain.connect(this.masterFilter);
        
        console.log('AudioEngine: Mic processing chain created');
    }
    
    // Handle real-time mic input for sound modulation
    handleMicInput(audioData) {
        if (!this.isPlaying || !this.micEffects) return;
        
        const { volume, bass, mid, treble } = audioData;
        
        // Modulate mic effects based on input level
        // Higher volume = more delay feedback, wider chorus
        if (this.micEffects.delay) {
            this.micEffects.delay.feedback.rampTo(0.3 + volume * 0.4, 0.1);
        }
        
        if (this.micEffects.chorus) {
            this.micEffects.chorus.depth = 0.3 + volume * 0.5;
        }
        
        // Filter follows frequency content
        if (this.micEffects.filter) {
            const freq = 500 + bass * 500 + mid * 1000 + treble * 2000;
            this.micEffects.filter.frequency.rampTo(freq, 0.1);
        }
        
        // Modulate granular layers based on mic input
        if (this.granularLayers) {
            // Bass triggers deep layer
            if (this.granularLayers.deep) {
                this.granularLayers.deep.gain.gain.rampTo(
                    Tone.dbToGain(-20 + bass * 10), 0.2
                );
                this.granularLayers.deep.player.grainSize = 0.4 + bass * 0.4;
            }
            
            // Mid triggers choppy layer
            if (this.granularLayers.choppy) {
                this.granularLayers.choppy.gain.gain.rampTo(
                    Tone.dbToGain(-22 + mid * 12), 0.15
                );
                this.granularLayers.choppy.player.playbackRate = 0.8 + mid * 0.8;
            }
            
            // Treble triggers shimmer
            if (this.granularLayers.shimmer) {
                this.granularLayers.shimmer.gain.gain.rampTo(
                    Tone.dbToGain(-25 + treble * 15), 0.1
                );
                this.granularLayers.shimmer.player.grainSize = 0.1 + treble * 0.2;
            }
            
            // Overall volume affects ambient layer
            if (this.granularLayers.ambient) {
                this.granularLayers.ambient.gain.gain.rampTo(
                    Tone.dbToGain(-18 + volume * 8), 0.3
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
            
            // Record for 3-5 seconds
            const duration = 3000 + Math.random() * 2000;
            
            setTimeout(async () => {
                try {
                    const recording = await recorder.stop();
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
                        
                        if (layer?.player) {
                            // Crossfade to new buffer (ramp down, switch, ramp up)
                            const originalGain = layer.gain.gain.value;
                            layer.gain.gain.rampTo(0, 0.5);
                            
                            setTimeout(() => {
                                try {
                                    layer.player.buffer = toneBuffer;
                                    layer.player.loopEnd = toneBuffer.duration;
                                    layer.gain.gain.rampTo(originalGain, 0.5);
                                    console.log(`AudioEngine: Mic loop assigned to ${randomLayer}`);
                                } catch (e) {}
                            }, 600);
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
        
        // Record for 5 seconds
        await recorder.start();
        
        setTimeout(async () => {
            const recording = await recorder.stop();
            
            // Convert to audio buffer
            const arrayBuffer = await recording.arrayBuffer();
            const audioBuffer = await Tone.getContext().decodeAudioData(arrayBuffer);
            
            // Set up granular with the recorded buffer
            await this.setupGranular(audioBuffer);
            
            // Start granular layers
            this.startGranularLayers();
            
            console.log('AudioEngine: Initial mic recording captured for granular');
            
            // Store as first mic loop
            this.micLoops[0] = new Tone.ToneAudioBuffer(audioBuffer);
            this.currentLoopIndex = 1;
            
        }, 5000);
    }
    
    startGranularLayers() {
        if (!this.granularLayers) return;
        
        Object.keys(this.granularLayers).forEach(key => {
            const layer = this.granularLayers[key];
            if (layer && layer.player) {
                try {
                    layer.player.start();
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
        console.log('AudioEngine: Playback started');
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
            
            // Start shimmer pad with evolving chord
            if (this.ambientLayers.shimmerPad) {
                // Play high ethereal notes
                const notes = ['C5', 'E5', 'G5', 'B5'];
                this.ambientLayers.shimmerPad.triggerAttack(notes);
            }
            
            console.log('AudioEngine: Ambient layers started');
        } catch (e) {
            console.warn('AudioEngine: Could not start ambient layers:', e);
        }
    }
    
    stopAmbientLayers() {
        if (!this.ambientLayers) return;
        
        try {
            if (this.ambientLayers.subBass) this.ambientLayers.subBass.stop();
            if (this.ambientLayers.breath) this.ambientLayers.breath.stop();
            if (this.ambientLayers.shimmerPad) this.ambientLayers.shimmerPad.releaseAll();
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
        
        // Master volume
        if (this.masterGain) {
            const targetDb = -20 + audioState.audioVolume * 15; // -20 to -5 dB range
            this.masterGain.gain.rampTo(Tone.dbToGain(targetDb), 0.3);
        }
        
        // Drone volumes
        if (this.drones.base) {
            this.drones.base.gain.gain.rampTo(Tone.dbToGain(-15 + audioState.audioBass * 10), 0.3);
        }
        if (this.drones.mid) {
            this.drones.mid.gain.gain.rampTo(Tone.dbToGain(-18 + audioState.audioMid * 10), 0.3);
        }
        if (this.drones.high) {
            this.drones.high.gain.gain.rampTo(Tone.dbToGain(-20 + audioState.audioHigh * 12), 0.3);
        }
        
        // Filter frequencies (mapped from state)
        if (this.drones.base) {
            const baseFreq = 80 + audioState.audioFilterBase * 400;
            this.drones.base.filter.frequency.rampTo(baseFreq, 0.5);
        }
        if (this.drones.mid) {
            const midFreq = 300 + audioState.audioFilterMid * 1500;
            this.drones.mid.filter.frequency.rampTo(midFreq, 0.5);
        }
        if (this.drones.high) {
            const highFreq = 800 + audioState.audioFilterHigh * 4000;
            this.drones.high.filter.frequency.rampTo(highFreq, 0.5);
        }
        
        // Effects
        this.effects.reverb.wet.rampTo(0.2 + audioState.audioReverb * 0.6, 0.5);
        this.effects.delay.wet.rampTo(0.05 + audioState.audioDelay * 0.4, 0.5);
        
        // Chorus and phaser modulation
        if (this.effects.chorus) {
            this.effects.chorus.depth = 0.2 + audioState.audioModulation * 0.6;
            this.effects.chorus.frequency.value = 0.1 + audioState.audioModulation * 2;
        }
        if (this.effects.phaser) {
            this.effects.phaser.frequency.value = 0.1 + audioState.audioModulation * 0.5;
        }
        
        // Granular layer modulation from state
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
        
        // Mic effects modulation
        if (this.micEffects) {
            if (this.micEffects.reverb) {
                this.micEffects.reverb.wet.rampTo(0.7 + audioState.audioReverb * 0.25, 0.4);
            }
            if (this.micEffects.delay) {
                this.micEffects.delay.wet.rampTo(0.4 + audioState.audioDelay * 0.4, 0.3);
            }
        }
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
    
    setMasterVolume(db) {
        if (this.masterGain) {
            this.masterGain.gain.rampTo(Tone.dbToGain(db), 0.1);
        }
    }
    
    setDroneVolume(droneName, db) {
        if (this.drones[droneName]) {
            this.drones[droneName].gain.gain.rampTo(Tone.dbToGain(db), 0.1);
        }
    }
    
    setDroneFilter(droneName, frequency) {
        if (this.drones[droneName]) {
            this.drones[droneName].filter.frequency.rampTo(frequency, 0.2);
        }
    }
    
    setEffectWet(effectName, wet) {
        if (this.effects[effectName]) {
            this.effects[effectName].wet.rampTo(wet, 0.1);
        }
    }
    
    // Toggle individual drone on/off
    toggleDrone(droneName, enabled) {
        const drone = this.drones[droneName];
        if (!drone) return;
        
        if (enabled) {
            if (!drone.isPlaying && this.isPlaying) {
                const notes = this.getHarmonicNotes(drone.frequency);
                drone.synth.triggerAttack(notes);
                drone.isPlaying = true;
            }
        } else {
            if (drone.isPlaying) {
                drone.synth.triggerRelease();
                drone.isPlaying = false;
            }
        }
        console.log(`AudioEngine: Drone ${droneName} ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // Toggle granular layer on/off
    toggleGranularLayer(layerName, enabled) {
        if (!this.granularLayers || !this.granularLayers[layerName]) return;
        
        const layer = this.granularLayers[layerName];
        
        if (enabled) {
            try {
                if (layer.player.state !== 'started') {
                    layer.player.start();
                }
                layer.gain.gain.rampTo(Tone.dbToGain(layer.config?.volume || -18), 0.3);
            } catch (e) {
                console.warn(`Could not start granular layer ${layerName}:`, e);
            }
        } else {
            layer.gain.gain.rampTo(0, 0.3);
        }
        
        console.log(`AudioEngine: Granular layer ${layerName} ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // Set granular layer parameter
    setGranularParam(layerName, param, value) {
        if (!this.granularLayers || !this.granularLayers[layerName]) return;
        
        const layer = this.granularLayers[layerName];
        
        switch (param) {
            case 'volume':
                layer.gain.gain.rampTo(Tone.dbToGain(value), 0.1);
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
                if (layer.filter) layer.filter.frequency.rampTo(value, 0.2);
                break;
            case 'filterQ':
                if (layer.filter) layer.filter.Q.rampTo(value, 0.1);
                break;
            case 'reverbWet':
                if (layer.reverb) layer.reverb.wet.rampTo(value, 0.2);
                break;
            case 'delayWet':
                if (layer.delay) layer.delay.wet.rampTo(value, 0.1);
                break;
            case 'delayTime':
                if (layer.delay) layer.delay.delayTime.rampTo(value, 0.3);
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
            this.micEffectsGain.gain.rampTo(0.15, 0.3);
        } else {
            this.micEffectsGain.gain.rampTo(0, 0.3);
        }
        
        console.log(`AudioEngine: Mic effects ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // Set mic processing parameter
    setMicParam(param, value) {
        switch (param) {
            case 'volume':
                if (this.micEffectsGain) this.micEffectsGain.gain.rampTo(value, 0.1);
                break;
            case 'filterFreq':
                if (this.micEffects?.filter) this.micEffects.filter.frequency.rampTo(value, 0.2);
                break;
            case 'reverbWet':
                if (this.micEffects?.reverb) this.micEffects.reverb.wet.rampTo(value, 0.2);
                break;
            case 'delayWet':
                if (this.micEffects?.delay) this.micEffects.delay.wet.rampTo(value, 0.1);
                break;
            case 'delayFeedback':
                if (this.micEffects?.delay) this.micEffects.delay.feedback.rampTo(value, 0.1);
                break;
            case 'chorusDepth':
                if (this.micEffects?.chorus) this.micEffects.chorus.depth = value;
                break;
        }
    }
    
    // Set global effect parameter
    setGlobalEffect(param, value) {
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
                if (this.effects.delay) this.effects.delay.feedback.rampTo(value, 0.2);
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
