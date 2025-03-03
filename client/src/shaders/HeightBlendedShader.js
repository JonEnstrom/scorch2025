import * as THREE from 'three';

export const HeightBlendedShader = {
  uniforms: {
    textureWater: { value: null },
    textureLow: { value: null },
    textureMid: { value: null },
    textureHigh: { value: null },
    textureMountain: { value: null },
    normalWater: { value: null },
    normalLow: { value: null },
    normalMid: { value: null },
    normalHigh: { value: null },
    normalMountain: { value: null },
    scaleWater: { value: 1.0 },
    scaleLow: { value: 1.0 },
    scaleMid: { value: 1.0 },
    scaleHigh: { value: 1.0 },
    scaleMountain: { value: 1.0 },
    thresholdWater: { value: -5.0 },
    thresholdLow: { value: 2.0 },
    thresholdMid: { value: 10.0 },
    thresholdHigh: { value: 20.0 },
    blendRange: { value: 2.0 },
    lightPosition: { value: new THREE.Vector3(0, 1000, 0) },
    ambientColor: { value: new THREE.Color(0.05, 0.05, 0.05) },
    diffuseColor: { value: new THREE.Color(0.4, 0.4, 0.4) },
    specularColor: { value: new THREE.Color(0.1, 0.1, 0.1) },
    shininess: { value: 10 },
    normalScale: { value: 2 },
    shadowMap: { value: null },                
    shadowMatrix: { value: new THREE.Matrix4() },  
    shadowDarkness: { value: 0.70 },              
    shadowBias: { value: 0.005 },            
    scorchPositions: { value: null },
    terrainSize: { value: new THREE.Vector2(2400, 2400) },

    // **New Uniform for Scorch Texture**
    scorchTexture: { value: null }, 
  },

  vertexShader: `
varying float vHeight;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// Shadow mapping
varying vec4 vShadowCoord;
uniform mat4 shadowMatrix;

void main() {
    // Store the displaced height
    vHeight = position.z;

    // Compute world position
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    // Compute world-space normal
    // Transforming (normal, 0.0) by modelMatrix puts it in world space.
    vec4 worldNormal = modelMatrix * vec4(normal, 0.0);
    vWorldNormal = normalize(worldNormal.xyz);

    // Prepare shadow coordinates
    vShadowCoord = shadowMatrix * worldPosition;

    // Standard MVP transform
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
  `,

  fragmentShader: `
uniform sampler2D textureWater, textureLow, textureMid, textureHigh, textureMountain;
uniform sampler2D normalWater,  normalLow,  normalMid,  normalHigh,  normalMountain;

uniform sampler2D scorchPositions; // RenderTarget storing scorch positions/intensities
uniform sampler2D scorchTexture;    // **New Uniform for Scorch Texture**
uniform vec2 terrainSize;

// Each layer’s UV scale
uniform float scaleWater, scaleLow, scaleMid, scaleHigh, scaleMountain;

// Blending thresholds
uniform float thresholdWater, thresholdLow, thresholdMid, thresholdHigh, blendRange;

// Lighting
uniform vec3 lightPosition;   // In world space
uniform vec3 ambientColor, diffuseColor, specularColor;
uniform float shininess;
uniform float normalScale;    // Overall scale for the normal maps

// Fog
uniform vec3 fogColor;
uniform float fogDensity;

// Shadows
uniform sampler2D shadowMap;
uniform float shadowDarkness;
uniform float shadowBias;

// Per-fragment data from vertex shader
varying float vHeight;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

varying vec4 vShadowCoord;

// ---------------------------------------------------
// 1) 6-Way Projection Helpers
// ---------------------------------------------------
/**
 * Samples a color texture using 6-way (box) projection.
 * We treat +X, -X, +Y, -Y, +Z, -Z directions separately,
 * weighting each by how strongly the fragment’s world normal
 * points in that direction.
 *
 * @param tex       The sampler2D to sample
 * @param worldPos  The fragment's world position
 * @param worldNorm The fragment's world normal (world space)
 * @param scale     Texture scale factor
 */
vec4 sample6WayColor(sampler2D tex, vec3 worldPos, vec3 worldNorm, float scale) {
    // 1) Compute positive/negative axis weights
    float wXp = max( worldNorm.x, 0.0 );
    float wXn = max(-worldNorm.x, 0.0 );
    float wYp = max( worldNorm.y, 0.0 );
    float wYn = max(-worldNorm.y, 0.0 );
    float wZp = max( worldNorm.z, 0.0 );
    float wZn = max(-worldNorm.z, 0.0 );

    // Sum of weights
    float sum = wXp + wXn + wYp + wYn + wZp + wZn + 1e-5;

    // 2) For each axis direction, compute a suitable UV
    //    (You can flip or reorder as desired to keep textures aligned)
    vec2 uvXpos = worldPos.yz * scale; // +X
    vec2 uvXneg = worldPos.yz * scale; // -X
    vec2 uvYpos = worldPos.xz * scale; // +Y
    vec2 uvYneg = worldPos.xz * scale; // -Y
    vec2 uvZpos = worldPos.xy * scale; // +Z
    vec2 uvZneg = worldPos.xy * scale; // -Z

    // 3) Sample each
    vec4 cXpos = texture2D(tex, uvXpos);
    vec4 cXneg = texture2D(tex, uvXneg);
    vec4 cYpos = texture2D(tex, uvYpos);
    vec4 cYneg = texture2D(tex, uvYneg);
    vec4 cZpos = texture2D(tex, uvZpos);
    vec4 cZneg = texture2D(tex, uvZneg);

    // 4) Weighted blend
    vec4 color =
        cXpos * wXp +
        cXneg * wXn +
        cYpos * wYp +
        cYneg * wYn +
        cZpos * wZp +
        cZneg * wZn;

    return color / sum;
}

/**
 * Samples a normal map using 6-way (box) projection
 * and returns a world-space normal.
 *
 * Similar logic to sample6WayColor, but we decode the normals
 * and transform them into their respective world directions
 * before blending.
 */
vec3 sample6WayNormal(sampler2D tex, vec3 worldPos, vec3 worldNorm, float scale) {
    // 1) Axis weights
    float wXp = max( worldNorm.x, 0.0 );
    float wXn = max(-worldNorm.x, 0.0 );
    float wYp = max( worldNorm.y, 0.0 );
    float wYn = max(-worldNorm.y, 0.0 );
    float wZp = max( worldNorm.z, 0.0 );
    float wZn = max(-worldNorm.z, 0.0 );

    float sum = wXp + wXn + wYp + wYn + wZp + wZn + 1e-5;

    // 2) UVs
    vec2 uvXpos = worldPos.yz * scale; // +X
    vec2 uvXneg = worldPos.yz * scale; // -X
    vec2 uvYpos = worldPos.xz * scale; // +Y
    vec2 uvYneg = worldPos.xz * scale; // -Y
    vec2 uvZpos = worldPos.xy * scale; // +Z
    vec2 uvZneg = worldPos.xy * scale; // -Z

    // 3) Fetch the normal maps (in tangent space, 0..1 => -1..1)
    vec3 nXpos = texture2D(tex, uvXpos).xyz * 2.0 - 1.0;
    vec3 nXneg = texture2D(tex, uvXneg).xyz * 2.0 - 1.0;
    vec3 nYpos = texture2D(tex, uvYpos).xyz * 2.0 - 1.0;
    vec3 nYneg = texture2D(tex, uvYneg).xyz * 2.0 - 1.0;
    vec3 nZpos = texture2D(tex, uvZpos).xyz * 2.0 - 1.0;
    vec3 nZneg = texture2D(tex, uvZneg).xyz * 2.0 - 1.0;

    // 4) Apply user-defined normalScale to the X/Y components
    nXpos.xy *= normalScale;
    nXneg.xy *= normalScale;
    nYpos.xy *= normalScale;
    nYneg.xy *= normalScale;
    nZpos.xy *= normalScale;
    nZneg.xy *= normalScale;

    //------------------------------------------
    // 5) Define a tangent basis for each side
    //------------------------------------------
    // +X side:  S=(0,1,0), T=(0,0,1), N=(1,0,0)
    mat3 basisXpos = mat3(
        0.0, 0.0, 1.0,  // S
        0.0, 1.0, 0.0,  // T
        1.0, 0.0, 0.0   // N
    );

    // -X side:  S=(0,1,0), T=(0,0,-1), N=(-1,0,0)
    mat3 basisXneg = mat3(
        0.0,  0.0, -1.0,
        0.0,  1.0,  0.0,
       -1.0,  0.0,  0.0
    );

    // +Y side:  S=(1,0,0), T=(0,0,1), N=(0,1,0)
    mat3 basisYpos = mat3(
        1.0,  0.0, 0.0,
        0.0,  0.0, 1.0,
        0.0,  1.0, 0.0
    );

    // -Y side:  S=(1,0,0), T=(0,0,-1), N=(0,-1,0)
    mat3 basisYneg = mat3(
        1.0,  0.0,  0.0,
        0.0,  0.0, -1.0,
        0.0, -1.0,  0.0
    );

    // +Z side:  S=(1,0,0), T=(0,1,0), N=(0,0,1)
    mat3 basisZpos = mat3(
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 0.0, 1.0
    );

    // -Z side:  S=(-1,0,0), T=(0,1,0), N=(0,0,-1)
    // or you could flip S or T if you want consistent orientation
    mat3 basisZneg = mat3(
       -1.0, 0.0,  0.0,
        0.0, 1.0,  0.0,
        0.0, 0.0, -1.0
    );

    // 6) Rotate each normal into world space
    vec3 wNXpos = normalize(basisXpos * nXpos);
    vec3 wNXneg = normalize(basisXneg * nXneg);
    vec3 wNYpos = normalize(basisYpos * nYpos);
    vec3 wNYneg = normalize(basisYneg * nYneg);
    vec3 wNZpos = normalize(basisZpos * nZpos);
    vec3 wNZneg = normalize(basisZneg * nZneg);

    // 7) Weighted blend
    vec3 blended = 
        wNXpos * wXp +
        wNXneg * wXn +
        wNYpos * wYp +
        wNYneg * wYn +
        wNZpos * wZp +
        wNZneg * wZn;

    return normalize(blended / sum);
}

// ---------------------------------------------------
// 2) Shadow Helpers
// ---------------------------------------------------
float getShadowFactor(vec4 shadowCoord) {
    // Project into [0..1]
    vec3 projCoords = shadowCoord.xyz / shadowCoord.w;
    projCoords = projCoords * 0.5 + 0.5;

    // Outside the shadow map => fully lit
    if (projCoords.x < 0.0 || projCoords.x > 1.0 ||
        projCoords.y < 0.0 || projCoords.y > 1.0 ||
        projCoords.z < 0.0 || projCoords.z > 1.0) {
        return 1.0;
    }

    float currentDepth = projCoords.z - shadowBias;

    // Use the shadowMapSize uniform and pcfRadius
    vec2 shadowMapSize = vec2(8192, 8192);
    vec2 texelSize = 1.0 / shadowMapSize;
    float shadow = 0.0;

    // 5×5 PCF kernel
    // pcfRadius determines how far out from the center we sample
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            // offset for each tap
            vec2 offset = vec2(float(x), float(y)) * texelSize * 1.0;
            float closestDepth = texture2D(shadowMap, projCoords.xy + offset).r;
            shadow += (currentDepth > closestDepth) ? 0.0 : 1.0;
        }
    }

    // 25 samples in total
    shadow /= 25.0;
    return shadow;
}
// ---------------------------------------------------
 // 3) Main Fragment
// ---------------------------------------------------
void main() {
    //---------------------------
    // A) Calculate blend factors
    //---------------------------
    float waterFactor = 1.0 - smoothstep(
        thresholdWater - blendRange,
        thresholdWater + blendRange,
        vHeight
    );

    float lowFactor = smoothstep(
        thresholdWater - blendRange,
        thresholdWater + blendRange,
        vHeight
    ) * (1.0 - smoothstep(
        thresholdLow - blendRange,
        thresholdLow + blendRange,
        vHeight
    ));

    float midFactor = smoothstep(
        thresholdLow - blendRange,
        thresholdLow + blendRange,
        vHeight
    ) * (1.0 - smoothstep(
        thresholdMid - blendRange,
        thresholdMid + blendRange,
        vHeight
    ));

    float highFactor = smoothstep(
        thresholdMid - blendRange,
        thresholdMid + blendRange,
        vHeight
    ) * (1.0 - smoothstep(
        thresholdHigh - blendRange,
        thresholdHigh + blendRange,
        vHeight
    ));

    float mountainFactor = smoothstep(
        thresholdHigh - blendRange,
        thresholdHigh + blendRange,
        vHeight
    );

    // Sum for normalization
    float totalFactor = waterFactor + lowFactor + midFactor + highFactor + mountainFactor;
    // Avoid divide by zero
    totalFactor = max(totalFactor, 1e-5);

    //---------------------------
    // B) Sample 6-way color
    //---------------------------
    vec4 waterColor    = sample6WayColor(textureWater,    vWorldPosition, vWorldNormal, scaleWater);
    vec4 lowColor      = sample6WayColor(textureLow,      vWorldPosition, vWorldNormal, scaleLow);
    vec4 midColor      = sample6WayColor(textureMid,      vWorldPosition, vWorldNormal, scaleMid);
    vec4 highColor     = sample6WayColor(textureHigh,     vWorldPosition, vWorldNormal, scaleHigh);
    vec4 mountainColor = sample6WayColor(textureMountain, vWorldPosition, vWorldNormal, scaleMountain);

    vec4 blendedColor =
          waterColor    * waterFactor
        + lowColor      * lowFactor
        + midColor      * midFactor
        + highColor     * highFactor
        + mountainColor * mountainFactor;

    blendedColor /= totalFactor; // Normalize

    //-----------------------------
    // C) Sample 6-way normals
    //-----------------------------
    vec3 nWater    = sample6WayNormal(normalWater,    vWorldPosition, vWorldNormal, scaleWater);
    vec3 nLow      = sample6WayNormal(normalLow,      vWorldPosition, vWorldNormal, scaleLow);
    vec3 nMid      = sample6WayNormal(normalMid,      vWorldPosition, vWorldNormal, scaleMid);
    vec3 nHigh     = sample6WayNormal(normalHigh,     vWorldPosition, vWorldNormal, scaleHigh);
    vec3 nMountain = sample6WayNormal(normalMountain, vWorldPosition, vWorldNormal, scaleMountain);

    vec3 blendedNormal =
          nWater    * waterFactor
        + nLow      * lowFactor
        + nMid      * midFactor
        + nHigh     * highFactor
        + nMountain * mountainFactor;

    blendedNormal = normalize(blendedNormal);

    //------------------------
    // D) Lighting in world space
    //------------------------
    // Light direction
    vec3 lightDir = normalize(lightPosition - vWorldPosition);

    // View direction (assuming camera at origin in world => for correctness, pass cameraPos as uniform if needed)
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Half vector for Blinn-Phong
    vec3 halfDir = normalize(lightDir + viewDir);

    // Ambient
    vec3 ambient = ambientColor;

    // Diffuse
    float lambert = max(dot(blendedNormal, lightDir), 0.0);
    vec3 diffuse = diffuseColor * lambert;

    // Specular
    float spec = pow(max(dot(blendedNormal, halfDir), 0.0), shininess);
    vec3 specularLight = specularColor * spec;

    //------------------------
    // E) Shadow Calculation
    //------------------------
    float shadowFactor = getShadowFactor(vShadowCoord);
    float shadowMask = mix(1.0 - shadowDarkness, 1.0, shadowFactor);
    diffuse *= shadowMask;
    specularLight *= shadowMask;

    //------------------------
    // F) Combine lighting
    //------------------------
    vec3 litColor = blendedColor.rgb * (ambient + diffuse) + specularLight;

    // **Modified Section: Blend Scorch Texture Instead of Fading to Black**
    // Sample and apply scorch texture after lighting
    vec2 texCoords = (vWorldPosition.xz / terrainSize + 0.5);
    vec4 scorchData = texture2D(scorchPositions, texCoords);    
    float scorchIntensity = scorchData.r;

    // **Sample the Scorch Texture**
    vec4 scorchColor = texture2D(scorchTexture, texCoords);

    // **Blend the Scorch Texture with the Lit Color**
    // You can adjust the blending mode as needed. Here, we use linear interpolation.
    litColor = mix(litColor, scorchColor.rgb, scorchIntensity);

    //------------------------
    // G) Fog
    //------------------------
    float dist = length(vWorldPosition); // if camera is at world origin
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
    vec3 finalColor = mix(litColor, fogColor, fogFactor);

    gl_FragColor = vec4(finalColor, blendedColor.a);
}
  `
};
