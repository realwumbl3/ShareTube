precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

// --- COLOR PALETTE ---
const vec3 C_DEEP_PURPLE = vec3(0.05, 0.02, 0.12);
const vec3 C_DARK_BLUE = vec3(0.08, 0.1, 0.2);
const vec3 C_MID_CYAN = vec3(0.0, 0.4, 0.6);
const vec3 C_BRIGHT_CYAN = vec3(0.2, 0.8, 1.0);
const vec3 C_ACCENT_PURPLE = vec3(0.5, 0.2, 0.8);
const vec3 C_WHITE_GLOW = vec3(0.9, 0.95, 1.0);

// --- VISUAL PARAMETERS ---
const float FLOW_SPEED = 0.12;
const float PARTICLE_SPEED = 0.3;
const float RIBBON_SPEED = 0.25;
const float PARALLAX_STRENGTH = 0.12;
const float GLOW_INTENSITY = 0.4;
const float PARTICLE_DENSITY = 0.5;

// --- NOISE FUNCTIONS ---

vec3 mod289(vec3 x) { 
    return x - floor(x * (1.0 / 289.0)) * 289.0; 
}

vec2 mod289(vec2 x) { 
    return x - floor(x * (1.0 / 289.0)) * 289.0; 
}

vec3 permute(vec3 x) { 
    return mod289(((x * 34.0) + 1.0) * x); 
}

// Simplex Noise
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// Fractional Brownian Motion
float fbm(vec2 st, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for (int i = 0; i < 5; i++) {
        if (i >= octaves) break;
        value += amplitude * snoise(st * frequency);
        frequency *= 2.1;
        amplitude *= 0.5;
    }
    return value;
}

// Advanced Domain Warping for fluid motion
vec2 domainWarp(vec2 p, float t) {
    vec2 q = vec2(
        fbm(p + vec2(0.0, 0.0) + t * 0.1, 4),
        fbm(p + vec2(5.2, 1.3) + t * 0.08, 4)
    );
    
    vec2 r = vec2(
        fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.15, 4),
        fbm(p + 4.0 * q + vec2(8.3, 2.8) + t * 0.12, 4)
    );
    
    return fbm(p + 4.0 * r + vec2(0.0, 0.0), 4) * vec2(1.0, 1.0);
}

// Rotate 2D vector
vec2 rotate2D(vec2 v, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec2(
        v.x * c - v.y * s,
        v.x * s + v.y * c
    );
}

