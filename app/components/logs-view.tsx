"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Download, FileText, RefreshCw, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DataBlock, LogEvent, LogFilters, Paginated, Period } from "@/lib/dashboard-types"
import { formatNumber, formatTimestamp } from "@/lib/format"
import type { HistoryPreset } from "@/app/hooks/use-history"
import { PeriodSelector } from "./period-selector"
import { SourceStatus } from "./source-status"
import { ExplanationLabel, type ExplainAction } from "./explanation-info"

const PAGE_SIZE = 50
const WINDOW_MS = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000 } as const
const SEVERITIES = ["Todos", "DEBUG", "INFO", "NOTICE", "WARNING", "ERROR", "FATAL", "PANIC"] as const

type LogCriteria = { severity: string; database: string; user: string; pid: string; search: string }
const EMPTY_CRITERIA: LogCriteria = { severity: "Todos", database: "", user: "", pid: "", search: "" }

function currentPeriod(preset: HistoryPreset, custom: Period): Period {
  if (preset === "custom") return custom
  const to = Date.now()
  return { from: new Date(to - WINDOW_MS[preset]).toISOString(), to: new Date(to).toISOString() }
}

function severityVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  if (["PANIC", "FATAL", "ERROR"].includes(severity)) return "destructive"
  if (severity === "WARNING") return "outline"
  return "secondary"
}

function unavailableReason(block: DataBlock<Paginated<LogEvent>>): string {
  return block.reason || "Configure uma fonte CSV de logs PostgreSQL em Configurações para consultar eventos."
}

