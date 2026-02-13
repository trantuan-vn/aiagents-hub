import { AI_IMAGE_LIMITS } from './constant';

/** Hash identifier for R2 key prefix (privacy-safe) */
export async function hashIdentifier(identifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(identifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** Save file to R2 eKYC bucket, return key */
export async function saveToEkycR2(
  env: { R2_EKYC_BUCKET: R2Bucket },
  userPrefix: string,
  filename: string,
  file: File | Blob
): Promise<string> {
  const key = `ekyc/${userPrefix}/${filename}`;
  const buffer = await (file instanceof File ? file.arrayBuffer() : file.arrayBuffer());
  await env.R2_EKYC_BUCKET.put(key, buffer, {
    httpMetadata: { contentType: file instanceof File ? file.type : 'application/octet-stream' },
  });
  return key;
}

/** Get file from R2 as ArrayBuffer for face verification */
export async function getFromEkycR2(env: { R2_EKYC_BUCKET: R2Bucket }, key: string): Promise<ArrayBuffer | null> {
  const obj = await env.R2_EKYC_BUCKET.get(key);
  if (!obj) return null;
  return obj.arrayBuffer();
}

export const processFormData = async (c: any) => {
  const formData = await c.req.formData();
  const image = formData.get('image') as File;
  const image2 = formData.get('image2') as File | null;
  const docType = (formData.get('type') as string) || 'general';
  const isVideo = formData.has('video');

  if (!image) throw new Error('Missing image');
  if (!['image/jpeg', 'image/png'].includes(image.type)) {
    throw new Error('Invalid file type. Only JPEG/PNG images are supported.');
  }

  return { image, image2, docType, isVideo };
};

/** Form data for document step: passport (1 img) or cccd (2 imgs) */
export const processDocumentFormData = async (c: any) => {
  const formData = await c.req.formData();
  const docType = (formData.get('docType') as string) || (formData.get('type') as string) || 'cccd';
  const image = formData.get('image') as File | null;
  const imageFront = formData.get('image_front') as File | null;
  const imageBack = formData.get('image_back') as File | null;

  if (docType === 'passport') {
    const img = image ?? imageFront;
    if (!img) throw new Error('Missing passport image');
    if (!['image/jpeg', 'image/png'].includes(img.type)) throw new Error('Invalid file type');
    return { docType: 'passport' as const, images: [img] };
  }
  if (docType === 'cccd') {
    const front = image ?? imageFront;
    if (!front) throw new Error('Missing CCCD front image');
    if (!imageBack) throw new Error('Missing CCCD back image');
    if (!['image/jpeg', 'image/png'].includes(front.type) || !['image/jpeg', 'image/png'].includes(imageBack.type)) {
      throw new Error('Invalid file type');
    }
    return { docType: 'cccd' as const, images: [front, imageBack] };
  }
  throw new Error('Invalid docType. Use passport or cccd.');
};

/** Form data for face step: video clip or multiple images. When video is sent, face_frame (first frame) is required for liveness/verify. */
export const processFaceFormData = async (c: any) => {
  const formData = await c.req.formData();
  const faceVideo = formData.get('face_video') as File | null;
  const faceFrame = formData.get('face_frame') as File | null;
  const faceImages = formData.getAll('face_images') as File[];
  const image = formData.get('image') as File | null;

  if (faceVideo && faceVideo.size > 0) {
    const frame = faceFrame ?? image;
    if (!frame) throw new Error('When sending video, also send face_frame (first frame) for liveness check');
    return { type: 'video' as const, file: faceVideo, frame };
  }
  if (faceImages.length > 0) {
    return { type: 'images' as const, files: faceImages };
  }
  if (image) {
    return { type: 'image' as const, file: image };
  }
  throw new Error('Missing face video or images');
};

export async function toBase64(img: File): Promise<string> {
  try {
    const buffer = await img.arrayBuffer();
    return dataUriFromBuffer(buffer, img.type);
  } catch {
    throw new Error('Failed to process image');
  }
}

/** Chuyển ArrayBuffer + MIME thành data URI (base64). */
export function dataUriFromBuffer(buffer: ArrayBuffer, mimeType: string): string {
  const b64 = typeof Buffer !== 'undefined'
    ? Buffer.from(buffer).toString('base64')
    : btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return `data:${mimeType};base64,${b64}`;
}

/**
 * Chuẩn hóa ảnh trước khi gửi AI: kiểm tra kích thước, trả buffer + MIME.
 * Ảnh quá lớn làm tăng token và chi phí, giảm có thể ảnh hưởng độ chính xác.
 */
export async function prepareImageForAI(
  file: File,
  options?: { maxSizeBytes?: number }
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const max = options?.maxSizeBytes ?? AI_IMAGE_LIMITS.MAX_SIZE_BYTES;
  if (file.size > max) {
    throw new Error(
      `Image too large (${(file.size / 1024).toFixed(0)}KB). ` +
      `Max ${(max / 1024 / 1024).toFixed(1)}MB. ` +
      `For best cost & accuracy, resize to max ${AI_IMAGE_LIMITS.RECOMMENDED_MAX_DIMENSION}px and under ${(AI_IMAGE_LIMITS.RECOMMENDED_MAX_BYTES / 1024).toFixed(0)}KB.`
    );
  }
  const buffer = await file.arrayBuffer();
  return { buffer, mimeType: file.type };
}

export function safeJsonParse(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    return {};
  }
}

/**
 * Tính confidence cho document recognition dựa trên extracted data.
 * Xem xét số lượng fields có giá trị và field_confidence nếu có.
 */
export function calculateConfidence(extractedData: any): number {
  if (!extractedData || typeof extractedData !== 'object') {
    return 0;
  }

  // Nếu có field_confidence từ AI, sử dụng trung bình của chúng
  if (extractedData.field_confidence && typeof extractedData.field_confidence === 'object') {
    const fieldConfidences = Object.values(extractedData.field_confidence) as number[];
    const validConfidences = fieldConfidences.filter(
      (conf): conf is number => typeof conf === 'number' && conf >= 0 && conf <= 1
    );
    if (validConfidences.length > 0) {
      const avgConfidence = validConfidences.reduce((sum, conf) => sum + conf, 0) / validConfidences.length;
      return Math.min(Math.max(avgConfidence, 0), 1);
    }
  }

  // Fallback: tính dựa trên số lượng fields có giá trị
  const allFields = Object.keys(extractedData).filter(
    key => key !== 'confidence_score' && key !== 'field_confidence' && key !== 'data_quality'
  );
  const nonEmptyFields = allFields.filter(key => {
    const value = extractedData[key];
    return value !== null && value !== undefined && value !== '';
  });

  if (allFields.length === 0) {
    return 0;
  }

  // Confidence dựa trên tỷ lệ fields có giá trị
  // Giả sử cần ít nhất 5 fields quan trọng
  const completeness = nonEmptyFields.length / allFields.length;
  const minRequiredFields = 5;
  const fieldCountFactor = Math.min(nonEmptyFields.length / minRequiredFields, 1);
  
  // Kết hợp completeness và field count
  const confidence = (completeness * 0.6 + fieldCountFactor * 0.4);
  
  return Math.min(Math.max(confidence, 0), 0.95);
}

/**
 * Tính confidence cho face detection dựa trên tất cả faces được phát hiện.
 */
export function calculateFaceDetectionConfidence(faces: any[]): number {
  if (!faces || faces.length === 0) {
    return 0;
  }

  // Lấy confidence của từng face (đã được normalize trong processFaceSearch)
  const confidences = faces
    .map(face => face.confidence)
    .filter((conf): conf is number => typeof conf === 'number' && conf >= 0 && conf <= 1);

  if (confidences.length === 0) {
    return 0;
  }

  // Tính trung bình confidence
  const avgConfidence = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;

  // Điều chỉnh nhẹ nếu có nhiều faces (có thể là false positive)
  // 1 face: confidence cao nhất, nhiều faces: giảm nhẹ
  const faceCountAdjustment = faces.length > 1 ? 0.95 : 1.0;

  return Math.min(Math.max(avgConfidence * faceCountAdjustment, 0), 1);
}

/**
 * Tính confidence cho face verification dựa trên similarity score.
 * Confidence tương quan với similarity nhưng có thể điều chỉnh.
 */
export function calculateFaceVerificationConfidence(similarity: number): number {
  // Đảm bảo similarity trong khoảng hợp lệ
  const normalizedSimilarity = Math.min(Math.max(similarity, 0), 1);

  // Confidence nên tương quan với similarity
  // Khi similarity cao (>= 0.8), confidence tăng nhanh hơn
  if (normalizedSimilarity >= 0.8) {
    // Cao: confidence gần như bằng similarity, có thể cao hơn một chút
    return Math.min(normalizedSimilarity * 1.1, 0.95);
  } else if (normalizedSimilarity >= 0.5) {
    // Trung bình: confidence tương đương similarity
    return normalizedSimilarity;
  } else {
    // Thấp: confidence thấp hơn similarity một chút
    return normalizedSimilarity * 0.8;
  }
}
/**
 * Ghép 2 ảnh thành 1 ảnh (đặt cạnh nhau, ảnh 1 bên trái, ảnh 2 bên phải)
 * Sử dụng Cloudflare Images API nếu có, hoặc fallback về cách khác
 * 
 * @param image1 Ảnh đầu tiên (bên trái)
 * @param image2 Ảnh thứ hai (bên phải)
 * @param env Cloudflare Workers environment (optional, để sử dụng Images API)
 * @returns File ảnh đã ghép
 */
export async function mergeImages(
  image1: File, 
  image2: File, 
  env: { IMAGES: ImagesBinding }
): Promise<File> {
  return await mergeImagesWithCloudflareAPI(image1, image2, env.IMAGES);
}

/**
 * Helper function để chuyển Uint8Array thành ReadableStream
 */
function arrayBufferToStream(buffer: ArrayBuffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    }
  });
}

