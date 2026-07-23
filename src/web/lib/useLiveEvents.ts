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

    const invalidateLists = (): void => {
      // Debounce — under burst this would otherwise fire dozens of times/sec.
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
        void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
        void queryClient.invalidateQueries({ queryKey: ["webhook-sources"] });
      }, 400);
    };
    const parseWebhookId = (event: Event): string | null => {
      if (!(event instanceof MessageEvent) || typeof event.data !== "string") return null;
      try {
        const parsed = JSON.parse(event.data) as { id?: unknown };
        return typeof parsed.id === "string" ? parsed.id : null;
      } catch {
        return null;
      }
    };
    const onCreated = (): void => {
      setNewEventCount((count) => count + 1);
      invalidateLists();
    };
    const onUpdated = (event: Event): void => {
      const id = parseWebhookId(event);
      if (id) {
        void queryClient.invalidateQueries({ queryKey: ["webhook", id] });
        void queryClient.invalidateQueries({ queryKey: ["delivery-attempts", id] });
      }
      invalidateLists();
    };

    source.addEventListener("hello", () => setStatus("live"));
    source.addEventListener("webhook-created", onCreated);
    source.addEventListener("webhook-updated", onUpdated);
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
