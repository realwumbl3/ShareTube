precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

// --- QUANTUM VOID AESTHETIC ---
// A deep, mysterious space with shifting energy fields and void distortions
const vec3 C_VOID_DEEP = vec3(0.01, 0.005, 0.02);      // Deep purple void
const vec3 C_VOID_MID = vec3(0.02, 0.01, 0.05);        // Mid void purple
const vec3 C_ENERGY_PRIMARY = vec3(0.2, 0.05, 0.4);    // Purple energy
const vec3 C_ENERGY_ACCENT = vec3(0.15, 0.3, 0.6);     // Blue-cyan accent
const vec3 C_CORE_GLOW = vec3(0.6, 0.2, 0.8);          // Bright purple glow
const vec3 C_EDGE_HIGHLIGHT = vec3(0.3, 0.5, 1.0);     // Electric blue

// Visual parameters
const float FIELD_INTENSITY = 0.7;
const float DISTORTION_STRENGTH = 0.15;
const float DEPTH_LAYERS = 8.0;
const float ENERGY_PULSE_SPEED = 0.25;

// --- HASH & NOISE FUNCTIONS ---

// Hash for pseudo-random values
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Smooth hash for gradients
float hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Value noise
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // Smooth interpolation
    
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal Brownian Motion
float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for(int i = 0; i < 6; i++) {
        value += amplitude * noise(p * frequency);
        frequency *= 2.1;
        amplitude *= 0.45;
    }
    return value;
}

// Rotating noise for energy fields
float rotatingNoise(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    mat2 rot = mat2(c, -s, s, c);
    return noise(rot * p);
}

// --- QUANTUM FIELD FUNCTIONS ---

// Create energy field distortions
vec2 quantumDistortion(vec2 p, float t) {
    float angle1 = t * 0.3;
    float angle2 = t * 0.5 + 2.0;
    
    vec2 distort = vec2(
        rotatingNoise(p * 1.5 + vec2(t * 0.1), angle1),
        rotatingNoise(p * 1.5 + vec2(0.0, t * 0.12), angle2)
    );
    
    return distort * 2.0 - 1.0;
}

// Void depth calculation - creates layered depth perception
float voidDepth(vec2 p, float t, float layer) {
    float scale = 2.0 + layer * 0.5;
    float speed = t * (0.05 + layer * 0.01);
    
    vec2 distorted = p + quantumDistortion(p * 0.5, speed) * 0.3;
    return fbm(distorted * scale + speed);
}

// Energy tendrils - flowing lines of power
float energyTendrils(vec2 p, float t) {
    float result = 0.0;
    
    for(float i = 0.0; i < 5.0; i++) {
        float angle = t * (0.1 + i * 0.05) + i * 2.0;
        float frequency = 2.0 + i * 0.5;
        
        vec2 direction = vec2(cos(angle), sin(angle));
        float wave = sin(dot(p, direction) * frequency + t * 0.5 + i);
        
        // Create tendril thickness variation
        float thickness = 0.015 + 0.01 * sin(t * 2.0 + i * 3.0);
        float tendril = thickness / (abs(wave) + 0.02);
        
        result += tendril * (1.0 - i / 5.0);
    }
    
    return result;
}

// Quantum particles - discrete energy points
float quantumParticles(vec2 p, float t) {
    vec2 grid = fract(p * 20.0) - 0.5;
    vec2 id = floor(p * 20.0);
    
    float h = hash(id);
    float phase = h * 6.28318 + t * (0.5 + h);
    float pulse = 0.5 + 0.5 * sin(phase);
    
    float dist = length(grid);
    float particle = smoothstep(0.15, 0.0, dist) * pulse;
    
    return particle * h;
}

// Void apertures - darker regions that create contrast
float voidApertures(vec2 p, float t) {
    vec2 repeated = fract(p * 3.0) - 0.5;
    vec2 id = floor(p * 3.0);
    
    float h = hash(id);
    if(h < 0.7) return 0.0; // Only some cells have apertures
    
    float radius = 0.2 + 0.1 * sin(t * 0.5 + h * 6.28);
    float dist = length(repeated);
    
    return smoothstep(radius, radius - 0.1, dist);
}

// --- MAIN ---
void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 st = uv * 2.0 - 1.0;
    st.x *= u_resolution.x / u_resolution.y;
    
    float t = u_time * ENERGY_PULSE_SPEED;
    
    // Mouse parallax effect
    vec2 mouseOffset = (u_mouse - 0.5) * 0.3;
    vec2 pos = st - mouseOffset;
    
    // Initialize color with void gradient
    float radialGrad = length(uv - 0.5);
    vec3 color = mix(C_VOID_MID, C_VOID_DEEP, radialGrad * 1.5);
    
    // --- LAYERED DEPTH FIELD ---
    // Create multiple depth layers for parallax effect
    for(float layer = 0.0; layer < DEPTH_LAYERS; layer++) {
        float depth = layer / DEPTH_LAYERS;
        float parallaxOffset = depth * 0.2;
        
        vec2 layerPos = pos * (1.0 + depth * 0.3) + mouseOffset * parallaxOffset;
        float depthField = voidDepth(layerPos, t, layer);
        
        // Color based on depth
        vec3 layerColor = mix(C_ENERGY_PRIMARY, C_ENERGY_ACCENT, depth);
        float intensity = depthField * (1.0 - depth * 0.7) * FIELD_INTENSITY;
        
        color += layerColor * intensity * 0.15;
    }
    
    // --- QUANTUM DISTORTION EFFECTS ---
    vec2 distortion = quantumDistortion(pos, t) * DISTORTION_STRENGTH;
    vec2 distortedPos = pos + distortion;
    
    // Apply distortion-based coloring
    float distortionMag = length(distortion);
    color += C_CORE_GLOW * distortionMag * 0.4;
    
    // --- ENERGY TENDRILS ---
    float tendrils = energyTendrils(distortedPos, t);
    vec3 tendrilColor = mix(C_ENERGY_ACCENT, C_EDGE_HIGHLIGHT, tendrils);
    color += tendrilColor * tendrils * 0.3;
    
    // --- QUANTUM PARTICLES ---
    float particles = quantumParticles(pos * 0.5 + vec2(t * 0.1, t * 0.05), t);
    color += C_EDGE_HIGHLIGHT * particles * 0.8;
    
    // --- VOID APERTURES (Dark spots for contrast) ---
    float apertures = voidApertures(pos * 0.8 + distortion, t);
    color *= 1.0 - apertures * 0.7;
    
    // --- ENERGY CORE (Bright focal point) ---
    float coreDist = length(pos - vec2(sin(t * 0.3) * 0.2, cos(t * 0.25) * 0.15));
    float core = 1.0 / (coreDist * 8.0 + 1.0);
    core *= 0.5 + 0.5 * sin(t * 2.0);
    color += C_CORE_GLOW * core;
    
    // --- EDGE GLOW ---
    // Brighten edges that move with mouse
    float edgeFactor = 1.0 - smoothstep(0.0, 1.0, radialGrad);
    color += C_ENERGY_ACCENT * edgeFactor * 0.1;
    
    // --- POST PROCESSING ---
    
    // Vignette for focus
    float vignette = 1.0 - smoothstep(0.4, 1.4, radialGrad);
    color *= 0.3 + 0.7 * vignette;
    
    // Subtle color grading
    color = pow(color, vec3(0.95)); // Slight gamma adjustment
    
    // Contrast enhancement
    color = smoothstep(-0.1, 1.1, color);
    
    // Add subtle noise for texture
    float grain = hash(uv + t) * 0.03;
    color += grain;
    
    // Final clamp and output
    color = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);
}

