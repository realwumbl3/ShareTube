precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

// --- PS3 XMB LIQUID GLASS AESTHETIC ---
// The iconic flowing ribbons and glassy waves

// Color palette - the classic PS3 blue theme with warm accents
const vec3 C_DEEP_SPACE    = vec3(0.008, 0.012, 0.035);   // Near-black blue
const vec3 C_OCEAN_DEEP    = vec3(0.02, 0.06, 0.18);      // Deep blue
const vec3 C_WAVE_BLUE     = vec3(0.1, 0.35, 0.65);       // Mid wave blue
const vec3 C_GLASS_CYAN    = vec3(0.2, 0.55, 0.85);       // Bright glass cyan
const vec3 C_GLASS_WHITE   = vec3(0.7, 0.85, 1.0);        // Glass highlight
const vec3 C_WARM_ACCENT   = vec3(0.95, 0.6, 0.3);        // Warm orange accent
const vec3 C_PURPLE_TINT   = vec3(0.4, 0.2, 0.6);         // Purple undertone

// Visual tuning
const float WAVE_SPEED = 0.08;
const float WAVE_COMPLEXITY = 6.0;
const float GLASS_INTENSITY = 0.7;
const float RIBBON_GLOW = 0.5;
const float PARALLAX_STRENGTH = 0.06;

