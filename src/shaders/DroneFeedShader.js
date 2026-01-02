// DroneFeedShader.js

import * as THREE from 'three';

export const DroneFeedShader = {
  uniforms: {
    tDiffuse:    { value: null },           // Scene render
    time:        { value: 0.0 },            // Time uniform for animating noise/glitches
    resolution:  { value: new THREE.Vector2() },
    noiseAmount: { value: 0.01 },           // Intensity of noise
    scanlineIntensity: { value: 0.1 },      // Strength of horizontal scan lines
    colorOffset: { value: 0.001 }           // Offset factor for color-channel shifts
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    // Drone / low-quality camera post effect

    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform float noiseAmount;
    uniform float scanlineIntensity;
    uniform float colorOffset;

    varying vec2 vUv;

    // Simple pseudo-random generator based on uv
    float rand(vec2 co) {
      return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      // Read the original scene color
      vec4 color = texture2D(tDiffuse, vUv);

      // --- 1. Color Channel Distortion ---
      // Slight horizontal shift for each color channel
      float rOffset = colorOffset * 0.75;
      float gOffset = colorOffset * 1.0;
      float bOffset = colorOffset * 1.25;

      // Sample each color channel at a slightly different UV to create a subtle RGB glitch
      float rCol = texture2D(tDiffuse, vUv + vec2(rOffset, 0.0)).r;
      float gCol = texture2D(tDiffuse, vUv + vec2(-gOffset, 0.0)).g;
      float bCol = texture2D(tDiffuse, vUv + vec2(bOffset, 0.0)).b;
      
      color = vec4(rCol, gCol, bCol, 1.0);

      // --- 2. Noise / Static ---
      // Vary noise with time and UV, adjusting by 'noiseAmount'
      float noise = rand(vUv + time * 0.1) * noiseAmount;
      color.rgb += noise;

      // --- 3. Horizontal Scan Lines ---
      // Add horizontal lines that move or pulse slightly with time
      float scanline = sin(vUv.y * resolution.y * 1.5 + time * 10.0);
      // Mix a fraction of the scanline into brightness
      color.rgb -= scanline * scanlineIntensity * 0.5;

      // --- 4. Slight desaturation or color grading (Optional) ---
      // You can tweak the factor to saturate/desaturate
      float average = (color.r + color.g + color.b) / 3.0;
      color.rgb = mix(color.rgb, vec3(average), 0.2);

      gl_FragColor = color;
    }
  `
};
