import { AI_IMAGE_LIMITS } from './constant';

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

export function calculateConfidence(extractedData: any): number {
  const fields = Object.keys(extractedData).length;
  return Math.min(fields / 5, 0.95);
}

export function calculateFaceDetectionConfidence(faces: any[]): number {
  if (faces.length === 0) return 0;
  return faces.reduce((sum, face) => sum + (face.confidence || 0), 0) / faces.length;
}

export function calculateFaceVerificationConfidence(similarity: number): number {
  return Math.min(similarity * 1.2, 0.95);
}

export function getFaceSearchPrompt(): string {
  return `Bạn là hệ thống phát hiện khuôn mặt chuyên nghiệp. Hãy phân tích hình ảnh và phát hiện TẤT CẢ khuôn mặt người có trong ảnh.

YÊU CẦU:
1. Phát hiện chính xác từng khuôn mặt người
2. Trả về thông tin bounding box cho mỗi khuôn mặt
3. Chỉ trả lời bằng JSON với định dạng sau:

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
1. Nếu không có khuôn mặt nào, trả về "face_count": 0 và "faces": []
2. Tọa độ (0,0) là góc trên bên trái của ảnh
3. Tọa độ phải nằm trong phạm vi kích thước ảnh
4. Đối với các điểm landmarks không phát hiện được, để giá trị null
5. Độ tin cậy (confidence) phải từ 0.0 đến 1.0
6. Ưu tiên độ chính xác hơn số lượng (tránh phát hiện sai)

CHỈ TRẢ LỜI BẰNG JSON, KHÔNG CÓ BẤT KỲ VĂN BẢN NÀO KHÁC, KHÔNG GIẢI THÍCH.

Hãy phân tích hình ảnh sau:`;
}

