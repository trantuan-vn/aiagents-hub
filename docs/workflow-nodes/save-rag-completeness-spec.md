# Save RAG — Spec đủ dữ liệu

> **Trạng thái:** Draft — hợp đồng implement, chưa code  
> **Phiên bản:** 0.6  
> **Ngày:** 2026-09-28  
> **Thay cho:** mục «một lần LLM chat» và «chunk 800 ký tự» trong [`saveRag.md`](./saveRag.md)  
> **Đọc kèm:** [`schema.md`](./schema.md) · [`sqlexample.md`](./sqlexample.md) · [`getRag.md`](./getRag.md) · [`vectorize.md`](./vectorize.md)

Save RAG phải ghi vào Vectorize **đủ** schema Oracle và **đủ** mô tả tiếng Việt / tiếng Anh của từng cột. Model không được viết document. Document do code dựng. Model chỉ trả các mảnh mô tả, theo lô nhỏ hơn trần output.

---

## 1. Mục tiêu

1. Mọi cột Oracle có `descriptionVi` và `descriptionEn` khác rỗng nằm trong `metadata.text` của document `docType=schema`.
2. DDL, tên cột, kiểu, nullable, default, comment, khóa chính, khóa ngoại không bị cắt vì response LLM dài.
3. Bảng có nhiều cột hơn một lần gọi `max_tokens` vẫn ghi đủ, bằng nhiều lô.
4. JSON cụt, lệch hoa thường, hoặc `finish_reason=length` không được upsert như thể đã thành công.
5. Chunk embed bằng `@cf/baai/bge-m3` (1024 chiều, đa ngữ) không làm mất byte đã lưu, và không embed một chuỗi dài hơn cửa sổ 8192 token.
6. Get RAG đọc lại đủ mọi chunk của document đã ghi.

---

## 2. Hiện trạng (không giữ)

| Chỗ | Hành vi hiện tại | Hệ quả |
|-----|------------------|--------|
| `save-rag/describe-table.ts` | Một request cho cả bảng. `maxTokens = serviceOptions.maxTokens \|\| 2048` | Bảng rộng bị cắt ở trần output. GLM reasoning còn ăn vào cùng ngân sách |
| `parseJsonObject` + `parseEnrichment` | JSON không đóng `}` thì trả rỗng. Không đọc `finish_reason` | Mất hết mô tả, kể cả cột đã viết xong ở đầu response |
| Khớp `column.name` | Phân biệt hoa thường | `order_id` bị bỏ khi Oracle là `ORDER_ID` |
| `save-rag/documents.ts` | Ghép mô tả vào markdown **khi enrichment có cột** | Đúng hướng, nhưng nhận enrichment rỗng thì vẫn dựng schema chỉ có Oracle |
| `save-rag/execute.ts` | Vẫn upsert và `markIndexedTables` | Bảng bị đánh dấu đã index dù không có mô tả |
| `save-rag/chunk.ts` | Cắt mỗi 800 ký tự, overlap 120 | Có thể xẻ một dòng cột. Không biết token |
| `rag-vector.ts` `runEmbed` | Gửi nguyên chuỗi, không `truncate`, pooling mặc định `mean` | Input trên 512 token: model cắt phần đuôi khỏi vector. Text metadata vẫn đủ |
| Metadata | Ghi cả `text` và `content` cùng một chuỗi | Nhân đôi dung lượng, dễ chạm trần 10 KiB |
| `vectorId` | Cắt id còn 64 byte | Hai document dài có thể trùng id và ghi đè |
| Embed vector rỗng | `continue`, không fail | Chunk biến mất khỏi index, `totalChunks` vẫn đếm đủ |
| `get-rag/assemble.ts` | `MAX_CHUNKS_PER_DOCUMENT = 24` | Chunk thứ 25 trở đi không được đọc |

Embed dùng `@cf/baai/bge-m3`, 1024 chiều, cửa sổ 8192 token. `truncate_inputs` giữ mặc định `false`: chuỗi quá dài làm request lỗi, không cắt im lặng. Service còn lưu `@cf/baai/bge-base-en-v1.5` được đổi thành `bge-m3` lúc gọi. Vector 768 chiều đã ghi không tương thích; index `ask-ai-semantic` phải được tạo lại ở 1024 chiều rồi chạy lại Save RAG.

---

## 3. Nguyên tắc

