"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { SessionsResult } from "@/lib/dashboard-types"
import { SourceStatus } from "./source-status"
import { ExplanationLabel, type ExplainAction } from "./explanation-info"
import type { ExplanationTopicId } from "@/lib/explanations"

const config = { count: { label: "Conexões", color: "var(--chart-1)" } } satisfies ChartConfig

const stateLabels: Record<string, string> = {
  active: "Ativas",
  idle: "Ociosas",
  "idle in transaction": "Em transação",
  "idle in transaction (aborted)": "Transação abortada",
}

function DistributionChart({ title, subtitle, rows, topicId, onExplain }: { title: string; subtitle: string; rows: { label: string; count: number }[]; topicId: ExplanationTopicId; onExplain: ExplainAction }) {
  return <div className="flex min-w-0 flex-col gap-2">
    <div><h3 className="text-sm font-semibold"><ExplanationLabel label={title} topicId={topicId} onExplain={onExplain} /></h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>
    {rows.length ? <ChartContainer config={config} className="h-44 w-full min-w-0">
      <BarChart data={rows} layout="vertical" accessibilityLayer margin={{ left: 0, right: 10 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis dataKey="label" type="category" width={110} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer> : <div className="grid h-44 place-items-center text-sm text-muted-foreground">Sem conexões para comparar.</div>}
  </div>
}

export function SessionsChart({ result, onExplain }: { result: SessionsResult; onExplain: ExplainAction }) {
  const byState = Object.entries(result.byState).filter(([, count]) => count > 0).map(([label, count]) => ({ label: stateLabels[label] || label, count }))
  const users = new Map<string, number>()
  for (const row of result.sessions.data?.rows ?? []) {
    const name = row.user || "Não informado"
    users.set(name, (users.get(name) ?? 0) + 1)
  }
  const byUser = [...users].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }))

  return <Card>
    <CardHeader><CardTitle className="text-base font-semibold"><ExplanationLabel label="Distribuição de conexões" topicId="session-distribution" onExplain={onExplain} /></CardTitle></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <DistributionChart title="Por estado" subtitle="Sessões visíveis no PostgreSQL" rows={byState} topicId="sessions-by-state" onExplain={onExplain} />
        <DistributionChart title="Por usuário" subtitle="Sessões na página atual" rows={byUser} topicId="sessions-by-user-page" onExplain={onExplain} />
      </div>
      <SourceStatus block={result.sessions} />
    </CardContent>
  </Card>
}
