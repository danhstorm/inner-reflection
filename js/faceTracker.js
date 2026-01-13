/**
 * INNER REFLECTION - Face Tracker
 * 
 * Handles face tracking using MediaPipe Face Mesh for rich facial feature detection.
 * 
 * TRACKED FEATURES:
 * ==================
 * 
 * POSITION & SIZE:
 * - faceX, faceY: Face center position (0-1, centered at 0.5)
 * - faceSize: How close to camera (0-1, larger = closer)
 * 
 * HEAD ROTATION:
 * - headYaw: Turning left/right (-1 to 1, negative = looking left)
 * - headPitch: Tilting up/down (-1 to 1, negative = looking up)
 * - headRoll: Tilting head sideways (-1 to 1, negative = tilting left)
 * 
 * EYES:
 * - leftEyeOpen: Left eye openness (0-1, 0 = closed, 1 = wide open)
 * - rightEyeOpen: Right eye openness (0-1)
 * - eyesOpen: Average of both eyes
 * - blinking: True if eyes just closed quickly (blink detection)
 * - gazeDirection: Estimated gaze (-1 to 1 for x, y - looking at screen ≈ 0,0)
 * 
 * MOUTH:
 * - mouthOpen: How open the mouth is (0-1, 0 = closed, 1 = wide open)
 * - mouthWidth: Mouth width relative to face (smile detection)
 * - talking: True if mouth is moving (opening/closing rapidly)
 * 
 * EYEBROWS:
 * - leftBrowRaise: Left eyebrow raised (0-1)
 * - rightBrowRaise: Right eyebrow raised (0-1)
 * - browFurrow: Eyebrows pulled together (frowning) (0-1)
 * 
 * ATTENTION:
 * - lookingAtScreen: Confidence that user is looking at screen (0-1)
 * - engagement: Overall engagement score based on features (0-1)
 */

class FaceTracker {
    constructor() {
        this.isInitialized = false;
        this.isRunning = false;
        
        // MediaPipe Face Mesh
        this.faceMesh = null;
        this.faceDetection = null;
        this.camera = null;
        this.useFaceMesh = false;
        
        // Video element
        this.videoElement = null;
        
        // Current face data with all features
        this.faceData = null;
        
        // History for temporal features (blink detection, talking)
        this.history = {
            eyeOpenness: [],
            mouthOpenness: [],
            timestamps: []
        };
        this.historyLength = 10;
        
        // Smoothers for all tracked values
        this.smoothers = {};
        this.initSmoothers();
        
        // Callbacks
        this.onFaceDetected = null;
        this.onFaceLost = null;
        this.onBlink = null;
        
        // Detection state
        this.faceDetectedCount = 0;
        this.faceLostCount = 0;
        this.faceThreshold = 3;
        
        // Landmark indices for Face Mesh (468 points)
        this.landmarks = {
            // Left eye
            leftEyeUpper: [159, 145, 144, 163, 7],
            leftEyeLower: [33, 133, 173, 157, 158],
            leftEyeInner: 133,
            leftEyeOuter: 33,
            
            // Right eye  
            rightEyeUpper: [386, 374, 373, 390, 249],
            rightEyeLower: [263, 362, 398, 384, 385],
            rightEyeInner: 362,
            rightEyeOuter: 263,
            
            // Eyebrows
            leftBrowInner: 107,
            leftBrowOuter: 70,
            leftBrowTop: 105,
            rightBrowInner: 336,
            rightBrowOuter: 300,
            rightBrowTop: 334,
            
            // Nose
            noseTip: 4,
            noseBottom: 2,
            noseBridge: 6,
            
            // Mouth
            upperLipTop: 13,
            upperLipBottom: 14,
            lowerLipTop: 17,
            lowerLipBottom: 0,
            mouthLeft: 61,
            mouthRight: 291,
            
            // Face reference points
            foreheadCenter: 10,
            chin: 152,
            leftCheek: 234,
            rightCheek: 454
        };
    }
    
