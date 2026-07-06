export type LifecycleState = "current" | "needs_review" | "stale" | "archived";

export interface LifecycleMetadata {
  createdAt: Date;
  updatedAt: Date;
  reviewAfter?: Date;
  state?: LifecycleState;
  archivedAt?: Date;
}

export interface FreshnessSignal {
  stale: boolean;
  needsReview: boolean;
  confirmBeforeRelying: boolean;
  reviewAfter?: Date;
  reason: string;
}

export interface Project {
  id: string;
  key: string;
  name?: string;
  rootPath?: string;
  activeChangeId?: string;
  lifecycle: LifecycleMetadata;
}

export interface Change {
  id: string;
  projectId: string;
  key: string;
  title: string;
  phase?: string;
  status?: string;
  isActive?: boolean;
  lastTouchedAt?: Date;
  taskCompletionRatio?: number;
  lifecycle: LifecycleMetadata;
}

export interface Session {
  id: string;
  projectId: string;
  changeId?: string;
  startedAt: Date;
  endedAt?: Date;
  summary?: string;
}

export type MemoryKind = "observation" | "decision";
export type MemoryScope = "project" | "change" | "session";

export interface MemoryRecord {
  id: string;
  projectId: string;
  changeId?: string;
  sessionId?: string;
  kind: MemoryKind;
  title: string;
  content: string;
  rationale?: string;
  scope: MemoryScope;
  lifecycle: LifecycleMetadata;
}

export interface ArtifactRecord {
  id: string;
  projectId: string;
  changeId?: string;
  kind: string;
  path?: string;
  title: string;
  summary?: string;
  lifecycle: LifecycleMetadata;
}

export interface Handoff {
  id: string;
  projectId: string;
  changeId?: string;
  sessionId?: string;
  content: string;
  lifecycle: LifecycleMetadata;
}

export type TaskProgressStatus = "pending" | "in_progress" | "blocked" | "completed";

export interface TaskProgress {
  id: string;
  projectId: string;
  changeId?: string;
  taskKey: string;
  status: TaskProgressStatus;
  notes?: string;
  blockers?: string[];
  lifecycle: LifecycleMetadata;
}

export interface CoreEvent {
  id: string;
  projectId: string;
  changeId?: string;
  sessionId?: string;
  type: string;
  subjectType: "memory_record" | "handoff" | "artifact" | "task_progress" | "change" | "project";
  subjectId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export type FreshSourceType = MemoryKind | "handoff" | "task_progress" | "artifact";

export type WithFreshness<T> = T & { freshness: FreshnessSignal };
