"use strict";

const CAPABILITY_LABELS = {
  activity: "Sessões e consultas",
  databaseStats: "Atividade por banco",
  io: "Métricas de I/O",
  wal: "Métricas de WAL",
  statements: "Latência agregada de consultas",
  logs: "Eventos de log",
};

const STATE_LABELS = {
  ready: "Dados disponíveis",
  partial: "Dados parciais",
  stale: "Última observação desatualizada",
  unavailable: "Dados indisponíveis",
  insufficient: "Amostras insuficientes",
  empty: "Nenhum registro no período",
  error: "Falha ao obter os dados",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function numberText(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "Indisponível";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(Number(value));
}

function dateText(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZoneName: "short" }).format(new Date(value));
}

function metricCard(metric) {
  const value = metric.value == null ? "Indisponível" : numberText(metric.value);
  const unit = metric.value == null ? "" : ` <small>${escapeHtml(metric.unit || "")}</small>`;
  return `<article class="metric"><h3>${escapeHtml(metric.label)}</h3><p>${value}${unit}</p></article>`;
}

function capabilityItems(capabilities) {
  return Object.entries(CAPABILITY_LABELS).map(([key, label]) => {
    const capability = capabilities?.[key];
    const state = capability?.available ? "Disponível" : "Indisponível";
    const reason = capability?.available ? "" : capability?.reason ? ` — ${capability.reason}` : "";
    return `<li><strong>${escapeHtml(label)}:</strong> ${state}${escapeHtml(reason)}</li>`;
  }).join("");
}

function gapCount(samples, maxGapMs) {
  let gaps = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const delta = Date.parse(samples[index].finished_at) - Date.parse(samples[index - 1].finished_at);
    if (!Number.isFinite(delta) || delta > maxGapMs) gaps += 1;
  }
  return gaps;
}

