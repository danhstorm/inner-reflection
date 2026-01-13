/**
 * INNER REFLECTION - Hand Tracker
 *
 * Uses MediaPipe Hands to detect palm position and motion for liquid refraction.
 */

class HandTracker {
    constructor() {
        this.isInitialized = false;
        this.isRunning = false;
        this.isProcessing = false;
        this.videoElement = null;
        
        this.hands = null;
        this.lastProcessTime = 0;
        this.processInterval = 50;
        this.lastTimestamp = 0;
        this.maxHands = 2;
        
        this.handDynamics = Array.from({ length: this.maxHands }, () => ({
            hold: 0,
            grab: 0,
            lastCenter: { x: 0.5, y: 0.5 },
            velocity: { x: 0, y: 0 }
        }));
        
        this.handState = {
            count: 0,
            positions: Array.from({ length: this.maxHands }, () => ({ x: 0.5, y: 0.5 })),
            velocities: Array.from({ length: this.maxHands }, () => ({ x: 0, y: 0 })),
            strengths: Array.from({ length: this.maxHands }, () => 0),
            palmFacing: Array.from({ length: this.maxHands }, () => false),
            fists: Array.from({ length: this.maxHands }, () => 0),
            fingerCounts: Array.from({ length: this.maxHands }, () => 0),
            thumbsUp: Array.from({ length: this.maxHands }, () => false),
            thumbsDown: Array.from({ length: this.maxHands }, () => false),
            influence: 0,
            visibility: 0,
            landmarks: []
        };
    }
    
    async init(videoElement) {
        if (this.isInitialized) return true;
        this.videoElement = videoElement;
        
        if (typeof Hands === 'undefined') {
            console.warn('HandTracker: MediaPipe Hands not available');
            return false;
        }
        
        try {
            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });
            
            this.hands.setOptions({
                maxNumHands: this.maxHands,
                modelComplexity: 1,
                minDetectionConfidence: 0.6,
                minTrackingConfidence: 0.5
            });
            
            this.hands.onResults(this.handleResults.bind(this));
            
