-- =====================================================
-- HỆ THỐNG XUẤT DỮ LIỆU BẢNG RA MARKDOWN CHO RAG
-- Dùng để tạo context cho LLM sinh SQL từ câu hỏi tự nhiên
-- =====================================================

-- 1. Tạo Package với các function và procedure
CREATE OR REPLACE PACKAGE RAG_EXPORT_MD AS
    -- Function chính: Xuất thông tin bảng ra CLOB (Markdown format)
    FUNCTION export_table_to_md(p_table_name IN VARCHAR2) RETURN CLOB;
    
    -- Procedure: Xuất và lưu vào bảng tạm
    PROCEDURE export_table_to_temp(p_table_name IN VARCHAR2);
    
    -- Function: Xuất nhiều bảng cùng lúc
    FUNCTION export_multiple_tables(p_table_list IN VARCHAR2) RETURN CLOB;
    
    -- Function: Lấy cấu trúc bảng
    FUNCTION get_table_schema(p_table_name IN VARCHAR2) RETURN CLOB;
    
    -- Function: Lấy 10 dòng dữ liệu mẫu
    FUNCTION get_sample_data(p_table_name IN VARCHAR2) RETURN CLOB;
END RAG_EXPORT_MD;
/

-- 2. Package Body
CREATE OR REPLACE PACKAGE BODY RAG_EXPORT_MD AS

    -- Helper: Lấy danh sách cột của bảng
    FUNCTION get_columns(p_table_name VARCHAR2) RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                DATA_LENGTH,
                DATA_PRECISION,
                DATA_SCALE,
                NULLABLE,
                COLUMN_ID
            FROM USER_TAB_COLUMNS
            WHERE TABLE_NAME = UPPER(p_table_name)
            ORDER BY COLUMN_ID;
        RETURN v_cursor;
    END get_columns;

    -- Helper: Lấy khóa chính - SỬA LỖI TRÀN BỘ ĐỆM
    FUNCTION get_primary_key(p_table_name VARCHAR2) RETURN CLOB IS
        v_pk CLOB;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_pk, TRUE);
        
        FOR rec IN (
            SELECT COLUMN_NAME
            FROM USER_CONS_COLUMNS
            WHERE CONSTRAINT_NAME IN (
                SELECT CONSTRAINT_NAME 
                FROM USER_CONSTRAINTS 
                WHERE TABLE_NAME = UPPER(p_table_name) 
                AND CONSTRAINT_TYPE = 'P'
            )
            AND TABLE_NAME = UPPER(p_table_name)
            ORDER BY POSITION
        ) LOOP
            IF DBMS_LOB.GETLENGTH(v_pk) > 0 THEN
                DBMS_LOB.WRITEAPPEND(v_pk, 2, ', ');
            END IF;
            DBMS_LOB.WRITEAPPEND(v_pk, LENGTH(rec.COLUMN_NAME), rec.COLUMN_NAME);
        END LOOP;
        
        IF DBMS_LOB.GETLENGTH(v_pk) = 0 THEN
            DBMS_LOB.WRITEAPPEND(v_pk, 15, 'No primary key');
        END IF;
        
        RETURN v_pk;
    EXCEPTION
        WHEN OTHERS THEN
            DBMS_LOB.CREATETEMPORARY(v_pk, TRUE);
            DBMS_LOB.WRITEAPPEND(v_pk, 15, 'No primary key');
            RETURN v_pk;
    END get_primary_key;

    -- Helper: Lấy khóa ngoại - SỬA LỖI TRÀN BỘ ĐỆM
    FUNCTION get_foreign_keys(p_table_name VARCHAR2) RETURN CLOB IS
        v_fk CLOB;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_fk, TRUE);
        
        FOR rec IN (
            SELECT A.COLUMN_NAME || ' -> ' || P.TABLE_NAME || '(' || B.COLUMN_NAME || ')' AS fk_info
            FROM USER_CONS_COLUMNS A
            JOIN USER_CONSTRAINTS C ON A.CONSTRAINT_NAME = C.CONSTRAINT_NAME
            JOIN USER_CONSTRAINTS P ON C.R_CONSTRAINT_NAME = P.CONSTRAINT_NAME
            JOIN USER_CONS_COLUMNS B ON P.CONSTRAINT_NAME = B.CONSTRAINT_NAME
            WHERE UPPER(C.TABLE_NAME) = UPPER(p_table_name)
            AND C.CONSTRAINT_TYPE = 'R'
            AND A.POSITION = B.POSITION
            ORDER BY A.POSITION
        ) LOOP
            IF DBMS_LOB.GETLENGTH(v_fk) > 0 THEN
                DBMS_LOB.WRITEAPPEND(v_fk, 2, '; ');
            END IF;
            DBMS_LOB.WRITEAPPEND(v_fk, LENGTH(rec.fk_info), rec.fk_info);
        END LOOP;
        
        IF DBMS_LOB.GETLENGTH(v_fk) = 0 THEN
            DBMS_LOB.WRITEAPPEND(v_fk, 15, 'No foreign keys');
        END IF;
        
        RETURN v_fk;
    EXCEPTION
        WHEN OTHERS THEN
            DBMS_LOB.CREATETEMPORARY(v_fk, TRUE);
            DBMS_LOB.WRITEAPPEND(v_fk, 22, 'Error getting foreign keys');
            RETURN v_fk;
    END get_foreign_keys;

    -- Helper: Lấy dữ liệu mẫu dạng bảng Markdown
    FUNCTION get_sample_data_md(p_table_name VARCHAR2) RETURN CLOB IS
        v_clob CLOB;
        v_sql VARCHAR2(4000);
        v_cols VARCHAR2(4000);
        v_cursor SYS_REFCURSOR;
        v_row_count NUMBER := 0;
    BEGIN
        -- Khởi tạo CLOB
        DBMS_LOB.CREATETEMPORARY(v_clob, TRUE);
        
        -- Lấy danh sách cột
        SELECT LISTAGG(COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY COLUMN_ID)
        INTO v_cols
        FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = UPPER(p_table_name)
        AND ROWNUM <= 100; -- Giới hạn để tránh quá dài
        
        -- Xây dựng SQL lấy 10 dòng
        v_sql := 'SELECT ' || v_cols || ' FROM ' || UPPER(p_table_name) || ' WHERE ROWNUM <= 10';
        
        -- Sử dụng DBMS_SQL để lấy dữ liệu và format
        DECLARE
            v_cur NUMBER;
            v_col_count NUMBER;
            v_desc_tab DBMS_SQL.DESC_TAB;
            v_col_names VARCHAR2(4000) := '';
            v_header_line VARCHAR2(4000) := '';
            v_separator_line VARCHAR2(4000) := '';
            v_row_data VARCHAR2(4000);
            v_status NUMBER;
        BEGIN
            v_cur := DBMS_SQL.OPEN_CURSOR;
            DBMS_SQL.PARSE(v_cur, v_sql, DBMS_SQL.NATIVE);
            DBMS_SQL.DESCRIBE_COLUMNS(v_cur, v_col_count, v_desc_tab);
            
            -- Define các cột
            FOR i IN 1..v_col_count LOOP
                IF v_desc_tab(i).COL_TYPE IN (1, 2, 12) THEN -- VARCHAR2, NUMBER, DATE
                    DBMS_SQL.DEFINE_COLUMN(v_cur, i, v_desc_tab(i).COL_NAME, 4000);
                ELSE
                    DBMS_SQL.DEFINE_COLUMN(v_cur, i, v_desc_tab(i).COL_NAME, 4000);
                END IF;
            END LOOP;
            
            -- Tạo header
            FOR i IN 1..v_col_count LOOP
                v_col_names := v_col_names || '| ' || v_desc_tab(i).COL_NAME || ' ';
                v_header_line := v_header_line || '| ' || v_desc_tab(i).COL_NAME || ' ';
                v_separator_line := v_separator_line || '| --- ';
            END LOOP;
            v_col_names := v_col_names || '|';
            v_header_line := v_header_line || '|';
            v_separator_line := v_separator_line || '|';
            
            -- Thêm header vào CLOB
            DBMS_LOB.WRITEAPPEND(v_clob, LENGTH(v_header_line || CHR(10)), v_header_line || CHR(10));
            DBMS_LOB.WRITEAPPEND(v_clob, LENGTH(v_separator_line || CHR(10)), v_separator_line || CHR(10));
            
            -- Lấy dữ liệu
            v_status := DBMS_SQL.EXECUTE(v_cur);
            
            LOOP
                IF DBMS_SQL.FETCH_ROWS(v_cur) > 0 THEN
                    v_row_data := '';
                    FOR i IN 1..v_col_count LOOP
                        DECLARE
                            v_val VARCHAR2(4000);
                            v_date_val DATE;
                            v_num_val NUMBER;
                        BEGIN
                            IF v_desc_tab(i).COL_TYPE = 12 THEN -- DATE
                                DBMS_SQL.COLUMN_VALUE(v_cur, i, v_date_val);
                                v_val := TO_CHAR(v_date_val, 'YYYY-MM-DD HH24:MI:SS');
                            ELSIF v_desc_tab(i).COL_TYPE IN (2, 3) THEN -- NUMBER
                                DBMS_SQL.COLUMN_VALUE(v_cur, i, v_num_val);
                                v_val := TO_CHAR(v_num_val);
                            ELSE
                                DBMS_SQL.COLUMN_VALUE(v_cur, i, v_val);
                            END IF;
                            
                            -- Xử lý NULL
                            IF v_val IS NULL THEN
                                v_val := 'NULL';
                            END IF;
                            
                            v_row_data := v_row_data || '| ' || REPLACE(v_val, '|', '\\|') || ' ';
                        EXCEPTION
                            WHEN OTHERS THEN
                                v_row_data := v_row_data || '| [ERROR] ';
                        END;
                    END LOOP;
                    v_row_data := v_row_data || '|';
                    
                    -- Thêm dòng dữ liệu vào CLOB
                    DBMS_LOB.WRITEAPPEND(v_clob, LENGTH(v_row_data || CHR(10)), v_row_data || CHR(10));
                    v_row_count := v_row_count + 1;
                ELSE
                    EXIT;
                END IF;
                EXIT WHEN v_row_count >= 10;
            END LOOP;
            
            DBMS_SQL.CLOSE_CURSOR(v_cur);
            
            -- Nếu không có dữ liệu
            IF v_row_count = 0 THEN
                DBMS_LOB.WRITEAPPEND(v_clob, 20, '| No data found |');
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                DBMS_LOB.WRITEAPPEND(v_clob, LENGTH('Error: ' || SQLERRM), 'Error: ' || SQLERRM);
        END;
        
        RETURN v_clob;
    END get_sample_data_md;

    -- Function chính: Xuất toàn bộ thông tin bảng ra Markdown
    FUNCTION export_table_to_md(p_table_name IN VARCHAR2) RETURN CLOB IS
        v_result CLOB;
        v_schema CLOB;
        v_data CLOB;
        v_pk CLOB;
        v_fk CLOB;
        v_col_cursor SYS_REFCURSOR;
        v_col_name VARCHAR2(100);
        v_data_type VARCHAR2(100);
        v_data_length NUMBER;
        v_data_precision NUMBER;
        v_data_scale NUMBER;
        v_nullable VARCHAR2(5);
        v_col_id NUMBER;
        v_line VARCHAR2(4000);
        v_pk_text VARCHAR2(4000);
        v_fk_text VARCHAR2(4000);
    BEGIN
        -- Khởi tạo CLOB
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        -- Title
        v_line := '# 📊 Table: ' || UPPER(p_table_name) || CHR(10) || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        -- Metadata
        v_pk := get_primary_key(p_table_name);
        v_fk := get_foreign_keys(p_table_name);
        
        v_line := '## 📋 Table Metadata' || CHR(10) || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := '- **Table Name**: `' || UPPER(p_table_name) || '`' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        -- Primary Key
        v_line := '- **Primary Key**: `';
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        DBMS_LOB.APPEND(v_result, v_pk);
        DBMS_LOB.WRITEAPPEND(v_result, 1, '`');
        DBMS_LOB.WRITEAPPEND(v_result, 1, CHR(10));
        
        -- Foreign Keys
        v_line := '- **Foreign Keys**: ';
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        DBMS_LOB.APPEND(v_result, v_fk);
        DBMS_LOB.WRITEAPPEND(v_result, 2, CHR(10) || CHR(10));
        
        -- Column Schema
        v_line := '## 📝 Column Schema' || CHR(10) || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := '| # | Column Name | Data Type | Length/Precision | Nullable | Description |' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := '|---|-------------|-----------|------------------|----------|-------------|' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        -- Lấy danh sách cột
        v_col_cursor := get_columns(p_table_name);
        LOOP
            FETCH v_col_cursor INTO v_col_name, v_data_type, v_data_length, v_data_precision, v_data_scale, v_nullable, v_col_id;
            EXIT WHEN v_col_cursor%NOTFOUND;
            
            DECLARE
                v_type_info VARCHAR2(100);
                v_desc VARCHAR2(200) := '';
            BEGIN
                -- Xác định kiểu dữ liệu chi tiết
                IF v_data_type IN ('VARCHAR2', 'CHAR') THEN
                    v_type_info := v_data_type || '(' || v_data_length || ')';
                ELSIF v_data_type IN ('NUMBER') THEN
                    IF v_data_precision IS NOT NULL AND v_data_scale IS NOT NULL THEN
                        v_type_info := 'NUMBER(' || v_data_precision || ',' || v_data_scale || ')';
                    ELSIF v_data_precision IS NOT NULL THEN
                        v_type_info := 'NUMBER(' || v_data_precision || ')';
                    ELSE
                        v_type_info := 'NUMBER';
                    END IF;
                ELSIF v_data_type IN ('DATE', 'TIMESTAMP') THEN
                    v_type_info := v_data_type;
                ELSE
                    v_type_info := v_data_type;
                END IF;
                
                -- Gợi ý mô tả dựa trên tên cột
                IF UPPER(v_col_name) LIKE '%ID' OR UPPER(v_col_name) LIKE '%MA%' THEN
                    v_desc := 'ID/Mã định danh';
                ELSIF UPPER(v_col_name) LIKE '%TEN%' OR UPPER(v_col_name) LIKE '%NAME%' THEN
                    v_desc := 'Tên/Name';
                ELSIF UPPER(v_col_name) LIKE '%NGAY%' OR UPPER(v_col_name) LIKE '%DATE%' THEN
                    v_desc := 'Ngày/Date';
                ELSIF UPPER(v_col_name) LIKE '%SO_LUONG%' OR UPPER(v_col_name) LIKE '%AMOUNT%' THEN
                    v_desc := 'Số lượng/Quantity';
                ELSIF UPPER(v_col_name) LIKE '%GIA%' OR UPPER(v_col_name) LIKE '%PRICE%' THEN
                    v_desc := 'Giá/Price';
                ELSIF UPPER(v_col_name) LIKE '%TRANG_THAI%' OR UPPER(v_col_name) LIKE '%STATUS%' THEN
                    v_desc := 'Trạng thái/Status';
                ELSE
                    v_desc := '';
                END IF;
                
                v_line := '| ' || v_col_id || ' | `' || v_col_name || '` | ' || v_data_type || ' | ' || v_type_info || ' | ' || v_nullable || ' | ' || v_desc || ' |' || CHR(10);
                DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
            END;
        END LOOP;
        CLOSE v_col_cursor;
        
        DBMS_LOB.WRITEAPPEND(v_result, 2, CHR(10) || CHR(10));
        
        -- Sample Data
        v_line := '## 📊 Sample Data (10 rows)' || CHR(10) || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        -- Lấy dữ liệu mẫu
        v_data := get_sample_data_md(p_table_name);
        DBMS_LOB.APPEND(v_result, v_data);
        
        -- Add Note for RAG
        v_line := CHR(10) || '---' || CHR(10) || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := '## 💡 SQL Generation Hints for RAG' || CHR(10) || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := 'When generating SQL for this table, consider:' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := '- Table name: `' || UPPER(p_table_name) || '`' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := '- Use column names exactly as listed above' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := '- Handle Vietnamese characters properly' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := '- Consider relationships with other tables' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_line := '- Use appropriate date formats (DD/MM/YYYY)' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        RETURN v_result;
    END export_table_to_md;

    -- Procedure: Xuất và lưu vào bảng tạm
    PROCEDURE export_table_to_temp(p_table_name IN VARCHAR2) IS
        v_md_content CLOB;
    BEGIN
        v_md_content := export_table_to_md(p_table_name);
        
        -- Tạo bảng tạm nếu chưa có
        BEGIN
            EXECUTE IMMEDIATE 'CREATE TABLE RAG_TABLE_DOCS (
                TABLE_NAME VARCHAR2(100),
                DOCUMENT CLOB,
                EXPORT_DATE DATE DEFAULT SYSDATE,
                CONSTRAINT pk_rag_docs PRIMARY KEY (TABLE_NAME)
            )';
        EXCEPTION
            WHEN OTHERS THEN
                NULL; -- Bảng đã tồn tại
        END;
        
        -- Insert hoặc Update
        BEGIN
            EXECUTE IMMEDIATE 'DELETE FROM RAG_TABLE_DOCS WHERE TABLE_NAME = :1' USING UPPER(p_table_name);
            EXECUTE IMMEDIATE 'INSERT INTO RAG_TABLE_DOCS (TABLE_NAME, DOCUMENT) VALUES (:1, :2)' 
                USING UPPER(p_table_name), v_md_content;
            COMMIT;
        EXCEPTION
            WHEN OTHERS THEN
                ROLLBACK;
                RAISE;
        END;
    END export_table_to_temp;

    -- Function: Xuất nhiều bảng cùng lúc
    FUNCTION export_multiple_tables(p_table_list IN VARCHAR2) RETURN CLOB IS
        v_result CLOB;
        v_tables SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST();
        v_table_name VARCHAR2(100);
        v_pos NUMBER := 1;
        v_next_pos NUMBER;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        -- Parse danh sách bảng
        LOOP
            v_next_pos := INSTR(p_table_list || ',', ',', v_pos);
            IF v_next_pos = 0 THEN
                EXIT;
            END IF;
            
            v_table_name := TRIM(SUBSTR(p_table_list, v_pos, v_next_pos - v_pos));
            IF v_table_name IS NOT NULL THEN
                v_tables.EXTEND;
                v_tables(v_tables.COUNT) := v_table_name;
            END IF;
            
            v_pos := v_next_pos + 1;
        END LOOP;
        
        -- Xuất từng bảng
        FOR i IN 1..v_tables.COUNT LOOP
            DBMS_LOB.APPEND(v_result, export_table_to_md(v_tables(i)));
            
            -- Thêm separator giữa các bảng
            IF i < v_tables.COUNT THEN
                DBMS_LOB.WRITEAPPEND(v_result, 30, CHR(10) || '---' || CHR(10) || CHR(10));
            END IF;
        END LOOP;
        
        RETURN v_result;
    END export_multiple_tables;

    -- Function: Lấy cấu trúc bảng
    FUNCTION get_table_schema(p_table_name IN VARCHAR2) RETURN CLOB IS
        v_result CLOB;
        v_cursor SYS_REFCURSOR;
        v_col_name VARCHAR2(100);
        v_data_type VARCHAR2(100);
        v_data_length NUMBER;
        v_nullable VARCHAR2(5);
        v_line VARCHAR2(4000);
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        v_line := 'CREATE TABLE ' || UPPER(p_table_name) || ' (' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_cursor := get_columns(p_table_name);
        LOOP
            FETCH v_cursor INTO v_col_name, v_data_type, v_data_length, v_nullable;
            EXIT WHEN v_cursor%NOTFOUND;
            
            v_line := '    ' || v_col_name || ' ' || v_data_type;
            IF v_nullable = 'N' THEN
                v_line := v_line || ' NOT NULL';
            END IF;
            v_line := v_line || ',' || CHR(10);
            DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        END LOOP;
        CLOSE v_cursor;
        
        v_line := ');' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        RETURN v_result;
    END get_table_schema;

    -- Function: Lấy 10 dòng dữ liệu mẫu
    FUNCTION get_sample_data(p_table_name IN VARCHAR2) RETURN CLOB IS
    BEGIN
        RETURN get_sample_data_md(p_table_name);
    END get_sample_data;

