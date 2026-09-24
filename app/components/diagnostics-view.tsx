"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Download, RefreshCw, Save } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CapabilityMap, ConnectionProfile, Diagnostics, ExportDataset, Preferences, ProfileDraft, SourceContext, StartupState } from "@/lib/dashboard-types"
import { formatAge, formatBytes, formatTimestamp } from "@/lib/format"
import { ConnectionProfileForm } from "./connection-profile-form"
import { profileDescription } from "./connection-profile-selector"

type ExportWindow = "1h" | "24h" | "7d"
const windows: Record<ExportWindow, number> = { "1h": 1, "24h": 24, "7d": 168 }
const capabilities: { key: keyof CapabilityMap; label: string; source: string }[] = [
  { key: "activity", label: "Sessões e consultas ativas", source: "pg_stat_activity" },
  { key: "databaseStats", label: "Atividade por banco", source: "pg_stat_database" },
  { key: "io", label: "I/O", source: "pg_stat_io" },
  { key: "wal", label: "WAL", source: "pg_stat_wal" },
  { key: "statements", label: "Latência de consultas", source: "pg_stat_statements" },
  { key: "logs", label: "Eventos do servidor", source: "CSV log" },
]
const datasets: { value: ExportDataset; label: string }[] = [
  { value: "database-activity", label: "Atividade por banco" },
  { value: "sessions", label: "Sessões atuais" },
  { value: "logs", label: "Eventos de log" },
]

function dateLine(value: string | null): string {
  return value ? `${formatTimestamp(value)} (${formatAge(value)})` : "Nenhum registro"
}

