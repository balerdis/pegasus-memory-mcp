import type { Change, Project } from "../entities/index.js";
import type { Clock, MemoryRepository } from "../ports/index.js";

export interface EnsureProjectInput {
  projectId: string;
  key?: string;
  name?: string;
  workspaceRoot?: string;
  description?: string;
}

export interface EnsureChangeInput {
  projectId: string;
  changeId: string;
  key?: string;
  title?: string;
  status?: string;
  kind?: string;
  type?: string;
  description?: string;
}

export interface EnsureProjectResult {
  ok: true;
  project: Project;
  created: boolean;
}

export type EnsureChangeResult =
  | { ok: true; change: Change; created: boolean }
  | { ok: false; status: "precondition_failed"; basis: "project_not_found"; message: string; confirmationRequired: false }
  | { ok: false; status: "validation_error"; basis: "kind_type_conflict"; message: string; confirmationRequired: false };

export function createBootstrapEnsurer(repository: MemoryRepository, clock: Clock) {
  return {
    async ensureProject(input: EnsureProjectInput): Promise<EnsureProjectResult> {
      const key = input.key ?? input.projectId;
      const existing = await repository.getProjectById(input.projectId) ?? await repository.getProjectByKey(key);
      if (existing) {
        return { ok: true, project: existing, created: false };
      }

      const now = clock.now();
      const project: Project = {
        id: input.projectId,
        key,
        name: input.name,
        description: input.description,
        rootPath: input.workspaceRoot,
        lifecycle: { createdAt: now, updatedAt: now }
      };
      await repository.saveProject(project);
      return { ok: true, project, created: true };
    },

    async ensureChange(input: EnsureChangeInput): Promise<EnsureChangeResult> {
      const parent = await repository.getProjectById(input.projectId) ?? await repository.getProjectByKey(input.projectId);
      if (!parent) {
        return {
          ok: false,
          status: "precondition_failed",
          basis: "project_not_found",
          message: `Project '${input.projectId}' must be ensured before ensuring a change.`,
          confirmationRequired: false
        };
      }

      const kind = normalizeKind(input);
      if (kind === "conflict") {
        return {
          ok: false,
          status: "validation_error",
          basis: "kind_type_conflict",
          message: "kind and type must match when both are provided.",
          confirmationRequired: false
        };
      }

      const key = input.key ?? input.changeId;
      const existing = await repository.getChangeById(input.changeId) ?? await repository.getChangeByProjectAndKey(parent.id, key);
      if (existing) {
        return { ok: true, change: existing, created: false };
      }

      const now = clock.now();
      const change: Change = {
        id: input.changeId,
        projectId: parent.id,
        key,
        title: input.title ?? input.changeId,
        status: input.status,
        kind,
        description: input.description,
        lifecycle: { createdAt: now, updatedAt: now }
      };
      await repository.saveChange(change);
      return { ok: true, change, created: true };
    }
  };
}

function normalizeKind(input: EnsureChangeInput): string | undefined | "conflict" {
  if (input.kind !== undefined && input.type !== undefined && input.kind !== input.type) {
    return "conflict";
  }
  return input.kind ?? input.type;
}
