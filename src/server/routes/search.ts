import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, gte, like, lt, lte, sql, type SQL } from "drizzle-orm";
import { jobs } from "../../db/schema.js";
import { parseQuery, isEmpty, type ParsedQuery } from "../search/parse.js";
import type { AppContext } from "../context.js";

type Params = { instanceId: string };
type Query = { q?: string; limit?: string; before?: string };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function searchRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: Params; Querystring: Query }>(
    "/api/instances/:instanceId/jobs",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        return reply.code(404).send({ error: "instance_not_found" });
      }

      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
      const before = req.query.before ? Number(req.query.before) : null;
      const q = req.query.q ?? "";
      const parsed = parseQuery(q);

      const conditions: SQL[] = [eq(jobs.instanceId, ctx.instanceId)];

      if (parsed.status) conditions.push(eq(jobs.status, parsed.status));
      if (parsed.queue) conditions.push(eq(jobs.queueName, parsed.queue));
      if (parsed.name) conditions.push(eq(jobs.jobName, parsed.name));
      if (parsed.id) conditions.push(eq(jobs.jobId, parsed.id));
      if (parsed.reasonContains) {
        conditions.push(like(jobs.failedReason, `%${parsed.reasonContains}%`));
      }
      if (parsed.errorHashPrefix) {
        conditions.push(like(jobs.errorHash, `${parsed.errorHashPrefix}%`));
      }
      if (parsed.attempts) {
        const { op, value } = parsed.attempts;
        const col = jobs.attemptsMade;
        if (op === ">") conditions.push(gt(col, value));
        else if (op === "<") conditions.push(lt(col, value));
        else if (op === ">=") conditions.push(gte(col, value));
        else if (op === "<=") conditions.push(lte(col, value));
        else conditions.push(eq(col, value));
      }
      for (const text of parsed.freeText) {
        const pattern = `%${text}%`;
        conditions.push(
          sql`(${jobs.jobName} like ${pattern} or ${jobs.failedReason} like ${pattern})`,
        );
      }
      if (before) conditions.push(lt(jobs.updatedAt, before));

      const rows = ctx.db
        .select()
        .from(jobs)
        .where(and(...conditions))
        .orderBy(desc(jobs.updatedAt))
        .limit(limit)
        .all();

      const last = rows[rows.length - 1];
      return {
        instanceId: ctx.instanceId,
        q,
        parsed: serializeParsed(parsed),
        jobs: rows,
        nextBefore: rows.length === limit && last ? last.updatedAt : null,
        empty: isEmpty(parsed) && !q.trim(),
      };
    },
  );
}

function serializeParsed(p: ParsedQuery): Record<string, unknown> {
  return {
    status: p.status ?? null,
    queue: p.queue ?? null,
    name: p.name ?? null,
    id: p.id ?? null,
    reasonContains: p.reasonContains ?? null,
    errorHashPrefix: p.errorHashPrefix ?? null,
    attempts: p.attempts ?? null,
    freeText: p.freeText,
  };
}