export function DiagnosticsView({ profiles, source, onProfilesChanged, onSelectProfile }: {
  profiles: ConnectionProfile[]
  source: SourceContext | null
  onProfilesChanged: () => Promise<void>
  onSelectProfile: (id: number) => Promise<void>
}) {
  const [editing, setEditing] = useState<ConnectionProfile | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [dataset, setDataset] = useState<ExportDataset>("database-activity")
  const [exportWindow, setExportWindow] = useState<ExportWindow>("1h")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [startupState, setStartupState] = useState<StartupState | null>(null)
  const [startupLoading, setStartupLoading] = useState(true)
  const [startupBusy, setStartupBusy] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)
  const activeProfile = profiles.find((profile) => profile.id === source?.profileId)

  async function saveProfile(draft: ProfileDraft, password?: string) {
    if (!window.bdash) return
    setProfileBusy(true); setError(null); setNotice(null)
    try {
      if (editing) {
        const changedOrigin = draft.host !== editing.host || draft.port !== editing.port || draft.database !== editing.database || draft.dbUser !== editing.dbUser || draft.authMode !== editing.authMode || draft.awsRegion !== editing.awsRegion || draft.awsProfile !== editing.awsProfile || draft.tlsCaMode !== editing.tlsCaMode || (draft.tlsCaPath || null) !== (editing.tlsCaPath || null)
        if (changedOrigin && !window.confirm("A nova origem receberá um perfil separado. O histórico anterior ficará preservado no perfil arquivado. Continuar?")) return
        const result = await window.bdash.updateConnectionProfile(editing.id, changedOrigin ? draft : { label: draft.label }, changedOrigin)
        if (password && result.profile.authMode === "session_password") await window.bdash.setSessionPassword(result.profile.id, password)
        setNotice(changedOrigin ? "Nova origem criada. O histórico anterior permanece no perfil arquivado." : "Nome do perfil atualizado.")
        if (changedOrigin && editing.id === source?.profileId) await onSelectProfile(result.profile.id)
      } else {
        const created = await window.bdash.createConnectionProfile(draft)
        if (password && created.authMode === "session_password") await window.bdash.setSessionPassword(created.id, password)
        setNotice("Perfil criado. Teste e selecione a origem para iniciar a coleta.")
      }
      await onProfilesChanged(); setFormOpen(false); setEditing(null)
    } finally { setProfileBusy(false) }
  }

  async function archiveProfile(profile: ConnectionProfile) {
    if (!window.bdash) return
    if (profile.id === source?.profileId) { setError("Selecione outra origem antes de arquivar este perfil."); return }
    if (!window.confirm(`Arquivar ${profile.label}? O histórico será preservado e o perfil ficará indisponível para seleção.`)) return
    setProfileBusy(true); setError(null)
    try { await window.bdash.archiveConnectionProfile(profile.id, true); await onProfilesChanged(); setNotice("Perfil arquivado; histórico preservado.") }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao arquivar perfil.") }
    finally { setProfileBusy(false) }
  }

  const reloadDiagnostics = useCallback(async () => {
    if (!window.bdash) return
    try { setDiagnostics(await window.bdash.getDiagnostics()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o diagnóstico.") }
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      if (!window.bdash) { setError("Abra pelo Electron para configurar a coleta."); setLoading(false); return }
      try {
        const [nextDiagnostics, nextPreferences] = await Promise.all([window.bdash.getDiagnostics(), window.bdash.getPreferences()])
        if (active) { setDiagnostics(nextDiagnostics); setPreferences(nextPreferences); setError(null) }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar as configurações.")
      } finally { if (active) setLoading(false) }
    }
    void load()
    const timer = window.setInterval(() => { void reloadDiagnostics() }, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [reloadDiagnostics])

  useEffect(() => {
    let active = true
    async function loadStartup() {
      if (!window.bdash) {
        setStartupState({ state: "unavailable", reason: "Disponível apenas no aplicativo instalado para Windows." })
        setStartupLoading(false)
        return
      }
      try {
        const state = await window.bdash.getStartupState()
        if (active) setStartupState(state)
      } catch (cause) {
        if (active) {
          setStartupState({ state: "unavailable" })
          setStartupError(cause instanceof Error ? cause.message : "Não foi possível consultar o início automático.")
        }
      } finally { if (active) setStartupLoading(false) }
    }
    void loadStartup()
    return () => { active = false }
  }, [])

  async function refreshStartup() {
    if (!window.bdash) return
    setStartupLoading(true); setStartupError(null)
    try { setStartupState(await window.bdash.getStartupState()) }
    catch (cause) {
      setStartupState({ state: "unavailable" })
      setStartupError(cause instanceof Error ? cause.message : "Não foi possível consultar o início automático.")
    } finally { setStartupLoading(false) }
  }

  async function changeStartup(enabled: boolean) {
    if (!window.bdash || startupBusy) return
    setStartupBusy(true); setStartupError(null)
    try { setStartupState(await window.bdash.setStartupEnabled(enabled)) }
    catch (cause) {
      setStartupError(cause instanceof Error ? cause.message : "Não foi possível alterar o início automático.")
      try { setStartupState(await window.bdash.getStartupState()) }
      catch { setStartupState({ state: "unavailable" }) }
    } finally { setStartupBusy(false) }
  }

  function update(field: keyof Preferences, value: string) {
    setPreferences((current) => current ? { ...current, [field]: field === "logSourcePath" ? value || null : Number(value) } : current)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!preferences || !window.bdash) return
    if (!Number.isSafeInteger(preferences.collectionIntervalSeconds) || preferences.collectionIntervalSeconds < 5 || !Number.isSafeInteger(preferences.metricsRetentionDays) || preferences.metricsRetentionDays < 1 || !Number.isSafeInteger(preferences.logsRetentionDays) || preferences.logsRetentionDays < 1) {
      setError("Use intervalo de pelo menos 5 segundos e retenções de pelo menos 1 dia.")
      return
    }
    setSaving(true); setError(null); setNotice(null)
    try {
      const saved = await window.bdash.updatePreferences(preferences)
      setPreferences(saved)
      setNotice("Preferências salvas. A política de retenção será aplicada automaticamente.")
      await reloadDiagnostics()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar as preferências.") }
    finally { setSaving(false) }
  }

  async function retry() {
    if (!window.bdash) return
    setRetrying(true); setError(null); setNotice(null)
    try {
      const result = await window.bdash.refreshNow()
      setNotice(result.state === "success" ? "Nova coleta concluída." : `Nova tentativa: ${result.state}. Consulte as falhas abaixo.`)
      await reloadDiagnostics()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao tentar nova coleta.") }
    finally { setRetrying(false) }
  }

  async function exportCsv() {
    if (!window.bdash || !source) return
    setExporting(true); setError(null); setNotice(null)
    try {
      const to = new Date()
      const period = { from: new Date(to.getTime() - windows[exportWindow] * 3_600_000).toISOString(), to: to.toISOString() }
      const result = await window.bdash.exportFiltered({ dataset, period, sourceContext: source })
      if (!result.canceled) setNotice(`CSV exportado: ${result.rowCount} linhas.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na exportação CSV.") }
    finally { setExporting(false) }
  }

  return <section className="flex flex-col gap-5" aria-labelledby="diagnostics-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 id="diagnostics-title" className="text-3xl font-bold tracking-tight">Configurações e diagnóstico</h1><p className="mt-1 text-sm text-muted-foreground">Saúde da coleta, capacidades, armazenamento e retenção local.</p></div><Button type="button" variant="outline" size="sm" onClick={() => void retry()} disabled={retrying || loading}><RefreshCw data-icon="inline-start" aria-hidden />{retrying ? "Tentando…" : "Tentar nova coleta"}</Button></div>
    {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-card p-3 text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="rounded-lg border bg-card p-3 text-sm">{notice}</p> : null}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Carregando diagnóstico…</p> : null}

    <Card><CardHeader><CardTitle className="text-base font-semibold">Inicialização do aplicativo</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor="startup-enabled" className="flex items-center gap-3 font-medium">
          <input id="startup-enabled" type="checkbox" className="size-4 accent-primary" checked={startupState?.state === "enabled"} disabled={startupLoading || startupBusy || !startupState || startupState.state === "unavailable"} aria-describedby="startup-description startup-status" onChange={(event) => void changeStartup(event.target.checked)} />
          Iniciar com o Windows
        </label>
        <Button type="button" variant="outline" size="sm" onClick={() => void refreshStartup()} disabled={startupLoading || startupBusy}>Atualizar estado</Button>
      </div>
      <p id="startup-description" className="text-muted-foreground">Após entrar na sua conta do Windows, o DBMonitor inicia minimizado na barra de tarefas. Clique nele na barra para restaurar a janela. Esta opção vale para o aplicativo, independentemente da origem PostgreSQL selecionada.</p>
      <p id="startup-status" role="status">{startupLoading ? "Consultando início automático…" : startupBusy ? "Alterando início automático…" : startupState?.state === "enabled" ? "Ativado" : startupState?.state === "disabled" ? "Desativado" : "Indisponível"}{startupState?.reason ? ` — ${startupState.reason}` : ""}</p>
      {startupError ? <p role="alert" className="text-destructive">{startupError}</p> : null}
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base font-semibold">Origens PostgreSQL</CardTitle><p className="text-xs text-muted-foreground">Selecione uma origem no cabeçalho. Cada perfil mantém suas próprias coletas, preferências e histórico.</p></CardHeader><CardContent className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">{profiles.map((profile) => <div key={profile.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>{profile.label}</strong><Badge variant={profile.id === source?.profileId ? "default" : "secondary"}>{profile.archivedAt ? "Arquivado" : profile.id === source?.profileId ? "Ativo" : "Disponível"}</Badge><Badge variant="outline">{profile.authMode === "rds_iam" ? "RDS IAM" : profile.authMode === "session_password" ? "Senha da sessão" : "Legado"}</Badge></div><p className="break-all text-xs text-muted-foreground">{profileDescription(profile)}</p></div>
        <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void onSelectProfile(profile.id)} disabled={profileBusy || !!profile.archivedAt || profile.id === source?.profileId}>Selecionar</Button><Button type="button" size="sm" variant="outline" onClick={() => { setEditing(profile); setFormOpen(true) }} disabled={profileBusy || !!profile.archivedAt}>Editar</Button><Button type="button" size="sm" variant="ghost" onClick={() => void archiveProfile(profile)} disabled={profileBusy || !!profile.archivedAt || profile.id === source?.profileId}>Arquivar</Button></div>
      </div>)}</div>
      {!formOpen ? <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>Adicionar origem</Button> : <div className="rounded-lg border p-4"><h3 className="mb-3 font-semibold">{editing ? `Editar ${editing.label}` : "Novo perfil PostgreSQL"}</h3><ConnectionProfileForm profile={editing} onSave={saveProfile} onCancel={() => { setFormOpen(false); setEditing(null) }} /></div>}
      <p className="text-xs text-muted-foreground">O teste de conexão confirma acesso e uma consulta ao PostgreSQL. Métricas administrativas podem exigir privilégios adicionais. Para AWS SSO expirado, execute <code>aws sso login --profile nome</code> no terminal.</p>
    </CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base font-semibold">Saúde da coleta</CardTitle></CardHeader><CardContent className="flex flex-col gap-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2"><dt className="text-muted-foreground">Último sucesso</dt><dd>{dateLine(diagnostics?.lastCollectionSuccessAt ?? null)}</dd><dt className="text-muted-foreground">Última falha</dt><dd>{dateLine(diagnostics?.lastCollectionFailureAt ?? null)}</dd><dt className="text-muted-foreground">Causa da falha</dt><dd>{diagnostics?.lastCollectionFailure || "Nenhuma falha recente"}</dd><dt className="text-muted-foreground">Espaço local</dt><dd>{formatBytes(diagnostics?.storageBytes)}</dd></dl>
        <p className="text-xs text-muted-foreground">Coletas ocorrem enquanto o aplicativo está aberto. Intervalos sem coleta aparecem como lacunas no histórico.</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base font-semibold">Fonte de logs</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 text-sm"><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2"><dt className="text-muted-foreground">Último evento processado</dt><dd>{dateLine(diagnostics?.lastLogSuccessAt ?? null)}</dd><dt className="text-muted-foreground">Última falha</dt><dd>{dateLine(diagnostics?.lastLogFailureAt ?? null)}</dd><dt className="text-muted-foreground">Diagnóstico</dt><dd>{diagnostics?.lastLogFailure || "Sem falha informada"}</dd></dl><p className="text-xs text-muted-foreground">{activeProfile?.authMode === "rds_iam" ? "Logs CSV de uma instalação local não representam esta instância RDS. Configure uma fonte de logs própria, se disponível." : "Configure um arquivo CSV do PostgreSQL acessível nesta máquina para visualizar eventos."}</p></CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="text-base font-semibold">Capacidades da instância</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {capabilities.map(({ key, label, source }) => {
        const capability = diagnostics?.capabilities?.[key]
        return <div key={key} className="flex min-w-0 flex-col gap-1 rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{label}</strong><Badge variant={capability?.available ? "default" : "secondary"}>{capability?.available ? "Disponível" : "Indisponível"}</Badge></div><span className="text-xs text-muted-foreground">{source}</span>{capability?.reason ? <span className="text-xs text-muted-foreground">{capability.reason}</span> : null}</div>
      })}
    </CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base font-semibold">Coleta e retenção</CardTitle></CardHeader><CardContent>
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">Intervalo de coleta (segundos)<Input type="number" min={5} max={3600} step={1} value={preferences?.collectionIntervalSeconds ?? ""} onChange={(event) => update("collectionIntervalSeconds", event.target.value)} required /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Retenção de métricas (dias)<Input type="number" min={1} max={3650} step={1} value={preferences?.metricsRetentionDays ?? ""} onChange={(event) => update("metricsRetentionDays", event.target.value)} required /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Retenção de logs (dias)<Input type="number" min={1} max={3650} step={1} value={preferences?.logsRetentionDays ?? ""} onChange={(event) => update("logsRetentionDays", event.target.value)} required /></label>
          {activeProfile?.authMode === "rds_iam"
            ? <p className="text-xs text-muted-foreground">Arquivos CSV locais não são disponibilizados automaticamente por instâncias RDS.</p>
            : <label className="flex flex-col gap-1 text-sm font-medium">Arquivo CSV de logs<Input type="text" value={preferences?.logSourcePath ?? ""} onChange={(event) => update("logSourcePath", event.target.value)} placeholder="Caminho absoluto do arquivo .csv" /><span className="text-xs font-normal text-muted-foreground">Deixe vazio se a fonte ainda não estiver configurada.</span></label>}
          <p className="text-xs text-muted-foreground">Política vigente: {diagnostics?.metricsRetentionDays ?? preferences?.metricsRetentionDays ?? "—"} dias para métricas e {diagnostics?.logsRetentionDays ?? preferences?.logsRetentionDays ?? "—"} dias para logs.</p>
          <Button type="submit" size="sm" disabled={!preferences || saving}><Save data-icon="inline-start" aria-hidden />{saving ? "Salvando…" : "Salvar preferências"}</Button>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base font-semibold">Exportar CSV</CardTitle></CardHeader><CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">Escolha o conjunto e o período para exportar. O arquivo não inclui credenciais; o destino é escolhido no sistema.</p>
        <label className="flex flex-col gap-1 font-medium">Conjunto de dados<Select value={dataset} onValueChange={(value) => setDataset(value as ExportDataset)} items={datasets}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{datasets.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
        <label className="flex flex-col gap-1 font-medium">Período<Select value={exportWindow} onValueChange={(value) => setExportWindow(value as ExportWindow)} items={[{ value: "1h", label: "Última hora" }, { value: "24h", label: "Últimas 24 horas" }, { value: "7d", label: "Últimos 7 dias" }]}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="1h">Última hora</SelectItem><SelectItem value="24h">Últimas 24 horas</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem></SelectGroup></SelectContent></Select></label>
        {dataset === "sessions" ? <p className="text-xs text-muted-foreground">Sessões são um retrato do momento atual; o período não altera esse conjunto.</p> : null}
        <Button type="button" variant="outline" size="sm" onClick={() => void exportCsv()} disabled={exporting}><Download data-icon="inline-start" aria-hidden />{exporting ? "Exportando…" : "Exportar CSV"}</Button>
      </CardContent></Card>
    </div>
  </section>
}
