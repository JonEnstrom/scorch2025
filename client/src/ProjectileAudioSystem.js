/**
 * ProjectileAudioSystem - Manages procedural audio for projectiles
 * Integrates with ProjectileTimelineManager to provide artillery shell sounds
 * Includes improved handling for multiple simultaneous explosions
 */
import * as THREE from 'three';

export class ProjectileAudioSystem {
    constructor(game) {
        this.game = game;
        this.listener = null;
        this.audioContext = null;
        this.activeAudioSources = new Map(); // Map projectileId -> audio data
        this.activeExplosions = new Map(); // Track active explosion sounds
        this.maxSimultaneousExplosions = 3; // Maximum number of full-volume explosions
        
        // Create a master bus for all explosion sounds
        this.explosionMasterBus = null;
        this.explosionCompressor = null;
        
        // Initialize audio system
        this.init();
    }
    
    init() {
        // Create audio listener (typically attached to camera)
        this.listener = new THREE.AudioListener();
        this.audioContext = this.listener.context;
        
        // Add listener to camera
        if (this.game.cameraManager && this.game.cameraManager.camera) {
            this.game.cameraManager.camera.add(this.listener);
        }
        
        // Set up master bus for explosions with compressor/limiter
        this.explosionMasterBus = this.audioContext.createGain();
        this.explosionCompressor = this.audioContext.createDynamicsCompressor();
        
        // Configure compressor for explosion sounds
        this.explosionCompressor.threshold.value = -24;
        this.explosionCompressor.knee.value = 10;
        this.explosionCompressor.ratio.value = 12;
        this.explosionCompressor.attack.value = 0.005;
        this.explosionCompressor.release.value = 0.25;
        
        // Connect the explosion processing chain
        this.explosionMasterBus.connect(this.explosionCompressor);
        this.explosionCompressor.connect(this.audioContext.destination);
    }
    
