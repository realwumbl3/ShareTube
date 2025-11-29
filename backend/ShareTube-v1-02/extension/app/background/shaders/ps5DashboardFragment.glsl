precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

// --- PS5 DASHBOARD AESTHETIC CONFIG ---
// Deep, rich colors inspired by the console interface
const vec3 C_DEEP_BLUE = vec3(0.0, 0.02, 0.1);   // Darkest background
const vec3 C_MID_TEAL  = vec3(0.0, 0.15, 0.35);  // Mid-tone atmosphere
const vec3 C_ACCENT    = vec3(0.0, 0.6, 0.9);    // Bright accent cyan
const vec3 C_GLOW      = vec3(0.5, 0.7, 1.0);    // White/Blue glow

// Adjustable Visual Constants
const float GLOW_STRENGTH = 0.6;
const float PARTICLE_DENSITY = 0.35;
const float RIBBON_INTENSITY = 0.4;
const float PARALLAX_DEPTH = 0.08;

// --- NOISE UTILITIES ---

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

// Simplex Noise (Standard 2D)
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

// Fractional Brownian Motion for layered detail
float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    // Loop fewer times for performance on mobile, but enough for detail
    for (int i = 0; i < 4; i++) {
        value += amplitude * snoise(st);
        st *= 2.1; // Lacunarity
        amplitude *= 0.5;
    }
    return value;
}

// Domain Warping for fluid-like motion
float warp(vec2 st, float t) {
    vec2 q = vec2(0.);
    q.x = fbm(st + vec2(0.0, 0.0) + t * 0.1);
    q.y = fbm(st + vec2(5.2, 1.3) + t * 0.08);
    
    vec2 r = vec2(0.);
    r.x = fbm(st + 4.0 * q + vec2(1.7, 9.2) + t * 0.15);
    r.y = fbm(st + 4.0 * q + vec2(8.3, 2.8) + t * 0.126);
    
    return fbm(st + 4.0 * r);
}

void main() {
    // Setup coordinates
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 st = uv; 
    st.x *= u_resolution.x / u_resolution.y; // Correct aspect ratio for shapes
    
    float time = u_time * 0.15; // Slow, premium drift
    
    // Calculate Parallax
    // u_mouse is 0..1. Map to -0.5..0.5
    vec2 mouseDelta = (u_mouse - 0.5) * PARALLAX_DEPTH;
    
    // Apply parallax to the 'world' coordinates
    vec2 pos = st + mouseDelta;
    
    // --- 1. BACKGROUND GRADIENT ---
    // Deep vertical fade from blue-black to teal
    float gradient = uv.y; 
    vec3 color = mix(C_DEEP_BLUE, C_MID_TEAL, gradient * 0.7 + 0.1);
    
    // --- 2. VOLUMETRIC FLOW (The Smoke/Mist) ---
    // Use domain warping to create fluid, billowy shapes
    float flow = warp(pos * 1.2, time);
    
    // Add soft highlights where the flow is dense
    float cloud = smoothstep(0.3, 0.9, flow);
    color = mix(color, C_ACCENT, cloud * 0.15); // Subtle teal mix
    
    // --- 3. ENERGY RIBBONS ---
    // Glowing lines that weave through the scene
    float ribbonMask = 0.0;
    float t = u_time * 0.2;
    
    // Layer a few sine waves
    for(float i = 0.0; i < 3.0; i++) {
        // Create a wave coordinate
        float wave = sin(pos.x * 1.8 + t + i * 2.5 + flow * 0.5) * 0.25;
        // Distance to the line
        float dist = abs(pos.y - 0.5 - wave + mouseDelta.y * i * 2.0);
        
        // Make it glowy (inverse distance)
        float line = 0.008 / (dist + 0.005);
        
        // Fade out edges and combine
        ribbonMask += line * (0.1 + 0.1 * sin(t * 3.0 + i));
    }
    
    // Add ribbons with additive blending
    color += C_ACCENT * ribbonMask * RIBBON_INTENSITY * flow; 
    
    // --- 4. FLOATING PARTICLES ---
    // High frequency noise layer
    vec2 particlePos = pos * 15.0 + vec2(time * 0.5, time * 0.2);
    float noiseVal = snoise(particlePos);
    
    // Threshold to get tiny specks
    float sparkles = step(0.8, noiseVal) * noiseVal;
    
    // Twinkle animation
    sparkles *= (0.5 + 0.5 * sin(u_time * 5.0 + pos.x * 20.0));
    
    // Mask particles to be more visible in bright areas (optional) or everywhere
    color += C_GLOW * sparkles * PARTICLE_DENSITY;
    
    // --- 5. POST PROCESSING ---
    
    // Bloom/Glow (simulated) - Radial gradient from mouse/center
    float glowDist = length(uv - vec2(0.5) - mouseDelta);
    float glow = 1.0 - smoothstep(0.0, 1.2, glowDist);
    color += C_MID_TEAL * glow * GLOW_STRENGTH * 0.3;
    
    // Vignette - Darken corners
    float vignette = 1.0 - smoothstep(0.5, 1.5, length(uv - 0.5));
    color *= vignette;
    
    // Tone Mapping / Contrast
    // Enhance darks and boost brights slightly
    color = smoothstep(-0.05, 1.05, color);
    
    // Output
    gl_FragColor = vec4(color, 1.0);
}