// --- NOISE FUNCTIONS ---

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
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
    for (int i = 0; i < 6; i++) {
        if (i >= octaves) break;
        value += amplitude * snoise(st * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// --- PS3 WAVE FUNCTION ---
// Creates the iconic flowing ribbon waves
float ps3Wave(vec2 uv, float time, float offset, float freq, float amp) {
    // Primary wave with slow horizontal drift
    float wave = sin(uv.x * freq + time + offset) * amp;
    
    // Add subtle noise modulation for organic feel
    wave += snoise(vec2(uv.x * 2.0 + time * 0.3, offset)) * amp * 0.3;
    
    // Secondary harmonic for complexity
    wave += sin(uv.x * freq * 1.7 + time * 1.3 + offset * 2.0) * amp * 0.4;
    
    return wave;
}

// --- GLASS REFLECTION CALCULATION ---
// Simulates the glossy, reflective quality of the PS3 interface
float glassReflection(vec2 uv, float waveHeight, float time) {
    // Fresnel-like effect based on "viewing angle" (y position relative to wave)
    float fresnel = pow(1.0 - abs(waveHeight), 3.0);
    
    // Specular highlight that moves with time
    float specular = smoothstep(0.7, 1.0, 
        sin(uv.x * 8.0 + time * 0.5) * 0.5 + 0.5) * fresnel;
    
    // Add subtle ripple reflections
    float ripple = snoise(uv * 15.0 + time * 0.2) * 0.1 * fresnel;
    
    return specular + ripple;
}

// --- LIQUID DISTORTION ---
// Creates the fluid, liquid-like movement
vec2 liquidDistort(vec2 uv, float time) {
    vec2 distortion;
    distortion.x = snoise(uv * 3.0 + time * 0.15) * 0.02;
    distortion.y = snoise(uv * 3.0 + vec2(5.0, 0.0) + time * 0.12) * 0.02;
    return distortion;
}

// --- BOKEH PARTICLES ---
// Soft, out-of-focus light orbs floating in the background
float bokeh(vec2 uv, vec2 center, float size, float softness) {
    float dist = length(uv - center);
    return smoothstep(size, size * softness, dist);
}

void main() {
    // Setup coordinates
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 st = uv;
    st.x *= u_resolution.x / u_resolution.y;
    
    float time = u_time * WAVE_SPEED;
    
    // Parallax from mouse
    vec2 mouseDelta = (u_mouse - 0.5) * PARALLAX_STRENGTH;
    vec2 pos = st + mouseDelta;
    
    // Apply liquid distortion
    vec2 distortedPos = pos + liquidDistort(pos, u_time * 0.3);
    
    // --- 1. DEEP BACKGROUND GRADIENT ---
    // Classic PS3 gradient from dark bottom to slightly lighter top
    float bgGradient = uv.y * 0.6 + 0.2;
    bgGradient += snoise(pos * 2.0 + time * 0.5) * 0.08;
    vec3 color = mix(C_DEEP_SPACE, C_OCEAN_DEEP, bgGradient);
    
    // Add subtle purple undertone shifting with time
    float purpleShift = sin(time * 2.0) * 0.5 + 0.5;
    color = mix(color, C_PURPLE_TINT * 0.15, purpleShift * 0.3 * (1.0 - uv.y));
    
    // --- 2. FLOWING RIBBON WAVES ---
    // Multiple layers of PS3-style ribbons
    float ribbonAccum = 0.0;
    vec3 ribbonColor = vec3(0.0);
    
    for (float i = 0.0; i < WAVE_COMPLEXITY; i++) {
        float layerOffset = i * 0.8;
        float layerDepth = (i + 1.0) / WAVE_COMPLEXITY;
        
        // Wave parameters vary per layer
        float freq = 2.5 + i * 0.4;
        float amp = 0.12 - i * 0.012;
        float speed = time * (1.0 + i * 0.15);
        
        // Calculate wave position
        float waveY = 0.3 + i * 0.1 + ps3Wave(distortedPos, speed, layerOffset, freq, amp);
        
        // Apply parallax depth per layer
        waveY += mouseDelta.y * (1.0 + i * 0.5);
        
        // Distance to wave ribbon
        float distToWave = abs(distortedPos.y - waveY);
        
        // Ribbon thickness varies
        float thickness = 0.025 + sin(distortedPos.x * 3.0 + speed) * 0.008;
        
        // Soft ribbon edge with glow
        float ribbon = smoothstep(thickness, 0.0, distToWave);
        float ribbonGlow = smoothstep(thickness * 4.0, 0.0, distToWave) * 0.3;
        
        // Glass effect on ribbon
        float glass = glassReflection(distortedPos, ribbon, u_time * 0.3 + i);
        
        // Color gradient along each ribbon (shifts from blue to cyan)
        float colorShift = sin(distortedPos.x * 2.0 + speed + i) * 0.5 + 0.5;
        vec3 layerColor = mix(C_WAVE_BLUE, C_GLASS_CYAN, colorShift);
        
        // Add warm accent on some waves
        if (mod(i, 3.0) < 1.0) {
            layerColor = mix(layerColor, C_WARM_ACCENT, 0.15 * sin(time * 3.0 + i) * 0.5 + 0.5);
        }
        
        // Add glass highlight
        layerColor += C_GLASS_WHITE * glass * GLASS_INTENSITY;
        
        // Accumulate with depth-based opacity
        float opacity = (ribbon + ribbonGlow) * layerDepth * 0.8;
        ribbonColor += layerColor * opacity;
        ribbonAccum += opacity;
    }
    
    // Blend ribbons with background
    color = mix(color, ribbonColor, min(ribbonAccum, 0.9));
    
    // --- 3. GLASS SURFACE REFLECTIONS ---
    // Overall glossy sheen that moves across the screen
    float globalReflection = 0.0;
    
    // Horizontal light sweep
    float sweep = sin(distortedPos.x * 1.5 - time * 0.8) * 0.5 + 0.5;
    sweep = pow(sweep, 8.0) * 0.3;
    globalReflection += sweep;
    
    // Diagonal highlight bands
    float diagonal = sin((distortedPos.x + distortedPos.y) * 4.0 + time) * 0.5 + 0.5;
    diagonal = pow(diagonal, 12.0) * 0.2;
    globalReflection += diagonal;
    
    color += C_GLASS_WHITE * globalReflection * (0.3 + ribbonAccum * 0.5);
    
    // --- 4. FLOATING BOKEH LIGHTS ---
    float bokehAccum = 0.0;
    vec3 bokehColor = vec3(0.0);
    
    for (float i = 0.0; i < 8.0; i++) {
        // Pseudo-random positions based on index
        float px = fract(sin(i * 127.1) * 43758.5453);
        float py = fract(sin(i * 269.5) * 43758.5453);
        
        // Animate positions slowly
        vec2 bokehPos = vec2(
            px + sin(time * (0.3 + i * 0.1) + i) * 0.15,
            py + cos(time * (0.2 + i * 0.08) + i * 2.0) * 0.1
        );
        
        // Parallax for bokeh
        bokehPos += mouseDelta * (0.5 + i * 0.2);
        
        // Size varies
        float size = 0.02 + fract(sin(i * 783.2) * 43758.5) * 0.04;
        
        // Pulsing intensity
        float pulse = sin(u_time * (0.5 + i * 0.2) + i * 3.0) * 0.3 + 0.7;
        
        float b = bokeh(pos, bokehPos, size, 0.3) * pulse;
        
        // Color varies per bokeh
        vec3 bColor = mix(C_GLASS_CYAN, C_GLASS_WHITE, fract(i * 0.37));
        if (mod(i, 4.0) < 1.0) {
            bColor = mix(bColor, C_WARM_ACCENT, 0.5);
        }
        
        bokehAccum += b * 0.15;
        bokehColor += bColor * b * 0.15;
    }
    
    color += bokehColor;
    
    // --- 5. AMBIENT LIGHT WASH ---
    // Soft color gradient overlay that shifts
    float ambientWave = sin(uv.x * 3.14159 + time * 0.5) * 0.5 + 0.5;
    vec3 ambientColor = mix(C_WAVE_BLUE, C_PURPLE_TINT, ambientWave);
    color += ambientColor * 0.05 * (1.0 - uv.y);
    
    // --- 6. EDGE HIGHLIGHT ---
    // Subtle bright edge at wave intersections
    float edgeGlow = fbm(distortedPos * 8.0 + time, 3);
    edgeGlow = smoothstep(0.3, 0.8, edgeGlow) * ribbonAccum;
    color += C_GLASS_WHITE * edgeGlow * 0.1;
    
    // --- 7. POST PROCESSING ---
    
    // Soft central glow
    float centerGlow = 1.0 - length(uv - vec2(0.5) - mouseDelta * 0.5);
    centerGlow = pow(max(centerGlow, 0.0), 2.0);
    color += C_OCEAN_DEEP * centerGlow * 0.2;
    
    // Vignette - darker edges for depth
    float vignette = 1.0 - smoothstep(0.4, 1.4, length(uv - 0.5));
    color *= mix(0.6, 1.0, vignette);
    
    // Subtle film grain for texture
    float grain = snoise(gl_FragCoord.xy * 0.5 + u_time * 100.0) * 0.015;
    color += grain;
    
    // Tone mapping - enhance contrast while keeping the glassy feel
    color = pow(color, vec3(0.95)); // Slight gamma lift
    color = smoothstep(-0.02, 1.02, color);
    
    // Final saturation boost
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 1.15);
    
    gl_FragColor = vec4(color, 1.0);
}