    // [existing projectile sound methods remain the same]
/**
 * Create projectile sound based on spawn event
 * @param {String} projectileId - The unique ID of the projectile
 * @param {Object} projectile - The projectile object
 * @param {Object} spawnEvent - The spawn event data
 * @returns {THREE.PositionalAudio} - The created sound object
 */
createProjectileSound(projectileId, projectile, spawnEvent) {
    // Check if this is a guided missile that should use Y-based sound
    if (this.isGuidedMissile(spawnEvent)) {
        return this.createGuidedMissileSound(projectileId, projectile, spawnEvent);
    }
    
    // Original implementation for standard projectiles
    // If this projectile already has sound, clean it up first
    if (this.activeAudioSources.has(projectileId)) {
        this.stopProjectileSound(projectileId);
    }
    
    // Create a positional audio source
    const sound = new THREE.PositionalAudio(this.listener);
    
    // Create audio nodes
    const whistleOsc = this.audioContext.createOscillator();
    whistleOsc.type = 'sine';
    
    const modOsc = this.audioContext.createOscillator();
    modOsc.type = 'sine';
    modOsc.frequency.value = 8;
    
    const modGain = this.audioContext.createGain();
    modGain.gain.value = 6;
    
    const mainGain = this.audioContext.createGain();
    mainGain.gain.value = 5;
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.0;
    
    // Create and connect noise generator for added texture
    const noiseNode = this.createNoiseGenerator();
    const noiseGain = this.audioContext.createGain();
    noiseGain.gain.value = 0.8;
    
    // Connect everything
    modOsc.connect(modGain);
    modGain.connect(whistleOsc.frequency);
    
    whistleOsc.connect(filter);
    noiseNode.connect(noiseGain);
    noiseGain.connect(filter);
    
    filter.connect(mainGain);
    // Connect to PositionalAudio by using its "gain" parameter
    mainGain.connect(sound.gain);
    
    // Add the audio source to the projectile
    if (projectile.mesh) {
        projectile.mesh.add(sound);
    }
    
    // Get custom sound settings based on weapon type
    const soundSettings = this.getSoundSettingsForProjectile(spawnEvent);
    
    // Set initial frequency
    const startFreq = soundSettings.startFreq;
    const endFreq = soundSettings.endFreq;
    
    whistleOsc.frequency.value = startFreq;
    filter.frequency.value = startFreq;
    
    // Start audio nodes
    const startTime = this.audioContext.currentTime;
    
    // Program volume envelope
    mainGain.gain.setValueAtTime(0.05, startTime);
    mainGain.gain.linearRampToValueAtTime(soundSettings.maxVolume, startTime + 0.1);
    
    whistleOsc.start(startTime);
    modOsc.start(startTime);
    noiseNode.start(startTime);
    
    // Store all audio nodes for later updates and cleanup
    this.activeAudioSources.set(projectileId, {
        sound,
        whistleOsc,
        modOsc,
        noiseNode,
        filter,
        mainGain,
        startTime,
        startFreq,
        endFreq,
        duration: soundSettings.duration,
        lastProgress: 0,
        isGuidedMissile: false
    });
    
    return sound;
}

/**
 * Determines if a projectile is a guided missile based on its properties
 * @param {Object} spawnEvent - The spawn event data
 * @returns {boolean} - True if the projectile is a guided missile
 */
isGuidedMissile(spawnEvent) {
    // Check projectile style
    if (spawnEvent.projectileStyle === 'guided_missile' || 
        spawnEvent.projectileStyle === 'homing_missile') {
        return true;
    }
    
    // Check weapon code prefixes that indicate guided weapons
    if (spawnEvent.weaponCode) {
        const guidedWeaponPrefixes = ['GM', 'AA', 'HM', 'ATGM'];
        for (const prefix of guidedWeaponPrefixes) {
            if (spawnEvent.weaponCode.startsWith(prefix)) {
                return true;
            }
        }
    }
    
    // Check for guided flag in spawn event
    if (spawnEvent.isGuided || spawnEvent.guidanceType) {
        return true;
    }
    
    return false;
}

    createNoiseGenerator() {
        const bufferSize = 2 * this.audioContext.sampleRate;
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        
        return noise;
    }
    
    getSoundSettingsForProjectile(spawnEvent) {
        // Default settings
        const defaults = {
            startFreq: 850,
            endFreq: 200,
            maxVolume: 0.25,
            duration: 3.0
        };
        
        // Customize based on weapon type if needed
        if (spawnEvent.weaponCode) {
            // For rockets/artillery, use higher pitch with longer sound
            if (spawnEvent.weaponCode.startsWith('RF01')) {
                return {
                    startFreq: 2950,
                    endFreq: 1150,
                    maxVolume: 0.3,
                    duration: 4.0
                };
            }
            
            // For mortars, use lower pitch
            if (spawnEvent.weaponCode.startsWith('MR')) {
                return {
                    startFreq: 2750,
                    endFreq: 1250,
                    maxVolume: 0.2,
                    duration: 2.5
                };
            }
        }
        
        // For different projectile styles
        if (spawnEvent.projectileStyle) {
            if (spawnEvent.projectileStyle === 'missile') {
                return {
                    startFreq: 2980,
                    endFreq: 880,
                    maxVolume: 0.08,
                    duration: 3.5
                };
            }
            if (spawnEvent.projectileStyle === 'bomblet') {
                return {
                    startFreq: 3100,
                    endFreq: 1400,
                    maxVolume: 0.05,
                    duration: 1.5
                };
            }
        }
        
        return defaults;
    }