/** Self-contained Logs section. The selected period and filters are sent only to the named Electron bridge method. */
export function LogsView({ onConfigure, onExplain }: { onConfigure?: () => void; onExplain: ExplainAction }) {
  const [preset, setPreset] = useState<HistoryPreset>("24h")
  const [custom, setCustom] = useState<Period>(() => currentPeriod("24h", { from: "", to: "" }))
  const [draft, setDraft] = useState<LogCriteria>(EMPTY_CRITERIA)
  const [criteria, setCriteria] = useState<LogCriteria>(EMPTY_CRITERIA)
  const [cursor, setCursor] = useState("0")
  const [block, setBlock] = useState<DataBlock<Paginated<LogEvent>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const sequence = useRef(0)

  const load = useCallback(async (showLoading = false) => {
    const request = ++sequence.current
    if (showLoading) setLoading(true)
    if (!window.bdash) {
      setError("Abra o dashboard pelo Electron para consultar os logs.")
      setLoading(false)
      return
    }
    const pid = criteria.pid ? Number(criteria.pid) : undefined
    const filters: LogFilters = {
      period: currentPeriod(preset, custom),
      severity: criteria.severity === "Todos" ? undefined : criteria.severity,
      database: criteria.database || undefined,
      user: criteria.user || undefined,
      pid,
      search: criteria.search || undefined,
      page: { limit: PAGE_SIZE, cursor },
    }
    try {
      const next = await window.bdash.getLogs(filters)
      if (request !== sequence.current) return
      setBlock(next)
      setError(null)
    } catch (cause) {
      if (request !== sequence.current) return
      const message = cause instanceof Error ? cause.message : "Falha ao consultar logs"
      setError(message)
      setBlock((previous) => previous?.data ? { ...previous, state: "stale", reason: message } : previous)
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [preset, custom, criteria, cursor])

  useEffect(() => {
    void load(true)
    const timer = window.setInterval(() => { void load() }, 15_000)
    return () => { window.clearInterval(timer); sequence.current++ }
  }, [load])

  function choosePeriod(nextPreset: HistoryPreset, nextCustom?: Period) {
    setBlock(null)
    setPreset(nextPreset)
    if (nextCustom) setCustom(nextCustom)
    setCursor("0")
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.pid && (!/^\d+$/.test(draft.pid) || Number(draft.pid) < 1 || Number(draft.pid) > 2_147_483_647)) return
    setBlock(null)
    setCriteria({ ...draft, database: draft.database.trim(), user: draft.user.trim(), search: draft.search.trim() })
    setCursor("0")
  }

  async function exportCurrentFilters() {
    if (!window.bdash) return
    setExporting(true); setExportMessage(null)
    try {
      if (!block?.sourceContext) throw new Error("Atualize os logs antes de exportar.")
      const exported = await window.bdash.exportFiltered({
        dataset: "logs",
        sourceContext: block.sourceContext,
        logFilters: {
          period: currentPeriod(preset, custom),
          severity: criteria.severity === "Todos" ? undefined : criteria.severity,
          database: criteria.database || undefined,
          user: criteria.user || undefined,
          pid: criteria.pid ? Number(criteria.pid) : undefined,
          search: criteria.search || undefined,
          page: { limit: PAGE_SIZE },
        },
      })
      if (!exported.canceled) setExportMessage(`CSV exportado: ${exported.rowCount} eventos.`)
    } catch (cause) { setExportMessage(cause instanceof Error ? cause.message : "Falha ao exportar logs.") }
    finally { setExporting(false) }
  }

  const rows = block?.data?.rows ?? []
  const total = block?.data?.total ?? 0
  const offset = Number(cursor)
  const canShowRows = rows.length > 0 && block?.state !== "unavailable"
  const unavailable = block?.state === "unavailable"
  const pidInvalid = Boolean(draft.pid && (!/^\d+$/.test(draft.pid) || Number(draft.pid) < 1 || Number(draft.pid) > 2_147_483_647))

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Logs</h1>
        <p className="text-sm text-muted-foreground">Eventos estruturados do PostgreSQL preservados no histórico local.</p>
      </div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void load(true)} disabled={loading}>
        <RefreshCw data-icon="inline-start" /> Atualizar
      </Button><Button type="button" variant="outline" onClick={() => void exportCurrentFilters()} disabled={exporting || unavailable}>
        <Download data-icon="inline-start" aria-hidden />Exportar CSV
      </Button></div>
    </div>

    {exportMessage ? <p role="status" className="rounded-lg border bg-card p-3 text-sm">{exportMessage}</p> : null}

    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pesquisar eventos</CardTitle>
        <CardDescription>Filtros aplicados aos eventos ingeridos da fonte CSV configurada.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PeriodSelector preset={preset} customPeriod={custom} onChange={choosePeriod} />
        <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" onSubmit={applyFilters}>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="log-severity">Severidade
            <Select value={draft.severity} onValueChange={(value) => { if (value) setDraft((old) => ({ ...old, severity: value })) }}>
              <SelectTrigger id="log-severity" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{SEVERITIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="log-database">Banco
            <Input id="log-database" value={draft.database} maxLength={128} onChange={(event) => setDraft((old) => ({ ...old, database: event.target.value }))} placeholder="Nome do banco" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="log-user">Usuário
            <Input id="log-user" value={draft.user} maxLength={128} onChange={(event) => setDraft((old) => ({ ...old, user: event.target.value }))} placeholder="Usuário do banco" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="log-pid">PID
            <Input id="log-pid" inputMode="numeric" value={draft.pid} maxLength={10} aria-invalid={pidInvalid} onChange={(event) => setDraft((old) => ({ ...old, pid: event.target.value }))} placeholder="Processo" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2" htmlFor="log-search">Mensagem
            <Input id="log-search" value={draft.search} maxLength={200} onChange={(event) => setDraft((old) => ({ ...old, search: event.target.value }))} placeholder="Buscar no texto do evento" />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-6">
            <Button type="submit" size="sm" disabled={pidInvalid}><Search data-icon="inline-start" /> Aplicar filtros</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setBlock(null); setDraft(EMPTY_CRITERIA); setCriteria(EMPTY_CRITERIA); setCursor("0") }}>Limpar</Button>
            {pidInvalid ? <span className="text-xs text-destructive" role="alert">Informe um PID positivo válido.</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base"><ExplanationLabel label="Eventos registrados" topicId="log-events" onExplain={onExplain} /></CardTitle>
          <CardDescription>{unavailable ? "Fonte de logs indisponível" : `${formatNumber(total)} evento(s) para os filtros atuais`}</CardDescription>
        </div>
        {block ? <SourceStatus block={block} /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && !canShowRows ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {unavailable ? <div className="flex flex-col items-start gap-3 rounded-lg border bg-muted/30 p-5" role="status">
          <FileText aria-hidden="true" className="text-muted-foreground" />
          <p className="text-sm font-medium">Nenhuma fonte de logs está disponível</p>
          <p className="text-sm text-muted-foreground">{unavailableReason(block)}</p>
          {onConfigure ? <Button type="button" variant="outline" size="sm" onClick={onConfigure}>Abrir configurações</Button> : null}
        </div> : canShowRows ? <div className="overflow-x-auto rounded-lg border"><Table>
          <TableCaption>Eventos PostgreSQL paginados. Horários exibidos no fuso local.</TableCaption>
          <TableHeader><TableRow>
            <TableHead className="whitespace-nowrap"><ExplanationLabel label="Horário" topicId="log-event-time" onExplain={onExplain} /></TableHead>
            <TableHead><ExplanationLabel label="Severidade" topicId="log-severity" onExplain={onExplain} /></TableHead>
            <TableHead><ExplanationLabel label="Banco" topicId="log-database" onExplain={onExplain} /></TableHead>
            <TableHead><ExplanationLabel label="Usuário" topicId="log-user" onExplain={onExplain} /></TableHead>
            <TableHead className="text-right"><ExplanationLabel label="PID" topicId="log-pid" onExplain={onExplain} /></TableHead>
            <TableHead><ExplanationLabel label="Mensagem" topicId="log-message" onExplain={onExplain} /></TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((event) => <TableRow key={event.id}>
            <TableCell className="whitespace-nowrap text-xs tabular-nums"><time dateTime={event.eventAt}>{formatTimestamp(event.eventAt)}</time></TableCell>
            <TableCell><Badge variant={severityVariant(event.severity)}>{event.severity}</Badge></TableCell>
            <TableCell>{event.database || "—"}</TableCell>
            <TableCell>{event.user || "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{event.pid == null ? "—" : formatNumber(event.pid)}</TableCell>
            <TableCell className="max-w-lg break-words text-sm">{event.message}</TableCell>
          </TableRow>)}</TableBody>
        </Table></div> : <div className="grid min-h-40 place-items-center rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground" role="status">
          {loading ? "Carregando eventos…" : block?.reason || "Nenhum evento encontrado no período e filtros selecionados."}
        </div>}
        {!unavailable && block?.data ? <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{total ? `${formatNumber(offset + 1)}–${formatNumber(offset + rows.length)} de ${formatNumber(total)}` : "0 eventos"}</span>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={offset === 0 || loading} onClick={() => { setBlock(null); setCursor(String(Math.max(0, offset - PAGE_SIZE))) }}>Anterior</Button>
            <Button type="button" size="sm" variant="outline" disabled={!block.data.nextCursor || loading} onClick={() => { setBlock(null); setCursor(block.data?.nextCursor || "0") }}>Próxima</Button>
          </div>
        </div> : null}
      </CardContent>
    </Card>
  </div>
}
