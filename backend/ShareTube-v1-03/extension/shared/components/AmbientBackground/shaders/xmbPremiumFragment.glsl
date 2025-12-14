// ============================================================
// XMB Premium Fragment Shader
// PS3 XrossMediaBar Inspired - Console-tier Quality
// ============================================================
// High-fidelity, glossy flowing ribbons with refined lighting
// Clean, sharp, smooth motion - no blur, no noise, premium only
// ============================================================

#ifdef GL_ES
precision highp float;
#endif

uniform vec3 iResolution;
uniform float iTime;

// ============================================================
// Configuration Parameters
// ============================================================

// Wave motion parameters
#define WAVE_SPEED 0.15          // Slow, elegant motion
#define WAVE_AMPLITUDE 0.35      // Wave height
#define WAVE_FREQUENCY 2.5       // Wave density
#define PARALLAX_LAYERS 5        // Depth layers for parallax

// Color palette (elegant, premium tones)
#define PRIMARY_COLOR vec3(0.15, 0.35, 0.65)    // Deep blue
#define ACCENT_COLOR vec3(0.45, 0.65, 0.85)     // Light blue
#define HIGHLIGHT_COLOR vec3(0.85, 0.92, 0.98)  // Crisp white-blue
#define AMBIENT_COLOR vec3(0.02, 0.05, 0.12)    // Deep background

// Lighting parameters
#define SPECULAR_POWER 64.0      // Sharp, crisp highlights
#define SPECULAR_INTENSITY 1.5   // Bright reflections
#define RIM_POWER 3.0            // Edge lighting sharpness
#define FRESNEL_POWER 2.5        // View-angle dependent reflection

// ============================================================
// Utility Functions
// ============================================================

// Smooth minimum function for clean blending
float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

// High-quality smoothstep with cubic interpolation
float smootherstep(float edge0, float edge1, float x) {
    x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

// 2D rotation matrix
mat2 rot2D(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
}

// ============================================================
// Ribbon Wave Functions
// ============================================================

// Multi-frequency wave function for complex motion
float waveFunction(float x, float time, float phase) {
    float w1 = sin(x * WAVE_FREQUENCY + time * WAVE_SPEED + phase);
    float w2 = sin(x * WAVE_FREQUENCY * 0.5 - time * WAVE_SPEED * 0.7 + phase * 1.3) * 0.5;
    float w3 = sin(x * WAVE_FREQUENCY * 1.5 + time * WAVE_SPEED * 1.2 + phase * 0.7) * 0.25;
    return (w1 + w2 + w3) / 1.75;
}

// Ribbon shape with precise edges
float ribbonSDF(vec2 p, float phase, float layerDepth) {
    // Apply horizontal offset for flow
    float timeOffset = iTime * WAVE_SPEED * (1.0 + layerDepth * 0.3);
    
    // Calculate wave height
    float wave = waveFunction(p.x, iTime, phase) * WAVE_AMPLITUDE;
    
    // Add subtle horizontal wave for more dynamic motion
    float lateralWave = sin(p.y * 3.0 + iTime * WAVE_SPEED * 0.5) * 0.08;
    p.x += lateralWave;
    
    // Ribbon distance field with crisp falloff
    float ribbonWidth = 0.12 + sin(p.x * 2.0 + phase) * 0.02;
    float dist = abs(p.y - wave) - ribbonWidth;
    
    return dist;
}

// ============================================================
// Lighting Functions
// ============================================================

// Calculate normal from distance field
vec2 getNormal(vec2 p, float phase, float layerDepth) {
    float eps = 0.001;
    float d = ribbonSDF(p, phase, layerDepth);
    vec2 n = vec2(
        ribbonSDF(vec2(p.x + eps, p.y), phase, layerDepth) - d,
        ribbonSDF(vec2(p.x, p.y + eps), phase, layerDepth) - d
    );
    return normalize(n);
}

// Specular highlight calculation (Blinn-Phong)
float specular(vec3 normal, vec3 lightDir, vec3 viewDir, float power) {
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), power);
    return spec;
}

// Fresnel effect for view-angle dependent reflections
float fresnel(vec3 normal, vec3 viewDir, float power) {
    float facing = 1.0 - max(dot(normal, viewDir), 0.0);
    return pow(facing, power);
}

// ============================================================
// Main Rendering Function
// ============================================================

