# Spec: Sinh SQL gọn token

> **Trạng thái:** Draft  
> **Ngày:** 2026-10-01  
> **Thay cho:** phần `sqlexample` của [`saveRag.md`](./saveRag.md), [`sqlexample.md`](./sqlexample.md), và cách Get RAG ghép schema rồi SQL example trong [`getRag.md`](./getRag.md)  
> **Giữ:** [`save-rag-completeness-spec.md`](./save-rag-completeness-spec.md) cho hợp đồng “đủ cột, không cắt vì `max_tokens`”. Spec này đổi nội dung document và thứ tự retrieve, không nới lại việc bỏ bảng khi schema thiếu chunk.  
> **Liên kết:** [`tool-nodes.md`](./tool-nodes.md) · [`reasoning-agent.md`](./reasoning-agent.md) · [`reasoning-agent-runtime-spec.md`](./reasoning-agent-runtime-spec.md) · [`schema.md`](./schema.md) · [`vectorize.md`](./vectorize.md) · [`service.md`](./service.md)

Hai kho tách nhau. Save RAG chỉ ghi schema bảng. Một node mới ghi từng cặp câu hỏi và SQL đã có. Get RAG đọc cả hai và xếp thành hai phần cố định trước khi Reasoning Agent viết SQL.

---

## 1. Vì sao

Prompt act hiện nhận nguyên document đã hydrate: YAML, summary song ngữ, DDL, bảng cột (mô tả tới 2000 ký tự mỗi ngôn ngữ), comment Oracle, sample row, history và typical query. `topK` mặc định 12 bảng, `scoreThreshold` 0. `formatRagContext` không cắt.

Cùng khối đó còn lặp: prefetch ghi vào system, `get_rag` vẫn mở khi có `check_sql`, lần sửa gọi lại `get_rag`, reflect dán nguyên `observation.output`. Frame gửi ba snippet đầy đủ. `requireCitations` làm bản SQL thiếu `[n]` bị coi là chưa đạt. `scoreDraft` cộng điểm khi có `JOIN` hoặc `GROUP BY`. Code mode viết script trước khi thấy schema.

SQL example do LLM bịa lúc ingest không gắn với câu hỏi thật. Few-shot phải là cặp câu hỏi và SQL người dùng đã cho.

Diễn giải schema không có thuật ngữ chuyên ngành thì câu hỏi đời thường và document không cùng lớp từ. Save RAG cần system prompt vai chuyên gia lúc sinh mô tả tiếng Việt và tiếng Anh. Save SQL Pair dùng cùng kiểu prompt để viết lại câu hỏi trước khi embed, nên vector `sqlpair` nằm cùng lớp từ với schema. Reasoning Agent cần viết lại câu hỏi theo đúng các thuật ngữ đó trước khi Get RAG embed.

---

## 2. Hai kho trong cùng Vectorize

| `docType` | Ai ghi | Embed cái gì | Dùng để |
|-----------|--------|--------------|---------|
| `schema` | Save RAG | Markdown schema rút gọn | Biết cột, kiểu, PK/FK |
| `sqlpair` | Save SQL Pair | **Chỉ câu hỏi** (câu đã viết lại khi có system prompt) | Few-shot: câu hỏi giống thì lấy SQL kèm theo |

Cùng collection, cùng namespace, cùng chiều vector. Save RAG, Save SQL Pair và Get RAG dùng **một** embed model. Model lệch nhau thì query không đọc được vector đã ghi.

Get RAG bỏ `docType=sqlexample`. Vector `sqlexample` cũ không xóa trong spec này, và không được trả về.

---

## 3. Save RAG — chỉ schema

`toolKind` giữ `save-rag`. Vẫn một bảng một lượt từ Loop. Bỏ history, typical query, document `sqlexample`, handle không đổi (`in` / `out`, `service` embed, `llm`, `memory`).

### 3.1 Bỏ

