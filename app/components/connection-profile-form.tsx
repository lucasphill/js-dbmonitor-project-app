"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ConnectionProfile, ConnectionTest, ProfileDraft, SsmCommandImportResult } from "@/lib/dashboard-types"

import { ImportRevision, importFieldLabels, importReplacements, mergeSsmImport } from "@/lib/ssm-command-import"

const emptyDraft: ProfileDraft = {
  label: "", host: "", port: 5432, database: "postgres", dbUser: "",
  authMode: "rds_iam", awsRegion: "", awsProfile: null, tlsCaMode: "bundled",
}
const stageHint: Record<ConnectionTest["stage"], string> = {
  prerequisites: "Verifique AWS CLI e Session Manager plugin.",
  tunnel: "Verifique instância SSM, permissões, acesso ao RDS e porta local.",
  aws_identity: "Verifique a AWS CLI e a sessão SSO do perfil escolhido no terminal.",
  token: "Confirme região, endpoint RDS, usuário DB e permissão rds-db:connect.",
  network: "Confirme DNS, VPN, porta e regras do security group.",
  tls: "Confirme o endpoint RDS original e o certificado CA configurado.",
  database_auth: "Confirme o usuário PostgreSQL e a concessão da função rds_iam.",
  query: "Confirme acesso ao banco e permissão para executar consultas.",
  complete: "Conexão e consulta concluídas.",
}
const importErrorMessages: Record<string, string> = {
  SSM_IMPORT_INVALID_INPUT: "Informe um comando de até 16 KiB em UTF-8, sem caracteres de controle.",
  SSM_IMPORT_INVALID_SYNTAX: "Confira as aspas, os parâmetros e os valores duplicados do comando.",
  SSM_IMPORT_UNSUPPORTED_COMMAND: "Use aws ssm start-session com AWS-StartPortForwardingSessionToRemoteHost e somente as opções permitidas.",
  SSM_IMPORT_UNSAFE_CONTENT: "Use valores literais, sem variáveis, credenciais, encadeamentos ou execução embutida.",
  INVALID_INPUT: "Confira endpoint, região AWS, instância SSM, perfil AWS e portas fornecidos.",
}

