import { html, css, LiveVar } from "/extension/app/dep/zyx.js";

css`
    /* ============================================
   Particle Background
   ============================================ */

    .ambient-background {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: -1;
    }

    .ambient-background canvas {
        width: 100%;
        height: 100%;
        position: absolute;
        display: block;
    }
`;

export const shaderFragmentPathMap = {
    xmbPrestigeFlowFragment: "/extension/app/background/shaders/xmbPrestigeFlowFragment.glsl",
    xmbPremiumFragment: "/extension/app/background/shaders/xmbPremiumFragment.glsl",
    premiumAmbientFragment: "/extension/app/background/shaders/premiumAmbientFragment.glsl",
    ps3LiquidGlassFragment: "/extension/app/background/shaders/ps3LiquidGlassFragment.glsl",
    ps3LiquidGlassImprovedFragment: "/extension/app/background/shaders/ps3LiquidGlassImprovedFragment.glsl",
    ambientFlowFragment: "/extension/app/background/shaders/ambientFlowFragment.glsl",
    epicNebulaFragment: "/extension/app/background/shaders/epicNebulaFragment.glsl",
    prismaticNeuralFragment: "/extension/app/background/shaders/prismaticNeuralFragment.glsl",
};

export default class AmbientBackground {
    /**
     * Shadertoy-compatible background manager
     * @param {Object} options - Configuration options
     * @param {string} [options.vertexShader] - Vertex shader source code or path to .glsl file
     * @param {string} options.fragmentShader - Fragment shader source code or path to .glsl file (required)
     * @param {Object<string, any>} [options.uniforms] - Custom uniforms to pass to shader
     * @param {Array<HTMLImageElement|HTMLVideoElement|HTMLCanvasElement|ImageData|string>} [options.channels] - Texture channels (iChannel0-3). Can be images, videos, canvases, ImageData, or URLs
     * @param {boolean} [options.shadertoyMode=false] - Enable Shadertoy uniform names (iTime, iResolution, etc.). Legacy u_* names are always supported for compatibility
     * @param {boolean} [options.halfFrameRate=false] - Skip every other frame to halve the frame rate for performance
     * @param {number|null} [options.maxResolution=null] - Maximum resolution height (e.g., 1080 for 1080p). Null for unlimited
     */
    constructor(options = {}) {
        if (!options.fragmentShader) {
            throw new Error("AmbientBackground requires a fragmentShader option");
        }

        this.activeShader = new LiveVar(options.fragmentShader);

        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.time = 0;
        this.timeDelta = 0;
        this.lastFrameTime = 0;
        this.frame = 0;
        this.animationFrame = null;
        this.isHidden = false;
        this.resizeObserver = null;
        this.vertexShaderSource = options.vertexShader || null;
        this.fragmentShaderSource = options.fragmentShader;
        this.customUniforms = options.uniforms || {};
        this.channels = options.channels || [];
        this.shadertoyMode = options.shadertoyMode === true; // Default to false for backward compatibility
        this.halfFrameRate = options.halfFrameRate === true; // Skip every other frame
        this.maxResolution = options.maxResolution || null; // Max height in pixels (e.g., 1080)
        this.skipFrame = false; // Internal flag for frame skipping
        this.pendingResize = false; // Flag for pending resize during animation
        this.uniformLocations = {};
        this.textures = [];
        this.mouseX = 0.5;
        this.mouseY = 0.5;
        this.mouseClick = 0;
        this.mouseDrag = 0;

        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleResize = this.handleResize.bind(this);

        html`
            <div class="ambient-background">
                <canvas this="canvas"></canvas>
            </div>
        `.bind(this);
        /** zyXSense @type {HTMLCanvasElement} */
        this.canvas;

        this.init();
    }

    async init() {
        requestAnimationFrame(async () => {
            if (!this.canvas) return;
            this.setupWebGL();
            await this.setupShaders();
            await this.setupTextures();
            this.discoverUniforms();
            this.setupObservers();
            this.registerListeners();
            this.lastFrameTime = performance.now() / 1000;
            this.animate();
        });
    }

    cycleShader() {
        this.activeShader.set(
            Object.keys(shaderFragmentPathMap)[
                (Object.keys(shaderFragmentPathMap).indexOf(this.activeShader.get()) + 1) %
                    Object.keys(shaderFragmentPathMap).length
            ]
        );
        this.fragmentShaderSource = shaderFragmentPathMap[this.activeShader.get()];
        this.destroy();
        this.init();
    }

