/**
 * INNER REFLECTION - Utility Functions
 * 
 * Common helper functions used throughout the application.
 */

const Utils = {
    // =========================================
    // MATH UTILITIES
    // =========================================
    
    /**
     * Linear interpolation between two values
     */
    lerp(start, end, t) {
        return start + (end - start) * t;
    },
    
    /**
     * Smooth interpolation (ease in/out)
     */
    smoothstep(start, end, t) {
        t = Math.max(0, Math.min(1, t));
        t = t * t * (3 - 2 * t);
        return start + (end - start) * t;
    },
    
    /**
     * Map a value from one range to another
     */
    mapRange(value, inMin, inMax, outMin, outMax) {
        return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
    },
    
    /**
     * Clamp a value between min and max
     */
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },
    
    /**
     * Get a random number between min and max
     */
    random(min, max) {
        return Math.random() * (max - min) + min;
    },
    
    /**
     * Get a random integer between min and max (inclusive)
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    /**
     * Convert degrees to radians
     */
    degToRad(degrees) {
        return degrees * (Math.PI / 180);
    },
    
    /**
     * Convert radians to degrees
     */
    radToDeg(radians) {
        return radians * (180 / Math.PI);
    },
    
    /**
     * Normalize a value to 0-1 range
     */
    normalize(value, min, max) {
        return (value - min) / (max - min);
    },
    
    /**
     * Calculate distance between two points
     */
    distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    },
    
    // =========================================
    // COLOR UTILITIES
    // =========================================
    
    /**
     * Convert hex color to RGB object
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },
    
    /**
     * Convert RGB to hex color
     */
    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = Math.round(x).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    },
    
    /**
     * Convert hex to normalized RGB (0-1)
     */
    hexToNormalizedRgb(hex) {
        const rgb = this.hexToRgb(hex);
        return rgb ? {
            r: rgb.r / 255,
            g: rgb.g / 255,
            b: rgb.b / 255
        } : null;
    },
    
    /**
     * Interpolate between two colors
     */
    lerpColor(color1, color2, t) {
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);
        
        if (!c1 || !c2) return color1;
        
        return this.rgbToHex(
            this.lerp(c1.r, c2.r, t),
            this.lerp(c1.g, c2.g, t),
            this.lerp(c1.b, c2.b, t)
        );
    },
    
    /**
     * Convert HSL to RGB
     */
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
        
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    },
    
    // =========================================
    // EASING FUNCTIONS
    // =========================================
    
    easing: {
        linear: t => t,
        easeInQuad: t => t * t,
        easeOutQuad: t => t * (2 - t),
        easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        easeInCubic: t => t * t * t,
        easeOutCubic: t => (--t) * t * t + 1,
        easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
        easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
        easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
        easeInOutExpo: t => {
            if (t === 0 || t === 1) return t;
            if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
            return (2 - Math.pow(2, -20 * t + 10)) / 2;
        }
    },
    
    // =========================================
    // NOISE FUNCTIONS
    // =========================================
    
    /**
     * Simple 1D Perlin-like noise
     */
    noise1D: (() => {
        const permutation = [];
        for (let i = 0; i < 256; i++) permutation[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
        }
        const p = [...permutation, ...permutation];
        
        const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
        const grad = (hash, x) => (hash & 1) === 0 ? x : -x;
        
        return function(x) {
            const X = Math.floor(x) & 255;
            x -= Math.floor(x);
            const u = fade(x);
            return Utils.lerp(grad(p[X], x), grad(p[X + 1], x - 1), u);
        };
    })(),
    
    /**
     * Fractional Brownian Motion (layered noise)
     */
    fbm(x, octaves = 4, lacunarity = 2, gain = 0.5) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            value += amplitude * this.noise1D(x * frequency);
            maxValue += amplitude;
            amplitude *= gain;
            frequency *= lacunarity;
        }
        
        return value / maxValue;
    },
    
    // =========================================
    // SMOOTHING / FILTERING
    // =========================================
    
    /**
     * Create a smoothed value tracker
     */
    createSmoother(initialValue = 0, smoothing = 0.9) {
        let currentValue = initialValue;
        
        return {
            update(targetValue) {
                currentValue = Utils.lerp(targetValue, currentValue, smoothing);
                return currentValue;
            },
            getValue() {
                return currentValue;
            },
            setValue(value) {
                currentValue = value;
            },
            setSmoothing(value) {
                smoothing = Utils.clamp(value, 0, 0.999);
            }
        };
    },
    
    /**
     * Create a moving average filter
     */
    createMovingAverage(windowSize = 10) {
        const values = [];
        
        return {
            add(value) {
                values.push(value);
                if (values.length > windowSize) {
                    values.shift();
                }
                return this.getAverage();
            },
            getAverage() {
                if (values.length === 0) return 0;
                return values.reduce((a, b) => a + b, 0) / values.length;
            },
            clear() {
                values.length = 0;
            }
        };
    },
    
    // =========================================
    // DEVICE & BROWSER UTILITIES
    // =========================================
    
    /**
     * Check if the device is mobile
     */
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },
    
    /**
     * Check if the device supports touch
     */
    hasTouch() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    },
    
    /**
     * Check if DeviceOrientation is available
     */
    hasDeviceOrientation() {
        return 'DeviceOrientationEvent' in window;
    },
    
    /**
     * Check if DeviceMotion is available
     */
    hasDeviceMotion() {
        return 'DeviceMotionEvent' in window;
    },
    
    /**
     * Request fullscreen
     */
    requestFullscreen(element = document.documentElement) {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        }
    },
    
    /**
     * Exit fullscreen
     */
    exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        }
    },
    
    // =========================================
    // ASYNC UTILITIES
    // =========================================
    
    /**
     * Wait for a specified duration
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    /**
     * Throttle function calls
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    /**
     * Debounce function calls
     */
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },
    
    // =========================================
    // OBJECT UTILITIES
    // =========================================
    
    /**
     * Deep clone an object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },
    
    /**
     * Get nested property value by path string
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    },
    
    /**
     * Set nested property value by path string
     */
    setNestedValue(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((acc, part) => {
            if (!(part in acc)) acc[part] = {};
            return acc[part];
        }, obj);
        target[last] = value;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