1. **Oracle là nguồn sự thật của cấu trúc.** DDL và danh sách cột copy nguyên vào markdown. LLM không sinh lại các phần này.
2. **LLM chỉ điền map mô tả.** Mỗi lô trả JSON các cột được hỏi. Code ghép map vào markdown. Text embed là markdown đã ghép.
3. **Một lô hỏng chỉ làm lại lô đó.** Không hủy mô tả của các lô đã ghép.
4. **Thiếu một cột thì không ghi bảng đó.** Không upsert, không đánh dấu indexed.
5. **Giới hạn sample và số câu history là cố ý.** Chúng không được dùng làm lý do cắt cột hoặc cắt DDL.

### Ngoài phạm vi

- Nhét full sample row hoặc full lịch sử SQL vào prompt.
- Sửa Reasoning Agent, Check SQL, hoặc panel service ngoài việc Save RAG đọc `maxTokens` sẵn có trên handle `llm`.
- Xóa vector cũ bằng cách liệt kê cả index. Xem mục 10.

### 3.1 Cấu hình mặc định

Đây là bộ giá trị runtime phải dùng. Chúng thay default đang gây mất dữ liệu: `maxTokens` **1024** trên panel service, fallback **2048** trong `describeTable`, và cắt chunk **800** ký tự / overlap **120**.

Service LLM nối vào handle `llm` của Save RAG phải để các giá trị cột «Cấu hình». Ô Max tokens để trống hoặc ≤ 1024 (default của panel) thì code **thay bằng 8192**. Số lớn hơn 1024 được giữ nguyên, rồi lô cột vẫn chia nhỏ nếu response bị cắt.

| Nhóm | Tham số | Cấu hình | Khi trống |
|------|---------|----------|-----------|
| LLM | Model | `@cf/zai-org/glm-4.7-flash` | Bắt buộc có chat model trên handle `llm` |
| LLM | `maxTokens`, gửi thành `max_tokens` và `max_completion_tokens` | **8192** | ≤ 1024 hoặc trống → 8192 |
| LLM | `temperature` | **0.2** | 0.2 |
| LLM | `responseFormat` | `json_object` | Luôn gửi `{ "type": "json_object" }` |
| LLM | Thinking (`glm`) | tắt: `chat_template_kwargs.enable_thinking: false` | Gửi khóa này; lỗi khóa lạ thì gọi lại không có khóa |
| Lô cột | `COLUMN_BATCH_START` | **12** | Hằng số, không có ô panel |
| Lô cột | `COLUMN_BATCH_MIN` | **1** | Hằng số |
| Lô cột | Thử lại khi lô còn 1 cột | **1** | Hằng số |
| Tóm tắt / typical query | Số lần thử lại | **1** | Hằng số |
| Sample trong prompt | Số dòng / cắt ô chuỗi | **3** dòng, **120** ký tự | Chỉ prompt. Không cắt danh sách cột hay DDL |
| Sample trong document | Số dòng / cắt ô chuỗi | **3** dòng, **200** ký tự | Ví dụ, không phải schema |
| SQL history | `sqlHistoryLimit` | **10** | Trần cứng **50**. Câu lưu trong `sqlexample.md` là nguyên văn |
| SQL history trong prompt typical query | Số câu / cắt mỗi câu | **10** câu, **2000** ký tự | Chỉ prompt |
| Embed | Model | `@cf/baai/bge-m3` | Service còn ghi `bge-base-en-v1.5` bị đổi thành model này |
| Embed | `dimensions` / `metric` | **1024** / `cosine` | Index phải tạo ở 1024 chiều |
| Embed | `truncate_inputs` | **false** | Không gửi `true`. Quá 8192 token thì lỗi, không cắt im |
| Chunk | Ngân sách token | **7680** | Dưới cửa sổ 8192 của bge-m3. Cắt theo dòng cột / dòng DDL |
| Chunk | Ngân sách metadata | **8 KiB** | Dưới trần Vectorize 10 KiB. Một key `text` |
| Chunk | Overlap | **0** | `chunkSize` 800 và `chunkOverlap` 120 trên panel **không** được dùng để cắt hoặc bỏ byte |
| Embed | Cỡ lô `AI.run` | **8** chuỗi | Lô lỗi thì gọi từng chuỗi. Vector rỗng thì fail cả document |
| Get RAG | Node | mục **9.0** | `topK` 12 bảng, `scoreThreshold` 0, `groupByField` `tableName`. Chunk của bảng đã chọn đọc đủ |

8192 token output và lô 12 cột đi cùng nhau. Một cột mô tả ngắn khoảng 80–150 token; 12 cột nằm trong 8192 kể cả khi tắt thinking không ăn hết ngân sách. Bảng hàng trăm cột không được nhét vào một request. `chunkSize` lớn hơn 7680 token ước lượng làm bge-m3 từ chối hoặc nuốt đuôi chunk — runtime không được nhận giá trị panel đó.

