import type { ComponentType } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DataBlock, Metric } from "@/lib/dashboard-types"
import { formatNumber } from "@/lib/format"
import { SourceStatus } from "./source-status"
import { ExplanationLabel, type ExplainAction } from "./explanation-info"
import type { ExplanationTopicId } from "@/lib/explanations"

export function MetricCard({
  title,
  metric,
  block,
  icon: Icon,
  topicId,
  onExplain,
}: {
  title: string
  metric: Metric | undefined
  block: DataBlock<Metric[]>
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  topicId: ExplanationTopicId
  onExplain: ExplainAction
}) {
  const isCurrent = block.state === "ready" || block.state === "partial"
  const value = isCurrent && metric?.value != null ? formatNumber(metric.value, { maximumFractionDigits: metric.unit === "ms" ? 1 : 0 }) : "Indisponível"

  return (
    <Card className="min-h-36 justify-between">
      <CardHeader className="grid grid-cols-[1fr_auto] items-start gap-3">
        <CardTitle className="text-sm font-semibold"><ExplanationLabel label={title} topicId={topicId} onExplain={onExplain} /></CardTitle>
        <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-baseline gap-1.5 tabular-nums">
          <strong className="text-3xl leading-none font-bold tracking-tight">{value}</strong>
          {value !== "Indisponível" && metric?.unit ? <span className="text-xs text-muted-foreground">{metric.unit}</span> : null}
        </div>
        <SourceStatus block={block} compact />
      </CardContent>
    </Card>
  )
}
