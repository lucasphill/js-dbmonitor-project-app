"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { ExplanationTopicId } from "@/lib/explanations"

export type ExplainAction = (topicId: ExplanationTopicId) => void

export function ExplanationInfo({ topicId, label, onExplain }: {
  topicId: ExplanationTopicId
  label: string
  onExplain: ExplainAction
}) {
  return <Button type="button" variant="outline" size="icon" className="size-8 rounded-full text-sm font-semibold" aria-label={`Entender ${label}`} onClick={() => onExplain(topicId)}>
    <span aria-hidden="true">i</span>
  </Button>
}

export function ExplanationLabel({ topicId, label, onExplain, children }: {
  topicId: ExplanationTopicId
  label: string
  onExplain: ExplainAction
  children?: ReactNode
}) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span>{children ?? label}</span>
    <ExplanationInfo topicId={topicId} label={label} onExplain={onExplain} />
  </span>
}