---

## 4. Luồng một bảng

Giữ ingress hiện tại: Loop → `{ tableName, schemaName }` + connection Oracle trên INPUT. Bảng đã có trong `INDEXED_TABLES_KEY` của run thì bỏ qua.

```text
introspect đủ cột
  → lô mô tả cột (lặp đến khi hết cột)
  → một lần tóm tắt bảng
  → một lần typical query
  → dựng schema.md và sqlexample.md bằng code
  → cắt chunk theo dòng / section, trong ngân sách token và metadata
  → embed hết chunk
  → upsert hết, hoặc không upsert gì của bảng đó
  → markIndexedTables chỉ sau upsert thành công
```

Nhiều bảng trong một lượt pipeline vẫn xử lý lần lượt từng bảng. Các lô cột của cùng một bảng cũng lần lượt, để ghép đúng và không bắn song song vào model.

Introspect giữ `introspectTablesInfo`: mọi cột, kiểu, nullable, default, comment, PK, FK, DDL đầy đủ, tối đa 3 sample row, SQL history theo `sqlHistoryLimit` (mặc định 10, trần 50).

---

## 5. Hợp đồng LLM

Handle `llm` vẫn là chat model (`assertTextGenerationModel`). `@cf/zai-org/glm-4.7-flash` là model mục tiêu. Model khác trên cùng handle đi cùng hợp đồng.

### 5.1 Tham số mỗi request

| Tham số | Giá trị |
|---------|---------|
| `max_tokens` và `max_completion_tokens` | Đúng mục 3.1, không có ngoại lệ 2048: trống hoặc ≤ 1024 thì **8192**; lớn hơn 1024 thì giữ số đó. Gửi cả hai khóa vì `max_tokens` trên Workers AI đã deprecated |
| `temperature` | Theo mục 3.1: service nếu có, không thì **0.2** |
| `response_format` | `{ "type": "json_object" }`. Request lỗi vì khóa này thì gọi lại **không** có `response_format`, rồi vẫn parse JSON |
| Thinking | Với model id chứa `glm`, gửi `chat_template_kwargs: { enable_thinking: false }`. Request lỗi vì khóa lạ thì gọi lại **không** có khóa đó. Lô nhỏ vẫn là cơ chế đảm bảo |

Không gọi `resolveMaxTokens` của Agent. Save RAG chỉ đọc service trên handle `llm`.

Mỗi lần `runTextModel` bill như `describeTable` hiện tại (`billAgentUsage`).

### 5.2 Lô cột

Hằng số:

| Hằng | Giá trị |
|------|---------|
| `COLUMN_BATCH_START` | 12 |
| `COLUMN_BATCH_MIN` | 1 |
| Số lần thử lại khi lô đã là 1 cột | 1 |

Prompt của một lô chỉ gồm: `schemaName`, `tableName`, khóa chính, khóa ngoại, và **các cột trong lô** (`name`, `type`, `nullable`, `default`, `comment`). Kèm tối đa 3 sample row; trong prompt, chuỗi dài hơn 120 ký tự cắt bằng `…`. Không nhét DDL. Không nhét history.

System prompt yêu cầu một JSON:

```ts
{
  columns: Array<{
    name: string;            // đúng tên được đưa, giữ nguyên chữ
    descriptionVi: string;   // khác rỗng
    descriptionEn: string;   // khác rỗng
    aliasesVi: string[];     // có thể rỗng
  }>;
}
```

Quy tắc prompt, luôn có trong system prompt: không bịa cột; `descriptionVi` và `descriptionEn` mỗi trường tối đa **2000** ký tự; `aliasesVi` là cách người dùng tiếng Việt gọi cột đó.

**Ghép tên cột**

1. Trim. So khớp đúng chuỗi trước. Trùng tên trong cùng một response: giữ bản khớp đúng chữ; không có bản đúng chữ thì giữ bản đầu.
2. Không thấy thì so `toUpperCase()`.
3. Một tên LLM khớp nhiều cột Oracle ở bước 2: bỏ tên đó và ghi warning.
4. Tên không khớp cột nào: bỏ, ghi warning `[save-rag] LLM column "…" not in Oracle schema; skipped`.

**Cột hoàn thành** khi có một entry đã ghép, cả `descriptionVi` lẫn `descriptionEn` trim khác rỗng, và mỗi trường dài tối đa 2000 ký tự. `aliasesVi` rỗng vẫn hợp lệ. Dài hơn 2000 ký tự thì cột chưa xong.

