import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  VersionSaveResponse,
  VersionInfo,
  VersionData,
  VersionListResponse,
  IVersionInfrastructureService,
  VersionInfoSchema,
} from './domain';
import { executeUtils } from '../../../shared/utils';

export function createVersionInfrastructureService(env: Env, userDO: DurableObjectStub<UserDO>): IVersionInfrastructureService {
  const fetchAllTableData = async () => {
    const [services, vouchers, commissionPolicies] = await Promise.all([
      executeUtils.executeDynamicAction(userDO, 'select', {
        orderBy: { field: 'createdAt', direction: 'DESC' },
      }, 'services'),
      executeUtils.executeDynamicAction(userDO, 'select', {
        orderBy: { field: 'createdAt', direction: 'DESC' },
      }, 'vouchers'),
      executeUtils.executeDynamicAction(userDO, 'select', {
        orderBy: { field: 'createdAt', direction: 'DESC' },
      }, 'commission_policies'),
    ]);

    return { services, vouchers, commissionPolicies };
  };

  const getCurrentVersionNumber = async (): Promise<string> => {
    const currentVersion = await env.NONCE_KV.get('version:current');
    return currentVersion || '1';
  };

  const incrementVersionNumber = async (currentVersion: string): Promise<string> => {
    const newVersion = (parseInt(currentVersion, 10) + 1).toString();
    await env.NONCE_KV.put('version:current', newVersion);
    return newVersion;
  };

  const saveVersionToR2 = async (version: string, data: unknown): Promise<void> => {
    await env.R2_VERSION_BUCKET.put(`version-${version}.json`, JSON.stringify(data), {
      httpMetadata: { contentType: 'application/json' },
    });
  };

  return {
    async saveNewVersion(): Promise<VersionSaveResponse> {
      const currentVersion = await getCurrentVersionNumber();
      const newVersion = await incrementVersionNumber(currentVersion);

      const { services, vouchers, commissionPolicies } = await fetchAllTableData();

      const recordCounts = {
        services: services.length,
        vouchers: vouchers.length,
        commission_policies: commissionPolicies.length,
      };

      const versionData = {
        services,
        vouchers,
        commission_policies: commissionPolicies,
        timestamp: new Date().toISOString(),
        version: newVersion,
      };

      await saveVersionToR2(newVersion, versionData);

      const version = VersionInfoSchema.parse({
        version: newVersion,
        timestamp: versionData.timestamp,
        recordCounts,
      });
      return executeUtils.executeDynamicAction(userDO, 'insert', version, 'versions');
    },

    async upgradeVersion(): Promise<VersionInfo> {
      const version = await getCurrentVersionNumber();

      const versions = await executeUtils.executeRepositorySelect(
        userDO,
        'SELECT version FROM versions where version = (select max(version) from versions)',
      );

      const hasStoredVersion = versions.length > 0;
      const needsUpgrade = !hasStoredVersion || versions[0].version !== version;

      if (needsUpgrade) {
        const object = await env.R2_VERSION_BUCKET.get(`version-${version}.json`);

        if (object) {
          const data = await object.text();
          const versionData = JSON.parse(data);
          if (!versionData) {
            throw new Error(`Version ${version} in R2 bucket not found`);
          }
          if (versionData.version !== version) {
            throw new Error(`Version ${version} in R2 bucket is incorrect`);
          }
          if (!(versionData.services && Array.isArray(versionData.services))
            || !(versionData.vouchers && Array.isArray(versionData.vouchers))) {
            throw new Error(`Version ${version} in R2 bucket has invalid data`);
          }

          const commissionPolicies = Array.isArray(versionData.commission_policies)
            ? versionData.commission_policies
            : [];

          const operations: Array<Record<string, unknown>> = [];

          versionData.services.forEach((service: Record<string, unknown>) => {
            operations.push({
              table: 'services',
              operation: 'upsert',
              data: {
                name: service.name,
                endpoint: service.endpoint,
                expiresAt: service.expiresAt,
                isActive: service.isActive,
                model: service.model,
                priceInput: service.priceInput,
                priceOutput: service.priceOutput,
                priceInputCache: service.priceInputCache,
                feePercent: service.feePercent,
              },
            });
          });

          operations.push({ table: 'vouchers', operation: 'delete' });
          versionData.vouchers.forEach((voucher: Record<string, unknown>) => {
            operations.push({ table: 'vouchers', operation: 'insert', data: voucher });
          });

          operations.push({ table: 'commission_policies', operation: 'delete' });
          commissionPolicies.forEach((policy: Record<string, unknown>) => {
            operations.push({ table: 'commission_policies', operation: 'insert', data: policy });
          });

          const recordCounts = {
            services: versionData.services.length,
            vouchers: versionData.vouchers.length,
            commission_policies: commissionPolicies.length,
          };

          operations.push({
            table: 'versions',
            operation: 'insert',
            data: {
              version: versionData.version,
              timestamp: versionData.timestamp,
              recordCounts,
            },
          });

          if (operations.length > 0) {
            await executeUtils.executeDynamicAction(userDO, 'multi-table', { operations });
          }
        } else if (!hasStoredVersion) {
          await executeUtils.executeDynamicAction(
            userDO,
            'insert',
            {
              version,
              timestamp: new Date().toISOString(),
              recordCounts: { services: 0, vouchers: 0, commission_policies: 0 },
            },
            'versions',
          );
        } else {
          throw new Error(`Version ${version} on R2_VERSION_BUCKET not found`);
        }
      }

      return { version };
    },

    async getVersionData(versionId: number): Promise<VersionData> {
      const object = await env.R2_VERSION_BUCKET.get(`version-${versionId}.json`);

      if (!object) {
        throw new Error(`Version ${versionId} not found`);
      }

      const data = await object.text();
      const versionData = JSON.parse(data);

      return {
        version: versionData.version,
        timestamp: versionData.timestamp,
        data: {
          services: versionData.services,
          vouchers: versionData.vouchers,
          commission_policies: versionData.commission_policies ?? [],
        },
      };
    },

    async getVersionList(): Promise<VersionListResponse> {
      const versions = await executeUtils.executeDynamicAction(userDO, 'select', {
        orderBy: { field: 'version', direction: 'DESC' },
      }, 'versions');

      return {
        versions,
        total: versions.length,
      };
    },
  };
}