END RAG_EXPORT_MD;
/

-- =====================================================
-- TẠO VIEW ĐỂ DỄ DÀNG XEM DỮ LIỆU ĐÃ EXPORT
-- =====================================================

CREATE OR REPLACE VIEW V_RAG_DOCS AS
SELECT 
    TABLE_NAME,
    DBMS_LOB.GETLENGTH(DOCUMENT) AS DOC_SIZE,
    EXPORT_DATE
FROM RAG_TABLE_DOCS;

-- =====================================================
-- TẠO FUNCTION ĐỂ LẤY NỘI DUNG DOCUMENT
-- =====================================================

CREATE OR REPLACE FUNCTION get_rag_document(p_table_name VARCHAR2) RETURN CLOB IS
    v_clob CLOB;
BEGIN
    SELECT DOCUMENT INTO v_clob FROM RAG_TABLE_DOCS WHERE TABLE_NAME = UPPER(p_table_name);
    RETURN v_clob;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        DBMS_LOB.CREATETEMPORARY(v_clob, TRUE);
        DBMS_LOB.WRITEAPPEND(v_clob, 50, 'Table ' || UPPER(p_table_name) || ' not found');
        RETURN v_clob;
END get_rag_document;
/

-- =====================================================
-- TẠO PROCEDURE EXPORT ALL TABLES
-- =====================================================