**Thuật toán lô.** `pending` bắt đầu là mọi cột Oracle. `batchSize` bắt đầu là 12.

1. Lấy `take` = `min(batchSize, pending.length)` cột đầu của `pending`. Gọi model.
2. Nhặt các object cột đã đóng ngoặc và parse được. Object cụt ở đuôi bỏ. Cột nhặt được mà hoàn thành thì xóa khỏi `pending`.
3. `incomplete` = những cột trong `take` còn nằm trong `pending`.
4. `incomplete` rỗng: lô này xong, kể cả khi `finish_reason` là `length`. Đặt lại `batchSize = 12`. Sang bước 1.
5. `incomplete` không rỗng: `finish_reason = length`, JSON không parse được, hoặc thiếu mô tả đều đi cùng một nhánh. `take.length > 1` thì `batchSize = max(1, floor(incomplete.length / 2))`. Những cột chưa gửi không bị gọi lại. `take.length == 1` thì đây là một lần thất bại của cột đó.
6. Cùng một cột đã thất bại hai lần ở kích thước 1: ném lỗi, nêu tên cột, dừng bảng. Không upsert.

`finish_reason = length` không tự làm hỏng lô khi mọi cột trong `take` đã hoàn thành.

Ví dụ: 40 cột, lô 12 bị cắt sau khi cột thứ 8 đã là object đầy đủ. Giữ 8 cột. `incomplete` = 4. Lần gọi sau có `batchSize = 2`, chỉ gồm 2 cột trong 4 cột chưa xong. 28 cột chưa gửi nằm yên trong `pending`.

### 5.3 Tóm tắt bảng

Một request sau khi mọi cột đã hoàn thành. Input: tên bảng, danh sách tên cột, PK, FK. Không gửi lại toàn bộ mô tả.

```ts
{ tableSummaryVi: string; tableSummaryEn: string }
```

Cả hai chuỗi trim phải khác rỗng. Thiếu hoặc JSON hỏng: thử lại một lần. Vẫn hỏng: ném lỗi, dừng bảng.

### 5.4 Typical query

Một request riêng. Input: tên bảng qualified, tên cột, PK, FK, và tối đa 10 câu history. Mỗi câu trong **prompt** dài hơn 2000 ký tự thì cắt bằng `…`. Bản ghi trong `sqlexample.md` vẫn là SQL nguyên văn.

```ts
{
  typicalQueries: Array<{
    titleVi: string;
    titleEn: string;
    sql: string;
    noteVi: string;
  }>;
}
```

Giữ `isReadOnlySql`: một câu, bắt đầu bằng `SELECT` hoặc `WITH`, không có DML/DDL. Kỳ vọng 2–5 câu. Mảng rỗng sau lọc, JSON hỏng, hoặc `finish_reason=length`: thử lại một lần.

Lần thử lại vẫn không có câu hợp lệ: **vẫn ghi schema**. `sqlexample.md` chỉ gồm history nếu history khác rỗng. History cũng rỗng thì bỏ document sqlexample, giống hôm nay. Ghi warning. Typical query không được chặn việc lưu mô tả cột.

---

## 6. Document

`ragDocumentsFromEnrichment` chỉ được gọi khi mọi cột đã hoàn thành và đã có summary.

### 6.1 `schema.md`

Giữ khung [`schema.md`](./schema.md). Phần mô tả lấy từ map LLM, không fallback sang comment Oracle để lấp ô trống — vì ô trống không được phép lúc ghi.

Mỗi dòng cột, sau khi escape ô:

```text
| {name} | {type} | YES\|NO | {default} | {descriptionVi} | {descriptionEn} | {aliases} |
```

Trong mỗi ô: xuống dòng thành một dấu cách; mỗi `|` thành `\|`. Nhờ đó một mô tả không vỡ thành nhiều dòng và không bị cắt chunk xẻ đôi.

`aliases` là các `aliasesVi` nối bằng `, `. Header thêm cột Aliases. Comment Oracle, nếu có, ghi thêm ngay sau bảng, một dòng mỗi cột có comment: `` - `{name}`: {comment} ``. Không thay mô tả LLM. Cùng quy tắc escape trên dòng comment.

DDL nằm trong fence `sql`, nguyên văn `info.ddl`. Sample tối đa 3 dòng; ô chuỗi dài hơn 200 ký tự cắt bằng `…` (giữ `truncateSampleRows`).

`documentId` giữ `{dbId}.{schemaName}.{tableName}.schema`.

### 6.2 `sqlexample.md`

