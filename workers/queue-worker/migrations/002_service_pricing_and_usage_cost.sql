-- Giá cố định tùy chọn trên service; chi phí ghi nhận mỗi lần gọi (service_usages)
ALTER TABLE services ADD COLUMN fixedPrice REAL;
ALTER TABLE service_usages ADD COLUMN cost REAL DEFAULT 0;
