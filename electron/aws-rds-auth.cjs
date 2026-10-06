const { execFile } = require("node:child_process");

const CLI_TIMEOUT_MS = 10_000;
const CLI_MAX_BUFFER = 128 * 1024;

class ConnectionError extends Error {
  constructor(code, stage, message) {
    super(message);
    this.name = "ConnectionError";
    this.code = code;
    this.stage = stage;
  }
}

function validIamProfile(profile) {
  const host = profile?.host;
  const port = Number(profile?.port);
  const region = profile?.awsRegion;
  const user = profile?.dbUser;
  const awsProfile = profile?.awsProfile;
  if (typeof host !== "string" || host.length > 253 ||
      !/^[a-z0-9][a-z0-9.-]*\.rds\.amazonaws\.com(?:\.cn)?$/i.test(host) ||
      host.includes("..") || !host.includes(`.${region}.rds.amazonaws.com`) ||
      !Number.isInteger(port) || port < 1 || port > 65535 ||
      typeof region !== "string" || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region) ||
      typeof user !== "string" || user.length < 1 || user.length > 63 || /[\x00-\x1f]/.test(user) ||
      (awsProfile != null && (typeof awsProfile !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$/.test(awsProfile)))) {
    throw new ConnectionError("INVALID_INPUT", "aws_identity", "Confira endpoint RDS, porta, região, usuário e perfil AWS.");
  }
  return { host, port, region, user, awsProfile: awsProfile || null };
}

function cliError(error, stderr = "") {
  if (error?.code === "ENOENT") {
    return new ConnectionError("AWS_CLI_NOT_FOUND", "aws_identity", "AWS CLI não encontrada. Instale-a ou confira o PATH do aplicativo.");
  }
  if (error?.killed || error?.signal === "SIGTERM" || error?.code === "ETIMEDOUT") {
    return new ConnectionError("CONNECTION_TIMEOUT", "aws_identity", "AWS CLI demorou para responder. Confira a identidade AWS local e tente novamente.");
  }
  const diagnostic = `${stderr} ${error?.message || ""}`;
  if (/profile .* could not be found|the config profile|sso|expiredtoken|unable to locate credentials|partial credentials|accessdenied|invalidclienttokenid|token has expired|no credentials/i.test(diagnostic)) {
    return new ConnectionError("AWS_IDENTITY_UNAVAILABLE", "aws_identity", "Identidade AWS indisponível. Confira o perfil no terminal e, se necessário, execute aws sso login.");
  }
  return new ConnectionError("TOKEN_GENERATION_FAILED", "token", "Não foi possível gerar a autorização temporária RDS. Confira endpoint, região e identidade AWS.");
}

function isRdsIamProfile(profile) {
  return profile?.authMode === 'rds_iam' || profile?.authMode === 'rds_iam_ssm';
}

function execAwsToken(profile, { execFileImpl = execFile, platform = process.platform,
  executable = platform === 'win32' ? 'aws.exe' : 'aws', signal, deadline } = {}) {
  const { host, port, region, user, awsProfile } = validIamProfile(profile);
  const args = ["rds", "generate-db-auth-token", "--hostname", host,
    "--port", String(port), "--region", region, "--username", user];
  if (awsProfile) args.push("--profile", awsProfile);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ConnectionError('CONNECTION_CANCELED', 'token', 'Conexão cancelada.'));
    const remaining = deadline == null ? CLI_TIMEOUT_MS : deadline - Date.now();
    if (remaining <= 0) return reject(new ConnectionError('CONNECTION_TIMEOUT', 'token', 'Tempo limite da conexão excedido.'));
    const options = {
      shell: false, windowsHide: true, timeout: Math.max(1, Math.min(CLI_TIMEOUT_MS, remaining)),
      maxBuffer: CLI_MAX_BUFFER,
      encoding: "utf8",
      env: { ...process.env, AWS_PAGER: "", AWS_CLI_AUTO_PROMPT: "off" },
    };
    let child; let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => { if (settled) return; child?.kill?.(); finish(new ConnectionError('CONNECTION_CANCELED', 'token', 'Conexão cancelada.')); };
    const timer = setTimeout(() => { child?.kill?.(); finish(new ConnectionError('CONNECTION_TIMEOUT', 'token', 'Tempo limite da conexão excedido.')); }, options.timeout);
    signal?.addEventListener('abort', abort, { once: true });
    try { child = execFileImpl(executable, args, options, (error, stdout, stderr) => {
      if (signal?.aborted) return abort();
      if (deadline != null && Date.now() >= deadline) return finish(new ConnectionError('CONNECTION_TIMEOUT', 'token', 'Tempo limite da conexão excedido.'));
      if (error) return finish(cliError(error, stderr));
      const token = typeof stdout === "string" ? stdout.trim() : "";
      if (!token || token.length > CLI_MAX_BUFFER || /[\r\n\x00]/.test(token)) {
        return finish(new ConnectionError("TOKEN_GENERATION_FAILED", "token", "A AWS CLI não retornou uma autorização temporária válida."));
      }
      finish(null, token);
    }); } catch (error) { finish(cliError(error)); }
  });
}

module.exports = { ConnectionError, validIamProfile, execAwsToken, cliError, isRdsIamProfile };
