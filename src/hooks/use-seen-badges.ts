import { useCallback, useEffect, useState } from "react";

const KEY = "seen-tab-badges";

type SeenMap = Record<string, number>;

function read(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as SeenMap;
  } catch {
    return {};
  }
}

/**
 * Remembers the badge count a tab had the last time the landlord actually
 * opened it, so a badge clears on visit and only returns when something new
 * arrives.
 */
export function useSeenBadges() {
  const [seen, setSeen] = useState<SeenMap>({});

  useEffect(() => setSeen(read()), []);

  const markSeen = useCallback((url: string, count: number) => {
    setSeen((prev) => {
      if (prev[url] === count) return prev;
      const next = { ...prev, [url]: count };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — badges just won't persist */
      }
      return next;
    });
  }, []);

  /** Only badge what the landlord has not acknowledged yet. */
  const unseen = useCallback(
    (url: string, count: number) => Math.max(0, count - (seen[url] ?? 0)),
    [seen],
  );

  return { unseen, markSeen };
}