/**
 * Ghép 2 ảnh sử dụng Cloudflare Images API
 */
async function mergeImagesWithCloudflareAPI(
  image1: File,
  image2: File,
  imagesBinding: ImagesBinding
): Promise<File> {
  // Đọc buffer của cả 2 ảnh
  const buffer1 = await image1.arrayBuffer();
  const buffer2 = await image2.arrayBuffer();

  // Lấy thông tin ảnh 1 và 2 (cần ReadableStream)
  const info1 = await imagesBinding.info(arrayBufferToStream(buffer1));
  const info2 = await imagesBinding.info(arrayBufferToStream(buffer2));

  // Tính kích thước ảnh ghép (đặt cạnh nhau)
  // ImageInfoResponse có thể là union type, cần kiểm tra
  const width1 = ('width' in info1 ? info1.width : 640) ?? 640;
  const height1 = ('height' in info1 ? info1.height : 480) ?? 480;
  const width2 = ('width' in info2 ? info2.width : 640) ?? 640;
  const height2 = ('height' in info2 ? info2.height : 480) ?? 480;
  
  const mergedWidth = width1 + width2;
  const mergedHeight = Math.max(height1, height2);
  
  // Tạo ảnh nền trắng với kích thước đã tính
  // Sử dụng ảnh 1 làm base, sau đó draw ảnh 2 lên bên phải
  const baseImage = imagesBinding.input(arrayBufferToStream(buffer1));
  
  // Transform ảnh 1 để có kích thước phù hợp
  const transformed1 = baseImage.transform({
    width: width1,
    height: height1,
    fit: 'contain'
  });
  
  // Tạo ảnh ghép bằng cách draw ảnh 2 lên bên phải của ảnh 1
  // Tạo ảnh nền với kích thước đã tính
  const mergedImage = transformed1.transform({
    width: mergedWidth,
    height: mergedHeight,
    fit: 'pad',
    background: '#FFFFFF'
  });
  
  // Draw ảnh 2 lên bên phải
  const image2Input = imagesBinding.input(arrayBufferToStream(buffer2));
  const transformed2 = image2Input.transform({
    width: width2,
    height: height2,
    fit: 'contain'
  });
  
  // Draw ảnh 2 lên vị trí bên phải
  const finalImage = mergedImage.draw(transformed2, {
    left: width1,
    top: 0
  });
  
  // Output ảnh cuối cùng
  const output = await finalImage.output({
    format: 'image/jpeg',
    quality: 90
  });
  
  // Chuyển ReadableStream thành ArrayBuffer rồi tạo File
  const reader = output.image().getReader();
  const chunks: Uint8Array[] = [];
  let done = false;
  
  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    if (value) {
      chunks.push(value);
    }
  }
  
  // Combine chunks thành một Uint8Array
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const mergedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    mergedBuffer.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Tạo File từ buffer
  return new File([mergedBuffer], 'merged-image.jpg', { type: 'image/jpeg' });
}