    initSmoothers() {
        const defaultSmoothing = 0.7;
        const features = [
            'faceX', 'faceY', 'faceSize',
            'headYaw', 'headPitch', 'headRoll',
            'leftEyeOpen', 'rightEyeOpen',
            'gazeX', 'gazeY',
            'mouthOpen', 'mouthWidth',
            'leftBrowRaise', 'rightBrowRaise', 'browFurrow'
        ];
        
        features.forEach(f => {
            this.smoothers[f] = Utils.createSmoother(
                f.includes('face') ? 0.5 : 0,
                defaultSmoothing
            );
        });
    }
    
    // =========================================
    // INITIALIZATION
    // =========================================
    
    async init(videoElement) {
        if (this.isInitialized) return;
        
        console.log('FaceTracker: Initializing with Face Mesh...');
        
        this.videoElement = videoElement;
        
        // Check if MediaPipe Face Mesh is available
        if (typeof FaceMesh === 'undefined') {
            console.warn('FaceTracker: MediaPipe FaceMesh not available, trying Face Detection fallback');
            return this.initFallback(videoElement);
        }
        
        try {
            this.faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });
            
            this.faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true, // Enables iris tracking
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            
            this.faceMesh.onResults(this.handleFaceMeshResults.bind(this));
            
            this.isInitialized = true;
            this.useFaceMesh = true;
            console.log('FaceTracker: Face Mesh initialized (468 landmarks + iris)');
            return true;
            
        } catch (error) {
            console.error('FaceTracker: Face Mesh init failed:', error);
            return this.initFallback(videoElement);
        }
    }
    
    async initFallback(videoElement) {
        // Fallback to basic Face Detection
        if (typeof FaceDetection === 'undefined') {
            console.error('FaceTracker: No face tracking available');
            return false;
        }
        
        try {
            this.faceDetection = new FaceDetection({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
                }
            });
            
            this.faceDetection.setOptions({
                model: 'short',
                minDetectionConfidence: 0.5
            });
            
            this.faceDetection.onResults(this.handleFaceDetectionResults.bind(this));
            
            this.isInitialized = true;
            this.useFaceMesh = false;
            console.log('FaceTracker: Using basic Face Detection fallback');
            return true;
            
        } catch (error) {
            console.error('FaceTracker: Fallback init failed:', error);
            return false;
        }
    }
    
    // =========================================
    // TRACKING
    // =========================================
    
    async start() {
        if (!this.isInitialized || !this.videoElement) {
            console.warn('FaceTracker: Not ready to start');
            return;
        }
        
        console.log('FaceTracker: Starting...');
        
        try {
            const detector = this.useFaceMesh ? this.faceMesh : this.faceDetection;
            
            this.camera = new Camera(this.videoElement, {
                onFrame: async () => {
                    if (this.isRunning && this.videoElement.readyState >= 2) {
                        await detector.send({ image: this.videoElement });
                    }
                },
                width: 640,
                height: 480
            });
            
            await this.camera.start();
            this.isRunning = true;
            console.log('FaceTracker: Started');
            
        } catch (error) {
            console.error('FaceTracker: Start failed:', error);
            this.startManualProcessing();
        }
    }
    
    startManualProcessing() {
        console.log('FaceTracker: Using manual processing');
        this.isRunning = true;
        
        const detector = this.useFaceMesh ? this.faceMesh : this.faceDetection;
        
        const processFrame = async () => {
            if (!this.isRunning) return;
            
            if (this.videoElement.readyState >= 2) {
                try {
                    await detector.send({ image: this.videoElement });
                } catch (e) {}
            }
            
            setTimeout(processFrame, 1000 / 30);
        };
        
        processFrame();
    }
    
    stop() {
        this.isRunning = false;
        if (this.camera) {
            this.camera.stop();
            this.camera = null;
        }
        console.log('FaceTracker: Stopped');
    }
    
    // =========================================
    // FACE MESH RESULTS (468 landmarks)
    // =========================================
    
    handleFaceMeshResults(results) {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            this.handleNoFace();
            return;
        }
        
        const landmarks = results.multiFaceLandmarks[0];
        const now = performance.now();
        
        // Calculate all features
        const features = this.extractAllFeatures(landmarks);
        
        // Apply smoothing
        const smoothed = this.smoothFeatures(features);
        
        // Detect temporal events (blinks, talking)
        const events = this.detectEvents(smoothed, now);
        
        // Build complete face data
        this.faceData = {
            detected: true,
            
            // Position & Size
            faceX: smoothed.faceX,
            faceY: smoothed.faceY,
            faceSize: smoothed.faceSize,
            
            // Head Rotation
            headYaw: smoothed.headYaw,
            headPitch: smoothed.headPitch,
            headRoll: smoothed.headRoll,
            
            // Eyes
            leftEyeOpen: smoothed.leftEyeOpen,
            rightEyeOpen: smoothed.rightEyeOpen,
            eyesOpen: (smoothed.leftEyeOpen + smoothed.rightEyeOpen) / 2,
            blinking: events.blinking,
            gazeX: smoothed.gazeX,
            gazeY: smoothed.gazeY,
            
            // Mouth
            mouthOpen: smoothed.mouthOpen,
            mouthWidth: smoothed.mouthWidth,
            talking: events.talking,
            
            // Eyebrows
            leftBrowRaise: smoothed.leftBrowRaise,
            rightBrowRaise: smoothed.rightBrowRaise,
            browRaise: (smoothed.leftBrowRaise + smoothed.rightBrowRaise) / 2,
            browFurrow: smoothed.browFurrow,
            
            // Attention
            lookingAtScreen: this.calculateLookingAtScreen(smoothed),
            engagement: this.calculateEngagement(smoothed, events),
            
            // Raw landmarks for advanced use
            landmarks: landmarks
        };
        
        // Update detection state
        this.faceLostCount = 0;
        this.faceDetectedCount++;
        
        if (this.faceDetectedCount === this.faceThreshold && this.onFaceDetected) {
            this.onFaceDetected(this.faceData);
        }
        
        // Trigger blink callback
        if (events.justBlinked && this.onBlink) {
            this.onBlink();
        }
    }
    
    extractAllFeatures(landmarks) {
        const lm = this.landmarks;
        
        // Helper to get landmark
        const get = (idx) => landmarks[idx];
        
        // Face center and size
        const noseTip = get(lm.noseTip);
        const chin = get(lm.chin);
        const forehead = get(lm.foreheadCenter);
        const leftCheek = get(lm.leftCheek);
        const rightCheek = get(lm.rightCheek);
        
        const faceX = noseTip.x;
        const faceY = noseTip.y;
        const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
        const faceHeight = Math.abs(chin.y - forehead.y);
        const faceSize = Math.max(faceWidth, faceHeight);
        
        // Head rotation from face geometry
        const headYaw = this.calculateHeadYaw(landmarks);
        const headPitch = this.calculateHeadPitch(landmarks);
        const headRoll = this.calculateHeadRoll(landmarks);
        
        // Eye openness (ratio of vertical to horizontal eye distance)
        const leftEyeOpen = this.calculateEyeOpenness(landmarks, 'left');
        const rightEyeOpen = this.calculateEyeOpenness(landmarks, 'right');
        
        // Gaze direction (if iris tracking available)
        const gazeX = this.calculateGazeX(landmarks);
        const gazeY = this.calculateGazeY(landmarks);
        
        // Mouth openness
        const mouthOpen = this.calculateMouthOpenness(landmarks);
        const mouthWidth = this.calculateMouthWidth(landmarks);
        
        // Eyebrow positions
        const leftBrowRaise = this.calculateBrowRaise(landmarks, 'left');
        const rightBrowRaise = this.calculateBrowRaise(landmarks, 'right');
        const browFurrow = this.calculateBrowFurrow(landmarks);
        
        return {
            faceX, faceY, faceSize,
            headYaw, headPitch, headRoll,
            leftEyeOpen, rightEyeOpen,
            gazeX, gazeY,
            mouthOpen, mouthWidth,
            leftBrowRaise, rightBrowRaise, browFurrow
        };
    }
    
    calculateHeadYaw(landmarks) {
        // Compare nose position relative to face sides
        const nose = landmarks[this.landmarks.noseTip];
        const leftCheek = landmarks[this.landmarks.leftCheek];
        const rightCheek = landmarks[this.landmarks.rightCheek];
        
        const faceCenter = (leftCheek.x + rightCheek.x) / 2;
        const noseOffset = nose.x - faceCenter;
        const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
        
        // Normalize to -1 to 1
        return Math.max(-1, Math.min(1, (noseOffset / (faceWidth * 0.3))));
    }
    
    calculateHeadPitch(landmarks) {
        // Compare nose tip to nose bridge vertical relationship
        const noseTip = landmarks[this.landmarks.noseTip];
        const noseBridge = landmarks[this.landmarks.noseBridge];
        const chin = landmarks[this.landmarks.chin];
        const forehead = landmarks[this.landmarks.foreheadCenter];
        
        const faceHeight = Math.abs(chin.y - forehead.y);
        const noseAngle = (noseTip.y - noseBridge.y) / faceHeight;
        
        // Normalize: looking up = negative, looking down = positive
        return Math.max(-1, Math.min(1, (noseAngle - 0.15) * 5));
    }
    
    calculateHeadRoll(landmarks) {
        // Angle between eyes
        const leftEye = landmarks[this.landmarks.leftEyeOuter];
        const rightEye = landmarks[this.landmarks.rightEyeOuter];
        
        const dx = rightEye.x - leftEye.x;
        const dy = rightEye.y - leftEye.y;
        
        // Angle in radians, normalized to -1 to 1
        const angle = Math.atan2(dy, dx);
        return Math.max(-1, Math.min(1, angle * 3));
    }
    
    calculateEyeOpenness(landmarks, side) {
        const lm = this.landmarks;
        const upper = side === 'left' ? lm.leftEyeUpper : lm.rightEyeUpper;
        const lower = side === 'left' ? lm.leftEyeLower : lm.rightEyeLower;
        const inner = side === 'left' ? lm.leftEyeInner : lm.rightEyeInner;
        const outer = side === 'left' ? lm.leftEyeOuter : lm.rightEyeOuter;
        
        // Vertical distance (average of upper to lower)
        let verticalSum = 0;
        for (let i = 0; i < upper.length; i++) {
            verticalSum += Math.abs(landmarks[upper[i]].y - landmarks[lower[i]].y);
        }
        const verticalDist = verticalSum / upper.length;
        
        // Horizontal distance
        const horizontalDist = Math.abs(landmarks[outer].x - landmarks[inner].x);
        
        // Eye aspect ratio
        const ratio = verticalDist / (horizontalDist + 0.001);
        
        // Normalize to 0-1 (closed ≈ 0.05, open ≈ 0.25)
        return Math.max(0, Math.min(1, (ratio - 0.05) / 0.2));
    }
    
    calculateGazeX(landmarks) {
        // If iris landmarks available (indices 468-477)
        if (landmarks.length > 468) {
            const leftIris = landmarks[468];
            const rightIris = landmarks[473];
            const leftEyeCenter = landmarks[this.landmarks.leftEyeInner];
            const rightEyeCenter = landmarks[this.landmarks.rightEyeInner];
            
            const leftOffset = leftIris.x - leftEyeCenter.x;
            const rightOffset = rightIris.x - rightEyeCenter.x;
            
            return Math.max(-1, Math.min(1, (leftOffset + rightOffset) * 20));
        }
        
        // Fallback: use head yaw as proxy
        return this.calculateHeadYaw(landmarks) * 0.5;
    }
    
    calculateGazeY(landmarks) {
        // If iris landmarks available
        if (landmarks.length > 468) {
            const leftIris = landmarks[468];
            const rightIris = landmarks[473];
            const leftEyeUpper = landmarks[this.landmarks.leftEyeUpper[0]];
            const rightEyeUpper = landmarks[this.landmarks.rightEyeUpper[0]];
            
            const leftOffset = leftIris.y - leftEyeUpper.y;
            const rightOffset = rightIris.y - rightEyeUpper.y;
            
            return Math.max(-1, Math.min(1, (leftOffset + rightOffset) * 15));
        }
        
        // Fallback: use head pitch as proxy
        return this.calculateHeadPitch(landmarks) * 0.5;
    }
    
    calculateMouthOpenness(landmarks) {
        const lm = this.landmarks;
        
        const upperLip = landmarks[lm.upperLipBottom];
        const lowerLip = landmarks[lm.lowerLipTop];
        const mouthLeft = landmarks[lm.mouthLeft];
        const mouthRight = landmarks[lm.mouthRight];
        
        const verticalDist = Math.abs(lowerLip.y - upperLip.y);
        const horizontalDist = Math.abs(mouthRight.x - mouthLeft.x);
        
        // Ratio normalized to 0-1
        const ratio = verticalDist / (horizontalDist + 0.001);
        return Math.max(0, Math.min(1, ratio * 2));
    }
    
    calculateMouthWidth(landmarks) {
        const lm = this.landmarks;
        
        const mouthLeft = landmarks[lm.mouthLeft];
        const mouthRight = landmarks[lm.mouthRight];
        const leftCheek = landmarks[lm.leftCheek];
        const rightCheek = landmarks[lm.rightCheek];
        
        const mouthWidth = Math.abs(mouthRight.x - mouthLeft.x);
        const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
        
        // Wider mouth = smile
        const ratio = mouthWidth / (faceWidth + 0.001);
        return Math.max(0, Math.min(1, (ratio - 0.25) * 4));
    }
    
    calculateBrowRaise(landmarks, side) {
        const lm = this.landmarks;
        
        const browTop = side === 'left' ? landmarks[lm.leftBrowTop] : landmarks[lm.rightBrowTop];
        const eyeTop = side === 'left' ? landmarks[lm.leftEyeUpper[0]] : landmarks[lm.rightEyeUpper[0]];
        const noseBridge = landmarks[lm.noseBridge];
        
        // Distance from brow to eye relative to face scale
        const browEyeDist = eyeTop.y - browTop.y;
        const refDist = Math.abs(noseBridge.y - eyeTop.y);
        
        const ratio = browEyeDist / (refDist + 0.001);
        return Math.max(0, Math.min(1, (ratio - 0.2) * 3));
    }
    
    calculateBrowFurrow(landmarks) {
        const lm = this.landmarks;
        
        const leftBrowInner = landmarks[lm.leftBrowInner];
        const rightBrowInner = landmarks[lm.rightBrowInner];
        
        // Distance between inner brows
        const browDist = Math.abs(rightBrowInner.x - leftBrowInner.x);
        const refWidth = Math.abs(landmarks[lm.leftCheek].x - landmarks[lm.rightCheek].x);
        
        const ratio = browDist / (refWidth + 0.001);
        
        // Smaller distance = more furrowed
        return Math.max(0, Math.min(1, (0.15 - ratio) * 8));
    }
    
    smoothFeatures(features) {
        const smoothed = {};
        for (const [key, value] of Object.entries(features)) {
            if (this.smoothers[key]) {
                smoothed[key] = this.smoothers[key].update(value);
            } else {
                smoothed[key] = value;
            }
        }
        return smoothed;
    }
    
    detectEvents(features, now) {
        // Add to history
        this.history.eyeOpenness.push(features.leftEyeOpen + features.rightEyeOpen);
        this.history.mouthOpenness.push(features.mouthOpen);
        this.history.timestamps.push(now);
        
        // Trim history
        while (this.history.eyeOpenness.length > this.historyLength) {
            this.history.eyeOpenness.shift();
            this.history.mouthOpenness.shift();
            this.history.timestamps.shift();
        }
        
        // Detect blink (rapid close and open)
        let blinking = false;
        let justBlinked = false;
        if (this.history.eyeOpenness.length >= 3) {
            const recent = this.history.eyeOpenness.slice(-3);
            const wasOpen = recent[0] > 0.5;
            const closed = recent[1] < 0.3;
            const openAgain = recent[2] > 0.4;
            
            blinking = closed && (features.leftEyeOpen + features.rightEyeOpen) < 0.6;
            justBlinked = wasOpen && closed && openAgain;
        }
        
        // Detect talking (mouth movement variance)
        let talking = false;
        if (this.history.mouthOpenness.length >= 5) {
            const recent = this.history.mouthOpenness.slice(-5);
            const variance = this.calculateVariance(recent);
            talking = variance > 0.01;
        }
        
        return { blinking, justBlinked, talking };
    }
    
    calculateVariance(arr) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    }
    
    calculateLookingAtScreen(features) {
        // Combination of factors that suggest looking at screen
        const gazeCenter = 1 - (Math.abs(features.gazeX) + Math.abs(features.gazeY)) / 2;
        const headCenter = 1 - (Math.abs(features.headYaw) + Math.abs(features.headPitch)) / 2;
        const eyesEngaged = features.leftEyeOpen * features.rightEyeOpen;
        
        return Math.max(0, Math.min(1, gazeCenter * 0.4 + headCenter * 0.4 + eyesEngaged * 0.2));
    }
    
    calculateEngagement(features, events) {
        // Higher engagement: eyes open, looking at screen, some expression
        const eyeEngagement = (features.leftEyeOpen + features.rightEyeOpen) / 2;
        const lookingScore = this.calculateLookingAtScreen(features);
        const expressionScore = Math.max(
            features.mouthOpen * 0.5,
            (features.leftBrowRaise + features.rightBrowRaise) / 2,
            features.mouthWidth * 0.3
        );
        
        return Math.max(0, Math.min(1, eyeEngagement * 0.4 + lookingScore * 0.4 + expressionScore * 0.2));
    }
    
    // =========================================
    // FALLBACK: Basic Face Detection Results
    // =========================================
    
    handleFaceDetectionResults(results) {
        if (!results.detections || results.detections.length === 0) {
            this.handleNoFace();
            return;
        }
        
        const detection = results.detections[0];
        const box = detection.boundingBox;
        
        // Basic face data only
        this.faceData = {
            detected: true,
            
            faceX: this.smoothers.faceX.update(box.xCenter),
            faceY: this.smoothers.faceY.update(box.yCenter),
            faceSize: this.smoothers.faceSize.update(Math.max(box.width, box.height)),
            
            // Defaults for unavailable features
            headYaw: 0, headPitch: 0, headRoll: 0,
            leftEyeOpen: 1, rightEyeOpen: 1, eyesOpen: 1,
            blinking: false, gazeX: 0, gazeY: 0,
            mouthOpen: 0, mouthWidth: 0.5, talking: false,
            leftBrowRaise: 0, rightBrowRaise: 0, browRaise: 0, browFurrow: 0,
            lookingAtScreen: 0.5, engagement: 0.5,
            landmarks: null
        };
        
        this.faceLostCount = 0;
        this.faceDetectedCount++;
        
        if (this.faceDetectedCount === this.faceThreshold && this.onFaceDetected) {
            this.onFaceDetected(this.faceData);
        }
    }
    
    handleNoFace() {
        this.faceDetectedCount = 0;
        this.faceLostCount++;
        
        if (this.faceLostCount === this.faceThreshold) {
            this.faceData = null;
            if (this.onFaceLost) {
                this.onFaceLost();
            }
        }
        
        // Decay smoothers toward defaults
        if (!this.faceData) {
            this.smoothers.faceX.update(0.5);
            this.smoothers.faceY.update(0.5);
            this.smoothers.faceSize.update(0.3);
        }
    }
    
    // =========================================
    // DATA ACCESS
    // =========================================
    
    getFaceData() {
        if (!this.faceData) {
            return {
                detected: false,
                faceX: this.smoothers.faceX.getValue(),
                faceY: this.smoothers.faceY.getValue(),
                faceSize: this.smoothers.faceSize.getValue(),
                headYaw: 0, headPitch: 0, headRoll: 0,
                leftEyeOpen: 1, rightEyeOpen: 1, eyesOpen: 1,
                blinking: false, gazeX: 0, gazeY: 0,
                mouthOpen: 0, mouthWidth: 0.5, talking: false,
                leftBrowRaise: 0, rightBrowRaise: 0, browRaise: 0, browFurrow: 0,
                lookingAtScreen: 0.5, engagement: 0.5
            };
        }
        return this.faceData;
    }
    
    isFaceDetected() {
        return this.faceData !== null && this.faceData.detected;
    }
    
    // =========================================
    // CLEANUP
    // =========================================
    
    dispose() {
        this.stop();
        
        if (this.faceMesh) {
            this.faceMesh.close();
            this.faceMesh = null;
        }
        if (this.faceDetection) {
            this.faceDetection.close();
            this.faceDetection = null;
        }
        
        console.log('FaceTracker: Disposed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FaceTracker;
}
