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
        uBaseColor: { value: new THREE.Color(0x0066cc) },
        uFresnelColor: { value: new THREE.Color(0x88ccff) },
        uSkyColor1: { value: new THREE.Color(0x87ceeb) },
        uSkyColor2: { value: new THREE.Color(0xf0f8ff) },
        uSpecularColor: { value: new THREE.Color(0xffffff) },
        uWaveSpeed: { value: 2.5 },
        uWaveStrength: { value: 5.5 },
        uFresnelPower: { value: 0.3 },
        uSpecularIntensity: { value: 0.1 },
        uOpacity: { value: 0.65 },
        tIntersections: { value: null },
        uIntersectionTextureSize: { value: 1.0 },
        uBubbleCount: { value: 500.0 },
        uBubbleDriftSpeed: { value: 0.05 },
        uBubbleColor: { value: new THREE.Color(0xddddff) },
        uBubbleVisibility: { value: 0.6 },
        uBubbleSize: { value: 0.002 },
        uFoamSlopeThreshold: { value: 1.0 },
        uFoamColor: { value: new THREE.Color(0xddddff) },
        uFoamIntensity: { value: 0.7 },
        tReflection: { value: null },
        tEnvironment: { value: null },
        uReflectionStrength: { value: 0.3 },
        uEnvStrength: { value: 0.2 },

        // NEW CAUSTICS UNIFORMS
        uCausticsColor:   { value: new THREE.Color(0xffffff) },
        uCausticsScale:   { value: 50.0 },
        uCausticsSpeed:   { value: 0.02 },
        uCausticsIntensity: { value: 0.02 },

        // NEW RIPPLE UNIFORMS
        uRippleAmplitude:    { value: 1.5 },
        uRippleFrequency:    { value: 1.0 },
        uRippleSpeed:        { value: 1.0 },
        uRippleCenter:       { value: new THREE.Vector2(0.0, 0.5) },
        uRippleStrength:     { value: 1.3 },
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

            float gradientThreshold = 0.0;  // How sharp an edge must be
            float edgeBias          = 0.01; // For computing gradient

            for (int i = 0; i < 200; i++) { 
                // The loop count must be constant in GLSL; clamp here:
                if(float(i) >= count) break;

                vec2 seed   = vec2(float(i) * 13.45, float(i) * 7.89);
                vec2 randUV = vec2(hash21(seed), hash21(seed + 1.234));

                float gCenter = texture2D(intersectionTex, randUV).g;
                float gRight  = texture2D(intersectionTex, randUV + vec2(edgeBias, 0.0)).g;
                float gUp     = texture2D(intersectionTex, randUV + vec2(0.0, edgeBias)).g;

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
        uniform float uFoamSlopeThreshold;
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
            // 1) Bubbles near edges
            // ---------------------------
            float bubbleMask = edgeBubbles(vUv, tIntersections, uTime, uBubbleCount, uBubbleDriftSpeed, uBubbleSize);
            color = mix(color, uBubbleColor, bubbleMask * uBubbleVisibility);

            // ---------------------------
            // 2) Dynamic Foam near intersections
            // ---------------------------
            vec3 intersectionData = texture2D(tIntersections, vUv).rgb;

            // Base foam calculation using intersection slope data
            float baseFoam = smoothstep(0.1, 0.7, intersectionData.y);

            // Animate foam with multi-layer noise
            vec2 foamNoiseUV1 = vUv * 15.0 + vec2(uTime * 0.3, uTime * 0.2);
            vec2 foamNoiseUV2 = vUv * 8.0 - vec2(uTime * 0.25, uTime * 0.15);
            float noise1 = noise2D(foamNoiseUV1);
            float noise2 = noise2D(foamNoiseUV2 * 1.7);
            float noisePattern = mix(noise1, noise2, 0.5);

            // Create pulsing threshold effect
            float animatedThreshold = sin(uTime * 2.0 + noisePattern * 6.283) * 0.02;
            float dynamicFoam = smoothstep(
                0.1 - animatedThreshold, 
                0.4 + animatedThreshold, 
                intersectionData.y + noisePattern * 0.1
            );

            // Add surface foam detail using FBM
            vec2 fbmUV = vUv * 12.0 + vec2(uTime * 0.1, uTime * -0.08);
            float foamDetail = fbm(fbmUV) * 0.4;
            dynamicFoam = clamp(dynamicFoam + foamDetail, 0.0, 1.0);

            // Combine base and animated foam
            float foamAmount = max(baseFoam, dynamicFoam);

            // Add edge turbulence using rotated noise
            vec2 rotUV = vUv * 10.0 + waveNormal(vUv, uTime * 0.3) * 2.0;
            float edgeNoise = noise2D(rotUV + uTime * 0.5);
            foamAmount *= 1.0 + edgeNoise * 0.3;

            // Final foam color with variation
            vec3 foamCol = mix(
                uFoamColor, 
                uFoamColor * (0.9 + noisePattern * 0.3), 
                smoothstep(0.3, 0.7, noise1)
            );
            color = mix(color, foamCol, foamAmount * uFoamIntensity);
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
            vec3 lightDir = normalize(vec3(0.2, 1.0, 0.3));
            float ndl = max(dot(vNormal, lightDir), 0.0);
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