// client/Helicopter.js

import * as THREE from 'three';

export class Helicopter {
  constructor(scene, loader, terrainRenderer) {
    this.scene = scene;
    this.loader = loader;
    this.terrainRenderer = terrainRenderer;
    this.bodyPath = './models/helicopter_body.glb';
    this.bladesPath = './models/helicopter_blades.glb';

    // Group to hold the helicopter models.
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Planned path from the server, with relative times (in seconds).
    this.plannedPath = [];
    // The local (performance.now) time at which the plan starts.
    this.planStartTime = performance.now();
    // Total duration of the current plan.
    this.planDuration = 0;

    this.lastKnownState = {
        position: new THREE.Vector3(),
        rotationY: 0,
        bankAngle: 0,
        speed: 0,
        timestamp: 0
      };
      this.transitionDuration = 0.2; // Duration in seconds for smooth transitions
      this.isTransitioning = false;
      this.transitionStartTime = 0;
      this.transitionEndState = null;

    // Models
    this.body = null;
    this.blades = null;

    this.autonomous = false;

    this.init();
  }

  async init() {
    try {
      const [bodyModel, bladesModel] = await Promise.all([
        this.loadModel(this.bodyPath),
        this.loadModel(this.bladesPath)
      ]);
      this.body = bodyModel.scene;
      this.blades = bladesModel.scene;

      // Configure shadows.
      this.body.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.blades.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.group.add(this.body);
      this.group.add(this.blades);
      this.setScale(5);
    } catch (error) {
      console.error('Error loading helicopter models:', error);
    }
  }

