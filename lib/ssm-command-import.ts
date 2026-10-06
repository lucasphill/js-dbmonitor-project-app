import type { ProfileDraft, SsmCommandImportResult, SsmImportField } from "./dashboard-types"

export const importFieldLabels: Record<SsmImportField, string> = {
  host: "Endpoint PostgreSQL", port: "Porta remota", awsRegion: "Região AWS",
  awsProfile: "Perfil AWS", ssmTarget: "Instância SSM", ssmLocalPort: "Porta local fixa",
}
export function mergeSsmImport(draft: ProfileDraft, result: SsmCommandImportResult): ProfileDraft {
  if (draft.authMode !== "rds_iam_ssm") throw new Error("Selecione AWS via SSM + IAM.")
  const candidate = { ...draft }
  for (const field of result.presentFields) {
    if (!Object.hasOwn(importFieldLabels, field) || !Object.hasOwn(result.patch, field)) throw new Error("Prévia de importação inválida.")
    Object.assign(candidate, { [field]: result.patch[field] })
  }
  // Individually supplied fields were validated by main. Validate the merged pair
  // before applying, including an endpoint or region preserved from the draft.
  if (candidate.awsRegion && !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(candidate.awsRegion)) throw new Error("Região AWS inválida.")
  if (candidate.host && (candidate.host.length > 253 || !candidate.host.split(".").every((part) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part)))) throw new Error("Endpoint inválido.")
  if (candidate.host && candidate.awsRegion) {
    const suffix = `.${candidate.awsRegion}.rds.amazonaws.com`
    const china = `${suffix}.cn`
    const host = candidate.host.toLowerCase()
    const matched = host.endsWith(china) ? china : suffix
    if (!host.endsWith(matched) || host.length <= matched.length) {
      throw new Error("Use o endpoint original do RDS na região informada.")
    }
  }
  return candidate
}
export function importReplacements(draft: ProfileDraft, result: SsmCommandImportResult) {
  return result.presentFields.filter((field) => draft[field] !== null && draft[field] !== undefined && draft[field] !== "" && draft[field] !== result.patch[field])
}
/** Shared by the form and tests: every edit invalidates outstanding responses. */
export class ImportRevision {
  private current = 0
  invalidate() { return ++this.current }
  accepts(request: number) { return request === this.current }
}
