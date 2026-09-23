const { Client } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

async function main() {
  const client = new Client({ host: process.env.PGHOST || "localhost", port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "postgres", user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD, application_name: "bdash-ui-disposable" });
  client.on("error", () => {});
  await client.connect();
  const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  const port = process.env.BDASH_CDP_PORT || "9222";
  const [target] = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (!pending.has(message.id)) return;
    const callback = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
    else callback.resolve(message.result);
  };
  const call = (method, params) => new Promise((resolve, reject) => {
    const commandId = ++id;
    pending.set(commandId, { resolve, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
  const evalJs = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    await evalJs("Array.from(document.querySelectorAll('aside nav button')).find(b=>b.textContent.trim()==='Conexões').click()");
    await evalJs("Array.from(document.querySelectorAll('main button')).find(b=>b.textContent.trim()==='Atualizar sessões')?.click()");
    await wait(900);
    let row;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      row = await evalJs("Array.from(document.querySelectorAll('main tbody tr')).find(r=>r.textContent.includes('bdash-ui-disposable'))?.outerHTML");
      if (row) break;
      await wait(500);
    }
    if (!row) throw new Error(`Sessão ${pid} não apareceu na tabela`);
    await evalJs(`Array.from(document.querySelectorAll('main tbody tr')).find(r=>r.textContent.includes('bdash-ui-disposable')).querySelector('button').click()`);
    await wait(300);
    const sheet = await evalJs("document.body.innerText.includes('Conexão ' + " + pid + ")");
    if (!sheet) throw new Error("Painel de detalhes não abriu");
    await evalJs("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Revelar detalhes')?.click()");
    await wait(500);
    const revealed = await evalJs("document.body.innerText.includes('Cliente:')");
    if (!revealed) throw new Error("Detalhes não foram revelados");
    await evalJs("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Encerrar conexão')?.click()");
    await wait(300);
    const dialog = await evalJs("document.querySelector('[role=alertdialog]')?.innerText");
    if (!dialog?.includes(String(pid)) || !dialog.includes("Cancelar")) throw new Error("Diálogo de confirmação incompleto");
    const capture = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(__dirname, "..", "design", "qa-termination.png"), Buffer.from(capture.data, "base64"));
    await evalJs("Array.from(document.querySelectorAll('[role=alertdialog] button')).find(b=>b.textContent.trim()==='Cancelar')?.click()");
    await wait(250);
    await client.query("SELECT 1");
    const sheetAfterCancel = await evalJs("document.body.innerText.includes('Conexão ' + " + pid + ")");
    if (!sheetAfterCancel) throw new Error("Cancelar perdeu seleção");
    await evalJs("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Encerrar conexão')?.click()");
    await wait(200);
    const ended = new Promise((resolve) => client.once("end", resolve));
    await evalJs("Array.from(document.querySelectorAll('[role=alertdialog] button')).find(b=>b.textContent.trim()==='Encerrar conexão')?.click()");
    await ended;
    await wait(700);
    const success = await evalJs("document.querySelector('main [role=status]')?.textContent");
    if (!success?.includes("Conexão encerrada")) throw new Error(`Sucesso não exibido: ${success}`);
    process.stdout.write(JSON.stringify({ pid, sheet, revealed, canceledWithoutTermination: true, confirmed: success }));
  } finally {
    socket.close();
    try { await client.end(); } catch {}
  }
}

main().catch((error) => { process.stderr.write(String(error)); process.exitCode = 1; });
