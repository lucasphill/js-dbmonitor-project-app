const { contextBridge, ipcRenderer } = require("electron");

async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result?.ok) {
    const error = new Error(result?.error?.message || "Operação indisponível");
    error.code = result?.error?.code || "INTERNAL_ERROR";
    throw error;
  }
  return result.data;
}

contextBridge.exposeInMainWorld("bdash", {
  listConnectionProfiles: (includeArchived = false) => invoke("profiles:list", includeArchived),
  createConnectionProfile: (draft) => invoke("profiles:create", draft),
  testConnectionProfile: (draftOrId, transientPassword) => invoke("profiles:test", draftOrId, transientPassword),
  updateConnectionProfile: (id, changes, confirmNewOrigin = false) =>
    invoke("profiles:update", id, changes, confirmNewOrigin),
  activateConnectionProfile: (id) => invoke("profiles:activate", id),
  archiveConnectionProfile: (id, confirm) => invoke("profiles:archive", id, confirm),
  setSessionPassword: (id, password) => invoke("profiles:session-password", id, password),
  getOverview: (period) => invoke("dashboard:overview", period),
  getSessions: (filters) => invoke("dashboard:sessions", filters),
  revealSessionDetails: (identity) => invoke("dashboard:session-details", identity),
  getDatabaseActivity: (period, page) => invoke("dashboard:database-activity", period, page),
  getDatabaseInventory: (filters) => invoke("dashboard:database-inventory", filters),
  getPerformance: (period, page) => invoke("dashboard:performance", period, page),
  getLogs: (filters) => invoke("dashboard:logs", filters),
  getDiagnostics: () => invoke("dashboard:diagnostics"),
  getPreferences: () => invoke("dashboard:preferences"),
  refreshNow: () => invoke("dashboard:refresh"),
  updatePreferences: (preferences) => invoke("dashboard:update-preferences", preferences),
  exportFiltered: (request) => invoke("dashboard:export", request),
  terminateSession: (identity) => invoke("dashboard:terminate-session", identity),
  getDatabaseStats: () => invoke("database:stats"),
});
