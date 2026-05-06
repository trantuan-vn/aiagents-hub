const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export const API_BASE_URL = API_BASE;

type CodeExampleFn = (apiKey: string) => string;

/** Generate code examples for each endpoint by language */
function createRecognizeDocumentExamples(): Record<string, CodeExampleFn> {
  return {
    curl: (apiKey: string) =>
      `curl -X POST "${API_BASE}/api/ekyc/recognize-document" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "image=@/path/to/document.jpg" \\
  -F "type=cccd_front"`,
    javascript: (apiKey: string) =>
      `const formData = new FormData();
formData.append("image", imageFile);
formData.append("type", "cccd_front");

const response = await fetch("${API_BASE}/api/ekyc/recognize-document", {
  method: "POST",
  headers: { "Authorization": \`Bearer ${apiKey}\` },
  body: formData,
});
const result = await response.json();`,
    python: (apiKey: string) =>
      `import requests

url = "${API_BASE}/api/ekyc/recognize-document"
headers = {"Authorization": "Bearer ${apiKey}"}
files = {"image": open("document.jpg", "rb")}
data = {"type": "cccd_front"}

response = requests.post(url, headers=headers, files=files, data=data)
result = response.json()`,
    go: (apiKey: string) =>
      `body := &bytes.Buffer{}
writer := multipart.NewWriter(body)
writer.WriteField("type", "cccd_front")
part, _ := writer.CreateFormFile("image", "document.jpg")
part.Write(imageBytes)
writer.Close()

req, _ := http.NewRequest("POST", "${API_BASE}/api/ekyc/recognize-document", body)
req.Header.Set("Authorization", "Bearer ${apiKey}")
req.Header.Set("Content-Type", writer.FormDataContentType())

client := &http.Client{}
resp, _ := client.Do(req)`,
    php: (apiKey: string) =>
      `$ch = curl_init("${API_BASE}/api/ekyc/recognize-document");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer ${apiKey}"]);
curl_setopt($ch, CURLOPT_POSTFIELDS, [
    "image" => new CURLFile("/path/to/document.jpg", "image/jpeg"),
    "type" => "cccd_front"
]);
$response = curl_exec($ch);
$result = json_decode($response, true);`,
    java: (apiKey: string) =>
      `HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("${API_BASE}/api/ekyc/recognize-document"))
    .header("Authorization", "Bearer ${apiKey}")
    .POST(HttpRequest.BodyPublishers.ofByteArray(multipartBody))
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());`,
    csharp: (apiKey: string) =>
      `client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "${apiKey}");
using var content = new MultipartFormDataContent();
content.Add(new StreamContent(File.OpenRead("document.jpg")), "image", "document.jpg");
content.Add(new StringContent("cccd_front"), "type");
var response = await client.PostAsync("${API_BASE}/api/ekyc/recognize-document", content);
var result = await response.Content.ReadFromJsonAsync<DocumentResult>();`,
  };
}

function createFaceSearchExamples(): Record<string, CodeExampleFn> {
  return {
    curl: (apiKey: string) =>
      `curl -X POST "${API_BASE}/api/ekyc/face-search" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "image=@/path/to/photo.jpg"`,
    javascript: (apiKey: string) =>
      `const formData = new FormData();
formData.append("image", imageFile);

const response = await fetch("${API_BASE}/api/ekyc/face-search", {
  method: "POST",
  headers: { "Authorization": \`Bearer ${apiKey}\` },
  body: formData,
});
const result = await response.json();`,
    python: (apiKey: string) =>
      `import requests

url = "${API_BASE}/api/ekyc/face-search"
headers = {"Authorization": "Bearer ${apiKey}"}
files = {"image": open("photo.jpg", "rb")}

response = requests.post(url, headers=headers, files=files)
result = response.json()`,
    go: (apiKey: string) =>
      `body := &bytes.Buffer{}
writer := multipart.NewWriter(body)
part, _ := writer.CreateFormFile("image", "photo.jpg")
part.Write(imageBytes)
writer.Close()

req, _ := http.NewRequest("POST", "${API_BASE}/api/ekyc/face-search", body)
req.Header.Set("Authorization", "Bearer ${apiKey}")
req.Header.Set("Content-Type", writer.FormDataContentType())

client := &http.Client{}
resp, _ := client.Do(req)`,
    php: (apiKey: string) =>
      `$ch = curl_init("${API_BASE}/api/ekyc/face-search");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer ${apiKey}"]);
curl_setopt($ch, CURLOPT_POSTFIELDS, [
    "image" => new CURLFile("/path/to/photo.jpg", "image/jpeg")
]);
$response = curl_exec($ch);
$result = json_decode($response, true);`,
    java: (apiKey: string) =>
      `HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("${API_BASE}/api/ekyc/face-search"))
    .header("Authorization", "Bearer ${apiKey}")
    .POST(HttpRequest.BodyPublishers.ofByteArray(multipartBody))
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());`,
    csharp: (apiKey: string) =>
      `client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "${apiKey}");
using var content = new MultipartFormDataContent();
content.Add(new StreamContent(File.OpenRead("photo.jpg")), "image", "photo.jpg");
var response = await client.PostAsync("${API_BASE}/api/ekyc/face-search", content);
var result = await response.Content.ReadFromJsonAsync<FaceSearchResult>();`,
  };
}

