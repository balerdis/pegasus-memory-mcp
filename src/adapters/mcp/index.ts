import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CoreEvent, TaskProgressStatus } from "../../core/entities/index.js";
import { getActiveContext, recoverContext } from "../../core/use-cases/recovery.js";
import type { createMemoryWriter } from "../../core/use-cases/write-memory.js";
import type { Clock, MemoryRepository, MemorySearchPort, SearchIndex } from "../../core/ports/index.js";

type MemoryWriter = ReturnType<typeof createMemoryWriter>;

export interface RecentEventReader {
  listRecentEvents(projectId: string, input?: { changeId?: string; limit?: number }): Promise<CoreEvent[]>;
}

export interface McpAdapterRuntime {
  repository: MemoryRepository;
  searchIndex: SearchIndex;
  writer: MemoryWriter;
  clock: Clock;
  searchable?: MemorySearchPort;
  eventReader?: RecentEventReader;
}

const commonWriteSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional()
});

export const toolSchemas = {
  record_observation: commonWriteSchema.extend({
    title: z.string().min(1),
    content: z.string().min(1),
    scope: z.enum(["project", "change", "session"]).optional()
  }),
  record_decision: commonWriteSchema.extend({
    title: z.string().min(1),
    content: z.string().min(1),
    rationale: z.string().min(1).optional(),
    scope: z.enum(["project", "change", "session"]).optional()
  }),
  record_handoff: commonWriteSchema.extend({ content: z.string().min(1) }),
  record_artifact: commonWriteSchema.extend({
    kind: z.string().min(1),
    title: z.string().min(1),
    path: z.string().min(1).optional(),
    summary: z.string().min(1).optional()
  }),
  record_task_progress: commonWriteSchema.extend({
    taskKey: z.string().min(1),
    status: z.enum(["pending", "in_progress", "blocked", "completed"]),
    notes: z.string().min(1).optional(),
    blockers: z.array(z.string().min(1)).optional()
  }),
  get_active_context: z.object({ projectKey: z.string().min(1) }),
  recover_context: z.object({ projectKey: z.string().min(1) }),
  search_memory: z.object({
    projectId: z.string().min(1),
    query: z.string().min(1),
    changeId: z.string().min(1).optional(),
    sourceType: z.enum(["memory_record", "handoff", "artifact", "task_progress"]).optional(),
    scope: z.string().min(1).optional(),
    limit: z.number().int().positive().max(100).optional()
  }),
  list_recent_changes: z.object({ projectKey: z.string().min(1), limit: z.number().int().positive().max(100).optional() }),
  list_recent_events: z.object({ projectKey: z.string().min(1), changeId: z.string().min(1).optional(), limit: z.number().int().positive().max(100).optional() })
} as const;

export type McpToolName = keyof typeof toolSchemas;

export class McpAdapterError extends Error {
  constructor(readonly code: "validation_error" | "not_found" | "unsupported_operation", message: string, readonly metadata?: unknown) {
    super(message);
  }
}

export function createMcpToolHandlers(runtime: McpAdapterRuntime) {
  return {
    record_observation: async (input: unknown) => okWrite(await runtime.writer.recordObservation(parse("record_observation", input))),
    record_decision: async (input: unknown) => okWrite(await runtime.writer.recordDecision(parse("record_decision", input))),
    record_handoff: async (input: unknown) => okWrite(await runtime.writer.recordHandoff(parse("record_handoff", input))),
    record_artifact: async (input: unknown) => okWrite(await runtime.writer.recordArtifact(parse("record_artifact", input))),
    record_task_progress: async (input: unknown) => okWrite(await runtime.writer.recordTaskProgress(parse("record_task_progress", input) as z.infer<typeof toolSchemas.record_task_progress> & { status: TaskProgressStatus })),
    get_active_context: async (input: unknown) => normalizeDates(await getActiveContext(runtime.repository, runtime.clock, parse("get_active_context", input))),
    recover_context: async (input: unknown) => normalizeDates(await recoverContext(runtime.repository, runtime.clock, parse("recover_context", input))),
    search_memory: async (input: unknown) => {
      if (!runtime.searchable) {
        throw new McpAdapterError("unsupported_operation", "search_memory requires a searchable runtime");
      }
      const parsed = parse("search_memory", input);
      return { ok: true, results: normalizeDates(await runtime.searchable.searchMemory({ ...parsed, now: runtime.clock.now() })) };
    },
    list_recent_changes: async (input: unknown) => {
      const parsed = parse("list_recent_changes", input);
      const project = await runtime.repository.getProjectByKey(parsed.projectKey);
      if (!project) {
        return { ok: false, status: "not_found", basis: "project_not_found", confirmationRequired: false, changes: [] };
      }
      const changes = (await runtime.repository.listChanges(project.id)).slice(0, parsed.limit ?? 20);
      return { ok: true, changes: normalizeDates(changes) };
    },
    list_recent_events: async (input: unknown) => {
      const parsed = parse("list_recent_events", input);
      const project = await runtime.repository.getProjectByKey(parsed.projectKey);
      if (!project) {
        return { ok: false, status: "not_found", basis: "project_not_found", confirmationRequired: false, events: [] };
      }
      const events = runtime.eventReader
        ? await runtime.eventReader.listRecentEvents(project.id, { changeId: parsed.changeId, limit: parsed.limit })
        : [];
      return { ok: true, events: normalizeDates(events) };
    }
  };
}

export function createPegasusMcpServer(runtime: McpAdapterRuntime): McpServer {
  const server = new McpServer({ name: "pegasus-memory-mcp", version: "0.1.0" });
  const handlers = createMcpToolHandlers(runtime);

  for (const name of Object.keys(toolSchemas) as McpToolName[]) {
    server.registerTool(
      name,
      { title: name, description: `Pegasus Memory MCP ${name} tool`, inputSchema: toolSchemas[name] },
      async (input: unknown) => toToolResult(await executeHandler(handlers[name], input))
    );
  }

  return server;
}

function parse<Name extends McpToolName>(name: Name, input: unknown): z.infer<(typeof toolSchemas)[Name]> {
  const result = toolSchemas[name].safeParse(input);
  if (!result.success) {
    throw new McpAdapterError("validation_error", `Invalid input for ${name}`, result.error.issues);
  }
  return result.data as z.infer<(typeof toolSchemas)[Name]>;
}

async function executeHandler(handler: (input: unknown) => Promise<unknown>, input: unknown): Promise<unknown> {
  try {
    return await handler(input);
  } catch (error) {
    if (error instanceof McpAdapterError) {
      return { ok: false, error: { code: error.code, message: error.message, metadata: error.metadata } };
    }
    throw error;
  }
}

function okWrite(result: unknown) {
  return { ok: true, ...normalizeDates(result) as Record<string, unknown> };
}

function toToolResult(output: unknown) {
  const structuredContent = normalizeDates(output) as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}

function normalizeDates(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeDates);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeDates(item)]));
  }
  return value;
}
