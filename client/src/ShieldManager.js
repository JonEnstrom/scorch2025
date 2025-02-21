// ShieldManager.js
import * as THREE from 'three';

export class ShieldManager {
    /**
     * Creates an instance of ShieldManager.
     * @param {THREE.Scene} scene - The Three.js scene where shields will be added.
     */
    constructor(scene) {
        this.scene = scene;
        this.shields = new Map();
        this.shieldGeometry = new THREE.SphereGeometry(1.2, 32, 32);
        const textureLoader = new THREE.TextureLoader();
        const shieldTexture = textureLoader.load('textures/shield_texture3.jpg');
        shieldTexture.wrapS = THREE.RepeatWrapping;
        shieldTexture.wrapT = THREE.RepeatWrapping;

        this.shieldMaterial = new THREE.ShaderMaterial({
            vertexShader: `
                uniform float time;
                varying vec3 vWorldPosition;
                varying vec3 vNormal;
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                uniform float opacity;
                uniform sampler2D shieldTexture;
                uniform float rotationAngle;

                varying vec3 vWorldPosition;
                varying vec3 vNormal;
                varying vec2 vUv;

                // Simplex noise function for procedural texture
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

                    vec3 i = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);

                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min(g.xyz, l.zxy);
                    vec3 i2 = max(g.xyz, l.zxy);

                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;

                    i = mod289(i);
                    vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

                    float n_ = 0.142857142857;
                    vec3 ns = n_ * D.wyz - D.xzx;

                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_);

                    vec4 x = x_ * ns.x + ns.yyyy;
                    vec4 y = y_ * ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);

                    vec4 b0 = vec4(x.xy, y.xy);
                    vec4 b1 = vec4(x.zw, y.zw);

                    vec4 s0 = floor(b0) * 2.0 + 1.0;
                    vec4 s1 = floor(b1) * 2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));

                    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
                    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

                    vec3 p0 = vec3(a0.xy, h.x);
                    vec3 p1 = vec3(a0.zw, h.y);
                    vec3 p2 = vec3(a1.xy, h.z);
                    vec3 p3 = vec3(a1.zw, h.w);

                    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
                    p0 *= norm.x;
                    p1 *= norm.y;
                    p2 *= norm.z;
                    p3 *= norm.w;

                    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
                }

                void main() {
                    // View direction
                    vec3 worldCamDir = normalize(cameraPosition - vWorldPosition);

                    // Rotate the normal for fresnel effect
                    float angle = rotationAngle;
                    mat2 rotationMatrix = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
                    vec3 rotatedNormal = vNormal;
                    rotatedNormal.xz = rotationMatrix * rotatedNormal.xz;

                    // Fresnel effect
                    float fresnel = 1.0 - dot(normalize(rotatedNormal), worldCamDir);
                    fresnel = pow(fresnel, 1.0);

                    // Pulsating effect
                    float pulse = 0.5 + 0.5 * sin(time * 1.5);

                    // Procedural noise for texture
                    float noise = snoise(vec3(vUv * 5.0, time * 0.5));

                    // Combine effects
                    vec3 shieldColor = color * fresnel * pulse;
                    shieldColor += vec3(noise * 0.7); // Add noise for texture

                    // Texture overlay (optional)
                    vec4 textureColor = texture2D(shieldTexture, vUv * 2.0);
                    shieldColor = mix(shieldColor, textureColor.rgb, textureColor.a * 0.3);

                    // Final color with transparency
                    gl_FragColor = vec4(shieldColor, fresnel * opacity);
                }
            `,
            uniforms: {
                time: { value: 0.0 },
                color: { value: new THREE.Color(0x77bb77) }, 
                opacity: { value: 0.3 },
                shieldTexture: { value: shieldTexture }, // Optional texture
                rotationAngle: { value: 1.0 } // New uniform for rotation
            },
            transparent: true,
            side: THREE.FrontSide
        });

        this.clock = new THREE.Clock();
    }

    /**
     * Adds a shield around a player.
     * @param {THREE.Object3D} player - The player object to surround with a shield.
     */
    addShield(player) {
        if (this.shields.has(player)) {
            console.warn('ShieldManager: Shield already exists for this player.');
            return;
        }

        this.shieldMesh = new THREE.Mesh(this.shieldGeometry, this.shieldMaterial.clone());
        this.shieldMesh.scale.copy(player.scale).multiplyScalar(30);

        // Ensure the shield doesn't interfere with player controls by disabling interactions
        this.shieldMesh.name = 'playerShield';

        // Add the shield as a child of the player object
        player.add(this.shieldMesh);

        // Store the shield mesh in the map
        this.shields.set(player, this.shieldMesh);
    }

    /**
     * Removes the shield from a player.
     * @param {THREE.Object3D} player - The player object whose shield should be removed.
     */
    removeShield(player) {
        const shield = this.shields.get(player);
        if (!shield) {
            console.warn('ShieldManager: No shield found for this player.');
            return;
        }
        player.remove(shield);
        this.shields.delete(player);
    }

    /**
     * Updates all shields. Should be called once per frame.
     */
    update() {
        const elapsedTime = this.clock.getElapsedTime();
        this.shields.forEach(shield => {
            shield.material.uniforms.time.value = elapsedTime;
            shield.material.uniforms.rotationAngle.value = elapsedTime * 1.5; // Rotate over time
        });
        const axis = new THREE.Vector3(0, 1, 0);
    }

    /**
     * Cleans up all shields and disposes of resources.
     * Call this when shutting down the ShieldManager or the game.
     */
    dispose() {
        // Remove all shields from their respective players
        for (const [player, shield] of this.shields.entries()) {
            player.remove(shield);
        }
        this.shields.clear();

        // Dispose shared geometry and material
        this.shieldGeometry.dispose();
        this.shieldMaterial.dispose();
    }
}