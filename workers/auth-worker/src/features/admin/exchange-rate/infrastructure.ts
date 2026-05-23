import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import { ExchangeRate, ExchangeRateSchema } from './domain';

export function createExchangeRateInfrastructure(adminDO: DurableObjectStub<UserDO>) {
  return {
    async list(limit = 366): Promise<ExchangeRate[]> {
      const rows = await executeUtils.executeDynamicAction(
        adminDO,
        'select',
        { orderBy: { field: 'rateDate', direction: 'desc' }, limit },
        'exchange_rates',
      );
      const list = Array.isArray(rows) ? rows : [];
      return list.map((r) => ({
        rateDate: String(r.rateDate ?? r.rate_date ?? ''),
        usdVndRate: Number(r.usdVndRate ?? r.usd_vnd_rate ?? 0) || 0,
      }));
    },

    async getByDate(rateDate: string): Promise<ExchangeRate | null> {
      const rows = await executeUtils.executeDynamicAction(
        adminDO,
        'select',
        { where: { field: 'rateDate', operator: '=', value: rateDate }, limit: 1 },
        'exchange_rates',
      );
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!row) return null;
      return {
        rateDate: String(row.rateDate ?? row.rate_date ?? rateDate),
        usdVndRate: Number(row.usdVndRate ?? row.usd_vnd_rate ?? 0) || 0,
      };
    },

    async getLatestOnOrBefore(rateDate: string): Promise<ExchangeRate | null> {
      const rows = await executeUtils.executeDynamicAction(
        adminDO,
        'select',
        {
          where: { field: 'rateDate', operator: '<=', value: rateDate },
          orderBy: { field: 'rateDate', direction: 'desc' },
          limit: 1,
        },
        'exchange_rates',
      );
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!row) return null;
      return {
        rateDate: String(row.rateDate ?? row.rate_date ?? ''),
        usdVndRate: Number(row.usdVndRate ?? row.usd_vnd_rate ?? 0) || 0,
      };
    },

    async upsert(data: ExchangeRate): Promise<ExchangeRate> {
      ExchangeRateSchema.parse(data);
      const existing = await this.getByDate(data.rateDate);
      if (existing) {
        const rows = await executeUtils.executeDynamicAction(
          adminDO,
          'select',
          { where: { field: 'rateDate', operator: '=', value: data.rateDate }, limit: 1 },
          'exchange_rates',
        );
        const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (row?.id) {
          await executeUtils.executeDynamicAction(
            adminDO,
            'update',
            { id: row.id, usdVndRate: data.usdVndRate, queueStatus: 'pending' },
            'exchange_rates',
          );
        }
      } else {
        await executeUtils.executeDynamicAction(
          adminDO,
          'insert',
          { ...data, queueStatus: 'pending' },
          'exchange_rates',
        );
      }
      return data;
    },
  };
}