| Chỗ | Việc |
|-----|------|
| `describe-table.ts` prompt `TYPICAL_SYSTEM` và field `typicalQueries` | Không gọi LLM viết SQL |
| `documents.ts` `buildSqlExampleDocument`, `renderHistory` | Không dựng sqlexample |
| `execute.ts` | Không `fetchSqlHistory`. Không upsert document `.sqlexample` |
| Config `sqlHistoryLimit` | Xóa khỏi definition, n8n description, default data |
| `COLUMN_DESC_MAX = 2000` | Đổi thành 240 mỗi trường (`descriptionVi`, `descriptionEn`, hai summary). Một câu mỗi ngôn ngữ. Vượt trần thì fail cột đó như hợp đồng đủ cột hiện tại |

### 3.2 Document schema ghi vào Vectorize

Metadata vector giữ `docType=schema`, `tableName`, `schemaName`, `dbId`, `formatVersion=2`. `documentId` giữ `{dbId}.{schemaName}.{tableName}.schema`.

Text embed chỉ còn:

```markdown
# {schemaName}.{tableName}

{tableSummaryVi}
{tableSummaryEn}

| Column | Type | Nullable | Key | Description | Aliases |
| col | VARCHAR2 | NO | PK | VI: một câu. EN: one sentence. | doanh thu thuần, net revenue |
```

`Key` là `PK`, `FK → {refTable}.{refColumn}`, hoặc trống.

Không đưa vào text: YAML header, DDL, comment Oracle, sample row, lịch sử SQL. PK/FK nằm ở cột `Key`, không lặp thành section riêng.

LLM mỗi bảng còn summary và mô tả cột: mỗi thứ một câu tiếng Việt và một câu tiếng Anh, cộng `aliasesVi`. Trần 240 ký tự mỗi trường. Bỏ typical query. Thiếu câu tiếng Việt, thiếu câu tiếng Anh, hoặc thiếu cột thì fail bảng, không upsert, không `markIndexedTables` — giữ [`save-rag-completeness-spec.md`](./save-rag-completeness-spec.md), trừ trần ký tự (spec kia đang 2000).

Thuật ngữ của system prompt mục 3.4 phải nằm trong text được embed (summary, Description, Aliases). Get RAG chỉ khớp câu hỏi sau này nếu từ chuyên ngành có trong document.

### 3.3 Config

Giữ `tableNameField`, `chunkSize`, `chunkOverlap`, `toolName`, `toolDescription`. Xóa `sqlHistoryLimit`. `toolDescription` mặc định nói rõ node chỉ ghi schema.

Thêm ô **System prompt** trên panel Parameters của Save RAG (màn hình cấu hình các lần gọi LLM của node này, không phải service node).

| Field UI | `node.data` | Type | Default | Mô tả |
|----------|-------------|------|---------|-------|
| **System prompt** | `describeSystemPrompt` | textarea | rỗng | Vai chuyên gia và thuật ngữ chuyên ngành. Truyền vào mọi lần LLM viết summary và mô tả cột |

### 3.4 System prompt chuyên ngành

Người cấu hình ghi vai và bộ thuật ngữ, ví dụ: bạn là chuyên gia kế toán doanh nghiệp; diễn giải dùng doanh thu thuần, giá vốn hàng bán, lợi nhuận gộp, công nợ phải thu, công nợ phải trả; `aliasesVi` gồm cả cách nói thông thường và thuật ngữ chuẩn.

Cách ghép khi gọi LLM (`SUMMARY_SYSTEM` và `COLUMN_SYSTEM`):

1. System message = `describeSystemPrompt` (nếu trim khác rỗng) rồi tới quy tắc JSON cố định: không bịa cột, trần 240 mỗi trường, đủ tiếng Việt và tiếng Anh, aliases là cách người dùng gọi cột.
2. Quy tắc JSON đứng sau. Prompt người dùng bảo trả markdown hoặc bịa cột thì vẫn theo quy tắc JSON.
3. Ô trống: không thêm vai, gọi như mô tả bảng thông thường.
4. Không đặt prompt này lên service node. Một model chat có thể nối nhiều workflow; chuyên ngành thuộc Save RAG của workflow đó.

