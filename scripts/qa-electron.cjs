const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const port = process.env.BDASH_CDP_PORT || "9222";
  const [target] = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  };
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const commandId = ++id;
      pending.set(commandId, { resolve, reject });
      socket.send(JSON.stringify({ id: commandId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  const summary = {};
  for (const section of ["Visão geral", "Conexões", "Desempenho", "Bancos", "Logs", "Configurações"]) {
    await evaluate(`Array.from(document.querySelectorAll('aside nav button')).find(b => b.textContent.trim() === ${JSON.stringify(section)})?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 700));
    summary[section] = await evaluate("({heading:document.querySelector('main h1')?.textContent, text:document.querySelector('main')?.innerText.slice(0,1600), charts:document.querySelectorAll('main svg.recharts-surface').length, tables:document.querySelectorAll('main table').length, alerts:document.querySelectorAll('[role=alert]').length})");
    const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const output = path.join(__dirname, "..", "design", `qa-${section.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replaceAll(" ", "-")}.png`);
    fs.writeFileSync(output, Buffer.from(screenshot.data, "base64"));
  }
  process.stdout.write(JSON.stringify(summary, null, 2));
  socket.close();
}

main().catch((error) => { process.stderr.write(String(error)); process.exitCode = 1; });