// Document prompts
export function getDocumentPrompt(docType: string): string {
  const prompts: Record<string, string> = {
    driver: `Bạn là hệ thống trích xuất thông tin từ giấy tờ tùy thân Việt Nam. Hãy phân tích hình ảnh Giấy phép lái xe Việt Nam và trích xuất các thông tin sau ĐÚNG NHƯ CHÚNG XUẤT HIỆN TRONG ẢNH. Chỉ trả lời bằng JSON với các khóa sau:
{
  "name": "Họ và tên",
  "license_number": "Số giấy phép lái xe",
  "dob": "Ngày tháng năm sinh (dd/mm/yyyy)",
  "expiry": "Ngày hết hạn (dd/mm/yyyy)",
  "address": "Địa chỉ",
  "license_class": "Hạng giấy phép",
  "issue_place": "Nơi cấp",
  "confidence_score": 0.0-1.0,
  "field_confidence": {
    "name": 0.0-1.0,
    "license_number": 0.0-1.0,
    "dob": 0.0-1.0,
    "expiry": 0.0-1.0,
    "address": 0.0-1.0,
    "license_class": 0.0-1.0,
    "issue_place": 0.0-1.0
  },
  "quality_assessment": {
    "image_clarity": "Cao/Trung bình/Thấp",
    "text_readability": "Dễ đọc/Khó đọc/Không đọc được",
    "document_completeness": "Đầy đủ/Thiếu phần/Che khuất"
  }
}
Nếu không tìm thấy thông tin cho một trường, để giá trị là "". 
confidence_score: Độ tin cậy tổng thể (0.0-1.0) dựa trên chất lượng ảnh và độ rõ của thông tin.
field_confidence: Độ tin cậy cho từng trường riêng lẻ.
CHỈ TRẢ LỜI BẰNG JSON, KHÔNG CÓ VĂN BẢN NÀO KHÁC.`,

    cmt: `Bạn là hệ thống trích xuất thông tin từ giấy tờ tùy thân Việt Nam. Hãy phân tích hình ảnh Chứng minh nhân dân (CMND) cũ Việt Nam và trích xuất các thông tin sau ĐÚNG NHƯ CHÚNG XUẤT HIỆN TRONG ẢNH. Chỉ trả lời bằng JSON với các khóa sau:
{
  "full_name": "Họ và tên",
  "id_number": "Số CMND",
  "dob": "Ngày tháng năm sinh (dd/mm/yyyy)",
  "expire_date": "Ngày hết hạn (dd/mm/yyyy) - nếu không có để trống",
  "place": "Địa chỉ thường trú/Nguyên quán",
  "characteristics": "Đặc điểm nhận dạng",
  "issue_date": "Ngày cấp (dd/mm/yyyy)",
  "issue_place": "Nơi cấp",
  "confidence_score": 0.0-1.0,
  "field_confidence": {
    "full_name": 0.0-1.0,
    "id_number": 0.0-1.0,
    "dob": 0.0-1.0,
    "expire_date": 0.0-1.0,
    "place": 0.0-1.0,
    "characteristics": 0.0-1.0,
    "issue_date": 0.0-1.0,
    "issue_place": 0.0-1.0
  },
  "validation_flags": {
    "format_valid": true/false,
    "checksum_valid": true/false (nếu có thể kiểm tra),
    "date_consistency": true/false
  }
}
Nếu không tìm thấy thông tin cho một trường, để giá trị là "". 
confidence_score: Đánh giá tổng thể dựa trên độ rõ của ảnh và thông tin.
field_confidence: Độ chắc chắn cho từng trường cụ thể.
CHỈ TRẢ LỜI BẰNG JSON, KHÔNG CÓ VĂN BẢN NÀO KHÁC.`,

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
Nếu không tìm thấy thông tin cho một trường, để giá trị là "". 
confidence_score: Đánh giá tổng thể về độ tin cậy của dữ liệu trích xuất.
field_confidence: Độ chắc chắn cho từng trường thông tin cụ thể.
CHỈ TRẢ LỜI BẰNG JSON, KHÔNG CÓ VĂN BẢN NÀO KHÁC.`,

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
  }
}
Nếu không tìm thấy thông tin cho một trường, để giá trị là "". 
confidence_score: Đánh giá tổng thể về độ rõ và đầy đủ của thông tin.
CHỈ TRẢ LỜI BẰNG JSON, KHÔNG CÓ VĂN BẢN NÀO KHÁC.`,

    passport: `Bạn là hệ thống trích xuất thông tin từ hộ chiếu. Hãy phân tích hình ảnh Hộ chiếu và trích xuất các thông tin sau ĐÚNG NHƯ CHÚNG XUẤT HIỆN TRONG ẢNH. Chỉ trả lời bằng JSON với các khóa sau:
{
  "full_name": "Họ và tên (viết hoa, đúng thứ tự)",
  "passport_number": "Số hộ chiếu",
  "nationality": "Quốc tịch",
  "dob": "Ngày tháng năm sinh (dd/mm/yyyy)",
  "expiry_date": "Ngày hết hạn (dd/mm/yyyy)",
  "issue_date": "Ngày cấp (dd/mm/yyyy)",
  "issue_place": "Nơi cấp",
  "type": "Loại (P - Ordinary, D - Diplomatic, etc)",
  "sex": "Giới tính (M/F)",
  "mrz": "Toàn bộ MRZ (Machine Readable Zone)",
  "confidence_score": 0.0-1.0,
  "field_confidence": {
    "full_name": 0.0-1.0,
    "passport_number": 0.0-1.0,
    "nationality": 0.0-1.0,
    "dob": 0.0-1.0,
    "expiry_date": 0.0-1.0,
    "issue_date": 0.0-1.0,
    "issue_place": 0.0-1.0,
    "type": 0.0-1.0,
    "sex": 0.0-1.0,
    "mrz": 0.0-1.0
  },
  "mrz_analysis": {
    "mrz_complete": true/false,
    "checksum_valid": true/false,
    "data_consistency": "Tương thích/Không tương thích"
  },
  "image_quality": {
    "page_visibility": "Toàn bộ/Che một phần",
    "focus_clarity": "Rõ nét/Mờ",
    "glare_present": true/false
  }
}
Nếu không tìm thấy thông tin cho một trường, để giá trị là "". 
confidence_score: Độ tin cậy tổng thể dựa trên chất lượng ảnh và độ chính xác MRZ.
field_confidence: Độ chắc chắn cho từng trường thông tin.
CHỈ TRẢ LỜI BẰNG JSON, KHÔNG CÓ VĂN BẢN NÀO KHÁC.`,

    general_id: `Bạn là hệ thống trích xuất thông tin từ giấy tờ tùy thân. Hãy phân tích hình ảnh tài liệu nhận dạng và:
1. Xác định loại giấy tờ
2. Trích xuất thông tin chính xác từ hình ảnh
3. Đánh giá độ tin cậy

Chỉ trả lời bằng JSON với các khóa sau:
{
  "document_type": "Loại giấy tờ (VD: CCCD, CMND, Passport, Driver License, etc)",
  "document_type_confidence": 0.0-1.0,
  "name": "Họ và tên",
  "id_number": "Số định danh/Số giấy tờ",
  "dob": "Ngày tháng năm sinh (dd/mm/yyyy)",
  "expiry_date": "Ngày hết hạn (dd/mm/yyyy) - nếu có",
  "issue_date": "Ngày cấp (dd/mm/yyyy) - nếu có",
  "nationality": "Quốc tịch - nếu có",
  "address": "Địa chỉ - nếu có",
  "confidence_score": 0.0-1.0,
  "field_confidence": {
    "document_type": 0.0-1.0,
    "name": 0.0-1.0,
    "id_number": 0.0-1.0,
    "dob": 0.0-1.0,
    "expiry_date": 0.0-1.0,
    "issue_date": 0.0-1.0,
    "nationality": 0.0-1.0,
    "address": 0.0-1.0
  },
  "analysis_metadata": {
    "extraction_quality": "High/Medium/Low",
    "recommended_action": "Accept/Review/Re-extract",
    "potential_errors": ["Các lỗi tiềm ẩn"]
  }
}
Nếu không tìm thấy thông tin cho một trường, để giá trị là "". 
confidence_score: Đánh giá tổng thể về độ tin cậy của toàn bộ quá trình trích xuất.
field_confidence: Độ tin cậy cho từng trường riêng lẻ.
CHỈ TRẢ LỜI BẰNG JSON, KHÔNG CÓ VĂN BẢN NÀO KHÁC.`
  };

  return prompts[docType] || prompts.general_id;
}