Diễn giải sinh ra phải dùng đúng các thuật ngữ đó ở cả hai ngôn ngữ. Aliases giữ cách nói đời thường cạnh thuật ngữ chuẩn, để câu hỏi chưa được viết lại vẫn có cơ hội khớp.

---

## 4. Node mới: Save SQL Pair (`tool_node:save-sql-pair`)

Tool **ghi một cặp**. Input là một item upstream. Config kéo hai biến: câu hỏi và câu SQL của câu hỏi đó. Khi ô System prompt có nội dung, LLM viết lại câu hỏi theo thuật ngữ đó rồi mới embed. Upsert vào Vectorize.

Không introspect Oracle. Không nhận PDF. Không viết SQL. LLM chỉ viết lại câu hỏi.

### 4.1 Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `tool_node:save-sql-pair` |
| **Kind** | `toolKind: "save-sql-pair"` |
| **toolClass** | `persist` |
| **Pipeline** | Có |
| **Agent tool** | Không — không `createAgentTool` |
| **Catalog** | Thêm vào `TOOL_KINDS`, `TOOL_OVERRIDE_KINDS`, `WORKFLOW_AGENT_BUILTIN_TOOLS` |

### 4.2 Handles

| Handle | Vai trò |
|--------|---------|
| `in` / `out` | Data-flow. Một item, một cặp |
| `memory` | Vectorize, cùng index với Save RAG |
| `llm` | Service chat. Viết lại câu hỏi khi System prompt khác rỗng |

Không có handle `service`. Embed model lấy từ combo trên config, không từ service node nối vào. Không có handle `tools`: node không phải tool của agent.

Handle `llm` hiện trên canvas. Bắt buộc khi `describeSystemPrompt` trim khác rỗng. Ô prompt trống thì handle không bắt buộc và runtime không gọi LLM.

### 4.3 Config panel

Panel Parameters của node này. Hai ô expression dùng cùng cơ chế kéo biến INPUT đang có (`supportsExpression: true`), giống `tableNameField` của Save RAG.

| Field UI | `node.data` | Type | Default | Mô tả |
|----------|-------------|------|---------|-------|
| **Question** | `questionField` | expression | `{{ $json.question }}` | Kéo biến câu hỏi từ INPUT |
| **SQL** | `sqlField` | expression | `{{ $json.sql }}` | Kéo biến SQL tương ứng với câu hỏi đó |
| **System prompt** | `describeSystemPrompt` | textarea | rỗng | Cùng ý với Save RAG mục 3.4: vai chuyên gia và thuật ngữ chuyên ngành. Truyền vào lần LLM viết lại câu hỏi |
| **Embed model** | `embedModel` | select | model embed đầu tiên trong catalog | Combo. Chỉ service có capability `embed` (cùng nguồn `aiHubServiceSelect`, lọc `embed`) |
| Tool name | `toolName` | text | `save_sql_pair` | Không hiện như tool của agent |
| Label | `label` | text | `Save SQL Pair` | Tên trên canvas |

Combo lưu `catalogId` (hoặc endpoint embed) vào `embedModel`. Runtime resolve ra model id rồi gọi embed. Dimension của model phải khớp index Vectorize đang nối; lệch thì fail item, không upsert.

Ô Question và ô SQL trống sau khi resolve expression thì fail item đó, không ghi vector.

### 4.4 Viết lại câu hỏi

Chỉ chạy khi `describeSystemPrompt` trim khác rỗng. Cùng cách ghép với Save RAG: vai chuyên ngành đứng trước, quy tắc cố định đứng sau.

