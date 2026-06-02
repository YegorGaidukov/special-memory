// The renderer addresses splat scenes by a contiguous index that shifts when a
// scene is removed. We track memory ids in scene order so we always remove the
// right index and stay in sync with the viewer after re-indexing.

export function sceneIndexOf(order: readonly string[], id: string): number {
  return order.indexOf(id);
}

export function withSceneAdded(order: readonly string[], id: string): string[] {
  return [...order, id];
}

export function withSceneRemoved(
  order: readonly string[],
  id: string,
): { order: string[]; index: number } {
  const index = order.indexOf(id);
  if (index < 0) return { order: [...order], index: -1 };
  return { order: [...order.slice(0, index), ...order.slice(index + 1)], index };
}
