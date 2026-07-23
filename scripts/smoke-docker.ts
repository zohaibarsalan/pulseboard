import { execFileSync } from "node:child_process";

const image = "pulseboard-smoke:local";
const container = `pulseboard-smoke-${process.pid}`;

try {
  execFileSync("docker", ["build", "-f", "docker/Dockerfile", "-t", image, "."], { stdio: "inherit" });
  execFileSync("docker", [
    "run", "-d",
    "--name", container,
    "-p", "4521:4500",
    image,
  ], { stdio: "inherit" });

  await waitForHealth("http://127.0.0.1:4521/api/health");
  const capture = await fetch("http://127.0.0.1:4521/hook/docker", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"source":"docker"}',
  });
  if (!capture.ok) throw new Error(`Docker capture returned ${capture.status}`);
  const events = await fetch("http://127.0.0.1:4521/api/webhooks").then((response) => response.json()) as {
    webhooks: unknown[];
  };
  if (events.webhooks.length !== 1) throw new Error("Docker container did not persist its captured webhook");
  console.log("Docker image smoke test passed");
} catch (error) {
  try {
    const logs = execFileSync("docker", ["logs", container], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (logs.trim()) console.error(logs);
  } catch (logError) {
    if (logError instanceof Error && "stdout" in logError && "stderr" in logError) {
      const output = `${String(logError.stdout ?? "")}${String(logError.stderr ?? "")}`.trim();
      if (output) console.error(output);
    }
  }
  throw error;
} finally {
  try {
    execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  } catch {
    // Container may not have been created.
  }
  try {
    execFileSync("docker", ["image", "rm", "-f", image], { stdio: "ignore" });
  } catch {
    // Image may not have been created.
  }
}

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Container is still starting.
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