    setShader(name) {
        if (!shaderFragmentPathMap[name]) return;
        this.activeShader.set(name);
        this.fragmentShaderSource = shaderFragmentPathMap[name];
        this.destroy();
        this.init();
    }

    setupWebGL() {
        // preserveDrawingBuffer prevents flickering/blank frames during resize
        this.gl =
            this.canvas.getContext("webgl", { preserveDrawingBuffer: true }) ||
            this.canvas.getContext("experimental-webgl", { preserveDrawingBuffer: true });
        if (!this.gl) {
            console.error("WebGL not supported");
            return;
        }

        // Enable necessary extensions
        this.gl.getExtension("OES_standard_derivatives");
        this.gl.getExtension("OES_texture_float");
        this.gl.getExtension("OES_texture_float_linear");

        // Set up viewport
        this.resize(true);
    }

    async loadShader(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load shader: ${path}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error loading shader from ${path}:`, error);
            throw error;
        }
    }

    async setupShaders() {
        // Load shaders - load from files if paths are provided, otherwise use source code directly
        let vertexShaderSource = this.vertexShaderSource;
        let fragmentShaderSource = this.fragmentShaderSource;

        // If shader sources are paths (end with .glsl), load them
        if (!vertexShaderSource) {
            // Default vertex shader if none provided
            vertexShaderSource = `attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;
        } else if (vertexShaderSource.endsWith(".glsl")) {
            vertexShaderSource = await this.loadShader(vertexShaderSource);
        }

        if (fragmentShaderSource.endsWith(".glsl")) {
            fragmentShaderSource = await this.loadShader(fragmentShaderSource);
        }

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        this.program = this.createProgram(vertexShader, fragmentShader);

