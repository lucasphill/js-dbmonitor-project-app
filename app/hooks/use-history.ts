"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { DatabaseActivity, Page, Performance, Period } from "@/lib/dashboard-types"

export type HistoryPreset = "1h" | "24h" | "7d" | "custom"
export type HistoryMode = "databases" | "performance" | "both"

const STORAGE_KEY = "bdash.history.period"
const PERIOD_MS: Record<Exclude<HistoryPreset, "custom">, number> = {
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
}

function periodFor(preset: HistoryPreset, custom: Period, now = Date.now()): Period {
  if (preset === "custom") return custom
  return { from: new Date(now - PERIOD_MS[preset]).toISOString(), to: new Date(now).toISOString() }
}

function loadSelection(): { preset: HistoryPreset; custom: Period } {
  const fallback = { preset: "1h" as HistoryPreset, custom: periodFor("24h", { from: "", to: "" }) }
  if (typeof window === "undefined") return fallback
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null")
    if (!value || !["1h", "24h", "7d", "custom"].includes(value.preset)) return fallback
    if (!value.custom || !Number.isFinite(Date.parse(value.custom.from)) ||
        !Number.isFinite(Date.parse(value.custom.to)) || Date.parse(value.custom.from) >= Date.parse(value.custom.to)) return fallback
    return { preset: value.preset, custom: value.custom }
  } catch { return fallback }
}

/** Data stays in the Electron bridge; this hook only holds the chosen period and page. */
export function useHistory(mode: HistoryMode = "both") {
  // Hydrate the persisted choice after mount so server/client markup matches.
  const [selection, setSelection] = useState(() => ({
    preset: "1h" as HistoryPreset,
    custom: periodFor("24h", { from: "", to: "" }),
  }))
  const [restored, setRestored] = useState(false)
  const [databaseActivity, setDatabaseActivity] = useState<DatabaseActivity | null>(null)
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [databaseError, setDatabaseError] = useState<string | null>(null)
  const [performanceError, setPerformanceError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>({ limit: 50 })
  const request = useRef(0)

  const choosePeriod = useCallback((preset: HistoryPreset, custom?: Period) => {
    if (preset === "custom" && (!custom || !Number.isFinite(Date.parse(custom.from)) ||
      !Number.isFinite(Date.parse(custom.to)) || Date.parse(custom.from) >= Date.parse(custom.to))) return
    setSelection((previous) => ({ preset, custom: custom ?? previous.custom }))
    setPage({ limit: 50 })
  }, [])

  useEffect(() => { setSelection(loadSelection()); setRestored(true) }, [])

  useEffect(() => {
    if (!restored) return
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection)) } catch { /* storage may be disabled */ }
  }, [selection, restored])

  const refresh = useCallback(async (showLoading = false) => {
    const id = ++request.current
    if (showLoading) setLoading(true)
    if (!window.bdash) {
      const message = "Abra o dashboard pelo Electron para consultar o histórico."
      if (mode !== "performance") setDatabaseError(message)
      if (mode !== "databases") setPerformanceError(message)
      setLoading(false)
      return
    }
    const period = periodFor(selection.preset, selection.custom)
    const jobs = [
      mode === "performance" ? Promise.resolve(null) : window.bdash.getDatabaseActivity(period, page),
      mode === "databases" ? Promise.resolve(null) : window.bdash.getPerformance(period, page),
    ] as const
    const [database, perf] = await Promise.allSettled(jobs)
    if (id !== request.current) return
    if (database.status === "fulfilled") {
      if (database.value) setDatabaseActivity(database.value)
      setDatabaseError(null)
    } else setDatabaseError(database.reason instanceof Error ? database.reason.message : "Falha ao consultar bancos")
    if (perf.status === "fulfilled") {
      if (perf.value) setPerformance(perf.value)
      setPerformanceError(null)
    } else setPerformanceError(perf.reason instanceof Error ? perf.reason.message : "Falha ao consultar desempenho")
    setLoading(false)
  }, [mode, selection, page])

  useEffect(() => {
    void refresh(true)
    const timer = window.setInterval(() => { void refresh() }, 15_000)
    return () => { window.clearInterval(timer); request.current++ }
  }, [refresh])

  return {
    preset: selection.preset,
    period: periodFor(selection.preset, selection.custom),
    customPeriod: selection.custom,
    choosePeriod,
    page,
    setPage,
    databaseActivity,
    performance,
    databaseError,
    performanceError,
    loading,
    refresh,
  }
}
