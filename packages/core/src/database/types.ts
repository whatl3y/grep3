import {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export interface Database {
  repos: RepoTable;
  addresses: AddressTable;
  executions: ExecutionTable;
  merkletrees: MerkleTreeTable;
  merkletree_values: MerkleTreeValueTable;
  crypto_news_sources: CryptoNewsSourceTable;
  crypto_news_items: CryptoNewsItemTable;
  crypto_daily_summaries: CryptoDailySummaryTable;
}

export interface RepoTable {
  id: Generated<number>;
  address: string;
  internal_name: string;
  name: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface AddressTable {
  id: Generated<number>;
  /** Ethereum address (checksummed) */
  address: string;
  /** Nonce for signature-based authentication. Changed when signatures are revoked. */
  auth_nonce: ColumnType<number, number | undefined, number>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface ExecutionTable {
  id: Generated<number>;
  created_at: ColumnType<Date, string | undefined, never>;
  repo_id: number;
  image_hash: string | null;
  container_hash: string | null;
  stdout_file: string | null;
}

// You should not use the table schema interfaces directly. Instead, you should
// use the `Selectable`, `Insertable` and `Updateable` wrappers. These wrappers
// make sure that the correct types are used in each operation.
//
// Most of the time you should trust the type inference and not use explicit
// types at all. These types can be useful when typing function arguments.
export type Repo = Selectable<RepoTable>;
export type NewRepo = Insertable<RepoTable>;
export type RepoUpdate = Updateable<RepoTable>;

export type Address = Selectable<AddressTable>;
export type NewAddress = Insertable<AddressTable>;
export type AddressUpdate = Updateable<AddressTable>;

export type Execution = Selectable<ExecutionTable>;
export type NewExecution = Insertable<ExecutionTable>;
export type ExecutionUpdate = Updateable<ExecutionTable>;

export interface MerkleTreeTable {
  id: Generated<number>;
  root_hash: string;
  job_uuid: string;
  job_status: string;
  job_status_info: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface MerkleTreeValueTable {
  id: Generated<number>;
  merkletree_id: number;
  unique_id: string;
  values: string;
  proof: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export type MerkleTree = Selectable<MerkleTreeTable>;
export type NewMerkleTree = Insertable<MerkleTreeTable>;
export type MerkleTreeUpdate = Updateable<MerkleTreeTable>;

export type MerkleTreeValue = Selectable<MerkleTreeValueTable>;
export type NewMerkleTreeValue = Insertable<MerkleTreeValueTable>;
export type MerkleTreeValueUpdate = Updateable<MerkleTreeValueTable>;

// Crypto News Aggregator Types

export interface CryptoNewsSourceTable {
  id: Generated<number>;
  name: string;
  source_type: string;
  url: string;
  config: string | null;
  is_active: ColumnType<boolean, boolean | undefined, boolean>;
  last_scraped_at: ColumnType<Date, string | undefined, string | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface CryptoNewsItemTable {
  id: Generated<number>;
  source_id: number;
  external_id: string | null;
  title: string;
  content: string | null;
  url: string;
  author: string | null;
  published_at: ColumnType<Date, string, never>;
  relevance_score: number | null;
  summary_date: ColumnType<Date, string, never>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface SummaryEvent {
  rank: number;
  headline: string;
  summary: string;
  category: string;
  impact_score: number;
  reference_ids: number[];
  popularity_score?: number; // Number of sources reporting this story (1-5 shown as dots/icons)
  is_duplicate?: boolean; // True if this story was already reported in a previous day
  first_reported_date?: string; // The date this story was first reported (if duplicate)
}

export interface SummaryReference {
  id: number;
  title: string;
  source_name: string;
  url: string;
  published_at: string;
  relevance_score: number;
}

export interface CryptoDailySummaryTable {
  id: Generated<number>;
  summary_date: ColumnType<Date, string, never>;
  summary_html: string | null;
  events: ColumnType<SummaryEvent[], string | undefined, string | undefined>;
  references: ColumnType<
    SummaryReference[],
    string | undefined,
    string | undefined
  >;
  news_item_ids: ColumnType<number[], string | undefined, string | undefined>;
  total_sources_scanned: number | null;
  openai_model: string | null;
  openai_tokens_used: number | null;
  generated_at: ColumnType<Date, string | undefined, string | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export type CryptoNewsSource = Selectable<CryptoNewsSourceTable>;
export type NewCryptoNewsSource = Insertable<CryptoNewsSourceTable>;
export type CryptoNewsSourceUpdate = Updateable<CryptoNewsSourceTable>;

export type CryptoNewsItem = Selectable<CryptoNewsItemTable>;
export type NewCryptoNewsItem = Insertable<CryptoNewsItemTable>;
export type CryptoNewsItemUpdate = Updateable<CryptoNewsItemTable>;

export type CryptoDailySummary = Selectable<CryptoDailySummaryTable>;
export type NewCryptoDailySummary = Insertable<CryptoDailySummaryTable>;
export type CryptoDailySummaryUpdate = Updateable<CryptoDailySummaryTable>;
