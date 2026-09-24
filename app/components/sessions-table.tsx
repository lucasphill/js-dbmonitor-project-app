"use client"

import { useState } from "react"
import { ArrowDownUp, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { SessionFilters, SessionRow, SessionsResult } from "@/lib/dashboard-types"
import { formatDuration, formatNumber, formatTimestamp } from "@/lib/format"
import type { ExplanationTopicId } from "@/lib/explanations"
import { ExplanationInfo, ExplanationLabel, type ExplainAction } from "./explanation-info"

const states = [
  { value: "all", label: "Todos os estados" },
  { value: "active", label: "Ativa" },
  { value: "idle", label: "Ociosa" },
  { value: "idle in transaction", label: "Em transação" },
  { value: "idle in transaction (aborted)", label: "Transação abortada" },
]

function stateLabel(state: SessionRow["state"]): string {
  return states.find((item) => item.value === state)?.label || state || "Não informado"
}

export function SessionsTable({
  result,
  filters,
  onFilter,
  onSort,
  onPrevious,
  onNext,
  canPrevious,
  selected,
  onSelect,
  onExplain,
}: {
  result: SessionsResult | null
  filters: SessionFilters
  onFilter: (filter: Partial<SessionFilters>) => void
  onSort: (field: NonNullable<SessionFilters["sortBy"]>) => void
  onPrevious: () => void
  onNext: () => void
  canPrevious: boolean
  selected: SessionRow | null
  onSelect: (row: SessionRow) => void
  onExplain: ExplainAction
}) {
  const [search, setSearch] = useState(filters.search ?? "")
  const [database, setDatabase] = useState(filters.database ?? "")
  const [user, setUser] = useState(filters.user ?? "")
  const [application, setApplication] = useState(filters.application ?? "")
  const [state, setState] = useState(filters.state ?? "all")
  const rows = result?.sessions.data?.rows ?? []

  const sortHeader = (label: string, field: NonNullable<SessionFilters["sortBy"]>, topicId: ExplanationTopicId) => <span className="inline-flex items-center gap-1 whitespace-nowrap"><Button type="button" variant="ghost" size="sm" onClick={() => onSort(field)} aria-label={`Ordenar por ${label}`} className="-ml-2"><ArrowDownUp data-icon="inline-start" aria-hidden />{label}</Button><ExplanationInfo label={label} topicId={topicId} onExplain={onExplain} /></span>

  return <Card className="min-w-0">
    <CardHeader><CardTitle className="text-base font-semibold"><ExplanationLabel label="Sessões abertas" topicId="session-total" onExplain={onExplain} /></CardTitle><p className="text-xs text-muted-foreground">Consulta e endereço do cliente ficam ocultos até revelação explícita.</p></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <form onSubmit={(event) => { event.preventDefault(); onFilter({ search: search.trim(), database: database.trim(), user: user.trim(), application: application.trim(), state: state === "all" ? undefined : state }) }} className="flex flex-wrap items-end gap-2" aria-label="Filtros de conexões">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">Busca<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PID, usuário, banco ou aplicação" /></label>
        <label className="flex w-32 flex-col gap-1 text-xs font-medium text-muted-foreground">Banco<Input value={database} onChange={(event) => setDatabase(event.target.value)} placeholder="Todos" /></label>
        <label className="flex w-32 flex-col gap-1 text-xs font-medium text-muted-foreground">Usuário<Input value={user} onChange={(event) => setUser(event.target.value)} placeholder="Todos" /></label>
        <label className="flex w-32 flex-col gap-1 text-xs font-medium text-muted-foreground">Aplicação<Input value={application} onChange={(event) => setApplication(event.target.value)} placeholder="Todas" /></label>
        <div className="flex w-44 flex-col gap-1 text-xs font-medium text-muted-foreground"><span>Estado</span><Select value={state} onValueChange={(value) => setState(String(value))} items={states}><SelectTrigger className="w-full"><SelectValue placeholder="Todos os estados" /></SelectTrigger><SelectContent><SelectGroup>{states.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <Button type="submit" size="sm"><Search data-icon="inline-start" aria-hidden />Filtrar</Button>
      </form>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{sortHeader("PID", "pid", "session-pid")}</TableHead>
            <TableHead>{sortHeader("Banco", "database", "session-database")}</TableHead>
            <TableHead>{sortHeader("Usuário", "user", "session-user")}</TableHead>
            <TableHead><ExplanationLabel label="Aplicação" topicId="session-application" onExplain={onExplain} /></TableHead>
            <TableHead>{sortHeader("Estado", "state", "session-state")}</TableHead>
            <TableHead>{sortHeader("Conectada em", "startedAt", "session-start")}</TableHead>
            <TableHead><ExplanationLabel label="Consulta ativa" topicId="session-query" onExplain={onExplain} /></TableHead>
            <TableHead className="text-right">{sortHeader("Duração", "duration", "active-query-duration")}</TableHead>
            <TableHead><ExplanationLabel label="Espera" topicId="session-wait" onExplain={onExplain} /></TableHead>
            <TableHead>Ação</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((row) => <TableRow key={`${row.pid}:${row.backendStart}`} data-state={selected?.pid === row.pid && selected.backendStart === row.backendStart ? "selected" : undefined}>
              <TableCell className="tabular-nums">{formatNumber(row.pid)}</TableCell>
              <TableCell>{row.database || "—"}</TableCell><TableCell>{row.user || "—"}</TableCell><TableCell>{row.application || "—"}</TableCell>
              <TableCell><Badge variant={row.state === "active" ? "default" : "secondary"}>{stateLabel(row.state)}</Badge></TableCell>
              <TableCell className="whitespace-nowrap text-xs tabular-nums">{formatTimestamp(row.backendStart)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{row.state === "active" ? "Oculta por padrão" : "—"}</TableCell>
              <TableCell className="text-right tabular-nums" title={row.queryStartedAt ? `Início: ${formatTimestamp(row.queryStartedAt)}` : undefined}>{formatDuration(row.activeDurationMs)}</TableCell>
              <TableCell>{row.waitEvent ? <Badge variant="secondary">{row.waitEventType}: {row.waitEvent}</Badge> : "—"}</TableCell>
              <TableCell><Button type="button" variant="outline" size="sm" onClick={() => onSelect(row)}>Detalhes</Button></TableCell>
            </TableRow>)}
            {rows.length === 0 ? <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">{result?.sessions.reason || "Nenhuma sessão corresponde aos filtros."}</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>Mostrando {rows.length} de {formatNumber(result?.sessions.data?.total ?? null)} conexões</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={!canPrevious}>Anterior</Button><Button type="button" variant="outline" size="sm" onClick={onNext} disabled={!result?.sessions.data?.nextCursor}>Próxima</Button></div></div>
    </CardContent>
  </Card>
}
