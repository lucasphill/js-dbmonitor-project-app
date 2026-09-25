const SESSION_FIELDS = ["pid", "backendStart", "databaseOid", "database", "user", "application",
  "state", "waitEventType", "waitEvent", "backendType", "queryStartedAt",
  "transactionStartedAt", "activeDurationMs"];

function identityKey(row) { return `${row.pid}:${row.backendStart}`; }

function cleanRow(row) {
  const result = {};
  for (const field of SESSION_FIELDS) result[field] = row[field] ?? null;
  result.application = row.application || "";
  return result;
}

function createSessionHistory() {
  const profiles = new Map();
  function profile(id) {
    if (!profiles.has(id)) profiles.set(id, { rows: new Map(), lastObservedAt: null });
    return profiles.get(id);
  }
  function reconcile({ profileId, generation, observedAt, rows }) {
    if (!Number.isSafeInteger(profileId) || profileId < 1 ||
        !Number.isSafeInteger(generation) || generation < 0 ||
        !Number.isFinite(Date.parse(observedAt)) || !Array.isArray(rows)) {
      throw new TypeError("Invalid session snapshot");
    }
    const keys = new Set();
    for (const row of rows) {
      if (!Number.isSafeInteger(row.pid) || row.pid < 1 ||
          typeof row.backendStart !== "string" || !Number.isFinite(Date.parse(row.backendStart)) ||
          row.backendType !== "client backend") throw new TypeError("Invalid session identity");
      const key = identityKey(row);
      if (keys.has(key)) throw new TypeError("Duplicate session identity");
      keys.add(key);
    }
    const state = profile(profileId);
    if (state.lastObservedAt && observedAt <= state.lastObservedAt) return false;
    for (const [key, item] of state.rows) {
      if (!item.finishedAt && !keys.has(key)) item.finishedAt = observedAt;
    }
    for (const row of rows) {
      const key = identityKey(row);
      if (!state.rows.has(key)) state.rows.set(key, {
        ...cleanRow(row), lastObservedAt: observedAt, finishedAt: null,
      });
      else if (!state.rows.get(key).finishedAt) Object.assign(state.rows.get(key),
        cleanRow(row), { lastObservedAt: observedAt });
    }
    state.lastObservedAt = observedAt;
    return true;
  }
  function isFinished(profileId, identity) {
    return Boolean(profiles.get(profileId)?.rows.get(identityKey(identity))?.finishedAt);
  }
  function project(profileId, filters = {}, { all = false } = {}) {
    const state = profiles.get(profileId);
    const source = [...(state?.rows.values() || [])].map((row) => ({
      ...row, state: row.finishedAt ? "finished" : row.state,
      activeDurationMs: row.finishedAt ? null : row.activeDurationMs,
      queryStartedAt: row.finishedAt ? null : row.queryStartedAt,
      waitEventType: row.finishedAt ? null : row.waitEventType,
      waitEvent: row.finishedAt ? null : row.waitEvent,
    }));
    const matches = source.filter((row) => {
      for (const field of ["database", "user", "application", "state"]) {
        if (filters[field] && row[field] !== filters[field]) return false;
      }
      const search = filters.search?.toLocaleLowerCase();
      return !search || [row.pid, row.database, row.user, row.application]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(search));
    });
    const byState = {};
    for (const row of matches) if (row.state !== "finished") {
      const key = row.state || "unknown";
      byState[key] = (byState[key] || 0) + 1;
    }
    const field = { duration: "activeDurationMs", startedAt: "backendStart",
      database: "database", user: "user", state: "state", pid: "pid",
      finishedAt: "finishedAt" }[filters.sortBy] || "activeDurationMs";
    const direction = filters.sortDirection === "asc" ? 1 : -1;
    matches.sort((a, b) => {
      const left = a[field], right = b[field];
      if (left == null && right != null) return 1;
      if (right == null && left != null) return -1;
      let comparison = 0;
      if (typeof left === "number" && typeof right === "number") comparison = left - right;
      else comparison = String(left ?? "").localeCompare(String(right ?? ""));
      return comparison ? comparison * direction : a.pid - b.pid || a.backendStart.localeCompare(b.backendStart);
    });
    const total = matches.length;
    const offset = all ? 0 : Number(filters.page?.cursor || 0);
    const limit = all ? total : Number(filters.page?.limit || 50);
    const rows = matches.slice(offset, offset + limit);
    return { rows, total, byState,
      nextCursor: offset + rows.length < total ? String(offset + rows.length) : undefined,
      updatedAt: state?.lastObservedAt || undefined };
  }
  return { reconcile, project, isFinished };
}

module.exports = { createSessionHistory };
