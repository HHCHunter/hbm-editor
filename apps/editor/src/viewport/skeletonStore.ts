import type { SkeletonDTO } from '@hbm/protocol';
import { ApiError } from '../api/client';
import { getSkeleton } from '../api/endpoints';

const cache = new Map<string, Promise<SkeletonDTO | null>>();

/**
 * A model's skeleton, fetched once per scene and model; null when it has none or can't be read.
 * A failed read isn't remembered, so the next request tries again.
 */
export function skeletonFor(sceneId: string, root: number): Promise<SkeletonDTO | null> {
  const key = `${sceneId}:${root}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = getSkeleton(sceneId, root).catch((err: unknown) => {
      if (!(err instanceof ApiError && err.status === 404)) cache.delete(key);
      return null;
    });
    cache.set(key, pending);
  }
  return pending;
}

/** Forget other scenes' skeletons. */
export function keepSkeletonsFor(sceneId: string): void {
  for (const key of cache.keys()) if (!key.startsWith(`${sceneId}:`)) cache.delete(key);
}
