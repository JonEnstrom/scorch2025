// utils/collision.js

/**
 * Checks if a projectile intersects with a helicopter's bounding sphere.
 * @param {Projectile} projectile - The projectile instance.
 * @param {Helicopter} helicopter - The helicopter instance.
 * @returns {boolean} True if collision occurs, else false.
 */
export function checkCollision(projectile, helicopter) {
    const distanceSquared = projectile.position.distanceToSquared(helicopter.position);
    const combinedRadius = (projectile.boundingRadius || 1) + helicopter.boundingRadius;
    return distanceSquared <= combinedRadius * combinedRadius;
  }
  