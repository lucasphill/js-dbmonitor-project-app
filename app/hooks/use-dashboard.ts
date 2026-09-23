"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Overview, Period, SourceContext } from "@/lib/dashboard-types";

export function useDashboard(period?: Period, source?: SourceContext | null) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const windowMs = period ? Date.parse(period.to) - Date.parse(period.from) : 60 * 60 * 1000;

  const load = useCallback(async (initial = false) => {
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
      if (currentRequest === requestId.current) setError(cause instanceof Error ? cause.message : "Falha ao carregar o dashboard");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [windowMs, source?.profileId, source?.generation]);

  const refresh = useCallback(async () => {
    if (!window.bdash) return;
    try {
      await window.bdash.refreshNow();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar o dashboard");
    }
  }, [load]);

  useEffect(() => {
    void load(true);
    const interval = setInterval(() => { void load(); }, 15_000);
    return () => { clearInterval(interval); requestId.current += 1; };
  }, [load]);

  const visible = !source || (overview?.sourceContext?.profileId === source.profileId && overview.sourceContext.generation === source.generation) ? overview : null;
  return { overview: visible, loading, error, refresh };
}
