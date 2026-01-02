// ProjectileWorkerPoolInstance.js
import { ProjectileWorkerPool } from './ProjectileWorkerPool.js';

const workerScriptUrl = new URL('./ProjectileWorker.js', import.meta.url).href;
export const ProjectileWorkerPoolInstance = new ProjectileWorkerPool(workerScriptUrl);
