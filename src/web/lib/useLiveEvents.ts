import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type LiveStatus = "connecting" | "live" | "error";

export function useLiveEvents(): {
  status: LiveStatus;
  newEventCount: number;
  acknowledge: () => void;
} {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [newEventCount, setNewEventCount] = useState(0);

  useEffect(() => {
    const source = new EventSource("/api/live");
    let pending: ReturnType<typeof setTimeout> | null = null;

    const invalidate = (): void => {
      // Debounce — under burst this would otherwise fire dozens of times/sec.
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
        void queryClient.invalidateQueries({ queryKey: ["webhook-sources"] });
        setNewEventCount((count) => count + 1);
      }, 400);
    };

    source.addEventListener("hello", () => setStatus("live"));
    source.addEventListener("message", invalidate);
    source.onerror = () => setStatus("error");

    return () => {
      if (pending) clearTimeout(pending);
      source.close();
      setStatus("connecting");
    };
  }, [queryClient]);

  const acknowledge = useCallback(() => setNewEventCount(0), []);
  return { status, newEventCount, acknowledge };
}
