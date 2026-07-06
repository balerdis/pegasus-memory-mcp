import type {
  ArtifactRecord,
  Change,
  CoreEvent,
  Handoff,
  MemoryRecord,
  Project,
  TaskProgress
} from "../entities/index.js";

export interface ContextBundle {
  memories: MemoryRecord[];
  handoffs: Handoff[];
  artifacts: ArtifactRecord[];
  taskProgress: TaskProgress[];
  events: CoreEvent[];
}

export interface MemoryRepository {
  saveMemoryRecord(record: MemoryRecord): Promise<void>;
  saveHandoff(handoff: Handoff): Promise<void>;
  saveArtifact(artifact: ArtifactRecord): Promise<void>;
  saveTaskProgress(progress: TaskProgress): Promise<void>;
  appendEvent(event: CoreEvent): Promise<void>;
  getProjectByKey(key: string): Promise<Project | undefined>;
  getChangeById(id: string): Promise<Change | undefined>;
  listChanges(projectId: string): Promise<Change[]>;
  getContextBundle(projectId: string, changeId: string): Promise<ContextBundle>;
}

export interface TransactionalMemoryRepository extends MemoryRepository {
  transaction<T>(operation: () => Promise<T>): Promise<T>;
}

export interface SearchEntry {
  sourceType: "memory_record" | "handoff" | "artifact" | "task_progress";
  sourceId: string;
  projectId: string;
  changeId?: string;
  text: string;
}

export interface SearchIndex {
  upsert(entry: SearchEntry): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(prefix: string): string;
}