Giữ [`sqlexample.md`](./sqlexample.md).

- History: mọi câu đã lấy (tối đa `sqlHistoryLimit`), SQL nguyên văn, không cắt giữa câu.
- Typical: các câu đã qua `isReadOnlySql`.
- Không có history và không có typical: không tạo document.

`documentId` giữ `{dbId}.{schemaName}.{tableName}.sqlexample`.

---

## 7. Chunk, embed, id

### 7.1 Cắt

Cắt theo section (`## Summary`, bảng cột, `## DDL`, `## Sample`, từng mục SQL). Trong section cột, cắt theo **dòng**. Một dòng cột không bị xẻ. Overlap là **0**.

Mỗi chunk là một lát cắt đúng của document. Nối `text` theo `chunkIndex` bằng chuỗi rỗng phải ra lại đúng document gốc, kể cả chỗ DDL bị cắt theo ký tự. Dấu xuống dòng của biên dòng nằm trong `text` của một trong hai chunk, không để Get RAG tự chèn. `overlapJoin` không dùng cho `formatVersion = 2`.

Một chunk phải thỏa cả hai:

| Ngân sách | Trần | Cách đo |
|-----------|------|---------|
| Token embed | **7680** (chừa dưới maximum input 8192 của `@cf/baai/bge-m3`) | Ước lượng thừa, không cần tokenizer: mỗi ký tự punctuation hoặc non-ASCII tính 1 token; mỗi từ ASCII tính `max(1, ceil(độ dài / 3))`. Vượt 7680 thì cắt tiếp theo dòng hoặc theo dòng DDL |
| Metadata | **8 KiB** cho cả object metadata (trần Vectorize là 10 KiB) | UTF-8 của `text` cộng các key còn lại. Vượt thì cắt tiếp theo dòng |

Không gửi `truncate_inputs: true`. Chuỗi vượt 8192 token là lỗi cắt chunk, không phải việc của model.

Một dòng cột không bị xẻ. Sau khi mô tả đã ≤ 2000 ký tự mỗi trường mà dòng cột đó vẫn vượt 7680 token hoặc 8 KiB: fail bảng, lỗi nêu tên cột, không upsert. Dòng DDL hoặc dòng comment không có chỗ xuống dòng mà vượt ngân sách thì được cắt theo ký tự UTF-8, vẫn nằm trong các chunk liên tiếp của cùng document.

`chunkSize` / `chunkOverlap` trên node không còn là cách cắt ký tự mù. Có thể để field trên panel nhưng runtime bỏ qua cho đường schema/SQL này. Không thêm field mới trên canvas trong đợt này.

### 7.2 Embed

Embed bằng `@cf/baai/bge-m3`, 1024 chiều. `runEmbed` gửi `{ text }` và không bật `truncate_inputs`. Service còn ghi `@cf/baai/bge-base-en-v1.5` được `resolveDefaultEmbedModel` đổi thành `bge-m3` trước khi gọi Workers AI.

Embed **hết** chunk của bảng trước khi `upsertVectors`. Vector rỗng hoặc exception: ném lỗi ngay, không upsert phần đã embed của bảng đó. Lô 8 chuỗi lỗi thì gọi từng chuỗi như hiện tại; lỗi từng chuỗi vẫn ném, không nuốt.

### 7.3 Metadata và id

Mỗi vector:

```ts
{
  id: sha256Hex(`${documentId}\n${chunkIndex}`), // 64 ký tự hex = 64 byte
  values,
  namespace, // giữ toVectorizeNativeNamespace
  metadata: {
    text,              // đúng nội dung chunk, một lần
    source,
    documentId,
    chunkIndex,        // string
    totalChunks,       // string, bằng số chunk thực sự upsert
    docType,
    tableName,
    schemaName,
    dbId,
    formatVersion: "2",
    namespace?,
  },
}
```

Không ghi key `content`. `matchToSnippet` đã đọc `text` trước `content`, nên vector cũ còn key `content` vẫn đọc được.

`sha256Hex` thay `vectorId` cắt chuỗi. Cùng `documentId` + `chunkIndex` thì upsert ghi đè đúng chunk. Get RAG (`vectorChunkId` trong `get-rag/assemble.ts`) phải dùng cùng hàm.

`formatVersion` để Get RAG ưu tiên bản ghi mới khi index còn vector id cũ (mục 10).

---

## 8. Khi nào được ghi và đánh dấu

`saveDocuments` nhận document chỉ sau mục 5 và 6.

Thứ tự trong `executeSaveRagPipeline`:

