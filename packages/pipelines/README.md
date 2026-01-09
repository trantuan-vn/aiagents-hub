# Pipeline CLI

CLI tool để export pipeline schemas và tạo Cloudflare Pipelines.

## Installation

```bash
cd packages/pipelines
pnpm install
```

## Usage

### Export schemas

Export tất cả pipeline schemas thành các file JSON:

```bash
pnpm dev export
# hoặc với output directory tùy chỉnh
pnpm dev export --output ./schemas
```

### Create pipelines

Tạo streams, sinks, và pipelines từ các schema files:

```bash
# Dry run (chỉ in commands, không thực thi)
pnpm dev create --dry-run

# Thực thi thật (cần CATALOG_TOKEN)
CATALOG_TOKEN=your-token pnpm dev create

# Hoặc truyền token qua option
pnpm dev create --catalog-token your-token

# Tùy chỉnh các options
pnpm dev create \
  --schemas-dir ./schemas \
  --catalog-token your-token \
  --compression zstd \
  --roll-size 100 \
  --roll-interval 300
```

### Export và Create cùng lúc

Chạy cả export schemas và create pipelines trong một lệnh:

```bash
CATALOG_TOKEN=your-token pnpm dev all
```

### Delete pipelines

Xóa các Cloudflare Pipelines resources:

```bash
# Xóa tất cả (pipelines → streams → sinks)
pnpm dev delete

# Hoặc chỉ định cụ thể
pnpm dev delete --all
pnpm dev delete --pipelines
pnpm dev delete --streams
pnpm dev delete --sinks

# Dry run để xem sẽ xóa gì
pnpm dev delete --all --dry-run
```

## Options

### Export command
- `-o, --output <dir>`: Thư mục output cho schema files (default: `./schemas`)

### Create command
- `-s, --schemas-dir <dir>`: Thư mục chứa schema JSON files (default: `./schemas`)
- `--catalog-token <token>`: R2 Data Catalog token (required, hoặc set `CATALOG_TOKEN` env var)
- `--compression <type>`: Loại compression (default: `zstd`)
- `--roll-size-mb <size>`: Roll size tính bằng MB (default: `100`)
- `--roll-interval <seconds>`: Roll interval tính bằng giây (default: `300`)
- `--dry-run`: Chỉ in commands, không thực thi

### Delete command
- `--all`: Xóa tất cả resources (pipelines → streams → sinks) - mặc định nếu không có option nào
- `--pipelines`: Chỉ xóa pipelines
- `--streams`: Chỉ xóa streams
- `--sinks`: Chỉ xóa sinks
- `--dry-run`: Chỉ in những gì sẽ bị xóa, không thực thi

## Examples

```bash
# Export schemas
pnpm dev export --output ./schemas

# Dry run để xem các commands sẽ được chạy
pnpm dev create --dry-run

# Tạo pipelines với token từ environment variable
export CATALOG_TOKEN=your-token-here
pnpm dev create

# Tạo pipelines với custom options
pnpm dev create \
  --schemas-dir ./schemas \
  --catalog-token $WRANGLER_R2_SQL_AUTH_TOKEN \
  --compression zstd \
  --roll-size-mb 64 \
  --roll-interval 300 \
  --dry-run

# Export và create cùng lúc
CATALOG_TOKEN=your-token pnpm dev all

# Xóa tất cả pipelines resources
pnpm dev delete --all

# Xóa chỉ pipelines
pnpm dev delete --pipelines

# Dry run để xem sẽ xóa gì
pnpm dev delete --all --dry-run
```

## Generated Files

Khi export schemas, các file JSON sẽ được tạo với format:
- `<SchemaName>.json` - Ví dụ: `PricePolicySchema.json`, `UserSchema.json`

Mỗi file chứa pipeline schema theo format Cloudflare Pipelines với các fields và types tương ứng.

