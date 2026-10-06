const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol } = require("electron");
const db = require("./db.cjs");
const { openStorage } = require("./storage.cjs");
const { createCollector } = require("./collector.cjs");
const { createProfileController } = require("./connection-profiles.cjs");
const { isRdsIamProfile } = require('./profile-validation.cjs');
const { resolveUserDataPath } = require("./user-data.cjs");
const { buildOverview } = require("./overview.cjs");
const { buildDatabaseActivity, analyzeDatabases } = require("./analytics.cjs");
const { buildPerformance } = require("./performance.cjs");
const { ingestCsvLog } = require("./logs.cjs");
const { COLUMNS, writeCsv, toJson } = require("./export.cjs");
const { buildExecutiveReport } = require("./executive-report.cjs");
const { createSessionHistory } = require("./sessions-history.cjs");
const { createStartupService, createWindowActivationCoordinator } = require("./startup.cjs");
const { IpcInputError, wrapHandler, period, page, profileId, sourceContext, confirmation, sessionFilters,
  sessionActionIdentity, databaseInventoryFilters, logFilters, preferences, exportRequest, startupEnabled,
  connectionRequestId, connectionTestOptions } = require("./ipc.cjs");

const isDev = !app.isPackaged && process.argv.includes("--dev");
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) app.quit();
let storage;
let controller;
let mainWindow;
let startupService;
const activation = createWindowActivationCoordinator({
  platform: process.platform, isPackaged: app.isPackaged, argv: process.argv,
});

if (isPrimaryInstance) {
  app.on("second-instance", (_event, argv) => {
    if (activation.onSecondInstance({ platform: process.platform, isPackaged: app.isPackaged, argv }) === "show") {
      activation.applyPending(mainWindow);
    }
  });
}

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

