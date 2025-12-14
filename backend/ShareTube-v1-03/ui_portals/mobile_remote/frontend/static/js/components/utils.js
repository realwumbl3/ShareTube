/**
 * Gyroscope helper for creating parallax effects based on device orientation/motion
 */
export class GyroscopeParallax {
    constructor(options = {}) {
        this.scale = options.scale || 0.3;
        this.debugElement = options.debugElement || null;
        this.onUpdate = options.onUpdate || (() => {});
        this.isActive = false;

        // Bind methods for event listeners
        this.boundHandleOrientation = this.handleOrientation.bind(this);
        this.boundHandleMotion = this.handleMotion.bind(this);
    }

    /**
     * Initialize the gyroscope parallax effect
     * @param {HTMLElement} targetElement - The element to apply parallax transform to
     */
    async init(targetElement) {
        this.targetElement = targetElement;
        this.targetElement.classList.add("parallax");

        const handler = (event) => this.handleOrientation(event);

        // Try device orientation first
        let orientationGranted = false;

        if (typeof DeviceOrientationEvent?.requestPermission === "function") {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === "granted") {
                    orientationGranted = true;
                    window.addEventListener("deviceorientation", this.boundHandleOrientation);
                }
            } catch (error) {
                console.warn("Device orientation permission denied");
            }
        } else {
            // Fallback for devices that don't require permission
            orientationGranted = true;
            window.addEventListener("deviceorientation", this.boundHandleOrientation);
        }

        // If orientation failed, try device motion as fallback
        if (!orientationGranted) {
            if (typeof DeviceMotionEvent?.requestPermission === "function") {
                try {
                    const motionPermission = await DeviceMotionEvent.requestPermission();
                    if (motionPermission === "granted") {
                        window.addEventListener("devicemotion", this.boundHandleMotion);
                    }
                } catch (error) {
                    console.warn("Device motion permission denied");
                }
            }
        }

        this.isActive = true;
    }

    /**
     * Handle device orientation events (preferred method)
     */
    handleOrientation(event) {
        const beta = event.beta || 0;   // pitch: -180 to 180 (front/back tilt)
        const gamma = event.gamma || 0; // roll: -90 to 90 (left/right tilt)

        const xOffset = gamma * this.scale;
        const yOffset = -beta * this.scale;

        this.applyTransform(xOffset, yOffset);

        if (this.debugElement) {
            this.debugElement.textContent = `β:${beta?.toFixed(1)} γ:${gamma?.toFixed(1)} | x:${xOffset.toFixed(1)} y:${yOffset.toFixed(1)}`;
        }
    }

    /**
     * Handle device motion events (fallback method)
     */
    handleMotion(event) {
        const { rotationRate } = event;
        const beta = rotationRate?.beta || 0;
        const gamma = rotationRate?.gamma || 0;

        const xOffset = gamma * (this.scale * 0.67); // Slightly less sensitive for motion
        const yOffset = -beta * (this.scale * 0.67);

        this.applyTransform(xOffset, yOffset);

        if (this.debugElement) {
            this.debugElement.textContent = `MOTION β:${beta.toFixed(1)} γ:${gamma.toFixed(1)} | x:${xOffset.toFixed(1)} y:${yOffset.toFixed(1)}`;
        }
    }

    /**
     * Apply the parallax transform to the target element
     */
    applyTransform(xOffset, yOffset) {
        if (this.targetElement) {
            this.targetElement.style.setProperty("--parallax-x", `${xOffset}px`);
            this.targetElement.style.setProperty("--parallax-y", `${yOffset}px`);
        }

        this.onUpdate(xOffset, yOffset);
    }

    /**
     * Clean up event listeners and reset the element
     */
    destroy() {
        if (this.targetElement) {
            this.targetElement.classList.remove("parallax");
            this.targetElement.style.removeProperty("--parallax-x");
            this.targetElement.style.removeProperty("--parallax-y");
        }

        // Remove all gyroscope event listeners
        window.removeEventListener("deviceorientation", this.boundHandleOrientation);
        window.removeEventListener("devicemotion", this.boundHandleMotion);

        this.isActive = false;
    }
}
