"use client";

import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { AUDIO, MEMORIES_BASE_URL, RESIDENCY_TICK_MS } from "@/config/explorer";
import { resolveAssetUrl } from "@/lib/manifest/url";
import { decideLod } from "@/lib/lod/decide";
import { selectAudioRecords } from "@/lib/audio/residency";
import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";

// Spatial audio: each memory's voice note plays from its location, getting louder as
// the camera approaches (the Web Audio panner's linear distance model — mirrored by
// the unit-tested linearAudioGain). Residency reuses decideLod so only nearby notes
// are live. This is the Web Audio seam (manual smoke test); the pure bits live in
// lib/audio/residency.ts. Audio only plays once `enabled` (a user gesture resumed the
// AudioContext — browsers block autoplay).
export default function MemoryAudio({
  records,
  enabled,
}: {
  records: MemoryRecord[];
  enabled: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  const recordsRef = useRef(records);
  recordsRef.current = records;

  const listenerRef = useRef<THREE.AudioListener | null>(null);
  const loaderRef = useRef<THREE.AudioLoader | null>(null);
  const sounds = useRef<Map<string, THREE.PositionalAudio>>(new Map());
  const sinceTick = useRef(0);

  // Attach the listener to the camera once; tear everything down on unmount.
  useEffect(() => {
    const listener = new THREE.AudioListener();
    camera.add(listener);
    listenerRef.current = listener;
    loaderRef.current = new THREE.AudioLoader();

    const live = sounds.current;
    return () => {
      for (const [, snd] of live) {
        if (snd.isPlaying) snd.stop();
        snd.removeFromParent();
      }
      live.clear();
      camera.remove(listener);
      listenerRef.current = null;
    };
  }, [camera]);

  // Resume the AudioContext when sound is enabled (the unlocking gesture happened
  // in the DOM button; this picks it up).
  useEffect(() => {
    if (enabled) void listenerRef.current?.context.resume();
  }, [enabled]);

  useFrame((_, delta) => {
    const listener = listenerRef.current;
    const loader = loaderRef.current;
    if (!enabled || !listener || !loader) return;

    sinceTick.current += delta * 1000;
    if (sinceTick.current < RESIDENCY_TICK_MS) return;
    sinceTick.current = 0;

    const audioRecords = selectAudioRecords(recordsRef.current);
    const camPos: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
    const resident = new Set(sounds.current.keys());
    const { toLoad, toUnload } = decideLod(audioRecords, camPos, resident, {
      loadRadius: AUDIO.loadRadius,
      disposeRadius: AUDIO.disposeRadius,
      maxConcurrentLoads: AUDIO.maxConcurrent,
    });

    // Keep resident sources at their (possibly edited) memory position.
    for (const [id, snd] of sounds.current) {
      const r = audioRecords.find((x) => x.id === id);
      if (r) snd.position.set(...(r.transform.position as Vec3));
    }

    for (const id of toLoad) {
      const r = audioRecords.find((x) => x.id === id);
      if (!r || !r.audio_url || sounds.current.has(id)) continue;
      const snd = new THREE.PositionalAudio(listener);
      snd.setRefDistance(AUDIO.refDistance);
      snd.setMaxDistance(AUDIO.maxDistance);
      snd.setRolloffFactor(AUDIO.rolloffFactor);
      snd.setDistanceModel("linear");
      snd.setLoop(true);
      snd.position.set(...(r.transform.position as Vec3));
      scene.add(snd);
      sounds.current.set(id, snd);
      loader.load(
        resolveAssetUrl(MEMORIES_BASE_URL, r.audio_url),
        (buffer) => {
          // May have been unloaded while decoding.
          if (sounds.current.get(id) !== snd) return;
          snd.setBuffer(buffer);
          if (enabled) snd.play();
        },
        undefined,
        (err) => {
          console.error("[explorer] audio load failed", id, err);
          if (sounds.current.get(id) === snd) {
            snd.removeFromParent();
            sounds.current.delete(id);
          }
        },
      );
    }

    for (const id of toUnload) {
      const snd = sounds.current.get(id);
      if (!snd) continue;
      if (snd.isPlaying) snd.stop();
      snd.removeFromParent();
      sounds.current.delete(id);
    }
  });

  return null;
}