// Document prompts
export function getDocumentPrompt(docType: string): string {
  const prompts: Record<string, string> = {
    cccd_front: `Bạn là hệ thống trích xuất thông tin từ giấy tờ tùy thân Việt Nam. Hãy phân tích hình ảnh Căn cước công dân (CCCD) mặt trước Việt Nam và trích xuất các thông tin sau ĐÚNG NHƯ CHÚNG XUẤT HIỆN TRONG ẢNH. Chỉ trả lời bằng JSON với các khóa sau:
{
  "no": "Số định danh cá nhân/Số CCCD",
  "full_name": "Họ và tên",
  "date_of_birth": "Ngày tháng năm sinh (dd/mm/yyyy)",
  "sex": "Giới tính (Nam/Nữ)",
  "nationality": "Quốc tịch",
  "place_of_origin": "Nguyên quán",
  "place_of_residence": "Nơi thường trú",
  "date_of_expiry": "Ngày hết hạn (dd/mm/yyyy)",
  "confidence_score": 0.0-1.0,
  "field_confidence": {
    "no": 0.0-1.0,
    "full_name": 0.0-1.0,
    "date_of_birth": 0.0-1.0,
    "sex": 0.0-1.0,
    "nationality": 0.0-1.0,
    "place_of_origin": 0.0-1.0,
    "place_of_residence": 0.0-1.0,
    "date_of_expiry": 0.0-1.0
  },
  "data_quality": {
    "ocr_accuracy": "Cao/Trung bình/Thấp",
    "field_completeness": "Đầy đủ/Thiếu/Không rõ",
    "format_compliance": "Đúng định dạng/Sai định dạng"
  }
}
YÊU CẦU QUAN TRỌNG:
1. CHỈ TRẢ LỜI BẰNG JSON DUY NHẤT - KHÔNG có văn bản, giải thích, ký tự nào khác
2. Nếu không tìm thấy thông tin cho một trường, để giá trị là "". 
3. confidence_score: Đánh giá tổng thể về độ tin cậy của dữ liệu trích xuất.
4. field_confidence: Độ chắc chắn cho từng trường thông tin cụ thể.
ĐẦU RA DUY NHẤT: MỘT JSON OBJECT.`,

    cccd_back: `Bạn là hệ thống trích xuất thông tin từ giấy tờ tùy thân Việt Nam. Hãy phân tích hình ảnh Căn cước công dân (CCCD) mặt sau Việt Nam và trích xuất các thông tin sau ĐÚNG NHƯ CHÚNG XUẤT HIỆN TRONG ẢNH. Chỉ trả lời bằng JSON với các khóa sau:
{
  "personal_identification": "Đặc điểm nhận dạng",
  "issue_date": "Ngày cấp (dd/mm/yyyy)",
  "issue_address": "Nơi cấp",
  "confidence_score": 0.0-1.0,
  "field_confidence": {
    "personal_identification": 0.0-1.0,
    "issue_date": 0.0-1.0,
    "issue_address": 0.0-1.0
  },
  "additional_info": {
    "mrz_present": true/false,
    "chip_location": "Có thể nhìn thấy/Không nhìn thấy",
    "security_features": ["Các đặc điểm bảo mật nhìn thấy"]
  },
  "data_quality": {
    "ocr_accuracy": "Cao/Trung bình/Thấp",
    "field_completeness": "Đầy đủ/Thiếu/Không rõ",
    "format_compliance": "Đúng định dạng/Sai định dạng"
  }
}
YÊU CẦU QUAN TRỌNG:
1. CHỈ TRẢ LỜI BẰNG JSON DUY NHẤT - KHÔNG có văn bản, giải thích, ký tự nào khác
2. Nếu không tìm thấy thông tin cho một trường, để giá trị là "". 
3. confidence_score: Đánh giá tổng thể về độ rõ và đầy đủ của thông tin.
ĐẦU RA DUY NHẤT: MỘT JSON OBJECT.`,

    passport: `Bạn là hệ thống trích xuất thông tin từ hộ chiếu. Hãy phân tích hình ảnh Hộ chiếu và trích xuất các thông tin sau ĐÚNG NHƯ CHÚNG XUẤT HIỆN TRONG ẢNH. Chỉ trả lời bằng JSON với các khóa sau:
{
  "type": "Loại hộ chiếu (P - Ordinary, D - Diplomatic, etc)",
  "code": "Mã quốc gia",
  "passport_no": "Số hộ chiếu",
  "full_name": "Họ và tên (viết hoa, đúng thứ tự)",
  "nationality": "Quốc tịch",
  "date_of_birth": "Ngày tháng năm sinh (dd/mm/yyyy)",
  "place_of_birth": "Nơi sinh",
  "sex": "Giới tính (M/F)",
  "id_card_no": "Số CCCD",
  "date_of_issue": "Ngày cấp (dd/mm/yyyy)",
  "date_of_expiry": "Ngày hết hạn (dd/mm/yyyy)",  
  "place_of_issue": "Nơi cấp",  
  "confidence_score": 0.0-1.0,
  "field_confidence": {
    "type": 0.0-1.0,
    "code": 0.0-1.0,
    "passport_no": 0.0-1.0,
    "full_name": 0.0-1.0,
    "nationality": 0.0-1.0,
    "date_of_birth": 0.0-1.0,
    "place_of_birth": 0.0-1.0,
    "sex": 0.0-1.0,
    "id_card_no": 0.0-1.0,
    "date_of_issue": 0.0-1.0,
    "date_of_expiry": 0.0-1.0,
    "place_of_issue": 0.0-1.0,
  },
  "data_quality": {
    "ocr_accuracy": "Cao/Trung bình/Thấp",
    "field_completeness": "Đầy đủ/Thiếu/Không rõ",
    "format_compliance": "Đúng định dạng/Sai định dạng"
  }
}
YÊU CẦU QUAN TRỌNG:
1. CHỈ TRẢ LỜI BẰNG JSON DUY NHẤT - KHÔNG có văn bản, giải thích, ký tự nào khác
2. Nếu không tìm thấy thông tin cho một trường, để giá trị là "". 
3. confidence_score: Độ tin cậy tổng thể dựa trên chất lượng ảnh và độ chính xác MRZ.
4. field_confidence: Độ chắc chắn cho từng trường thông tin.
ĐẦU RA DUY NHẤT: MỘT JSON OBJECT.`
  };

  return prompts[docType] || prompts.general_id;
}