    /**
 * Create altitude-based sound for guided missiles
 * @param {String} projectileId - The unique ID of the projectile
 * @param {Object} projectile - The projectile object
 * @param {Object} spawnEvent - The spawn event data
 * @returns {THREE.PositionalAudio} - The created sound object
 */
createGuidedMissileSound(projectileId, projectile, spawnEvent) {
    // If this projectile already has sound, clean it up first
    if (this.activeAudioSources.has(projectileId)) {
        this.stopProjectileSound(projectileId);
    }
    
    // Create a positional audio source
    const sound = new THREE.PositionalAudio(this.listener);
    
    // Create audio nodes
    const engineOsc = this.audioContext.createOscillator();
    engineOsc.type = 'sawtooth'; // More harsh/mechanical sound for engines
    
    const pulseOsc = this.audioContext.createOscillator();
    pulseOsc.type = 'sine'; // Square wave for pulsing effect
    pulseOsc.frequency.value = 6; // Faster pulse rate for guided missiles
    
    const pulseGain = this.audioContext.createGain();
    pulseGain.gain.value = 4;
    
    const mainGain = this.audioContext.createGain();
    mainGain.gain.value = 0.35; // Lower initial volume
    
    // Create dual filters for more complex sound
    const filter1 = this.audioContext.createBiquadFilter();
    filter1.type = 'lowpass';
    filter1.Q.value = 3.0;
    filter1.frequency.value = 2000;
    
    const filter2 = this.audioContext.createBiquadFilter();
    filter2.type = 'highpass';
    filter2.Q.value = 1.0;
    filter2.frequency.value = 300;
    
    // Create and connect noise generator for added texture
    const noiseNode = this.createNoiseGenerator();
    const noiseGain = this.audioContext.createGain();
    noiseGain.gain.value = 0.6;
    
    // Connect everything
    pulseOsc.connect(pulseGain);
    pulseGain.connect(engineOsc.frequency);
    
    engineOsc.connect(filter1);
    filter1.connect(filter2);
    
    noiseNode.connect(noiseGain);
    noiseGain.connect(filter1);
    
    filter2.connect(mainGain);
    // Connect to PositionalAudio by using its "gain" parameter
    mainGain.connect(sound.gain);
    
    // Add the audio source to the projectile
    if (projectile.mesh) {
        projectile.mesh.add(sound);
    }
    
    // Base frequency settings - we'll adjust these with Y position
    const baseFreq = 1050;
    const minFreq = 1050;
    const maxFreq = 4000;
    
    // Get initial Y position
    const initialY = projectile.position ? projectile.position.y : 
                    (projectile.mesh ? projectile.mesh.position.y : 100);
    
    // Store terrain height for relative altitude calculation
    const terrainHeight = this.getTerrainHeightAt(projectile);
    
    // Start audio nodes
    const startTime = this.audioContext.currentTime;
    
    // Program volume envelope with quick fade-in
    mainGain.gain.setValueAtTime(0.01, startTime);
    mainGain.gain.linearRampToValueAtTime(0.35, startTime + 0.2);
    
    engineOsc.start(startTime);
    pulseOsc.start(startTime);
    noiseNode.start(startTime);
    
    // Initialize frequency
    engineOsc.frequency.value = baseFreq;
    
    // Store all audio nodes for later updates and cleanup
    this.activeAudioSources.set(projectileId, {
        sound,
        engineOsc,
        pulseOsc,
        filter1,
        filter2,
        noiseNode,
        mainGain,
        startTime,
        baseFreq,
        minFreq,
        maxFreq,
        initialY,
        terrainHeight,
        isGuidedMissile: true
    });
    
    return sound;
}

/**
 * Updates guided missile sound based on Y position
 * @param {String} projectileId - The projectile ID
 * @param {Object} projectile - The projectile object
 */
updateGuidedMissileSound(projectileId, projectile) {
    if (!this.activeAudioSources.has(projectileId)) return;
    
    const audioData = this.activeAudioSources.get(projectileId);
    const now = this.audioContext.currentTime;
    
    // Get current Y position
    const currentY = projectile.position ? projectile.position.y : 
                     (projectile.mesh ? projectile.mesh.position.y : 100);
    
    // Calculate relative altitude (height above terrain)
    const terrainHeight = audioData.terrainHeight || 0;
    const relativeAltitude = Math.max(0, currentY - terrainHeight);
    
    // Map altitude to frequency range
    // Higher altitude = higher frequency
    const maxAltitude = 500; // Maximum altitude to consider for scaling
    const altitudeRatio = Math.min(relativeAltitude / maxAltitude, 1.0);
    
    // Calculate frequency based on altitude
    let targetFreq = audioData.minFreq + 
        (audioData.maxFreq - audioData.minFreq) * altitudeRatio;
    
    // Add some variation to avoid monotonous sound
    const variationAmount = 30; // Hz variation
    const variation = Math.sin(now * 3) * variationAmount;
    targetFreq += variation;
    
    // Update oscillator frequency with a smooth transition
    audioData.engineOsc.frequency.setTargetAtTime(
        targetFreq, 
        now, 
        0.1 // Time constant for smooth transition
    );
    
    // Update filter frequency for tonal changes
    audioData.filter1.frequency.setTargetAtTime(
        1500 + 1000 * altitudeRatio,
        now,
        0.2
    );
    
    // Adjust volume based on relative altitude (quieter at very high altitudes)
    if (relativeAltitude > 300) {
        const volumeReduction = Math.min((relativeAltitude - 300) / 200, 0.5);
        audioData.mainGain.gain.setTargetAtTime(
            0.35 * (1 - volumeReduction),
            now,
            0.3
        );
    } else {
        audioData.mainGain.gain.setTargetAtTime(0.35, now, 0.3);
    }
}

/**
 * Get approximate terrain height at projectile position
 * @param {Object} projectile - The projectile object
 * @returns {number} - Estimated terrain height
 */
getTerrainHeightAt(projectile) {
    // Use terrain renderer if available
    if (this.game.terrainRenderer && 
        typeof this.game.terrainRenderer.getHeightAt === 'function') {
        
        const pos = projectile.position || 
                   (projectile.mesh ? projectile.mesh.position : new THREE.Vector3());
        
        return this.game.terrainRenderer.getHeightAt(pos.x, pos.z) || 0;
    }
    
    // Fallback to 0 if no terrain data available
    return 0;
}
    
/**
 * Update projectile sound based on progress or position
 * @param {String} projectileId - The unique ID of the projectile
 * @param {number} progress - The progress value (0-1) along the trajectory
 * @param {Object} projectile - The projectile object (optional)
 * @param {number} currentTime - The current simulation time (optional)
 */
updateProjectileSound(projectileId, progress, projectile, currentTime) {
    if (!this.activeAudioSources.has(projectileId)) return;
    
    const audioData = this.activeAudioSources.get(projectileId);
    
    // For guided missiles, use Y-based sound updates instead
    if (audioData.isGuidedMissile && projectile) {
        this.updateGuidedMissileSound(projectileId, projectile);
        return;
    }
    
    // Regular projectile sound update logic (unchanged)
    // Avoid redundant updates for small changes
    if (Math.abs(progress - audioData.lastProgress) < 0.01) return;
    
    // Clamp progress between 0 and 1
    progress = Math.max(0, Math.min(1, progress));
    audioData.lastProgress = progress;
    
    const now = this.audioContext.currentTime;
    
    // Update frequency based on progress
    const currentFreq = audioData.startFreq - 
        (audioData.startFreq - audioData.endFreq) * progress;
    
    audioData.whistleOsc.frequency.setValueAtTime(currentFreq, now);
    audioData.filter.frequency.setValueAtTime(currentFreq, now);
    
    // Fade out sound as we approach the end of the trajectory
    if (progress > 0.85) {
        const fadeOutProgress = (progress - 0.85) / 0.15; // 0 to 1 for last 15% of trajectory
        const fadeVolume = 1 - fadeOutProgress;
        audioData.mainGain.gain.setValueAtTime(
            fadeVolume * 0.25, // Scale to max volume
            now
        );
    }
}