  loadModel(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        gltf => resolve(gltf),
        undefined,
        error => reject(error)
      );
    });
  }

  /**
   * Sets a new planned path.
   * @param {Array} plannedPath - Array of states with relative times (0 … N seconds)
   * @param {number} serverPlanStart - Server timestamp (ms) indicating when time=0 begins.
   * @param {number} [updateIndex] - (Optional) The update sequence index.
   */
  setPlannedPath(plannedPath, serverPlanStart, updateIndex) {
    // Handle update index check
    if (updateIndex !== undefined) {
      if (this.lastPlanIndex !== undefined && updateIndex <= this.lastPlanIndex) {
        return;
      }
      this.lastPlanIndex = updateIndex;
    }
  
    // Convert server time to local performance time
    const newPlanStartTime = this.convertServerTimeToPerformanceTime(serverPlanStart);
  
    // Get exact current state including actual current position
    const currentTime = performance.now();
    this.lastKnownState = {
      position: this.group.position.clone(), // Use actual current position
      rotationY: this.group.rotation.y,
      bankAngle: -this.group.rotation.z, // Note the negative since we store bank angle positive
      speed: this.getInterpolatedState(currentTime).speed,
      timestamp: currentTime
    };
  
    // Start transition
    this.isTransitioning = true;
    this.transitionStartTime = currentTime;
    
    // Create transition target state from first point of new plan
    this.transitionEndState = plannedPath.length > 0 ? {
      position: new THREE.Vector3(
        plannedPath[0].position.x,
        plannedPath[0].position.y,
        plannedPath[0].position.z
      ),
      rotationY: plannedPath[0].rotationY,
      bankAngle: plannedPath[0].bankAngle,
      speed: plannedPath[0].speed
    } : null;
  
    // Update plan timing
    this.planStartTime = newPlanStartTime;
    
    // Convert plan points
    this.plannedPath = plannedPath.map(pt => ({
      time: pt.time,
      position: new THREE.Vector3(pt.position.x, pt.position.y, pt.position.z),
      rotationY: pt.rotationY,
      bankAngle: pt.bankAngle,
      speed: pt.speed
    }));
  
    this.planDuration = this.plannedPath.length > 0 ? 
      this.plannedPath[this.plannedPath.length - 1].time : 0;
  }
  

  /**
   * Converts a server timestamp (ms) into the local performance.now() domain.
   */
  convertServerTimeToPerformanceTime(serverTimeMs) {
    const currentPerformanceTime = performance.now();
    const currentServerTime = Date.now();
    const diff = serverTimeMs - currentServerTime;
    return currentPerformanceTime + diff;
  }

  /**
   * Returns the current interpolated state from the planned path.
   * @param {number} [currentTime] - The current time (default performance.now()).
   * @returns {object} An object with position (Vector3), rotationY, bankAngle, and speed.
   */
  getInterpolatedState(currentTime = performance.now()) {
    if (!this.plannedPath.length) {
      return {
        position: this.group.position.clone(),
        rotationY: this.group.rotation.y,
        bankAngle: 0,
        speed: 0
      };
    }
    const elapsed = (currentTime - this.planStartTime) / 1000;
    if (elapsed <= 0) {
      const first = this.plannedPath[0];
      return {
        position: first.position.clone(),
        rotationY: first.rotationY,
        bankAngle: first.bankAngle,
        speed: first.speed
      };
    }
    const last = this.plannedPath[this.plannedPath.length - 1];
    if (elapsed >= last.time) {
      return {
        position: last.position.clone(),
        rotationY: last.rotationY,
        bankAngle: last.bankAngle,
        speed: last.speed
      };
    }
    let i = 0;
    while (i < this.plannedPath.length - 1 && this.plannedPath[i + 1].time < elapsed) {
      i++;
    }
    const stateA = this.plannedPath[i];
    const stateB = this.plannedPath[i + 1];
    const range = stateB.time - stateA.time;
    const alpha = (elapsed - stateA.time) / range;
    const position = stateA.position.clone().lerp(stateB.position, alpha);
    const rotationY = THREE.MathUtils.lerp(stateA.rotationY, stateB.rotationY, alpha);
    const bankAngle = THREE.MathUtils.lerp(stateA.bankAngle, stateB.bankAngle, alpha);
    const speed = THREE.MathUtils.lerp(stateA.speed, stateB.speed, alpha);
    return { position, rotationY, bankAngle, speed };
  }

  /**
   * Update called every frame.
   * @param {number} deltaTime - Time (in seconds) since last frame.
   * @param {number} currentTime - Typically performance.now().
   */
  update(deltaTime, currentTime) {
    this.updateFromPlan(currentTime);
    this.updateRotors(deltaTime);
  }

  /**
   * Interpolates position and rotation from the planned path.
   */
  updateFromPlan(currentTime) {
    if (!this.plannedPath.length && !this.isTransitioning) {
      return;
    }
  
    let targetState;
    
    if (this.isTransitioning) {
      // Handle transition period
      const transitionElapsed = (currentTime - this.transitionStartTime) / 1000;
      const transitionAlpha = Math.min(transitionElapsed / this.transitionDuration, 1.0);
      
      if (transitionAlpha >= 1.0) {
        // Transition complete
        this.isTransitioning = false;
        if (this.plannedPath.length === 0) {
          return;
        }
      } else {
        // Interpolate during transition
        const start = this.lastKnownState;
        const end = this.transitionEndState;
        
        // Use smooth step for more natural easing
        // Use a smoother easing function (cubic)
        const smoothAlpha = transitionAlpha * transitionAlpha * transitionAlpha * (transitionAlpha * (transitionAlpha * 6 - 15) + 10);
        
        const pos = start.position.clone().lerp(end.position, smoothAlpha);
        this.group.position.copy(pos);
  
        // Handle rotation interpolation with shortest path
        let deltaY = end.rotationY - start.rotationY;
        if (deltaY > Math.PI) deltaY -= 2 * Math.PI;
        if (deltaY < -Math.PI) deltaY += 2 * Math.PI;
        const rotY = start.rotationY + deltaY * smoothAlpha;
        
        const bankZ = THREE.MathUtils.lerp(start.bankAngle, end.bankAngle, smoothAlpha);
        this.group.rotation.set(0, rotY, -bankZ, 'YXZ');
        return;
      }
    }
  
    // Normal plan following
    const elapsed = (currentTime - this.planStartTime) / 1000;
    
    if (elapsed <= 0) {
      targetState = this.plannedPath[0];
    } else if (elapsed >= this.planDuration) {
      targetState = this.plannedPath[this.plannedPath.length - 1];
      // Store last known good state when plan ends
      this.lastKnownState = {
        position: targetState.position.clone(),
        rotationY: targetState.rotationY,
        bankAngle: targetState.bankAngle,
        speed: targetState.speed,
        timestamp: currentTime
      };
    } else {
      // Find surrounding points and interpolate
      let i = 0;
      while (i < this.plannedPath.length - 1 && this.plannedPath[i + 1].time < elapsed) {
        i++;
      }
      const stateA = this.plannedPath[i];
      const stateB = this.plannedPath[i + 1];
      const range = stateB.time - stateA.time;
      const alpha = (elapsed - stateA.time) / range;
      
      const pos = stateA.position.clone().lerp(stateB.position, alpha);
      this.group.position.copy(pos);
  
      // Interpolate heading with shortest path
      let rotY = stateA.rotationY;
      let deltaY = stateB.rotationY - stateA.rotationY;
      if (deltaY > Math.PI) deltaY -= 2 * Math.PI;
      if (deltaY < -Math.PI) deltaY += 2 * Math.PI;
      rotY += deltaY * alpha;
      
      const bankZ = THREE.MathUtils.lerp(stateA.bankAngle, stateB.bankAngle, alpha);
      this.group.rotation.set(0, rotY, -bankZ, 'YXZ');
    }
  }
  /**
   * Update rotor animation.
   */
  updateRotors(deltaTime) {
    if (!this.blades) return;
    this.blades.rotation.y += 20 * deltaTime;
  }

  setScale(s) {
    this.group.scale.set(s, s, s);
  }

  getPosition() {
    return this.group.position;
  }

  dispose() {
    if (this.body) {
      this.scene.remove(this.body);
      this.body.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    if (this.blades) {
      this.scene.remove(this.blades);
      this.blades.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.scene.remove(this.group);
  }
}
