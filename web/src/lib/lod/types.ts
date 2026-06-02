export interface LodConfig {
  /** Load a memory's splat once the camera is within this distance. */
  loadRadius: number;
  /** Dispose it once the camera is farther than this (> loadRadius: hysteresis). */
  disposeRadius: number;
  /** Most splats to begin loading in one decision. */
  maxConcurrentLoads: number;
}

export interface LodDecision {
  /** Memory ids to start loading, nearest first. */
  toLoad: string[];
  /** Memory ids to dispose. */
  toUnload: string[];
}
