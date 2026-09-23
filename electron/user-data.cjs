const fs = require("node:fs");
const path = require("node:path");

function resolveUserDataPath({ appDataPath, defaultPath, overridePath, legacyOverridePath,
  existsSync = fs.existsSync }) {
  const override = overridePath || legacyOverridePath;
  if (override) {
    if (!path.isAbsolute(override)) throw new Error("User data directory must be absolute");
    return override;
  }

  if (existsSync(path.join(defaultPath, "bdash.sqlite"))) return defaultPath;
  for (const previousName of ["bdash-electron", "BDash"]) {
    const previousPath = path.join(appDataPath, previousName);
    if (existsSync(path.join(previousPath, "bdash.sqlite"))) return previousPath;
  }
  return defaultPath;
}

module.exports = { resolveUserDataPath };
