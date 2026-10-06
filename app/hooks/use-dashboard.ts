"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionRuntime, Overview, Period, SourceContext } from "@/lib/dashboard-types";
import { overviewForRuntime } from "@/lib/connection-runtime";

export function useDashboard(period?: Period, source?: SourceContext | null, enabled = true) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runtimeRef = useRef<ConnectionRuntime | null>(null);
  const [runtime, setRuntime] = useState<ConnectionRuntime | null>(null);
  const requestId = useRef(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const windowMs = period ? Date.parse(period.to) - Date.parse(period.from) : 60 * 60 * 1000;

  const load = useCallback(async (initial = false) => {
    if (!enabled) { setLoading(false); return }
    if (!window.bdash) {
      setError("Abra o dashboard pelo Electron para consultar o PostgreSQL.");
      setLoading(false);
      return;
    }
    const currentRequest = ++requestId.current;
    const requestedSource = sourceRef.current;
    if (initial) setLoading(true);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - windowMs);
      const next = await window.bdash.getOverview({ from: from.toISOString(), to: to.toISOString() });
      if (currentRequest !== requestId.current) return;
      if (requestedSource && (sourceRef.current?.profileId !== requestedSource.profileId || sourceRef.current?.generation !== requestedSource.generation)) return;
      if (requestedSource && (!next.sourceContext || next.sourceContext.profileId !== requestedSource.profileId || next.sourceContext.generation !== requestedSource.generation)) return;
      setOverview(next);
      setError(null);
    } catch (cause) {
      if (currentRequest === requestId.current && (!requestedSource || (sourceRef.current?.profileId === requestedSource.profileId && sourceRef.current?.generation === requestedSource.generation))) setError(cause instanceof Error ? cause.message : "Falha ao carregar o dashboard");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [windowMs, source?.profileId, source?.generation, enabled]);

  useEffect(() => {
    runtimeRef.current = null; setRuntime(null);
    if (!window.bdash) return;
    let mounted = true;
    const accept = (next: ConnectionRuntime) => {
      const current = sourceRef.current;
      if (!mounted || !current || next.sourceContext.profileId !== current.profileId || next.sourceContext.generation !== current.generation) return;
      if (runtimeRef.current && next.revision <= runtimeRef.current.revision) return;
      runtimeRef.current = next; setRuntime(next);
    };
    const unsubscribe = window.bdash.onConnectionState(accept);
    void window.bdash.getConnectionStatus().then(accept).catch(() => {});
    return () => { mounted = false; unsubscribe(); };
  }, [source?.profileId, source?.generation]);

  const refresh = useCallback(async () => {
    if (!window.bdash) return;
    if (runtimeRef.current && runtimeRef.current.state !== "connected") {
      setError(runtimeRef.current.state === "connecting" ? "Aguarde a conexão terminar." : "Origem desconectada. Use Reconectar para retomar a coleta.");
      await load();
      return;
    }
    const requestedSource = sourceRef.current;
    try {
      await window.bdash.refreshNow();
      if (requestedSource && (sourceRef.current?.profileId !== requestedSource.profileId || sourceRef.current?.generation !== requestedSource.generation)) return;
      await load();
    } catch (cause) {
      if (!requestedSource || (sourceRef.current?.profileId === requestedSource.profileId && sourceRef.current?.generation === requestedSource.generation)) setError(cause instanceof Error ? cause.message : "Falha ao atualizar o dashboard");
    }
  }, [load]);

  useEffect(() => {
    if (!enabled) { requestId.current += 1; return }
    void load(true);
    const interval = setInterval(() => { void load(); }, 15_000);
    return () => { clearInterval(interval); requestId.current += 1; };
  }, [load, enabled]);

  const visible = !source || (overview?.sourceContext?.profileId === source.profileId && overview.sourceContext.generation === source.generation) ? overview : null;
  return { overview: overviewForRuntime(visible, runtime), loading, error, refresh, runtime };
}
