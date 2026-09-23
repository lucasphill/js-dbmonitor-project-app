"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Period } from "@/lib/dashboard-types"
import type { HistoryPreset } from "@/app/hooks/use-history"

function localInputValue(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function PeriodSelector({
  preset,
  customPeriod,
  onChange,
}: {
  preset: HistoryPreset
  customPeriod: Period
  onChange: (preset: HistoryPreset, custom?: Period) => void
}) {
  const [fromInput, setFromInput] = useState(() => localInputValue(customPeriod.from))
  const [toInput, setToInput] = useState(() => localInputValue(customPeriod.to))
  useEffect(() => {
    setFromInput(localInputValue(customPeriod.from))
    setToInput(localInputValue(customPeriod.to))
  }, [customPeriod.from, customPeriod.to])
  const fromTime = Date.parse(fromInput)
  const toTime = Date.parse(toInput)
  const valid = Number.isFinite(fromTime) && Number.isFinite(toTime) && fromTime < toTime &&
    toTime - fromTime <= 7 * 24 * 60 * 60 * 1000 && toTime <= Date.now() + 60_000

  return (
    <div className="flex flex-wrap items-end gap-2" aria-label="Período dos dados históricos">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="history-preset">
        Período
        <Select value={preset} onValueChange={(value) => { if (value) onChange(value as HistoryPreset) }}>
          <SelectTrigger id="history-preset" aria-label="Selecionar período" className="min-w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="1h">Última hora</SelectItem>
              <SelectItem value="24h">Últimas 24 horas</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      {preset === "custom" ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="history-from">
            Início
            <Input id="history-from" type="datetime-local" value={fromInput} onChange={(event) => setFromInput(event.target.value)} className="w-48" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="history-to">
            Fim
            <Input id="history-to" type="datetime-local" value={toInput} onChange={(event) => setToInput(event.target.value)} className="w-48" />
          </label>
          <Button size="sm" variant="secondary" disabled={!valid} onClick={() => onChange("custom", { from: new Date(fromTime).toISOString(), to: new Date(toTime).toISOString() })}>
            Aplicar
          </Button>
          {!valid ? <span className="text-xs text-destructive" role="status">Escolha um intervalo válido de até 7 dias.</span> : null}
        </>
      ) : null}
    </div>
  )
}