function createFaceVerifyExamples(): Record<string, CodeExampleFn> {
  return {
    curl: (apiKey: string) =>
      `curl -X POST "${API_BASE}/api/ekyc/face-verify" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "image=@/path/to/document_photo.jpg" \\
  -F "image2=@/path/to/selfie.jpg"`,
    javascript: (apiKey: string) =>
      `const formData = new FormData();
formData.append("image", documentPhotoFile);  // document photo
formData.append("image2", selfieFile);        // selfie

const response = await fetch("${API_BASE}/api/ekyc/face-verify", {
  method: "POST",
  headers: { "Authorization": \`Bearer ${apiKey}\` },
  body: formData,
});
const result = await response.json();`,
    python: (apiKey: string) =>
      `import requests

url = "${API_BASE}/api/ekyc/face-verify"
headers = {"Authorization": "Bearer ${apiKey}"}
files = {
    "image": open("document_photo.jpg", "rb"),
    "image2": open("selfie.jpg", "rb")
}

response = requests.post(url, headers=headers, files=files)
result = response.json()`,
    go: (apiKey: string) =>
      `body := &bytes.Buffer{}
writer := multipart.NewWriter(body)
part1, _ := writer.CreateFormFile("image", "document_photo.jpg")
part1.Write(docPhotoBytes)
part2, _ := writer.CreateFormFile("image2", "selfie.jpg")
part2.Write(selfieBytes)
writer.Close()

req, _ := http.NewRequest("POST", "${API_BASE}/api/ekyc/face-verify", body)
req.Header.Set("Authorization", "Bearer ${apiKey}")
req.Header.Set("Content-Type", writer.FormDataContentType())

client := &http.Client{}
resp, _ := client.Do(req)`,
    php: (apiKey: string) =>
      `$ch = curl_init("${API_BASE}/api/ekyc/face-verify");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer ${apiKey}"]);
curl_setopt($ch, CURLOPT_POSTFIELDS, [
    "image" => new CURLFile("/path/to/document_photo.jpg", "image/jpeg"),
    "image2" => new CURLFile("/path/to/selfie.jpg", "image/jpeg")
]);
$response = curl_exec($ch);
$result = json_decode($response, true);`,
    java: (apiKey: string) =>
      `HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("${API_BASE}/api/ekyc/face-verify"))
    .header("Authorization", "Bearer ${apiKey}")
    .POST(HttpRequest.BodyPublishers.ofByteArray(multipartBody))
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());`,
    csharp: (apiKey: string) =>
      `client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "${apiKey}");
using var content = new MultipartFormDataContent();
content.Add(new StreamContent(File.OpenRead("document_photo.jpg")), "image", "document_photo.jpg");
content.Add(new StreamContent(File.OpenRead("selfie.jpg")), "image2", "selfie.jpg");
var response = await client.PostAsync("${API_BASE}/api/ekyc/face-verify", content);
var result = await response.Content.ReadFromJsonAsync<FaceVerifyResult>();`,
  };
}

