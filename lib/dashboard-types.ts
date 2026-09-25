/** UTC timestamp serialized across the Electron context bridge. */
export type ISODate = string;
export type ProfileId = number;
export type AuthMode = "legacy_env" | "session_password" | "rds_iam";
export interface SourceContext { profileId: ProfileId; generation: number }
export interface ConnectionProfile {
  id: ProfileId; label: string; host: string; port: number; database: string;
  dbUser: string; authMode: AuthMode; awsRegion: string | null;
  awsProfile: string | null; tlsCaMode: "bundled" | "custom" | null;
  tlsCaPath?: string | null;
  archivedAt: ISODate | null; createdAt: ISODate; updatedAt: ISODate;
}
export type ProfileDraft = Omit<ConnectionProfile, "id" | "archivedAt" | "createdAt" | "updatedAt"> & { tlsCaPath?: string | null };
export interface ActiveProfile { profile: ConnectionProfile; generation: number }
export interface ConnectionTest {
  status: "success" | "failed";
  stage: "aws_identity" | "token" | "network" | "tls" | "database_auth" | "query" | "complete";
  checkedAt: ISODate; profileId?: ProfileId; database?: string; dbUser?: string;
  serverVersion?: string; message: string;
}

export type SourceState =
  | "ready"
  | "loading"
  | "empty"
  | "insufficient"
  | "unavailable"
  | "partial"
  | "stale"
  | "error";

export interface DataBlock<T> {
  sourceContext?: SourceContext;
  state: SourceState;
  source: string;
  updatedAt?: ISODate;
  unit?: string;
  reason?: string;
  data?: T;
}

export interface Period {
  from: ISODate;
  to: ISODate;
}

/** `limit` is validated by the main process to the inclusive range 1..200. */
export interface Page {
  limit: number;
  cursor?: string;
}

/** Both values must be sent to protect against reuse of a process ID. */
export interface SessionIdentity {
  pid: number;
  backendStart: ISODate;
  profileId?: ProfileId;
  generation?: number;
}

export type OperationStatus =
  | "success"
  | "not_found"
  | "identity_changed"
  | "protected"
  | "denied"
  | "failed";

export interface OperationResult {
  status: OperationStatus;
  message: string;
  auditedAt: ISODate;
}

export interface IpcError {
  code: string;
  message: string;
}

export interface DatabaseStat {
  name: string;
  connections: number;
  commits: number;
  rollbacks: number;
}

export interface InstanceHealth {
  database: string;
  version: string | null;
  serverStartedAt: ISODate | null;
  maxConnections: number | null;
  connected: boolean;
  collectionDurationMs: number | null;
}

export interface Capability {
  available: boolean;
  reason?: string;
}

export interface CapabilityMap {
  activity: Capability;
  databaseStats: Capability;
  io: Capability;
  wal: Capability;
  statements: Capability;
  logs: Capability;
}

export interface Metric {
  value: number | null;
  unit: string;
  label: string;
}

export interface TimePoint {
  at: ISODate;
  value: number | null;
  /** A reset or missed collection starts a new segment; charts must show a gap. */
  segment?: number;
}

export interface DatabaseSummary {
  oid: number;
  name: string;
  connections: number;
  commits: number;
  rollbacks: number;
  blocksRead: number;
  cacheHits: number;
  statsReset: ISODate | null;
}

export interface Overview {
  sourceContext?: SourceContext;
  instance: DataBlock<InstanceHealth>;
  capabilities: CapabilityMap;
  metrics: DataBlock<Metric[]>;
  connectionsSeries: DataBlock<TimePoint[]>;
  transactionsSeries: DataBlock<TimePoint[]>;
  databases: DataBlock<DatabaseSummary[]>;
}

export type SessionState = "active" | "idle" | "idle in transaction" | "idle in transaction (aborted)" | "fastpath function call" | "disabled" | "finished" | null;

export interface SessionRow extends SessionIdentity {
  databaseOid: number | null;
  database: string | null;
  user: string | null;
  application: string;
  state: SessionState;
  /** First valid collection in which this session was absent; null while open. */
  finishedAt: ISODate | null;
  waitEventType: string | null;
  waitEvent: string | null;
  backendType: string;
  queryStartedAt: ISODate | null;
  transactionStartedAt: ISODate | null;
  activeDurationMs: number | null;
  /** Deliberately excludes query text and client address. */
}

export interface SessionFilters {
  database?: string;
  user?: string;
  application?: string;
  state?: string;
  search?: string;
  sortBy?: "duration" | "startedAt" | "finishedAt" | "database" | "user" | "state" | "pid";
  sortDirection?: "asc" | "desc";
  page: Page;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  nextCursor?: string;
}

export interface SessionsResult {
  sourceContext?: SourceContext;
  sessions: DataBlock<Paginated<SessionRow>>;
  byState: Record<string, number>;
}

export interface SessionDetails extends SessionIdentity {
  sourceContext?: SourceContext;
  state: SourceState;
  query: string | null;
  clientAddress: string | null;
  reason?: string;
}

export interface DatabaseActivityRow extends DatabaseSummary {
  transactionsInPeriod: number | null;
  readsInPeriod: number | null;
  cacheHitsInPeriod: number | null;
}

export interface DatabaseInventoryRow {
  oid: number;
  name: string;
  sizeBytes: number | null;
  owner: string;
  encoding: string;
  collation: string;
  connections: number;
  connectionLimit: number;
  allowsConnections: boolean;
  template: boolean;
}

