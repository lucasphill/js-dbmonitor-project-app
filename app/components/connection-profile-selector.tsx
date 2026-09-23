"use client"

import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ConnectionProfile } from "@/lib/dashboard-types"

export function profileDescription(profile: ConnectionProfile): string {
  return `${profile.host}:${profile.port} / ${profile.database} · ${profile.dbUser}${profile.awsRegion ? ` · ${profile.awsRegion}` : ""}${profile.authMode === "rds_iam" ? ` · AWS: ${profile.awsProfile || "padrão"}` : ""}`
}

export function ConnectionProfileSelector({ profiles, activeProfileId, busy, onSelect }: {
  profiles: ConnectionProfile[]
  activeProfileId: number | null
  busy?: boolean
  onSelect: (id: number) => void
}) {
  const active = profiles.find((profile) => profile.id === activeProfileId)
  const options = profiles.filter((profile) => !profile.archivedAt).map((profile) => ({
    value: String(profile.id), label: `${profile.label} · ${profile.host}:${profile.port}/${profile.database}`,
  }))
  return <div className="flex min-w-0 flex-col gap-1" aria-label="Origem PostgreSQL ativa">
    <div className="flex flex-wrap items-center gap-2"><Select value={active ? String(active.id) : undefined} onValueChange={(id) => { if (id) onSelect(Number(id)) }} disabled={busy || options.length === 0} items={options}>
      <SelectTrigger className="w-56 max-w-full" title={active ? profileDescription(active) : undefined}><SelectValue placeholder="Selecionar origem">{active?.label}</SelectValue></SelectTrigger>
      <SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select><Badge variant="secondary">{active?.authMode === "rds_iam" ? "RDS IAM" : active?.authMode === "session_password" ? "Senha da sessão" : "Local legado"}</Badge></div>
    <span className="max-w-full truncate text-xs text-muted-foreground" title={active ? profileDescription(active) : undefined}>{active ? profileDescription(active) : "Origem não selecionada"}</span>
  </div>
}
