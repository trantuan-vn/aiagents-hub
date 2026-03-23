const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export const API_BASE_URL = API_BASE;

export const CODE_EXAMPLES: Record<string, (apiKey: string) => string> = {
  curl: (apiKey: string) => `curl -X POST "${API_BASE}/api/ekyc/recognize-document" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "image=@/path/to/document.jpg" \\
  -F "type=cccd_front"`,
  javascript: (apiKey: string) => `const formData = new FormData();
formData.append("image", imageFile);
formData.append("type", "cccd_front");

const response = await fetch("${API_BASE}/api/ekyc/recognize-document", {
  method: "POST",
  headers: { "Authorization": \`Bearer ${apiKey}\` },
  body: formData,
});
const result = await response.json();`,
  python: (apiKey: string) => `import requests

url = "${API_BASE}/api/ekyc/recognize-document"
headers = {"Authorization": "Bearer ${apiKey}"}
files = {"image": open("document.jpg", "rb")}
data = {"type": "cccd_front"}

response = requests.post(url, headers=headers, files=files, data=data)
result = response.json()`,
  go: (apiKey: string) => `package main

import (
    "bytes"
    "mime/multipart"
    "net/http"
)

func main() {
    body := &bytes.Buffer{}
    writer := multipart.NewWriter(body)
    writer.WriteField("type", "cccd_front")
    part, _ := writer.CreateFormFile("image", "document.jpg")
    part.Write(imageBytes)
    writer.Close()

    req, _ := http.NewRequest("POST", "${API_BASE}/api/ekyc/recognize-document", body)
    req.Header.Set("Authorization", "Bearer ${apiKey}")
    req.Header.Set("Content-Type", writer.FormDataContentType())

    client := &http.Client{}
    resp, _ := client.Do(req)
}`,
  php: (apiKey: string) => `<?php
$ch = curl_init("${API_BASE}/api/ekyc/recognize-document");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer ${apiKey}"
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, [
    "image" => new CURLFile("/path/to/document.jpg", "image/jpeg"),
    "type" => "cccd_front"
]);
$response = curl_exec($ch);
$result = json_decode($response, true);`,
  java: (apiKey: string) => `HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("${API_BASE}/api/ekyc/recognize-document"))
    .header("Authorization", "Bearer ${apiKey}")
    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());`,
  csharp: (apiKey: string) => `using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", "${apiKey}");

using var content = new MultipartFormDataContent();
content.Add(new StreamContent(File.OpenRead("document.jpg")), "image", "document.jpg");
content.Add(new StringContent("cccd_front"), "type");

var response = await client.PostAsync(
    "${API_BASE}/api/ekyc/recognize-document", content);
var result = await response.Content.ReadFromJsonAsync<DocumentResult>();`,
};

export const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/ekyc/recognize-document",
    titleKey: "endpoint_recognize_title",
    descKey: "endpoint_recognize_desc",
    params: ["image (File)", "type (cccd_front | cccd_back | passport)"],
  },
  {
    method: "POST",
    path: "/api/ekyc/face-search",
    titleKey: "endpoint_face_search_title",
    descKey: "endpoint_face_search_desc",
    params: ["image (File)"],
  },
  {
    method: "POST",
    path: "/api/ekyc/face-verify",
    titleKey: "endpoint_face_verify_title",
    descKey: "endpoint_face_verify_desc",
    params: ["image (File)", "image2 (File)"],
  },
  {
    method: "POST",
    path: "/api/ekyc/face-liveness",
    titleKey: "endpoint_liveness_title",
    descKey: "endpoint_liveness_desc",
    params: ["image (File)", "video (optional)"],
  },
] as const;