export function getFaceComparisonPrompt(): string {
  return `Bạn là hệ thống so sánh khuôn mặt chuyên nghiệp. Hãy phân tích HAI ảnh khuôn mặt và đánh giá mức độ tương đồng.

YÊU CẦU:
1. So sánh chi tiết các đặc điểm khuôn mặt: mắt, mũi, miệng, hình dáng khuôn mặt
2. Tính toán điểm tương đồng từ 0.0 đến 1.0
3. Đưa ra kết luận có phải cùng một người hay không
4. Mô tả ngắn gọn lý do

Chỉ trả lời bằng JSON với định dạng sau:

{
  "similarity": "Điểm tương đồng từ 0.0 đến 1.0 (số thập phân, 1.0 là giống hệt)",
  "isMatch": "Có phải cùng một người không (true/false)",
  "description": "Mô tả ngắn gọn lý do (2-3 câu, tiếng Việt)",
  "confidence": "Độ tin cậy của kết luận (0.0-1.0)",
  "features_compared": {
    "eyes": "Mức độ tương đồng mắt (0.0-1.0)",
    "nose": "Mức độ tương đồng mũi (0.0-1.0)",
    "mouth": "Mức độ tương đồng miệng (0.0-1.0)",
    "face_shape": "Mức độ tương đồng hình dạng khuôn mặt (0.0-1.0)",
    "eyebrows": "Mức độ tương đồng lông mày (0.0-1.0)"
  },
  "match_reason": [
    "Lý do chính cho kết quả so khớp/không khớp"
  ]
}

QUY TẮC:
1. Chỉ so sánh khi CẢ HAI ảnh đều có khuôn mặt rõ ràng
2. Nếu một trong hai ảnh không có khuôn mặt hoặc chất lượng kém:
   - similarity: 0.0
   - isMatch: false
   - description: "Không thể so sánh vì [lý do]"
3. Ngưỡng mặc định:
   - similarity >= 0.75: isMatch = true (có thể cùng người)
   - similarity < 0.75: isMatch = false (khác người)
4. Điều chỉnh ngưỡng dựa trên chất lượng ảnh và góc chụp
5. Ưu tiên độ chính xác, không phải tốc độ

CHỈ TRẢ LỜI BẰNG JSON, KHÔNG CÓ BẤT KỲ VĂN BẢN NÀO KHÁC, KHÔNG GIẢI THÍCH.

Hãy so sánh hai khuôn mặt trong các ảnh sau:`;
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