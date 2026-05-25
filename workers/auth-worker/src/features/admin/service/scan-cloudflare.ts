import { getServiceScanFeePercentFromEnv } from '../system-config/get-service-scan-fee-percent';
import type { ScanCloudflareModelsResult, IServiceInfrastructureService } from './domain';
import { listAllModelsForServiceScan, modelSearchHitToPendingService } from './model-search';

export async function scanCloudflareModelsToPendingServices(
  env: Env,
  serviceInfra: IServiceInfrastructureService,
): Promise<ScanCloudflareModelsResult> {
  const models = await listAllModelsForServiceScan(env);
  const feePercent = await getServiceScanFeePercentFromEnv(env);
  const pending = models.map((m) => modelSearchHitToPendingService(m, feePercent));
  const { created, skipped } = await serviceInfra.bulkRegisterPendingServices(pending);
  return {
    created,
    skipped,
    totalModels: models.length,
  };
}
