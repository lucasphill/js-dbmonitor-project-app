import { Badge } from "@/components/ui/badge"
import type { DataBlock, SourceState } from "@/lib/dashboard-types"
import { formatAge, formatTimestamp } from "@/lib/format"

const stateText: Record<SourceState, string> = {
  ready: "Atualizado",
  loading: "Carregando",
  empty: "Sem dados",
  insufficient: "Dados insuficientes",
  unavailable: "Indisponível",
  partial: "Cobertura parcial",
  stale: "Dados históricos",
  error: "Falha na coleta",
}

export function SourceStatus({
  block,
  compact = false,
}: {
  block: Pick<DataBlock<unknown>, "state" | "source" | "updatedAt" | "reason">
  compact?: boolean
}) {
  const status = stateText[block.state]
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Badge variant={block.state === "ready" ? "default" : "secondary"}>{status}</Badge>
      {compact ? null : <span className="truncate">Fonte: {block.source}</span>}
      {block.updatedAt ? (
        <time dateTime={block.updatedAt} title={formatTimestamp(block.updatedAt)}>
          {formatAge(block.updatedAt)}
        </time>
      ) : null}
      {block.reason ? <span className="basis-full" role={block.state === "error" ? "alert" : undefined}>{block.reason}</span> : null}
    </div>
  )
}
