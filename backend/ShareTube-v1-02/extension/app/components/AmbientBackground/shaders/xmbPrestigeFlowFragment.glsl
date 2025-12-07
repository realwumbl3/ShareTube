#ifdef GL_ES
precision highp float;
#extension GL_OES_standard_derivatives : enable
#endif

// ============================================================
// PS3 XMB Prestige Flow Fragment Shader
// Modernized glossy ribbons with parallax depth and specular sheen
// ============================================================

uniform vec3 iResolution;
uniform float iTime;
uniform vec4 iMouse;

// Adjustable parameters -------------------------------------------------------
uniform vec3 uPrimaryColor;      // Primary palette color
uniform vec3 uAccentColor;       // Secondary/accent color
uniform vec3 uHighlightColor;    // Highlight tint
uniform vec3 uAmbientColor;      // Background tone
uniform float uWaveAmplitude;    // Ribbon amplitude multiplier
uniform float uMotionSpeed;      // Global motion speed multiplier
uniform float uLightingSharpness; // Controls specular exponent

// Defaults for when uniforms are not provided
const vec3 DEFAULT_PRIMARY_COLOR = vec3(0.10, 0.25, 0.50);
const vec3 DEFAULT_ACCENT_COLOR = vec3(0.32, 0.62, 0.90);
const vec3 DEFAULT_HIGHLIGHT_COLOR = vec3(0.96, 0.98, 1.00);
const vec3 DEFAULT_AMBIENT_COLOR = vec3(0.01, 0.04, 0.10);

const float DEFAULT_WAVE_AMPLITUDE = 0.32;
const float DEFAULT_MOTION_SPEED = 0.18;
const float DEFAULT_LIGHTING_SHARPNESS = 0.65;
const float BASE_WAVE_FREQUENCY = 2.75;
const float LAYER_SPREAD = 0.34;
const int RIBBON_LAYERS = 6;

float saturate(float v) {
    return clamp(v, 0.0, 1.0);
}

mat2 rotation(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
}

float fetchParam(float uniformValue, float fallback) {
    return uniformValue > 0.0001 ? uniformValue : fallback;
}

vec3 fetchColor(vec3 uniformColor, vec3 fallback) {
    return dot(uniformColor, uniformColor) > 0.0001 ? uniformColor : fallback;
}

float multiWave(float x, float depth, float phase, float freq, float amp, float speed) {
    float t = iTime * speed;
    float w = sin(x * freq + phase + t);
    w += 0.55 * sin(x * (freq * 0.45 + depth * 0.1) - phase * 1.7 + t * 0.6);
    w += 0.32 * sin(x * (freq * 1.6) + phase * 0.8 + t * 1.25);
    w += 0.21 * sin((x * (freq * 2.3) - t * 1.8) + depth * 2.4);
    return w * amp;
}

float ribbonSDF(vec2 p, float depth, float phase, float amp, float freq, float speed) {
    float layerAmp = amp * (0.95 + 0.1 * sin(iTime * speed * 0.8 + depth * 4.2));
    float crest = multiWave(p.x, depth, phase, freq, layerAmp, speed);
    float width = 0.14 - depth * 0.018 + 0.02 * sin(p.x * (freq * 0.35) + phase + iTime * speed);
    return abs(p.y - crest) - width;
}

vec2 ribbonNormal(vec2 p, float depth, float phase, float amp, float freq, float speed) {
    float eps = 0.0025;
    float d = ribbonSDF(p, depth, phase, amp, freq, speed);
    float dx = ribbonSDF(vec2(p.x + eps, p.y), depth, phase, amp, freq, speed) - d;
    float dy = ribbonSDF(vec2(p.x, p.y + eps), depth, phase, amp, freq, speed) - d;
    return normalize(vec2(dx, dy));
}

