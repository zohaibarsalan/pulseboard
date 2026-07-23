import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import { Sidebar } from "./components/Sidebar.js";
import { CommandPaletteContext } from "./lib/useCommandPalette.js";
import { WebhooksPage } from "./pages/Webhooks.js";

const CommandPalette = lazy(async () => {
  const module = await import("./components/CommandPalette.js");
  return { default: module.CommandPalette };
});
const ComparePage = lazy(async () => {
  const module = await import("./pages/Compare.js");
  return { default: module.ComparePage };
});
const ComposePage = lazy(async () => {
  const module = await import("./pages/Compose.js");
  return { default: module.ComposePage };
});
const ConnectPage = lazy(async () => {
  const module = await import("./pages/Connect.js");
  return { default: module.ConnectPage };
});
const AnalyticsPage = lazy(async () => {
  const module = await import("./pages/Analytics.js");
  return { default: module.AnalyticsPage };
});
const SettingsPage = lazy(async () => {
  const module = await import("./pages/Settings.js");
  return { default: module.SettingsPage };
});
const PlaceholderPage = lazy(async () => {
  const module = await import("./pages/Placeholder.js");
  return { default: module.PlaceholderPage };
});

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
      <div className="flex h-dvh w-screen overflow-hidden bg-bg text-fg">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <Suspense fallback={<RouteFallback />}>
            <Switch>
              <Route path="/">{() => <WebhooksPage />}</Route>
              <Route path="/webhooks/:id">
                {(params) => <WebhooksPage selectedId={params.id} />}
              </Route>
              <Route path="/compare" component={ComparePage} />
              <Route path="/compose" component={ComposePage} />
              <Route path="/connect" component={ConnectPage} />
              <Route path="/analytics" component={AnalyticsPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route>
                <PlaceholderPage title="Not found" description="That route doesn't exist." />
              </Route>
            </Switch>
          </Suspense>
        </main>
        {paletteOpen ? (
          <Suspense fallback={null}>
            <CommandPalette open onClose={() => setPaletteOpen(false)} />
          </Suspense>
        ) : null}
      </div>
    </CommandPaletteContext.Provider>
  );
}

function RouteFallback(): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse flex-col">
      <div className="h-16 border-b border-border" />
      <div className="mx-auto mt-9 h-56 w-[min(72rem,calc(100%-2rem))] rounded-xl bg-bg-muted/50" />
    </div>
  );
}
