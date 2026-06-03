import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import {
  PayoutBeneficiary,
  PayoutBeneficiaryUpsertSchema,
  PaypalPayoutBeneficiary,
  PaypalPayoutBeneficiaryUpsertSchema,
} from './domain';
import { decryptPayoutField, encryptPayoutField } from './crypto';

type BeneficiaryRow = Record<string, unknown>;

function rowHasBankBeneficiary(row: BeneficiaryRow | null): boolean {
  if (!row) return false;
  return !!(row.accountNoEncrypted || row.accountNo);
}

function rowHasPaypalBeneficiary(row: BeneficiaryRow | null): boolean {
  if (!row) return false;
  return !!(row.paypalEmailEncrypted || row.paypalEmail);
}

async function toBankRecordPayload(
  data: PayoutBeneficiary,
  secret: string,
): Promise<Record<string, unknown>> {
  return {
    accountNoEncrypted: await encryptPayoutField(data.accountNo, secret),
    accountNameEncrypted: await encryptPayoutField(data.accountName, secret),
    accountNo: null,
    accountName: null,
    acqId: data.acqId,
    bankName: data.bankName ?? null,
  };
}

async function rowToBankBeneficiary(row: BeneficiaryRow, secret: string): Promise<PayoutBeneficiary | null> {
  let accountNo: string | null = null;
  let accountName: string | null = null;

  if (row.accountNoEncrypted) {
    accountNo = await decryptPayoutField(String(row.accountNoEncrypted), secret);
  }
  if (row.accountNameEncrypted) {
    accountName = await decryptPayoutField(String(row.accountNameEncrypted), secret);
  }

  if (!accountNo && row.accountNo) {
    accountNo = String(row.accountNo);
  }
  if (!accountName && row.accountName) {
    accountName = String(row.accountName);
  }

  if (!accountNo || !row.acqId) return null;

  return {
    accountNo,
    accountName: accountName ?? '',
    acqId: String(row.acqId),
    bankName: row.bankName ? String(row.bankName) : undefined,
  };
}

async function rowToPaypalBeneficiary(
  row: BeneficiaryRow,
  secret: string,
): Promise<PaypalPayoutBeneficiary | null> {
  let paypalEmail: string | null = null;

  if (row.paypalEmailEncrypted) {
    paypalEmail = await decryptPayoutField(String(row.paypalEmailEncrypted), secret);
  }
  if (!paypalEmail && row.paypalEmail) {
    paypalEmail = String(row.paypalEmail);
  }

  if (!paypalEmail) return null;
  return { paypalEmail };
}

export function maskPaypalEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.length <= 2 ? local[0] ?? '*' : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

export function createPayoutBeneficiaryInfrastructure(
  userDO: DurableObjectStub<UserDO>,
  getEncryptionSecret: () => Promise<string>,
) {
  const getRow = async (): Promise<BeneficiaryRow | null> => {
    const rows = await executeUtils.executeDynamicAction(userDO, 'select', { limit: 1 }, 'payout_beneficiary');
    return Array.isArray(rows) && rows.length > 0 ? (rows[0] as BeneficiaryRow) : null;
  };

  const persistBank = async (data: PayoutBeneficiary, existingId?: unknown): Promise<PayoutBeneficiary> => {
    const secret = await getEncryptionSecret();
    const record = await toBankRecordPayload(data, secret);
    if (existingId != null) {
      await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id: existingId, ...record, queueStatus: 'pending' },
        'payout_beneficiary',
      );
    } else {
      await executeUtils.executeDynamicAction(
        userDO,
        'insert',
        { ...record, queueStatus: 'pending' },
        'payout_beneficiary',
      );
    }
    return data;
  };

  const persistPaypal = async (
    data: PaypalPayoutBeneficiary,
    existingId?: unknown,
  ): Promise<PaypalPayoutBeneficiary> => {
    const secret = await getEncryptionSecret();
    const record = {
      paypalEmailEncrypted: await encryptPayoutField(data.paypalEmail.trim().toLowerCase(), secret),
      paypalEmail: null,
    };
    if (existingId != null) {
      await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id: existingId, ...record, queueStatus: 'pending' },
        'payout_beneficiary',
      );
    } else {
      await executeUtils.executeDynamicAction(
        userDO,
        'insert',
        { ...record, queueStatus: 'pending' },
        'payout_beneficiary',
      );
    }
    return { paypalEmail: data.paypalEmail.trim().toLowerCase() };
  };

  return {
    /** Bank beneficiary (VietQR). */
    get: async (): Promise<PayoutBeneficiary | null> => {
      const row = await getRow();
      if (!rowHasBankBeneficiary(row)) return null;

      const secret = await getEncryptionSecret();
      const beneficiary = await rowToBankBeneficiary(row!, secret);
      if (!beneficiary) return null;

      if (row!.accountNo && !row!.accountNoEncrypted) {
        await persistBank(beneficiary, row!.id);
      }

      return beneficiary;
    },

    upsert: async (input: PayoutBeneficiary): Promise<PayoutBeneficiary> => {
      const data = PayoutBeneficiaryUpsertSchema.parse(input);
      const existing = await getRow();
      return persistBank(data, existing?.id);
    },

    getPaypal: async (): Promise<PaypalPayoutBeneficiary | null> => {
      const row = await getRow();
      if (!rowHasPaypalBeneficiary(row)) return null;

      const secret = await getEncryptionSecret();
      const beneficiary = await rowToPaypalBeneficiary(row!, secret);
      if (!beneficiary) return null;

      if (row!.paypalEmail && !row!.paypalEmailEncrypted) {
        await persistPaypal(beneficiary, row!.id);
      }

      return beneficiary;
    },

    upsertPaypal: async (input: PaypalPayoutBeneficiary): Promise<PaypalPayoutBeneficiary> => {
      const data = PaypalPayoutBeneficiaryUpsertSchema.parse(input);
      const existing = await getRow();
      return persistPaypal(data, existing?.id);
    },

    hasBank: async (): Promise<boolean> => {
      const row = await getRow();
      return rowHasBankBeneficiary(row);
    },

    hasPaypal: async (): Promise<boolean> => {
      const row = await getRow();
      return rowHasPaypalBeneficiary(row);
    },
  };
}
