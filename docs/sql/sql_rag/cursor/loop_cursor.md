```mermaid
sequenceDiagram
    participant User
    participant LLM
    participant Tool
    participant FileSystem
    
    User->>LLM: Yêu cầu thêm Google Login
    LLM->>LLM: Thought 1 (SUY NGHĨ)
    LLM->>Tool: Gọi read_file
    Tool->>FileSystem: Đọc package.json
    FileSystem-->>Tool: Kết quả
    Tool-->>LLM: Observe 1
    LLM->>LLM: Thought 2 (PHÂN TÍCH)
    LLM->>Tool: Gọi read_file tiếp
    Note over LLM: LLM chỉ dùng để<br/>suy nghĩ và lập kế hoạch,<br/>không dùng để thực thi tool
```
