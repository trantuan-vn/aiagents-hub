const SAMPLE_BODY = { message: "Hello" };
const SAMPLE_BODY_JSON = JSON.stringify(SAMPLE_BODY);

export type WebhookIntegrateLang = "curl" | "javascript" | "python" | "java";

export type WebhookIntegrateExampleParams = {
  url: string;
  clientId: string;
  apiTokenPlaceholder?: string;
};

export function buildWebhookIntegrateExamples(
  params: WebhookIntegrateExampleParams,
): Record<WebhookIntegrateLang, string> {
  const token = params.apiTokenPlaceholder ?? "utk_YOUR_API_TOKEN";
  const clientId = params.clientId.trim() || "YOUR_CLIENT_ID";
  const url = params.url;

  return {
    curl: `curl -X POST "${url}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "X-Client-ID: ${clientId}" \\
  -H "Content-Type: application/json" \\
  -d '${SAMPLE_BODY_JSON}'`,
    javascript: `const response = await fetch("${url}", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${token}",
    "X-Client-ID": "${clientId}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${SAMPLE_BODY_JSON}),
});
const result = await response.json();
console.log(result);`,
    python: `import requests

url = "${url}"
headers = {
    "Authorization": "Bearer ${token}",
    "X-Client-ID": "${clientId}",
    "Content-Type": "application/json",
}
payload = ${SAMPLE_BODY_JSON}

response = requests.post(url, headers=headers, json=payload)
print(response.json())`,
    java: `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

String json = """
        ${SAMPLE_BODY_JSON}
        """;
HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("${url}"))
    .header("Authorization", "Bearer ${token}")
    .header("X-Client-ID", "${clientId}")
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(json))
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
  };
}
