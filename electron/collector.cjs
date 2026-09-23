/** Periodic monitoring without overlapping PostgreSQL queries or SQLite writes. */
function createCollector({ collectSnapshot, storage, ingestLogs, intervalSeconds = 15, profileId = 1, now = () => new Date() }) {
  if (typeof collectSnapshot !== "function") throw new TypeError("collectSnapshot is required");
  if (!Number.isSafeInteger(profileId) || profileId < 1) throw new TypeError("Profile ID is required");
  let interval = intervalSeconds;
  let timer = null;
  let inFlight = null;
  let draining = false;
  let startedAt = null;
  let latest = storage?.getLatestCycle?.(profileId) || null;
  let latestUsable = storage?.getLatestSuccessfulCycle?.(profileId) || null;
  let lastError = null;
  let logStatus = { state: "unavailable", lastSuccessAt: null, lastFailureAt: null, reason: "Fonte CSV não configurada" };

  async function run() {
    const started = now().toISOString();
    startedAt = started;
    try {
      const snapshot = await collectSnapshot();
      storage?.recordCycle?.(profileId, snapshot);
      latest = snapshot;
      if (snapshot.result === "success" || snapshot.result === "partial") latestUsable = snapshot;
      lastError = snapshot.error || null;
      return {
        state: snapshot.result === "failed" ? "failed" : snapshot.result === "partial" ? "partial" : "success",
        startedAt: started,
        finishedAt: snapshot.finishedAt || snapshot.collectedAt || now().toISOString(),
      };
    } catch (error) {
      // Collection and local storage failures are independent of the renderer.
      lastError = "Falha na coleta ou no armazenamento local";
      return { state: "failed", startedAt: started, finishedAt: now().toISOString() };
    } finally {
      if (typeof ingestLogs === "function") {
        try {
          const outcome = await ingestLogs();
          logStatus = { ...logStatus, state: outcome.state, reason: outcome.reason || null,
            lastSuccessAt: outcome.state === "ready" || outcome.state === "partial" ? now().toISOString() : logStatus.lastSuccessAt,
            lastFailureAt: outcome.state === "unavailable" && outcome.reason !== "Fonte CSV não configurada" ? now().toISOString() : logStatus.lastFailureAt };
        } catch {
          logStatus = { ...logStatus, state: "unavailable", reason: "Falha ao processar logs", lastFailureAt: now().toISOString() };
        }
      }
      try { storage?.prune?.(profileId); } catch { /* Storage errors are exposed on the next cycle. */ }
      inFlight = null;
    }
  }

  function refreshNow() {
    if (draining) return Promise.resolve({ state: "running", startedAt });
    if (inFlight) return Promise.resolve({ state: "running", startedAt });
    inFlight = run();
    return inFlight;
  }

  function start() {
    if (timer) return;
    draining = false;
    void refreshNow();
    timer = setInterval(() => { void refreshNow(); }, interval * 1000);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function stopAndWait() {
    draining = true;
    stop();
    if (inFlight) await inFlight;
  }

  function setIntervalSeconds(seconds) {
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 3600) throw new RangeError("Intervalo inválido");
    interval = seconds;
    if (timer) { stop(); start(); }
  }

  return {
    start, stop, stopAndWait, refreshNow, setIntervalSeconds,
    getProfileId: () => profileId,
    getLatest: () => latest,
    getLastUsable: () => latestUsable,
    getStatus: () => ({ running: Boolean(inFlight), startedAt, lastError, intervalSeconds: interval }),
    getLogStatus: () => logStatus,
  };
}

module.exports = { createCollector };
