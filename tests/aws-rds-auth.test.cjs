const test = require("node:test");
const assert = require("node:assert/strict");
const { execAwsToken } = require("../electron/aws-rds-auth.cjs");

const profile = { host: "dbmonitor-test.invalid.sa-east-1.rds.amazonaws.com", port: 5432,
  awsRegion: "sa-east-1", dbUser: "monitor_user" };

test("AWS CLI receives fixed arguments and no shell", async () => {
  let seen;
  const token = await execAwsToken(profile, { execFileImpl: (file, args, options, callback) => {
    seen = { file, args, options };
    callback(null, "temporary-token\n", "");
  } });
  assert.equal(token, "temporary-token");
  assert.equal(seen.file, "aws.exe");
  assert.deepEqual(seen.args, ["rds", "generate-db-auth-token", "--hostname", profile.host,
    "--port", "5432", "--region", "sa-east-1", "--username", "monitor_user"]);
  assert.equal(seen.options.shell, false);
  assert.equal(seen.options.windowsHide, true);
  assert.ok(seen.options.timeout > 0 && seen.options.maxBuffer < 200_000);
  assert.equal(seen.options.env.AWS_CLI_AUTO_PROMPT, "off");
});

test("named AWS profile is explicit, with no fallback", async () => {
  let calls = 0;
  await assert.rejects(execAwsToken({ ...profile, awsProfile: "production" }, {
    execFileImpl: (_file, args, _options, callback) => {
      calls++;
      assert.deepEqual(args.slice(-2), ["--profile", "production"]);
      callback(Object.assign(new Error("AWS error"), { code: 255 }), "", "The config profile (production) could not be found");
    },
  }), (error) => error.code === "AWS_IDENTITY_UNAVAILABLE" &&
    !error.message.includes("production"));
  assert.equal(calls, 1);
});

test("timeouts and secret-bearing errors are sanitized", async () => {
  for (const [failure, stderr, expected] of [
    [Object.assign(new Error("secret-token"), { code: "ENOENT" }), "", "AWS_CLI_NOT_FOUND"],
    [Object.assign(new Error("secret-token"), { killed: true }), "", "CONNECTION_TIMEOUT"],
    [new Error("secret-token"), "signed-secret-token", "TOKEN_GENERATION_FAILED"],
  ]) {
    await assert.rejects(execAwsToken(profile, { execFileImpl: (_f, _a, _o, callback) =>
      callback(failure, "secret-token", stderr) }), (error) => {
      assert.equal(error.code, expected);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    });
  }
});

test("invalid endpoint cannot become CLI arguments", async () => {
  let invoked = false;
  assert.throws(() => execAwsToken({ ...profile, host: "x; whoami" }, {
    execFileImpl: () => { invoked = true; },
  }), { code: "INVALID_INPUT" });
  assert.equal(invoked, false);
});