export function getFaceSearchPrompt(): string {
  return `Bạn là hệ thống phát hiện khuôn mặt tự động. Phân tích hình ảnh này và phát hiện TẤT CẢ khuôn mặt người có trong ảnh.

YÊU CẦU QUAN TRỌNG:
1. CHỈ TRẢ LỜI BẰNG JSON DUY NHẤT - KHÔNG có văn bản, giải thích, ký tự nào khác
2. Bounding box (hộp giới hạn) PHẢI vừa khít với từng khuôn mặt, không được bằng toàn bộ ảnh
3. Bounding box phải bao quanh chính xác khuôn mặt: từ trán đến cằm, từ má trái sang má phải

JSON OUTPUT FORMAT - CHỈ TRẢ VỀ ĐÚNG ĐỊNH DẠNG NÀY:
{
  "face_count": "Số lượng khuôn mặt phát hiện được (số nguyên)",
  "faces": [
    {
      "box": {
        "x": "Tọa độ x góc trên bên trái (số nguyên, pixel)",
        "y": "Tọa độ y góc trên bên trái (số nguyên, pixel)",
        "width": "Chiều rộng bounding box (số nguyên, pixel)",
        "height": "Chiều cao bounding box (số nguyên, pixel)"
      },
      "confidence": "Độ tin cậy phát hiện (số thập phân từ 0.0 đến 1.0)",
      "landmarks": {
        "left_eye": {"x": "Tọa độ x mắt trái", "y": "Tọa độ y mắt trái"},
        "right_eye": {"x": "Tọa độ x mắt phải", "y": "Tọa độ y mắt phải"},
        "nose": {"x": "Tọa độ x mũi", "y": "Tọa độ y mũi"},
        "mouth_left": {"x": "Tọa độ x mép trái", "y": "Tọa độ y mép trái"},
        "mouth_right": {"x": "Tọa độ x mép phải", "y": "Tọa độ y mép phải"}
      }
    }
  ],
  "image_dimensions": {
    "width": "Chiều rộng ảnh gốc (số nguyên, pixel)",
    "height": "Chiều cao ảnh gốc (số nguyên, pixel)"
  }
}

QUY TẮC:
1. Tọa độ (0,0) là góc trên bên trái của ảnh
2. Tọa độ phải nằm trong phạm vi kích thước ảnh
3. Đối với các điểm landmarks không phát hiện được, để giá trị null
4. Ưu tiên độ chính xác hơn số lượng (tránh phát hiện sai)
5. Bounding box phải vừa khít với khuôn mặt, không quá lớn
6. Box chỉ chứa khuôn mặt, không chứa nền thừa
7. Tọa độ box phải hợp lệ: x + width ≤ image_width, y + height ≤ image_height
8. Box không được trùng với kích thước toàn ảnh (trừ khi ảnh chỉ có duy nhất 1 khuôn mặt chiếm toàn bộ ảnh)
9. Mỗi box phải độc lập cho từng khuôn mặt, không chồng chéo quá nhiều

ĐẦU RA DUY NHẤT: MỘT JSON OBJECT.`;
}

