"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ConnectionProfile, ConnectionTest, ProfileDraft } from "@/lib/dashboard-types"

const emptyDraft: ProfileDraft = {
  label: "", host: "", port: 5432, database: "postgres", dbUser: "",
  authMode: "rds_iam", awsRegion: "", awsProfile: null, tlsCaMode: "bundled",
}
const stageHint: Record<ConnectionTest["stage"], string> = {
  aws_identity: "Verifique a AWS CLI e a sessão SSO do perfil escolhido no terminal.",
  token: "Confirme região, endpoint RDS, usuário DB e permissão rds-db:connect.",
  network: "Confirme DNS, VPN, porta e regras do security group.",
  tls: "Confirme o endpoint RDS original e o certificado CA configurado.",
  database_auth: "Confirme o usuário PostgreSQL e a concessão da função rds_iam.",
  query: "Confirme acesso ao banco e permissão para executar consultas.",
  complete: "Conexão e consulta concluídas.",
}

function fromProfile(profile: ConnectionProfile): ProfileDraft {
  return { label: profile.label, host: profile.host, port: profile.port, database: profile.database,
    dbUser: profile.dbUser, authMode: profile.authMode, awsRegion: profile.awsRegion,
    awsProfile: profile.awsProfile, tlsCaMode: profile.tlsCaMode, tlsCaPath: profile.tlsCaPath ?? null }
}

export function ConnectionProfileForm({ profile, onSave, onCancel }: {
  profile?: ConnectionProfile | null
  onSave: (draft: ProfileDraft, password?: string) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ProfileDraft>(() => profile ? fromProfile(profile) : emptyDraft)
  const [password, setPassword] = useState("")
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [test, setTest] = useState<ConnectionTest | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft(profile ? fromProfile(profile) : emptyDraft); setPassword(""); setTest(null); setError(null) }, [profile])
  const iam = draft.authMode === "rds_iam"
  const immutable = profile?.authMode === "legacy_env"

  function change<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value })); setTest(null)
  }

  async function testConnection() {
    if (!window.bdash) return
    setTesting(true); setError(null); setTest(null)
    try {
      const result = await window.bdash.testConnectionProfile(immutable && profile ? profile.id : draft,
        iam || immutable || !password ? undefined : password)
      setTest(result)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível testar a conexão.") }
    finally { setTesting(false) }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null)
    try { await onSave(draft, iam ? undefined : password) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o perfil.") }
    finally { setSaving(false) }
  }

  return <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm font-medium">Nome do perfil<Input value={draft.label} maxLength={80} onChange={(event) => change("label", event.target.value)} required /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">Autenticação
        <Select value={draft.authMode} onValueChange={(value) => setDraft((current) => ({ ...current, authMode: value as ProfileDraft["authMode"], awsRegion: value === "rds_iam" ? current.awsRegion : null, awsProfile: value === "rds_iam" ? current.awsProfile : null, tlsCaMode: value === "rds_iam" ? "bundled" : null, tlsCaPath: null }))} disabled={!!profile} items={[{ value: "rds_iam", label: "AWS RDS IAM" }, { value: "session_password", label: "Senha nesta sessão" }]}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="rds_iam">AWS RDS IAM</SelectItem><SelectItem value="session_password">Senha nesta sessão</SelectItem></SelectGroup></SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Endpoint PostgreSQL<Input value={draft.host} onChange={(event) => change("host", event.target.value.trim())} placeholder="instancia.region.rds.amazonaws.com" disabled={immutable} required /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">Porta<Input type="number" min={1} max={65535} value={draft.port} onChange={(event) => change("port", Number(event.target.value))} disabled={immutable} required /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">Banco<Input value={draft.database} onChange={(event) => change("database", event.target.value)} disabled={immutable} required /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">Usuário do PostgreSQL<Input value={draft.dbUser} onChange={(event) => change("dbUser", event.target.value)} disabled={immutable} required /></label>
      {iam ? <>
        <label className="flex flex-col gap-1 text-sm font-medium">Região AWS<Input value={draft.awsRegion ?? ""} onChange={(event) => change("awsRegion", event.target.value.trim())} placeholder="sa-east-1" disabled={immutable} required /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">Identidade AWS local
          <Select value={draft.awsProfile !== null ? "named" : "default"} onValueChange={(value) => change("awsProfile", value === "named" ? "" : null)} disabled={immutable} items={[{ value: "default", label: "Padrão da AWS CLI" }, { value: "named", label: "Perfil AWS nomeado" }]}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="default">Padrão da AWS CLI</SelectItem><SelectItem value="named">Perfil AWS nomeado</SelectItem></SelectGroup></SelectContent>
          </Select>
        </label>
        {draft.awsProfile !== null ? <label className="flex flex-col gap-1 text-sm font-medium">Nome do perfil AWS<Input value={draft.awsProfile} onChange={(event) => change("awsProfile", event.target.value)} placeholder="meu-perfil" disabled={immutable} required /></label> : null}
        <label className="flex flex-col gap-1 text-sm font-medium">Certificado CA do RDS
          <Select value={draft.tlsCaMode || "bundled"} onValueChange={(value) => setDraft((current) => ({ ...current, tlsCaMode: value as "bundled" | "custom", tlsCaPath: value === "custom" ? current.tlsCaPath || "" : null }))} disabled={immutable} items={[{ value: "bundled", label: "Bundle oficial incluído" }, { value: "custom", label: "Arquivo CA personalizado" }]}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="bundled">Bundle oficial incluído</SelectItem><SelectItem value="custom">Arquivo CA personalizado</SelectItem></SelectGroup></SelectContent>
          </Select>
        </label>
        {draft.tlsCaMode === "custom" ? <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Caminho absoluto do arquivo CA<Input value={draft.tlsCaPath ?? ""} onChange={(event) => change("tlsCaPath", event.target.value)} placeholder="C:\\certificados\\rds-ca.pem" disabled={immutable} required /></label> : null}
        <p className="text-xs text-muted-foreground sm:col-span-2">O aplicativo usa a AWS CLI já configurada nesta máquina. Nenhuma credencial AWS ou senha é solicitada. A conexão RDS usa TLS com certificado validado.</p>
      </> : <label className="flex flex-col gap-1 text-sm font-medium">Senha para esta sessão<Input type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={profile ? "Deixe vazio para manter a senha em memória" : "Senha do PostgreSQL"} /></label>}
    </div>
    {test ? <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm"><strong>{test.status === "success" ? "Consulta concluída" : `Falha na etapa ${test.stage}`}</strong> · {test.message}<span className="block text-xs text-muted-foreground">{test.status === "success" ? "A coleta de métricas pode exigir permissões adicionais." : stageHint[test.stage]}</span></p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void testConnection()} disabled={testing || saving}>{testing ? "Testando…" : "Testar conexão"}</Button><Button type="submit" disabled={saving}>{saving ? "Salvando…" : profile ? "Salvar alterações" : "Criar perfil"}</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button></div>
  </form>
}
