const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const startup = require("../electron/startup.cjs");

function harness() {
  const appDataPath = path.resolve("test-appdata");
  const execPath = path.resolve("test-install", "DBMonitor.exe");
  const marker = path.join(appDataPath, "DBMonitor", "startup-disabled");
  const files = new Set();
  const calls = [];
  let settings = { openAtLogin: false, executableWillLaunchAtLogin: false, launchItems: [] };
  let readError = null;
  let writeError = null;
  let markerError = null;
  const app = {
    getLoginItemSettings(options) {
      calls.push(["get", options]);
      if (readError) throw readError;
      return settings;
    },
    setLoginItemSettings(options) {
      calls.push(["set", options]);
      if (writeError) throw writeError;
      settings = {
        openAtLogin: options.openAtLogin,
        executableWillLaunchAtLogin: options.openAtLogin,
        launchItems: options.openAtLogin ? [{
          name: startup.LOGIN_ITEM_NAME,
          path: execPath,
          args: [startup.STARTUP_ARG],
          scope: "user",
          enabled: true,
        }] : [],
      };
    },
  };
  const fs = {
    existsSync(file) { return files.has(file); },
    mkdirSync() {},
    writeFileSync(file) { if (markerError) throw markerError; files.add(file); },
    unlinkSync(file) { if (markerError) throw markerError; files.delete(file); },
  };
  const service = () => startup.createStartupService({
    app, fs, path, platform: "win32", isPackaged: true, execPath, appDataPath,
  });
  return {
    app, files, calls, marker, execPath, service,
    setSettings(value) { settings = value; },
    failRead(error) { readError = error; },
    failWrite(error) { writeError = error; },
    failMarker(error) { markerError = error; },
  };
}

test("login item identity and launch decision are exact", () => {
  assert.equal(startup.LOGIN_ITEM_NAME, "DBMonitor");
  assert.equal(startup.STARTUP_ARG, "--dbmonitor-autostart");
  assert.equal(startup.OPT_OUT_FILE, "startup-disabled");
  assert.deepEqual(startup.loginItemOptions("C:\\Program Files\\DBMonitor\\DBMonitor.exe"), {
    path: "C:\\Program Files\\DBMonitor\\DBMonitor.exe",
    args: ["--dbmonitor-autostart"],
  });
  const input = { platform: "win32", isPackaged: true };
  assert.equal(startup.initialPresentation({ ...input, argv: ["DBMonitor.exe", startup.STARTUP_ARG] }), "minimized");
  assert.equal(startup.initialPresentation({ ...input, argv: ["DBMonitor.exe"] }), "normal");
  assert.equal(startup.initialPresentation({ ...input, argv: ["DBMonitor.exe", "--dbmonitor-autostart-extra"] }), "normal");
  assert.equal(startup.initialPresentation({ ...input, isPackaged: false, argv: [startup.STARTUP_ARG] }), "normal");
  assert.equal(startup.initialPresentation({ ...input, platform: "linux", argv: [startup.STARTUP_ARG] }), "normal");
});

test("a second manual opening shows existing window; automatic preserves it", () => {
  const base = { platform: "win32", isPackaged: true };
  assert.equal(startup.secondInstanceAction({ ...base, argv: ["DBMonitor.exe"] }), "show");
  assert.equal(startup.secondInstanceAction({ ...base, argv: ["DBMonitor.exe", startup.STARTUP_ARG] }), "preserve");
});

test("manual second opening before window readiness overrides pending minimization", () => {
  const base = { platform: "win32", isPackaged: true };
  const coordinator = startup.createWindowActivationCoordinator({
    ...base, argv: ["DBMonitor.exe", startup.STARTUP_ARG],
  });
  assert.equal(coordinator.presentation(), "minimized");
  assert.equal(coordinator.onSecondInstance({ ...base, argv: ["DBMonitor.exe"] }), "show");
  assert.equal(coordinator.presentation(), "normal");
  const calls = [];
  const window = {
    isMinimized: () => true,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
  };
  assert.equal(coordinator.applyPending(window), true);
  assert.deepEqual(calls, ["restore", "show", "focus"]);
  assert.equal(coordinator.applyPending(window), false);
  assert.equal(coordinator.presentation(), "normal");
  assert.equal(coordinator.onSecondInstance({
    ...base, argv: ["DBMonitor.exe", startup.STARTUP_ARG],
  }), "preserve");
  assert.equal(coordinator.applyPending(window), false);
});

test("reads real Windows approval and reports external disable", () => {
  const h = harness();
  h.setSettings({
    openAtLogin: true, executableWillLaunchAtLogin: true,
    launchItems: [{ name: startup.LOGIN_ITEM_NAME, path: h.execPath,
      args: [startup.STARTUP_ARG], scope: "user", enabled: true }],
  });
  assert.deepEqual(h.service().getState(), { state: "enabled" });
  h.setSettings({
    openAtLogin: true, executableWillLaunchAtLogin: false,
    launchItems: [{ name: startup.LOGIN_ITEM_NAME, path: h.execPath,
      args: [startup.STARTUP_ARG], scope: "user", enabled: false }],
  });
  assert.equal(h.service().getState().state, "disabled");
  assert.match(h.service().getState().reason, /Windows/i);
  h.setSettings({
    openAtLogin: true, executableWillLaunchAtLogin: true,
    launchItems: [{ name: startup.LOGIN_ITEM_NAME, path: h.execPath,
      args: [startup.STARTUP_ARG], scope: "user", enabled: false }],
  });
  assert.equal(h.service().getState().state, "disabled");
  assert.deepEqual(h.calls.at(-1)[1], startup.loginItemOptions(h.execPath));
});

