import * as THREE from 'three';

export const ScorchShader = {
  uniforms: {
    hitPosition: { value: new THREE.Vector2() },
    radius: { value: 100.0 },
    intensity: { value: 1.0 },
    existingScorches: { value: null },
    terrainSize: { value: new THREE.Vector2(1200, 1200) } // Actual terrain dimensions
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform vec2 hitPosition;
    uniform vec2 terrainSize;
    uniform float radius;
    uniform float intensity;
    uniform sampler2D existingScorches;
    
    varying vec2 vUv;
    
    void main() {
      // Convert UV to world space coordinates
      vec2 worldPos = (vUv * 2.0 - 1.0) * terrainSize * 0.5;
      
      // Calculate distance in world space
      float dist = length(worldPos - hitPosition);
      
      // Sample existing scorches
      vec4 existing = texture2D(existingScorches, vUv);
      
      // Create new scorch mark with smooth falloff
      // smoothstep edge1: inner radius (solid red), edge0: outer radius (start fading)
      float scorch = smoothstep(radius, radius * 0.5, dist) * intensity;
      
      // Combine with existing, ensuring we don't exceed 1.0
      float finalScorch = min(existing.r + scorch, 0.8);
      
      // Interpolate between black and red based on finalScorch
      vec3 color = mix(vec3(0.0), vec3(1.0, 0.0, 0.0), finalScorch);
      
      gl_FragColor = vec4(color, 1.0);
    }
  `
};
