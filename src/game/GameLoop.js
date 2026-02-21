export class GameLoop {
  constructor(updateCallback, renderCallback) {
    this.updateCallback = updateCallback;
    this.renderCallback = renderCallback;
    this.isRunning = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.fixedTimeStep = 1 / 60; // 60 FPS
    this.maxFrameTime = 0.25; // Max 250ms to prevent spiral of death
    this.animationFrameId = null;
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now() / 1000;
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  loop = () => {
    if (!this.isRunning) return;

    const currentTime = performance.now() / 1000;
    let deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Prevent spiral of death
    if (deltaTime > this.maxFrameTime) {
      deltaTime = this.maxFrameTime;
    }

    this.accumulator += deltaTime;

    // Fixed time step updates
    while (this.accumulator >= this.fixedTimeStep) {
      if (this.updateCallback) {
        this.updateCallback(this.fixedTimeStep);
      }
      this.accumulator -= this.fixedTimeStep;
    }

    // Render with interpolation factor
    const alpha = this.accumulator / this.fixedTimeStep;
    if (this.renderCallback) {
      this.renderCallback(alpha);
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  setUpdateCallback(callback) {
    this.updateCallback = callback;
  }

  setRenderCallback(callback) {
    this.renderCallback = callback;
  }
}
