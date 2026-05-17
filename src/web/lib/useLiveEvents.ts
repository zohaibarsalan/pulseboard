import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type LiveStatus = "connecting" | "live" | "error";

export function useLiveEvents(instanceId: string, queueName: string): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    const url = `/api/instances/${instanceId}/queues/${encodeURIComponent(queueName)}/live`;
    const source = new EventSource(url);
    let pending: ReturnType<typeof setTimeout> | null = null;

    const invalidate = (): void => {
      // Debounce — under heavy burst this would otherwise fire dozens of times
      // per second. 400ms gives us "live" feel without thrashing the API.
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void queryClient.invalidateQueries({ queryKey: ["events", instanceId, queueName] });
        void queryClient.invalidateQueries({ queryKey: ["queues", instanceId] });
        void queryClient.invalidateQueries({ queryKey: ["activity", instanceId, queueName] });
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
  }, [instanceId, queueName, queryClient]);

  return status;
}
