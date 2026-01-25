/** Giới hạn ảnh gửi lên AI: giảm chi phí token, vẫn đủ chi tiết cho OCR/vision. */
export const AI_IMAGE_LIMITS = {
  /** Kích thước file tối đa (byte). Ảnh lớn hơn sẽ bị từ chối. */
  MAX_SIZE_BYTES: 2 * 1024 * 1024,
  /** Khuyến nghị: cạnh dài nhất &lt;= 1280px, file &lt; 500KB để tối ưu chi phí. */
  RECOMMENDED_MAX_DIMENSION: 1280,
  RECOMMENDED_MAX_BYTES: 500 * 1024,
} as const;

export const EKYC_SERVICES = {
  DOCUMENT: {
    RECOGNIZE: {
      path: '/api/ekyc/recognize-document',
      price: 1000
    }
  },
  FACE: {
    SEARCH: {
      path: '/api/ekyc/face-search',
      price: 1000
    },
    LIVENESS: {
      path: '/api/ekyc/face-liveness',
      price: 1000
    },
    VERIFY: {
      path: '/api/ekyc/face-verify',
      price: 1000
    }
  }
} as const;

export const EKYC_SERVICE_PERMISSIONS = Object.values(EKYC_SERVICES)
  .flatMap(service => Object.values(service))
  .map(service => service.path);