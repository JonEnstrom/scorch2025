// projectileWorker.js
self.addEventListener('message', function(e) {
    const { jobId, trajectory, currentTime } = e.data;
    let result = { position: null };
  
    if (trajectory.length < 2) {
      result.position = trajectory[0].position;
    } else {
      // Check for an impact point – if one exists and we've passed its time, snap to it.
      const impactPoint = trajectory.find(p => p.isImpact);
      if (impactPoint && currentTime >= impactPoint.time) {
        result.position = impactPoint.position;
      } else {
        let index1 = 0;
        while (index1 < trajectory.length - 1 && trajectory[index1 + 1].time <= currentTime) {
          index1++;
        }
        if (index1 >= trajectory.length - 1) {
          result.position = trajectory[trajectory.length - 1].position;
        } else {
          const index2 = index1 + 1;
          const point1 = trajectory[index1];
          const point2 = trajectory[index2];
          const timeSpan = point2.time - point1.time;
          const t = timeSpan > 0 ? (currentTime - point1.time) / timeSpan : 0;
          let newPosition;
          if (trajectory.length >= 4 && index1 >= 1 && index2 < trajectory.length - 1) {
            const point0 = trajectory[index1 - 1];
            const point3 = trajectory[index2 + 1];
            // Cubic interpolation for each component
            newPosition = {
              x: cubicInterpolate(point0.position.x, point1.position.x, point2.position.x, point3.position.x, t),
              y: cubicInterpolate(point0.position.y, point1.position.y, point2.position.y, point3.position.y, t),
              z: cubicInterpolate(point0.position.z, point1.position.z, point2.position.z, point3.position.z, t)
            };
          } else {
            // Fall back to linear interpolation
            newPosition = {
              x: point1.position.x + (point2.position.x - point1.position.x) * t,
              y: point1.position.y + (point2.position.y - point1.position.y) * t,
              z: point1.position.z + (point2.position.z - point1.position.z) * t
            };
          }
          result.position = newPosition;
        }
      }
    }
    
    self.postMessage({ jobId, result });
  });
  
  // Cubic interpolation function (Catmull-Rom)
  function cubicInterpolate(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c = -0.5 * p0 + 0.5 * p2;
    const d = p1;
    return a * t3 + b * t2 + c * t + d;
  }
  