    /**
     * Handle projectile impact sound
     * @param {String} projectileId - The unique ID of the projectile
     * @param {Object} impactEvent - The impact event data
     */
    handleProjectileImpact(projectileId, impactEvent) {
        // Stop the flying sound
        this.stopProjectileSound(projectileId);
        
        // Create an impact sound
        this.createImpactSound(impactEvent);
    }
    
    /**
     * Create an impact/explosion sound with improved handling for multiple explosions
     * @param {Object} impactEvent - Impact event data
     */
    createImpactSound(impactEvent) {
        // Create unique ID for this explosion
        const explosionId = 'explosion_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        
        // Create positional audio for the impact
        const sound = new THREE.PositionalAudio(this.listener);
        
        // Create a temporary object at the impact location
        const soundObject = new THREE.Object3D();
        soundObject.position.set(
            impactEvent.position.x,
            impactEvent.position.y,
            impactEvent.position.z
        );
        soundObject.add(sound);
        this.game.scene.add(soundObject);
        
        // Calculate distance to listener for prioritization
        const distance = this.getDistanceToListener(impactEvent.position);
        
        // Determine explosion size/type
        const explosionSize = impactEvent.explosionSize || 1;
        
        // Calculate priority value for this explosion (closer and bigger = higher priority)
        const priority = (explosionSize * 10) / (distance + 1);
        
        // Check how many explosions are currently active
        const activeCount = this.activeExplosions.size;
        
        // If too many explosions, check if we should play this one or not
        if (activeCount >= this.maxSimultaneousExplosions) {
            // Only play this explosion if it has higher priority than at least one active explosion
            let lowestPriorityId = null;
            let lowestPriority = priority; // Start with current explosion's priority
            
            // Find the lowest priority active explosion
            for (const [id, data] of this.activeExplosions.entries()) {
                if (data.priority < lowestPriority) {
                    lowestPriority = data.priority;
                    lowestPriorityId = id;
                }
            }
            
            // If this explosion is lower priority than all active ones, significantly reduce its volume
            if (lowestPriorityId === null) {
                // Play at reduced volume
                const volumeReduction = 0.2; // Play at 20% volume
                return this.createReducedVolumeExplosion(explosionId, soundObject, explosionSize, distance, priority, volumeReduction);
            } else {
                // Reduce volume of the lowest priority explosion
                this.reduceExplosionVolume(lowestPriorityId, 0.3);
            }
        }
        
        // Create a gain node for this explosion
        const masterGain = this.audioContext.createGain();
        const explosionBus = this.audioContext.createGain();
        
        // Create oscillator for the boom with slight random variation
        const lowOsc = this.audioContext.createOscillator();
        lowOsc.type = 'sine';
        
        // Add randomness to frequency to avoid identical explosion sounds
        const frequencyVariation = Math.random() * 10 - 5; // -5 to +5 Hz
        lowOsc.frequency.value = 20 + (explosionSize * 20) + frequencyVariation;
        
        // Create noise for the explosion
        const noise = this.createNoiseGenerator();
        const noiseFilter = this.audioContext.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        
        // Add randomness to filter frequency
        const filterVariation = Math.random() * 100 - 50; // -50 to +50 Hz
        noiseFilter.frequency.value = 800 + filterVariation;
        
        // Envelope for the explosion
        const envelope = this.audioContext.createGain();
        envelope.gain.value = 0;
        
        // Connect nodes
        lowOsc.connect(envelope);
        noise.connect(noiseFilter);
        noiseFilter.connect(envelope);
        
        // Connect to master gain for this specific explosion
        envelope.connect(explosionBus);
        explosionBus.connect(masterGain);
        
        // Connect to positional audio and to the master explosion bus
        masterGain.connect(sound.gain);
        
        // Also connect to the explosion master bus for global limiting
        explosionBus.connect(this.explosionMasterBus);
        
        // Start sound
        const startTime = this.audioContext.currentTime;
        
        // Add a slight random delay (1-20ms) to prevent perfect synchronization
        const randomDelay = Math.random() * 0.02;
        
        // Program envelope with slight variations for each explosion
        const attackVariation = Math.random() * 0.01;
        const decayVariation = Math.random() * 0.1;
        const sustainVariation = Math.random() * 0.1;
        const releaseVariation = Math.random() * 0.2;
        
        const attackTime = 0.02 + attackVariation;
        const decayTime = 0.2 + decayVariation;
        const sustainTime = (0.3 * explosionSize) + sustainVariation;
        const releaseTime = (1.0 * explosionSize) + releaseVariation;
        
        // Calculate total duration
        const totalDuration = attackTime + decayTime + sustainTime + releaseTime;
        
        // Attack
        envelope.gain.setValueAtTime(0, startTime + randomDelay);
        envelope.gain.linearRampToValueAtTime(0.8, startTime + randomDelay + attackTime);
        
        // Decay to sustain
        envelope.gain.linearRampToValueAtTime(0.5, startTime + randomDelay + attackTime + decayTime);
        
        // Sustain
        envelope.gain.linearRampToValueAtTime(0.3, startTime + randomDelay + attackTime + decayTime + sustainTime);
        
        // Release
        envelope.gain.linearRampToValueAtTime(0, startTime + randomDelay + attackTime + decayTime + sustainTime + releaseTime);
        
        // Start oscillators
        lowOsc.start(startTime + randomDelay);
        noise.start(startTime + randomDelay);
        
        // Store explosion data for management
        this.activeExplosions.set(explosionId, {
            soundObject,
            lowOsc,
            noise,
            envelope,
            masterGain,
            explosionBus,
            priority,
            distance,
            explosionSize,
            startTime: startTime + randomDelay,
            duration: totalDuration
        });
        
        // Schedule cleanup
        setTimeout(() => {
            this.cleanupExplosion(explosionId);
        }, (totalDuration * 1000) + 100);
        
        return sound;
    }
    
