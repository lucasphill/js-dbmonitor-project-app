"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatNumber } from "@/lib/format"
import { useHistory } from "@/app/hooks/use-history"
import { HistorySeriesCard } from "./performance-view"
import { PeriodSelector } from "./period-selector"
import { SourceStatus } from "./source-status"

export function DatabasesView() {
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const history = useHistory("databases")
  const data = history.databaseActivity
  const ranking = data?.ranking
  const rows = ranking?.data?.rows ?? []
  const previousOffset = Math.max(0, Number(history.page.cursor || 0) - history.page.limit)
  const currentOffset = Number(history.page.cursor || 0)
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
        <div><h1 id="databases-title" className="text-3xl font-bold tracking-tight">Bancos de dados</h1><p className="text-sm text-muted-foreground">Ranking por transações concluídas no período selecionado.</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <PeriodSelector preset={history.preset} customPeriod={history.customPeriod} onChange={history.choosePeriod} />
          <Button variant="outline" size="sm" onClick={() => { void history.refresh(true) }} disabled={history.loading}>Atualizar</Button>
          <Button variant="outline" size="sm" onClick={() => void exportCurrentPeriod()} disabled={exporting}><Download data-icon="inline-start" aria-hidden />Exportar CSV</Button>
        </div>
      </div>
      {history.databaseError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{history.databaseError}</p> : null}
      {exportMessage ? <p className="rounded-lg border bg-card p-3 text-sm" role="status">{exportMessage}</p> : null}
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
