import * as THREE from 'three';

const fragmentHelpers = `
// Fast pseudo-random function
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
}

// Basic 2D noise function
float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(
        mix(a, b, f.x),
        mix(c, d, f.x),
        f.y
    );
}

// Wave normal with multiple frequencies
vec2 waveNormal(vec2 uv, float time) {
    vec2 wave = vec2(0.0);
    wave += vec2(
        sin(uv.x * 2.0 + time * 0.5) * cos(uv.y * 2.0 - time * 0.3),
        sin(uv.x * 2.2 - time * 0.4) * sin(uv.y * 2.1 + time * 0.4)
    ) * 0.5;
    wave += vec2(
        sin(uv.x * 4.0 + time * 1.2) * cos(uv.y * 4.2 - time * 0.8),
        sin(uv.x * 4.1 - time * 0.9) * sin(uv.y * 4.3 + time * 1.1)
    ) * 0.25;
    wave += vec2(
        sin(uv.x * 8.0 + time * 2.0) * cos(uv.y * 8.2 - time * 1.8),
        sin(uv.x * 8.1 - time * 1.9) * sin(uv.y * 8.3 + time * 2.1)
    ) * 0.125;
    return wave;
}

// Fractional Brownian Motion
float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 3.0;
    for(int i = 0; i < 5; i++) {
        value += amplitude * noise2D(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
        p += value;
    }
    return value;
}

// Generate bubbles near edges; threshold adjusted for staying close
float edgeBubbles(
    vec2 uv,
    sampler2D intersectionTex,
    float time,
    float count,
    float speed,
    float size
) {
    float bubbles = 0.0;

    // We can tune these thresholds
    float gradientThreshold = 0.0;  // How sharp an edge needs to be
    float edgeBias          = 0.01; // Small offset to compute gradient

    for (int i = 0; i < int(count); i++)
    {
        // Create a seed per bubble
        vec2 seed   = vec2(float(i) * 13.45, float(i) * 7.89);
        
        // 1. Pick a random UV in [0,1]^2
        vec2 randUV = vec2(hash21(seed), hash21(seed + 1.234));
        
        // 2. Check the green channel (land/water transitions).
        //    If there's a *large gradient*, we're near an edge.
        float gCenter = texture2D(intersectionTex, randUV).g;
        float gRight  = texture2D(intersectionTex, randUV + vec2(edgeBias, 0.0)).g;
        float gUp     = texture2D(intersectionTex, randUV + vec2(0.0, edgeBias)).g;
        
        // Simple measure of gradient magnitude (there are more sophisticated ways)
        float gradX = abs(gCenter - gRight);
        float gradY = abs(gCenter - gUp);
        float gradMag = max(gradX, gradY);  
        
        // 3. Only place a bubble if this pixel is "edgy" enough
        if (gradMag > gradientThreshold) {
            // We can still animate the bubble slightly
            float t     = time * speed;
            float angle = t + hash21(seed + 2.718) * 6.2831; 
            vec2 offset = vec2(cos(angle), sin(angle)) * 0.02;
            
            // This 'center' is now forced near the edge
            vec2 center = randUV + offset;
            
            // 4. Standard bubble shape accumulation
            float dist   = length(uv - center);
            float bubble = smoothstep(size, size * 0.8, dist);
            float glow   = smoothstep(size * 0.8, size * 0.2, dist);
            bubble      += glow * 0.8;

            bubbles = max(bubbles, bubble);
        }
    }
    return bubbles;
}
`;

