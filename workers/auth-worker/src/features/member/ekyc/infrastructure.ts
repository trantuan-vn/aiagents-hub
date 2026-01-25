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
import { prepareImageForAI, dataUriFromBuffer, safeJsonParse, calculateConfidence, 
  calculateFaceDetectionConfidence, calculateFaceVerificationConfidence } from './utils';
import { getDocumentPrompt, getFaceSearchPrompt, getFaceComparisonPrompt, getLivenessDetectionPrompt } from './utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
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
    request: any
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
            queueStatus: 'pending'
          }
        }
      ]
    });
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
    processResult: (response: any, service: any) => Promise<any>
  ): Promise<any> => {
    // Validate and update service usage
    const service = await validateServiceUsage(endpoint);
    if (!service) {
      throw new Error('Service not found');
    }

    // Chuẩn hóa ảnh (giới hạn size) rồi mới gửi AI để tối ưu chi phí, vẫn đủ chi tiết
    const imageB64s = await Promise.all(
      images.map(async (img) => {
        const { buffer, mimeType } = await prepareImageForAI(img);
        return dataUriFromBuffer(buffer, mimeType);
      })
    );

    // Cloudflare Workers AI expects image_url.url (data URI), not type:'image'+image
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...imageB64s.map((dataUri) => ({ type: 'image_url', image_url: { url: dataUri } }))
      ]
    }];

    const maxTokens = request.options?.maxTokens ?? 400;
    const runModel = () =>
      env.AI.run(LLAMA_VISION_MODEL, {
        messages,
        max_tokens: maxTokens,
      });

    let response: any;
    try {
      response = await runModel();
    } catch (e) {
      if (isLlamaLicenseError(e)) {
        // Agree to license and retry
        await agreeToLlamaLicense();
        response = await runModel();
      } else {
        throw e;
      }
    }

    // Process result and update service usage
    return await processResult(response, service);
  };

  const processDocumentRecognition = async (
    response: any,
    service: any,
    request: DocumentRecognition
  ): Promise<DocumentExtractionResult> => {
    const raw = response?.response;
    const extractedData =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? raw
        : safeJsonParse(String(raw ?? '{}'));
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
    await updateServiceUsage(service, request.endpoint, request);
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
    request: FaceSearch
  ): Promise<FaceDetectionResult> => {
    const raw = response?.response;
    const data =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? raw
        : safeJsonParse(String(raw ?? '{}'));
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
    await updateServiceUsage(service, request.endpoint, request);
    return returnData;
  };

  const processFaceVerification = async (
    response: any,
    service: any,
    request: FaceVerification
  ): Promise<FaceVerificationResult> => {
    const raw = response?.response;
    const result =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? raw
        : safeJsonParse(String(raw ?? '{}'));
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
    await updateServiceUsage(service, request.endpoint, request);
    return returnData;
  };

  const processLivenessDetection = async (
    response: any,
    service: any,
    request: LivenessDetection
  ): Promise<LivenessResult> => {
    const raw = response?.response;
    const result =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? raw
        : safeJsonParse(String(raw ?? '{}'));
    const risk = Math.min(1, Math.max(0, Number(result?.riskScore) ?? 0.8));
    const conf =
      typeof result?.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1
        ? result.confidence
        : 1 - risk;
    const recommendations = Array.isArray(result?.detectedSigns?.warnings)
      ? result.detectedSigns.warnings
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
    await updateServiceUsage(service, request.endpoint, request);
    return returnData;
  };

  return {
    async recognizeDocument(request: DocumentRecognition): Promise<DocumentExtractionResult> {
      return executeAIModel(
        request.endpoint,
        request,
        getDocumentPrompt(request.docType),
        [request.image],
        (response, service) => processDocumentRecognition(response, service, request)
      );
    },

    async faceSearch(request: FaceSearch): Promise<FaceDetectionResult> {
      return executeAIModel(
        request.endpoint,
        request,
        getFaceSearchPrompt(),
        [request.image],
        (response, service) => processFaceSearch(response, service, request)
      );
    },

    async faceVerify(request: FaceVerification): Promise<FaceVerificationResult> {
      if (!request.image2) {
        throw new Error('Second image required for verification');
      }

      return executeAIModel(
        request.endpoint,
        request,
        getFaceComparisonPrompt(),
        [request.image, request.image2],
        (response, service) => processFaceVerification(response, service, request)
      );
    },

    async livenessDetection(request: LivenessDetection): Promise<LivenessResult> {
      const prompt = getLivenessDetectionPrompt(request.isVideo);        

      return executeAIModel(
        request.endpoint,
        request,
        prompt,
        [request.image],
        (response, service) => processLivenessDetection(response, service, request)
      );
    }
  };
}