        // Set up geometry (full screen quad)
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.program, "a_position");
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
    }

    discoverUniforms() {
        // Discover all uniforms from the shader program
        const uniformCount = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS);

        for (let i = 0; i < uniformCount; i++) {
            const uniformInfo = this.gl.getActiveUniform(this.program, i);
            if (uniformInfo) {
                const location = this.gl.getUniformLocation(this.program, uniformInfo.name);
                this.uniformLocations[uniformInfo.name] = {
                    location,
                    type: uniformInfo.type,
                    size: uniformInfo.size,
                    name: uniformInfo.name,
                };
            }
        }
    }

    async setupTextures() {
        // Clean up existing textures
        this.textures.forEach((texture) => {
            if (texture) {
                this.gl.deleteTexture(texture);
            }
        });
        this.textures = [];

        // Set up texture channels (iChannel0-3)
        for (let i = 0; i < Math.min(this.channels.length, 4); i++) {
            const channel = this.channels[i];
            const texture = await this.loadTexture(channel);
            if (texture) {
                this.textures.push(texture);
            } else {
                // Create a default white texture if loading fails
                this.textures.push(this.createDefaultTexture());
            }
        }
    }

    async loadTexture(source) {
        return new Promise((resolve) => {
            const texture = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

            // Set default texture parameters
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

            if (typeof source === "string") {
                // Load from URL
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
                    resolve(texture);
                };
                img.onerror = () => {
                    console.warn(`Failed to load texture from ${source}`);
                    resolve(null);
                };
                img.src = source;
            } else if (
                source instanceof HTMLImageElement ||
                source instanceof HTMLVideoElement ||
                source instanceof HTMLCanvasElement
            ) {
                // Use directly
                this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, source);
                resolve(texture);
            } else if (source instanceof ImageData) {
                // Use ImageData
                this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, source);
                resolve(texture);
            } else {
                resolve(null);
            }
        });
    }

    createDefaultTexture() {
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        // Create a 1x1 white pixel
        const pixel = new Uint8Array([255, 255, 255, 255]);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixel);
        return texture;
    }

    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error("Shader compilation error:", this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error("Program linking error:", this.gl.getProgramInfoLog(program));
            this.gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    setupObservers() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.resizeObserver = new ResizeObserver(this.handleResize);
        const parent = this.canvas.parentElement;
        if (parent) {
            this.resizeObserver.observe(parent);
        }
    }

    registerListeners() {
        document.addEventListener("visibilitychange", this.handleVisibilityChange);

        // Mouse tracking
        this.canvas.addEventListener("mousemove", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = (e.clientX - rect.left) / rect.width;
            this.mouseY = 1.0 - (e.clientY - rect.top) / rect.height; // Flip Y
        });

        this.canvas.addEventListener("mousedown", (e) => {
            this.mouseClick = 1.0;
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = (e.clientX - rect.left) / rect.width;
            this.mouseY = 1.0 - (e.clientY - rect.top) / rect.height;
        });

        this.canvas.addEventListener("mouseup", () => {
            this.mouseClick = 0.0;
            this.mouseDrag = 0.0;
        });

        this.canvas.addEventListener("mouseleave", () => {
            this.mouseClick = 0.0;
            this.mouseDrag = 0.0;
        });

        this.canvas.addEventListener("mousemove", (e) => {
            if (this.mouseClick > 0.5) {
                this.mouseDrag = 1.0;
            }
        });
    }

    handleResize() {
        // Mark that a resize is pending - will be handled in the animation loop
        // This prevents blank frames by keeping the old content until we redraw
        this.pendingResize = true;
    }

    handleVisibilityChange() {
        this.isHidden = document.hidden;
        if (this.isHidden) {
            if (this.animationFrame) {
                cancelAnimationFrame(this.animationFrame);
                this.animationFrame = null;
            }
        } else {
            this.lastFrameTime = performance.now() / 1000;
            this.animate();
        }
    }

    resize(force = false) {
        if (!this.canvas) return;
        const parent = this.canvas.parentElement;
        if (!parent) return;

        const dpr = window.devicePixelRatio || 1;
        // Get actual rendered size from getBoundingClientRect to respect CSS sizing
        const rect = this.canvas.getBoundingClientRect();
        let width = Math.floor(rect.width * dpr);
        let height = Math.floor(rect.height * dpr);

        // Apply resolution limit if set (e.g., 1080 for 1080p max)
        if (this.maxResolution && height > this.maxResolution) {
            const scale = this.maxResolution / height;
            width = Math.floor(width * scale);
            height = this.maxResolution;
        }

        if (!force && this.canvas.width === width && this.canvas.height === height) return;

        // Set internal canvas resolution (for WebGL rendering)
        this.canvas.width = width;
        this.canvas.height = height;
        // Don't set style.width/height - let CSS handle sizing

        if (this.gl) {
            this.gl.viewport(0, 0, width, height);
        }
    }

    setUniform(name, value) {
        const uniform = this.uniformLocations[name];
        if (!uniform || !uniform.location) return;

        const gl = this.gl;
        const loc = uniform.location;

        switch (uniform.type) {
            case gl.FLOAT:
                gl.uniform1f(loc, value);
                break;
            case gl.FLOAT_VEC2:
                gl.uniform2f(loc, value[0], value[1]);
                break;
            case gl.FLOAT_VEC3:
                gl.uniform3f(loc, value[0], value[1], value[2]);
                break;
            case gl.FLOAT_VEC4:
                gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
                break;
            case gl.INT:
            case gl.SAMPLER_2D:
                gl.uniform1i(loc, value);
                break;
            case gl.INT_VEC2:
                gl.uniform2i(loc, value[0], value[1]);
                break;
            case gl.INT_VEC3:
                gl.uniform3i(loc, value[0], value[1], value[2]);
                break;
            case gl.INT_VEC4:
                gl.uniform4i(loc, value[0], value[1], value[2], value[3]);
                break;
            case gl.FLOAT_MAT2:
                gl.uniformMatrix2fv(loc, false, value);
                break;
            case gl.FLOAT_MAT3:
                gl.uniformMatrix3fv(loc, false, value);
                break;
            case gl.FLOAT_MAT4:
                gl.uniformMatrix4fv(loc, false, value);
                break;
        }
    }

    animate() {
        if (!this.gl || this.isHidden) return;

        // Handle pending resize - do it here so we resize and draw in the same frame
        // This prevents blank/flickering frames during resize
        const didResize = this.pendingResize;
        if (this.pendingResize) {
            this.pendingResize = false;
            this.resize();
        }

        // Calculate delta time
        const currentTime = performance.now() / 1000;
        this.timeDelta = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        this.time += this.timeDelta;
        this.frame++;

        // Frame skipping for half frame rate mode
        // Always render after resize to prevent blank frames, even on skip frames
        if (this.halfFrameRate && !didResize) {
            this.skipFrame = !this.skipFrame;
            if (this.skipFrame) {
                this.animationFrame = requestAnimationFrame(() => this.animate());
                return;
            }
        }

        this.gl.useProgram(this.program);

        const dpr = window.devicePixelRatio || 1;
        const resolution = [this.canvas.width, this.canvas.height];
        const resolution3 = [this.canvas.width, this.canvas.height, dpr];

        // Set up Shadertoy-standard uniforms (if shadertoyMode is enabled or uniform exists)
        if (this.shadertoyMode || this.uniformLocations["iTime"]) {
            // iTime - current time in seconds
            this.setUniform("iTime", this.time);

            // iTimeDelta - time since last frame
            this.setUniform("iTimeDelta", this.timeDelta);

            // iFrame - frame number
            this.setUniform("iFrame", this.frame);

            // iResolution - resolution (vec3: width, height, pixel ratio)
            this.setUniform("iResolution", resolution3);

            // iMouse - mouse position and click state (vec4: x, y, click, drag)
            this.setUniform("iMouse", [
                this.mouseX * this.canvas.width,
                this.mouseY * this.canvas.height,
                this.mouseClick,
                this.mouseDrag,
            ]);

            // iDate - date/time info (vec4: year, month, day, seconds)
            const now = new Date();
            const seconds =
                now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
            this.setUniform("iDate", [now.getFullYear(), now.getMonth() + 1, now.getDate(), seconds]);

            // iChannel0-3 - texture channels
            for (let i = 0; i < 4; i++) {
                const channelName = `iChannel${i}`;
                if (this.uniformLocations[channelName]) {
                    this.gl.activeTexture(this.gl.TEXTURE0 + i);
                    if (this.textures[i]) {
                        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[i]);
                    } else {
                        // Bind default white texture if no channel provided
                        const defaultTex = this.createDefaultTexture();
                        this.gl.bindTexture(this.gl.TEXTURE_2D, defaultTex);
                    }
                    this.setUniform(channelName, i);
                }
            }

            // iChannelResolution - channel resolutions (array of vec3)
            for (let i = 0; i < 4; i++) {
                const resName = `iChannelResolution[${i}]`;
                if (this.uniformLocations[resName]) {
                    // For now, use canvas resolution. Could be enhanced to track actual texture sizes
                    this.setUniform(resName, resolution3);
                }
            }
        }

        // Legacy u_* uniform names for backward compatibility (always set if they exist)
        this.setUniform("u_time", this.time);
        this.setUniform("u_resolution", resolution);
        this.setUniform("u_mouse", [this.mouseX, this.mouseY]);

        // Set custom uniforms
        for (const [name, value] of Object.entries(this.customUniforms)) {
            this.setUniform(name, value);
        }

        // Draw
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    /**
     * Update a custom uniform value
     * @param {string} name - Uniform name
     * @param {any} value - Uniform value
     */
    updateUniform(name, value) {
        this.customUniforms[name] = value;
    }

    /**
     * Update texture channel
     * @param {number} index - Channel index (0-3)
     * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement|ImageData|string} source - Texture source
     */
    async updateChannel(index, source) {
        if (index < 0 || index > 3) return;
        this.channels[index] = source;
        const texture = await this.loadTexture(source);
        if (texture) {
            if (this.textures[index]) {
                this.gl.deleteTexture(this.textures[index]);
            }
            this.textures[index] = texture;
        }
    }

    /**
     * Enable or disable half frame rate mode
     * @param {boolean} enabled - Whether to skip every other frame
     */
    setHalfFrameRate(enabled) {
        this.halfFrameRate = enabled;
        this.skipFrame = false; // Reset skip state
    }

    /**
     * Set maximum resolution limit
     * @param {number|null} maxHeight - Maximum height in pixels (e.g., 1080 for 1080p), or null for unlimited
     */
    setMaxResolution(maxHeight) {
        this.maxResolution = maxHeight;
        this.resize(true); // Force resize to apply new limit
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.textures.forEach((texture) => {
            if (texture) {
                this.gl.deleteTexture(texture);
            }
        });
        if (this.program) {
            this.gl.deleteProgram(this.program);
        }
    }
}
