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
  getStartupState: () => invoke("startup:get-state"),
  setStartupEnabled: (enabled) => invoke("startup:set-enabled", enabled),
  listConnectionProfiles: (includeArchived = false) => invoke("profiles:list", includeArchived),
  importSsmConnectionCommand: (text) => ipcRenderer.invoke("profiles:import-ssm-command", text),
  createConnectionProfile: (draft) => invoke("profiles:create", draft),
  testConnectionProfile: (draftOrId, transientPassword, options) => invoke("profiles:test", draftOrId, transientPassword, options),
  getConnectionStatus: () => invoke('profiles:connection-status'),
  disconnectConnectionProfile: (context) => invoke('profiles:disconnect', context),
  reconnectConnectionProfile: (context) => invoke('profiles:reconnect', context),
  cancelConnectionTest: (requestId) => invoke('profiles:cancel-test', requestId),
  cancelConnectionAttempt: (context) => invoke('profiles:cancel-connect', context),
  onConnectionState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('profiles:connection-state', handler);
    return () => ipcRenderer.removeListener('profiles:connection-state', handler);
  },
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