export function getFaceComparisonPrompt(): string {
  return `Bạn là một hệ thống AI chuyên so sánh khuôn mặt. Nhiệm vụ DUY NHẤT của bạn là trả về JSON phân tích hai khuôn mặt trong ảnh ghép (trái = gốc, phải = so sánh).

QUY TẮC TUYỆT ĐỐI - PHẢI TUÂN THỦ 100%, KHÔNG NGOẠI LỆ:
- TOÀN BỘ PHẢN HỒI CỦA BẠN PHẢI BẮT ĐẦU NGAY BẰNG DẤU { VÀ KẾT THÚC BẰNG DẤU }.
- KHÔNG ĐƯỢC CÓ BẤT KỲ CHỮ NÀO TRƯỚC JSON (không "Phân tích", không "response:", không "Kết quả:", không "Dựa trên ảnh", không "**", không giải thích, không lời dẫn).
- KHÔNG ĐƯỢC CÓ BẤT KỲ CHỮ NÀO SAU JSON (không kết luận, không tóm tắt, không note).
- KHÔNG ĐƯỢC THÊM TEXT GIẢI THÍCH, KHÔNG ĐƯỢC VIẾT GÌ NGOÀI NỘI DUNG JSON.
- Nếu vi phạm, kết quả sẽ bị coi là sai hoàn toàn.

ĐỊNH DẠNG JSON PHẢI ĐÚNG Y HỆT (không đổi key, không thêm key, giá trị đúng kiểu):

{
  "similarity": số thập phân 0.0-1.0,
  "isMatch": true hoặc false,
  "description": "chuỗi tiếng Việt ngắn gọn 2-4 câu",
  "confidence": số thập phân 0.0-1.0,
  "features_compared": {
    "eyes": số 0.0-1.0,
    "nose": số 0.0-1.0,
    "mouth": số 0.0-1.0,
    "face_shape": số 0.0-1.0,
    "eyebrows": số 0.0-1.0
  },
  "match_reason": [
    "lý do tiếng Việt 1",
    "lý do tiếng Việt 2",
    "lý do tiếng Việt 3 nếu cần"
  ]
}

Ví dụ output ĐÚNG (chỉ để bạn học theo cấu trúc, KHÔNG copy nội dung này):

{"similarity":0.87,"isMatch":true,"description":"Hai khuôn mặt có độ tương đồng cao về hình dáng tổng thể và các đặc điểm chính. Khác biệt nhỏ do góc chụp và ánh sáng.","confidence":0.92,"features_compared":{"eyes":0.89,"nose":0.85,"mouth":0.82,"face_shape":0.94,"eyebrows":0.88},"match_reason":["Hình dáng khuôn mặt oval giống nhau","Mắt và lông mày có đặc điểm rất tương đồng","Các khác biệt nhỏ không ảnh hưởng đến kết luận chung"]}

Bây giờ, phân tích ảnh ghép được cung cấp và TRẢ VỀ CHỈ JSON NHƯ TRÊN. KHÔNG THÊM BẤT KỲ DIỄN GIẢI NÀO KHÁC.`;
}