1. Enrich xong một bảng → dựng doc → embed → upsert bảng đó.
2. Upsert schema thành công (và sqlexample nếu có) thì `markIndexedTables` **bảng đó**.
3. Enrich hoặc embed ném lỗi: không upsert bảng đó, không mark. Các bảng đã mark trong cùng run giữ nguyên. Lỗi nổi lên để loop/run thấy.

Output node thêm hai số, cộng các field hiện có (`ok`, `saved`, `items`, `documentIds`, `collection`, `tables`):

```ts
{
  enrichedColumns: number; // tổng cột đã ghép mô tả trên các bảng ghi thành công
  llmCalls: number;
}
```

`saved` vẫn là số vector upsert.

---

## 9. Get RAG

Get RAG đọc đúng những gì Save RAG ghi. Id cắt 64 byte (`vectorChunkId` hiện tại) và trần `MAX_CHUNKS_PER_DOCUMENT = 24` không còn. `overlapJoin` không ghép document version 2.

### 9.0 Cấu hình mặc định

Panel Get RAG không được quyết định độ dài schema. `topK` chỉ là số bảng trả về. Chunk của một bảng đã chọn luôn được đọc hết.

| Tham số | Cấu hình | Khi trống hoặc không hợp lệ |
|---------|----------|------------------------------|
| Embed model | `@cf/baai/bge-m3`, 1024 chiều | Cùng `resolveDefaultEmbedModel` với Save RAG. Service `bge-base-en-v1.5` bị đổi. `truncate_inputs` không gửi `true` |
| `namespace` | Namespace của Vectorize node đã nối, cùng scope Save RAG đã ghi | Không query namespace khác. Không fallback sang namespace mặc định khi namespace này không có match |
| `queryField` | `{{ $json.chatInput \|\| $json.body.question \|\| $json.body.message \|\| $json.query \|\| $json.question }}` | Câu đã resolve được embed nguyên văn. Không cắt |
| `querySource` | `from_agent_input` | Pipeline lấy câu từ INPUT. Tool call của agent vẫn nhận câu ở đối số tool khi nguồn là `from_tool_args` |
| `groupByField` | `tableName` | Trống thì cũng là `tableName`. Không mặc định `documentId`: key đó tách schema khỏi sqlexample |
| `topK` | **12** bảng | Trống, ≤ 0, hoặc không phải số → 12. Trần cứng **20** bảng (bằng trần match của một query `returnMetadata: "all"`) |
| `scoreThreshold` | **0** | ≤ 0 hoặc không phải số → không lọc. Số > 0 chỉ loại bảng lúc chọn topK, theo điểm chunk cao nhất của bảng. Không xóa chunk đã tải bằng `getByIds` |
| `includeMetadata` | **true** | `text` của snippet luôn được trả, kể cả khi tắt metadata |
| Khám phá (broad, `schema`, `sqlexample`) | mỗi lần **20** match | Luôn xin trần API, không nhân với `topK` trên panel. 20 match chỉ để chọn bảng |
| `getByIds` | **100** id mỗi trang, thử lại **1** lần | Đọc `0 .. totalChunks-1`. Không trần 24 |
| Ghép | chuỗi rỗng, chỉ `formatVersion = 2` | Thiếu chunk schema sau lần thử lại → bỏ bảng |

`scoreThreshold` cao và `topK` nhỏ làm rơi bảng, không được dùng để cắt cột trong bảng còn lại. Nhiều chunk của một bảng có thể chiếm hết 20 match; vì vậy ba query (rộng, schema, sqlexample) chạy riêng rồi gom theo `tableName` trước khi cắt còn `topK` bảng.

### 9.1 Cùng model, cùng id

- Embed câu hỏi bằng `resolveDefaultEmbedModel`, cùng `@cf/baai/bge-m3` với Save RAG. Câu hỏi giữ nguyên, không cắt. Vector rỗng thì `snippets` rỗng, `count` 0. Lệch 1024 chiều thì ném lỗi, không trả snippet.
- `vectorChunkId` và Save RAG dùng chung hàm id ở mục 7.3: SHA-256 hex của `documentId`, dấu xuống dòng, rồi `chunkIndex`.
- `chunkIndex` chỉ lấy từ `metadata.chunkIndex`. Id hash không chứa số thứ tự. Thiếu `chunkIndex` thì hàng đó không được ghép.
- `totalChunks` chỉ lấy từ chunk `formatVersion = "2"`. Bỏ trần 24 ở `totalChunksForDocument` và `chunkIdsForDocument`.

### 9.2 Hydrate đủ chunk

