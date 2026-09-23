"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DataBlock, TimePoint } from "@/lib/dashboard-types"
import { formatDuration, formatNumber, formatTimestamp } from "@/lib/format"
import { useHistory } from "@/app/hooks/use-history"
import { PeriodSelector } from "./period-selector"
import { SourceStatus } from "./source-status"

const config = { value: { label: "Valor", color: "var(--chart-1)" } } satisfies ChartConfig

export function HistorySeriesCard({ title, block, unit }: {
  title: string
  block: DataBlock<TimePoint[]>
  unit: string
}) {
  const points = block.data ?? []
  const plot = points.some((point) => point.value !== null) && ["ready", "partial", "stale"].includes(block.state)
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{unit} · Período selecionado</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {plot ? (
          <ChartContainer config={config} className="h-44 w-full min-w-0">
            <LineChart data={points} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="at" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(at: string) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} />
              <YAxis tickLine={false} axisLine={false} width={46} tickFormatter={(value: number) => formatNumber(value, { notation: "compact" })} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatTimestamp(String(value))} formatter={(value) => `${formatNumber(Number(value), { maximumFractionDigits: 1 })} ${unit}`} />} />
              <Line dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="grid h-44 place-items-center rounded-lg bg-muted/50 px-5 text-center text-sm text-muted-foreground" role="status">
            {block.reason || (block.state === "insufficient" ? "Aguardando amostras suficientes." : "Métrica indisponível no período.")}
          </div>
        )}
        <SourceStatus block={block} />
      </CardContent>
    </Card>
  )
}

export function PerformanceView() {
  const history = useHistory("performance")
  const data = history.performance
  const aggregates = data?.queryAggregates
  const active = data?.activeQueries
  return (
    <section className="flex flex-col gap-5" aria-labelledby="performance-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 id="performance-title" className="text-3xl font-bold tracking-tight">Desempenho</h1><p className="text-sm text-muted-foreground">Duração das consultas, atividade e tempo da coleta.</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <PeriodSelector preset={history.preset} customPeriod={history.customPeriod} onChange={history.choosePeriod} />
          <Button variant="outline" size="sm" onClick={() => { void history.refresh(true) }} disabled={history.loading}>Atualizar</Button>
        </div>
      </div>
      {history.performanceError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{history.performanceError}</p> : null}
      {history.loading && !data ? <p role="status" className="text-sm text-muted-foreground">Carregando desempenho…</p> : null}
      {data ? <>
        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          <HistorySeriesCard title="Atividade WAL" block={data.walSeries} unit={data.walSeries.unit || "bytes/coleta"} />
          <HistorySeriesCard title="Operações de I/O" block={data.ioSeries} unit={data.ioSeries.unit || "operações/coleta"} />
          <HistorySeriesCard title="Tempo da coleta" block={data.collectionDurationSeries} unit="ms" />
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader><CardTitle className="text-base">Queries ativas</CardTitle><CardDescription>Duração em andamento; esperas são uma informação separada.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {active?.data?.rows.length ? <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>PID</TableHead><TableHead>Banco</TableHead><TableHead>Usuário</TableHead><TableHead>Duração</TableHead><TableHead>Espera</TableHead></TableRow></TableHeader>
                <TableBody>{active.data.rows.map((row) => <TableRow key={`${row.pid}-${row.backendStart}`}>
                  <TableCell>{row.pid}</TableCell><TableCell>{row.database || "—"}</TableCell><TableCell>{row.user || "—"}</TableCell>
                  <TableCell>{formatDuration(row.activeDurationMs)}</TableCell><TableCell>{row.waitEvent || row.waitEventType || "—"}</TableCell>
                </TableRow>)}</TableBody>
              </Table></div> : <p className="text-sm text-muted-foreground">{active?.reason || "Nenhuma query ativa visível."}</p>}
              {active ? <SourceStatus block={active} /> : null}
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader><CardTitle className="text-base">Latência agregada por consulta</CardTitle><CardDescription>Acumulada desde o último reset do pg_stat_statements; independe do período dos gráficos.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {aggregates?.data?.rows.length ? <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Grupo de consulta</TableHead><TableHead>Chamadas</TableHead><TableHead>Média</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
                <TableBody>{aggregates.data.rows.map((row) => <TableRow key={`${row.databaseOid}:${row.userOid}:${row.queryId}`}>
                  <TableCell className="font-mono text-xs">{row.queryId}</TableCell><TableCell>{formatNumber(row.calls)}</TableCell>
                  <TableCell>{formatDuration(row.meanTimeMs)}</TableCell><TableCell>{formatDuration(row.totalTimeMs)}</TableCell>
                </TableRow>)}</TableBody>
              </Table></div> : <p className="text-sm text-muted-foreground" role="status">{aggregates?.reason || "Sem amostras de duração disponíveis."}</p>}
              {aggregates ? <SourceStatus block={aggregates} /> : null}
            </CardContent>
          </Card>
        </div>
      </> : null}
    </section>
  )
}
