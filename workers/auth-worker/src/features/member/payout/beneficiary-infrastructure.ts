import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import { PayoutBeneficiary, PayoutBeneficiaryUpsertSchema } from './domain';
import { decryptPayoutField, encryptPayoutField } from './crypto';

type BeneficiaryRow = Record<string, unknown>;

function rowHasBeneficiary(row: BeneficiaryRow | null): boolean {
  if (!row) return false;
  return !!(row.accountNoEncrypted || row.accountNo);
}

async function toRecordPayload(
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

async function rowToBeneficiary(row: BeneficiaryRow, secret: string): Promise<PayoutBeneficiary | null> {
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

  if (!accountNo) return null;

  return {
    accountNo,
    accountName: accountName ?? '',
    acqId: String(row.acqId),
    bankName: row.bankName ? String(row.bankName) : undefined,
  };
}

export function createPayoutBeneficiaryInfrastructure(
  userDO: DurableObjectStub<UserDO>,
  getEncryptionSecret: () => Promise<string>,
) {
  const persist = async (data: PayoutBeneficiary, existingId?: unknown): Promise<PayoutBeneficiary> => {
    const secret = await getEncryptionSecret();
    const record = await toRecordPayload(data, secret);
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

  return {
    get: async (): Promise<PayoutBeneficiary | null> => {
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', { limit: 1 }, 'payout_beneficiary');
      const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as BeneficiaryRow) : null;
      if (!rowHasBeneficiary(row)) return null;

      const secret = await getEncryptionSecret();
      const beneficiary = await rowToBeneficiary(row!, secret);
      if (!beneficiary) return null;

      if (row!.accountNo && !row!.accountNoEncrypted) {
        await persist(beneficiary, row!.id);
      }

      return beneficiary;
    },

    upsert: async (input: PayoutBeneficiary): Promise<PayoutBeneficiary> => {
      const data = PayoutBeneficiaryUpsertSchema.parse(input);
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', { limit: 1 }, 'payout_beneficiary');
      const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      return persist(data, existing?.id);
    },
  };
}