    /**
     * Create a reduced volume explosion for distant/less important impacts
     */
    createReducedVolumeExplosion(explosionId, soundObject, explosionSize, distance, priority, volumeReduction) {
        // Similar to createImpactSound but with reduced volume and complexity
        const sound = soundObject.children[0]; // Get the positional audio object
        
        // Simplified audio graph for less important explosions
        const masterGain = this.audioContext.createGain();
        const explosionBus = this.audioContext.createGain();
        explosionBus.gain.value = volumeReduction; // Reduced volume
        
        // Simpler explosion sound (just noise, no oscillator)
        const noise = this.createNoiseGenerator();
        const noiseFilter = this.audioContext.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 600;
        
        const envelope = this.audioContext.createGain();
        envelope.gain.value = 0;
        
        // Connect nodes
        noise.connect(noiseFilter);
        noiseFilter.connect(envelope);
        envelope.connect(explosionBus);
        explosionBus.connect(masterGain);
        masterGain.connect(sound.gain);
        
        // Don't connect to master bus to avoid competing with more important sounds
        
        // Start sound
        const startTime = this.audioContext.currentTime;
        const randomDelay = Math.random() * 0.02;
        
        // Shorter envelope for distant explosions
        const attackTime = 0.01;
        const decayTime = 0.1;
        const sustainTime = 0.1 * explosionSize;
        const releaseTime = 0.3 * explosionSize;
        
        // Calculate total duration
        const totalDuration = attackTime + decayTime + sustainTime + releaseTime;
        
        // Program envelope
        envelope.gain.setValueAtTime(0, startTime + randomDelay);
        envelope.gain.linearRampToValueAtTime(0.5, startTime + randomDelay + attackTime);
        envelope.gain.linearRampToValueAtTime(0.2, startTime + randomDelay + attackTime + decayTime);
        envelope.gain.linearRampToValueAtTime(0, startTime + randomDelay + attackTime + decayTime + sustainTime + releaseTime);
        
        // Start oscillators
        noise.start(startTime + randomDelay);
        
        // Store explosion data for management
        this.activeExplosions.set(explosionId, {
            soundObject,
            noise,
            envelope,
            masterGain,
            explosionBus,
            priority, 
            distance,
            explosionSize,
            startTime: startTime + randomDelay,
            duration: totalDuration,
            isReduced: true
        });
        
        // Schedule cleanup
        setTimeout(() => {
            this.cleanupExplosion(explosionId);
        }, (totalDuration * 1000) + 100);
        
        return sound;
    }
    
