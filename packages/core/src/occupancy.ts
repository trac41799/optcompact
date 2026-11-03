/**
 * Choose the occupancy estimate used by a compaction decision.
 *
 * Adapters own the harness-specific measurement; the core only compares the
 * numbers. A provider-reported prompt size is preferred while it belongs to the
 * current route. Otherwise the adapter's surface estimate is the fallback.
 *
 * @module
 */

/** Occupancy evidence supplied by one adapter. */
export interface OccupancyInput {
  /** Provider-reported prompt size for the next request, when available. */
  providerTokens?: number;
  /** Adapter estimate from priced surface nodes. */
  surfaceTokens: number;
  /** Model context window in tokens. */
  capacityTokens: number;
  /** True when the provider sample predates a route change. */
  routeChanged?: boolean;
}

/** Occupancy chosen for one decision. */
export interface OccupancySample {
  /** Context tokens the decision should use. */
  usedTokens: number;
  /** Model context window in tokens. */
  capacityTokens: number;
  /** Which estimate was selected. */
  source: 'provider' | 'surface';
}

/**
 * Select the provider sample when it is present and current, else the surface
 * estimate. Throws when the capacity is not positive.
 */
export function selectOccupancy(input: OccupancyInput): OccupancySample {
  if (!(input.capacityTokens > 0)) throw new Error('capacityTokens must be positive');
  if (!(input.surfaceTokens >= 0)) throw new Error('surfaceTokens must be non-negative');
  if (input.providerTokens !== undefined && !(input.providerTokens >= 0)) {
    throw new Error('providerTokens must be non-negative');
  }

  const useProvider =
    input.routeChanged !== true && input.providerTokens !== undefined && input.providerTokens > 0;

  return {
    usedTokens: useProvider ? input.providerTokens! : input.surfaceTokens,
    capacityTokens: input.capacityTokens,
    source: useProvider ? 'provider' : 'surface'
  };
}