float blinnSpec(vec3 n, vec3 l, vec3 v, float sharpness) {
    vec3 h = normalize(l + v);
    return pow(max(dot(n, h), 0.0), sharpness);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

    // Determine a neutral roll influenced by mouse if provided
    vec2 mouseNorm = vec2(0.5);
    if (iMouse.z > 0.0 || iMouse.w > 0.0) {
        mouseNorm = iMouse.xy / iResolution.xy;
    }
    float viewRoll = (mouseNorm.x - 0.5) * 0.22;

    vec3 primaryColor = fetchColor(uPrimaryColor, DEFAULT_PRIMARY_COLOR);
    vec3 accentColor = fetchColor(uAccentColor, DEFAULT_ACCENT_COLOR);
    vec3 highlightColor = fetchColor(uHighlightColor, DEFAULT_HIGHLIGHT_COLOR);
    vec3 ambientColor = fetchColor(uAmbientColor, DEFAULT_AMBIENT_COLOR);
    float waveAmplitude = fetchParam(uWaveAmplitude, DEFAULT_WAVE_AMPLITUDE);
    float motionSpeed = fetchParam(uMotionSpeed, DEFAULT_MOTION_SPEED);
    float lightingSharpness = fetchParam(uLightingSharpness, DEFAULT_LIGHTING_SHARPNESS);

    float specularPower = mix(34.0, 130.0, saturate(lightingSharpness));
    float rimPower = mix(1.6, 3.4, saturate(lightingSharpness + 0.2));

    vec3 color = ambientColor;

    // Ambient gradient and subtle reflections
    float verticalGradient = smoothstep(-1.2, 0.8, uv.y + sin(iTime * 0.12) * 0.04);
    vec3 ambientGradient = mix(ambientColor, primaryColor * 0.4, verticalGradient);
    color += ambientGradient;

    float horizonGlow = exp(-abs(uv.y - 0.05) * 4.0);
    color += highlightColor * horizonGlow * 0.08;

    vec2 baseUV = uv;
    baseUV *= rotation(viewRoll * 0.6);

    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 lightDir = normalize(vec3(-0.25, 0.85, 0.55));
    vec3 fillLight = normalize(vec3(0.35, 0.2, 0.9));

    for (int layer = RIBBON_LAYERS - 1; layer >= 0; --layer) {
        float layerIndex = float(layer);
        float depth = layerIndex / float(RIBBON_LAYERS - 1);
        float parallax = mix(0.45, 0.05, depth);

        vec2 layerUV = baseUV;
        layerUV *= rotation(0.035 * sin(depth * 6.0 + iTime * 0.18));
        layerUV.x += depth * 0.32 * sin(iTime * motionSpeed * 0.45 + depth * 3.1);
        layerUV.y += depth * 0.22 * cos(iTime * motionSpeed * 0.33 + depth * 2.7);
        layerUV.x += iTime * motionSpeed * (0.15 + depth * 0.35);

        float laneCenter = (layerIndex - (float(RIBBON_LAYERS) - 1.0) * 0.5) * LAYER_SPREAD;
        layerUV.y -= laneCenter;

        float phase = layerIndex * 1.72 + sin(layerIndex * 2.1);
        float dist = ribbonSDF(layerUV, depth, phase, waveAmplitude, BASE_WAVE_FREQUENCY, motionSpeed);

        float edge = fwidth(dist) * 0.75;
        float ribbonMask = 1.0 - smoothstep(-edge, edge, dist);
        if (ribbonMask <= 0.0001) {
            continue;
        }

        vec2 normal2D = ribbonNormal(layerUV, depth, phase, waveAmplitude, BASE_WAVE_FREQUENCY, motionSpeed);
        vec3 normal = normalize(vec3(-normal2D.x, 0.9, 0.6 - normal2D.y * 0.2));

        float diffuse = max(dot(normal, lightDir), 0.0);
        float fill = max(dot(normal, fillLight), 0.0);
        diffuse = pow(diffuse, 1.15);

        vec3 baseColor = mix(primaryColor, accentColor, saturate(layerUV.x * 0.25 + 0.55));
        baseColor = mix(baseColor, accentColor * 1.1, depth * 0.35);

        float sheen = blinnSpec(normal, lightDir, viewDir, specularPower);
        vec3 specular = highlightColor * sheen * (0.4 + 0.6 * (1.0 - depth));

        float travellingHighlight = pow(
            saturate(0.65 + 0.35 * sin(layerUV.x * 5.5 - iTime * motionSpeed * 5.2 + phase)),
            8.0
        );
        vec3 shimmer = highlightColor * travellingHighlight * 0.35;

        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), rimPower);
        vec3 rim = highlightColor * fresnel * (0.25 + 0.35 * (1.0 - depth));

        float reflectiveSweep = saturate(0.7 - (layerUV.y + laneCenter) * 1.4);
        vec3 reflectionTint = highlightColor * reflectiveSweep * 0.15;

        vec3 ribbonColor = baseColor * (0.35 + diffuse * 0.6);
        ribbonColor += baseColor * fill * 0.25;
        ribbonColor += specular;
        ribbonColor += shimmer;
        ribbonColor += rim;
        ribbonColor += reflectionTint;

        float depthFade = mix(0.45, 1.0, 1.0 - depth);
        ribbonColor *= depthFade;
        ribbonColor *= ribbonMask;

        color = mix(color, ribbonColor + color * 0.4, ribbonMask * 0.6);
        color += ribbonColor * 0.25;
    }

    float vignette = smoothstep(1.6, 0.25, length(uv * vec2(1.2, 1.0)));
    color *= vignette * 0.4 + 0.6;

    color = color / (color + vec3(0.55));
    color = pow(color, vec3(0.96));
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}

