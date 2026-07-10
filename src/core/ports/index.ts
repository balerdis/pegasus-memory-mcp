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
  saveProject(project: Project): Promise<void>;
  saveChange(change: Change): Promise<void>;
  saveMemoryRecord(record: MemoryRecord): Promise<void>;
  saveHandoff(handoff: Handoff): Promise<void>;
  saveArtifact(artifact: ArtifactRecord): Promise<void>;
  saveTaskProgress(progress: TaskProgress): Promise<void>;
  appendEvent(event: CoreEvent): Promise<void>;
  getProjectById(id: string): Promise<Project | undefined>;
  getProjectByKey(key: string): Promise<Project | undefined>;
  getChangeById(id: string): Promise<Change | undefined>;
  getChangeByProjectAndKey(projectId: string, key: string): Promise<Change | undefined>;
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

export interface MemorySearchInput {
  projectId: string;
  query: string;
  changeId?: string;
  sourceType?: SearchEntry["sourceType"];
  scope?: string;
  limit?: number;
  now?: Date;
}

export interface MemorySearchResult {
  sourceType: SearchEntry["sourceType"];
  sourceId: string;
  projectId: string;
  changeId?: string;
  scope?: string;
  title?: string;
  content: string;
  updatedAt: Date;
  stale: boolean;
  needsReview: boolean;
  confirmBeforeRelying: boolean;
  freshnessReason: string;
}

export interface MemorySearchPort {
  searchMemory(input: MemorySearchInput): Promise<MemorySearchResult[]>;
}

export type MaintenanceMode = "dry_run" | "execute";
export type MaintenanceStatus = "planned" | "deleted" | "noop" | "error";

export interface MaintenanceSkippedTarget {
  target: string;
  reason: string;
}

export interface MaintenanceResult {
  command: "reset" | "purge";
  mode: MaintenanceMode;
  targets: string[];
  deleted: string[];
  skipped: MaintenanceSkippedTarget[];
  status: MaintenanceStatus;
}

export interface ProjectResetInput {
  projectId: string;
  databasePath: string;
  mode: MaintenanceMode;
}

export interface ProjectMaintenancePort {
  resetProjectData(input: ProjectResetInput): Promise<MaintenanceResult>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(prefix: string): string;
}
