declare module 'oracledb' {
  export interface Connection {
    execute(
      sql: string,
      binds?: Record<string, unknown> | unknown[],
      options?: Record<string, unknown>,
    ): Promise<{ rows?: unknown[]; metaData?: unknown[] }>;
    close(): Promise<void>;
  }

  interface OracleDb {
    OUT_FORMAT_OBJECT: number;
    DB_TYPE_CLOB: number;
    DB_TYPE_NCLOB: number;
    DB_TYPE_BLOB: number;
    fetchAsString: number[];
    fetchAsBuffer: number[];
    getConnection(config: {
      user: string;
      password: string;
      connectString: string;
      configDir?: string;
      walletLocation?: string;
      walletPassword?: string;
    }): Promise<Connection>;
  }

  export const OUT_FORMAT_OBJECT: number;
  export function getConnection(config: {
    user: string;
    password: string;
    connectString: string;
    configDir?: string;
    walletLocation?: string;
    walletPassword?: string;
  }): Promise<Connection>;

  const oracledb: OracleDb;
  export default oracledb;
}
