import {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export interface Database {
  repos: RepoTable;
  executions: ExecutionTable;
  merkletrees: MerkleTreeTable;
  merkletree_values: MerkleTreeValueTable;
}

export interface RepoTable {
  id: Generated<number>;
  address: string;
  internal_name: string;
  name: string;
  /** Nonce for signature-based authentication. Incremented after each authenticated push. */
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
