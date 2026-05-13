import { 
  DocumentRecognition, 
  FaceSearch, 
  FaceVerification, 
  LivenessDetection,
  DocumentExtractionResult,
  FaceDetectionResult,
  FaceVerificationResult,
  LivenessResult,
  IAIDocumentService
} from './domain';
import { prepareImageForAI, dataUriFromBuffer, calculateConfidence, 
  calculateFaceDetectionConfidence, calculateFaceVerificationConfidence } from './utils';
import { getDocumentPrompt, getFaceSearchPrompt, getFaceComparisonPrompt, getLivenessDetectionPrompt } from './utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';

const AI_GATEWAY_ID = 'unitoken';

async function resolveRecordedUsageCost(env: Env, service: { fixedPrice?: number | null }): Promise<number> {
  if (typeof service.fixedPrice === 'number' && !Number.isNaN(service.fixedPrice)) {
    return Math.max(0, service.fixedPrice);
  }
  const logId = env.AI.aiGatewayLogId;
  if (!logId) {
    return 0;
  }
  try {
    const log = await env.AI.gateway(AI_GATEWAY_ID).getLog(logId);
    const c = log.cost;
    return typeof c === 'number' && !Number.isNaN(c) ? Math.max(0, c) : 0;
  } catch (e) {
    console.warn('[Ekyc] AI Gateway getLog failed for usage cost:', e);
    return 0;
  }
}

