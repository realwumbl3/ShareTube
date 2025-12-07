precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

// --- CONSTANTS ---
#define MAX_STEPS 80
#define MIN_DIST 0.001
#define MAX_DIST 20.0
#define PI 3.14159265359
#define TAU 6.28318530718

// --- PALETTE ---
// A sophisticated, "premium" palette: Deep obsidian, gold, iridescent cyan
vec3 palette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.263, 0.416, 0.557); // Iridescent phase shift
    return a + b * cos(TAU * (c * t + d));
}

// --- ROTATION ---
mat2 rot2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}

// --- SDF FUNCTIONS ---

// Smooth minimum for organic blending
float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * h * k * (1.0 / 6.0);
}

// The Core Structure: A "Folded Gyroid"
// Combining gyroid minimal surfaces with domain folding and rotation
float map(vec3 p) {
    vec3 p_orig = p;
    float t = u_time * 0.2;

    // 1. Global Rotation (No Translation)
    p.xy *= rot2D(t * 0.2);
    p.yz *= rot2D(t * 0.1);

    // 2. Domain Folding (Kaleidoscopic effect applied to space)
    // This creates the "Crystalline" structure from the organic gyroid
    float scale = 1.5;
    p *= scale;
    
    // Fold space
    for(int i = 0; i < 3; i++) {
        p = abs(p) - vec3(0.5, 0.8, 0.5); // Folding planes
        p.xy *= rot2D(0.4);
        p.yz *= rot2D(0.2 + t * 0.1); // Dynamic folding
    }

    // 3. Gyroid function
    float gyroid = dot(sin(p), cos(p.yzx));
    
    // 4. Shell thickness - makes it hollow
    float d = abs(gyroid) - 0.15;
    
    // 5. Add surface detail/noise
    d -= 0.05 * sin(p.x * 10.0 + p.y * 10.0 + u_time);

    // 6. Bound the object to avoid infinite fly-through and clipping
    // Intersect with a sphere of radius 2.8
    float bound = length(p_orig) - 2.8;
    d = max(d * 0.4 / scale, bound);

    return d;
}

// --- RAYMARCHING ---
float rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0; // Distance Origin
    for(int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = map(p); // Distance Surface
        dO += dS;
        if(dO > MAX_DIST || abs(dS) < MIN_DIST) break;
    }
    return dO;
}

// --- NORMALS ---
vec3 getNormal(vec3 p) {
    float d = map(p);
    vec2 e = vec2(0.001, 0.0);
    vec3 n = d - vec3(
        map(p - e.xyy),
        map(p - e.yxy),
        map(p - e.yyx)
    );
    return normalize(n);
}

// --- LIGHTING & COLOR ---
vec3 getLight(vec3 p, vec3 rd, vec3 normal) {
    // Lights
    vec3 lightPos1 = vec3(2.0, 4.0, -3.0);
    vec3 lightPos2 = vec3(-3.0, -2.0, -2.0);
    
    // Moving light
    lightPos1.xz *= rot2D(u_time * 0.5);
    
    vec3 l1 = normalize(lightPos1 - p);
    vec3 l2 = normalize(lightPos2 - p);
    
    // Diffuse
    float diff1 = max(dot(normal, l1), 0.0);
    float diff2 = max(dot(normal, l2), 0.0);
    
    // Specular (Phong)
    vec3 ref = reflect(rd, normal);
    float spec1 = pow(max(dot(ref, l1), 0.0), 32.0);
    float spec2 = pow(max(dot(ref, l2), 0.0), 16.0);
    
    // Fresnel (Rim lighting)
    float fresnel = pow(1.0 + dot(rd, normal), 4.0);
    
    // Structural Color based on position
    vec3 objColor = palette(length(p) * 0.1 + u_time * 0.1);
    
    // Deepen the darks for contrast
    objColor = mix(objColor, vec3(0.02, 0.02, 0.05), 0.4);

    // Combine
    vec3 col = objColor * (diff1 * 0.8 + diff2 * 0.5);
    col += vec3(1.0, 0.9, 0.7) * spec1 * 0.8; // Warm highlight
    col += vec3(0.4, 0.8, 1.0) * spec2 * 0.5; // Cool highlight
    col += vec3(0.5, 0.8, 1.0) * fresnel * 2.0; // Glowing edge
    
    return col;
}

void main() {
    // 1. Setup UVs
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    vec2 mouse = (u_mouse * 2.0 - 1.0);
    
    // 2. Camera Setup
    vec3 ro = vec3(0.0, 0.0, -4.0); // Ray Origin
    vec3 lookAt = vec3(0.0, 0.0, 0.0);
    
    // Mouse Interaction (Camera Orbit)
    ro.yz *= rot2D(-mouse.y * 1.0);
    ro.xz *= rot2D(-mouse.x * 1.0);
    
    // Camera vectors
    vec3 f = normalize(lookAt - ro); // Forward
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f)); // Right
    vec3 u = cross(f, r); // Up
    
    // Ray Direction
    vec3 rd = normalize(f * 1.5 + uv.x * r + uv.y * u);
    
    // 3. Render
    float d = rayMarch(ro, rd);
    
    vec3 col = vec3(0.0);
    
    if(d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        col = getLight(p, rd, n);
        
        // Fog / Depth fading
        float fog = 1.0 - exp(-d * 0.08);
        vec3 fogColor = vec3(0.01, 0.01, 0.03);
        col = mix(col, fogColor, fog);
    } else {
        // Background gradient if ray misses
        col = vec3(0.01, 0.01, 0.03) - uv.y * 0.02;
    }
    
    // 4. Post-Processing
    
    // "Glow" based on accumulated distance (fake subsurface scattering)
    // We run a cheap extra march or just use the depth
    col += vec3(0.2, 0.4, 0.8) * 0.03 / (d * 0.1 + 0.1); // Inner glow
    
    // Vignette
    col *= 1.0 - length(uv) * 0.4;
    
    // Gamma Correction
    col = pow(col, vec3(1.0/2.2));
    
    // Subtle Grain/Dither to prevent banding
    float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    col += grain * 0.02;

    gl_FragColor = vec4(col, 1.0);
}