test("recognizes an NSIS Run entry when Electron omits its arguments", () => {
  const h = harness();
  h.setSettings({
    openAtLogin: false, executableWillLaunchAtLogin: true,
    launchItems: [{ name: startup.LOGIN_ITEM_NAME, path: h.execPath,
      args: [], scope: "user", enabled: true }],
  });
  assert.deepEqual(h.service().getState(), { state: "enabled" });
  assert.equal(h.service().setEnabled(true).state, "enabled");
  assert.equal(h.calls.filter(([kind]) => kind === "set").length, 0);
  h.setSettings({
    openAtLogin: false, executableWillLaunchAtLogin: false,
    launchItems: [{ name: startup.LOGIN_ITEM_NAME, path: h.execPath,
      args: [], scope: "user", enabled: false }],
  });
  assert.equal(h.service().getState().state, "disabled");
  assert.match(h.service().getState().reason, /Windows/i);
  assert.equal(h.service().setEnabled(false).state, "disabled");
  assert.equal(h.calls.filter(([kind]) => kind === "set").length, 1);
  assert.equal(h.files.has(h.marker), true);
});

test("setEnabled rereads, is idempotent, and records explicit opt-out", () => {
  const h = harness();
  const service = h.service();
  assert.deepEqual(service.setEnabled(true), { state: "enabled" });
  assert.equal(h.calls.filter(([kind]) => kind === "set").length, 1);
  assert.deepEqual(service.setEnabled(true), { state: "enabled" });
  assert.equal(h.calls.filter(([kind]) => kind === "set").length, 1);
  assert.deepEqual(service.setEnabled(false), { state: "disabled" });
  assert.equal(h.files.has(h.marker), true);
  assert.deepEqual(service.setEnabled(false), { state: "disabled" });
  assert.equal(h.calls.filter(([kind]) => kind === "set").length, 2);
  assert.deepEqual(service.setEnabled(true), { state: "enabled" });
  assert.equal(h.files.has(h.marker), false);
  assert.equal(h.calls.filter(([kind]) => kind === "set").length, 3);
});

test("explicit disable removes an entry already disabled externally", () => {
  const h = harness();
  h.setSettings({
    openAtLogin: true, executableWillLaunchAtLogin: false,
    launchItems: [{ name: startup.LOGIN_ITEM_NAME, path: h.execPath,
      args: [startup.STARTUP_ARG], scope: "user", enabled: false }],
  });
  assert.equal(h.service().setEnabled(false).state, "disabled");
  assert.equal(h.calls.filter(([kind]) => kind === "set").length, 1);
  assert.equal(h.files.has(h.marker), true);
});

test("external rejection and read/write failures never claim success", () => {
  const h = harness();
  const service = h.service();
  h.app.setLoginItemSettings = () => {};
  assert.throws(() => service.setEnabled(true), (error) => error.code === "STARTUP_SETTINGS_FAILED");
  h.failRead(new Error("secret registry detail"));
  assert.equal(service.getState().state, "unavailable");
  assert.doesNotMatch(service.getState().reason, /secret registry detail/);
  assert.throws(() => service.setEnabled(true), (error) => error.code === "STARTUP_SETTINGS_FAILED");
  const other = harness();
  other.failWrite(new Error("registry write failed"));
  assert.throws(() => other.service().setEnabled(true),
    (error) => error.code === "STARTUP_SETTINGS_FAILED");
  assert.equal(other.service().getState().state, "disabled");
});

test("marker write failure restores the previous login item when possible", () => {
  const h = harness();
  const service = h.service();
  service.setEnabled(true);
  h.failMarker(new Error("disk failed"));
  assert.throws(() => service.setEnabled(false), (error) => error.code === "STARTUP_SETTINGS_FAILED");
  assert.equal(service.getState().state, "enabled");
  assert.equal(h.files.has(h.marker), false);
});

test("unsupported environments cannot modify login items", () => {
  const h = harness();
  const service = startup.createStartupService({
    app: h.app, fs: {}, path, platform: "linux", isPackaged: true,
    execPath: h.execPath, appDataPath: path.resolve("test-appdata"),
  });
  assert.equal(service.getState().state, "unavailable");
  assert.throws(() => service.setEnabled(true), (error) => error.code === "STARTUP_SETTINGS_FAILED");
  assert.equal(h.calls.length, 0);
});

test("setEnabled accepts boolean only", () => {
  const service = harness().service();
  assert.throws(() => service.setEnabled("true"), (error) => error.code === "INVALID_INPUT");
});
