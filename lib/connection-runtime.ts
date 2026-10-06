import type { ConnectionRuntime, DataBlock, Overview } from "./dashboard-types";

/** Keep the last measured facts visible, while promptly withdrawing their current status. */
export function overviewForRuntime(overview: Overview | null, runtime: ConnectionRuntime | null): Overview | null {
  if (!overview || !runtime || runtime.state === "connected" ||
    overview.sourceContext?.profileId !== runtime.sourceContext.profileId ||
    overview.sourceContext?.generation !== runtime.sourceContext.generation) return overview;
  const stale = <T>(block: DataBlock<T>): DataBlock<T> =>
    block.state === "ready" || block.state === "partial" || block.state === "stale"
      ? { ...block, state: "stale", reason: runtime.message || "A conexão não está ativa. Estes são os últimos dados medidos." }
      : block;
  return {
    ...overview,
    instance: stale(overview.instance),
    metrics: stale(overview.metrics),
    connectionsSeries: stale(overview.connectionsSeries),
    transactionsSeries: stale(overview.transactionsSeries),
    databases: stale(overview.databases),
  };
}
