"use client"

import type { ReactNode } from "react"
import { Activity, BookOpenText, Database, FileText, Gauge, LayoutDashboard, RefreshCw, Settings2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ConnectionProfile, DataBlock, InstanceHealth, SourceContext } from "@/lib/dashboard-types"
import { ConnectionProfileSelector } from "./connection-profile-selector"
import { formatAge, formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

export type SectionId = "overview" | "connections" | "performance" | "databases" | "logs" | "explanations" | "settings"

const sections = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "connections", label: "Conexões", icon: Users },
  { id: "performance", label: "Desempenho", icon: Activity },
  { id: "databases", label: "Bancos", icon: Database },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "explanations", label: "Explicações", icon: BookOpenText },
  { id: "settings", label: "Configurações", icon: Settings2 },
] as const

export function DashboardShell({
  section,
  onSectionChange,
  instance,
  refreshing,
  onRefresh,
  profiles,
  source,
  switching,
  onSelectProfile,
  children,
}: {
  section: SectionId
  onSectionChange: (section: SectionId) => void
  instance?: DataBlock<InstanceHealth>
  refreshing: boolean
  onRefresh: () => void
  profiles: ConnectionProfile[]
  source: SourceContext | null
  switching: boolean
  onSelectProfile: (id: number) => void
  children: ReactNode
}) {
  const connected = instance?.data?.connected && (instance.state === "ready" || instance.state === "partial")
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden flex-col border-r bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:self-start md:overflow-y-auto">
          <div className="flex h-[72px] items-center gap-3 border-b px-6">
            <Database className="size-7 text-primary" aria-hidden />
            <div><strong className="block text-xl leading-tight tracking-tight">DBMonitor</strong><span className="text-xs text-muted-foreground">PostgreSQL observability</span></div>
          </div>
          <nav className="flex flex-col gap-1 p-3" aria-label="Seções principais">
            {sections.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => onSectionChange(id)} aria-current={section === id ? "page" : undefined} className={cn("flex h-11 items-center gap-3 rounded-lg px-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground", section === id && "bg-accent text-accent-foreground")}>
                <Icon className="size-4.5" aria-hidden />{label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <div id="dashboard-sticky-header" className="sticky top-0 z-30 bg-card">
          <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
            <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
              <Gauge className="size-5 shrink-0 text-primary" aria-hidden />
              <ConnectionProfileSelector profiles={profiles} activeProfileId={source?.profileId ?? null} busy={switching} onSelect={onSelectProfile} />
              <Badge variant={connected ? "default" : "secondary"}>{connected ? "Saudável" : instance?.state === "loading" ? "Consultando" : "Indisponível"}</Badge>
              <span className="text-xs text-muted-foreground" title={instance?.updatedAt ? formatTimestamp(instance.updatedAt) : undefined}>Última coleta: {formatAge(instance?.updatedAt)}</span>
            </div>
            {section !== "explanations" ? <Button type="button" size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw data-icon="inline-start" aria-hidden />Atualizar agora
            </Button> : null}
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden" aria-label="Seções principais">
            {sections.map(({ id, label }) => <button key={id} type="button" onClick={() => onSectionChange(id)} aria-current={section === id ? "page" : undefined} className={cn("shrink-0 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground", section === id && "bg-accent text-accent-foreground")}>{label}</button>)}
          </nav>
          </div>
          <main className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5 px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  )
}
