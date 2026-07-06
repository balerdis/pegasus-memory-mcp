import type { ArtifactRecord, Change, CoreEvent, Handoff, MemoryRecord, TaskProgress, WithFreshness } from "../entities/index.js";
import { evaluateFreshness } from "../freshness/index.js";
import type { Clock, MemoryRepository } from "../ports/index.js";

const materialScoreGap = 100;

export interface RecoveryCandidate {
  id: string;
  key: string;
  title: string;
  phase?: string;
  lastTouchedAt?: Date;
  score: number;
  reason: string;
}

export interface ActiveContextBundle {
  memories: Array<WithFreshness<MemoryRecord>>;
  handoffs: Array<WithFreshness<Handoff>>;
  artifacts: Array<WithFreshness<ArtifactRecord>>;
  taskProgress: Array<WithFreshness<TaskProgress>>;
  events: CoreEvent[];
}

export type RecoveryResult =
  | { status: "selected"; change: Change; context: ActiveContextBundle; basis: string; confirmationRequired: false; candidates?: never }
  | { status: "ambiguous"; candidates: RecoveryCandidate[]; basis: string; confirmationRequired: true; change?: never; context?: never }
  | { status: "not_found"; basis: string; confirmationRequired: false; change?: never; context?: never; candidates?: never };

export async function getActiveContext(repository: MemoryRepository, clock: Clock, input: { projectKey: string }): Promise<RecoveryResult> {
  return recoverContext(repository, clock, input);
}

export async function recoverContext(repository: MemoryRepository, clock: Clock, input: { projectKey: string }): Promise<RecoveryResult> {
  const project = await repository.getProjectByKey(input.projectKey);
  if (!project) {
    return { status: "not_found", basis: "project_not_found", confirmationRequired: false };
  }

  if (project.activeChangeId) {
    const active = await repository.getChangeById(project.activeChangeId);
    if (active && active.lifecycle.state !== "archived") {
      return select(repository, clock, active, "stored_active_change");
    }
  }

  const candidates = (await repository.listChanges(project.id))
    .filter((change) => change.lifecycle.state !== "archived")
    .map((change) => toCandidate(change, clock.now()))
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));

  const [first, second] = candidates;
  if (!first) {
    return { status: "not_found", basis: "no_changes", confirmationRequired: false };
  }

  if (!second || first.score - second.score >= materialScoreGap) {
    const change = (await repository.getChangeById(first.id)) ?? (await repository.listChanges(project.id)).find((item) => item.id === first.id);
    if (change) {
      return select(repository, clock, change, `ranked_context:${first.reason}`);
    }
  }

  return {
    status: "ambiguous",
    candidates: candidates.slice(0, 5),
    basis: "score_gap_below_material_threshold",
    confirmationRequired: true
  };
}

async function select(repository: MemoryRepository, clock: Clock, change: Change, basis: string): Promise<RecoveryResult> {
  const bundle = await repository.getContextBundle(change.projectId, change.id);
  return {
    status: "selected",
    change,
    context: {
      memories: bundle.memories.map((record) => ({ ...record, freshness: evaluateFreshness(record.kind, record.lifecycle, clock.now()) })),
      handoffs: bundle.handoffs.map((handoff) => ({ ...handoff, freshness: evaluateFreshness("handoff", handoff.lifecycle, clock.now()) })),
      artifacts: bundle.artifacts.map((artifact) => ({ ...artifact, freshness: evaluateFreshness("artifact", artifact.lifecycle, clock.now()) })),
      taskProgress: bundle.taskProgress.map((task) => ({ ...task, freshness: evaluateFreshness("task_progress", task.lifecycle, clock.now()) })),
      events: bundle.events
    },
    basis,
    confirmationRequired: false
  };
}

function toCandidate(change: Change, now: Date): RecoveryCandidate {
  const daysOld = change.lastTouchedAt ? Math.floor((now.getTime() - change.lastTouchedAt.getTime()) / (24 * 60 * 60 * 1000)) : Number.POSITIVE_INFINITY;
  const recency = daysOld <= 1 ? 300 : daysOld <= 7 ? 200 : daysOld <= 30 ? 100 : 0;
  const active = change.isActive ? 500 : 0;
  const phase = phaseScore(change.phase);
  const task = Math.round((change.taskCompletionRatio ?? 0) * 100);
  const score = active + recency + phase + task;
  return {
    id: change.id,
    key: change.key,
    title: change.title,
    phase: change.phase,
    lastTouchedAt: change.lastTouchedAt,
    score,
    reason: `score ${score}: active ${active}, recency ${recency}, phase ${phase}, task ${task}`
  };
}

function phaseScore(phase?: string): number {
  switch (phase) {
    case "verify":
      return 80;
    case "apply":
      return 60;
    case "tasks":
      return 40;
    case "design":
    case "spec":
      return 20;
    default:
      return 0;
  }
}
