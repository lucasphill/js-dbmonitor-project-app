/** Pure counter calculations for chart preparation. No database or Electron APIs. */
export interface CounterSample {
  at: string;
  key: string | number;
  value: number | null;
  statsReset?: string | null;
  /** A failed collection cannot be used as either side of a delta. */
  valid?: boolean;
}

export interface CounterPoint {
  at: string;
  key: string | number;
  value: number | null;
  delta: number | null;
  segment: number;
  reason?: "baseline" | "missing" | "gap" | "reset";
}

export interface CounterOptions {
  /** Values across longer collection gaps are not attributed to a time window. */
  maxGapMs?: number;
  /** Convert a valid delta into a rate per this many milliseconds. Omit for raw deltas. */
  ratePerMs?: number;
}

function validCounter(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

/**
 * Derive deltas independently for each identity. A reset, counter decrease,
 * missing sample, or collection gap starts a new segment with a null point.
 * Input is copied and sorted; callers retain their original order.
 */
export function counterSeries(samples: readonly CounterSample[], options: CounterOptions = {}): CounterPoint[] {
  const maxGapMs = options.maxGapMs ?? Number.POSITIVE_INFINITY;
  const ratePerMs = options.ratePerMs;
  if (!(maxGapMs > 0) || (ratePerMs !== undefined && !(ratePerMs > 0))) {
    throw new RangeError("Invalid counter interval");
  }
  const previous = new Map<string | number, { at: number; value: number; reset: string | null; segment: number }>();
  const segments = new Map<string | number, number>();
  const ordered = samples.map((sample, index) => ({ sample, index, time: Date.parse(sample.at) }))
    .sort((a, b) => a.time - b.time || a.index - b.index);
  return ordered.map(({ sample, time }) => {
    if (!Number.isFinite(time)) throw new TypeError("Invalid sample time");
    const prior = previous.get(sample.key);
    let segment = segments.get(sample.key) ?? 0;
    let delta: number | null = null;
    let reason: CounterPoint["reason"];
    const reset = sample.statsReset ?? null;
    if (sample.valid === false || !validCounter(sample.value)) {
      reason = "missing";
      previous.delete(sample.key);
      segment += 1;
    } else if (!prior) {
      reason = "baseline";
    } else if (time <= prior.at || time - prior.at > maxGapMs) {
      reason = "gap";
      segment += 1;
    } else if (prior.reset !== reset || sample.value < prior.value) {
      reason = "reset";
      segment += 1;
    } else {
      delta = sample.value - prior.value;
    }
    if (sample.valid !== false && validCounter(sample.value)) {
      previous.set(sample.key, { at: time, value: sample.value, reset, segment });
    }
    segments.set(sample.key, segment);
    const value = delta === null ? null : ratePerMs === undefined ? delta : delta * ratePerMs / (time - prior!.at);
    return { at: sample.at, key: sample.key, value, delta, segment, ...(reason ? { reason } : {}) };
  });
}

/** Preserve unavailable latency as null; zero is only valid when measured. */
export function measuredLatency(totalTimeMs: number | null, calls: number | null): number | null {
  if (totalTimeMs === null || calls === null || !Number.isFinite(totalTimeMs) ||
      !Number.isFinite(calls) || totalTimeMs < 0 || calls <= 0) return null;
  return totalTimeMs / calls;
}