export const WaterShader = {
    uniforms: {
        // Existing uniforms...
        uTime: { value: 0.0 },
        uBaseColor: { value: new THREE.Color(0x00dddd) },
        uFresnelColor: { value: new THREE.Color(0x00ffff) },
        uSkyColor1: { value: new THREE.Color(0x87ceeb) },
        uSkyColor2: { value: new THREE.Color(0xf0f8ff) },
        uSpecularColor: { value: new THREE.Color(0x00ffff) },
        uWaveSpeed: { value: 0.2 },
        uWaveStrength: { value: 0.5 },
        uFresnelPower: { value: 1.0 },
        uSpecularIntensity: { value: 0.1 },
        uOpacity: { value: 0.7 },
        tIntersections: { value: null },
        uIntersectionTextureSize: { value: 1.0 },
        uBubbleCount: { value: 20.0 },
        uBubbleDriftSpeed: { value: 0.05 },
        uBubbleColor: { value: new THREE.Color(0xffffff) },
        uBubbleVisibility: { value: 0.6 },
        uBubbleSize: { value: 0.002 },
        uFoamColor: { value: new THREE.Color(0xffffff) },
        uFoamIntensity: { value: 0.7 },
        tReflection: { value: null },
        tEnvironment: { value: null },
        uReflectionStrength: { value: 0.1 },
        uEnvStrength: { value: 0.1 },

        // NEW CAUSTICS UNIFORMS
        uCausticsColor:   { value: new THREE.Color(0xaaaaaa) },
        uCausticsScale:   { value: 80.0 },
        uCausticsSpeed:   { value: 0.1 },
        uCausticsIntensity: { value: 0.22 },

        // NEW RIPPLE UNIFORMS
        uRippleAmplitude:    { value: 1.0 },
        uRippleFrequency:    { value: 10.0 },
        uRippleSpeed:        { value: 0.2 },
        uRippleCenter:       { value: new THREE.Vector2(0.0, 0.5) },
        uRippleStrength:     { value: 50.0 },
    },

    vertexShader: `
        uniform float uTime;
        uniform float uWaveSpeed;
        uniform float uWaveStrength;

        // NEW RIPPLE UNIFORMS
        uniform float uRippleAmplitude;
        uniform float uRippleFrequency;
        uniform float uRippleSpeed;
        uniform vec2  uRippleCenter;
        uniform float uRippleStrength;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying vec4 vClipPos;
        varying vec3 vViewDir;

        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 19.19);
            return fract(p.x * p.y);
        }

        // Simple noise function for ripples
        float noise(vec2 p) {
            return hash21(floor(p));
        }

        void main() {
            vUv = uv;
            vec3 newPos = position;
            float t = uTime * uWaveSpeed;
            
            // Existing wave layers
            float wave1 = sin(uv.x * 3.0 + t) * cos(uv.y * 3.0 - t * 0.8);
            float wave2 = sin(uv.x * 5.0 - t * 1.2) * cos(uv.y * 4.0 + t);
            float wave3 = sin(uv.x * 7.0 + t * 1.5) * cos(uv.y * 7.0 - t * 1.3);
            newPos.y += (wave1 * 0.5 + wave2 * 0.25 + wave3 * 0.125) * uWaveStrength;
    
            // NEW: Dynamic Ripples
            // Calculate distance from ripple center
            vec2 toCenter = uv - uRippleCenter;
            float dist = length(toCenter);
            
            // Create ripples emanating from the center
            float ripple = sin((dist * uRippleFrequency - uTime * uRippleSpeed) * 6.2831) * exp(-dist * 3.0) * uRippleAmplitude;
            newPos.y += ripple;
    
            // Modify normals based on ripples
            // Approximate normals by calculating gradients
            float delta = 0.001;
            vec3 dx = vec3(delta, 
                          sin((length((uv + vec2(delta, 0.0)) - uRippleCenter) * uRippleFrequency - uTime * uRippleSpeed) * 6.2831) * exp(-length((uv + vec2(delta, 0.0)) - uRippleCenter) * 3.0) * uRippleAmplitude,
                          0.0);
            vec3 dz = vec3(0.0, 
                          sin((length((uv + vec2(0.0, delta)) - uRippleCenter) * uRippleFrequency - uTime * uRippleSpeed) * 6.2831) * exp(-length((uv + vec2(0.0, delta)) - uRippleCenter) * 3.0) * uRippleAmplitude,
                          delta);
            vec3 rippleNormal = normalize(cross(dz - vec3(0.0), dx - vec3(0.0)));
            vNormal = normalize(normalMatrix * rippleNormal);
    
            vec4 worldPos = modelMatrix * vec4(newPos, 1.0);
            vWorldPos = worldPos.xyz;
            vViewDir = normalize(cameraPosition - vWorldPos);
            vClipPos = projectionMatrix * viewMatrix * worldPos;
            
            gl_Position = vClipPos;
        }
    `,

    fragmentShader: `
        // ---------------------------
        // Helpers & Noise
        // ---------------------------
        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 19.19);
            return fract(p.x * p.y);
        }

        // Basic 2D noise function
        float noise2D(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            return mix(
                mix(a, b, f.x),
                mix(c, d, f.x),
                f.y
            );
        }

        // Fractional Brownian Motion
        float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 3.0;
            for(int i = 0; i < 5; i++) {
                value += amplitude * noise2D(p * frequency);
                amplitude *= 0.5;
                frequency *= 2.0;
                p += value; // slight “drift” in the domain
            }
            return value;
        }

        // Wave normal with multiple frequencies
        vec2 waveNormal(vec2 uv, float time) {
            vec2 wave = vec2(0.0);
            wave += vec2(
                sin(uv.x * 2.0 + time * 0.5) * cos(uv.y * 2.0 - time * 0.3),
                sin(uv.x * 2.2 - time * 0.4) * sin(uv.y * 2.1 + time * 0.4)
            ) * 0.5;
            wave += vec2(
                sin(uv.x * 4.0 + time * 1.2) * cos(uv.y * 4.2 - time * 0.8),
                sin(uv.x * 4.1 - time * 0.9) * sin(uv.y * 4.3 + time * 1.1)
            ) * 0.25;
            wave += vec2(
                sin(uv.x * 8.0 + time * 2.0) * cos(uv.y * 8.2 - time * 1.8),
                sin(uv.x * 8.1 - time * 1.9) * sin(uv.y * 8.3 + time * 2.1)
            ) * 0.125;
            return wave;
        }

        // ---------------------------
        // Bubbles on Edges
        // ---------------------------
        float edgeBubbles(
            vec2 uv,
            sampler2D intersectionTex,
            float time,
            float count,
            float speed,
            float size
        ) {
            float bubbles = 0.0;
            float gradientThreshold = 0.0;
            float edgeBias = 0.01;

            for (int i = 0; i < 200; i++) {
                if(float(i) >= count) break;
                
                vec2 seed = vec2(float(i) * 13.45, float(i) * 7.89);
                vec2 randUV = vec2(hash21(seed), hash21(seed + 1.234));
                
                // Specify mip level explicitly with textureLod
                float gCenter = textureLod(intersectionTex, randUV, 0.0).g;
                float gRight = textureLod(intersectionTex, randUV + vec2(edgeBias, 0.0), 0.0).g;
                float gUp = textureLod(intersectionTex, randUV + vec2(0.0, edgeBias), 0.0).g;
                float gradX = abs(gCenter - gRight);
                float gradY = abs(gCenter - gUp);
                float gradMag = max(gradX, gradY);

                if (gradMag > gradientThreshold) {
                    float t     = time * speed;
                    float angle = t + hash21(seed + 2.718) * 6.2831; 
                    vec2 offset = vec2(cos(angle), sin(angle)) * 0.02;
                    vec2 center = randUV + offset;

                    float dist   = length(uv - center);
                    float bubble = smoothstep(size, size * 0.8, dist);
                    float glow   = smoothstep(size * 0.8, size * 0.2, dist);
                    bubble      += glow * 0.8;

                    bubbles = max(bubbles, bubble);
                }
            }
            return bubbles;
        }

        // ---------------------------
        // Main Fragment
        // ---------------------------
        uniform float uTime;
        uniform vec3  uBaseColor;
        uniform vec3  uFresnelColor;
        uniform vec3  uSpecularColor;
        uniform float uWaveSpeed;
        uniform float uWaveStrength;
        uniform float uFresnelPower;
        uniform float uSpecularIntensity;
        uniform float uOpacity;
        uniform float uBubbleCount;
        uniform float uBubbleDriftSpeed;
        uniform vec3  uBubbleColor;
        uniform float uBubbleVisibility;
        uniform float uBubbleSize;
        uniform vec3  uFoamColor;
        uniform float uFoamIntensity;
        uniform sampler2D tReflection;
        uniform samplerCube tEnvironment;
        uniform float uReflectionStrength;
        uniform float uEnvStrength;
        uniform sampler2D tIntersections;
        uniform float uIntersectionTextureSize;

        // NEW CAUSTICS UNIFORMS
        uniform vec3  uCausticsColor;
        uniform float uCausticsScale;
        uniform float uCausticsSpeed;
        uniform float uCausticsIntensity;

        // NEW RIPPLE UNIFORMS
        uniform float uRippleAmplitude;
        uniform float uRippleFrequency;
        uniform float uRippleSpeed;
        uniform vec2  uRippleCenter;
        uniform float uRippleStrength;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying vec4 vClipPos;
        varying vec3 vViewDir;

        void main() {
            // Screen-space reflection lookup
            vec2 screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
            vec3 terrainReflection = texture2D(tReflection, screenUV).rgb;

            // Environment reflection
            vec3 reflectVec = reflect(-vViewDir, normalize(vNormal));
            vec3 envReflection = textureCube(tEnvironment, reflectVec).rgb;

            // Water normal from wave function
            float t = uTime * uWaveSpeed;
            vec2 wN = waveNormal(vUv, t) * uWaveStrength;
            vec3 normal = normalize(vec3(-wN.x, 1.0, -wN.y));

            // Fresnel term
            float fresnel = pow(1.0 - max(dot(normal, vViewDir), 0.0), uFresnelPower);
            // Add slight time-based pulsing to fresnel
            fresnel *= (0.8 + 0.2 * sin(uTime * 2.0));

            // Combined reflection
            vec3 reflectionCol = mix(terrainReflection, envReflection, uEnvStrength);
            float reflectionFactor = (0.4 + 0.6 * fresnel) * uReflectionStrength;

            // Base water color
            vec3 baseCol = mix(uBaseColor, uBaseColor * 0.7, wN.x * 0.5 + 0.5);
            vec3 color = mix(baseCol, reflectionCol, reflectionFactor);


// ---------------------------
// 2) Dynamic Foam near intersections
// ---------------------------
// Get intersection data - green channel contains the land/water transition
vec3 intersectionData = texture2D(tIntersections, vUv).rgb;

// Create a gradient falloff from the shore
float shoreDist = intersectionData.g;
float baseFoam = smoothstep(0.0, 1.0, shoreDist);

// Create multi-layered noise for foam texture
// Use different scales for each layer to add complexity
vec2 foamNoiseUV1 = vUv * 125.0 + vec2(uTime * 0.2, uTime * 0.15);
vec2 foamNoiseUV2 = vUv * 112.0 - vec2(uTime * 0.17, uTime * 0.11);
vec2 foamNoiseUV3 = vUv * 117.0 + vec2(uTime * 0.1, -uTime * 0.13);

float noise1 = noise2D(foamNoiseUV1);
float noise2 = noise2D(foamNoiseUV2);
float noise3 = noise2D(foamNoiseUV3);

// Combine noise layers with different weights
float noisePattern = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;

// Create foam detail that varies with distance from shore
float foamDetailIntensity = mix(0.5, 0.1, shoreDist); // More detail near shore
vec2 fbmUV = vUv * 4.0 + vec2(uTime * 0.08, -uTime * 0.06);
float foamDetail = fbm(fbmUV) * foamDetailIntensity;

// Create dynamic foam that pulses and moves with waves
float waveInfluence = (wN.x + wN.y) * 0.1; // Use wave normals to influence foam
float timePulse = sin(uTime * 0.5 + noisePattern * 4.0) * 0.08;
float dynamicThreshold = 0.2 + timePulse + waveInfluence;

// Create primary foam with varied threshold based on noise and time
float primaryFoam = smoothstep(
    dynamicThreshold - 0.05, 
    dynamicThreshold + 0.2, 
    shoreDist + noisePattern * 0.15
);

// Add secondary foam patches that appear further out
float secondaryFoam = smoothstep(
    0.35 + timePulse,
    0.45 + timePulse,
    shoreDist + foamDetail
) * (1.0 - shoreDist) * 0.4; // Fade out as we move away from shore

// Create small bubbles/patches with sharper contrast near the shore
float bubbleMask = step(0.7, noise1 * noise2) * smoothstep(0.5, 0.1, shoreDist) * 0.5;

// Combine all foam elements
float foamAmount = max(max(primaryFoam, secondaryFoam), bubbleMask);

// Add variation to foam based on wave movement
foamAmount *= 1.0 + (wN.x * 0.3 + wN.y * 0.3);

// Add edge turbulence using rotated noise
vec2 turbulenceUV = vUv * 15.0 + waveNormal(vUv, uTime * 0.25) * 3.0;
float edgeNoise = noise2D(turbulenceUV);
foamAmount = min(foamAmount * (1.0 + edgeNoise * 0.4), 1.0);

// Final foam color with variation - add slight blue tint to parts of the foam for realism
vec3 foamBaseColor = uFoamColor * (0.95 + noise3 * 0.1);
vec3 foamTint = mix(foamBaseColor, uBaseColor * 1.2, noise2 * 0.3);
vec3 finalFoamColor = mix(foamTint, foamBaseColor, primaryFoam);

// Apply foam to the final color
color = mix(color, finalFoamColor, foamAmount * uFoamIntensity);
            // ---------------------------
            // 3) Caustic Effect
            // ---------------------------
            // Use fbm to get swirling patterns.
            // We can sample at slightly offset coordinates to
            // make the pattern move with the water waves (wN).
            vec2 causticsUV = vUv * uCausticsScale + wN * 2.0 + uTime * uCausticsSpeed;
            float causticsVal = fbm(causticsUV);

            // Accent bright spots
            float causticsMask = smoothstep(0.6, 0.8, causticsVal);

            // Tint by the caustics color, add or multiply.
            // Here we do an additive approach with some intensity.
            vec3 causticsHighlight = uCausticsColor * causticsMask * uCausticsIntensity;

            // Add the caustics in
            color += causticsHighlight;

            // ---------------------------
            // 4) Advanced Lighting with Ripples (NEW)
            // ---------------------------
            // Adjust lighting based on ripple-induced normals
            // Recalculate specular based on updated normals
            vec3 lightDir = normalize(vec3(0.0, 1.0, 0.0));
            float ndl = max(dot(vNormal, lightDir), 1.0);
            vec3 reflectDir = reflect(-lightDir, vNormal);
            float spec = pow(max(dot(reflectDir, vViewDir), 0.0), 64.0) * ndl; // Lower shininess for broader highlights
            color += uSpecularColor * spec * uSpecularIntensity;

            // Optional: Add ambient occlusion based on wave steepness
            float ao = smoothstep(0.0, 1.0, length(vNormal.xy));
            color *= mix(1.0, 0.9, ao * 0.2); // Slight darkening in areas with steep waves

            // ---------------------------
            // 5) Fresnel rim
            // ---------------------------
            color = mix(color, uFresnelColor, fresnel * 0.3);

            gl_FragColor = vec4(color, uOpacity);
        }
    `
};