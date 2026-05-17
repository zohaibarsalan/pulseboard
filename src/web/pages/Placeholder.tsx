import { Topbar } from "../components/Topbar.js";

type Props = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: Props): React.ReactElement {
  return (
    <div className="flex h-full flex-col">
      <Topbar title={title} subtitle={description} />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="pb-card flex max-w-md flex-col gap-1.5 p-8 text-center">
          <h2 className="text-sm font-medium">Coming soon</h2>
          <p className="text-xs text-fg-subtle">
            This section is not yet built. Track progress in <code className="font-mono">CONTEXT.md</code>{" "}
            and the v0.1 / v0.2 / v0.3 scope in the product spec.
          </p>
        </div>
      </div>
    </div>
  );
}
