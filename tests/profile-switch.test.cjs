const test = require("node:test");
const assert = require("node:assert/strict");
const { createProfileController } = require("../electron/connection-profiles.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const profiles = new Map([1, 2, 3].map((id) => [id, {
    id, label: `Banco ${id}`, host: "localhost", port: 5432, database: `db${id}`,
    dbUser: "postgres", authMode: "legacy_env", awsRegion: null, awsProfile: null,
    tlsCaMode: null, tlsCaPath: null, archivedAt: null,
  }]));
  let activeId = 1;
  const events = [];
  const waits = new Map();
  const storage = {
    getActiveProfileId: () => activeId,
    getProfile: (id) => profiles.get(id) || null,
    setActiveProfileId: (id) => { activeId = id; events.push(`persist:${id}`); },
    listProfiles: () => [...profiles.values()],
  };
  const db = {
    setActiveProfile: async (profile) => { events.push(`pool:${profile.id}`); },
    closeDatabase: async () => { events.push("close"); },
  };
  const collectorFactory = (profile) => ({
    start: () => events.push(`start:${profile.id}`),
    stopAndWait: async () => {
      events.push(`stop:${profile.id}`);
      if (waits.has(profile.id)) await waits.get(profile.id).promise;
    },
  });
  return { controller: createProfileController({ storage, db, collectorFactory }),
    events, waits, storage };
}

test("profile switch drains the old collector before closing its pool and persisting selection", async () => {
  const { controller, events, waits, storage } = fixture();
  await controller.start();
  const pending = deferred();
  waits.set(1, pending);
  const switching = controller.switchTo(2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(storage.getActiveProfileId(), 1);
  assert.deepEqual(events.slice(-1), ["stop:1"]);
  pending.resolve();
  const result = await switching;
  assert.deepEqual(result, { profile: storage.getProfile(2), generation: 2 });
  assert.deepEqual(events.slice(-4), ["stop:1", "pool:2", "persist:2", "start:2"]);
  await controller.stop();
});

test("rapid switches serialize and stale session action cannot reach another profile", async () => {
  const { controller, events, storage } = fixture();
  await controller.start();
  const old = controller.publicContext();
  const first = controller.switchTo(2);
  const second = controller.switchTo(3);
  await Promise.all([first, second]);
  assert.equal(storage.getActiveProfileId(), 3);
  assert.equal(controller.publicContext().generation, 3);
  assert.deepEqual(events.filter((event) => event.startsWith("pool:")), ["pool:1", "pool:2", "pool:3"]);
  let sqlCalled = false;
  await assert.rejects(controller.guardAdmin(old, () => { sqlCalled = true; }), { code: "PROFILE_CHANGED" });
  assert.equal(sqlCalled, false);
  await controller.stop();
});

test("administrative operation holds the source while a switch waits", async () => {
  const { controller, events } = fixture();
  await controller.start();
  const operation = deferred();
  const running = controller.guardAdmin(controller.publicContext(), async () => {
    events.push("admin:start");
    await operation.promise;
    events.push("admin:end");
  });
  const switching = controller.switchTo(2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.includes("stop:1"), false);
  operation.resolve();
  await running;
  await switching;
  assert.ok(events.indexOf("admin:end") < events.indexOf("stop:1"));
  await controller.stop();
});

test("a new origin does not receive the old origin's session password", async () => {
  const profiles = new Map([[1, {
    id: 1, label: "A", host: "db-a.example.com", port: 5432, database: "postgres",
    dbUser: "postgres", authMode: "session_password", awsRegion: null, awsProfile: null,
    tlsCaMode: null, tlsCaPath: null, archivedAt: null,
  }]]);
  const configured = [];
  const storage = {
    getActiveProfileId: () => 1,
    getProfile: (id) => profiles.get(id),
    updateProfile: (_id, draft) => {
      const profile = { ...draft, id: 2, archivedAt: null };
      profiles.set(2, profile);
      return { profile, archivedProfileId: 1 };
    },
  };
  const db = {
    setActiveProfile: async (profile, password) => configured.push({ host: profile.host, password }),
    closeDatabase: async () => {},
  };
  const controller = createProfileController({ storage, db, collectorFactory: () => ({
    start() {}, async stopAndWait() {},
  }) });
  await controller.start();
  await controller.setPassword(1, "old-password");
  await controller.update(1, { host: "db-b.example.com" }, true);
  assert.deepEqual(configured.at(-1), { host: "db-b.example.com", password: undefined });
  await controller.stop();
});

test("a new process starts the selected session-password profile without the previous password", async () => {
  const profile = {
    id: 7, label: "Produção", host: "db.example.com", port: 5432, database: "postgres",
    dbUser: "monitor", authMode: "session_password", awsRegion: null, awsProfile: null,
    tlsCaMode: null, tlsCaPath: null, archivedAt: null,
  };
  const storage = { getActiveProfileId: () => 7, getProfile: () => profile };
  const configured = [];
  const db = {
    setActiveProfile: async (_profile, password) => { configured.push(password); },
    closeDatabase: async () => {},
  };
  const create = () => createProfileController({ storage, db, collectorFactory: () => ({
    start() {}, async stopAndWait() {},
  }) });
  const priorSession = create();
  await priorSession.start();
  await priorSession.setPassword(7, "secret-from-previous-session");
  await priorSession.stop();

  const afterLogin = create();
  await afterLogin.start();
  assert.equal(configured.at(-1), undefined);
  await afterLogin.stop();
});
