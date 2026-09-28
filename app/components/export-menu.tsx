"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ExportFormat, ExportResult } from "@/lib/dashboard-types"

const formatLabels: Record<ExportFormat, string> = {
  csv: "CSV",
  json: "JSON",
  pdf: "PDF — Resumo executivo",
}

export function ExportMenu({
  formats,
  onExport,
  busy = false,
  disabled = false,
}: {
  formats: ExportFormat[]
  onExport: (format: ExportFormat) => void
  busy?: boolean
  disabled?: boolean
}) {
  const [format, setFormat] = useState<ExportFormat>(formats[0] || "csv")
  const selectedFormat = formats.includes(format) ? format : formats[0] || "csv"

  return <div className="flex items-center gap-2" aria-busy={busy}>
    <select
      aria-label="Formato da exportação"
      className="h-9 max-w-56 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      value={selectedFormat}
      onChange={(event) => setFormat(event.target.value as ExportFormat)}
      disabled={busy || disabled}
    >
      {formats.map((option) => <option key={option} value={option}>{formatLabels[option]}</option>)}
    </select>
    <Button type="button" variant="outline" size="sm" onClick={() => onExport(selectedFormat)} disabled={busy || disabled}>
      <Download data-icon="inline-start" aria-hidden />{busy ? "Exportando…" : "Exportar"}
    </Button>
  </div>
}

export function exportResultNotice(result: ExportResult, noun: string): string {
  if (result.canceled) {
    return result.cancelReason === "privacy"
      ? "Exportação cancelada. Nenhum arquivo foi criado."
      : "Destino cancelado. Nenhum arquivo foi criado."
  }
  if (result.empty) return result.message || `Nenhum registro de ${noun} corresponde ao período ou filtros selecionados.`
  if (result.format === "pdf") return "Resumo executivo PDF exportado."
  const format = result.format?.toUpperCase() || "Arquivo"
  const count = `${result.rowCount} ${noun}`
  return `${format} exportado: ${count}${result.truncated ? " (limite de linhas atingido; arquivo truncado)" : ""}.`
}
