import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "pulseboard-package-smoke-"));
let tarballPath = "";
const echo = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end('{"packageSmoke":true}');
});
await new Promise<void>((done) => echo.listen(4598, "127.0.0.1", done));

try {
  execFileSync("pnpm", ["build"], { stdio: "inherit" });
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json"], { encoding: "utf8" })) as Array<{ filename: string }>;
  tarballPath = resolve(packed[0]!.filename);
  const npmCache = join(directory, "npm-cache");
  execFileSync("npm", ["init", "-y", "--cache", npmCache], { cwd: directory, stdio: "ignore" });
  execFileSync("npm", ["install", tarballPath, "--omit=dev", "--cache", npmCache], { cwd: directory, stdio: "inherit" });

  const cli = join(directory, "node_modules", "@zohaibarsalan", "pulseboard", "dist", "cli.js");
  const version = execFileSync(process.execPath, [cli, "--version"], { encoding: "utf8" }).trim();
  if (version !== "0.1.0") throw new Error(`Installed package reported version ${version}`);

  const cliArguments = [
    cli,
    "--port", "4520",
    "--db", join(directory, "smoke.db"),
    "--forward", "http://127.0.0.1:4598",
  ];

  await withPulseboard(cliArguments, async () => {
    await waitForHealth("http://127.0.0.1:4520/api/health");
    const health = await fetch("http://127.0.0.1:4520/api/health").then((response) => response.json()) as {
      version: string;
      forwardTargets: string[];
    };
    if (health.version !== "0.1.0") throw new Error(`Installed server reported version ${health.version}`);
    if (!health.forwardTargets.includes("http://127.0.0.1:4598")) {
      throw new Error("Installed server did not apply its forwarding target");
    }
    const capture = await fetch("http://127.0.0.1:4520/hook/package", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"source":"installed-package"}',
    });
    if (capture.status !== 200) throw new Error(`Installed package capture returned ${capture.status}`);
    const events = await fetch("http://127.0.0.1:4520/api/webhooks").then((response) => response.json()) as {
      webhooks: unknown[];
    };
    if (events.webhooks.length !== 1) throw new Error("Installed package did not persist its captured webhook");
  });

  await withPulseboard(cliArguments, async () => {
    await waitForHealth("http://127.0.0.1:4520/api/health");
    const events = await fetch("http://127.0.0.1:4520/api/webhooks").then((response) => response.json()) as {
      webhooks: unknown[];
    };
    if (events.webhooks.length !== 1) {
      throw new Error("Installed package did not retain its webhook after restart");
    }
  });
  console.log("Installed npm package lifecycle smoke test passed");
} finally {
  await new Promise<void>((done) => echo.close(() => done()));
  if (tarballPath) rmSync(tarballPath, { force: true });
  rmSync(directory, { recursive: true, force: true });
}

async function withPulseboard(arguments_: string[], run: () => Promise<void>): Promise<void> {
  const child = spawn(process.execPath, arguments_, { stdio: "inherit" });
  try {
    await run();
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((done) => child.once("exit", () => done()));
  }
}

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Process is still starting.
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
