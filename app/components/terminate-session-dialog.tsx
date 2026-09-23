"use client"

import { useState } from "react"
import { TriangleAlert } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog"
import type { OperationResult, SessionRow } from "@/lib/dashboard-types"
import { formatTimestamp } from "@/lib/format"

export function TerminateSessionDialog({
  session,
  open,
  onOpenChange,
  onConfirm,
}: {
  session: SessionRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (session: SessionRow) => Promise<OperationResult>
}) {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function confirm() {
    if (!session || pending) return
    setPending(true)
    setFailure(null)
    try {
      const result = await onConfirm(session)
      if (result.status === "success") onOpenChange(false)
      else setFailure(result.message || "O PostgreSQL não encerrou esta conexão.")
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Falha ao solicitar encerramento da conexão.")
    } finally {
      setPending(false)
    }
  }

  return <AlertDialog open={open} onOpenChange={(next) => { if (!pending) { setFailure(null); onOpenChange(next) } }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia><TriangleAlert className="text-destructive" aria-hidden /></AlertDialogMedia>
        <AlertDialogTitle>Encerrar conexão {session?.pid}?</AlertDialogTitle>
        <AlertDialogDescription>A consulta ou transação ativa será interrompida imediatamente. Esta ação não pode ser desfeita.</AlertDialogDescription>
      </AlertDialogHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted/50 p-3 text-sm">
        <dt className="text-muted-foreground">Banco</dt><dd>{session?.database || "Não informado"}</dd>
        <dt className="text-muted-foreground">Usuário</dt><dd>{session?.user || "Não informado"}</dd>
        <dt className="text-muted-foreground">Aplicação</dt><dd>{session?.application || "Não informada"}</dd>
        <dt className="text-muted-foreground">Início</dt><dd>{formatTimestamp(session?.backendStart)}</dd>
      </dl>
      {failure ? <p role="alert" className="text-sm text-destructive">{failure}</p> : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={!session || pending} onClick={() => void confirm()}>{pending ? "Encerrando…" : "Encerrar conexão"}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