    /**
     * Reduce the volume of an already playing explosion
     */
    reduceExplosionVolume(explosionId, volumeFactor) {
        if (!this.activeExplosions.has(explosionId)) return;
        
        const explosion = this.activeExplosions.get(explosionId);
        const now = this.audioContext.currentTime;
        
        // Quickly reduce volume
        explosion.explosionBus.gain.cancelScheduledValues(now);
        explosion.explosionBus.gain.linearRampToValueAtTime(volumeFactor, now + 0.05);
        
        // Update priority to reflect the reduction
        explosion.priority *= volumeFactor;
    }
    
    /**
     * Get distance from impact to listener (camera)
     */
    getDistanceToListener(position) {
        if (!this.game.cameraManager || !this.game.cameraManager.camera) return 1000;
        
        const camera = this.game.cameraManager.camera;
        const cameraPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraPosition);
        
        return cameraPosition.distanceTo(new THREE.Vector3(
            position.x, 
            position.y, 
            position.z
        ));
    }
    
    /**
     * Clean up resources for an explosion
     */
    cleanupExplosion(explosionId) {
        if (!this.activeExplosions.has(explosionId)) return;
        
        const explosion = this.activeExplosions.get(explosionId);
        
        // Stop all audio sources
        try {
            if (explosion.lowOsc) explosion.lowOsc.stop();
            if (explosion.noise) explosion.noise.stop();
        } catch (e) {
            // Ignore errors if already stopped
        }
        
        // Remove the sound object from the scene
        if (explosion.soundObject) {
            this.game.scene.remove(explosion.soundObject);
        }
        
        // Remove from active explosions map
        this.activeExplosions.delete(explosionId);
    }
    
    /**
     * Stop sound for a projectile
     * @param {String} projectileId - The unique ID of the projectile
     */
    stopProjectileSound(projectileId) {
        if (!this.activeAudioSources.has(projectileId)) return;
        
        const audioData = this.activeAudioSources.get(projectileId);
        const now = this.audioContext.currentTime;
        
        // Quick fade out to avoid clicks
        audioData.mainGain.gain.cancelScheduledValues(now);
        audioData.mainGain.gain.linearRampToValueAtTime(0, now + 0.05);
        
        // Schedule stopping the oscillators
        setTimeout(() => {
            try {
                audioData.whistleOsc.stop();
                audioData.modOsc.stop();
                audioData.noiseNode.stop();
            } catch (e) {
                // Ignore errors if already stopped
            }
        }, 60);
        
        this.activeAudioSources.delete(projectileId);
    }
    
    /**
     * Clean up all audio resources
     */
    dispose() {
        // Stop all active audio sources
        this.activeAudioSources.forEach((audioData, projectileId) => {
            this.stopProjectileSound(projectileId);
        });
        
        // Clean up all active explosions
        this.activeExplosions.forEach((explosion, explosionId) => {
            this.cleanupExplosion(explosionId);
        });
        
        this.activeAudioSources.clear();
        this.activeExplosions.clear();
        
        // Remove listener from camera
        if (this.game.cameraManager && this.game.cameraManager.camera) {
            this.game.cameraManager.camera.remove(this.listener);
        }
        
        this.listener = null;
    }
}