function buildExecutiveReport({ generatedAt, source, period, overview, history, logCount, collectionIntervalSeconds }) {
  const metrics = overview?.metrics?.data || [];
  const metricValues = Object.fromEntries(metrics.map((metric) => [metric.label, metric.value]));
  const connectionCount = metricValues["Conexões abertas"];
  const activeDatabaseCount = metricValues["Bancos ativos"];
  const databases = overview?.databases?.data || [];
  const sampleRows = history?.instance || [];
  const sampleCount = sampleRows.length;
  const maxGapMs = Math.max(15_000, (collectionIntervalSeconds || 15) * 3000);
  const gaps = gapCount(sampleRows, maxGapMs);
  const maxConnections = overview?.instance?.data?.maxConnections ?? null;
  const connectionUse = connectionCount != null && maxConnections > 0
    ? (Number(connectionCount) / Number(maxConnections)) * 100 : null;
  const collectionState = STATE_LABELS[overview?.instance?.state] || STATE_LABELS.unavailable;
  const caveats = [];
  if (sampleCount === 0) caveats.push("Nenhuma amostra de métricas foi encontrada neste intervalo; conclusões dependentes do histórico não estão disponíveis.");
  else if (sampleCount === 1) caveats.push("Há somente uma amostra no intervalo; variações e tendências não podem ser calculadas.");
  if (gaps > 0) caveats.push(`${gaps} lacuna(s) entre coletas excedem o intervalo esperado; métricas por período podem estar incompletas.`);
  if (overview?.instance?.reason) caveats.push(overview.instance.reason);
  if (overview?.transactionsSeries?.state === "insufficient" && overview.transactionsSeries.reason) {
    caveats.push(overview.transactionsSeries.reason);
  }
  if (!overview?.capabilities?.statements?.available) {
    caveats.push(overview?.capabilities?.statements?.reason || "A latência agregada depende da disponibilidade de pg_stat_statements.");
  }
  if (!overview?.capabilities?.logs?.available) {
    caveats.push(overview?.capabilities?.logs?.reason || "A fonte de logs não está disponível nesta origem.");
  }

  const highlights = [];
  if (connectionCount != null) highlights.push(`${numberText(connectionCount, 0)} conexão(ões) aberta(s) na última amostra disponível.`);
  if (connectionUse != null) highlights.push(`Uso observado de ${numberText(connectionUse, 1)}% do limite de conexões (${numberText(connectionCount, 0)} de ${numberText(maxConnections, 0)}).`);
  if (activeDatabaseCount != null) highlights.push(`${numberText(activeDatabaseCount, 0)} banco(s) com conexões na última amostra disponível.`);
  if (metricValues["Transações/min"] != null) highlights.push(`Taxa observada de ${numberText(metricValues["Transações/min"])} transações por minuto na amostra comparável mais recente.`);
  if (logCount != null) highlights.push(`${numberText(logCount, 0)} evento(s) de log armazenado(s) no intervalo selecionado.`);
  if (!highlights.length) highlights.push("Não há indicadores suficientes para produzir conclusões neste intervalo.");

  const sourceLabel = `${source.profile} — ${source.database}`;
  const metricHtml = metrics.map(metricCard).join("");
  const databaseCount = overview?.databases?.state === "empty" ? 0 : databases.length;
  const caveatItems = caveats.length
    ? caveats.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Não há ressalvas adicionais registradas para as fontes consultadas.</li>";
  const highlightItems = highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Resumo executivo — DBMonitor</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { color: #17202a; font: 10pt/1.45 Arial, Helvetica, sans-serif; margin: 0; }
    header { border-bottom: 2px solid #1d4ed8; margin-bottom: 18px; padding-bottom: 12px; }
    h1 { color: #12336b; font-size: 23pt; margin: 0 0 6px; }
    h2 { border-bottom: 1px solid #d7dee8; color: #12336b; font-size: 13pt; margin: 20px 0 8px; padding-bottom: 4px; }
    h3 { color: #4b5563; font-size: 9pt; font-weight: 600; margin: 0 0 8px; }
    p { margin: 3px 0; }
    .subtitle { color: #4b5563; font-size: 11pt; }
    .metadata { color: #4b5563; display: grid; gap: 4px 14px; grid-template-columns: 1fr 1fr; margin-top: 12px; }
    .state { background: #eef4ff; border-left: 4px solid #1d4ed8; margin: 14px 0; padding: 10px 12px; }
    .metrics { display: grid; gap: 9px; grid-template-columns: 1fr 1fr; }
    .metric { border: 1px solid #d7dee8; border-radius: 5px; break-inside: avoid; padding: 10px; }
    .metric p { color: #111827; font-size: 15pt; font-weight: 700; margin: 0; }
    .metric small { color: #6b7280; font-size: 8pt; font-weight: 400; }
    ul { margin: 5px 0 0; padding-left: 18px; }
    li { margin: 4px 0; }
    .footnote { border-top: 1px solid #d7dee8; color: #6b7280; font-size: 8pt; margin-top: 22px; padding-top: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>Resumo executivo</h1>
    <p class="subtitle">DBMonitor · Observação de uma origem PostgreSQL</p>
    <div class="metadata">
      <p><strong>Origem:</strong> ${escapeHtml(sourceLabel)}</p>
      <p><strong>Gerado em:</strong> ${escapeHtml(dateText(generatedAt))}</p>
      <p><strong>Período:</strong> ${escapeHtml(dateText(period.from))} até ${escapeHtml(dateText(period.to))}</p>
      <p><strong>Amostras:</strong> ${numberText(sampleCount, 0)} · <strong>Bancos observados:</strong> ${numberText(databaseCount, 0)}</p>
    </div>
  </header>

  <div class="state"><strong>Estado da observação:</strong> ${escapeHtml(collectionState)}. Esse estado descreve a disponibilidade e atualidade dos dados coletados; não é uma avaliação causal da instância.</div>

  <section>
    <h2>Principais observações</h2>
    <ul>${highlightItems}</ul>
  </section>

  <section>
    <h2>Indicadores disponíveis</h2>
    <div class="metrics">${metricHtml || "<p>Nenhum indicador disponível no período.</p>"}</div>
  </section>

  <section>
    <h2>Cobertura das fontes</h2>
    <ul>${capabilityItems(overview?.capabilities)}</ul>
  </section>

  <section>
    <h2>Limitações e ressalvas</h2>
    <ul>${caveatItems}</ul>
  </section>

  <p class="footnote">Indicadores representam observações armazenadas pelo DBMonitor. A latência agregada de consultas e os eventos de log dependem de fontes opcionais. Campos indisponíveis não representam zero. Este documento não é auditoria, diagnóstico causal ou recomendação automática.</p>
</body>
</html>`;

  return { html, metricCount: metrics.length, sampleCount, gapCount: gaps };
}

module.exports = { buildExecutiveReport, escapeHtml };
