import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type LiveStatus = "connecting" | "live" | "error";

export function useLiveEvents(): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    const source = new EventSource("/api/live");
    let pending: ReturnType<typeof setTimeout> | null = null;

    const invalidate = (): void => {
      // Debounce — under burst this would otherwise fire dozens of times/sec.
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
        void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
        void queryClient.invalidateQueries({ queryKey: ["webhook-sources"] });
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

  return status;
}
