import type {
  ArtifactRecord,
  CoreEvent,
  Handoff,
  MemoryRecord,
  MemoryScope,
  TaskProgress,
  TaskProgressStatus,
  WithFreshness
} from "../entities/index.js";
import { evaluateFreshness, withLifecycle } from "../freshness/index.js";
import type { Clock, IdGenerator, MemoryRepository, SearchIndex } from "../ports/index.js";

interface CommonInput {
  projectId: string;
  changeId?: string;
  sessionId?: string;
}

interface RecordInput extends CommonInput {
  title: string;
  content: string;
  scope?: MemoryScope;
}

interface DecisionInput extends RecordInput {
  rationale?: string;
}

interface ArtifactInput extends CommonInput {
  kind: string;
  title: string;
  path?: string;
  summary?: string;
}

interface TaskInput extends CommonInput {
  taskKey: string;
  status: TaskProgressStatus;
  notes?: string;
  blockers?: string[];
}

export interface WriteResult<T> {
  record: WithFreshness<T>;
  event: CoreEvent;
}

export function createMemoryWriter(repository: MemoryRepository, searchIndex: SearchIndex, clock: Clock, ids: IdGenerator) {
  const appendEvent = async (input: CommonInput, type: string, subjectType: CoreEvent["subjectType"], subjectId: string): Promise<CoreEvent> => {
    const event: CoreEvent = {
      id: ids.generate("event"),
      projectId: input.projectId,
      changeId: input.changeId,
      sessionId: input.sessionId,
      type,
      subjectType,
      subjectId,
      payload: {},
      createdAt: clock.now()
    };
    await repository.appendEvent(event);
    return event;
  };

  const writeMemory = async (kind: MemoryRecord["kind"], input: DecisionInput): Promise<WriteResult<MemoryRecord>> => {
    const record: MemoryRecord = {
      id: ids.generate(kind),
      projectId: input.projectId,
      changeId: input.changeId,
      sessionId: input.sessionId,
      kind,
      title: input.title,
      content: input.content,
      rationale: input.rationale,
      scope: input.scope ?? "change",
      lifecycle: withLifecycle(kind, clock.now())
    };
    await repository.saveMemoryRecord(record);
    await searchIndex.upsert({ sourceType: "memory_record", sourceId: record.id, projectId: record.projectId, changeId: record.changeId, text: `${record.title}\n${record.content}\n${record.rationale ?? ""}` });
    const event = await appendEvent(input, `${kind}.recorded`, "memory_record", record.id);
    return { record: { ...record, freshness: evaluateFreshness(kind, record.lifecycle, clock.now()) }, event };
  };

  return {
    recordObservation: (input: RecordInput) => writeMemory("observation", input),
    recordDecision: (input: DecisionInput) => writeMemory("decision", input),
    async recordHandoff(input: CommonInput & { content: string }): Promise<WriteResult<Handoff>> {
      const record: Handoff = { id: ids.generate("handoff"), projectId: input.projectId, changeId: input.changeId, sessionId: input.sessionId, content: input.content, lifecycle: withLifecycle("handoff", clock.now()) };
      await repository.saveHandoff(record);
      await searchIndex.upsert({ sourceType: "handoff", sourceId: record.id, projectId: record.projectId, changeId: record.changeId, text: record.content });
      const event = await appendEvent(input, "handoff.recorded", "handoff", record.id);
      return { record: { ...record, freshness: evaluateFreshness("handoff", record.lifecycle, clock.now()) }, event };
    },
    async recordArtifact(input: ArtifactInput): Promise<WriteResult<ArtifactRecord>> {
      const record: ArtifactRecord = { id: ids.generate("artifact"), projectId: input.projectId, changeId: input.changeId, kind: input.kind, path: input.path, title: input.title, summary: input.summary, lifecycle: withLifecycle("artifact", clock.now()) };
      await repository.saveArtifact(record);
      await searchIndex.upsert({ sourceType: "artifact", sourceId: record.id, projectId: record.projectId, changeId: record.changeId, text: `${record.title}\n${record.summary ?? ""}\n${record.path ?? ""}` });
      const event = await appendEvent(input, "artifact.recorded", "artifact", record.id);
      return { record: { ...record, freshness: evaluateFreshness("artifact", record.lifecycle, clock.now()) }, event };
    },
    async recordTaskProgress(input: TaskInput): Promise<WriteResult<TaskProgress>> {
      const record: TaskProgress = { id: ids.generate("task-progress"), projectId: input.projectId, changeId: input.changeId, taskKey: input.taskKey, status: input.status, notes: input.notes, blockers: input.blockers, lifecycle: withLifecycle("task_progress", clock.now()) };
      await repository.saveTaskProgress(record);
      await searchIndex.upsert({ sourceType: "task_progress", sourceId: record.id, projectId: record.projectId, changeId: record.changeId, text: `${record.taskKey}\n${record.status}\n${record.notes ?? ""}\n${record.blockers?.join("\n") ?? ""}` });
      const event = await appendEvent(input, "task_progress.recorded", "task_progress", record.id);
      return { record: { ...record, freshness: evaluateFreshness("task_progress", record.lifecycle, clock.now()) }, event };
    }
  };
}
