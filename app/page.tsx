"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import { Activity, Clock3, Database, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ConnectionProfile, DataBlock, DatabaseSummary, Metric, Period, SourceContext } from "@/lib/dashboard-types"
import { formatDuration, formatNumber, formatPercent, formatTimestamp } from "@/lib/format"
import { findExplanationTopic, type ExplanationTopicId } from "@/lib/explanations"
import { useDashboard } from "./hooks/use-dashboard"
import { DashboardShell, type SectionId } from "./components/dashboard-shell"
import { MetricCard } from "./components/metric-card"
import { OverviewCharts } from "./components/overview-charts"
import { SourceStatus } from "./components/source-status"
import { ConnectionsView } from "./components/connections-view"
import { DatabasesView } from "./components/databases-view"
import { PerformanceView } from "./components/performance-view"
import { LogsView } from "./components/logs-view"
import { DiagnosticsView } from "./components/diagnostics-view"
import { ExplanationLabel, type ExplainAction } from "./components/explanation-info"
import { ExplanationsView } from "./components/explanations-view"

type WindowSize = "1h" | "24h" | "7d"
const windowHours: Record<WindowSize, number> = { "1h": 1, "24h": 24, "7d": 168 }
const metricTitles = ["Conexões abertas", "Transações/min", "Tempo médio de consulta", "Bancos ativos"] as const
const metricIcons = [Users, Activity, Clock3, Database] as const
const metricTopics = ["open-connections", "transaction-rate", "query-mean-time", "active-databases"] as const

function periodFor(windowSize: WindowSize): Period {
  const to = new Date()
  return { from: new Date(to.getTime() - windowHours[windowSize] * 3_600_000).toISOString(), to: to.toISOString() }
}

function metricBlock(base: DataBlock<Metric[]>, title: string, metric: Metric | undefined, statementsAvailable: boolean, statementsReason?: string): DataBlock<Metric[]> {
  if (title === "Tempo médio de consulta" && !statementsAvailable) return { ...base, state: "unavailable", reason: statementsReason || "pg_stat_statements não está disponível nesta instância." }
  if (metric?.value == null && (base.state === "ready" || base.state === "partial")) return { ...base, state: title === "Transações/min" ? "insufficient" : "unavailable", reason: title === "Transações/min" ? "A taxa requer duas amostras válidas." : base.reason }
  return base
}

function DatabaseTable({ block, onExplain }: { block: DataBlock<DatabaseSummary[]>; onExplain: ExplainAction }) {
  const rows = block.data ?? []
  const showRows = rows.length > 0 && (block.state === "ready" || block.state === "partial" || block.state === "stale")
  return <Card className="min-w-0">
    <CardHeader><CardTitle className="text-base font-semibold">Resumo de bancos</CardTitle><p className="text-xs text-muted-foreground">Conexões atuais e contadores acumulados desde o último reset</p></CardHeader>
    <CardContent className="flex flex-col gap-4">
      {showRows ? <div className="overflow-x-auto rounded-md border"><Table>
        <TableHeader><TableRow>
          <TableHead><ExplanationLabel label="Banco" topicId="database-identity" onExplain={onExplain} /></TableHead>
          <TableHead className="text-right"><ExplanationLabel label="Conexões" topicId="database-connections" onExplain={onExplain} /></TableHead>
          <TableHead className="text-right"><ExplanationLabel label="Commits" topicId="commits-total" onExplain={onExplain} /></TableHead>
          <TableHead className="text-right"><ExplanationLabel label="Rollbacks" topicId="rollbacks-total" onExplain={onExplain} /></TableHead>
          <TableHead className="text-right"><ExplanationLabel label="Cache hit" topicId="cache-hit-percent" onExplain={onExplain} /></TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map((database) => {
          const blocks = database.cacheHits + database.blocksRead
          return <TableRow key={database.oid}>
            <TableCell className="font-medium">{database.name}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(database.connections)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(database.commits)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(database.rollbacks)}</TableCell>
            <TableCell className="text-right tabular-nums">{blocks > 0 ? formatPercent(100 * database.cacheHits / blocks) : "Indisponível"}</TableCell>
          </TableRow>
        })}</TableBody>
      </Table></div> : <p className="rounded-lg bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">{block.reason || (block.state === "loading" ? "Carregando bancos…" : "Nenhum banco disponível nesta coleta.")}</p>}
      <SourceStatus block={block} />
    </CardContent>
  </Card>
}