CREATE OR REPLACE PROCEDURE export_all_tables_rag IS
    CURSOR c_tables IS
        SELECT TABLE_NAME 
        FROM USER_TABLES 
        WHERE TABLE_NAME NOT LIKE '%RAG%' 
        AND TABLE_NAME NOT LIKE '%DOC%'
        AND TABLE_NAME NOT LIKE '%TEMP%'
        ORDER BY TABLE_NAME;
BEGIN
    FOR t IN c_tables LOOP
        DBMS_OUTPUT.PUT_LINE('Exporting: ' || t.TABLE_NAME);
        RAG_EXPORT_MD.export_table_to_temp(t.TABLE_NAME);
    END LOOP;
    
    DBMS_OUTPUT.PUT_LINE('✅ All tables exported to RAG_TABLE_DOCS');
    DBMS_OUTPUT.PUT_LINE('📊 Total tables: ' || SQL%ROWCOUNT);
END export_all_tables_rag;
/

-- =====================================================
-- TẠO FUNCTION ĐỂ ĐỊNH DẠNG CÂU HỎI SQL CHO RAG
-- =====================================================

CREATE OR REPLACE FUNCTION format_sql_question(
    p_question IN VARCHAR2,
    p_table_context IN VARCHAR2 DEFAULT NULL
) RETURN CLOB IS
    v_context CLOB;
    v_result CLOB;
    v_chunk VARCHAR2(4000);