1. Chưa nối service chat vào handle `llm`: fail item, không gọi embed, không upsert.
2. System message = `describeSystemPrompt` rồi quy tắc: chỉ trả câu hỏi đã viết lại, không markdown, không SQL, không giải thích. Một câu hoặc vài mệnh đề, đủ chỉ tiêu, chiều nhóm, điều kiện lọc và kỳ đã có trong câu hỏi hoặc trong SQL. Dùng thuật ngữ của system prompt. Không bịa bảng hoặc cột mà prompt không nói tới.
3. User message gồm câu hỏi gốc và câu SQL của cặp. SQL để câu viết lại bám đúng logic đã có, không được nằm trong vector.
4. Output rỗng, dài hơn 2000 ký tự, hoặc bắt đầu bằng `SELECT` / `WITH`: fail item, không upsert.
5. Ô System prompt trống: bỏ bước, dùng nguyên câu hỏi đã trim. Không gọi LLM.

`documentId` vẫn hash câu hỏi gốc (mục 4.5), nên viết lại khác lời giữa hai lần ghi vẫn đè cùng một vector.

### 4.5 Ghi vector

Với mỗi item:

1. Resolve `questionField` và `sqlField` trên INPUT.
2. Viết lại câu hỏi theo mục 4.4. Câu đưa vào embed và vào chunk là câu sau bước này.
3. `documentId` = `sqlpair.` + sha256 hex của **câu hỏi gốc** đã trim (ổn định, ghi lại cùng câu hỏi thì đè).
4. Text lưu trong chunk:

~~~markdown
Question: {câu đã viết lại, hoặc câu gốc nếu bỏ bước 4.4}

````sql
{sql}
````
~~~

5. Vector hóa **chỉ câu ở dòng Question**, không vector hóa cả khối markdown. SQL nằm trong text chunk để Get RAG đọc lại, không kéo vector về phía câu lệnh dài.
6. Metadata: `docType=sqlpair`, `formatVersion=2`, `embedModel` (catalog id đã chọn). Không nhét SQL vào metadata (trần 10 KiB).
7. Upsert. Output: `{ ok, saved, documentId, collection, llmCalls }`. `llmCalls` là 0 khi bỏ bước viết lại, 1 khi đã gọi chat.

SQL không kiểm tra bằng Check SQL ở node này. Người cấu hình workflow chịu trách nhiệm cặp đưa vào là đúng.

### 4.5 File map

| File | Vai trò |
|------|---------|
| `packages/workflow-nodes` `kinds.ts`, `definition.ts` | Kind + field expression + textarea `describeSystemPrompt` + select `embedModel` |
| `workers/web` catalog, n8n description, i18n, canvas | Node trên add-node và panel. Handle `llm` khi kind là `save-sql-pair` |
| `workers/auth-worker/.../tool/save-sql-pair/module.ts` | `ToolModule`, `toolClass: persist`, pipeline only |
| `save-sql-pair/rewrite-question.ts` | Ghép system prompt, gọi chat, nhận câu hỏi đã viết lại |
| `save-sql-pair/execute.ts` | Resolve hai field, viết lại nếu có prompt, embed câu đó, upsert |
| `shared/registry.ts` | Một dòng trong `TOOL_MODULES` |
| `shared/rag-context.ts` | `save-sql-pair` nằm trong tập tool RAG (memory + embed) |

Canvas vẽ `in` / `out`, `memory`, và `llm`. Panel config là Parameters generic với expression, textarea và select. Combo embed dùng `aiHubServiceSelect` lọc capability `embed`.

---

## 5. Get RAG — hai phần đã xếp

`toolKind` giữ `get-rag`. Pipeline embed đúng query được đưa vào. Reasoning Agent không đưa câu nói thô: query prefetch là câu đã chuẩn hóa ở mục 6.1. Đổi cách chọn và cách ghép.

### 5.1 Hai query, không trộn