function createFaceLivenessExamples(): Record<string, CodeExampleFn> {
  return {
    curl: (apiKey: string) =>
      `# Image only
curl -X POST "${API_BASE}/api/ekyc/face-liveness" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "image=@/path/to/photo.jpg"

# Or with video (send first frame as image)
curl -X POST "${API_BASE}/api/ekyc/face-liveness" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "image=@/path/to/first_frame.jpg" \\
  -F "video=@/path/to/liveness_video.webm"`,
    javascript: (apiKey: string) =>
      `// Image only
const formData = new FormData();
formData.append("image", photoFile);

// Or with video: formData.append("video", videoFile);

const response = await fetch("${API_BASE}/api/ekyc/face-liveness", {
  method: "POST",
  headers: { "Authorization": \`Bearer ${apiKey}\` },
  body: formData,
});
const result = await response.json();`,
    python: (apiKey: string) =>
      `import requests

url = "${API_BASE}/api/ekyc/face-liveness"
headers = {"Authorization": "Bearer ${apiKey}"}

# Image only
files = {"image": open("photo.jpg", "rb")}

# Or with video: files = {"image": open("frame.jpg", "rb"), "video": open("liveness.webm", "rb")}

response = requests.post(url, headers=headers, files=files)
result = response.json()`,
    go: (apiKey: string) =>
      `body := &bytes.Buffer{}
writer := multipart.NewWriter(body)
part, _ := writer.CreateFormFile("image", "photo.jpg")
part.Write(imageBytes)
// writer.CreateFormFile("video", "video.webm")  // optional
writer.Close()

req, _ := http.NewRequest("POST", "${API_BASE}/api/ekyc/face-liveness", body)
req.Header.Set("Authorization", "Bearer ${apiKey}")
req.Header.Set("Content-Type", writer.FormDataContentType())

client := &http.Client{}
resp, _ := client.Do(req)`,
    php: (apiKey: string) =>
      `$ch = curl_init("${API_BASE}/api/ekyc/face-liveness");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer ${apiKey}"]);
curl_setopt($ch, CURLOPT_POSTFIELDS, [
    "image" => new CURLFile("/path/to/photo.jpg", "image/jpeg")
    // "video" => new CURLFile("/path/to/video.webm", "video/webm")  // optional
]);
$response = curl_exec($ch);
$result = json_decode($response, true);`,
    java: (apiKey: string) =>
      `HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("${API_BASE}/api/ekyc/face-liveness"))
    .header("Authorization", "Bearer ${apiKey}")
    .POST(HttpRequest.BodyPublishers.ofByteArray(multipartBody))
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());`,
    csharp: (apiKey: string) =>
      `client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "${apiKey}");
using var content = new MultipartFormDataContent();
content.Add(new StreamContent(File.OpenRead("photo.jpg")), "image", "photo.jpg");
var response = await client.PostAsync("${API_BASE}/api/ekyc/face-liveness", content);
var result = await response.Content.ReadFromJsonAsync<LivenessResult>();`,
  };
}

/** Map endpoint id -> code examples by language */
export const ENDPOINT_CODE_EXAMPLES: Record<string, Record<string, CodeExampleFn>> = {
  "recognize-document": createRecognizeDocumentExamples(),
  "face-search": createFaceSearchExamples(),
  "face-verify": createFaceVerifyExamples(),
  "face-liveness": createFaceLivenessExamples(),
};

/** @deprecated Use ENDPOINT_CODE_EXAMPLES["recognize-document"] for backward compatibility */
export const CODE_EXAMPLES: Record<string, CodeExampleFn> = createRecognizeDocumentExamples();

export const ENDPOINTS = [
  {
    id: "recognize-document",
    method: "POST",
    path: "/api/ekyc/recognize-document",
    titleKey: "endpoint_recognize_title",
    descKey: "endpoint_recognize_desc",
    params: ["image (File)", "type (cccd_front | cccd_back | passport)"],
  },
  {
    id: "face-search",
    method: "POST",
    path: "/api/ekyc/face-search",
    titleKey: "endpoint_face_search_title",
    descKey: "endpoint_face_search_desc",
    params: ["image (File)"],
  },
  {
    id: "face-verify",
    method: "POST",
    path: "/api/ekyc/face-verify",
    titleKey: "endpoint_face_verify_title",
    descKey: "endpoint_face_verify_desc",
    params: ["image (File)", "image2 (File)"],
  },
  {
    id: "face-liveness",
    method: "POST",
    path: "/api/ekyc/face-liveness",
    titleKey: "endpoint_liveness_title",
    descKey: "endpoint_liveness_desc",
    params: ["image (File)", "video (optional)"],
  },
] as const;

export { RESPONSE_EXAMPLES, getResponseExample } from "./response-examples";
