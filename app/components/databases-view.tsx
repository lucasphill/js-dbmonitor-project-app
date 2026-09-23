"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDownUp, Download, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DatabaseInventory, DatabaseInventoryFilters } from "@/lib/dashboard-types"
import { formatDatabaseSize, formatNumber } from "@/lib/format"
import { useHistory } from "@/app/hooks/use-history"
import { HistorySeriesCard } from "./performance-view"
import { PeriodSelector } from "./period-selector"
import { SourceStatus } from "./source-status"

const databaseStates = [
  { value: "all", label: "Todos os estados" },
  { value: "available", label: "Disponível" },
  { value: "blocked", label: "Sem conexões" },
  { value: "template", label: "Modelo" },
]

export function DatabasesView() {
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [inventory, setInventory] = useState<DatabaseInventory | null>(null)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryFilters, setInventoryFilters] = useState<DatabaseInventoryFilters>({ sortBy: "name", sortDirection: "asc", page: { limit: 50 } })
  const [inventorySearch, setInventorySearch] = useState("")
  const [inventoryOwner, setInventoryOwner] = useState("")
  const [inventoryEncoding, setInventoryEncoding] = useState("")
  const [inventoryStatus, setInventoryStatus] = useState("all")
  const inventoryRequest = useRef(0)
  const history = useHistory("databases")
  const data = history.databaseActivity
  const ranking = data?.ranking
  const rows = ranking?.data?.rows ?? []
  const previousOffset = Math.max(0, Number(history.page.cursor || 0) - history.page.limit)
  const currentOffset = Number(history.page.cursor || 0)
  const inventoryRows = inventory?.databases.data?.rows ?? []
  const inventoryOffset = Number(inventoryFilters.page.cursor || 0)
  const inventoryPreviousOffset = Math.max(0, inventoryOffset - inventoryFilters.page.limit)

  const loadInventory = useCallback(async () => {
    const requestId = ++inventoryRequest.current
    setInventoryLoading(true)
    setInventory(null)
    if (!window.bdash) {
      setInventoryError("Abra pelo Electron para consultar os bancos.")
      setInventoryLoading(false)
      return
    }
    try {
      const result = await window.bdash.getDatabaseInventory(inventoryFilters)
      if (requestId !== inventoryRequest.current) return
      setInventory(result)
      setInventoryError(null)
    } catch (cause) {
      if (requestId !== inventoryRequest.current) return
      setInventoryError(cause instanceof Error ? cause.message : "Falha ao listar bancos.")
    } finally {
      if (requestId === inventoryRequest.current) setInventoryLoading(false)
    }
  }, [inventoryFilters])

  useEffect(() => {
    void loadInventory()
    return () => { inventoryRequest.current++ }
  }, [loadInventory])

  function sortInventory(field: NonNullable<DatabaseInventoryFilters["sortBy"]>) {
    setInventoryFilters((current) => ({ ...current, sortBy: field,
      sortDirection: current.sortBy === field && current.sortDirection === "asc" ? "desc" : "asc",
      page: { limit: current.page.limit } }))
  }

  const inventorySortHeader = (label: string, field: NonNullable<DatabaseInventoryFilters["sortBy"]>, numeric = false) =>
    <TableHead className={numeric ? "text-right" : undefined} aria-sort={inventoryFilters.sortBy === field ? inventoryFilters.sortDirection === "desc" ? "descending" : "ascending" : "none"}>
      <Button type="button" variant="ghost" size="sm" onClick={() => sortInventory(field)} aria-label={`Ordenar por ${label}`} className={numeric ? undefined : "-ml-2"}><ArrowDownUp data-icon="inline-start" aria-hidden />{label}</Button>
    </TableHead>

  async function exportCurrentPeriod() {
    if (!window.bdash) return
    setExporting(true); setExportMessage(null)
    try {
      if (!data?.sourceContext) throw new Error("Atualize os dados antes de exportar.")
      const result = await window.bdash.exportFiltered({ dataset: "database-activity", period: history.period, sourceContext: data.sourceContext })
      if (!result.canceled) setExportMessage(`CSV exportado: ${result.rowCount} bancos.`)
    } catch (cause) { setExportMessage(cause instanceof Error ? cause.message : "Falha ao exportar CSV.") }
    finally { setExporting(false) }
  }
  return (
    <section className="flex flex-col gap-5" aria-labelledby="databases-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 id="databases-title" className="text-3xl font-bold tracking-tight">Bancos de dados</h1><p className="text-sm text-muted-foreground">Inventário atual da instância e atividade no período selecionado.</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <PeriodSelector preset={history.preset} customPeriod={history.customPeriod} onChange={history.choosePeriod} />
          <Button variant="outline" size="sm" onClick={() => { void history.refresh(true); void loadInventory() }} disabled={history.loading || inventoryLoading}>Atualizar</Button>
          <Button variant="outline" size="sm" onClick={() => void exportCurrentPeriod()} disabled={exporting}><Download data-icon="inline-start" aria-hidden />Exportar CSV</Button>
        </div>
      </div>
      {history.databaseError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{history.databaseError}</p> : null}
      {exportMessage ? <p className="rounded-lg border bg-card p-3 text-sm" role="status">{exportMessage}</p> : null}
      <Card className="min-w-0">
        <CardHeader><CardTitle className="text-base">Bancos da instância</CardTitle><CardDescription>Filtros e ordenação abrangem todos os bancos da instância. O tamanho é medido ao abrir a lista; ordenar por tamanho consulta os bancos filtrados. Sem permissão CONNECT ou em caso de tempo limite, aparece indisponível.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-wrap items-end gap-2" aria-label="Filtros de bancos" onSubmit={(event) => {
            event.preventDefault()
            setInventoryFilters((current) => ({ ...current,
              search: inventorySearch.trim() || undefined,
              owner: inventoryOwner.trim() || undefined,
              encoding: inventoryEncoding.trim() || undefined,
              status: inventoryStatus === "all" ? undefined : inventoryStatus as DatabaseInventoryFilters["status"],
              page: { limit: current.page.limit },
            }))
          }}>
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">Busca<Input value={inventorySearch} maxLength={200} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Banco ou proprietário" /></label>
            <label className="flex w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">Proprietário<Input value={inventoryOwner} maxLength={128} onChange={(event) => setInventoryOwner(event.target.value)} placeholder="Todos" /></label>
            <label className="flex w-36 flex-col gap-1 text-xs font-medium text-muted-foreground">Codificação<Input value={inventoryEncoding} maxLength={64} onChange={(event) => setInventoryEncoding(event.target.value)} placeholder="Todas" /></label>
            <div className="flex w-44 flex-col gap-1 text-xs font-medium text-muted-foreground"><span>Estado</span><Select value={inventoryStatus} onValueChange={(value) => setInventoryStatus(String(value))} items={databaseStates}><SelectTrigger className="w-full"><SelectValue placeholder="Todos os estados" /></SelectTrigger><SelectContent><SelectGroup>{databaseStates.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
            <Button type="submit" size="sm"><Search data-icon="inline-start" aria-hidden />Filtrar</Button>
          </form>
          {inventoryError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{inventoryError}</p> : null}
          {inventoryLoading && !inventory ? <p role="status" className="text-sm text-muted-foreground">Carregando inventário de bancos…</p> : null}
          {inventory ? <>
            {inventoryRows.length ? <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow>
                {inventorySortHeader("Banco", "name")}{inventorySortHeader("Tamanho em disco", "size", true)}
                {inventorySortHeader("Proprietário", "owner")}{inventorySortHeader("Codificação", "encoding")}{inventorySortHeader("Collation", "collation")}
                {inventorySortHeader("Conexões", "connections", true)}{inventorySortHeader("Limite", "connectionLimit", true)}{inventorySortHeader("Estado", "status")}
              </TableRow></TableHeader>
              <TableBody>{inventoryRows.map((row) => <TableRow key={row.oid}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap" title={row.sizeBytes === null ? undefined : `${formatNumber(row.sizeBytes)} bytes`}>{formatDatabaseSize(row.sizeBytes)}</TableCell>
                <TableCell>{row.owner}</TableCell><TableCell>{row.encoding}</TableCell><TableCell>{row.collation}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.connections)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.connectionLimit === -1 ? "Sem limite" : row.connectionLimit < 0 ? "Indisponível" : formatNumber(row.connectionLimit)}</TableCell>
                <TableCell><Badge variant={row.allowsConnections ? "secondary" : "outline"}>{!row.allowsConnections ? "Sem conexões" : row.template ? "Modelo" : "Disponível"}</Badge></TableCell>
              </TableRow>)}</TableBody>
            </Table></div> : <p role="status" className="text-sm text-muted-foreground">Nenhum banco corresponde aos filtros.</p>}
            <SourceStatus block={inventory.databases} />
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>{inventory.databases.data?.total ? `${inventoryOffset + 1}–${Math.min(inventoryOffset + inventoryRows.length, inventory.databases.data.total)} de ${inventory.databases.data.total}` : "0 resultados"}</span>
              <Button size="sm" variant="outline" disabled={inventoryOffset === 0 || inventoryLoading} onClick={() => setInventoryFilters((current) => ({ ...current, page: { limit: current.page.limit, cursor: inventoryPreviousOffset ? String(inventoryPreviousOffset) : undefined } }))}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={!inventory.databases.data?.nextCursor || inventoryLoading} onClick={() => setInventoryFilters((current) => ({ ...current, page: { limit: current.page.limit, cursor: inventory.databases.data?.nextCursor } }))}>Próxima</Button>
            </div>
          </> : null}
        </CardContent>
      </Card>
      {history.loading && !data ? <p role="status" className="text-sm text-muted-foreground">Carregando bancos…</p> : null}
      {data ? <>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <HistorySeriesCard title="Conexões por coleta" block={data.connectionsSeries} unit="conexões" />
          <HistorySeriesCard title="Transações concluídas" block={data.transactionsSeries} unit="transações/coleta" />
          <HistorySeriesCard title="Blocos lidos" block={data.readsSeries} unit="blocos/coleta" />
          <HistorySeriesCard title="Acertos de cache" block={data.cacheSeries} unit="blocos/coleta" />
        </div>
        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-base">Bancos mais acessados</CardTitle><CardDescription>Ordenado pela variação de commits + rollbacks. Contadores totais são valores desde o último reset do PostgreSQL.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {rows.length ? <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow>
                <TableHead>Banco</TableHead><TableHead className="text-right">Transações no período</TableHead>
                <TableHead className="text-right">Conexões atuais</TableHead><TableHead className="text-right">Commits totais</TableHead>
                <TableHead className="text-right">Rollbacks totais</TableHead><TableHead className="text-right">Blocos lidos no período</TableHead>
                <TableHead className="text-right">Cache no período</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((row) => <TableRow key={row.oid}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.transactionsInPeriod)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.connections)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.commits)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.rollbacks)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.readsInPeriod)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.cacheHitsInPeriod)}</TableCell>
              </TableRow>)}</TableBody>
            </Table></div> : <p className="text-sm text-muted-foreground" role="status">{ranking?.reason || "Nenhum banco encontrado no período."}</p>}
            {ranking ? <SourceStatus block={ranking} /> : null}
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>{ranking?.data?.total ? `${currentOffset + 1}–${Math.min(currentOffset + rows.length, ranking.data.total)} de ${ranking.data.total}` : "0 resultados"}</span>
              <Button size="sm" variant="outline" disabled={currentOffset === 0} onClick={() => history.setPage({ ...history.page, cursor: previousOffset ? String(previousOffset) : undefined })}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={!ranking?.data?.nextCursor} onClick={() => history.setPage({ ...history.page, cursor: ranking?.data?.nextCursor })}>Próxima</Button>
            </div>
          </CardContent>
        </Card>
      </> : null}
    </section>
  )
}