export default function Home() {
  const [section, setSection] = useState<SectionId>("overview")
  const [targetTopicId, setTargetTopicId] = useState<ExplanationTopicId | null>(null)
  const [navigationTick, setNavigationTick] = useState(0)
  const [windowSize, setWindowSize] = useState<WindowSize>("1h")
  const [period, setPeriod] = useState<Period>(() => periodFor("1h"))
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [source, setSource] = useState<SourceContext | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const { overview, loading, error, refresh } = useDashboard(period, source, section !== "explanations")

  async function reloadProfiles() {
    if (!window.bdash) return
    const result = await window.bdash.listConnectionProfiles(true)
    setProfiles(result.profiles)
    setSource({ profileId: result.activeProfileId, generation: result.generation })
  }

  useEffect(() => {
    let active = true
    if (!window.bdash) { setProfileLoading(false); return }
    void window.bdash.listConnectionProfiles(true).then((result) => {
      if (!active) return
      setProfiles(result.profiles)
      setSource({ profileId: result.activeProfileId, generation: result.generation })
    }).catch((cause) => { if (active) setProfileError(cause instanceof Error ? cause.message : "Falha ao carregar perfis.") })
      .finally(() => { if (active) setProfileLoading(false) })
    return () => { active = false }
  }, [])

  async function selectProfile(id: number) {
    if (!window.bdash || switching || id === source?.profileId) return
    setSwitching(true); setProfileError(null)
    try {
      const next = await window.bdash.activateConnectionProfile(id)
      setSource({ profileId: next.profile.id, generation: next.generation })
      setPeriod(periodFor(windowSize))
    } catch (cause) { setProfileError(cause instanceof Error ? cause.message : "Não foi possível selecionar a origem.") }
    finally { setSwitching(false) }
  }

  function selectSection(next: SectionId) {
    setTargetTopicId(null)
    setSection(next)
    setNavigationTick((current) => current + 1)
  }

  const openExplanation: ExplainAction = (topicId) => {
    setTargetTopicId(topicId)
    setSection("explanations")
    setNavigationTick((current) => current + 1)
  }

  useLayoutEffect(() => {
    if (section !== "explanations" || !findExplanationTopic(targetTopicId)) {
      window.scrollTo({ top: 0, behavior: "instant" })
      return
    }
    const heading = document.getElementById(`explanation-${targetTopicId}`)
    if (!heading) return
    const headerHeight = document.getElementById("dashboard-sticky-header")?.getBoundingClientRect().height ?? 0
    const top = window.scrollY + heading.getBoundingClientRect().top - headerHeight - 16
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" })
    heading.focus({ preventScroll: true })
  }, [section, targetTopicId, navigationTick])

  function selectWindow(next: WindowSize) { setWindowSize(next); setPeriod(periodFor(next)) }
  async function refreshNow() {
    setManualRefreshing(true)
    try { await refresh(); setPeriod(periodFor(windowSize)) }
    finally { setManualRefreshing(false) }
  }

  return <DashboardShell section={section} onSectionChange={selectSection} instance={overview?.instance} refreshing={loading || manualRefreshing || switching} onRefresh={() => void refreshNow()} profiles={profiles} source={source} switching={switching || profileLoading} onSelectProfile={(id) => void selectProfile(id)}>
    {section !== "explanations" && profileError ? <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{profileError}</p> : null}
    {section === "explanations" ? <ExplanationsView selectedTopicId={targetTopicId} onExplain={openExplanation} /> : profileLoading ? <div role="status" className="rounded-lg border p-6 text-sm text-muted-foreground">Carregando origens PostgreSQL…</div> : !source && typeof window !== "undefined" && window.bdash ? <div role="alert" className="rounded-lg border p-6 text-sm text-destructive">Nenhuma origem ativa disponível. {profileError}</div> : section === "overview" ? <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1"><h1 className="text-3xl font-bold tracking-tight">Visão geral</h1><p className="text-sm text-muted-foreground">Estado da instância e tendências observadas nas coletas.</p></div>
        <div className="inline-flex rounded-lg border bg-card p-1" role="group" aria-label="Período dos gráficos">
          {(["1h", "24h", "7d"] as const).map((option) => <Button key={option} type="button" variant={windowSize === option ? "default" : "ghost"} size="sm" onClick={() => selectWindow(option)} aria-pressed={windowSize === option}>{option}</Button>)}
        </div>
      </div>
      {error ? <div role="alert" className="rounded-lg border border-destructive/40 bg-card px-4 py-3 text-sm text-destructive">{error}{overview ? " · Exibindo a última coleta disponível." : null}</div> : null}
      {overview ? <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricTitles.map((title, index) => {
            const metric = overview.metrics.data?.find((item) => item.label === title)
            return <MetricCard key={title} title={title} metric={metric} block={metricBlock(overview.metrics, title, metric, overview.capabilities.statements.available, overview.capabilities.statements.reason)} icon={metricIcons[index]} topicId={metricTopics[index]} onExplain={openExplanation} />
          })}
        </div>
        <OverviewCharts connections={overview.connectionsSeries} transactions={overview.transactionsSeries} onExplain={openExplanation} />
        <DatabaseTable block={overview.databases} onExplain={openExplanation} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="secondary">{overview.instance.data?.connected ? "PostgreSQL conectado" : "PostgreSQL indisponível"}</Badge><span>Última coleta: {formatTimestamp(overview.instance.updatedAt)}</span><span>Tempo da coleta: {formatDuration(overview.instance.data?.collectionDurationMs)}</span></div>
      </> : <div className="grid min-h-72 place-items-center rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground" role="status">{loading ? "Carregando observabilidade do PostgreSQL…" : error || "Nenhuma coleta disponível."}</div>}
    </> : section === "connections" ? <ConnectionsView key={`connections-${source?.profileId}-${source?.generation}`} onExplain={openExplanation} /> : section === "performance" ? <PerformanceView key={`performance-${source?.profileId}-${source?.generation}`} onExplain={openExplanation} /> : section === "databases" ? <DatabasesView key={`databases-${source?.profileId}-${source?.generation}`} onExplain={openExplanation} /> : section === "logs" ? <LogsView key={`logs-${source?.profileId}-${source?.generation}`} onConfigure={() => selectSection("settings")} onExplain={openExplanation} /> : section === "settings" ? <DiagnosticsView key={`settings-${source?.profileId}-${source?.generation}`} profiles={profiles} source={source} onProfilesChanged={reloadProfiles} onSelectProfile={selectProfile} /> : <div className="flex min-h-80 flex-col items-start justify-center gap-3 rounded-xl border bg-card p-8">
      <h1 className="text-3xl font-bold tracking-tight">{{ connections: "Conexões", performance: "Desempenho", databases: "Bancos", logs: "Logs", settings: "Configurações" }[section]}</h1>
      <p className="text-sm text-muted-foreground">Esta seção está em desenvolvimento.</p>
    </div>}
  </DashboardShell>
}
