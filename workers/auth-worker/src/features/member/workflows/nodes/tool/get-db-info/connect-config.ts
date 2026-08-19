export type OracleConnectConfig = {
  user: string;
  password: string;
  connectString: string;
  configDir?: string;
  walletLocation?: string;
  walletPassword?: string;
};

const USER_KEYS = ['user', 'username', 'dbuser', 'db_user', 'user_name', 'oracleuser', 'oracle_user'];
const PASSWORD_KEYS = ['password', 'pass', 'dbpassword', 'db_password', 'oraclepassword', 'oracle_password'];
const CONNECT_KEYS = [
  'connectstring',
  'connectionstring',
  'connect_string',
  'connection_string',
  'dsn',
  'tns',
  'tnsname',
];
const WALLET_DIR_KEYS = ['configdir', 'config_dir', 'walletlocation', 'wallet_location', 'tns_admin', 'tnsadmin'];
const WALLET_PASSWORD_KEYS = ['walletpassword', 'wallet_password'];

const ORACLE_TYPES = new Set(['oracle', 'oracledb', 'oci', 'oci-oracle', 'oracle-adb']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstItem(value: unknown): unknown {
  if (Array.isArray(value) && value.length) return value[0];
  const rec = asRecord(value);
  if (rec && Array.isArray(rec.items) && rec.items.length) return rec.items[0];
  return value;
}

function pickString(records: Record<string, unknown>[], keys: string[]): string {
  const wanted = new Set(keys);
  for (const rec of records) {
    for (const [key, value] of Object.entries(rec)) {
      if (!wanted.has(key.toLowerCase()) || value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
}

/** Flatten previous-node JSON (form fields, HTTP `data`/`body`, nested connection). */
export function candidateRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  const push = (value: unknown) => {
    const unwrapped = firstItem(value);
    const rec = asRecord(unwrapped);
    if (!rec || seen.has(rec)) return;
    seen.add(rec);
    out.push(rec);
  };

  push(root);
  push(root.fields);
  push(root.json);
  push(root.$json);
  push(root.connection);
  push(root.body);
  push(root.data);
  const data = asRecord(root.data);
  if (data) {
    push(data.data);
    push(data.body);
    push(data.json);
    push(data.connection);
  }
  const body = asRecord(root.body);
  if (body) {
    push(body.data);
    push(body.connection);
  }
  const parents = asRecord(root.parents);
  if (parents) {
    for (const parent of Object.values(parents)) push(parent);
  }
  return out;
}

function fieldStr(rec: Record<string, unknown>, key: string): string {
  const value = rec[key] ?? rec[key.toUpperCase()] ?? rec[key.toLowerCase()];
  return value == null ? '' : String(value).trim();
}

/** Form shorthand: u / p / c on the same object (username, password, connectString). */
function pickShortFormCreds(records: Record<string, unknown>[]): OracleConnectConfig | null {
  for (const rec of records) {
    const user = fieldStr(rec, 'u');
    const password = fieldStr(rec, 'p');
    const connectString = fieldStr(rec, 'c');
    if (user && password && connectString) {
      return { user, password, connectString };
    }
  }
  return null;
}

export function resolveOracleConnectConfig(
  source: Record<string, unknown>,
): OracleConnectConfig | null {
  const records = candidateRecords(source);
  const user = pickString(records, USER_KEYS);
  const password = pickString(records, PASSWORD_KEYS);
  const connectString = pickString(records, CONNECT_KEYS);
  const short = !user || !password || !connectString ? pickShortFormCreds(records) : null;
  const resolvedUser = user || short?.user || '';
  const resolvedPassword = password || short?.password || '';
  const resolvedConnect = connectString || short?.connectString || '';
  if (!resolvedUser || !resolvedPassword || !resolvedConnect) return null;

  const configDir = pickString(records, WALLET_DIR_KEYS) || undefined;
  const walletPassword = pickString(records, WALLET_PASSWORD_KEYS) || undefined;
  return {
    user: resolvedUser,
    password: resolvedPassword,
    connectString: resolvedConnect,
    ...(configDir ? { configDir, walletLocation: configDir } : {}),
    ...(walletPassword ? { walletPassword } : {}),
  };
}

export function isOracleConnectionType(type: string): boolean {
  return ORACLE_TYPES.has(type.trim().toLowerCase());
}

export function pickUpstreamString(source: Record<string, unknown>, keys: string[]): string {
  return pickString(candidateRecords(source), keys.map((k) => k.toLowerCase()));
}

export function resolveOracleSchema(schemaName: string | undefined, user: string): string {
  const raw = String(schemaName ?? '').trim();
  if (!raw || raw.toLowerCase() === 'public') return user.toUpperCase();
  return raw.toUpperCase();
}