`queryCollection` với `returnMetadata: "all"` chỉ để **chọn bảng** (trần topK của API là 20 match). Đủ cột của bảng đã chọn đến từ `getByIds`, không từ topK.

1. Với mỗi `documentId` version 2, xin mọi id `0 .. totalChunks-1`.
2. `getByIds` từng trang **100** id. Trang lỗi thì gọi lại một lần.
3. Sau lần gọi lại mà số chunk version 2 của một document vẫn nhỏ hơn `totalChunks`: bỏ document đó. Log `[get-rag] hydrate short`. Không ghép phần đã có rồi trả như thể đủ schema.
4. Document bị bỏ là `schema`: bỏ cả snippet của bảng. `sqlexample` một mình không thay schema.
5. Không có `sqlexample` trong khi schema đã đủ chunk: snippet hợp lệ, chỉ gồm schema. Save RAG được phép không ghi sqlexample. `groupLooksIncomplete` không được loại schema vì thiếu sqlexample.

`loadDocumentRows` không nuốt lỗi rồi trả mảng rỗng để assemble dùng mỗi chunk ban đầu.

### 9.3 Ghép text

- Chỉ chunk `formatVersion = "2"`.
- Sắp theo `chunkIndex` tăng dần. Không sắp theo nội dung `text`.
- Nối bằng chuỗi rỗng. Không `trim` từng chunk. `metadata.text` là nguồn; không đọc key `content` cho version 2.
- Trong một bảng, schema đứng trước sqlexample như hiện tại.
- `topK` theo mục 9.0: số bảng, mặc định 12, trần 20. Không phải số chunk.

`snippets[].text` và `ragText` là document đã ghép. Get RAG không cắt chúng. `prefetchLinkedGetRag` không bắt lỗi rồi trả chuỗi rỗng: lỗi retrieve nổi lên, để agent không viết SQL trên schema trống im lặng. `executeGetRagPipeline` giữ cách ném lỗi hiện tại.

---

## 10. Vector đã ghi trước spec này

Việc phát hành, trước khi worker mới ghi vector: xóa và tạo lại index `ask-ai-semantic` với **1024** chiều, metric `cosine`. Index 768 chiều không nhận vector của `bge-m3`. Tạo lại index thì vector cũ không còn. Spec này không có đợt `deleteByIds`.

Sau khi index mới tồn tại, chạy lại Save RAG. Mọi vector ghi bởi spec này có `formatVersion = "2"` và id hash. Get RAG chỉ ghép chunk `formatVersion = 2` của một `documentId`. Không deploy worker ghi vector này khi index vẫn là 768 chiều.

Bảng Oracle không có cột: fail bảng đó, không upsert, không mark indexed.

---

## 11. File

| File | Việc |
|------|------|
| `save-rag/describe-table.ts` | Tách lô cột, summary, typical query; khớp tên không phân biệt hoa thường; nhặt JSON cụt; đọc `finish_reason`; tham số mục 5.1 |
| `save-rag/documents.ts` | Chỉ dựng doc từ enrichment đủ cột; cột Aliases; DDL và history nguyên văn |
| `save-rag/chunk.ts` | Cắt theo section và dòng, trong ngân sách token và 8 KiB |
| `save-rag/execute.ts` | Không mark / không upsert khi thiếu cột; fail khi embed rỗng; metadata mục 7.3; đếm `llmCalls`, `enrichedColumns` |
| `rag/rag-vector.ts` | Hàm id hash dùng chung. Model mặc định `@cf/baai/bge-m3`, 1024 chiều |
| `get-rag/assemble.ts` | Bỏ trần 24; id hash chung với Save RAG; chỉ version 2; nối bằng chuỗi rỗng |
| `get-rag/execute.ts` | `getByIds` từng trang 100; document thiếu chunk thì bỏ bảng; prefetch không nuốt lỗi |
| `docs/workflow-nodes/schema.md` | Header bảng cột thêm Aliases, cùng PR |
| `save-rag/describe-table.test.ts` | Case, JSON cụt, lô giảm còn một nửa số cột chưa xong |
| `save-rag/execute.test.ts` | Bảng dài hơn một lô; text vector chứa mô tả cột đầu và cột cuối |
| `get-rag/assemble.test.ts` | Hơn 24 chunk được sinh đủ id |

Không sửa `pdf-extract.ts`. Hai hàm deprecated `introspectTableToRagDocuments` / `introspectTablesToRagDocuments` (dựng doc không enrichment) không được gọi từ pipeline. Để nguyên, không nối vào đường mới.

---

## 12. Kiểm tra

### 12.1 Parse và lô

