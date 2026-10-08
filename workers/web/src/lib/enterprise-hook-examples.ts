export type EnterpriseHookLang = "curl" | "javascript" | "python" | "java" | "go" | "rust";

export type EnterpriseHookExampleParams = {
  url: string;
  clientId: string;
  body: string;
  apiTokenPlaceholder?: string;
};

/** JSON text safe to embed. Invalid input becomes a JSON string so the snippet still parses. */
export function payloadLiteral(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "{}";
  try {
    return JSON.stringify(JSON.parse(trimmed) as unknown);
  } catch {
    return JSON.stringify(trimmed);
  }
}

function shellSingleQuoted(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function rustRaw(value: string): string {
  let hashes = 1;
  while (value.includes(`"${"#".repeat(hashes)}`)) hashes += 1;
  const marks = "#".repeat(hashes);
  return `r${marks}"${value}"${marks}`;
}

function pythonPayload(json: string): string {
  if (!json.includes('"""')) return `json.loads("""${json}""")`;
  return `json.loads(${JSON.stringify(json)})`;
}

function javaJson(json: string): string {
  if (json.includes('"""')) return JSON.stringify(json);
  return `"""
        ${json}"""`;
}

function goBody(json: string): string {
  if (!json.includes("`")) return `[]byte(\`${json}\`)`;
  return `[]byte(${JSON.stringify(json)})`;
}

/**
 * Same call shape as a community webhook: the URL identifies the workflow,
 * and the API token stays in the Authorization header with X-Client-ID.
 */
export function buildEnterpriseHookExamples(params: EnterpriseHookExampleParams): Record<EnterpriseHookLang, string> {
  const token = params.apiTokenPlaceholder ?? "utk_YOUR_API_TOKEN";
  const clientId = params.clientId.trim() || "YOUR_CLIENT_ID";
  const url = params.url;
  const json = payloadLiteral(params.body);

  return {
    curl: `curl -X POST ${shellSingleQuoted(url)} \\
  -H "Authorization: Bearer ${token}" \\
  -H "X-Client-ID: ${clientId}" \\
  -H "Content-Type: application/json" \\
  -d ${shellSingleQuoted(json)}`,
    javascript: `const response = await fetch(${JSON.stringify(url)}, {
  method: "POST",
  headers: {
    Authorization: "Bearer ${token}",
    "X-Client-ID": "${clientId}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${json}),
});
const result = await response.json();
console.log(result);`,
    python: `import json
import requests

response = requests.post(
    ${JSON.stringify(url)},
    headers={
        "Authorization": "Bearer ${token}",
        "X-Client-ID": "${clientId}",
        "Content-Type": "application/json",
    },
    json=${pythonPayload(json)},
)
print(response.json())`,
    java: `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

String json = ${javaJson(json)};
HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create(${JSON.stringify(url)}))
    .header("Authorization", "Bearer ${token}")
    .header("X-Client-ID", "${clientId}")
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(json))
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
    go: `package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
)

func main() {
	body := ${goBody(json)}
	req, err := http.NewRequest(http.MethodPost, ${JSON.stringify(url)}, bytes.NewReader(body))
	if err != nil {
		panic(err)
	}
	req.Header.Set("Authorization", "Bearer ${token}")
	req.Header.Set("X-Client-ID", "${clientId}")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	fmt.Println(string(data))
}`,
    rust: `use reqwest::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let response = client
        .post(${JSON.stringify(url)})
        .header("Authorization", "Bearer ${token}")
        .header("X-Client-ID", "${clientId}")
        .header("Content-Type", "application/json")
        .body(${rustRaw(json)})
        .send()
        .await?;
    println!("{}", response.text().await?);
    Ok(())
}`,
  };
}
