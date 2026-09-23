"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DatabaseInventory, Page } from "@/lib/dashboard-types"
import { formatDatabaseSize, formatNumber } from "@/lib/format"
import { useHistory } from "@/app/hooks/use-history"
import { HistorySeriesCard } from "./performance-view"
import { PeriodSelector } from "./period-selector"
import { SourceStatus } from "./source-status"

export function DatabasesView() {
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [inventory, setInventory] = useState<DatabaseInventory | null>(null)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryPage, setInventoryPage] = useState<Page>({ limit: 50 })
  const inventoryRequest = useRef(0)
  const history = useHistory("databases")
  const data = history.databaseActivity
  const ranking = data?.ranking
  const rows = ranking?.data?.rows ?? []
  const previousOffset = Math.max(0, Number(history.page.cursor || 0) - history.page.limit)
  const currentOffset = Number(history.page.cursor || 0)
  const inventoryRows = inventory?.databases.data?.rows ?? []
  const inventoryOffset = Number(inventoryPage.cursor || 0)
  const inventoryPreviousOffset = Math.max(0, inventoryOffset - inventoryPage.limit)

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
      const result = await window.bdash.getDatabaseInventory(inventoryPage)
      if (requestId !== inventoryRequest.current) return
      setInventory(result)
      setInventoryError(null)
    } catch (cause) {
      if (requestId !== inventoryRequest.current) return
      setInventoryError(cause instanceof Error ? cause.message : "Falha ao listar bancos.")
    } finally {
      if (requestId === inventoryRequest.current) setInventoryLoading(false)
    }
  }, [inventoryPage])

  useEffect(() => {
    void loadInventory()
    return () => { inventoryRequest.current++ }
  }, [loadInventory])
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
        <CardHeader><CardTitle className="text-base">Bancos da instância</CardTitle><CardDescription>O tamanho é medido em disco ao abrir ou atualizar esta lista; sem permissão CONNECT ou em caso de tempo limite, aparece indisponível.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {inventoryError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{inventoryError}</p> : null}
          {inventoryLoading && !inventory ? <p role="status" className="text-sm text-muted-foreground">Carregando inventário de bancos…</p> : null}
          {inventory ? <>
            {inventoryRows.length ? <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow>
                <TableHead>Banco</TableHead><TableHead className="text-right">Tamanho em disco</TableHead>
                <TableHead>Proprietário</TableHead><TableHead>Codificação</TableHead><TableHead>Collation</TableHead>
                <TableHead className="text-right">Conexões</TableHead><TableHead className="text-right">Limite</TableHead><TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>{inventoryRows.map((row) => <TableRow key={row.oid}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap" title={row.sizeBytes === null ? undefined : `${formatNumber(row.sizeBytes)} bytes`}>{formatDatabaseSize(row.sizeBytes)}</TableCell>
                <TableCell>{row.owner}</TableCell><TableCell>{row.encoding}</TableCell><TableCell>{row.collation}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.connections)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.connectionLimit === -1 ? "Sem limite" : row.connectionLimit < 0 ? "Indisponível" : formatNumber(row.connectionLimit)}</TableCell>
                <TableCell><Badge variant={row.allowsConnections ? "secondary" : "outline"}>{!row.allowsConnections ? "Sem conexões" : row.template ? "Modelo" : "Disponível"}</Badge></TableCell>
              </TableRow>)}</TableBody>
            </Table></div> : <p role="status" className="text-sm text-muted-foreground">Nenhum banco encontrado nesta página.</p>}
            <SourceStatus block={inventory.databases} />
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>{inventory.databases.data?.total ? `${inventoryOffset + 1}–${Math.min(inventoryOffset + inventoryRows.length, inventory.databases.data.total)} de ${inventory.databases.data.total}` : "0 resultados"}</span>
              <Button size="sm" variant="outline" disabled={inventoryOffset === 0 || inventoryLoading} onClick={() => setInventoryPage({ ...inventoryPage, cursor: inventoryPreviousOffset ? String(inventoryPreviousOffset) : undefined })}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={!inventory.databases.data?.nextCursor || inventoryLoading} onClick={() => setInventoryPage({ ...inventoryPage, cursor: inventory.databases.data?.nextCursor })}>Próxima</Button>
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