BEGIN
    DBMS_LOB.CREATETEMPORARY(v_result, TRUE);

    v_chunk := '# SQL Generation Request' || CHR(10) || CHR(10);
    DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_chunk), v_chunk);

    v_chunk := '## User Question' || CHR(10);
    DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_chunk), v_chunk);

    v_chunk := p_question || CHR(10) || CHR(10);
    DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_chunk), v_chunk);

    IF p_table_context IS NOT NULL THEN
        v_context := get_rag_document(p_table_context);
        v_chunk := '## Table Context' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_chunk), v_chunk);
        DBMS_LOB.APPEND(v_result, v_context);
        v_chunk := CHR(10) || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_chunk), v_chunk);
    END IF;

    v_chunk := '## SQL Generation Instructions' || CHR(10);
    DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_chunk), v_chunk);

    v_chunk := 'Please generate Oracle SQL query based on the question above.' || CHR(10);
    DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_chunk), v_chunk);

    v_chunk := 'Return only valid Oracle SQL statement.' || CHR(10);
    DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_chunk), v_chunk);

    v_chunk := 'Use proper JOINs, WHERE clauses, and handle Vietnamese characters.' || CHR(10);
    DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_chunk), v_chunk);

    RETURN v_result;
END format_sql_question;
/

-- =====================================================
-- TẠO PACKAGE QUẢN LÝ RAG CONTEXT
-- =====================================================

