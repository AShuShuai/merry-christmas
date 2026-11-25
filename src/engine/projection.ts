export interface ProjectionResult {
  x: number;
  y: number;
  scale: number;
  z: number;
}

export const CAM_D = 34;
export const CAM_Y = -1;

export function createProjector(
  yawAngle: number,
  pitchAngle: number,
  width: number,
  height: number,
  focal: number
): (x: number, y: number, z: number) => ProjectionResult {
  const cy = Math.cos(yawAngle);
  const sy = Math.sin(yawAngle);
  const cp = Math.cos(pitchAngle);
  const sp = Math.sin(pitchAngle);

  return (x, y, z) => {
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    const y1 = y * cp - z1 * sp;
    const zr = y * sp + z1 * cp;
    const dist = Math.max(0.1, CAM_D - zr);
    const scale = focal / dist;

    return {
      x: width / 2 + x1 * scale,
      y: height / 2 - (y1 - CAM_Y) * scale,
      scale,
      z: zr,
    };
  };
}

/**
 * Projects a 3D coordinate (x, y, z) into 2D screen coordinates with perspective.
 * Supports yaw (angle around Y axis) and pitch (tilt around X axis).
 */
export function project(
  x: number,
  y: number,
  z: number,
  yawAngle: number,
  pitchAngle: number,
  width: number,
  height: number,
  focal: number
): ProjectionResult {
  return createProjector(yawAngle, pitchAngle, width, height, focal)(x, y, z);
}
