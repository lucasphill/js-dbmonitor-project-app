"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { explanationGroups, findExplanationTopic, topicsForGroup, type ExplanationTopicId } from "@/lib/explanations"
import { cn } from "@/lib/utils"
import type { ExplainAction } from "./explanation-info"

export function ExplanationsView({ selectedTopicId, onExplain }: {
  selectedTopicId: ExplanationTopicId | null
  onExplain: ExplainAction
}) {
  return <section className="flex flex-col gap-6" aria-labelledby="explanations-title">
    <div className="flex flex-col gap-2">
      <h1 id="explanations-title" className="text-3xl font-bold tracking-tight">Explicações</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Entenda o significado, a unidade e o período dos dados mostrados no DBMonitor. Valores indisponíveis não representam zero.</p>
    </div>
    <nav className="flex flex-wrap gap-2" aria-label="Assuntos das explicações">
      {explanationGroups.map((group) => {
        const first = topicsForGroup(group.id)[0]
        return first ? <Button key={group.id} type="button" variant="outline" size="sm" onClick={() => onExplain(first.id as ExplanationTopicId)}>{group.title}</Button> : null
      })}
    </nav>
    {explanationGroups.map((group) => <section key={group.id} className="flex flex-col gap-3" aria-labelledby={`explanation-group-${group.id}`}>
      <h2 id={`explanation-group-${group.id}`} className="text-xl font-semibold tracking-tight">{group.title}</h2>
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        {topicsForGroup(group.id).map((item) => <Card key={item.id} className={cn("min-w-0", selectedTopicId === item.id && "ring-2 ring-primary")}>
          <CardHeader>
            <h3 id={`explanation-${item.id}`} tabIndex={-1} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <CardTitle>{item.title}</CardTitle>
            </h3>
            <div className="flex flex-wrap gap-2"><Badge variant="secondary">{item.unit}</Badge><span className="text-xs text-muted-foreground">{item.temporalScope}</span></div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>{item.meaning}</p>
            {item.calculation ? <p><strong>Cálculo:</strong> {item.calculation}</p> : null}
            <p><strong>Origem:</strong> {item.source}</p>
            <p className="text-muted-foreground"><strong>Observação:</strong> {item.caveats}</p>
            {item.related.length ? <div className="flex flex-wrap items-center gap-1 pt-1"><span className="text-xs text-muted-foreground">Compare com:</span>{item.related.map((relatedId) => {
              const related = findExplanationTopic(relatedId)
              return related ? <Button key={relatedId} type="button" variant="link" size="sm" className="h-auto p-1 text-xs" onClick={() => onExplain(related.id as ExplanationTopicId)}>{related.title}</Button> : null
            })}</div> : null}
          </CardContent>
        </Card>)}
      </div>
    </section>)}
  </section>
}