vec3 renderRibbon(vec2 uv, float phase, float layerDepth, float layerIndex) {
    // Calculate ribbon distance
    float dist = ribbonSDF(uv, phase, layerDepth);
    
    // Sharp ribbon mask with anti-aliasing
    float ribbonMask = 1.0 - smoothstep(-0.002, 0.002, dist);
    
    if (ribbonMask < 0.001) return vec3(0.0);
    
    // Get surface normal
    vec2 normal2D = getNormal(uv, phase, layerDepth);
    vec3 normal = normalize(vec3(normal2D, 0.8));
    
    // Light and view directions
    vec3 lightDir = normalize(vec3(0.5, 0.7, 1.0));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    
    // === Base Color with Gradient ===
    // Vertical gradient along ribbon
    float gradientPos = (uv.y + 0.5) * 0.5 + 0.5;
    vec3 baseColor = mix(PRIMARY_COLOR, ACCENT_COLOR, gradientPos);
    
    // Add color variation based on position
    float colorVar = sin(uv.x * 3.0 + phase + iTime * 0.2) * 0.5 + 0.5;
    baseColor = mix(baseColor, ACCENT_COLOR, colorVar * 0.3);
    
    // === Diffuse Lighting ===
    float diffuse = max(dot(normal, lightDir), 0.0);
    diffuse = pow(diffuse, 1.2); // Slightly sharpen
    
    // === Specular Highlights ===
    float spec = specular(normal, lightDir, viewDir, SPECULAR_POWER);
    vec3 specColor = HIGHLIGHT_COLOR * spec * SPECULAR_INTENSITY;
    
    // Add secondary specular for more shimmer
    vec3 lightDir2 = normalize(vec3(-0.3, 0.5, 1.0));
    float spec2 = specular(normal, lightDir2, viewDir, SPECULAR_POWER * 1.5);
    specColor += HIGHLIGHT_COLOR * spec2 * SPECULAR_INTENSITY * 0.5;
    
    // === Fresnel Rim Lighting ===
    float fresnelTerm = fresnel(normal, viewDir, FRESNEL_POWER);
    vec3 rimColor = HIGHLIGHT_COLOR * fresnelTerm * 0.8;
    
    // === Edge Highlighting ===
    // Sharpen edges for that glossy look
    float edgeFactor = 1.0 - smootherstep(0.0, 0.08, abs(dist));
    vec3 edgeHighlight = HIGHLIGHT_COLOR * edgeFactor * 0.6;
    
    // === Animated Shimmer ===
    // Traveling highlights along the ribbon
    float shimmer = sin(uv.x * 8.0 - iTime * 2.0 + phase) * 0.5 + 0.5;
    shimmer = pow(shimmer, 8.0); // Sharp shimmer peaks
    vec3 shimmerColor = HIGHLIGHT_COLOR * shimmer * 0.4;
    
    // === Combine Lighting ===
    vec3 color = baseColor * (0.4 + diffuse * 0.6);  // Base with diffuse
    color += specColor;                               // Add specular
    color += rimColor;                                // Add rim light
    color += edgeHighlight;                           // Add edge glow
    color += shimmerColor;                            // Add shimmer
    
    // === Depth-based Brightness ===
    // Front layers brighter, back layers dimmer for depth
    float depthBrightness = 1.0 - layerDepth * 0.5;
    color *= depthBrightness;
    
    // Apply ribbon mask
    color *= ribbonMask;
    
    return color;
}

// ============================================================
// Main
// ============================================================

void main() {
    // Normalized coordinates
    vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
    
    // Initialize background
    vec3 color = AMBIENT_COLOR;
    
    // Add subtle background gradient
    float bgGradient = length(uv) * 0.5;
    color += PRIMARY_COLOR * bgGradient * 0.15;
    
    // === Render Multiple Ribbon Layers ===
    // Back to front for proper depth
    for (int i = PARALLAX_LAYERS - 1; i >= 0; i--) {
        float layerIndex = float(i);
        float layerDepth = layerIndex / float(PARALLAX_LAYERS - 1);
        
        // Parallax offset - back layers move slower
        float parallaxAmount = layerDepth * 0.3;
        vec2 layerUV = uv;
        layerUV.x += sin(iTime * WAVE_SPEED * 0.5) * parallaxAmount;
        layerUV.y += cos(iTime * WAVE_SPEED * 0.3) * parallaxAmount * 0.5;
        
        // Scale back layers slightly smaller for depth
        float scale = 1.0 - layerDepth * 0.1;
        layerUV /= scale;
        
        // Vertical offset for each ribbon
        float verticalOffset = (layerIndex - float(PARALLAX_LAYERS - 1) * 0.5) * 0.35;
        layerUV.y += verticalOffset;
        
        // Phase offset for variation
        float phase = layerIndex * 2.1;
        
        // Render ribbon layer
        vec3 ribbonColor = renderRibbon(layerUV, phase, layerDepth, layerIndex);
        
        // Blend with alpha-like behavior
        color = mix(color, ribbonColor, step(0.001, length(ribbonColor)));
        color += ribbonColor * 0.3; // Additive blend for glow
    }
    
    // === Post-processing ===
    
    // Subtle vignette for focus
    float vignette = 1.0 - length(uv * 0.6);
    vignette = smootherstep(0.3, 1.0, vignette);
    color *= vignette * 0.3 + 0.7;
    
    // Tone mapping for HDR-like appearance
    color = color / (color + vec3(0.5));
    
    // Contrast boost
    color = pow(color, vec3(0.95));
    
    // Subtle color grading - cooler tones
    color = mix(color, color * vec3(0.95, 1.0, 1.05), 0.3);
    
    // Final gamma correction
    color = pow(color, vec3(1.0 / 2.2));
    
    // Ensure output is in valid range
    color = clamp(color, 0.0, 1.0);
    
    gl_FragColor = vec4(color, 1.0);
}

