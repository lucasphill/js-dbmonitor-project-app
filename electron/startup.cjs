const fs = require("node:fs");
const path = require("node:path");

const STARTUP_ARG = "--dbmonitor-autostart";
const LOGIN_ITEM_NAME = "DBMonitor";
const OPT_OUT_FILE = "startup-disabled";
const SETTINGS_ERROR = "STARTUP_SETTINGS_FAILED";

function loginItemOptions(execPath) {
  return { path: execPath, args: [STARTUP_ARG] };
}

function isAutomaticLaunch({ platform, isPackaged, argv }) {
  return platform === "win32" && isPackaged === true &&
    Array.isArray(argv) && argv.includes(STARTUP_ARG);
}

function initialPresentation(input) {
  return isAutomaticLaunch(input) ? "minimized" : "normal";
}

function secondInstanceAction(input) {
  return isAutomaticLaunch(input) ? "preserve" : "show";
}

function createWindowActivationCoordinator(initialInput) {
  const firstPresentation = initialPresentation(initialInput);
  let manualRequested = false;
  let pendingShow = false;
  return {
    presentation() {
      return manualRequested ? "normal" : firstPresentation;
    },
    onSecondInstance(input) {
      const action = secondInstanceAction(input);
      if (action === "show") {
        manualRequested = true;
        pendingShow = true;
      }
      return action;
    },
    applyPending(window) {
      if (!pendingShow || !window) return false;
      pendingShow = false;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      return true;
    },
  };
}

function startupError(message) {
  const error = new Error(message);
  error.code = SETTINGS_ERROR;
  return error;
}

function isMatchingItem(item, execPath) {
  if (!item || typeof item !== "object") return false;
  if (item.name !== LOGIN_ITEM_NAME) return false;
  if (typeof item.path !== "string" ||
    item.path.toLowerCase() !== execPath.toLowerCase()) return false;
  // Electron 44 can report args: [] for a Run value that contains our argument.
  // The installed executable and the dedicated Run value name identify the item.
  return true;
}

function effectiveState(settings, execPath) {
  if (!settings || typeof settings !== "object") {
    throw startupError("Não foi possível consultar o início automático no Windows.");
  }
  const matching = Array.isArray(settings.launchItems)
    ? settings.launchItems.find((item) => isMatchingItem(item, execPath))
    : undefined;
  const registered = settings.openAtLogin === true || Boolean(matching);
  const externallyDisabled = registered &&
    (settings.executableWillLaunchAtLogin === false || matching?.enabled === false);
  if (externallyDisabled) {
    return {
      state: "disabled",
      reason: "O Windows desativou o início automático. Ative novamente no DBMonitor para tentar restaurá-lo.",
    };
  }
  if (registered &&
    settings.executableWillLaunchAtLogin === true && matching?.enabled !== false) {
    return { state: "enabled" };
  }
  return { state: "disabled" };
}

function createStartupService({
  app,
  fs: fileSystem = fs,
  path: pathModule = path,
  platform = process.platform,
  isPackaged = app?.isPackaged,
  execPath = process.execPath,
  appDataPath = app?.getPath?.("appData"),
} = {}) {
  const supported = platform === "win32" && isPackaged === true;
  const itemOptions = loginItemOptions(execPath);
  const markerPath = pathModule.join(appDataPath || "", LOGIN_ITEM_NAME, OPT_OUT_FILE);

  function readSettings() {
    return app.getLoginItemSettings(itemOptions);
  }

  function readState() {
    return effectiveState(readSettings(), execPath);
  }

  function getState() {
    if (!supported) {
      return { state: "unavailable",
        reason: "O início automático está disponível apenas no DBMonitor instalado no Windows." };
    }
    try {
      return readState();
    } catch {
      return { state: "unavailable",
        reason: "Não foi possível consultar o início automático no Windows. Tente novamente." };
    }
  }

  function setMarker(disabled) {
    const exists = fileSystem.existsSync(markerPath);
    if (disabled && !exists) {
      fileSystem.mkdirSync(pathModule.dirname(markerPath), { recursive: true });
      fileSystem.writeFileSync(markerPath, "disabled\n", { flag: "wx" });
    } else if (!disabled && exists) {
      fileSystem.unlinkSync(markerPath);
    }
  }

  function setEnabled(enabled) {
    if (typeof enabled !== "boolean") {
      const error = new TypeError("A opção de início automático deve ser verdadeira ou falsa.");
      error.code = "INVALID_INPUT";
      throw error;
    }
    if (!supported) {
      throw startupError("O início automático está disponível apenas no DBMonitor instalado no Windows.");
    }
    let previous;
    let previousSettings;
    try {
      previousSettings = readSettings();
      previous = effectiveState(previousSettings, execPath);
    } catch {
      throw startupError("Não foi possível consultar o início automático no Windows. Tente novamente.");
    }
    const desired = enabled ? "enabled" : "disabled";
    const registered = previousSettings.openAtLogin === true ||
      (Array.isArray(previousSettings.launchItems) &&
        previousSettings.launchItems.some((item) => isMatchingItem(item, execPath)));
    const changed = previous.state !== desired || (!enabled && registered);
    try {
      if (changed) {
        app.setLoginItemSettings({
          ...itemOptions,
          name: LOGIN_ITEM_NAME,
          openAtLogin: enabled,
        });
      }
      const confirmed = readState();
      if (confirmed.state !== desired) {
        throw startupError("O Windows não confirmou a alteração do início automático. Tente novamente.");
      }
      setMarker(!enabled);
      return confirmed;
    } catch {
      // If the opt-out marker cannot be saved, restore the previous login state
      // where possible rather than silently losing the user's reinstall choice.
      if (changed) {
        try {
          const current = readState();
          if (current.state === desired) {
            app.setLoginItemSettings({
              ...itemOptions, name: LOGIN_ITEM_NAME,
              openAtLogin: previous.state === "enabled",
            });
          }
        } catch { /* The caller still receives a failure. */ }
      }
      throw startupError("Não foi possível alterar o início automático no Windows. Tente novamente.");
    }
  }

  return { getState, setEnabled };
}

module.exports = {
  STARTUP_ARG, LOGIN_ITEM_NAME, OPT_OUT_FILE,
  loginItemOptions, isAutomaticLaunch, initialPresentation,
  secondInstanceAction, createWindowActivationCoordinator,
  effectiveState, createStartupService,
};
