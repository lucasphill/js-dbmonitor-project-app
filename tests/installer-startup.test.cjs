const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const scriptPath = path.join(root, "build", "installer.nsh");

test("Windows package includes the NSIS startup customization", () => {
  const manifest = require("../package.json");
  assert.equal(manifest.build.win.target, "nsis");
  assert.equal(manifest.build.nsis.include, "build/installer.nsh");
  assert.ok(fs.existsSync(scriptPath));
});

test("fresh installation registers the installed executable once for the current user", () => {
  const script = fs.readFileSync(scriptPath, "utf8");
  const install = script.match(/!macro customInstall\b([\s\S]*?)!macroend/);
  assert.ok(install, "customInstall must run after the application files are installed");
  assert.match(install[1], /\$APPDATA\\DBMonitor\\startup-disabled/);
  assert.match(install[1], /\$appExe/);
  assert.match(install[1], /--dbmonitor-autostart/);
  assert.match(install[1], /Software\\Microsoft\\Windows\\CurrentVersion\\Run/);
  assert.match(install[1], /WriteRegStr\s+HKCU\s+[^\r\n]+\s+"DBMonitor"/);
  assert.ok(install[1].indexOf("startup-disabled") < install[1].indexOf("WriteRegStr"),
    "opt-out check must precede registration");
  assert.match(install[1], /ReadRegStr\s+\$\d\s+HKCU\s+[^\r\n]+\s+"DBMonitor"/,
    "compare the existing value to avoid resetting Windows approval during an upgrade");
});

test("upgrade and uninstall preserve the user's opt-out", () => {
  const script = fs.readFileSync(scriptPath, "utf8");
  const install = script.match(/!macro customInstall\b([\s\S]*?)!macroend/);
  const uninstall = script.match(/!macro customUnInstall\b([\s\S]*?)!macroend/);
  assert.ok(install);
  assert.ok(uninstall);
  assert.match(install[1], /DeleteRegValue\s+HKCU\s+[^\r\n]+\s+"DBMonitor"/,
    "remove stale registration when the opt-out marker exists");
  assert.match(uninstall[1], /\$\{ifNot\}\s+\$\{isUpdated\}/);
  assert.match(uninstall[1], /DeleteRegValue\s+HKCU\s+[^\r\n]+\s+"DBMonitor"/);
  assert.doesNotMatch(uninstall[1], /Delete\s+[^\r\n]*startup-disabled|RMDir\s+[^\r\n]*DBMonitor/,
    "normal uninstall must leave the marker in preserved AppData");
});
