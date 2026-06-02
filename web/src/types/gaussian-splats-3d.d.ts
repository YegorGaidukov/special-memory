// Hand-written type declarations for @mkkellogg/gaussian-splats-3d, which ships
// no TypeScript types. Mirrors the JSDoc in
// node_modules/@mkkellogg/gaussian-splats-3d/build/gaussian-splats-3d.module.js
// (verified against installed version 0.4.7). Only the surface S2 uses is typed.
declare module "@mkkellogg/gaussian-splats-3d" {
  import * as THREE from "three";

  /** Per-scene options for addSplatScene / entries of addSplatScenes. */
  export interface SplatSceneOptions {
    path?: string;
    /** Ignore splats with alpha below this (0–255), default 1. */
    splatAlphaRemovalThreshold?: number;
    /** Show the built-in loading spinner, default true. */
    showLoadingUI?: boolean;
    /** Position offset, default [0,0,0]. */
    position?: [number, number, number];
    /** Orientation as a quaternion [x,y,z,w], default [0,0,0,1]. */
    rotation?: [number, number, number, number];
    /** Scale, default [1,1,1]. */
    scale?: [number, number, number];
    /** Render splats while still downloading (single-scene only). */
    progressiveLoad?: boolean;
    /** SceneFormat override; inferred from the path extension if omitted. */
    format?: number;
    onProgress?: (
      percentComplete: number,
      percentCompleteLabel: string,
      loaderStatus: number,
    ) => void;
  }

  export interface ViewerOptions {
    /** Sort splats in a worker via SharedArrayBuffer (default true). Requires
     * cross-origin isolation headers; set false to skip them at a perf cost. */
    sharedMemoryForWorkers?: boolean;
    [key: string]: unknown;
  }

  export class Viewer {
    constructor(options?: ViewerOptions);
    /** True while an add or remove is in progress; a new add/remove throws. */
    isLoadingOrUnloading(): boolean;
  }

  /** A Viewer wrapped as a THREE.Group so it drops into an existing scene. */
  export class DropInViewer extends THREE.Group {
    constructor(options?: ViewerOptions);
    /** The wrapped Viewer (used to read isLoadingOrUnloading). */
    viewer: Viewer;
    addSplatScene(path: string, options?: SplatSceneOptions): Promise<void>;
    addSplatScenes(
      sceneOptions: SplatSceneOptions[],
      showLoadingUI?: boolean,
    ): Promise<void>;
    removeSplatScene(index: number, showLoadingUI?: boolean): Promise<void>;
    removeSplatScenes(indexes: number[], showLoadingUI?: boolean): Promise<void>;
    getSceneCount(): number;
    getSplatScene(index: number): unknown;
    dispose(): Promise<void>;
  }

  export const SceneFormat: {
    Splat: number;
    KSplat: number;
    Ply: number;
    Spz: number;
  };
}
