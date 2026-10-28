/**
 * Renewal-reward estimate of the economic compaction interval.
 *
 * @module
 */
export interface IntervalInput {
  /** Fixed cost of one summarization call. */
  fixedCallCost: number;
  /** Utility per input token. */
  inputPrice: number;
  /** Summary size divided by shadowed span size. */
  retentionRatio: number;
  /** Context growth in tokens per turn. */
  growthPerTurn: number;
}

/**
 * Minimize `c0/T + lambda*rho*g*T/2` over the interval `T`.
 * Returns `sqrt(2*c0 / (lambda * rho * g))`.
 */
export function economicInterval(input: IntervalInput): number {
  if (!(input.growthPerTurn > 0)) throw new Error('growthPerTurn must be positive');
  if (!(input.retentionRatio > 0)) throw new Error('retentionRatio must be positive');
  if (!(input.inputPrice > 0)) throw new Error('inputPrice must be positive');
  if (!(input.fixedCallCost >= 0)) throw new Error('fixedCallCost must be non-negative');
  return Math.sqrt((2 * input.fixedCallCost) / (input.inputPrice * input.retentionRatio * input.growthPerTurn));
}