function fromProfile(profile: ConnectionProfile): ProfileDraft {
  return { label: profile.label, host: profile.host, port: profile.port, database: profile.database,
    dbUser: profile.dbUser, authMode: profile.authMode, awsRegion: profile.awsRegion,
    awsProfile: profile.awsProfile, tlsCaMode: profile.tlsCaMode, tlsCaPath: profile.tlsCaPath ?? null, ssmTarget: profile.ssmTarget ?? null, ssmLocalPort: profile.ssmLocalPort ?? null }
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
  const [commandText, setCommandText] = useState("")
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<SsmCommandImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importRevision = useRef(new ImportRevision())
  function invalidateImport(clearText = false) {
    importRevision.current.invalidate(); setPreview(null); setImporting(false); setImportError(null)
    if (clearText) setCommandText("")
  }
  async function importCommand() {
    if (!window.bdash || testing || saving) return
    const revision = importRevision.current.invalidate()
    setImporting(true); setPreview(null); setImportError(null)
    try {
      const response = await window.bdash.importSsmConnectionCommand(commandText)
      if (importRevision.current.accepts(revision)) {
        if (response.ok) setPreview(response.data)
        else setImportError(importErrorMessages[response.error.code] ?? "Não foi possível importar o comando SSM. Tente novamente.")
      }
    } catch {
      if (importRevision.current.accepts(revision)) setImportError("Não foi possível importar o comando SSM. Tente novamente.")
    }
    finally { if (importRevision.current.accepts(revision)) setImporting(false) }
  }
  function applyImport() {
    if (!preview || testing || saving) return
    try {
      const candidate = mergeSsmImport(draft, preview)
      cancelTest(); setTest(null); setError(null); setDraft(candidate); invalidateImport(true)
    } catch (cause) { setImportError(cause instanceof Error ? cause.message : "Não foi possível aplicar a importação.") }
  }
  const pendingTest = useRef<string | null>(null)
  function cancelTest() {
    const id = pendingTest.current; pendingTest.current = null; setTesting(false)
    if (id && window.bdash) void window.bdash.cancelConnectionTest(id).catch(() => {})
  }
  useEffect(() => () => { importRevision.current.invalidate(); const id = pendingTest.current; pendingTest.current = null; if (id && window.bdash) void window.bdash.cancelConnectionTest(id).catch(() => {}) }, [])
  useEffect(() => { invalidateImport(true); cancelTest(); setDraft(profile ? fromProfile(profile) : emptyDraft); setPassword(""); setTest(null); setError(null) }, [profile])
  const iam = draft.authMode === "rds_iam" || draft.authMode === "rds_iam_ssm"
  const ssm = draft.authMode === "rds_iam_ssm"
  const immutable = profile?.authMode === "legacy_env"

  function change<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    invalidateImport(); cancelTest(); setDraft((current) => ({ ...current, [key]: value })); setTest(null)
  }

  async function testConnection() {
    if (!window.bdash) return
    invalidateImport(); const id = crypto.randomUUID(); pendingTest.current = id
    setTesting(true); setError(null); setTest(null)
    try {
      const result = await window.bdash.testConnectionProfile(immutable && profile ? profile.id : draft,
        iam || immutable || !password ? undefined : password, { requestId: id })
      if (pendingTest.current === id) setTest(result)
    } catch (cause) { if (pendingTest.current === id) setError(cause instanceof Error ? cause.message : "Não foi possível testar a conexão.") }
    finally { if (pendingTest.current === id) { pendingTest.current = null; setTesting(false) } }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); invalidateImport(); setSaving(true); setError(null)
    try { await onSave(draft, iam ? undefined : password) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o perfil.") }
    finally { setSaving(false) }
  }

  return <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
    {ssm ? <section className="rounded-lg border p-3 space-y-3" aria-label="Importar comando SSM">
      <label className="flex flex-col gap-1 text-sm font-medium">Comando de conexão SSM
        <textarea aria-describedby="ssm-import-help" className="min-h-24 w-full rounded-md border bg-background p-2 font-mono text-xs" value={commandText} maxLength={16384} spellCheck={false} autoComplete="off" disabled={testing || saving} onChange={(event) => { invalidateImport(); setCommandText(event.target.value) }} placeholder='aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost …' />
      </label>
      <p id="ssm-import-help" className="text-xs text-muted-foreground">Cole um único comando aws ssm start-session, até 16 KiB em UTF-8. A importação apenas extrai dados; não executa o comando, salva ou conecta. Complete nome, banco e usuário abaixo.</p>
      <Button type="button" variant="outline" disabled={!commandText.trim() || importing || testing || saving} onClick={() => void importCommand()}>{importing ? "Importando…" : "Importar comando"}</Button>
      {preview ? <div role="status" className="space-y-2 text-sm">
        <strong>Revise antes de aplicar</strong>
        {preview.presentFields.length ? <dl className="space-y-1">{preview.presentFields.map((field) => <div key={field}><dt className="inline font-medium">{importFieldLabels[field]}: </dt><dd className="inline break-all">{String(preview.patch[field])}{importReplacements(draft, preview).includes(field) ? <span className="text-muted-foreground"> · substituirá {String(draft[field])}</span> : null}</dd></div>)}</dl> : <p>Nenhum campo de conexão foi fornecido.</p>}
        {preview.missingFields.length ? <p>Ausentes no comando (valores atuais serão preservados): {preview.missingFields.map((field) => importFieldLabels[field]).join(", ")}. Complete os campos que ainda estiverem vazios.</p> : null}
        <div className="flex gap-2"><Button type="button" disabled={testing || saving} onClick={applyImport}>Aplicar dados</Button><Button type="button" variant="ghost" onClick={() => invalidateImport(true)}>Descartar importação</Button></div>
      </div> : commandText ? <Button type="button" variant="ghost" onClick={() => invalidateImport(true)} disabled={testing || saving}>Descartar importação</Button> : null}
      {importError ? <p role="alert" className="text-sm text-destructive">{importError}</p> : null}
    </section> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm font-medium">Nome do perfil<Input value={draft.label} maxLength={80} onChange={(event) => change("label", event.target.value)} required /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">Autenticação
        <Select value={draft.authMode} onValueChange={(value) => { invalidateImport(true); cancelTest(); setPassword(""); setTest(null); setDraft((current) => ({ ...current, ssmTarget: value === "rds_iam_ssm" ? current.ssmTarget || "" : null, ssmLocalPort: value === "rds_iam_ssm" ? current.ssmLocalPort ?? null : null, authMode: value as ProfileDraft["authMode"], awsRegion: (value === "rds_iam" || value === "rds_iam_ssm") ? current.awsRegion : null, awsProfile: (value === "rds_iam" || value === "rds_iam_ssm") ? current.awsProfile : null, tlsCaMode: (value === "rds_iam" || value === "rds_iam_ssm") ? "bundled" : null, tlsCaPath: null })) }} disabled={!!profile} items={[{ value: "rds_iam_ssm", label: "AWS via SSM + IAM" }, { value: "rds_iam", label: "AWS RDS IAM" }, { value: "session_password", label: "Senha nesta sessão" }]}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="rds_iam_ssm">AWS via SSM + IAM</SelectItem><SelectItem value="rds_iam">AWS RDS IAM</SelectItem><SelectItem value="session_password">Senha nesta sessão</SelectItem></SelectGroup></SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Endpoint PostgreSQL<Input value={draft.host} onChange={(event) => change("host", event.target.value.trim())} placeholder="instancia.region.rds.amazonaws.com" disabled={immutable} required /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">Porta<Input type="number" min={1} max={65535} value={draft.port} onChange={(event) => change("port", Number(event.target.value))} disabled={immutable} required /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">Banco<Input value={draft.database} onChange={(event) => change("database", event.target.value)} disabled={immutable} required /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">Usuário do PostgreSQL<Input value={draft.dbUser} onChange={(event) => change("dbUser", event.target.value)} disabled={immutable} required /></label>
      {ssm ? <>
        <label className="flex flex-col gap-1 text-sm font-medium">Instância EC2 gerenciada pelo SSM<Input value={draft.ssmTarget ?? ""} onChange={(event) => change("ssmTarget", event.target.value.trim())} placeholder="i-0123456789abcdef0" pattern="i-([0-9a-f]{8}|[0-9a-f]{17})" required /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">Porta local do túnel
          <Select value={draft.ssmLocalPort == null ? "automatic" : "manual"} onValueChange={(value) => change("ssmLocalPort", value === "manual" ? 15432 : null)} items={[{ value: "automatic", label: "Automática" }, { value: "manual", label: "Escolher porta" }]}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="automatic">Automática</SelectItem><SelectItem value="manual">Escolher porta</SelectItem></SelectGroup></SelectContent>
          </Select>
        </label>
        {draft.ssmLocalPort != null ? <label className="flex flex-col gap-1 text-sm font-medium">Porta local fixa<Input type="number" min={1} max={65535} value={draft.ssmLocalPort} onChange={(event) => change("ssmLocalPort", Number(event.target.value))} required /></label> : null}
        <p className="text-xs text-muted-foreground sm:col-span-2">Use o endpoint e a porta do RDS remoto acima. O aplicativo abre o túnel e gera o token IAM automaticamente; a EC2 precisa alcançar o RDS.</p>
      </> : null}
      {iam ? <>
        <label className="flex flex-col gap-1 text-sm font-medium">Região AWS<Input value={draft.awsRegion ?? ""} onChange={(event) => change("awsRegion", event.target.value.trim())} placeholder="sa-east-1" disabled={immutable} required /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">Identidade AWS local
          <Select value={draft.awsProfile !== null ? "named" : "default"} onValueChange={(value) => change("awsProfile", value === "named" ? "" : null)} disabled={immutable} items={[{ value: "default", label: "Padrão da AWS CLI" }, { value: "named", label: "Perfil AWS nomeado" }]}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="default">Padrão da AWS CLI</SelectItem><SelectItem value="named">Perfil AWS nomeado</SelectItem></SelectGroup></SelectContent>
          </Select>
        </label>
        {draft.awsProfile !== null ? <label className="flex flex-col gap-1 text-sm font-medium">Nome do perfil AWS<Input value={draft.awsProfile} onChange={(event) => change("awsProfile", event.target.value)} placeholder="meu-perfil" disabled={immutable} required /></label> : null}
        <label className="flex flex-col gap-1 text-sm font-medium">Certificado CA do RDS
          <Select value={draft.tlsCaMode || "bundled"} onValueChange={(value) => { invalidateImport(); cancelTest(); setTest(null); setDraft((current) => ({ ...current, tlsCaMode: value as "bundled" | "custom", tlsCaPath: value === "custom" ? current.tlsCaPath || "" : null })) }} disabled={immutable} items={[{ value: "bundled", label: "Bundle oficial incluído" }, { value: "custom", label: "Arquivo CA personalizado" }]}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="bundled">Bundle oficial incluído</SelectItem><SelectItem value="custom">Arquivo CA personalizado</SelectItem></SelectGroup></SelectContent>
          </Select>
        </label>
        {draft.tlsCaMode === "custom" ? <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Caminho absoluto do arquivo CA<Input value={draft.tlsCaPath ?? ""} onChange={(event) => change("tlsCaPath", event.target.value)} placeholder="C:\\certificados\\rds-ca.pem" disabled={immutable} required /></label> : null}
        <p className="text-xs text-muted-foreground sm:col-span-2">O aplicativo usa a AWS CLI já configurada nesta máquina. Nenhuma credencial AWS ou senha é solicitada. A conexão RDS usa TLS com certificado validado.</p>
      </> : immutable ? <p className="text-xs text-muted-foreground sm:col-span-2">A conexão deste perfil inicial usa a senha local padrão. Para usar outra credencial, crie um perfil com senha de sessão.</p>
        : <label className="flex flex-col gap-1 text-sm font-medium">Senha para esta sessão<Input type="password" autoComplete="off" value={password} onChange={(event) => { cancelTest(); setTest(null); setPassword(event.target.value) }} placeholder={profile ? "Deixe vazio para manter a senha em memória" : "Senha do PostgreSQL"} /></label>}
    </div>
    {test ? <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm"><strong>{test.canceled ? "Teste cancelado" : test.status === "success" ? "Consulta concluída" : `Falha na etapa ${test.stage}`}</strong> · {test.message}<span className="block text-xs text-muted-foreground">{test.status === "success" ? "A coleta de métricas pode exigir permissões adicionais." : stageHint[test.stage]}</span></p> : null}
    {test?.cleanupWarning ? <p role="status" className="text-sm text-muted-foreground">{test.cleanupWarning}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void testConnection()} disabled={testing || saving}>{testing ? "Testando…" : "Testar conexão"}</Button>{testing ? <Button type="button" variant="outline" onClick={cancelTest}>Cancelar teste</Button> : null}<Button type="submit" disabled={saving || testing}>{saving ? "Salvando…" : profile ? "Salvar alterações" : "Criar perfil"}</Button><Button type="button" variant="ghost" onClick={() => { invalidateImport(true); cancelTest(); onCancel() }}>Cancelar</Button></div>
  </form>
}