| Phần | Filter | Giữ lại | Xếp |
|------|--------|---------|-----|
| 1. Câu hỏi và SQL | `docType=sqlpair` | `sqlPairTopK` mặc định **5** | Điểm giảm dần. Cùng `documentId` thì một cặp |
| 2. Schema | `docType=schema` | `topK` mặc định **4** bảng | Điểm giảm dần theo bảng. Đủ chunk mới giữ, thiếu chunk thì bỏ bảng |

Bỏ query “broad” không filter `docType`. Bỏ query `docType=sqlexample`. `scoreThreshold` mặc định **0.25** (cosine). Bảng hoặc cặp dưới ngưỡng không vào prompt. Ngưỡng 0 cũ kéo bảng không liên quan.

Sau khi có bảng neo, thêm tối đa **một hop FK**: bảng được cột `Key` trỏ tới, nếu document schema của bảng đó có trong index. Hop này không chiếm suất `topK` của bảng không liên quan; trần hop là số FK của các bảng neo, tối đa 4 bảng nữa. Không hop tiếp từ bảng vừa thêm.

### 5.2 Schema đưa vào prompt

Hydrate đủ chunk rồi mới rút, không cắt giữa cột. Bản đưa vào prompt không phải nguyên markdown đã lưu nếu markdown còn rác cũ: parser lấy heading bảng, summary tiếng Việt và tiếng Anh, và các dòng cột. Cột giữ lại khi trùng một trong các điều kiện:

- tên cột, alias, hoặc mô tả chứa token của câu hỏi (không phân biệt hoa thường, bỏ stopword);
- cột PK hoặc FK;
- cột được một cặp SQL ở phần 1 nhắc tới.

Bảng neo không cột nào khớp token thì vẫn giữ PK, FK và tối đa 12 cột đầu, để không trả schema rỗng. Không gọi LLM để chọn cột.

### 5.3 Output

`ragText` là một chuỗi, phần 1 rồi phần 2. Không xen kẽ theo điểm chung.

```markdown
## Câu hỏi và SQL

### 1
Question: doanh thu theo tháng
```sql
SELECT ...
```

## Schema liên quan

### SALES.ORDERS
{schema rút gọn của bảng}
```

```ts
{
  sqlPairs: Array<{ question: string; sql: string; score: number }>;
  schemas: Array<{
    text: string;
    tableName: string;
    schemaName: string;
    score: number;
  }>;
  snippets: Array<{ text: string; docType: 'sqlpair' | 'schema'; score: number; tableName?: string; schemaName?: string }>;
  count: number; // sqlPairs.length + schemas.length
  ragText: string;
}
```

`snippets` xếp sqlpair trước, schema sau, cùng thứ tự với `ragText`. `formatRagContext` nhận chuỗi này một lần. Không gắn nguyên document lần nữa.

Không có cặp nào thì phần 1 là `_Không có câu hỏi tương tự._` và vẫn trả schema. Không có schema thì phần 2 nói rõ không có bảng, agent không bịa tên cột.

### 5.4 Config

| Field | Default mới |
|-------|-------------|
| `topK` | 4 (số bảng schema) |
| `sqlPairTopK` | 5 |
| `scoreThreshold` | 0.25 |
| `groupByField` | `tableName` |

`toolDescription` nói: trả câu hỏi–SQL tương tự trước, schema liên quan sau. Đừng gọi khi context đã có hai phần này.

### 5.5 Cùng embed model

Get RAG embed câu hỏi bằng model đã ghi trên vector `sqlpair` và `schema`. Config Get RAG thêm combo **Embed model**, cùng danh sách với Save SQL Pair, cùng key `embedModel`. Ba node trỏ một giá trị. Khác dimension với index thì fail retrieve, không trả snippet rỗng.

---

## 6. Reasoning Agent — một bản context

Áp khi tool SQL (`check_sql`) được nối.

### 6.1 Chuẩn hóa câu hỏi trước Get RAG

Một lần mỗi lượt user, trước prefetch. Không viết SQL, không gọi tool.

