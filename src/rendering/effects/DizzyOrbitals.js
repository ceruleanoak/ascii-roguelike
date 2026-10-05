// Dizzy orbital particles — three yellow dots circling a dizzy entity's head
// on a wobbling tilted ring. Shared by the player (Frame Pass `dizzy`) and
// enemies (ExploreRenderer.renderEnemy).
export function drawDizzyOrbitals(ctx, cx, cy, timer) {
  const r = 6;
  const wobbleFreq = 2.5;
  const orbitSpeed = 1.0;
  const tilt = Math.sin(timer * wobbleFreq) * (Math.PI / 2);
  const b = r * Math.abs(Math.sin(tilt));
  const phi = timer * orbitSpeed * Math.PI * 2;
  const planeAngle = Math.PI / 4;
  ctx.save();
  ctx.fillStyle = '#ddbb00';
  for (let i = 0; i < 3; i++) {
    const theta = phi + (i * Math.PI * 2 / 3);
    const lx = Math.cos(theta) * r;
    const ly = Math.sin(theta) * b;
    const sx = cx + lx * Math.cos(planeAngle) - ly * Math.sin(planeAngle);
    const sy = cy + lx * Math.sin(planeAngle) + ly * Math.cos(planeAngle);
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
