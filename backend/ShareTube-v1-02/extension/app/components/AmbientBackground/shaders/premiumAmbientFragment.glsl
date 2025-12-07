precision highp float;

uniform vec3 iResolution;
uniform float iTime;

// -----------------------------------------------------------------------------
// Premium Noise Functions
// -----------------------------------------------------------------------------

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
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

// -----------------------------------------------------------------------------
// Main Effect
// -----------------------------------------------------------------------------

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    
    // Aspect ratio correction
    vec2 p = uv * 2.0 - 1.0;
    p.x *= iResolution.x / iResolution.y;
    
    float t = iTime * 0.05; // Ultra-slow, premium speed
    
    // 1. Background: Deep atmospheric gradient
    //    Top-left: Dark Indigo, Bottom-Right: Deep Teal
    vec3 bgCol = mix(
        vec3(0.01, 0.02, 0.08), // Midnight Blue
        vec3(0.02, 0.05, 0.10), // Dark slate
        uv.y
    );
    
    // 2. Flowing "Liquid Light" Layers
    //    We use multiple layers of noise moving at different speeds/directions
    //    to create a volumetric, evolving look without chaos.
    
    // Layer 1: Large, soft waves (The "Breath")
    vec2 q1 = p * 0.8 + vec2(t * 0.5, t * 0.2);
    float n1 = 0.5 + 0.5 * snoise(q1);
    
    // Layer 2: Smaller details (The "Texture")
    vec2 q2 = p * 1.5 - vec2(t * 0.3, t * 0.8);
    float n2 = 0.5 + 0.5 * snoise(q2);
    
    // Domain Warping for silk-like feel
    vec2 warp = vec2(n1, n2) * 0.4;
    float n3 = 0.5 + 0.5 * snoise(p * 1.2 + warp + t);
    
    // 3. Color Palette Mixing
    //    PS5/Apple aesthetic: Clean, ethereal, slightly cool but rich.
    
    vec3 c1 = vec3(0.1, 0.4, 0.9);  // Electric Blue (Accent)
    vec3 c2 = vec3(0.6, 0.2, 0.8);  // Soft Purple/Magenta (Warmth)
    vec3 c3 = vec3(0.0, 0.8, 0.7);  // Cyan/Teal (Highlights)
    
    // Mix factor based on warped noise
    vec3 light = mix(c1, c2, n1);
    light = mix(light, c3, n2 * n3);
    
    // Mask the light so it floats in the void rather than filling screen
    float mask = smoothstep(0.2, 0.8, n3); 
    
    // Soft Bloom / Glow calculation
    // We add the light on top of background with screen blending logic
    vec3 finalCol = bgCol + light * mask * 0.4;
    
    // 4. Subtle Highlights
    //    Occasional "glints" or brighter areas
    float highlight = smoothstep(0.7, 1.0, n3) * n1;
    finalCol += vec3(0.8, 0.9, 1.0) * highlight * 0.15;
    
    // 5. Post-Processing
    
    // Vignette (Subtle)
    float vig = 1.0 - length(uv - 0.5) * 0.5;
    finalCol *= smoothstep(0.0, 1.5, vig);
    
    // Dithering (Essential for smooth gradients)
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    finalCol += (dither - 0.5) * 0.015;
    
    // Output
    gl_FragColor = vec4(finalCol, 1.0);
}









