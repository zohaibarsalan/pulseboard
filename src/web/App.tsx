import { Route, Switch } from "wouter";
import { Sidebar } from "./components/Sidebar.js";
import { QueuesPage } from "./pages/Queues.js";
import { PlaceholderPage } from "./pages/Placeholder.js";

export function App(): React.ReactElement {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-fg">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Switch>
          <Route path="/" component={QueuesPage} />
          <Route path="/queue/:name">
            {(params) => (
              <PlaceholderPage
                title={decodeURIComponent(params.name)}
                description="Queue detail view — coming in v0.1 step 6."
              />
            )}
          </Route>
          <Route path="/failed">
            <PlaceholderPage
              title="Failed Jobs"
              description="Failure clustering and one-click retry — coming in v0.3."
            />
          </Route>
          <Route path="/flows">
            <PlaceholderPage
              title="Flows"
              description="Interactive workflow graphs — coming in v0.4."
            />
          </Route>
          <Route path="/analytics">
            <PlaceholderPage
              title="Analytics"
              description="Throughput, error rate, processing time — coming in v0.2."
            />
          </Route>
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
    </div>
  );
}
