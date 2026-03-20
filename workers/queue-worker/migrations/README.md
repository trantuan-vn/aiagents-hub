# D1 Migrations

Chạy migrations cho D1:

```bash
# Local (development)
wrangler d1 migrations apply queue-worker --local

# Remote (production)
wrangler d1 migrations apply queue-worker --remote
```

**Lưu ý**: Ngoài migrations SQL, schema còn được đồng bộ tự động tại runtime:
- **User DO**: `ensureSchemaColumns` thêm cột thiếu khi User DO khởi tạo
- **D1**: `ensureSchemaColumns` thêm cột thiếu khi D1DatabaseManager khởi tạo bảng

Khi thêm cột mới vào Zod schema, cả DO và D1 sẽ tự động thêm cột khi có request đầu tiên.
