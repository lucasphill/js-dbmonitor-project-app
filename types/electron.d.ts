import type { DashboardApi, DatabaseStat as BridgeDatabaseStat, ConnectionProfile as BridgeConnectionProfile, SourceContext as BridgeSourceContext } from "../lib/dashboard-types";

declare global {
  /** Compatibility for the initial boilerplate until its UI is replaced. */
  type DatabaseStat = BridgeDatabaseStat;
  type BdashConnectionProfile = BridgeConnectionProfile;
  type BdashSourceContext = BridgeSourceContext;

  interface Window {
    /** Only the named, serializable methods exposed by the Electron preload. */
    bdash?: DashboardApi;
  }
}

export {};
