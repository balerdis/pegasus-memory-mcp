import type { FreshSourceType, FreshnessSignal, LifecycleMetadata } from "../entities/index.js";

const dayMs = 24 * 60 * 60 * 1000;

const reviewWindows: Partial<Record<FreshSourceType, number>> = {
  decision: 180,
  observation: 90,
  handoff: 30,
  task_progress: 14
};

export function defaultReviewAfter(sourceType: FreshSourceType, from: Date): Date | undefined {
  const days = reviewWindows[sourceType];
  return days === undefined ? undefined : new Date(from.getTime() + days * dayMs);
}

export function evaluateFreshness(sourceType: FreshSourceType, lifecycle: LifecycleMetadata, now: Date): FreshnessSignal {
  const reviewAfter = lifecycle.reviewAfter ?? defaultReviewAfter(sourceType, lifecycle.updatedAt);
  const explicitlyStale = lifecycle.state === "stale" || lifecycle.state === "needs_review";
  const archived = lifecycle.state === "archived" || lifecycle.archivedAt !== undefined;
  const reviewExpired = reviewAfter !== undefined && reviewAfter.getTime() < now.getTime();
  const stale = archived || explicitlyStale || reviewExpired;
  const needsReview = lifecycle.state === "needs_review" || reviewExpired;

  return {
    stale,
    needsReview,
    confirmBeforeRelying: stale || needsReview,
    reviewAfter,
    reason: stale ? (archived ? "archived" : explicitlyStale ? "explicit_lifecycle_state" : "review_deadline_passed") : "current"
  };
}

export function withLifecycle(sourceType: FreshSourceType, now: Date, state?: LifecycleMetadata["state"]): LifecycleMetadata {
  return {
    createdAt: now,
    updatedAt: now,
    reviewAfter: defaultReviewAfter(sourceType, now),
    state
  };
}
