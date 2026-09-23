"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { DataBlock, TimePoint } from "@/lib/dashboard-types"
import { formatNumber } from "@/lib/format"
import { SourceStatus } from "./source-status"

const chartConfig = {
  value: { label: "Valor", color: "var(--chart-1)" },
} satisfies ChartConfig

function chartMessage(block: DataBlock<TimePoint[]>): string {
  if (block.state === "loading") return "Carregando série temporal…"
  if (block.state === "insufficient") return "São necessárias pelo menos duas coletas para mostrar esta tendência."
  if (block.state === "empty") return "Nenhum dado no período selecionado."
  return block.reason || "Série temporal indisponível nesta instância."
}

function SeriesChart({
  title,
  block,
  unit,
}: {
  title: string
  block: DataBlock<TimePoint[]>
  unit: string
}) {
  const points = block.data?.reduce<{ at: string; value: number | null }[]>((series, point, index, all) => {
    if (index > 0 && all[index - 1].segment !== point.segment) series.push({ at: point.at, value: null })
    series.push({ at: point.at, value: point.value })
    return series
  }, []) ?? []
  const canPlot = (block.state === "ready" || block.state === "partial" || block.state === "stale") && points.length > 1

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{unit} · Período selecionado</p>
      </CardHeader>
      <CardContent className="flex min-h-60 flex-col gap-3">
        {canPlot ? (
          <ChartContainer config={chartConfig} className="h-44 w-full min-w-0">
            <LineChart data={points} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="at" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(at: string) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} />
              <YAxis width={42} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatNumber(value, { notation: "compact" })} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(at) => new Date(String(at)).toLocaleString("pt-BR")} formatter={(value) => `${formatNumber(Number(value), { maximumFractionDigits: 1 })} ${unit}`} />} />
              <Line dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="grid h-44 place-items-center rounded-lg bg-muted/50 px-6 text-center text-sm text-muted-foreground" role="status">{chartMessage(block)}</div>
        )}
        <SourceStatus block={block} />
      </CardContent>
    </Card>
  )
}

export function OverviewCharts({
  connections,
  transactions,
}: {
  connections: DataBlock<TimePoint[]>
  transactions: DataBlock<TimePoint[]>
}) {
  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-2" aria-label="Séries temporais">
      <SeriesChart title="Conexões abertas" block={connections} unit="conexões" />
      <SeriesChart title="Taxa de transações" block={transactions} unit="tx/min" />
    </section>
  )
}