void main() {
    // Normalized coordinates
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 st = uv;
    st.x *= u_resolution.x / u_resolution.y;
    
    float t = u_time * FLOW_SPEED;
    
    // Mouse parallax effect
    vec2 mouseOffset = (u_mouse - 0.5) * PARALLAX_STRENGTH;
    vec2 pos = st + mouseOffset;
    
    // --- 1. MULTI-LAYER BACKGROUND GRADIENT ---
    float verticalGrad = uv.y;
    float horizontalGrad = uv.x;
    
    // Base gradient with diagonal influence
    vec3 color = mix(C_DEEP_PURPLE, C_DARK_BLUE, verticalGrad * 0.8);
    color = mix(color, C_DARK_BLUE, horizontalGrad * 0.3);
    
    // Add subtle radial gradient from center
    float centerDist = length(uv - 0.5);
    color = mix(color, C_MID_CYAN, (1.0 - smoothstep(0.0, 0.8, centerDist)) * 0.15);
    
    // --- 2. ADVANCED VOLUMETRIC FLOW ---
    vec2 warped = domainWarp(pos * 1.5, t);
    float flow = fbm(pos * 1.2 + warped * 0.3, 5);
    
    // Create multiple flow layers with different speeds
    float flow1 = fbm(pos * 1.0 + vec2(t * 0.1, t * 0.15), 4);
    float flow2 = fbm(pos * 1.5 + vec2(-t * 0.08, t * 0.12), 4);
    float flow3 = fbm(pos * 2.0 + vec2(t * 0.12, -t * 0.1), 3);
    
    // Combine flows with varying intensities
    float combinedFlow = flow1 * 0.5 + flow2 * 0.3 + flow3 * 0.2;
    
    // Create cloud-like formations
    float clouds = smoothstep(0.2, 0.85, combinedFlow);
    float cloudEdges = smoothstep(0.3, 0.7, combinedFlow) * (1.0 - smoothstep(0.7, 0.9, combinedFlow));
    
    // Add cyan glow to clouds
    color = mix(color, C_MID_CYAN, clouds * 0.2);
    color = mix(color, C_BRIGHT_CYAN, cloudEdges * 0.3);
    
    // --- 3. DYNAMIC ENERGY RIBBONS ---
    float ribbonIntensity = 0.0;
    float ribbonTime = u_time * RIBBON_SPEED;
    
    // Create multiple ribbon layers
    for (float i = 0.0; i < 4.0; i++) {
        float layer = i;
        float phase = layer * 1.57; // ~PI/2
        
        // Rotate coordinate space for variety
        vec2 rotPos = rotate2D(pos, phase + ribbonTime * 0.1);
        
        // Create flowing wave pattern
        float wave = sin(rotPos.x * 2.0 + ribbonTime + layer * 2.0 + combinedFlow * 0.5) * 0.3;
        float dist = abs(rotPos.y - 0.5 - wave + mouseOffset.y * layer * 1.5);
        
        // Glowing line effect
        float line = 0.01 / (dist + 0.008);
        
        // Pulsing intensity
        float pulse = 0.3 + 0.2 * sin(ribbonTime * 2.0 + layer * 3.0);
        
        // Color variation per layer
        vec3 ribbonColor = mix(C_BRIGHT_CYAN, C_ACCENT_PURPLE, layer * 0.25);
        
        ribbonIntensity += line * pulse;
        color += ribbonColor * line * pulse * 0.15;
    }
    
    // --- 4. ENHANCED PARTICLE SYSTEM ---
    vec2 particleCoord = pos * 20.0 + vec2(t * PARTICLE_SPEED, t * PARTICLE_SPEED * 0.7);
    
    // Multiple noise layers for particle distribution
    float particles1 = snoise(particleCoord);
    float particles2 = snoise(particleCoord * 1.3 + vec2(10.0, 5.0));
    float particles3 = snoise(particleCoord * 0.7 - vec2(5.0, 10.0));
    
    // Combine and threshold
    float particleField = (particles1 + particles2 * 0.5 + particles3 * 0.3) / 1.8;
    float sparkles = smoothstep(0.75, 0.95, particleField);
    
    // Twinkle effect
    float twinkle = 0.5 + 0.5 * sin(u_time * 6.0 + pos.x * 25.0 + pos.y * 15.0);
    sparkles *= twinkle;
    
    // Size variation
    float sizeVariation = 0.8 + 0.2 * sin(u_time * 3.0 + pos.x * 10.0);
    sparkles *= sizeVariation;
    
    // Add particles with glow
    color += C_WHITE_GLOW * sparkles * PARTICLE_DENSITY;
    color += C_BRIGHT_CYAN * sparkles * PARTICLE_DENSITY * 0.3;
    
    // --- 5. MOUSE INTERACTIVE GLOW ---
    vec2 mousePos = u_mouse;
    float mouseDist = length(uv - mousePos);
    float mouseGlow = 1.0 - smoothstep(0.0, 0.4, mouseDist);
    mouseGlow = pow(mouseGlow, 2.0);
    
    color += C_BRIGHT_CYAN * mouseGlow * GLOW_INTENSITY * 0.4;
    
    // --- 6. POST-PROCESSING ---
    
    // Radial glow from center
    float centerGlow = 1.0 - smoothstep(0.0, 1.0, centerDist);
    color += C_MID_CYAN * centerGlow * GLOW_INTENSITY * 0.2;
    
    // Vignette
    float vignette = 1.0 - smoothstep(0.4, 1.2, centerDist);
    color *= mix(0.7, 1.0, vignette);
    
    // Color grading and contrast
    color = pow(color, vec3(0.95)); // Slight gamma adjustment
    color = smoothstep(-0.05, 1.05, color); // Enhance contrast
    
    // Subtle color shift based on flow
    color = mix(color, color * vec3(1.0, 1.05, 1.1), combinedFlow * 0.1);
    
    gl_FragColor = vec4(color, 1.0);
}