- Cột `ORDER_ID` khớp response `order_id`, mô tả được giữ.
- Cột `FAKE` bị bỏ.
- JSON cụt sau hai object cột đầy đủ: hai cột đó được giữ; phần đuôi không làm rỗng cả bảng.
- `finish_reason=length` khi cả lô đã hoàn thành: không gọi lại lô đó.
- Lô 12 cột chỉ hoàn thành 8 cột: lần gọi sau có 2 cột, không phải 4, và không gồm 8 cột đã xong.
- Mô tả dài hơn 2000 ký tự: cột chưa xong, đi cùng nhánh thu nhỏ lô.
- Lô 1 cột thất bại hai lần: hàm ném lỗi, không trả enrichment rỗng.
- Bảng không có cột: không upsert.
- Typical query `DELETE` bị loại. History không bị typical query ghi đè.

### 12.2 Ghi Vectorize

- Bảng 40 cột, mock LLM cắt ở 12 cột mỗi lần: số lần gọi cột ≥ 4, `metadata.text` của các chunk schema chứa `descriptionVi` của cột đầu và cột cuối, và chứa DDL đầy đủ.
- Thiếu mô tả một cột: `upsert` không được gọi cho bảng đó, `INDEXED_TABLES_KEY` không có tên bảng.
- Id vector dài đúng 64 ký tự hex và khác nhau giữa hai `documentId` chỉ lệch ở cuối.
- Metadata không có key `content`. `text` bằng chunk. `formatVersion` là `2`.
- Ô mô tả có `|` và xuống dòng: trong `metadata.text` ký tự `|` đã thành `\|`, mô tả nằm trên một dòng bảng.
- Chunk ước lượng trên 7680 token không được gửi vào `AI.run`.
- Embed trả `[]` cho một chunk: không gọi `upsert`, lỗi nổi lên.

### 12.3 Đọc

- Id Get RAG xin cho `documentId` + `chunkIndex` trùng id Save RAG đã ghi.
- Document 30 chunk: hydrate xin đủ 30 id. Document 130 chunk: hơn một lần `getByIds`, mỗi lần tối đa 100.
- Hai chunk DDL cắt giữa một dòng, nối bằng chuỗi rỗng, không có ký tự thừa ở biên.
- Thiếu chunk sau một lần gọi lại: bảng đó không có trong `snippets`. Không trả schema cụt.
- Schema đủ chunk, không có sqlexample: snippet vẫn có schema.
- Chunk không có `formatVersion = 2` không được ghép.
- `prefetchLinkedGetRag` khi retrieve lỗi thì ném lỗi, không trả `ragText` rỗng.
- `topK` trống trở thành 12. `scoreThreshold` 0 không bỏ match. Namespace đã cấu hình không fallback sang namespace khác.
- Ba query khám phá đều xin 20 match rồi gom theo `tableName` trước khi cắt số bảng.

---

## 13. Việc xong

- Một bảng Oracle nhiều hơn 30 cột, chạy với `@cf/zai-org/glm-4.7-flash` và `@cf/baai/bge-m3`, có `descriptionVi` của mọi cột trong text Get RAG trả về khi hỏi đúng tên bảng.
- DDL trong snippet khớp DDL introspect, không bị cụt giữa câu lệnh vì `max_tokens`.
- Cố tình làm một lô trả JSON cụt trong test: bảng không được mark indexed.
- Vector mới có `formatVersion=2` và một key text.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.6 | 2026-09-28 | Cấu hình Get RAG mục 9.0: topK 12 bảng, scoreThreshold 0, groupBy tableName, khám phá 20 match, không fallback namespace |
| 0.5 | 2026-09-28 | Get RAG đọc đúng id hash và lát cắt của Save RAG; hydrate thiếu chunk thì bỏ bảng, không trả schema cụt |
| 0.4 | 2026-09-28 | Chốt maxTokens theo mục 3.1, thuật toán thu nhỏ lô, trần 2000 ký tự/mô tả, escape ô markdown, fallback json_object, tạo lại index 1024 trước khi ghi |
| 0.3 | 2026-09-28 | Bộ cấu hình mặc định mục 3.1: LLM 8192, lô 12 cột, chunk theo 7680 token / 8 KiB, bỏ chunk 800 |
| 0.2 | 2026-09-28 | Embed `@cf/baai/bge-m3`, 1024 chiều, ngân sách 7680 token |
| 0.1 | 2026-09-28 | Hợp đồng ghi đủ mô tả cột: lô LLM, ghép bằng code, chunk theo token, id hash, Get RAG bỏ trần 24 |
