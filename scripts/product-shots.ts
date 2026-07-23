import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";

const outputDirectory = resolve("docs/product-shots");
mkdirSync(outputDirectory, { recursive: true });

let development: ChildProcess | null = null;
const runningStack =
  await isUrlReady("http://localhost:5173") &&
  await isUrlReady("http://127.0.0.1:4500/api/health");
if (!runningStack) {
  development = spawn("pnpm", ["dev"], {
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  development.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  development.stderr?.on("data", (chunk) => process.stderr.write(chunk));
}

try {
  await waitForUrl("http://localhost:5173");
  console.log("Development stack ready");
  const ids = await seedProductData();
  console.log("Product data seeded");
  const browser = await chromium.launch({ channel: "chrome" });
  console.log("Capture browser launched");
  const page = await browser.newPage({
    colorScheme: "dark",
    viewport: { width: 1512, height: 982 },
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[browser] ${message.text()}`);
  });
  await page.addInitScript(() => localStorage.setItem("pb-theme", "dark"));

  try {
    await page.goto(`http://localhost:5173/webhooks/${ids.later}`, { waitUntil: "domcontentloaded" });
    console.log("Webhook inspector loaded");
    await page.getByText("Request details").waitFor({ timeout: 15_000 });
    await captureWithScreenshotter(page, "webhook-inspector.png");

    await page.goto("http://localhost:5173/analytics", { waitUntil: "domcontentloaded" });
    await page.getByText("Developer insights").waitFor();
    await captureWithScreenshotter(page, "analytics.png");

    await page.goto(`http://localhost:5173/compare?left=${ids.earlier}&right=${ids.later}`, { waitUntil: "domcontentloaded" });
    await page.getByText("JSON body").waitFor();
    await captureWithScreenshotter(page, "compare.png");
  } finally {
    await browser.close();
  }
  console.log(`Product shots saved to ${outputDirectory}`);
} finally {
  if (development) {
    development.kill("SIGTERM");
    await new Promise<void>((done) => development!.once("exit", () => done()));
  }
}

async function captureWithScreenshotter(page: Page, filename: string): Promise<void> {
  console.log(`Capturing ${filename}…`);
  await page.getByRole("button", { name: "Toggle screenshot panel" }).click();
  await page.getByRole("button", { name: "Switch to Viewport mode" }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Capture viewport" }).click();
  const download = await downloadPromise;
  await download.saveAs(resolve(outputDirectory, filename));
  console.log(`Saved ${filename}`);
}

async function seedProductData(): Promise<{ earlier: string; later: string }> {
  const capture = async (event: string, payload: Record<string, unknown>): Promise<string> => {
    const response = await fetch("http://127.0.0.1:4500/hook/github", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": event,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Product data capture failed with ${response.status}`);
    const body = await response.json() as { captured: string };
    return body.captured;
  };
  const earlier = await capture("pull_request", {
    action: "opened",
    pull_request: { number: 42, title: "Ship webhook observability" },
    repository: { full_name: "acme/payments" },
    sender: { login: "octocat" },
  });
  const later = await capture("pull_request", {
    action: "synchronize",
    pull_request: { number: 42, title: "Ship webhook observability", commits: 7 },
    repository: { full_name: "acme/payments" },
    sender: { login: "octocat" },
  });
  return { earlier, later };
}

async function waitForUrl(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Development server is still starting.
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function isUrlReady(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
