/** Response format example per endpoint */
export const RESPONSE_EXAMPLES: Record<string, string> = {
  "recognize-document": `{
  "documentType": "cccd_front",
  "extractedData": {
    "no": "001234567890",
    "full_name": "Nguyen Van A",
    "date_of_birth": "01/01/1990",
    "place_of_origin": "...",
    "place_of_residence": "..."
  },
  "confidence": 0.92,
  "processingTime": 1234
}`,
  "face-search": `{
  "faces": [
    {
      "box": { "x": 100, "y": 80, "width": 120, "height": 150 },
      "confidence": 0.95,
      "landmarks": { "left_eye": { "x": 120, "y": 110 }, "right_eye": { "x": 180, "y": 110 } }
    }
  ],
  "confidence": 0.95,
  "faceCount": 1
}`,
  "face-verify": `{
  "similarity": 0.89,
  "isMatch": true,
  "confidence": 0.92
}`,
  "face-liveness": `{
  "isLive": true,
  "confidence": 0.88,
  "riskScore": 0.1
}`,
};

/** Safe lookup by endpoint id (explicit switch avoids dynamic property access warnings). */
export function getResponseExample(endpointId: string): string | undefined {
  switch (endpointId) {
    case "recognize-document":
      return RESPONSE_EXAMPLES["recognize-document"];
    case "face-search":
      return RESPONSE_EXAMPLES["face-search"];
    case "face-verify":
      return RESPONSE_EXAMPLES["face-verify"];
    case "face-liveness":
      return RESPONSE_EXAMPLES["face-liveness"];
    default:
      return undefined;
  }
}