export interface DatabaseInventoryFilters {
  search?: string;
  owner?: string;
  encoding?: string;
  status?: "available" | "blocked" | "template";
  sortBy?: "name" | "size" | "owner" | "encoding" | "collation" | "connections" | "connectionLimit" | "status";
  sortDirection?: "asc" | "desc";
  page: Page;
}

export interface DatabaseInventory {
  sourceContext?: SourceContext;
  databases: DataBlock<Paginated<DatabaseInventoryRow>>;
}

export interface DatabaseActivity {
  sourceContext?: SourceContext;
  ranking: DataBlock<Paginated<DatabaseActivityRow>>;
  connectionsSeries: DataBlock<TimePoint[]>;
  transactionsSeries: DataBlock<TimePoint[]>;
  readsSeries: DataBlock<TimePoint[]>;
  cacheSeries: DataBlock<TimePoint[]>;
}

export interface QueryAggregate {
  databaseOid: number;
  userOid: number;
  queryId: string;
  calls: number;
  totalTimeMs: number;
  meanTimeMs: number;
  blocksRead: number | null;
  cacheHits: number | null;
}

export interface Performance {
  sourceContext?: SourceContext;
  activeQueries: DataBlock<Paginated<SessionRow>>;
  queryAggregates: DataBlock<Paginated<QueryAggregate>>;
  walSeries: DataBlock<TimePoint[]>;
  ioSeries: DataBlock<TimePoint[]>;
  collectionDurationSeries: DataBlock<TimePoint[]>;
}

export interface LogEvent {
  id: number;
  eventAt: ISODate;
  ingestedAt: ISODate;
  severity: string;
  database: string | null;
  user: string | null;
  pid: number | null;
  sqlState: string | null;
  message: string;
}

export interface LogFilters {
  period: Period;
  severity?: string;
  database?: string;
  user?: string;
  pid?: number;
  search?: string;
  page: Page;
}

export interface Preferences {
  sourceContext: SourceContext;
  collectionIntervalSeconds: number;
  metricsRetentionDays: number;
  logsRetentionDays: number;
  logSourcePath: string | null;
}

export interface StartupState {
  state: "enabled" | "disabled" | "unavailable";
  reason?: string;
}

export interface Diagnostics {
  sourceContext?: SourceContext;
  capabilities: CapabilityMap;
  lastCollectionSuccessAt: ISODate | null;
  lastCollectionFailureAt: ISODate | null;
  lastCollectionFailure: string | null;
  lastLogSuccessAt: ISODate | null;
  lastLogFailureAt: ISODate | null;
  lastLogFailure: string | null;
  storageBytes: number | null;
  metricsRetentionDays: number;
  logsRetentionDays: number;
}

export interface RefreshResult {
  sourceContext?: SourceContext;
  state: "running" | "success" | "partial" | "failed";
  startedAt: ISODate;
  finishedAt?: ISODate;
}

export type ExportDataset = "database-activity" | "sessions" | "logs";

export interface ExportRequest {
  sourceContext: SourceContext;
  dataset: ExportDataset;
  period?: Period;
  sessionFilters?: SessionFilters;
  logFilters?: LogFilters;
}

export interface ExportResult {
  sourceContext?: SourceContext;
  canceled: boolean;
  filePath?: string;
  rowCount: number;
}

/** Public renderer contract. The main process validates every input at runtime. */
export interface DashboardApi {
  getStartupState(): Promise<StartupState>;
  setStartupEnabled(enabled: boolean): Promise<StartupState>;
  listConnectionProfiles(includeArchived?: boolean): Promise<{ profiles: ConnectionProfile[]; activeProfileId: ProfileId; generation: number }>;
  testConnectionProfile(draftOrId: ProfileDraft | ProfileId, transientPassword?: string): Promise<ConnectionTest>;
  createConnectionProfile(draft: ProfileDraft): Promise<ConnectionProfile>;
  updateConnectionProfile(id: ProfileId, changes: Partial<ProfileDraft>, confirmNewOrigin?: boolean): Promise<{ profile: ConnectionProfile; archivedProfileId?: ProfileId }>;
  activateConnectionProfile(id: ProfileId): Promise<ActiveProfile>;
  archiveConnectionProfile(id: ProfileId, confirm: boolean): Promise<{ archivedId: ProfileId; activeProfileId: ProfileId }>;
  setSessionPassword(id: ProfileId, password: string): Promise<{ accepted: true }>;
  getOverview(period?: Period): Promise<Overview>;
  getSessions(filters: SessionFilters): Promise<SessionsResult>;
  revealSessionDetails(identity: SessionIdentity): Promise<SessionDetails>;
  getDatabaseActivity(period: Period, page: Page): Promise<DatabaseActivity>;
  getDatabaseInventory(filters: DatabaseInventoryFilters): Promise<DatabaseInventory>;
  getPerformance(period: Period, page: Page): Promise<Performance>;
  getLogs(filters: LogFilters): Promise<DataBlock<Paginated<LogEvent>>>;
  getDiagnostics(): Promise<Diagnostics>;
  getPreferences(): Promise<Preferences>;
  refreshNow(): Promise<RefreshResult>;
  updatePreferences(preferences: Preferences): Promise<Preferences>;
  exportFiltered(request: ExportRequest): Promise<ExportResult>;
  terminateSession(identity: SessionIdentity): Promise<OperationResult>;
  /** Temporary compatibility with the boilerplate until the dashboard replaces it. */
  getDatabaseStats(): Promise<DatabaseStat[]>;
}
