import { useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import { Sidebar } from "./components/Sidebar.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { CommandPaletteContext } from "./lib/useCommandPalette.js";
import { QueuesPage } from "./pages/Queues.js";
import { QueueDetailPage } from "./pages/QueueDetail.js";
import { FailedJobsPage } from "./pages/FailedJobs.js";
import { AnalyticsPage } from "./pages/Analytics.js";
import { PlaceholderPage } from "./pages/Placeholder.js";

export function App(): React.ReactElement {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (cmdK) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen]);

  return (
    <CommandPaletteContext.Provider value={{ open: () => setPaletteOpen(true) }}>
      <div className="flex h-screen w-screen overflow-hidden bg-bg text-fg">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Switch>
            <Route path="/" component={QueuesPage} />
            <Route path="/queue/:name">
              {(params) => <QueueDetailPage queueName={decodeURIComponent(params.name)} />}
            </Route>
            <Route path="/failed" component={FailedJobsPage} />
            <Route path="/flows">
              <PlaceholderPage
                title="Flows"
                description="Interactive workflow graphs — coming in v0.4."
              />
            </Route>
            <Route path="/analytics" component={AnalyticsPage} />
            <Route path="/settings">
              <PlaceholderPage
                title="Settings"
                description="Connection, retention, redaction, theme — coming in v0.1 polish."
              />
            </Route>
            <Route>
              <PlaceholderPage title="Not found" description="That route doesn't exist." />
            </Route>
          </Switch>
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
    </CommandPaletteContext.Provider>
  );
}
