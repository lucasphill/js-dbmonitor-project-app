const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol } = require("electron");
const db = require("./db.cjs");
const { openStorage } = require("./storage.cjs");
const { createCollector } = require("./collector.cjs");
const { createProfileController } = require("./connection-profiles.cjs");
const { resolveUserDataPath } = require("./user-data.cjs");
const { buildOverview } = require("./overview.cjs");
const { buildDatabaseActivity, analyzeDatabases } = require("./analytics.cjs");
const { buildPerformance } = require("./performance.cjs");
const { ingestCsvLog } = require("./logs.cjs");
const { COLUMNS, writeCsv } = require("./export.cjs");
const { IpcInputError, wrapHandler, period, page, profileId, sourceContext, confirmation, sessionFilters,
  sessionActionIdentity, databaseInventoryFilters, logFilters, preferences, exportRequest } = require("./ipc.cjs");

const isDev = !app.isPackaged && process.argv.includes("--dev");
let storage;
let controller;

Menu.setApplicationMenu(null);

protocol.registerSchemesAsPrivileged([
  { scheme: "bdash", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function registerStaticProtocol() {
  const root = path.join(app.getAppPath(), "out");
  protocol.handle("bdash", (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "app") return new Response("Not found", { status: 404 });
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (pathname.includes("\\") || pathname.includes("\0")) {
      return new Response("Bad request", { status: 400 });
    }
    const target = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 600,
    title: "DBMonitor",
    backgroundColor: "#f4f6f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? url.startsWith("http://127.0.0.1:3000/") : url.startsWith("bdash://app/");
    if (!allowed) event.preventDefault();
  });

  if (isDev) window.loadURL("http://127.0.0.1:3000");
  else window.loadURL("bdash://app/");
}

app.whenReady().then(async () => {
  const userDataPath = resolveUserDataPath({
    appDataPath: app.getPath("appData"),
    defaultPath: app.getPath("userData"),
    overridePath: process.env.DBMONITOR_USER_DATA_DIR,
    legacyOverridePath: process.env.BDASH_USER_DATA_DIR,
  });
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath("userData", userDataPath);
  if (!isDev) registerStaticProtocol();
  storage = openStorage(app.getPath("userData"));
  controller = createProfileController({ storage, db, collectorFactory: (profile) => createCollector({
    collectSnapshot: db.collectSnapshot,
    storage,
    profileId: profile.id,
    ingestLogs: () => profile.authMode === "rds_iam"
      ? { state: "unavailable", reason: "Logs CSV locais não estão disponíveis no RDS", inserted: 0 }
      : ingestCsvLog(storage, profile.id, storage.getPreferences(profile.id).logSourcePath),
    intervalSeconds: storage.getPreferences(profile.id).collectionIntervalSeconds,
  }) });
  await controller.start();
  const active = () => {
    const state = controller.current();
    return { ...state, sourceContext: { profileId: state.profile.id, generation: state.generation } };
  };
  const withContext = (context, payload) => ({ ...payload, sourceContext: context.sourceContext });
  const register = (channel, handler) => ipcMain.handle(channel, wrapHandler(isDev, handler));

  register("profiles:list", (includeArchived = false) => controller.list(includeArchived === true));
  register("profiles:create", (draft) => controller.create(draft));
  register("profiles:test", (draftOrId, transientPassword) => controller.test(
    typeof draftOrId === "number" ? profileId(draftOrId) : draftOrId, transientPassword));
  register("profiles:update", (id, changes, confirmNewOrigin = false) =>
    controller.update(profileId(id), changes, confirmNewOrigin === true));
  register("profiles:activate", (id) => controller.switchTo(profileId(id)));
  register("profiles:archive", (id, confirmed) => controller.archive(profileId(id), confirmation(confirmed)));
  register("profiles:session-password", (id, password) => controller.setPassword(profileId(id), password));

  register("database:stats", () => db.getDatabaseStats());
  register("dashboard:overview", async (input) => {
    const context = active();
    const queryLatency = await db.getGlobalQueryLatency().catch(() => ({ available: false, value: null }));
    return withContext(context, buildOverview({ collector: context.collector, storage,
      profile: context.profile, period: period(input, { optional: true }), queryLatency }));
  });
  register("dashboard:sessions", async (input) => {
    const context = active();
    const data = await db.listSessions(sessionFilters(input));
    return { sessions: { state: "ready", source: "pg_stat_activity", updatedAt: data.updatedAt,
      data: { rows: data.rows.map((row) => ({ ...row, ...context.sourceContext })),
        total: data.total, nextCursor: data.nextCursor } }, byState: data.byState,
      sourceContext: context.sourceContext };
  });
  register("dashboard:session-details", (input) => {
    const identity = sessionActionIdentity(input);
    return controller.guardAdmin(identity, () => db.revealSessionDetails(identity));
  });
  register("dashboard:database-activity", (input, paging) => {
    const context = active();
    return withContext(context, buildDatabaseActivity(
      storage.getSamples(context.profile.id, period(input)),
      { page: page(paging), maxGapMs: storage.getPreferences(context.profile.id).collectionIntervalSeconds * 3000 },
    ));
  });
  register("dashboard:database-inventory", async (input) => {
    const context = active();
    const result = await db.listDatabaseInventory(databaseInventoryFilters(input));
    controller.assertContext(context.sourceContext);
    return withContext(context, { databases: {
      state: result.sizeIncomplete ? "partial" : result.rows.length ? "ready" : "empty",
      source: "pg_database + pg_stat_database + pg_database_size",
      updatedAt: result.updatedAt,
      reason: result.sizeIncomplete ? "Alguns tamanhos estão indisponíveis por permissão ou tempo limite." : undefined,
      data: { rows: result.rows, total: result.total, nextCursor: result.nextCursor },
    } });
  });
  register("dashboard:performance", async (input, paging) => {
    const context = active();
    const range = period(input);
    const selection = page(paging);
    const [sessions, aggregates] = await Promise.all([
      db.listSessions({ state: "active", page: selection }),
      db.getQueryAggregates({ limit: selection.limit, offset: Number(selection.cursor) }),
    ]);
    const history = storage.getSamples(context.profile.id, range);
    const capabilities = context.collector.getLastUsable()?.capabilities || {};
    sessions.rows = sessions.rows.map((row) => ({ ...row, ...context.sourceContext }));
    return withContext(context, buildPerformance({ history, sessions, aggregates, capabilities,
      maxGapMs: storage.getPreferences(context.profile.id).collectionIntervalSeconds * 3000 }));
  });
  register("dashboard:logs", (input) => {
    const context = active();
    const filters = logFilters(input);
    const source = context.profile.authMode === "rds_iam" ? null
      : storage.getPreferences(context.profile.id).logSourcePath;
    if (!source) return withContext(context, { state: "unavailable", source: "PostgreSQL CSV log",
      reason: context.profile.authMode === "rds_iam" ? "Logs CSV locais não estão disponíveis no RDS" : "Fonte CSV não configurada" });
    const logStatus = context.collector.getLogStatus();
    const data = storage.getLogs(context.profile.id, filters);
    return withContext(context, { state: logStatus.state === "unavailable" ? "stale" : data.total ? "ready" : "empty",
      source: "PostgreSQL CSV log + SQLite", updatedAt: logStatus.lastSuccessAt || undefined,
      reason: logStatus.state === "unavailable" ? logStatus.reason : undefined, data });
  });
  register("dashboard:diagnostics", () => {
    const context = active();
    const cycles = storage.getCycleDiagnostics(context.profile.id);
    const capabilities = { ...(context.collector.getLastUsable()?.capabilities || {}) };
    const logSource = context.profile.authMode === "rds_iam" ? null
      : storage.getPreferences(context.profile.id).logSourcePath;
    const logStatus = context.collector.getLogStatus();
    capabilities.logs = logSource && ["ready", "partial"].includes(logStatus.state)
      ? { available: true }
      : { available: false, reason: logSource ? logStatus.reason || "Fonte CSV indisponível" : "Fonte CSV de logs não configurada" };
    return withContext(context, {
    capabilities,
    lastCollectionSuccessAt: cycles.lastSuccessAt,
    lastCollectionFailureAt: cycles.lastFailureAt,
    lastCollectionFailure: cycles.lastFailure,
    lastLogSuccessAt: logStatus.lastSuccessAt,
    lastLogFailureAt: logStatus.lastFailureAt,
    lastLogFailure: logStatus.reason,
    storageBytes: storage.getStorageBytes(),
    metricsRetentionDays: storage.getPreferences(context.profile.id).metricsRetentionDays,
    logsRetentionDays: storage.getPreferences(context.profile.id).logsRetentionDays,
  }); });
  register("dashboard:preferences", () => {
    const context = active();
    return withContext(context, storage.getPreferences(context.profile.id));
  });
  register("dashboard:refresh", async () => {
    const context = active();
    return withContext(context, await context.collector.refreshNow());
  });
  register("dashboard:update-preferences", (input) => {
    const expected = sourceContext(input?.sourceContext);
    return controller.guardAdmin(expected, () => {
      const context = active();
      const next = preferences(input);
      if (context.profile.authMode === "rds_iam" && next.logSourcePath) {
        throw new IpcInputError("Logs CSV locais não estão disponíveis para perfis RDS IAM");
      }
      const updated = storage.updatePreferences(context.profile.id, next);
      context.collector.setIntervalSeconds(updated.collectionIntervalSeconds);
      return withContext(context, updated);
    });
  });
  register("dashboard:export", async (input) => {
    const expected = sourceContext(input?.sourceContext);
    const request = exportRequest(input);
    return controller.guardAdmin(expected, async () => {
    const context = active();
    let rows;
    if (request.dataset === "database-activity") {
      const history = storage.getSamples(context.profile.id, request.period || period(undefined, { optional: true }));
      rows = analyzeDatabases(history.databases, {
        maxGapMs: storage.getPreferences(context.profile.id).collectionIntervalSeconds * 3000,
      }).ranking.slice(0, 10000);
    } else if (request.dataset === "sessions") {
      const filters = request.sessionFilters || sessionFilters({});
      rows = [];
      for (let offset = 0; offset < 10000; offset += 200) {
        const result = await db.listSessions({ ...filters, page: { limit: 200, cursor: String(offset) } });
        rows.push(...result.rows);
        if (!result.nextCursor) break;
      }
    } else {
      const filters = request.logFilters || logFilters({ period: request.period || period(undefined, { optional: true }) });
      rows = [];
      for (let offset = 0; offset < 10000; offset += 200) {
        const result = storage.getLogs(context.profile.id, { ...filters, page: { limit: 200, cursor: String(offset) } });
        rows.push(...result.rows);
        if (!result.nextCursor) break;
      }
    }
    const result = await dialog.showSaveDialog({ defaultPath: `dbmonitor-${request.dataset}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (result.canceled || !result.filePath) return withContext(context, { canceled: true, rowCount: 0 });
    return withContext(context, await writeCsv(result.filePath, rows, COLUMNS[request.dataset]));
    });
  });
  register("dashboard:terminate-session", async (input) => {
    const identity = sessionActionIdentity(input);
    return controller.guardAdmin(identity, async () => {
    const result = await db.terminateSession(identity);
    storage.recordTerminationAttempt(identity.profileId, { pid: identity.pid, backendStart: identity.backendStart,
      attemptedAt: result.auditedAt, confirmed: result.status === "success", result: result.status });
    return result;
    });
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error("Falha ao iniciar DBMonitor:", error.code || "INITIALIZATION_FAILED");
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let shuttingDown = false;
app.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  void (async () => {
    try { await controller?.stop(); }
    finally { storage?.close(); app.quit(); }
  })();
});