function createWindow({ minimized = false } = {}) {
  const window = new BrowserWindow({
    show: !minimized,
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
  mainWindow = window;
  window.on("closed", () => { if (mainWindow === window) mainWindow = undefined; });
  activation.applyPending(window);

  if (minimized) {
    window.once("ready-to-show", () => {
      if (window.isDestroyed()) return;
      window.show();
      if (activation.presentation() === "normal") window.focus();
      else window.minimize();
    });
  }

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? url.startsWith("http://127.0.0.1:3000/") : url.startsWith("bdash://app/");
    if (!allowed) event.preventDefault();
  });

  if (isDev) window.loadURL("http://127.0.0.1:3000");
  else window.loadURL("bdash://app/");
}

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;
  startupService = createStartupService({ app });
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
  controller = createProfileController({ storage, db, onConnectionState: (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('profiles:connection-state', state);
  }, collectorFactory: (profile) => createCollector({
    collectSnapshot: db.collectSnapshot,
    storage,
    profileId: profile.id,
    ingestLogs: () => isRdsIamProfile(profile)
      ? { state: "unavailable", reason: "Logs CSV locais não estão disponíveis no RDS", inserted: 0 }
      : ingestCsvLog(storage, profile.id, storage.getPreferences(profile.id).logSourcePath),
    intervalSeconds: storage.getPreferences(profile.id).collectionIntervalSeconds,
  }) });
  const initialStart = controller.start();
  const active = () => {
    const state = controller.current();
    return { ...state, sourceContext: { profileId: state.profile.id, generation: state.generation } };
  };
  const withContext = (context, payload) => ({ ...payload, sourceContext: context.sourceContext });
  const register = (channel, handler) => ipcMain.handle(channel, wrapHandler(isDev, handler));
  const sessionHistory = createSessionHistory();
  let sessionQueue = Promise.resolve();
  function refreshSessions(context) {
    const collect = async () => {
      controller.assertContext(context.sourceContext);
      const snapshot = await db.collectClientSessions();
      controller.assertContext(context.sourceContext);
      sessionHistory.reconcile({ ...context.sourceContext,
        observedAt: snapshot.updatedAt, rows: snapshot.rows });
    };
    const result = sessionQueue.then(collect);
    sessionQueue = result.catch(() => {});
    return result;
  }

  register("startup:get-state", () => startupService.getState());
  register("startup:set-enabled", (enabled) => startupService.setEnabled(startupEnabled(enabled)));

  register("profiles:list", (includeArchived = false) => controller.list(includeArchived === true));
  register("profiles:create", (draft) => controller.create(draft));
  register("profiles:test", (draftOrId, transientPassword, options) => controller.test(
    typeof draftOrId === "number" ? profileId(draftOrId) : draftOrId, transientPassword, connectionTestOptions(options)));
  register('profiles:connection-status', () => controller.getConnectionStatus());
  register('profiles:disconnect', (context) => controller.disconnect(sourceContext(context)));
  register('profiles:reconnect', (context) => controller.reconnect(sourceContext(context)));
  register('profiles:cancel-connect', (context) => controller.cancelConnect(sourceContext(context)));
  register('profiles:cancel-test', (id) => controller.cancelTest(connectionRequestId(id)));
  register("profiles:update", (id, changes, confirmNewOrigin = false) =>
    controller.update(profileId(id), changes, confirmNewOrigin === true));
  register("profiles:activate", (id) => controller.switchTo(profileId(id)));
  register("profiles:archive", (id, confirmed) => controller.archive(profileId(id), confirmation(confirmed)));
  register("profiles:session-password", (id, password) => controller.setPassword(profileId(id), password));

  register("database:stats", () => db.getDatabaseStats());
  register("dashboard:overview", async (input) => {
    const context = active();
    const queryLatency = await db.getGlobalQueryLatency().catch(() => ({ available: false, value: null }));
    return withContext(context, buildOverview({ collector: context.collector, storage, runtime: context.runtime,
      profile: context.profile, period: period(input, { optional: true }), queryLatency }));
  });
  register("dashboard:sessions", async (input) => {
    const context = active();
    const filters = sessionFilters(input);
    await refreshSessions(context);
    const data = sessionHistory.project(context.profile.id, filters);
    return { sessions: { state: "ready", source: "pg_stat_activity", updatedAt: data.updatedAt,
      data: { rows: data.rows.map((row) => ({ ...row, ...context.sourceContext })),
        total: data.total, nextCursor: data.nextCursor } }, byState: data.byState,
      sourceContext: context.sourceContext };
  });
  register("dashboard:session-details", (input) => {
    const identity = sessionActionIdentity(input);
    return controller.guardAdmin(identity, () => {
      if (sessionHistory.isFinished(identity.profileId, identity)) {
        throw new IpcInputError("A conexão já foi finalizada");
      }
      return db.revealSessionDetails(identity);
    });
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
    const source = isRdsIamProfile(context.profile) ? null
      : storage.getPreferences(context.profile.id).logSourcePath;
    if (!source) return withContext(context, { state: "unavailable", source: "PostgreSQL CSV log",
      reason: isRdsIamProfile(context.profile) ? "Logs CSV locais não estão disponíveis no RDS" : "Fonte CSV não configurada" });
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
    const logSource = isRdsIamProfile(context.profile) ? null
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
    return withContext(context, await controller.refreshNow());
  });
  register("dashboard:update-preferences", (input) => {
    const expected = sourceContext(input?.sourceContext);
    return controller.guardAdmin(expected, () => {
      const context = active();
      const next = preferences(input);
      if (isRdsIamProfile(context.profile) && next.logSourcePath) {
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
      if (request.format === "pdf" && request.dataset === "executive-summary") {
        const queryLatency = await db.getGlobalQueryLatency().catch(() => ({ available: false, value: null }));
        controller.assertContext(context.sourceContext);
        const overview = buildOverview({ collector: context.collector, storage, profile: context.profile,
          period: request.period, queryLatency });
        const history = storage.getSamples(context.profile.id, request.period);
        const preferences = storage.getPreferences(context.profile.id);
        let logCount = null;
        if (overview.capabilities.logs?.available) {
          logCount = storage.getLogs(context.profile.id, { period: request.period, page: { limit: 1 } }).total;
        }
        const generatedAt = new Date().toISOString();
        const report = buildExecutiveReport({ generatedAt,
          source: { profile: context.profile.label, database: context.profile.database },
          period: request.period, overview, history, logCount,
          collectionIntervalSeconds: preferences.collectionIntervalSeconds });
        const destination = await dialog.showSaveDialog(mainWindow, {
          defaultPath: "dbmonitor-resumo-executivo.pdf",
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (destination.canceled || !destination.filePath) {
          return withContext(context, { canceled: true, cancelReason: "destination", rowCount: 0, format: "pdf" });
        }
        controller.assertContext(context.sourceContext);

        const reportWindow = new BrowserWindow({
          show: false,
          width: 900,
          height: 1200,
          backgroundColor: "#ffffff",
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        });
        reportWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        reportWindow.webContents.on("will-navigate", (event, url) => {
          if (!url.startsWith("data:text/html;charset=utf-8,")) event.preventDefault();
        });
        try {
          await reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(report.html)}`);
          const pdf = await reportWindow.webContents.printToPDF({
            pageSize: "A4",
            printBackground: true,
            margins: { top: 0.45, bottom: 0.45, left: 0.45, right: 0.45 },
          });
          controller.assertContext(context.sourceContext);
          fs.writeFileSync(destination.filePath, pdf);
        } finally {
          if (!reportWindow.isDestroyed()) reportWindow.close();
        }
        return withContext(context, { canceled: false, filePath: destination.filePath,
          format: "pdf", rowCount: report.metricCount, truncated: false });
      }
      if (!new Set(["csv", "json"]).has(request.format) || request.dataset === "executive-summary") {
        throw new IpcInputError("Esta combinação de exportação ainda não está disponível");
      }
      let rows = [];
      let total = 0;
      let observationAt = null;
      let availability = { state: "available", notes: [] };
      let appliedFilters = {};

      if (request.dataset === "database-activity") {
        const history = storage.getSamples(context.profile.id, request.period);
        const ranking = analyzeDatabases(history.databases, {
          maxGapMs: storage.getPreferences(context.profile.id).collectionIntervalSeconds * 3000,
        }).ranking;
        total = ranking.length;
        rows = ranking.slice(0, 10000);
        if (!history.instance.length && !history.databases.length) {
          availability = { state: "empty", notes: ["Nenhuma amostra disponível no período selecionado."] };
        } else if (!ranking.some((row) => row.transactionsInPeriod !== null)) {
          availability = { state: "insufficient", notes: ["Não há duas amostras comparáveis suficientes para calcular variações no período."] };
        }
      } else if (request.dataset === "sessions") {
        const filters = request.sessionFilters || sessionFilters({});
        await refreshSessions(context);
        controller.assertContext(context.sourceContext);
        const snapshot = sessionHistory.project(context.profile.id, filters, { all: true });
        total = snapshot.total;
        observationAt = snapshot.updatedAt || null;
        rows = snapshot.rows.slice(0, 10000);
        appliedFilters = { database: filters.database, user: filters.user, application: filters.application,
          state: filters.state, search: filters.search, sortBy: filters.sortBy, sortDirection: filters.sortDirection };
        if (!observationAt) availability = { state: "unavailable", notes: ["Ainda não há uma observação válida de sessões nesta execução."] };
      } else if (request.dataset === "logs") {
        const filters = request.logFilters || logFilters({ period: request.period });
        const logSourcePath = isRdsIamProfile(context.profile) ? null
          : storage.getPreferences(context.profile.id).logSourcePath;
        const logState = context.collector.getLogStatus();
        if (!logSourcePath) {
          return withContext(context, { canceled: false, empty: true, rowCount: 0, format: request.format,
            message: isRdsIamProfile(context.profile)
              ? "Logs CSV locais não estão disponíveis para esta origem RDS."
              : "Nenhuma fonte CSV de logs está configurada." });
        }
        for (let offset = 0; offset < 10000; offset += 200) {
          controller.assertContext(context.sourceContext);
          const result = storage.getLogs(context.profile.id, { ...filters, page: { limit: 200, cursor: String(offset) } });
          if (offset === 0) total = result.total;
          rows.push(...result.rows);
          if (!result.nextCursor) break;
        }
        appliedFilters = { severity: filters.severity, database: filters.database, user: filters.user,
          pid: filters.pid, search: filters.search };
        if (["unavailable", "partial"].includes(logState.state)) {
          availability = { state: "partial", notes: [logState.reason || "A fonte de logs está indisponível; os registros existentes no histórico local são exportados."] };
        }
      } else {
        throw new IpcInputError("O resumo executivo PDF ainda não está disponível");
      }

      controller.assertContext(context.sourceContext);
      const truncated = total > rows.length;
      if (availability.state === "empty" || rows.length === 0) {
        return withContext(context, { canceled: false, empty: true, rowCount: 0, format: request.format,
          message: availability.notes[0] || "Nenhum registro corresponde ao período e filtros selecionados." });
      }

      if (request.dataset === "sessions" || request.dataset === "logs") {
        const sessionDisclosure = request.dataset === "sessions"
          ? "A exportação inclui PID, banco, usuário, aplicação, tipo e estado do backend, eventos de espera, duração e horários de conexão, consulta ativa e transação."
          : "A exportação inclui mensagens brutas dos logs do PostgreSQL, além de banco, usuário, PID e SQLSTATE quando disponíveis. As mensagens podem conter dados operacionais ou pessoais.";
        const confirmationResult = await dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Revise os dados da exportação",
          message: sessionDisclosure,
          detail: "Credenciais, texto de consulta e endereço do cliente não são incluídos. Continue somente se estiver de acordo em salvar esses dados no arquivo escolhido.",
          buttons: ["Continuar", "Cancelar"],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });
        if (confirmationResult.response !== 0) {
          return withContext(context, { canceled: true, cancelReason: "privacy", rowCount: 0, format: request.format });
        }
        controller.assertContext(context.sourceContext);
      }

      const extension = request.format;
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `dbmonitor-${request.dataset}.${extension}`,
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });
      if (result.canceled || !result.filePath) {
        return withContext(context, { canceled: true, cancelReason: "destination", rowCount: 0, format: request.format });
      }

      controller.assertContext(context.sourceContext);
      const generatedAt = new Date().toISOString();
      const source = { profile: context.profile.label, database: context.profile.database };
      const periodMetadata = request.dataset === "sessions"
        ? { type: "snapshot", observedAt: observationAt }
        : request.period;
      const periodLabel = request.dataset === "sessions"
        ? `Retrato atual; observado em ${observationAt}`
        : `${request.period.from} até ${request.period.to}`;
      const exportContext = {
        generatedAt, source, datasetLabel: request.dataset, periodLabel,
        availability: availability.state, availabilityNotes: availability.notes, truncated,
      };
      if (request.format === "csv") {
        writeCsv(result.filePath, rows, COLUMNS[request.dataset], exportContext);
      } else {
        fs.writeFileSync(result.filePath, toJson({ dataset: request.dataset, rows, generatedAt, source,
          period: periodMetadata, filters: appliedFilters, availability, truncated }), { encoding: "utf8" });
      }
      return withContext(context, { canceled: false, filePath: result.filePath, format: request.format,
        rowCount: rows.length, truncated });
    });
  });
  register("dashboard:terminate-session", async (input) => {
    const identity = sessionActionIdentity(input);
    return controller.guardAdmin(identity, async () => {
    if (sessionHistory.isFinished(identity.profileId, identity)) {
      throw new IpcInputError("A conexão já foi finalizada");
    }
    const result = await db.terminateSession(identity);
    storage.recordTerminationAttempt(identity.profileId, { pid: identity.pid, backendStart: identity.backendStart,
      attemptedAt: result.auditedAt, confirmed: result.status === "success", result: result.status });
    return result;
    });
  });
  createWindow({ minimized: activation.presentation() === "minimized" });
  await initialStart;
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
