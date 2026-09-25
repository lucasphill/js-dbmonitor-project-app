"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { OperationResult, SessionDetails, SessionFilters, SessionIdentity, SessionsResult, SourceContext } from "@/lib/dashboard-types"

export function useSessions(filters: SessionFilters, source?: SourceContext | null) {
  const [result, setResult] = useState<SessionsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)
  const sourceRef = useRef(source)
  sourceRef.current = source
  const { database, user, application, state, search, sortBy, sortDirection, page } = filters
  const cursor = page.cursor
  const limit = page.limit

  const load = useCallback(async (showLoading = false) => {
    if (!window.bdash) {
      setError("Abra o dashboard pelo Electron para consultar as conexões.")
      setLoading(false)
      return
    }
    const request = ++sequence.current
    const requestedSource = sourceRef.current
    if (showLoading) setLoading(true)
    try {
      const next = await window.bdash.getSessions({ database, user, application, state, search, sortBy, sortDirection, page: { cursor, limit } })
      if (request !== sequence.current) return
      if (requestedSource && (sourceRef.current?.profileId !== requestedSource.profileId || sourceRef.current?.generation !== requestedSource.generation)) return
      if (requestedSource && (next.sourceContext?.profileId !== requestedSource.profileId || next.sourceContext.generation !== requestedSource.generation)) return
      setResult(next)
      setError(null)
    } catch (cause) {
      if (request === sequence.current) setError(cause instanceof Error ? cause.message : "Falha ao consultar conexões")
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [database, user, application, state, search, sortBy, sortDirection, cursor, limit, source?.profileId, source?.generation])

  useEffect(() => {
    void load(true)
    const timer = window.setInterval(() => { void load() }, 15_000)
    return () => { window.clearInterval(timer); sequence.current++ }
  }, [load])

  const reveal = useCallback(async (identity: SessionIdentity): Promise<SessionDetails> => {
    if (!window.bdash) throw new Error("A conexão precisa ser consultada no Electron.")
    return window.bdash.revealSessionDetails(identity)
  }, [])

  const terminate = useCallback(async (identity: SessionIdentity): Promise<OperationResult> => {
    if (!window.bdash) throw new Error("A ação administrativa só está disponível no Electron.")
    const operation = await window.bdash.terminateSession(identity)
    await load()
    return operation
  }, [load])

  const visible = !source || (result?.sourceContext?.profileId === source.profileId && result.sourceContext.generation === source.generation) ? result : null
  return { result: visible, loading, error, refresh: load, reveal, terminate }
}