Thuật ngữ chuyên ngành nằm trong `systemPrompt` sẵn có của Reasoning Agent (cùng ý với ô System prompt của Save RAG: bạn là chuyên gia lĩnh vực nào, bộ thuật ngữ nào). Không thêm field mới.

1. Đọc câu hỏi user và `systemPrompt`.
2. Một lần LLM chat. System của bước này chỉ yêu cầu viết lại câu hỏi, không trả lời, không SQL. Phần user gồm câu hỏi gốc và nguyên `systemPrompt`.
3. Output một câu (hoặc vài mệnh đề) đủ thuật ngữ chuyên ngành và logic cần truy vấn: chỉ tiêu, chiều nhóm, điều kiện lọc, kỳ. Không thêm bảng hoặc cột mà system prompt không nói tới.
4. `systemPrompt` trống hoặc đúng bằng prompt mặc định của Reasoning Agent thì bỏ bước, embed nguyên câu hỏi. Người cấu hình thêm vai chuyên gia và thuật ngữ vào `systemPrompt` thì bước này chạy.
5. Gọi LLM lỗi hoặc chuỗi rỗng: dùng nguyên câu hỏi, không fail lượt.
6. Câu đã viết lại là query embed của prefetch Get RAG (cả `sqlpair` và `schema`). Câu gốc vẫn nằm trong prompt viết SQL, để câu lệnh bám đúng yêu cầu user.
7. Lần `get_rag` sau lỗi Oracle vẫn dùng identifier trong lỗi, không viết lại lần nữa.

Câu trong vector `sqlpair` là câu đã viết lại ở mục 4.4 khi Save SQL Pair có system prompt. Cặp lưu bằng lời nói thô sẽ khớp kém với câu Get RAG embed sau bước này.

### 6.2 Một lần đưa schema vào prompt

Prefetch Get RAG ghi `ragText` (hai phần ở mục 5.3) vào **user message** một lần. Không gắn lại khối đó vào system prompt, kể cả khi system prompt có `{{ $json.ragText }}`. Query của prefetch là câu đã chuẩn hóa khi bước 6.1 có chạy. Đã có `ragText` thì act đầu không gọi `get_rag`.

`check_sql` trả `ok: false`: gọi `get_rag` với query là identifier hoặc bảng còn thiếu trong lỗi Oracle, không nhét nguyên câu hỏi cũ cộng stack lỗi. Kết quả **thay** khối `ragText` của lượt đó, không nối thêm vào cuối.

Reflect (`purpose: reflect`) chỉ nhận bản SQL nháp và chuỗi lỗi Oracle. Không nhận `observation.output` đầy đủ, không nhận lại schema.

### 6.3 Bỏ vòng không làm SQL đúng hơn

| Chỗ | Việc |
|-----|------|
| LLM `purpose: frame` | Bỏ khi đã có `ragText` hoặc snippet schema. Giữ heuristic `inferMissingSlots` |
| `requireCitations` | `false` khi `evaluationMode === 'sql'`. Thiếu `[n]` không thành `missing_citations` |
| `scoreDraft` nhánh sql | Bỏ `+6` cho `JOIN` / `GROUP BY`. Điểm cộng chỉ khi có SQL và `check_sql` ok |
| `maxReflectRetries` | Giữ default 4. Dừng khi `check_sql` ok, không reflect thêm cho văn xung quanh SQL |

### 6.4 Code mode

`runCodeModeAgent` nhận `ragText` đã prefetch bằng câu đã chuẩn hóa. User message act 1 gồm câu hỏi gốc, câu đã chuẩn hóa, và hai phần context. Script viết SQL từ context đó rồi gọi `check_sql`. Không gọi `get_rag` trong script khi context đã có. Act 2 chỉ khi validate lỗi: query retrieve là lỗi đã cắt, script sửa câu SQL cũ.

---

## 7. File đụng

