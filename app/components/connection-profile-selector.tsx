"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ActiveProfile, ConnectionProfile, ConnectionRuntime, SourceContext } from "@/lib/dashboard-types"

export function profileDescription(profile: ConnectionProfile): string {
  return `${profile.host}:${profile.port} / ${profile.database} · ${profile.dbUser}${profile.awsRegion ? ` · ${profile.awsRegion}` : ""}${(profile.authMode === "rds_iam" || profile.authMode === "rds_iam_ssm") ? ` · AWS: ${profile.awsProfile || "padrão"}` : ""}`
}

export function ConnectionProfileSelector({ profiles, activeProfileId, busy, onSelect, sourceContext, onReconnect }: {
  sourceContext?: SourceContext | null
  onReconnect?: (active: ActiveProfile) => void
  profiles: ConnectionProfile[]
  activeProfileId: number | null
  busy?: boolean
  onSelect: (id: number) => void
}) {
  const [runtime, setRuntime] = useState<ConnectionRuntime | null>(null)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sourceRef = useRef(sourceContext); sourceRef.current = sourceContext
  const actionId = useRef(0)
  const previousProfile = useRef(sourceContext?.profileId)
  useEffect(() => () => { actionId.current += 1 }, [])
  useEffect(() => {
    if (previousProfile.current !== sourceContext?.profileId) actionId.current += 1
    previousProfile.current = sourceContext?.profileId
    setActing(false); setError(null); setRuntime(null)
    if (!window.bdash) return
    let mounted = true
    const accept = (next: ConnectionRuntime) => {
      const current = sourceRef.current
      if (!mounted || !current || next.sourceContext.profileId !== current.profileId || next.sourceContext.generation !== current.generation) return
      setRuntime((previous) => !previous || next.revision > previous.revision ? next : previous)
    }
    const unsubscribe = window.bdash.onConnectionState(accept)
    void window.bdash.getConnectionStatus().then(accept).catch(() => {})
    return () => { mounted = false; unsubscribe() }
  }, [sourceContext?.profileId, sourceContext?.generation])
  async function act(action: "reconnect" | "disconnect" | "cancel") {
    if (!window.bdash || !sourceContext) return
    const id = ++actionId.current; setActing(true); setError(null)
    try {
      if (action === "reconnect") {
        const next = await window.bdash.reconnectConnectionProfile(sourceContext)
        if (actionId.current === id && sourceRef.current?.profileId === next.profile.id && sourceRef.current.generation <= next.generation) onReconnect?.(next)
      } else {
        const next = await (action === "cancel" ? window.bdash.cancelConnectionAttempt(sourceContext) : window.bdash.disconnectConnectionProfile(sourceContext))
        if (actionId.current === id && sourceRef.current?.profileId === next.sourceContext.profileId && sourceRef.current.generation === next.sourceContext.generation) setRuntime((previous) => !previous || next.revision >= previous.revision ? next : previous)
      }
    } catch (cause) { if (actionId.current === id) setError(cause instanceof Error ? cause.message : "Falha ao alterar conexão.") }
    finally { if (actionId.current === id) setActing(false) }
  }
  const active = profiles.find((profile) => profile.id === activeProfileId)
  const options = profiles.filter((profile) => !profile.archivedAt).map((profile) => ({
    value: String(profile.id), label: `${profile.label} · ${profile.host}:${profile.port}/${profile.database}`,
  }))
  return <div className="flex min-w-0 flex-col gap-1" aria-label="Origem PostgreSQL ativa">
    <div className="flex flex-wrap items-center gap-2"><Select value={active ? String(active.id) : undefined} onValueChange={(id) => { if (id) onSelect(Number(id)) }} disabled={busy || acting || options.length === 0} items={options}>
      <SelectTrigger className="w-56 max-w-full" title={active ? profileDescription(active) : undefined}><SelectValue placeholder="Selecionar origem">{active?.label}</SelectValue></SelectTrigger>
      <SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select><Badge variant="secondary">{active?.authMode === "rds_iam_ssm" ? "SSM + IAM" : active?.authMode === "rds_iam" ? "RDS IAM" : active?.authMode === "session_password" ? "Senha da sessão" : active?.host === "localhost" ? "Padrão local" : "Legado"}</Badge></div>
    <span className="max-w-full truncate text-xs text-muted-foreground" title={active ? profileDescription(active) : undefined}>{active ? profileDescription(active) : "Origem não selecionada"}</span>
    {active?.authMode === "rds_iam_ssm" ? <div className="flex flex-wrap items-center gap-2 text-xs" role="status">
      <span>{runtime ? ({ connected: "Conectado", connecting: "Conectando", disconnected: "Desconectado", failed: "Falha na conexão" }[runtime.state]) : "Consultando conexão"}{runtime?.effectiveLocalPort ? ` · porta local ${runtime.effectiveLocalPort}` : ""}</span>
      {runtime?.state === "connecting" ? <Button size="sm" variant="outline" disabled={acting} onClick={() => void act("cancel")}>Cancelar conexão</Button> : <>
        <Button size="sm" variant="outline" disabled={acting || busy || !runtime || !onReconnect} onClick={() => void act("reconnect")}>Reconectar</Button>
        <Button size="sm" variant="ghost" disabled={acting || !runtime || runtime.state === "disconnected"} onClick={() => void act("disconnect")}>Desconectar</Button>
      </>}
      {runtime?.message ? <span>{runtime.message}</span> : null}
      {runtime?.cleanupWarning ? <span>{runtime.cleanupWarning}</span> : null}
      {error ? <span role="alert" className="text-destructive">{error}</span> : null}
    </div> : null}
  </div>
}
