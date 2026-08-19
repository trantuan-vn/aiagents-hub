export type OracleConnectConfig = {
  user: string;
  password: string;
  connectString: string;
  configDir?: string;
  walletLocation?: string;
  walletPassword?: string;
};

export type DbColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  comment?: string;
};

export type DbForeignKey = {
  column: string;
  refTable: string;
  refColumn: string;
};