export function getLivenessDetectionPrompt(isVideoFrame: boolean = false): string {
  const mediaType = isVideoFrame ? "khung hình video" : "hình ảnh tĩnh";
  const motionContext = isVideoFrame 
    ? "Phân tích như một phần của luồng video, tìm dấu hiệu chuyển động và tính liên tục."
    : "Phân tích hình ảnh tĩnh, tập trung vào đặc điểm tĩnh và dấu hiệu giả mạo.";

  return `Bạn là hệ thống phát hiện sự sống (liveness detection) chuyên sâu. Hãy phân tích ${mediaType} này để xác định đây là người thật hay hình ảnh giả mạo.

${motionContext}

YÊU CẦU PHÂN TÍCH:
1. Tìm dấu hiệu của ảnh giả mạo (spoofing)
2. ${isVideoFrame ? "Phát hiện yếu tố 'sự sống' và chuyển động tự nhiên" : "Đánh giá tính xác thực dựa trên đặc điểm tĩnh"}
3. Đánh giá rủi ro trên thang điểm 0-1
4. Xác định loại tấn công giả mạo nếu có

Chỉ trả lời bằng JSON với định dạng:

{
  "isLive": "Có phải người thật không (true/false)",
  "details": "Mô tả chi tiết phát hiện (2-3 câu, tiếng Việt)",
  "spoofType": "Loại giả mạo nếu phát hiện",
  "riskScore": "Điểm rủi ro từ 0.0 (an toàn) đến 1.0 (nguy cơ cao)",
  "confidence": "Độ tin cậy phân tích (0.0-1.0)",
  "mediaType": "${isVideoFrame ? "video_frame" : "static_image"}",
  "detectedSigns": {
    "livenessIndicators": ["danh sách dấu hiệu sự sống phát hiện"],
    "spoofIndicators": ["danh sách dấu hiệu giả mạo"],
    "warnings": ["cảnh báo hoặc yếu tố đáng ngờ"]
  },
  "imageAnalysis": {
    "resolutionQuality": "Cao/Trung bình/Thấp",
    "lightingCondition": "Tốt/Trung bình/Kém",
    "focusSharpness": "Sắc nét/Mờ vừa/Rất mờ",
    ${isVideoFrame ? '"motionArtifacts": "Có/Không có dấu hiệu chuyển động",' : '"compressionArtifacts": "Ít/Trung bình/Nhiều",'}
    "colorNaturalness": "Tự nhiên/Không tự nhiên"
  }
}

LOẠI TẤN CÔNG GIẢ MẠO CẦN PHÁT HIỆN:
- "print_attack": Ảnh in, hình chụp từ giấy
- "screen_replay": Ảnh chụp màn hình hiển thị
- "digital_photo": Ảnh số hiển thị trên thiết bị
- "mask_3d": Mặt nạ 3D, silicone
- "photo_cutout": Ảnh cắt dán
- "deepfake": Ảnh chỉnh sửa AI
- "mirror_attack": Ảnh qua gương
- "none": Không phát hiện giả mạo
- "unknown": Không xác định

${isVideoFrame ? `
DẤU HIỆU SỰ SỐNG CHO VIDEO:
- "natural_motion": Chuyển động tự nhiên
- "temporal_consistency": Tính nhất quán theo thời gian
- "blinking": Chớp mắt
- "micro_expressions": Biểu cảm vi mô
- "head_movement": Cử động đầu nhẹ
` : `
DẤU HIỆU SỰ SỐNG CHO ẢNH TĨNH:
- "natural_skin_texture": Kết cấu da tự nhiên, lỗ chân lông
- "depth_perception": Cảm nhận chiều sâu 3D
- "specular_highlights": Điểm sáng phản chiếu tự nhiên
- "shadow_consistency": Tính nhất quán của bóng đổ
- "background_integration": Hòa nhập tự nhiên với nền
`}

- "eye_reflection": Phản chiếu trong mắt
- "hair_detail": Chi tiết tóc tự nhiên
- "pupil_clarity": Độ rõ của đồng tử

DẤU HIỆU GIẢ MẠO ĐẶC TRƯNG:
${isVideoFrame ? `
- "frame_repetition": Lặp lại khung hình
- "unnatural_motion": Chuyển động giật cục, không tự nhiên
- "screen_flicker": Nhấp nháy màn hình
- "compression_banding": Vệt nén video
` : `
- "moire_patterns": Hiệu ứng moiré từ in ấn
- "paper_texture": Vân giấy, texture của chất liệu in
- "screen_pixelation": Điểm ảnh màn hình lộ rõ
- "flash_reflection": Phản chiếu đèn flash không tự nhiên
- "cutout_edges": Đường cắt xung quanh mặt
`}

QUY TẮC ĐÁNH GIÁ CHO ${isVideoFrame ? 'VIDEO' : 'ẢNH TĨNH'}:
1. isLive = true chỉ khi:
   - Phát hiện ít nhất ${isVideoFrame ? '3' : '2'} dấu hiệu sự sống rõ ràng
   - riskScore < ${isVideoFrame ? '0.4' : '0.3'} (${isVideoFrame ? 'video có thể phân tích tốt hơn' : 'ảnh tĩnh có độ không chắc chắn cao hơn'})
   - spoofType là "none" hoặc không phát hiện

2. ĐÁNH GIÁ RISKSCORE:
   - 0.0-0.2: AN TOÀN CAO (người thật)
   - 0.3-0.5: NGHI NGỜ THẤP (cần xem xét)
   - 0.6-0.7: NGHI NGỜ CAO (có dấu hiệu giả mạo)
   - 0.8-1.0: NGUY CƠ CAO (giả mạo rõ ràng)

3. LƯU Ý ĐẶC BIỆT CHO ${isVideoFrame ? 'VIDEO FRAME' : 'ẢNH TĨNH'}:
   ${isVideoFrame 
     ? '- Một frame đơn lẻ có thể không đủ để kết luận chắc chắn\n- Phân tích dựa trên các dấu hiệu chuyển động tiềm ẩn' 
     : '- Ảnh tĩnh có độ không chắc chắn cao hơn video\n- Cần phân tích kỹ texture và chi tiết'}

CHỈ TRẢ LỜI BẰNG JSON, KHÔNG VĂN BẢN, KHÔNG GIẢI THÍCH.

Phân tích ${mediaType} sau cho phát hiện sự sống:`;
}