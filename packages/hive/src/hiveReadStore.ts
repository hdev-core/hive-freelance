/**
 * Milestone 1 HAF read abstraction.
 * Production path: SQL against HAF_DATABASE_URL (local hafd.* or shared Greateck).
 * Not the interim listener / hive_records cache.
 */

export type HafAccount = {
  id: number;
  name: string;
  createdAt: string;
  jsonMetadata: unknown;
};

export type HafOperation = {
  id: number;
  blockNum: number;
  trxInBlock: number;
  opPos: number;
  opType: string;
  body: unknown;
  timestamp: string;
};

export type HafPingResult = {
  ok: boolean;
  accountCount: number;
  operationCount: number;
};

export interface HiveReadStore {
  /** Returns null when the account is not in the projection. */
  getAccount(name: string): Promise<HafAccount | null>;
  getRecentAccountOps(name: string, limit?: number): Promise<HafOperation[]>;
  ping(): Promise<HafPingResult>;
  close(): Promise<void>;
}