            this.isInitialized = true;
            console.log('HandTracker: Initialized');
            return true;
        } catch (error) {
            console.error('HandTracker: Init failed', error);
            return false;
        }
    }
    
    start() {
        if (!this.isInitialized) return;
        this.isRunning = true;
    }
    
    stop() {
        this.isRunning = false;
        this.handState.count = 0;
        this.handState.visibility = 0;
    }
    
    processFrame(videoElement) {
        if (!this.isRunning || !this.hands || this.isProcessing) return;
        const video = videoElement || this.videoElement;
        if (!video || video.readyState < 2) return;
        
        const now = performance.now();
        if (now - this.lastProcessTime < this.processInterval) return;
        this.lastProcessTime = now;
        this.isProcessing = true;
        
        this.hands.send({ image: video })
            .catch(() => {})
            .finally(() => {
                this.isProcessing = false;
            });
    }
    
    handleResults(results) {
        const now = performance.now();
        const delta = Math.max(0.016, (now - this.lastTimestamp) / 1000);
        this.lastTimestamp = now;
        
        const landmarks = results.multiHandLandmarks || [];
        const count = Math.min(landmarks.length, this.maxHands);
        
        const visibilityTarget = count > 0 ? 1 : 0;
        this.handState.visibility += (visibilityTarget - this.handState.visibility) * 0.15;
        
        this.handState.count = count;
        this.handState.landmarks = landmarks.slice(0, this.maxHands);
        
        const strengths = Array.from({ length: this.maxHands }, () => 0);
        let strengthSum = 0;
        
        for (let i = 0; i < this.maxHands; i++) {
            const dyn = this.handDynamics[i];
            
            if (i >= count) {
                this.handState.positions[i] = { x: dyn.lastCenter.x, y: dyn.lastCenter.y };
                this.handState.velocities[i] = { x: 0, y: 0 };
                this.handState.strengths[i] = 0;
                this.handState.palmFacing[i] = false;
                this.handState.fists[i] = 0;
                this.handState.fingerCounts[i] = 0;
                this.handState.thumbsUp[i] = false;
                this.handState.thumbsDown[i] = false;
                dyn.hold = Math.max(0, dyn.hold - delta * 2);
                dyn.grab += (0 - dyn.grab) * 0.1;
                strengths[i] = 0;
                continue;
            }
            
            const hand = landmarks[i];
            const palmIndices = [0, 5, 9, 13, 17];
            const tipIndices = [4, 8, 12, 16, 20];
            
            const palmCenter = palmIndices.reduce((acc, idx) => {
                acc.x += hand[idx].x;
                acc.y += hand[idx].y;
                acc.z += hand[idx].z;
                return acc;
            }, { x: 0, y: 0, z: 0 });
            palmCenter.x /= palmIndices.length;
            palmCenter.y /= palmIndices.length;
            palmCenter.z /= palmIndices.length;
            
            const palmSpan = Utils.distance(
                hand[5].x, hand[5].y,
                hand[17].x, hand[17].y
            );
            const avgTipDist = tipIndices.reduce((sum, idx) => {
                return sum + Utils.distance(palmCenter.x, palmCenter.y, hand[idx].x, hand[idx].y);
            }, 0) / tipIndices.length;
            const fist = Utils.clamp(1 - avgTipDist / (palmSpan * 1.7), 0, 1);
            this.handState.fists[i] = fist;
            
            // Count extended fingers (1-4, not counting thumb for finger count)
            // Finger is extended if tip is far from palm base
            const fingerInfo = this.countExtendedFingers(hand, palmCenter, palmSpan);
            this.handState.fingerCounts[i] = fingerInfo.count;
            this.handState.thumbsUp[i] = fingerInfo.thumbsUp;
            this.handState.thumbsDown[i] = fingerInfo.thumbsDown;
            
            const tipCenter = tipIndices.reduce((acc, idx) => {
                acc.z += hand[idx].z;
                return acc;
            }, { z: 0 });
            tipCenter.z /= tipIndices.length;
            
            const palmFacing = palmCenter.z < tipCenter.z - 0.015;
            this.handState.palmFacing[i] = palmFacing;
            
            const vx = (palmCenter.x - dyn.lastCenter.x) / delta;
            const vy = (palmCenter.y - dyn.lastCenter.y) / delta;
            dyn.velocity.x += (vx - dyn.velocity.x) * 0.25;
            dyn.velocity.y += (vy - dyn.velocity.y) * 0.25;
            
            const speed = Math.min(1.5, Math.hypot(dyn.velocity.x, dyn.velocity.y));
            const steadiness = Utils.clamp(1 - speed * 0.8, 0, 1);
            
            if (palmFacing) {
                dyn.hold = Math.min(3.5, dyn.hold + delta * 1.2);
            } else {
                dyn.hold = Math.max(0, dyn.hold - delta * 0.5);
            }
            
            const grabTarget = palmFacing ? Utils.clamp(dyn.hold / 1.5, 0, 1) * (0.4 + steadiness * 0.6) : 0;
            dyn.grab += (grabTarget - dyn.grab) * 0.06;
            
            const strength = Utils.clamp(dyn.grab * (0.85 + speed * 2.0), 0, 1);
            strengths[i] = strength;
            strengthSum += strength;
            
            this.handState.positions[i] = { x: palmCenter.x, y: palmCenter.y };
            this.handState.velocities[i] = {
                x: Utils.clamp(dyn.velocity.x * 0.8, -1.2, 1.2),
                y: Utils.clamp(dyn.velocity.y * 0.8, -1.2, 1.2)
            };
            this.handState.strengths[i] = strength;
            
            dyn.lastCenter.x = palmCenter.x;
            dyn.lastCenter.y = palmCenter.y;
        }
        
        this.handState.strengths = strengths;
        this.handState.influence = Utils.clamp(strengthSum / Math.max(count, 1), 0, 1);
    }
    
    getHandState() {
        return this.handState;
    }
    
    // Count extended fingers and detect thumbs up/down gestures
    countExtendedFingers(hand, palmCenter, palmSpan) {
        // Finger landmarks: 
        // Thumb: 1-4 (tip=4)
        // Index: 5-8 (tip=8)
        // Middle: 9-12 (tip=12)
        // Ring: 13-16 (tip=16)
        // Pinky: 17-20 (tip=20)
        
        const fingerBases = [5, 9, 13, 17];  // Index, middle, ring, pinky MCP joints
        const fingerTips = [8, 12, 16, 20];
        const fingerMids = [6, 10, 14, 18];  // PIP joints (middle of finger)
        
        let extendedCount = 0;
        const threshold = palmSpan * 0.6;
        
        // Check each finger (index, middle, ring, pinky)
        for (let f = 0; f < 4; f++) {
            const tipIdx = fingerTips[f];
            const baseIdx = fingerBases[f];
            const midIdx = fingerMids[f];
            
            // Finger is extended if tip is farther from wrist than the mid joint
            const tipToWrist = Utils.distance(hand[tipIdx].x, hand[tipIdx].y, hand[0].x, hand[0].y);
            const midToWrist = Utils.distance(hand[midIdx].x, hand[midIdx].y, hand[0].x, hand[0].y);
            const tipToBase = Utils.distance(hand[tipIdx].x, hand[tipIdx].y, hand[baseIdx].x, hand[baseIdx].y);
            
            // Finger extended if tip is far from base and tip is farther than mid from wrist
            if (tipToBase > threshold * 0.5 && tipToWrist > midToWrist * 0.95) {
                extendedCount++;
            }
        }
        
        // Detect thumbs up/down
        // Thumb tip = 4, thumb base = 1, wrist = 0
        const thumbTip = hand[4];
        const thumbBase = hand[1];
        const wrist = hand[0];
        const indexBase = hand[5];
        
        // Check if thumb is extended (tip far from palm)
        const thumbExtended = Utils.distance(thumbTip.x, thumbTip.y, palmCenter.x, palmCenter.y) > palmSpan * 0.7;
        
        // Check if other fingers are curled (fist-like, count <= 1)
        const othersCurled = extendedCount <= 1;
        
        // Thumbs up: thumb extended upward, other fingers curled
        // thumb tip Y is significantly above thumb base Y (in image coords, lower Y = higher on screen)
        const thumbUp = thumbTip.y < thumbBase.y - palmSpan * 0.3;
        const thumbDown = thumbTip.y > thumbBase.y + palmSpan * 0.3;
        
        // Also check thumb is roughly horizontal or vertical, not sideways
        const thumbVertical = Math.abs(thumbTip.x - thumbBase.x) < palmSpan * 0.5;
        
        const isThumbsUp = thumbExtended && othersCurled && thumbUp && thumbVertical;
        const isThumbsDown = thumbExtended && othersCurled && thumbDown && thumbVertical;
        
        return {
            count: extendedCount,
            thumbsUp: isThumbsUp,
            thumbsDown: isThumbsDown
        };
    }

    dispose() {
        this.stop();
        if (this.hands && this.hands.close) {
            this.hands.close();
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HandTracker;
}
