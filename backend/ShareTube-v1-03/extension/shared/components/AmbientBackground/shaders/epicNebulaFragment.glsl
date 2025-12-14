precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

// --- SINGULARITY: Gravitational Lensing Aesthetic ---
// Deep void with warped light, inspired by black hole physics

const vec3 C_VOID = vec3(0.0, 0.0, 0.0);
const vec3 C_CORE = vec3(0.02, 0.0, 0.05);
const vec3 C_PLASMA_A = vec3(0.95, 0.3, 0.1);   // Hot orange
const vec3 C_PLASMA_B = vec3(0.1, 0.4, 0.95);   // Cold blue  
const vec3 C_PLASMA_C = vec3(0.7, 0.2, 0.9);    // Violet transition

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// --- NOISE FUNCTIONS ---

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float hash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for(int i = 0; i < 6; i++) {
        if(i >= octaves) break;
        value += amplitude * noise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// --- GRAVITATIONAL LENSING ---

vec2 gravitationalBend(vec2 uv, vec2 center, float mass, float softness) {
    vec2 delta = uv - center;
    float dist = length(delta);
    
    // Schwarzschild-inspired deflection (simplified)
    float deflection = mass / (dist * dist + softness);
    
    // Bend toward the center
    return uv - normalize(delta) * deflection * 0.1;
}

// --- ACCRETION DISK ---

float accretionDisk(vec2 uv, vec2 center, float radius, float thickness, float rotation) {
    vec2 delta = uv - center;
    float dist = length(delta);
    float angle = atan(delta.y, delta.x) + rotation;
    
    // Disk shape with turbulence
    float diskBase = smoothstep(radius * 0.3, radius * 0.5, dist) * 
                     smoothstep(radius * 1.5, radius * 0.9, dist);
    
    // Thickness variation based on angle and noise
    float turbulence = fbm(vec2(angle * 3.0, dist * 10.0 + rotation * 0.5), 4);
    float thicknessVar = thickness * (0.7 + 0.6 * turbulence);
    
    // Vertical falloff (simulating edge-on view tilt)
    float tiltAngle = sin(angle + rotation * 0.3) * 0.15;
    float verticalFade = exp(-abs(delta.y - tiltAngle * dist) * 8.0 / thicknessVar);
    
    return diskBase * verticalFade;
}

// --- LIGHT STREAKS ---

float lightStreak(vec2 uv, vec2 center, float time) {
    vec2 delta = uv - center;
    float dist = length(delta);
    float angle = atan(delta.y, delta.x);
    
    // Spiral pattern
    float spiral = sin(angle * 8.0 - dist * 15.0 + time * 2.0);
    spiral = smoothstep(0.6, 1.0, spiral);
    
    // Radial falloff
    float radialFade = smoothstep(0.0, 0.1, dist) * smoothstep(0.8, 0.2, dist);
    
    return spiral * radialFade * 0.3;
}

// --- DISTANT STARS ---

float starField(vec2 uv, float scale, float time) {
    vec2 cell = floor(uv * scale);
    vec2 local = fract(uv * scale);
    
    float star = 0.0;
    
    // Check neighboring cells
    for(int x = -1; x <= 1; x++) {
        for(int y = -1; y <= 1; y++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cellId = cell + neighbor;
            
            vec2 starPos = hash2(cellId);
            vec2 diff = neighbor + starPos - local;
            float dist = length(diff);
            
            // Star brightness with twinkling
            float brightness = hash(cellId + 0.1);
            float twinkle = sin(time * (2.0 + brightness * 3.0) + brightness * 100.0) * 0.5 + 0.5;
            brightness = pow(brightness, 3.0) * (0.7 + 0.3 * twinkle);
            
            // Sharp point with soft glow
            float point = exp(-dist * 40.0) * brightness;
            float glow = exp(-dist * 8.0) * brightness * 0.3;
            
            star += point + glow;
        }
    }
    
    return star;
}

// --- VOLUMETRIC NEBULA ---

float nebulaDensity(vec2 uv, float time) {
    vec2 p = uv * 2.0;
    
    // Domain warping for organic flow
    vec2 q;
    q.x = fbm(p + vec2(0.0, 0.0) + time * 0.03, 4);
    q.y = fbm(p + vec2(5.2, 1.3) + time * 0.04, 4);
    
    vec2 r;
    r.x = fbm(p + 4.0 * q + vec2(1.7, 9.2) + time * 0.05, 4);
    r.y = fbm(p + 4.0 * q + vec2(8.3, 2.8) + time * 0.06, 4);
    
    float f = fbm(p + 3.0 * r, 5);
    
    return f;
}

// --- MAIN ---

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 st = uv;
    st.x *= u_resolution.x / u_resolution.y;
    
    float time = u_time * 0.1;
    
    // Mouse influence (normalized to aspect-corrected space)
    vec2 mouseNorm = u_mouse;
    mouseNorm.x *= u_resolution.x / u_resolution.y;
    
    // Gravitational center with subtle mouse drift
    vec2 center = vec2(0.5 * u_resolution.x / u_resolution.y, 0.5);
    center += (mouseNorm - center) * 0.15;
    
    // === LAYER 1: DEEP VOID BASE ===
    vec3 color = C_CORE;
    
    // Radial gradient from center
    float centerDist = length(st - center);
    color = mix(C_VOID, C_CORE, smoothstep(0.0, 0.8, centerDist));
    
    // === LAYER 2: DISTANT STARS (before lensing) ===
    vec2 starsUV = st;
    
    // Apply gravitational lensing to stars
    starsUV = gravitationalBend(starsUV, center, 0.02, 0.05);
    starsUV = gravitationalBend(starsUV, center, 0.01, 0.02);
    
    float stars = starField(starsUV, 80.0, u_time * 0.5);
    stars += starField(starsUV * 1.5 + 10.0, 120.0, u_time * 0.3) * 0.5;
    
    // Lensed stars are bluer near the singularity
    vec3 starColor = mix(vec3(0.9, 0.95, 1.0), vec3(0.6, 0.8, 1.0), smoothstep(0.5, 0.1, centerDist));
    color += starColor * stars * 0.8;
    
    // === LAYER 3: NEBULA CLOUDS ===
    vec2 nebulaUV = st;
    nebulaUV = gravitationalBend(nebulaUV, center, 0.015, 0.08);
    
    float nebula = nebulaDensity(nebulaUV, time);
    
    // Color the nebula with temperature gradient
    vec3 nebulaColor = mix(C_PLASMA_B, C_PLASMA_C, nebula);
    nebulaColor = mix(nebulaColor, C_PLASMA_A, pow(nebula, 3.0));
    
    // Distance-based intensity (brighter near edges, darker near center)
    float nebulaIntensity = smoothstep(0.1, 0.4, centerDist) * smoothstep(1.2, 0.5, centerDist);
    color += nebulaColor * nebula * nebulaIntensity * 0.25;
    
    // === LAYER 4: ACCRETION DISK ===
    float disk = accretionDisk(st, center, 0.35, 0.08, time * 0.5);
    
    // Disk color: hot inner, cooler outer
    float diskDist = length(st - center);
    vec3 diskColor = mix(C_PLASMA_A, C_PLASMA_B, smoothstep(0.15, 0.4, diskDist));
    diskColor = mix(diskColor, vec3(1.0, 0.95, 0.9), pow(disk, 2.0) * 0.5); // Hot spots
    
    color += diskColor * disk * 0.6;
    
    // === LAYER 5: LIGHT STREAKS ===
    float streaks = lightStreak(st, center, time);
    vec3 streakColor = mix(C_PLASMA_C, C_PLASMA_A, sin(time + centerDist * 5.0) * 0.5 + 0.5);
    color += streakColor * streaks;
    
    // === LAYER 6: EVENT HORIZON GLOW ===
    float horizonGlow = exp(-centerDist * 8.0) * 0.3;
    vec3 horizonColor = mix(C_PLASMA_C, vec3(0.2, 0.1, 0.3), 0.5);
    color += horizonColor * horizonGlow;
    
    // Inner shadow (the actual "black" of the black hole)
    float innerShadow = smoothstep(0.08, 0.04, centerDist);
    color = mix(color, C_VOID, innerShadow);
    
    // === LAYER 7: PHOTON RING ===
    float ringDist = abs(centerDist - 0.06);
    float photonRing = exp(-ringDist * 100.0) * 0.8;
    color += vec3(1.0, 0.9, 0.8) * photonRing;
    
    // === POST PROCESSING ===
    
    // Subtle chromatic aberration near edges
    float aberration = smoothstep(0.3, 0.0, centerDist) * 0.01;
    vec2 aberrationOffset = normalize(st - center) * aberration;
    
    // Vignette
    float vignette = 1.0 - smoothstep(0.5, 1.5, length(uv - 0.5) * 1.4);
    color *= vignette;
    
    // Contrast and tone mapping
    color = pow(color, vec3(0.95)); // Slight gamma
    color = color / (1.0 + color); // Reinhard tone mapping
    color = pow(color, vec3(1.0 / 2.2)); // Gamma correction
    
    // Subtle film grain
    float grain = hash(uv * u_resolution.xy + fract(u_time) * 1000.0) * 0.03;
    color += grain - 0.015;
    
    gl_FragColor = vec4(color, 1.0);
}
