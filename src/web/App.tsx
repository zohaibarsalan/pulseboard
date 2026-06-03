import { useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import { Sidebar } from "./components/Sidebar.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { CommandPaletteContext } from "./lib/useCommandPalette.js";
import { WebhooksPage } from "./pages/Webhooks.js";
import { AnalyticsPage } from "./pages/Analytics.js";
import { SettingsPage } from "./pages/Settings.js";
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
            <Route path="/" component={WebhooksPage} />
            <Route path="/analytics" component={AnalyticsPage} />
            <Route path="/settings" component={SettingsPage} />
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
