import {
  DocumentRecognition,
  FaceSearch,
  FaceVerification,
  LivenessDetection,
  DocumentExtractionResult,
  FaceDetectionResult,
  FaceVerificationResult,
  LivenessResult,
  IAIDocumentService,
} from './domain';
import {
  prepareImageForAI,
  dataUriFromBuffer,
  calculateConfidence,
  calculateFaceDetectionConfidence,
  calculateFaceVerificationConfidence,
} from './utils';
import {
  getDocumentPrompt,
  getFaceSearchPrompt,
  getFaceComparisonPrompt,
  getLivenessDetectionPrompt,
} from './utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import {
  computeUsageChargeUsd,
  convertUsdToVnd,
  getServiceModel,
} from '../../admin/service/pricing';
import { getUsdVndRateFromEnv } from '../../admin/system-config/get-usd-vnd-rate';

const AI_GATEWAY_ID = 'unitoken';
const DEFAULT_VISION_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

export function createAIService(env: Env, userDO: DurableObjectStub<UserDO>): IAIDocumentService {
  const validateServiceUsage = async (endpoint: string): Promise<any> => {
    const service = await executeUtils
      .executeDynamicAction(
        userDO,
        'select',
        {
          where: [
            { field: 'endpoint', operator: '=', value: endpoint },
            { field: 'isActive', operator: '=', value: 1 },
          ],
        },
        'services',
      )
      .then((results) => results[0]);

    if (!service) {
      throw new Error('Service not found');
    }

    const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
    const u = users[0];
    const balance = Number(u?.walletBalance ?? u?.wallet_balance ?? 0) || 0;
    if (balance <= 0) {
      throw new Error('Insufficient wallet balance');
    }

    return service;
  };

  const updateServiceUsage = async (
    service: any,
    endpoint: string,
    request: any,
    chargeUsd: number,
    workflowAttribution?: { workflowId: number; workflowOwnerId: string },
  ): Promise<void> => {
    const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
    const u = users[0];
    if (!u?.id) {
      throw new Error('User profile not found');
    }

    const usdVndRate = await getUsdVndRateFromEnv(env);
    const amountVnd = convertUsdToVnd(Math.max(0, Number(chargeUsd) || 0), usdVndRate);
    const balance = Number(u.walletBalance ?? u.wallet_balance ?? 0) || 0;
    if (amountVnd > balance) {
      throw new Error('Insufficient wallet balance');
    }

    const operations: Array<{
      table: string;
      operation: 'insert' | 'update';
      id?: number;
      data: Record<string, unknown>;
    }> = [];

    if (amountVnd > 0) {
      operations.push({
        table: 'users',
        operation: 'update',
        id: u.id,
        data: { ...u, walletBalance: balance - amountVnd },
      });
    }

    const usageData: Record<string, unknown> = {
      serviceId: service.id,
      endpoint,
      userAgent: request.userAgent,
      ipAddress: request.ipAddress,
      isError: false,
      cost: amountVnd,
      queueStatus: 'pending',
    };
    if (workflowAttribution) {
      usageData.workflowId = workflowAttribution.workflowId;
      usageData.workflowOwnerId = workflowAttribution.workflowOwnerId;
    }

    operations.push({
      table: 'service_usages',
      operation: 'insert',
      data: usageData,
    });

    await executeUtils.executeDynamicAction(userDO, 'multi-table', { operations });

    if (workflowAttribution && amountVnd > 0) {
      const consumerId =
        String(u.identifier ?? u.user_identifier ?? userDO.id?.toString?.() ?? '');
      const { recordWorkflowRoyalty } = await import('../workflows/royalty.js');
      await recordWorkflowRoyalty(env, 'USER_DO', {
        workflowId: workflowAttribution.workflowId,
        workflowOwnerId: workflowAttribution.workflowOwnerId,
        consumerIdentifier: consumerId,
        baseCostVnd: amountVnd,
      });
    }
  };

  const recordApiError = async (service: any, endpoint: string, request: any): Promise<void> => {
    try {
      await executeUtils.executeDynamicAction(userDO, 'multi-table', {
        operations: [
          {
            table: 'service_usages',
            operation: 'insert',
            data: {
              serviceId: service.id,
              endpoint: endpoint,
              userAgent: request?.userAgent,
              ipAddress: request?.ipAddress,
              isError: true,
              cost: 0,
              queueStatus: 'pending',
            },
          },
        ],
      });
    } catch (e) {
      console.warn('[Ekyc] recordApiError failed:', e);
    }
  };

  const agreeToModelLicense = async (modelId: keyof AiModels): Promise<void> => {
    await env.AI.run(modelId, { prompt: 'agree' });
  };

  const isModelLicenseError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    return /5016|agree|Prior to using this model/i.test(msg);
  };

  const executeAIModel = async (
    endpoint: string,
    request: any,
    prompt: string,
    images: File[],
    processResult: (response: any, service: any, usageCost: number) => Promise<any>,
  ): Promise<any> => {
    const service = await validateServiceUsage(endpoint);
    const modelId = (getServiceModel(service) ?? DEFAULT_VISION_MODEL) as keyof AiModels;

    const imageB64s = await Promise.all(
      images.map(async (img) => {
        const { buffer, mimeType } = await prepareImageForAI(img);
        return dataUriFromBuffer(buffer, mimeType);
      }),
    );

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imageB64s.map((dataUri) => ({ type: 'image_url', image_url: { url: dataUri } })),
        ],
      },
    ];

    const maxTokens = request.options?.maxTokens ?? 500;
    const runModel = () =>
      env.AI.run(
        modelId,
        { messages, max_tokens: maxTokens },
        { gateway: { id: AI_GATEWAY_ID } },
      );

    try {
      let response: any;
      try {
        response = await runModel();
      } catch (e) {
        if (isModelLicenseError(e)) {
          await agreeToModelLicense(modelId);
          response = await runModel();
        } else {
          throw e;
        }
      }
      const chargeUsd = computeUsageChargeUsd(service, response);
      return await processResult(response, service, chargeUsd);
    } catch (e) {
      await recordApiError(service, endpoint, request);
      throw e;
    }
  };

  const extractResponseData = (response: any): Record<string, unknown> => {
    const raw = response?.response ?? response;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch (err) {
        console.error('JSON parse error:', err);
        return { raw };
      }
    }
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  };

  const processDocumentRecognition = async (
    response: any,
    service: any,
    request: DocumentRecognition,
    usageCost: number,
  ): Promise<DocumentExtractionResult> => {
    const extractedData = extractResponseData(response) as any;

    const conf =
      typeof extractedData?.confidence_score === 'number' &&
      extractedData.confidence_score >= 0 &&
      extractedData.confidence_score <= 1
        ? extractedData.confidence_score
        : calculateConfidence(extractedData);
    const returnData = {
      documentType: request.docType,
      extractedData,
      confidence: conf,
      processingTime: Date.now(),
      metadata: {
        imageSize: request.image.size,
        imageType: request.image.type,
      },
    };
    await updateServiceUsage(service, request.endpoint, request, usageCost);
    return returnData;
  };

  const landmarksToArray = (lm: unknown): { x: number; y: number; type: string }[] => {
    if (!lm || typeof lm !== 'object') return [];
    const entries = Object.entries(lm as Record<string, { x?: number; y?: number }>);
    return entries
      .filter(
        ([, v]) =>
          v &&
          typeof v === 'object' &&
          (typeof (v as any).x === 'number' || typeof (v as any).y === 'number'),
      )
      .map(([type, v]) => ({
        x: Number((v as any).x) || 0,
        y: Number((v as any).y) || 0,
        type,
      }));
  };

  const processFaceSearch = async (
    response: any,
    service: any,
    request: FaceSearch,
    usageCost: number,
  ): Promise<FaceDetectionResult> => {
    const data = extractResponseData(response);
    const list = Array.isArray(data?.faces) ? data.faces : [];
    const faces = list.map((f: any) => {
      const box = f?.box && typeof f.box === 'object' ? f.box : {};
      return {
        boundingBox: {
          x: Number(box.x) || 0,
          y: Number(box.y) || 0,
          width: Number(box.width) || 0,
          height: Number(box.height) || 0,
        },
        confidence: Math.min(1, Math.max(0, Number(f?.confidence) ?? request.options?.detectionThreshold ?? 0.7)),
        landmarks: Array.isArray(f?.landmarks) ? f.landmarks : landmarksToArray(f?.landmarks),
        attributes: f?.attributes && typeof f.attributes === 'object' ? f.attributes : {},
      };
    });
    const faceCount = typeof data?.face_count === 'number' ? data.face_count : faces.length;
    const returnData: FaceDetectionResult = {
      faces,
      confidence: calculateFaceDetectionConfidence(faces),
      faceCount,
      processingTime: Date.now(),
    };
    await updateServiceUsage(service, request.endpoint, request, usageCost);
    return returnData;
  };

  const processFaceVerification = async (
    response: any,
    service: any,
    request: FaceVerification,
    usageCost: number,
  ): Promise<FaceVerificationResult> => {
    const result = extractResponseData(response);
    const similarity = Math.min(1, Math.max(0, Number(result?.similarity) ?? 0));
    const threshold = request.options?.similarityThreshold ?? 0.75;
    const isMatch =
      result?.isMatch === true ||
      (typeof result?.isMatch !== 'boolean' && similarity >= threshold);
    const conf =
      typeof result?.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1
        ? result.confidence
        : calculateFaceVerificationConfidence(similarity);
    const fc = result?.features_compared;
    const q =
      typeof fc === 'object' && fc !== null && typeof (fc as any).face_shape === 'number'
        ? (fc as any).face_shape
        : undefined;
    const returnData: FaceVerificationResult = {
      similarity,
      isMatch,
      details: (result?.description ?? result?.details ?? 'No description provided').toString(),
      confidence: conf,
      attributes: q != null ? { image1: { quality: q }, image2: { quality: q } } : {},
      processingTime: Date.now(),
    };
    await updateServiceUsage(service, request.endpoint, request, usageCost);
    return returnData;
  };

  const processLivenessDetection = async (
    response: any,
    service: any,
    request: LivenessDetection,
    usageCost: number,
  ): Promise<LivenessResult> => {
    const result = extractResponseData(response);
    const risk = Math.min(1, Math.max(0, Number(result?.riskScore) ?? 0.8));
    const conf =
      typeof result?.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1
        ? result.confidence
        : 1 - risk;
    const detectedSigns = result?.detectedSigns as { warnings?: unknown } | undefined;
    const recommendations = Array.isArray(detectedSigns?.warnings)
      ? detectedSigns.warnings
      : Array.isArray(result?.recommendations)
        ? result.recommendations
        : [];
    const returnData: LivenessResult = {
      isLive: result?.isLive === true,
      details: (result?.details ?? 'No details provided').toString(),
      confidence: conf,
      spoofType: result?.spoofType != null ? String(result.spoofType) : undefined,
      riskScore: risk,
      processingTime: Date.now(),
      recommendations,
    };
    await updateServiceUsage(service, request.endpoint, request, usageCost);
    return returnData;
  };

  return {
    async recognizeDocument(request: DocumentRecognition): Promise<DocumentExtractionResult> {
      return executeAIModel(
        request.endpoint,
        request,
        getDocumentPrompt(request.docType),
        [request.image],
        (response, service, usageCost) =>
          processDocumentRecognition(response, service, request, usageCost),
      );
    },

    async faceSearch(request: FaceSearch): Promise<FaceDetectionResult> {
      return executeAIModel(
        request.endpoint,
        request,
        getFaceSearchPrompt(),
        [request.image],
        (response, service, usageCost) => processFaceSearch(response, service, request, usageCost),
      );
    },

    async faceVerify(request: FaceVerification): Promise<FaceVerificationResult> {
      return executeAIModel(
        request.endpoint,
        request,
        getFaceComparisonPrompt(),
        [request.image],
        (response, service, usageCost) =>
          processFaceVerification(response, service, request, usageCost),
      );
    },

    async livenessDetection(request: LivenessDetection): Promise<LivenessResult> {
      const prompt = getLivenessDetectionPrompt(request.isVideo);
      return executeAIModel(
        request.endpoint,
        request,
        prompt,
        [request.image],
        (response, service, usageCost) =>
          processLivenessDetection(response, service, request, usageCost),
      );
    },
  };
}
