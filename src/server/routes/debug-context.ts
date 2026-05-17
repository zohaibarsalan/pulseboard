import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { jobs, jobEvents } from "../../db/schema.js";
import { redact } from "../../security/redaction.js";
import type { AppContext } from "../context.js";

type Params = { instanceId: string; queueName: string; jobId: string };

const PROMPT_STUB = `Help me figure out why this job failed. Look at the failed reason and stack first, then the recent timeline events for context.`;

export async function debugContextRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: Params }>(
    "/api/instances/:instanceId/queues/:queueName/jobs/:jobId/debug-context",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        return reply.code(404).send({ error: "instance_not_found" });
      }

      const queue = ctx.registry.get(req.params.queueName);
      const liveJob = queue ? await queue.getJob(req.params.jobId) : null;
      const indexed = ctx.db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.instanceId, ctx.instanceId),
            eq(jobs.queueName, req.params.queueName),
            eq(jobs.jobId, req.params.jobId),
          ),
        )
        .get();
      const timeline = ctx.db
        .select()
        .from(jobEvents)
        .where(
          and(
            eq(jobEvents.instanceId, ctx.instanceId),
            eq(jobEvents.queueName, req.params.queueName),
            eq(jobEvents.jobId, req.params.jobId),
          ),
        )
        .orderBy(desc(jobEvents.createdAt))
        .limit(20)
        .all();

      if (!liveJob && !indexed) {
        return reply.code(404).send({ error: "job_not_found" });
      }

      const status = indexed?.status ?? "unknown";
      const name = liveJob?.name ?? indexed?.jobName ?? "(unknown)";
      const createdAt = liveJob?.timestamp ?? indexed?.createdAt ?? null;
      const startedAt = liveJob?.processedOn ?? indexed?.processedOn ?? null;
      const finishedAt = liveJob?.finishedOn ?? indexed?.finishedOn ?? null;
      const attempts = liveJob?.attemptsMade ?? indexed?.attemptsMade ?? 0;
      const failedReason = liveJob?.failedReason ?? indexed?.failedReason ?? null;
      const stack = liveJob?.stacktrace?.join("\n") ?? indexed?.stacktracePreview ?? null;
      const payload =
        ctx.config.storePayloads && liveJob ? redact(liveJob.data, ctx.config.redactKeys) : null;
      const returnValue =
        ctx.config.storeReturnValues && liveJob
          ? redact(liveJob.returnvalue, ctx.config.redactKeys)
          : null;

      const md = formatMarkdown({
        instanceId: ctx.instanceId,
        queueName: req.params.queueName,
        jobId: req.params.jobId,
        name,
        status,
        createdAt,
        startedAt,
        finishedAt,
        attempts,
        failedReason,
        stack,
        payload,
        returnValue,
        timeline,
        repoPath: process.cwd(),
        payloadStored: ctx.config.storePayloads,
        returnsStored: ctx.config.storeReturnValues,
      });

      reply.type("text/markdown; charset=utf-8").send(md);
    },
  );
}

type BundleInput = {
  instanceId: string;
  queueName: string;
  jobId: string;
  name: string;
  status: string;
  createdAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  attempts: number;
  failedReason: string | null;
  stack: string | null;
  payload: unknown;
  returnValue: unknown;
  timeline: Array<{ eventType: string; createdAt: number; eventDataJson: string | null }>;
  repoPath: string;
  payloadStored: boolean;
  returnsStored: boolean;
};

function formatMarkdown(b: BundleInput): string {
  const lines: string[] = [];
  lines.push(`# Job ${b.jobId} — ${b.name}`);
  lines.push("");
  lines.push(`- **Status**: \`${b.status}\``);
  lines.push(`- **Queue**: \`${b.queueName}\``);
  lines.push(`- **Instance**: \`${b.instanceId}\``);
  lines.push(`- **Attempts**: ${b.attempts}`);
  if (b.createdAt) lines.push(`- **Created**: ${new Date(b.createdAt).toISOString()}`);
  if (b.startedAt) lines.push(`- **Started**: ${new Date(b.startedAt).toISOString()}`);
  if (b.finishedAt) lines.push(`- **Finished**: ${new Date(b.finishedAt).toISOString()}`);
  if (b.startedAt && b.finishedAt) lines.push(`- **Duration**: ${b.finishedAt - b.startedAt}ms`);
  lines.push(`- **Repo path** (Pulseboard cwd): \`${b.repoPath}\``);
  lines.push("");

  if (b.failedReason) {
    lines.push(`## Failed reason`);
    lines.push("```");
    lines.push(b.failedReason);
    lines.push("```");
    lines.push("");
  }

  if (b.stack) {
    lines.push(`## Stack trace`);
    lines.push("```");
    lines.push(b.stack);
    lines.push("```");
    lines.push("");
  }

  lines.push(`## Payload`);
  if (!b.payloadStored) {
    lines.push(`_Payload storage is disabled (PULSEBOARD_STORE_PAYLOADS=false)._`);
  } else if (b.payload === null || b.payload === undefined) {
    lines.push(`_(none)_`);
  } else {
    lines.push("```json");
    lines.push(JSON.stringify(b.payload, null, 2));
    lines.push("```");
  }
  lines.push("");

  lines.push(`## Return value`);
  if (!b.returnsStored) {
    lines.push(`_Return-value storage is disabled (PULSEBOARD_STORE_RETURN_VALUES=false)._`);
  } else if (b.returnValue === null || b.returnValue === undefined) {
    lines.push(`_(none)_`);
  } else {
    lines.push("```json");
    lines.push(JSON.stringify(b.returnValue, null, 2));
    lines.push("```");
  }
  lines.push("");

  lines.push(`## Recent timeline (${b.timeline.length} event(s), newest first)`);
  if (b.timeline.length === 0) {
    lines.push(`_(none)_`);
  } else {
    for (const e of b.timeline) {
      const ts = new Date(e.createdAt).toISOString();
      lines.push(`- \`${ts}\` **${e.eventType}**${e.eventDataJson ? ` — ${truncate(e.eventDataJson, 200)}` : ""}`);
    }
  }
  lines.push("");

  lines.push(`---`);
  lines.push(`_Sensitive keys (${b.repoPath ? "redacted" : "n/a"}) were masked using Pulseboard's redact list._`);
  lines.push("");
  lines.push(`## Prompt`);
  lines.push(PROMPT_STUB);
  lines.push("");

  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}
