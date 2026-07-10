import type { MaintenanceMode, MaintenanceResult, ProjectMaintenancePort } from "../ports/index.js";

export interface ResetProjectCleanupInput {
  projectId: string;
  databasePath: string;
  mode: MaintenanceMode;
  maintenance: ProjectMaintenancePort;
}

export interface PurgeAllCleanupInput {
  mode: MaintenanceMode;
  home?: string;
  configuredDbPath?: string;
  purgeOwnedStorage: (input: { home?: string; mode: MaintenanceMode; configuredDbPath?: string }) => Promise<MaintenanceResult>;
}

export async function resetProjectCleanup(input: ResetProjectCleanupInput): Promise<MaintenanceResult> {
  return input.maintenance.resetProjectData({
    projectId: input.projectId,
    databasePath: input.databasePath,
    mode: input.mode
  });
}

export async function purgeAllCleanup(input: PurgeAllCleanupInput): Promise<MaintenanceResult> {
  return input.purgeOwnedStorage({
    home: input.home,
    mode: input.mode,
    configuredDbPath: input.configuredDbPath
  });
}
