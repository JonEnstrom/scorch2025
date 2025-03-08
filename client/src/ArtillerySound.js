/**
 * ArtillerySound - A procedural audio generator for artillery shell flyby sounds
 * Designed to work with three.js spatial audio
 */
export class ArtillerySound {
    constructor(audioContext) {
      this.audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      this.isPlaying = false;
      this.duration = 3.0; // Default duration in seconds
      this.startFreq = 850; // Starting frequency in Hz
      this.endFreq = 200;   // Ending frequency in Hz
      this.volumeStart = 0.05;
      this.volumeMax = 0.25;
      this.volumeEnd = 0;
      
      // Create audio nodes
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      
      // For connecting to three.js spatial audio
      this.destination = this.gainNode;
      this.gainNode.connect(this.audioContext.destination);
      
      // Add some noise to make it more realistic
      this.noiseAmount = 0.3;
    }
    
    /**
     * Generate the main whistle sound using frequency modulation
     */
    createWhistle() {
      // Main whistle oscillator
      this.whistleOsc = this.audioContext.createOscillator();
      this.whistleOsc.type = 'sine';
      this.whistleOsc.frequency.value = this.startFreq;
      
      // Modulation oscillator for the whistle
      this.modOsc = this.audioContext.createOscillator();
      this.modOsc.type = 'sine';
      this.modOsc.frequency.value = 8;
      
      this.modGain = this.audioContext.createGain();
      this.modGain.gain.value = 10;
      
      // Bandpass filter to shape the sound
      this.filter = this.audioContext.createBiquadFilter();
      this.filter.type = 'bandpass';
      this.filter.frequency.value = this.startFreq;
      this.filter.Q.value = 4.0;
      
      // Noise generator for added texture
      this.noiseNode = this.createNoiseGenerator();
      this.noiseGain = this.audioContext.createGain();
      this.noiseGain.gain.value = this.noiseAmount;
      
      // Connect everything
      this.modOsc.connect(this.modGain);
      this.modGain.connect(this.whistleOsc.frequency);
      
      this.whistleOsc.connect(this.filter);
      this.filter.connect(this.gainNode);
      
      this.noiseNode.connect(this.noiseGain);
      this.noiseGain.connect(this.filter);
    }
    
    /**
     * Create a noise generator using audio buffer
     */
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
    
    /**
     * Start playing the artillery shell sound
     * @param {Object} options - Optional parameters to override defaults
     */
    play(options = {}) {
      if (this.isPlaying) this.stop();
      
      this.duration = options.duration || this.duration;
      this.startFreq = options.startFreq || this.startFreq;
      this.endFreq = options.endFreq || this.endFreq;
      
      const now = this.audioContext.currentTime;
      
      // Create the audio nodes
      this.createWhistle();
      
      // Schedule parameter changes
      
      // Frequency curve - start high, then descend
      this.whistleOsc.frequency.setValueAtTime(this.startFreq, now);
      this.whistleOsc.frequency.exponentialRampToValueAtTime(this.endFreq, now + this.duration);
      
      // Filter follows the frequency
      this.filter.frequency.setValueAtTime(this.startFreq, now);
      this.filter.frequency.exponentialRampToValueAtTime(this.endFreq, now + this.duration);
      
      // Volume envelope - fade in, sustain, fade out
      this.gainNode.gain.setValueAtTime(this.volumeStart, now);
      this.gainNode.gain.linearRampToValueAtTime(this.volumeMax, now + this.duration * 0.1);
      this.gainNode.gain.linearRampToValueAtTime(this.volumeMax * 0.8, now + this.duration * 0.7);
      this.gainNode.gain.linearRampToValueAtTime(this.volumeEnd, now + this.duration);
      
      // Start the oscillators and noise
      this.whistleOsc.start(now);
      this.modOsc.start(now);
      this.noiseNode.start(now);
      
      // Schedule stopping
      this.whistleOsc.stop(now + this.duration);
      this.modOsc.stop(now + this.duration);
      this.noiseNode.stop(now + this.duration);
      
      this.isPlaying = true;
      this.stopTime = now + this.duration;
      
      // Clean up when done
      setTimeout(() => {
        if (this.isPlaying && this.audioContext.currentTime >= this.stopTime) {
          this.isPlaying = false;
        }
      }, this.duration * 1000);
    }
    
    /**
     * Stop playing the sound
     */
    stop() {
      if (!this.isPlaying) return;
      
      const now = this.audioContext.currentTime;
      
      // Quick fade out to avoid clicks
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
      
      // Stop all sound generators with a small delay to allow fade out
      setTimeout(() => {
        if (this.whistleOsc) {
          this.whistleOsc.stop();
          this.modOsc.stop();
          this.noiseNode.stop();
        }
        this.isPlaying = false;
      }, 50);
    }
    
    /**
     * Connect to a Three.js PositionalAudio object
     * @param {THREE.PositionalAudio} positionalAudio - Three.js positional audio object
     */
    connectToThreeJS(positionalAudio) {
      // Disconnect from default destination
      this.gainNode.disconnect();
      
      // Connect to the Three.js audio input node
      this.gainNode.connect(positionalAudio.getInput());
      
      return this;
    }
    
    /**
     * Update sound parameters based on projectile position
     * @param {Number} progress - Value between 0 and 1 representing flight progress
     */
    update(progress) {
      if (!this.isPlaying) return;
      
      // Clamp progress between 0 and 1
      progress = Math.max(0, Math.min(1, progress));
      
      const now = this.audioContext.currentTime;
      
      // Update frequency in real-time if needed
      const currentFreq = this.startFreq - (this.startFreq - this.endFreq) * progress;
      this.whistleOsc.frequency.setValueAtTime(currentFreq, now);
      this.filter.frequency.setValueAtTime(currentFreq, now);
    }
  }
  
  /**
   * Example usage with Three.js
   */
  function createArtilleryShellSound(scene, position) {
    // Create audio listener (typically attached to camera)
    const listener = new THREE.AudioListener();
    
    // Create a positional audio source
    const sound = new THREE.PositionalAudio(listener);
    
    // Add the audio source to the scene at the projectile's position
    const soundObject = new THREE.Object3D();
    soundObject.position.copy(position);
    soundObject.add(sound);
    scene.add(soundObject);
    
    // Create the artillery sound and connect it to the Three.js spatial audio
    const audioContext = listener.context;
    const artillerySound = new ArtillerySound(audioContext);
    artillerySound.connectToThreeJS(sound);
    
    // Play the sound with custom settings
    artillerySound.play({
      duration: 3.5,
      startFreq: 900,
      endFreq: 180
    });
    
    // Return both the sound generator and Three.js object for later updates
    return {
      soundGenerator: artillerySound,
      soundObject: soundObject
    };
  }
  
  /**
   * Example animation loop update
   */
  function updateProjectileSound(projectile, soundSystem) {
    // Update sound object position to match projectile
    soundSystem.soundObject.position.copy(projectile.position);
    
    // Calculate flight progress (0 to 1) based on projectile lifetime
    const progress = projectile.age / projectile.lifespan;
    
    // Update sound parameters based on flight progress
    soundSystem.soundGenerator.update(progress);
  }