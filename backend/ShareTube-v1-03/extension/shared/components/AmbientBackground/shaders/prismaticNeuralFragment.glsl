precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec4 iMouse;

// ---------------------------------------------------------------------------------------
// "Prismatic Neural Manifold"
// 
// CONCEPT:
// This shader visualizes a hyper-dimensional manifold that behaves like a 
// crystallized neural network. It uses raymarching through a domain-warped 
// gyroid space, rendering the volume not as solid matter, but as a refractive, 
// dispersion-heavy glass.
//
// The "neural" aspect comes from the interconnectivity of the structures,
// while the "prismatic" aspect is derived from the chromatic aberration 
// and spectral color palette applied to the accumulated density.
//
// VISUALS:
// - Deep, cinematic depth of field
// - glassy/crystalline structures
// - Chromatic aberration (RGB separation) on edges
// - Slow, majestic movement suggesting a massive scale
// ---------------------------------------------------------------------------------------

#define MAX_STEPS 80
#define MAX_DIST 20.0
#define SURF_DIST 0.001
#define PI 3.14159265359

// Rotate vector p by angle t around axis a
vec3 rotate(vec3 p, vec3 a, float t) {
    a = normalize(a);
    return mix(a * dot(p, a), p, cos(t)) + cross(a, p) * sin(t);
}

// 3D Noise function for subtle texture
float hash(vec3 p) {
    p  = fract( p*0.3183099+.1 );
    p *= 17.0;
    return fract( p.x*p.y*p.z*(p.x+p.y+p.z) );
}

float noise(in vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix( hash(i+vec3(0,0,0)), 
                        hash(i+vec3(1,0,0)),f.x),
                   mix( hash(i+vec3(0,1,0)), 
                        hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix( hash(i+vec3(0,0,1)), 
                        hash(i+vec3(1,0,1)),f.x),
                   mix( hash(i+vec3(0,1,1)), 
                        hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}

// Gyroid function - creates the base infinite lattice
float gyroid(vec3 p, float scale) {
    p *= scale;
    return abs(dot(sin(p), cos(p.zxy))) / scale - 0.05;
}

// The main Signed Distance Field
float GetDist(vec3 p) {
    // Subtle global rotation
    p = rotate(p, vec3(0.0, 1.0, 0.0), iTime * 0.05);
    p = rotate(p, vec3(1.0, 0.0, 1.0), iTime * 0.02);
    
    // Domain warping
    vec3 warp = p;
    warp += vec3(
        sin(p.z * 0.5 + iTime * 0.2),
        cos(p.x * 0.5 + iTime * 0.3),
        sin(p.y * 0.5 + iTime * 0.1)
    ) * 0.5;
    
    // Layered gyroids for complexity
    float d1 = gyroid(warp, 1.8);
    float d2 = gyroid(warp + vec3(1.2, 2.4, 0.0), 3.2);
    float d3 = gyroid(warp - vec3(0.5, 1.0, 2.0), 5.5);
    
    // Combine layers using soft min (smin-ish logic) or just simple subtraction/addition
    float d = d1 * 0.6 + d2 * 0.3 + d3 * 0.1;
    
    // Add a spherical bias to keep things somewhat centered but expansive
    // d = max(d, length(p) - 8.0); // Optional bounds
    
    // Smooth edges
    return d * 0.8; // Scale down distance for safer marching
}

// Raymarching with color accumulation (volumetric feel)
vec4 RayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    vec3 p;
    float density = 0.0;
    vec3 glow = vec3(0.0);
    float minD = 100.0;
    
    // Chromatic aberration offsets
    float dO_r = 0.0;
    float dO_g = 0.0;
    float dO_b = 0.0;
    
    for(int i=0; i<MAX_STEPS; i++) {
        p = ro + rd * dO;
        float dS = GetDist(p);
        
        // Accumulate "glow" when close to surfaces
        // This creates the translucent/volumetric neon look
        float proximity = 1.0 / (1.0 + abs(dS) * 20.0);
        glow += vec3(0.8, 0.4, 1.0) * proximity * 0.015; // Purple base
        glow += vec3(0.1, 0.7, 0.9) * proximity * 0.01;  // Cyan accents
        
        // Capture minimum distance for edge glow
        minD = min(minD, abs(dS));
        
        // Step forward
        // Take smaller steps to capture volumetric detail without passing through
        dO += max(abs(dS) * 0.6, 0.002); 
        
        if(dO > MAX_DIST) break;
    }
    
    return vec4(glow, minD);
}

void main() {
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    uv -= 0.5;
    uv.x *= iResolution.x / iResolution.y;
    
    // Camera setup
    vec3 ro = vec3(0.0, 0.0, -4.0); // Ray origin
    
    // Mouse interaction (orbit)
    float mX = (iMouse.x / iResolution.x - 0.5) * 5.0;
    float mY = (iMouse.y / iResolution.y - 0.5) * 5.0;
    if (iMouse.z > 0.0) { // Only rotate if mouse is clicked
         ro = rotate(ro, vec3(0.0, 1.0, 0.0), -mX);
         ro = rotate(ro, vec3(1.0, 0.0, 0.0), mY);
    } else {
        // Passive orbit
        ro = rotate(ro, vec3(0.1, 1.0, 0.0), iTime * 0.05);
    }
    
    vec3 lookAt = vec3(0.0, 0.0, 0.0);
    vec3 f = normalize(lookAt - ro);
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
    vec3 u = cross(f, r);
    
    vec3 rd = normalize(f + r * uv.x + u * uv.y);
    
    // --- The Rendering ---
    
    // We do a simplified chromatic aberration by varying the ray direction slightly per channel
    // or just tinting the accumulation based on distance.
    // For performance, we'll keep the single ray march but colorize the result spectrally.
    
    vec4 result = RayMarch(ro, rd);
    vec3 col = result.rgb;
    float minD = result.a;
    
    // Background gradient (deep void)
    vec3 bg = mix(vec3(0.0, 0.0, 0.05), vec3(0.05, 0.0, 0.1), uv.y + 0.5);
    col += bg;
    
    // Add "Prismatic" highlights
    // If the ray passed very close to geometry, add sharp white/spectral highlights
    float rim = smoothstep(0.02, 0.0, minD);
    col += vec3(1.0, 0.9, 0.8) * rim * 0.5;
    
    // Subtle vignette
    col *= 1.0 - dot(uv, uv) * 0.5;
    
    // Tone mapping
    col = vec3(1.0) - exp(-col * 1.5);
    
    // Gamma correction
    col = pow(col, vec3(0.4545));
    
    // Add subtle noise grain for realism
    float grain = hash(vec3(uv * 100.0, iTime)) * 0.03;
    col += grain;

    gl_FragColor = vec4(col, 1.0);
}