export function createAIService(env: Env, userDO: DurableObjectStub<UserDO>): IAIDocumentService {

  const validateServiceUsage = async (endpoint: string): Promise<any> => {
     
    const service = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: [
          { field: "endpoint", operator: '=', value: endpoint },
          { field: "isActive", operator: '=', value: 1 }
        ]
      }, 'services').then(results => results[0]);

    if (!service) {
      throw new Error('Service not found');
    }

    if (service.currentCalls >= service.maxCalls) {
      throw new Error('Service quota exceeded');
    }

    return service;
  };
  const updateServiceUsage = async (
    service: any,
    endpoint: string,
    request: any,
    usageCost: number
  ): Promise<void> => {
    await executeUtils.executeDynamicAction(userDO, 'multi-table', {
      operations: [
        {
          table: 'services',
          operation: 'update',
          id: service.id,
          data: {
            currentCalls: service.currentCalls + 1,
          }
        },
        {
          table: 'service_usages',
          operation: 'insert',
          data: {
            serviceId: service.id,
            endpoint: endpoint,
            userAgent: request.userAgent,
            ipAddress: request.ipAddress,
            isError: false,
            cost: usageCost,
            queueStatus: 'pending'
          }
        }
      ]
    });
  };

  /** Record API error (no deduct from quota) - for stats/error rate tracking */
  const recordApiError = async (
    service: any,
    endpoint: string,
    request: any
  ): Promise<void> => {
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
              queueStatus: 'pending'
            }
          }
        ]
      });
    } catch (e) {
      console.warn('[Ekyc] recordApiError failed:', e);
    }
  };

  const LLAMA_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

  /** One-time agreement to Meta Llama 3.2 license (required before first use). */
  const agreeToLlamaLicense = async (): Promise<void> => {
    await env.AI.run(LLAMA_VISION_MODEL, { prompt: 'agree' });
  };

  const isLlamaLicenseError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    return /5016|agree|Prior to using this model/i.test(msg);
  };

  const executeAIModel = async (
    endpoint: string,
    request: any,
    prompt: string,
    images: File[],
    processResult: (response: any, service: any, usageCost: number) => Promise<any>
  ): Promise<any> => {
    const service = await validateServiceUsage(endpoint);
    if (!service) {
      throw new Error('Service not found');
    }

    const imageB64s = await Promise.all(
      images.map(async (img) => {
        const { buffer, mimeType } = await prepareImageForAI(img);
        return dataUriFromBuffer(buffer, mimeType);
      })
    );

    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...imageB64s.map((dataUri) => ({ type: 'image_url', image_url: { url: dataUri } }))
      ]
    }];

    const maxTokens = request.options?.maxTokens ?? 500;
    const runModel = () =>
      env.AI.run(LLAMA_VISION_MODEL, {
        messages,
        max_tokens: maxTokens,
      }, { gateway: { id: AI_GATEWAY_ID, collectLog: true } });

    try {
      let response: any;
      try {
        response = await runModel();
      } catch (e) {
        if (isLlamaLicenseError(e)) {
          await agreeToLlamaLicense();
          response = await runModel();
        } else {
          throw e;
        }
      }
      const usageCost = await resolveRecordedUsageCost(env, service);
      return await processResult(response, service, usageCost);
    } catch (e) {
      await recordApiError(service, endpoint, request);
      throw e;
    }
  };

  /** Lấy dữ liệu JSON từ response AI: ưu tiên response.response, fallback response; string → parse, object → dùng luôn. */
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
    usageCost: number
  ): Promise<DocumentExtractionResult> => {
    console.log('full response:', response);

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
        imageType: request.image.type
      }
    };
    await updateServiceUsage(service, request.endpoint, request, usageCost);
    return returnData;
  };

  /** Chuyển landmarks dạng { left_eye: {x,y}, ... } sang [{ x, y, type }, ...]. */
  const landmarksToArray = (lm: unknown): { x: number; y: number; type: string }[] => {
    if (!lm || typeof lm !== 'object') return [];
    const entries = Object.entries(lm as Record<string, { x?: number; y?: number }>);
    return entries
      .filter(([, v]) => v && typeof v === 'object' && (typeof (v as any).x === 'number' || typeof (v as any).y === 'number'))
      .map(([type, v]) => ({
        x: Number((v as any).x) || 0,
        y: Number((v as any).y) || 0,
        type
      }));
  };

  const processFaceSearch = async (
    response: any,
    service: any,
    request: FaceSearch,
    usageCost: number
  ): Promise<FaceDetectionResult> => {
    console.log('response: ', response);
    const data = extractResponseData(response);
    const list = Array.isArray(data?.faces) ? data.faces : [];
    const faces = list.map((f: any) => {
      const box = f?.box && typeof f.box === 'object' ? f.box : {};
      return {
        boundingBox: {
          x: Number(box.x) || 0,
          y: Number(box.y) || 0,
          width: Number(box.width) || 0,
          height: Number(box.height) || 0
        },
        confidence: Math.min(1, Math.max(0, Number(f?.confidence) ?? request.options?.detectionThreshold ?? 0.7)),
        landmarks: Array.isArray(f?.landmarks) ? f.landmarks : landmarksToArray(f?.landmarks),
        attributes: (f?.attributes && typeof f.attributes === 'object') ? f.attributes : {}
      };
    });
    const faceCount = typeof data?.face_count === 'number' ? data.face_count : faces.length;
    const returnData: FaceDetectionResult = {
      faces,
      confidence: calculateFaceDetectionConfidence(faces),
      faceCount,
      processingTime: Date.now()
    };
    await updateServiceUsage(service, request.endpoint, request, usageCost);
    return returnData;
  };

  const processFaceVerification = async (
    response: any,
    service: any,
    request: FaceVerification,
    usageCost: number
  ): Promise<FaceVerificationResult> => {
    console.log('response: ', response);
    const result = extractResponseData(response);
    const similarity = Math.min(1, Math.max(0, Number(result?.similarity) ?? 0));
    const threshold = request.options?.similarityThreshold ?? 0.75;
    const isMatch = result?.isMatch === true || (typeof result?.isMatch !== 'boolean' && similarity >= threshold);
    const conf =
      typeof result?.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1
        ? result.confidence
        : calculateFaceVerificationConfidence(similarity);
    const fc = result?.features_compared;
    const q = typeof fc === 'object' && fc !== null && typeof (fc as any).face_shape === 'number'
      ? (fc as any).face_shape
      : undefined;
    const returnData: FaceVerificationResult = {
      similarity,
      isMatch,
      details: (result?.description ?? result?.details ?? 'No description provided').toString(),
      confidence: conf,
      attributes: q != null ? { image1: { quality: q }, image2: { quality: q } } : {},
      processingTime: Date.now()
    };
    await updateServiceUsage(service, request.endpoint, request, usageCost);
    return returnData;
  };

  const processLivenessDetection = async (
    response: any,
    service: any,
    request: LivenessDetection,
    usageCost: number
  ): Promise<LivenessResult> => {
    console.log('response: ', response);
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
      recommendations
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
        (response, service, usageCost) => processDocumentRecognition(response, service, request, usageCost)
      );
    },

    async faceSearch(request: FaceSearch): Promise<FaceDetectionResult> {
      return executeAIModel(
        request.endpoint,
        request,
        getFaceSearchPrompt(),
        [request.image],
        (response, service, usageCost) => processFaceSearch(response, service, request, usageCost)
      );
    },

    async faceVerify(request: FaceVerification): Promise<FaceVerificationResult> {

      return executeAIModel(
        request.endpoint,
        request,
        getFaceComparisonPrompt(),
        [request.image],
        (response, service, usageCost) => processFaceVerification(response, service, request, usageCost)
      );
    },

    async livenessDetection(request: LivenessDetection): Promise<LivenessResult> {
      const prompt = getLivenessDetectionPrompt(request.isVideo);        
      console.log('prompt: ', prompt);
      return executeAIModel(
        request.endpoint,
        request,
        prompt,
        [request.image],
        (response, service, usageCost) => processLivenessDetection(response, service, request, usageCost)
      );
    }
  };
}