CREATE OR REPLACE PACKAGE RAG_CONTEXT AS
    FUNCTION build_sql_context(
        p_question IN VARCHAR2,
        p_tables IN VARCHAR2 DEFAULT NULL
    ) RETURN CLOB;
    
    FUNCTION auto_detect_tables(p_question IN VARCHAR2) RETURN VARCHAR2;
    
    PROCEDURE export_rag_training_data;
END RAG_CONTEXT;
/

CREATE OR REPLACE PACKAGE BODY RAG_CONTEXT AS

    -- Helper: Lấy comment của bảng và các cột
    FUNCTION get_table_comments(p_table_name VARCHAR2) RETURN CLOB IS
        v_result CLOB;
        v_table_comment VARCHAR2(4000);
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        BEGIN
            SELECT COMMENTS INTO v_table_comment FROM USER_TAB_COMMENTS 
            WHERE TABLE_NAME = UPPER(p_table_name);
            IF v_table_comment IS NOT NULL THEN
                DBMS_LOB.WRITEAPPEND(v_result, LENGTH('Table: ' || UPPER(p_table_name) || ' - ' || v_table_comment || CHR(10)), 
                    'Table: ' || UPPER(p_table_name) || ' - ' || v_table_comment || CHR(10));
            END IF;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            NULL;
        END;
        
        FOR c IN (
            SELECT COLUMN_NAME, COMMENTS 
            FROM USER_COL_COMMENTS 
            WHERE TABLE_NAME = UPPER(p_table_name)
            AND COMMENTS IS NOT NULL
            ORDER BY COLUMN_NAME
        ) LOOP
            DBMS_LOB.WRITEAPPEND(v_result, LENGTH('  - ' || c.COLUMN_NAME || ': ' || c.COMMENTS || CHR(10)), 
                '  - ' || c.COLUMN_NAME || ': ' || c.COMMENTS || CHR(10));
        END LOOP;
        
        RETURN v_result;
    END get_table_comments;

    -- Helper: Lấy tất cả bảng có foreign key tham chiếu đến bảng này - SỬA LỖI TRÀN BỘ ĐỆM
    FUNCTION get_referenced_tables(p_table_name VARCHAR2) RETURN CLOB IS
        v_result CLOB;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        FOR r IN (
            SELECT DISTINCT C.TABLE_NAME
            FROM USER_CONSTRAINTS C
            JOIN USER_CONSTRAINTS P ON C.R_CONSTRAINT_NAME = P.CONSTRAINT_NAME
            WHERE P.TABLE_NAME = UPPER(p_table_name)
            AND C.CONSTRAINT_TYPE = 'R'
        ) LOOP
            IF DBMS_LOB.GETLENGTH(v_result) > 0 THEN
                DBMS_LOB.WRITEAPPEND(v_result, 1, ',');
            END IF;
            DBMS_LOB.WRITEAPPEND(v_result, LENGTH(r.TABLE_NAME), r.TABLE_NAME);
        END LOOP;
        
        RETURN v_result;
    END get_referenced_tables;

    -- Helper: Lấy các bảng mà bảng này tham chiếu đến (bảng cha) - SỬA LỖI TRÀN BỘ ĐỆM
    FUNCTION get_referencing_tables(p_table_name VARCHAR2) RETURN CLOB IS
        v_result CLOB;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        FOR r IN (
            SELECT DISTINCT P.TABLE_NAME
            FROM USER_CONSTRAINTS C
            JOIN USER_CONSTRAINTS P ON C.R_CONSTRAINT_NAME = P.CONSTRAINT_NAME
            WHERE C.TABLE_NAME = UPPER(p_table_name)
            AND C.CONSTRAINT_TYPE = 'R'
        ) LOOP
            IF DBMS_LOB.GETLENGTH(v_result) > 0 THEN
                DBMS_LOB.WRITEAPPEND(v_result, 1, ',');
            END IF;
            DBMS_LOB.WRITEAPPEND(v_result, LENGTH(r.TABLE_NAME), r.TABLE_NAME);
        END LOOP;
        
        RETURN v_result;
    END get_referencing_tables;

    -- Hàm auto_detect_tables - SỬA LỖI TRÀN BỘ ĐỆM
    FUNCTION auto_detect_tables(p_question IN VARCHAR2) RETURN VARCHAR2 IS
        v_result VARCHAR2(32767) := '';  -- Tăng lên tối đa
        v_question_upper VARCHAR2(4000) := UPPER(p_question);
        v_match_score NUMBER := 0;
        v_table_list VARCHAR2(32767) := '';  -- Tăng lên tối đa
        
        CURSOR c_all_tables IS
            SELECT TABLE_NAME 
            FROM USER_TABLES 
            WHERE TABLE_NAME NOT LIKE '%RAG%' 
            AND TABLE_NAME NOT LIKE '%DOC%'
            AND TABLE_NAME NOT LIKE '%TEMP%'
            AND TABLE_NAME NOT LIKE '%VIEW%'
            ORDER BY TABLE_NAME;
            
        CURSOR c_table_info(p_table VARCHAR2) IS
            SELECT 
                tc.COLUMN_NAME,
                tc.DATA_TYPE,
                cc.COMMENTS
            FROM USER_TAB_COLUMNS tc
            LEFT JOIN USER_COL_COMMENTS cc 
                ON tc.TABLE_NAME = cc.TABLE_NAME 
                AND tc.COLUMN_NAME = cc.COLUMN_NAME
            WHERE tc.TABLE_NAME = UPPER(p_table);
            
        v_table_comment VARCHAR2(4000);
        v_ref_tables CLOB;
        v_child_tables CLOB;
        v_ref_text VARCHAR2(32767);
        v_child_text VARCHAR2(32767);
    BEGIN
        FOR t IN c_all_tables LOOP
            v_match_score := 0;
            v_question_upper := UPPER(p_question);
            
            -- 1. Kiểm tra tên bảng
            IF INSTR(v_question_upper, UPPER(REPLACE(t.TABLE_NAME, '_', ' '))) > 0 OR
               INSTR(v_question_upper, UPPER(REPLACE(t.TABLE_NAME, '_', ''))) > 0 THEN
                v_match_score := v_match_score + 100;
            END IF;
            
            -- 2. Lấy comment của bảng
            BEGIN
                SELECT COMMENTS INTO v_table_comment FROM USER_TAB_COMMENTS 
                WHERE TABLE_NAME = UPPER(t.TABLE_NAME);
                
                IF v_table_comment IS NOT NULL THEN
                    FOR word IN (
                        SELECT REGEXP_SUBSTR(v_table_comment, '[^,;:. ]+', 1, LEVEL) as token
                        FROM DUAL
                        CONNECT BY LEVEL <= REGEXP_COUNT(v_table_comment, '[^,;:. ]+')
                    ) LOOP
                        IF LENGTH(word.token) > 2 AND INSTR(v_question_upper, UPPER(word.token)) > 0 THEN
                            v_match_score := v_match_score + 30;
                        END IF;
                    END LOOP;
                END IF;
            EXCEPTION WHEN NO_DATA_FOUND THEN
                NULL;
            END;
            
            -- 3. Kiểm tra comment của các cột
            FOR c IN c_table_info(t.TABLE_NAME) LOOP
                IF LENGTH(c.COLUMN_NAME) > 2 THEN
                    FOR col_word IN (
                        SELECT REGEXP_SUBSTR(
                            REPLACE(REPLACE(c.COLUMN_NAME, '_', ' '), '  ', ' '),
                            '[^ ]+', 1, LEVEL
                        ) as token
                        FROM DUAL
                        CONNECT BY LEVEL <= REGEXP_COUNT(REPLACE(REPLACE(c.COLUMN_NAME, '_', ' '), '  ', ' '), '[^ ]+')
                    ) LOOP
                        IF LENGTH(col_word.token) > 2 AND INSTR(v_question_upper, UPPER(col_word.token)) > 0 THEN
                            v_match_score := v_match_score + 15;
                        END IF;
                    END LOOP;
                END IF;
                
                IF c.COMMENTS IS NOT NULL THEN
                    FOR col_comment_word IN (
                        SELECT REGEXP_SUBSTR(c.COMMENTS, '[^,;:. ]+', 1, LEVEL) as token
                        FROM DUAL
                        CONNECT BY LEVEL <= REGEXP_COUNT(c.COMMENTS, '[^,;:. ]+')
                    ) LOOP
                        IF LENGTH(col_comment_word.token) > 2 AND INSTR(v_question_upper, UPPER(col_comment_word.token)) > 0 THEN
                            v_match_score := v_match_score + 20;
                        END IF;
                    END LOOP;
                END IF;
            END LOOP;
            
            -- 4. Kiểm tra từ khóa đặc biệt
            BEGIN
                IF INSTR(v_question_upper, 'TỔNG') > 0 OR INSTR(v_question_upper, 'SUM') > 0 THEN
                    FOR num_col IN (
                        SELECT COLUMN_NAME FROM USER_TAB_COLUMNS 
                        WHERE TABLE_NAME = UPPER(t.TABLE_NAME)
                        AND DATA_TYPE IN ('NUMBER', 'FLOAT')
                        AND ROWNUM <= 1
                    ) LOOP
                        v_match_score := v_match_score + 10;
                    END LOOP;
                END IF;
                
                IF INSTR(v_question_upper, 'NGÀY') > 0 OR INSTR(v_question_upper, 'DATE') > 0 OR
                   INSTR(v_question_upper, 'THỜI') > 0 OR INSTR(v_question_upper, 'TIME') > 0 THEN
                    FOR date_col IN (
                        SELECT COLUMN_NAME FROM USER_TAB_COLUMNS 
                        WHERE TABLE_NAME = UPPER(t.TABLE_NAME)
                        AND DATA_TYPE IN ('DATE', 'TIMESTAMP')
                        AND ROWNUM <= 1
                    ) LOOP
                        v_match_score := v_match_score + 10;
                    END LOOP;
                END IF;
            END;
            
            -- Thêm vào danh sách kết quả nếu điểm cao
            IF v_match_score >= 20 THEN
                IF v_table_list != '' THEN
                    v_table_list := v_table_list || ',';
                END IF;
                v_table_list := v_table_list || t.TABLE_NAME;
                
                -- Thêm bảng cha
                v_ref_tables := get_referencing_tables(t.TABLE_NAME);
                IF DBMS_LOB.GETLENGTH(v_ref_tables) > 0 THEN
                    v_ref_text := DBMS_LOB.SUBSTR(v_ref_tables, 32767, 1);
                    FOR ref_table IN (
                        SELECT REGEXP_SUBSTR(v_ref_text, '[^,]+', 1, LEVEL) as ref
                        FROM DUAL
                        CONNECT BY LEVEL <= REGEXP_COUNT(v_ref_text, '[^,]+')
                    ) LOOP
                        IF INSTR(v_table_list, ref_table.ref) = 0 THEN
                            v_table_list := v_table_list || ',' || ref_table.ref;
                        END IF;
                    END LOOP;
                END IF;
                
                -- Thêm bảng con
                v_child_tables := get_referenced_tables(t.TABLE_NAME);
                IF DBMS_LOB.GETLENGTH(v_child_tables) > 0 THEN
                    v_child_text := DBMS_LOB.SUBSTR(v_child_tables, 32767, 1);
                    FOR child_table IN (
                        SELECT REGEXP_SUBSTR(v_child_text, '[^,]+', 1, LEVEL) as child
                        FROM DUAL
                        CONNECT BY LEVEL <= REGEXP_COUNT(v_child_text, '[^,]+')
                    ) LOOP
                        IF INSTR(v_table_list, child_table.child) = 0 THEN
                            v_table_list := v_table_list || ',' || child_table.child;
                        END IF;
                    END LOOP;
                END IF;
            END IF;
        END LOOP;
        
        -- Fallback: nếu không tìm thấy
        IF v_table_list IS NULL OR v_table_list = '' THEN
            FOR t IN c_all_tables LOOP
                BEGIN
                    SELECT COMMENTS INTO v_table_comment FROM USER_TAB_COMMENTS 
                    WHERE TABLE_NAME = UPPER(t.TABLE_NAME);
                    IF v_table_list != '' THEN
                        v_table_list := v_table_list || ',';
                    END IF;
                    v_table_list := v_table_list || t.TABLE_NAME;
                EXCEPTION WHEN NO_DATA_FOUND THEN
                    NULL;
                END;
            END LOOP;
            
            IF v_table_list IS NULL OR v_table_list = '' THEN
                FOR t IN c_all_tables LOOP
                    IF v_table_list != '' THEN
                        v_table_list := v_table_list || ',';
                    END IF;
                    v_table_list := v_table_list || t.TABLE_NAME;
                END LOOP;
            END IF;
        END IF;
        
        RETURN v_table_list;
    END auto_detect_tables;

    -- Function build_sql_context
    FUNCTION build_sql_context(
        p_question IN VARCHAR2,
        p_tables IN VARCHAR2 DEFAULT NULL
    ) RETURN CLOB IS
        v_tables VARCHAR2(32767);
        v_result CLOB;
        v_context CLOB;
    BEGIN
        IF p_tables IS NULL THEN
            v_tables := auto_detect_tables(p_question);
        ELSE
            v_tables := p_tables;
        END IF;
        
        v_result := format_sql_question(p_question, NULL);
        
        DECLARE
            v_table_list SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST();
            v_pos NUMBER := 1;
            v_next_pos NUMBER;
            v_table_name VARCHAR2(100);
        BEGIN
            LOOP
                v_next_pos := INSTR(v_tables || ',', ',', v_pos);
                IF v_next_pos = 0 THEN
                    EXIT;
                END IF;
                
                v_table_name := TRIM(SUBSTR(v_tables, v_pos, v_next_pos - v_pos));
                IF v_table_name IS NOT NULL THEN
                    v_table_list.EXTEND;
                    v_table_list(v_table_list.COUNT) := v_table_name;
                END IF;
                
                v_pos := v_next_pos + 1;
            END LOOP;
            
            FOR i IN 1..v_table_list.COUNT LOOP
                v_context := get_rag_document(v_table_list(i));
                DBMS_LOB.APPEND(v_result, v_context);
                DBMS_LOB.WRITEAPPEND(v_result, 2, CHR(10) || CHR(10));
            END LOOP;
        END;
        
        RETURN v_result;
    END build_sql_context;

    PROCEDURE export_rag_training_data IS
        CURSOR c_tables IS
            SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME NOT LIKE '%RAG%';
        v_counter NUMBER := 0;
    BEGIN
        FOR t IN c_tables LOOP
            v_counter := v_counter + 1;
            RAG_EXPORT_MD.export_table_to_temp(t.TABLE_NAME);
        END LOOP;
        
        DBMS_OUTPUT.PUT_LINE('✅ RAG training data exported successfully');
        DBMS_OUTPUT.PUT_LINE('📊 Total tables exported: ' || v_counter);
    END export_rag_training_data;

