"use client"

import { useState } from "react"
import { Clock3, Download, RefreshCw, Users, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { OperationResult, SessionDetails, SessionFilters, SessionRow, SourceContext } from "@/lib/dashboard-types"
import { formatDuration, formatNumber, formatTimestamp } from "@/lib/format"
import { useSessions } from "../hooks/use-sessions"
import { SessionsChart } from "./sessions-chart"
import { SessionsTable } from "./sessions-table"
import { SourceStatus } from "./source-status"
import { TerminateSessionDialog } from "./terminate-session-dialog"
import { ExplanationLabel, type ExplainAction } from "./explanation-info"

const initialFilters: SessionFilters = { sortBy: "duration", sortDirection: "desc", page: { limit: 25 } }

export function ConnectionsView({ onExplain, source }: { onExplain: ExplainAction; source?: SourceContext | null }) {
  const [filters, setFilters] = useState<SessionFilters>(initialFilters)
  const [previousCursors, setPreviousCursors] = useState<(string | undefined)[]>([])
  const [selected, setSelected] = useState<SessionRow | null>(null)
  const [details, setDetails] = useState<SessionDetails | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [operation, setOperation] = useState<OperationResult | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const { result, loading, error, refresh, reveal, terminate } = useSessions(filters, source)
  const rows = result?.sessions.data?.rows ?? []
  const active = result?.byState.active ?? 0
  const idle = result?.byState.idle ?? 0
  const waitingOnPage = rows.filter((row) => row.state !== "finished" && row.waitEvent != null).length

  function changeFilters(next: Partial<SessionFilters>) {
    setPreviousCursors([])
    setFilters((current) => ({ ...current, ...next, page: { limit: current.page.limit } }))
  }

  function sortBy(field: NonNullable<SessionFilters["sortBy"]>) {
    setPreviousCursors([])
    setFilters((current) => ({ ...current, sortBy: field, sortDirection: current.sortBy === field && current.sortDirection === "asc" ? "desc" : "asc", page: { limit: current.page.limit } }))
  }

  function nextPage() {
    const cursor = result?.sessions.data?.nextCursor
    if (!cursor) return
    setPreviousCursors((current) => [...current, filters.page.cursor])
    setFilters((current) => ({ ...current, page: { ...current.page, cursor } }))
  }

  function previousPage() {
    if (!previousCursors.length) return
    const cursor = previousCursors[previousCursors.length - 1]
    setPreviousCursors((current) => current.slice(0, -1))
    setFilters((current) => ({ ...current, page: { ...current.page, cursor } }))
  }

  function select(row: SessionRow) {
    if (!result?.sourceContext) { setOperation({ status: "failed", message: "A origem desta sessão não foi identificada. Atualize a lista antes de executar ações.", auditedAt: new Date().toISOString() }); return }
    setSelected({ ...row, profileId: result?.sourceContext?.profileId, generation: result?.sourceContext?.generation })
    setDetails(null)
    setDetailError(null)
    setSheetOpen(true)
  }

  async function revealDetails() {
    if (!selected || selected.state === "finished") return
    setDetailLoading(true)
    setDetailError(null)
    try {
      const next = await reveal({ pid: selected.pid, backendStart: selected.backendStart, profileId: selected.profileId, generation: selected.generation })
      setDetails(next)
      if (next.state !== "ready") setDetailError(next.reason || "Os detalhes não estão mais disponíveis.")
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Não foi possível revelar os detalhes.")
    } finally {
      setDetailLoading(false)
    }
  }

  async function confirmTermination(row: SessionRow): Promise<OperationResult> {
    if (row.state === "finished") return { status: "not_found", message: "Esta conexão já foi finalizada.", auditedAt: new Date().toISOString() }
    const next = await terminate({ pid: row.pid, backendStart: row.backendStart, profileId: row.profileId, generation: row.generation })
    setOperation(next)
    if (next.status === "success") { setSheetOpen(false); setSelected(null); setDetails(null) }
    return next
  }

  async function exportCurrentFilters() {
    if (!window.bdash) return
    setExporting(true); setExportMessage(null)
    try {
      if (!result?.sourceContext) throw new Error("Atualize as sessões antes de exportar.")
      const exported = await window.bdash.exportFiltered({ dataset: "sessions", sourceContext: result.sourceContext, sessionFilters: { ...filters, page: { limit: 200 } } })
      if (!exported.canceled) setExportMessage(`CSV exportado: ${exported.rowCount} sessões.`)
    } catch (cause) { setExportMessage(cause instanceof Error ? cause.message : "Falha ao exportar conexões.") }
    finally { setExporting(false) }
  }

  return <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold tracking-tight">Conexões</h1><p className="mt-1 text-sm text-muted-foreground">Sessões atuais e conexões finalizadas observadas nesta execução.</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void refresh(true)} disabled={loading}><RefreshCw data-icon="inline-start" aria-hidden />Atualizar sessões</Button><Button type="button" variant="outline" size="sm" onClick={() => void exportCurrentFilters()} disabled={exporting}><Download data-icon="inline-start" aria-hidden />Exportar CSV</Button></div>
    </div>
    {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-card p-3 text-sm text-destructive">{error}</p> : null}
    {operation ? <p role="status" className="rounded-lg border bg-card p-3 text-sm">{operation.message}</p> : null}
    {exportMessage ? <p role="status" className="rounded-lg border bg-card p-3 text-sm">{exportMessage}</p> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo de conexões">
      {([
        { label: "Na lista", value: result?.sessions.data?.total, icon: Users, topicId: "session-total" },
        { label: "Ativas", value: result ? active : null, icon: Users, topicId: "session-active" },
        { label: "Ociosas", value: result ? idle : null, icon: Clock3, topicId: "session-idle" },
        { label: "Em espera nesta página", value: result ? waitingOnPage : null, icon: Clock3, topicId: "session-waiting-page" },
      ] as const).map(({ label, value, icon: Icon, topicId }) => <Card key={label} size="sm"><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Icon className="size-4 text-primary" aria-hidden /><ExplanationLabel label={label} topicId={topicId} onExplain={onExplain} /></CardTitle></CardHeader><CardContent><strong className="text-2xl font-bold tabular-nums">{formatNumber(value)}</strong></CardContent></Card>)}
    </section>
    {result ? <SessionsChart result={result} onExplain={onExplain} /> : null}
    <SessionsTable result={result} filters={filters} onFilter={changeFilters} onSort={sortBy} onPrevious={previousPage} onNext={nextPage} canPrevious={previousCursors.length > 0} selected={selected} onSelect={select} onExplain={onExplain} />
    {result ? <SourceStatus block={result.sessions} /> : null}

    <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) { setSelected(null); setDetails(null); setDetailError(null) } }}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Conexão {selected?.pid}</SheetTitle><SheetDescription>{selected?.state === "finished" ? "Últimos dados observados antes da finalização." : "Dados da sessão selecionada no momento da coleta."}</SheetDescription></SheetHeader>
        {selected ? <div className="flex flex-1 flex-col gap-5 px-4 pb-4">
          <div className="flex gap-2"><Badge variant={selected.state === "active" ? "default" : "secondary"}>{selected.state === "finished" ? "Finalizado" : selected.state || "Estado desconhecido"}</Badge>{selected.state !== "finished" && selected.waitEvent ? <Badge variant="secondary">Em espera: {selected.waitEvent}</Badge> : null}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground"><ExplanationLabel label="PID" topicId="session-pid" onExplain={onExplain} /></dt><dd>{selected.pid}</dd>
            <dt className="text-muted-foreground"><ExplanationLabel label="Banco" topicId="session-database" onExplain={onExplain} /></dt><dd>{selected.database || "—"}</dd>
            <dt className="text-muted-foreground"><ExplanationLabel label="Usuário" topicId="session-user" onExplain={onExplain} /></dt><dd>{selected.user || "—"}</dd>
            <dt className="text-muted-foreground"><ExplanationLabel label="Aplicação" topicId="session-application" onExplain={onExplain} /></dt><dd>{selected.application || "—"}</dd>
            <dt className="text-muted-foreground"><ExplanationLabel label="Início da conexão" topicId="session-start" onExplain={onExplain} /></dt><dd>{formatTimestamp(selected.backendStart)}</dd>
            <dt className="text-muted-foreground"><ExplanationLabel label="Finalizada em" topicId="session-finished" onExplain={onExplain} /></dt><dd>{selected.finishedAt ? formatTimestamp(selected.finishedAt) : "—"}</dd>
            {selected.state === "finished" ? <><dt className="text-muted-foreground">Dados da sessão</dt><dd>Última observação válida</dd></> : null}
            {selected.state !== "finished" ? <><dt className="text-muted-foreground"><ExplanationLabel label="Início da consulta" topicId="session-query-start" onExplain={onExplain} /></dt><dd>{formatTimestamp(selected.queryStartedAt)}</dd><dt className="text-muted-foreground"><ExplanationLabel label="Duração ativa" topicId="active-query-duration" onExplain={onExplain} /></dt><dd>{formatDuration(selected.activeDurationMs)}</dd><dt className="text-muted-foreground"><ExplanationLabel label="Espera" topicId="session-wait" onExplain={onExplain} /></dt><dd>{selected.waitEventType && selected.waitEvent ? `${selected.waitEventType}: ${selected.waitEvent}` : "—"}</dd></> : null}
          </dl>
          {selected.state !== "finished" ? <div className="flex flex-col gap-2 rounded-lg border p-3"><strong className="text-sm"><ExplanationLabel label="Consulta e cliente" topicId="session-sensitive-details" onExplain={onExplain} /></strong>
            {details?.state === "ready" ? <><p className="break-all rounded bg-muted p-2 font-mono text-xs">{details.query || "Consulta não disponível"}</p><p className="text-xs text-muted-foreground">Cliente: {details.clientAddress || "Não disponível"}</p></> : <p className="text-xs text-muted-foreground">Ocultos por padrão. Revele apenas quando necessário para investigar esta sessão.</p>}
            {detailError ? <p role="alert" className="text-xs text-destructive">{detailError}</p> : null}
            {details?.state !== "ready" ? <Button type="button" variant="outline" size="sm" onClick={() => void revealDetails()} disabled={detailLoading}>{detailLoading ? "Consultando…" : "Revelar detalhes"}</Button> : null}
          </div> : null}
          {selected.state !== "finished" ? <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={selected.backendType !== "client backend"}><X data-icon="inline-start" aria-hidden />Encerrar conexão</Button> : null}
          {selected.state !== "finished" && selected.backendType !== "client backend" ? <p className="text-xs text-muted-foreground">Somente conexões cliente podem ser encerradas.</p> : null}
        </div> : null}
      </SheetContent>
    </Sheet>
    <TerminateSessionDialog session={selected?.state === "finished" ? null : selected} open={confirmOpen && selected?.state !== "finished"} onOpenChange={setConfirmOpen} onConfirm={confirmTermination} />
  </>
}
