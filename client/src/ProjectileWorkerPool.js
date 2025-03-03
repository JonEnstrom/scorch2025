// ProjectileWorkerPool.js
class ProjectileWorkerPool {
    constructor(workerScriptUrl, poolSize = (navigator.hardwareConcurrency || 4)) {
      this.poolSize = poolSize;
      this.workers = [];
      this.nextWorkerIndex = 0;
      this.callbacks = new Map(); // Maps jobId to its resolve callback
      this.jobIdCounter = 0;
  
      for (let i = 0; i < poolSize; i++) {
        const worker = new Worker(workerScriptUrl);
        worker.onmessage = (e) => this.handleWorkerMessage(e);
        this.workers.push(worker);
      }
    }
  
    handleWorkerMessage(event) {
      const { jobId, result } = event.data;
      if (this.callbacks.has(jobId)) {
        const callback = this.callbacks.get(jobId);
        callback(result);
        this.callbacks.delete(jobId);
      }
    }
  
    calculateTrajectoryPosition(trajectory, currentTime) {
      return new Promise((resolve, reject) => {
        const jobId = this.jobIdCounter++;
        this.callbacks.set(jobId, resolve);
        // Send the job to a worker (round-robin distribution)
        const worker = this.workers[this.nextWorkerIndex];
        this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.poolSize;
        worker.postMessage({ jobId, trajectory, currentTime });
      });
    }
  
    terminate() {
      for (const worker of this.workers) {
        worker.terminate();
      }
      this.workers = [];
      this.callbacks.clear();
    }
  }
  
  export { ProjectileWorkerPool };
  