END RAG_CONTEXT;
/

/*
-- =====================================================
-- SQL XÓA TOÀN BỘ ĐỐI TƯỢNG RAG
-- =====================================================

-- 1. Xóa các PACKAGE
DROP PACKAGE RAG_EXPORT_MD;
DROP PACKAGE RAG_CONTEXT;

-- 2. Xóa các PROCEDURE
DROP PROCEDURE EXPORT_ALL_TABLES_RAG;

-- 3. Xóa các FUNCTION
DROP FUNCTION FORMAT_SQL_QUESTION;
DROP FUNCTION GET_RAG_DOCUMENT;

-- 4. Xóa VIEW
DROP VIEW V_RAG_DOCS;

-- 5. Xóa TABLE
DROP TABLE RAG_TABLE_DOCS;

-- =====================================================
-- KIỂM TRA XÓA (TÙY CHỌN)
-- =====================================================

-- Kiểm tra các đối tượng còn tồn tại
SELECT OBJECT_NAME, OBJECT_TYPE 
FROM USER_OBJECTS 
WHERE OBJECT_NAME IN (
    'RAG_EXPORT_MD', 'RAG_CONTEXT',
    'EXPORT_ALL_TABLES_RAG',
    'FORMAT_SQL_QUESTION', 'GET_RAG_DOCUMENT',
    'V_RAG_DOCS', 'RAG_TABLE_DOCS'
)
ORDER BY OBJECT_TYPE, OBJECT_NAME;

-- =====================================================
-- XÓA TOÀN BỘ ĐỐI TƯỢNG CÓ TÊN CHỨA 'RAG' (CẨN THẬN!)
-- =====================================================

/*
-- WARNING: Script này sẽ xóa TẤT CẢ các đối tượng có tên chứa 'RAG'
-- Chỉ sử dụng khi bạn chắc chắn muốn xóa tất cả
BEGIN
    FOR obj IN (
        SELECT OBJECT_NAME, OBJECT_TYPE 
        FROM USER_OBJECTS 
        WHERE OBJECT_NAME LIKE '%RAG%'
        AND OBJECT_TYPE IN ('PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION', 'VIEW', 'TABLE')
        AND OBJECT_NAME NOT LIKE '%%'  -- Thêm điều kiện bảo vệ nếu cần
    ) LOOP
        EXECUTE IMMEDIATE 'DROP ' || obj.OBJECT_TYPE || ' ' || obj.OBJECT_NAME;
        DBMS_OUTPUT.PUT_LINE('Dropped: ' || obj.OBJECT_TYPE || ' ' || obj.OBJECT_NAME);
    END LOOP;
END;
/
*/

-- =====================================================
-- XÓA TẤT CẢ (BAO GỒM CẢ PACKAGE BODY)
-- =====================================================

/*
-- Xóa cả PACKAGE BODY
DROP PACKAGE BODY RAG_EXPORT_MD;
DROP PACKAGE BODY RAG_CONTEXT;
*/
*/