| File | Thay đổi |
|------|----------|
| `save-rag/describe-table.ts` | Bỏ typical query. Giữ mô tả VI và EN, trần 240. Ghép `describeSystemPrompt` trước quy tắc JSON |
| `save-rag/documents.ts` | Chỉ `buildSchemaDocument` rút gọn. Xóa builder sqlexample |
| `save-rag/execute.ts` | Không history, không upsert `.sqlexample` |
| `save-rag/module.ts` | Mô tả tool: schema only |
| `get-rag/execute.ts` | Hai query có filter. Bỏ broad và sqlexample. Ngưỡng, hop FK |
| `get-rag/assemble.ts` | Ghép phần 1 sqlpair, phần 2 schema đã lọc cột |
| `reasoning/cite.ts` | `formatRagContext` một chuỗi hai phần |
| `execute-reasoning.ts` | Viết lại câu hỏi theo `systemPrompt` trước prefetch. Prefetch một lần, reflect chỉ lỗi, frame bỏ khi đã có RAG, code mode nhận `ragText` |
| `reasoning/quality.ts` | Bỏ thưởng JOIN/GROUP BY |
| `reasoning/reflect.ts` | SQL mode không fail vì citation |
| `packages/workflow-nodes` tool kinds + definitions | Kind mới, xóa `sqlHistoryLimit`, default `topK` / `scoreThreshold`, combo `embedModel`, textarea `describeSystemPrompt` trên Save RAG và Save SQL Pair |
| `save-sql-pair/rewrite-question.ts`, `execute.ts` | System prompt khác rỗng thì LLM viết lại câu hỏi trước khi embed. `documentId` hash câu gốc |
| `workers/web` catalog + n8n description + i18n | Save SQL Pair trên add-node và panel |
| `shared/registry.ts`, `rag-context.ts` | Đăng ký kind mới |

Test nằm trong folder kind. Save RAG không còn assert document sqlexample. Get RAG assert thứ tự: mọi snippet `sqlpair` đứng trước snippet `schema`.

---

## 8. Pha

| Pha | Xong khi |
|-----|----------|
| **1. Schema only** | Save RAG một document `.schema` rút gọn mỗi bảng, summary và mô tả cột có cả tiếng Việt và tiếng Anh. Panel có system prompt chuyên ngành; thuật ngữ đó có trong text embed. Không gọi history, không gọi LLM typical query. Bảng thiếu mô tả một trong hai ngôn ngữ không được mark indexed |
| **2. Save SQL Pair** | Node trên catalog. Kéo được question và SQL. Combo embed model. System prompt khác rỗng thì LLM viết lại câu hỏi theo thuật ngữ đó; vector và dòng Question trong chunk là câu đã viết lại, `documentId` hash câu gốc. Prompt trống thì embed nguyên câu hỏi. Upsert `docType=sqlpair`, text chứa đủ SQL |
| **3. Get RAG hai phần** | `ragText` có heading phần 1 rồi phần 2. Không trả `sqlexample`. `topK` 4, `sqlPairTopK` 5, ngưỡng 0.25, một hop FK |
| **4. Agent** | Trước prefetch, viết lại câu hỏi theo thuật ngữ trong `systemPrompt` khi prompt có chuyên ngành. Prefetch embed câu đó, không kèm `get_rag` ở act đầu. Reflect không gửi full observation. SQL mode không bắt citation. Code mode thấy `ragText` trước khi viết script |

Pha 3 đọc cả vector schema pha 1 và vector sqlpair pha 2. Index cũ còn `sqlexample` vẫn chạy: Get RAG bỏ qua docType đó.

---

## 9. Không làm trong spec này

- Xóa vector `sqlexample` đã ghi.
- Check SQL trên cặp lúc Save SQL Pair.
- LLM chọn cột.
- Đổi `check_sql` hoặc Get DB Info.
- Hai embed model trong một index.
- Field system prompt mới trên Reasoning Agent. Thuật ngữ chuyên ngành nằm trong `systemPrompt` sẵn có.
- Đặt `describeSystemPrompt` lên service node.
