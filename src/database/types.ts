import {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export interface Database {
  repo: RepoTable;
}

export interface RepoTable {
  id: Generated<number>;
  address: string;
  internal_name: string;
  name: string;
  created_at: ColumnType<Date, string | undefined, never>;
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
