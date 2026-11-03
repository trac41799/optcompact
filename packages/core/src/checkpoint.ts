/**
 * Semantic checkpoint trigger.
 *
 * Compaction runs at a task boundary once the context crosses the occupancy
 * ceiling, not at a high pressure threshold. The checkpoint itself targets a
 * small fixed budget so the post-compaction footprint is a fraction of the
 * window.
 *
 * @module
 */

/** Input to the checkpoint trigger. */
export interface CheckpointInput {
  /** Current context size divided by the window, in `[0, 1]`. */
  occupancy: number;
  /**
   * Conservative occupancy from the larger of the adapter estimates. It can
   * force the hard checkpoint even when the primary estimate is lower.
   */
  safetyOccupancy?: number;
  /** True at a task or phase boundary. */
  atBoundary: boolean;
  /** Current context size in tokens. */
  contextTokens: number;
  /** Model context window in tokens. */
  windowTokens: number;
  /** Budget for the written checkpoint in tokens. */
  checkpointTokens: number;
  /** Recent tail kept verbatim in tokens. */
  tailTokens: number;
  /** Occupancy ceiling for a boundary checkpoint. Defaults to 0.5. */
  maxOccupancy?: number;
  /** Occupancy that forces a checkpoint without a boundary. Defaults to maxOccupancy (0.5); raise it to require a boundary. */
  urgentOccupancy?: number;
  /** Occupancy that forces a checkpoint immediately. Defaults to 0.9. */
  hardOccupancy?: number;
}

/** Checkpoint decision with the resulting footprint. */
export interface CheckpointDecision {
  /** `checkpoint` or `keep`. */
  action: 'checkpoint' | 'keep';
  /** Why the action was chosen. */
  reason: 'below-threshold' | 'no-boundary' | 'boundary' | 'urgency' | 'hard';
  /** Context tokens after the checkpoint. */
  postTokens: number;
  /** Fraction of context removed, `1 - post/pre`. */
  ratio: number;
  /** Post-checkpoint size divided by the window. */
  targetOccupancy: number;
}

/**
 * Decide whether a boundary checkpoint should run.
 * Boundary checkpoints start at 50% occupancy by default. With the default
 * urgency equal to the boundary threshold, the decision fires at the next
 * pre-step once 50% is crossed. A 0.9 hard guard covers overflow.
 */
export function decideCheckpoint(input: CheckpointInput): CheckpointDecision {
  if (!(input.windowTokens > 0)) throw new Error('windowTokens must be positive');
  if (!(input.contextTokens >= 0)) throw new Error('contextTokens must be non-negative');
  if (!(input.checkpointTokens >= 0)) throw new Error('checkpointTokens must be non-negative');
  if (!(input.tailTokens >= 0)) throw new Error('tailTokens must be non-negative');

  const maxOccupancy = input.maxOccupancy ?? 0.5;
  const urgentOccupancy = input.urgentOccupancy ?? maxOccupancy;
  const hardOccupancy = input.hardOccupancy ?? 0.9;
  const safetyOccupancy = Math.max(input.occupancy, input.safetyOccupancy ?? input.occupancy);
  const postTokens = Math.min(input.contextTokens, input.checkpointTokens + input.tailTokens);

  const decision = (action: CheckpointDecision['action'], reason: CheckpointDecision['reason']): CheckpointDecision => ({
    action,
    reason,
    postTokens: action === 'checkpoint' ? postTokens : input.contextTokens,
    ratio: action === 'checkpoint' && input.contextTokens > 0 ? 1 - postTokens / input.contextTokens : 0,
    targetOccupancy: (action === 'checkpoint' ? postTokens : input.contextTokens) / input.windowTokens
  });

  if (safetyOccupancy >= hardOccupancy) return decision('checkpoint', 'hard');
  if (input.occupancy >= maxOccupancy && input.atBoundary) return decision('checkpoint', 'boundary');
  if (input.occupancy >= urgentOccupancy) return decision('checkpoint', 'urgency');
  if (input.occupancy >= maxOccupancy) return decision('keep', 'no-boundary');
  return decision('keep', 'below-threshold');
}
