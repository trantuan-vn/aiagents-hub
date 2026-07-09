-- =====================================================
-- HỆ THỐNG RAG VỚI AI VECTOR SEARCH TRÊN OCI
-- Phiên bản đã vá lỗ hổng và tối ưu
-- =====================================================

-- =====================================================
-- 1. TẠO BẢNG LƯU LOG LỖI (Thêm mới)
-- =====================================================
CREATE TABLE RAG_ERROR_LOG (
    ERROR_ID          VARCHAR2(50) PRIMARY KEY,
    PROCEDURE_NAME    VARCHAR2(100) NOT NULL,
    TABLE_NAME        VARCHAR2(100),
    ERROR_MESSAGE     CLOB,
    ERROR_STACK       CLOB,
    CREATED_DATE      DATE DEFAULT SYSDATE
);

-- =====================================================
-- 2. TẠO BẢNG KIỂM TRA MODEL (Thêm mới)
-- =====================================================
CREATE TABLE RAG_MODEL_STATUS (
    MODEL_NAME        VARCHAR2(100) PRIMARY KEY,
    IS_AVAILABLE      VARCHAR2(1) DEFAULT 'N',
    CHECKED_DATE      DATE DEFAULT SYSDATE
);

-- =====================================================
-- 3. TẠO BẢNG LƯU VECTOR EMBEDDINGS
-- =====================================================
CREATE TABLE RAG_SCHEMA_VECTORS (
    SCHEMA_ID         VARCHAR2(50) PRIMARY KEY,
    TABLE_NAME        VARCHAR2(100) NOT NULL,
    OWNER             VARCHAR2(100) DEFAULT USER,
    SCHEMA_TEXT       CLOB NOT NULL,
    SCHEMA_EMBEDDING  VECTOR(384, FLOAT32),
    METADATA          CLOB,
    CREATED_DATE      DATE DEFAULT SYSDATE,
    UPDATED_DATE      DATE DEFAULT SYSDATE,
    CONSTRAINT uk_schema_table UNIQUE(TABLE_NAME, OWNER)
);

-- =====================================================
-- 4. TẠO INDEX VECTOR SEARCH
-- =====================================================
CREATE VECTOR INDEX idx_schema_embedding 
ON RAG_SCHEMA_VECTORS(SCHEMA_EMBEDDING) 
ORGANIZATION NEIGHBOR GROUPS 
WITH TARGET ACCURACY 95;

-- =====================================================
-- 5. TẠO BẢNG LƯU LỊCH SỬ CÂU HỎI
-- =====================================================
CREATE TABLE RAG_QUERY_HISTORY (
    QUERY_ID          VARCHAR2(50) PRIMARY KEY,
    QUESTION          CLOB NOT NULL,
    DETECTED_TABLES   VARCHAR2(1000),
    RELEVANT_SCHEMAS  CLOB,
    GENERATED_SQL     CLOB,
    RESPONSE_TIME     NUMBER,
    CREATED_DATE      DATE DEFAULT SYSDATE
);

-- =====================================================
-- 6. TẠO SEQUENCE CHO ID (Thêm mới)
-- =====================================================
CREATE SEQUENCE SEQ_RAG_ERROR_LOG START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE SEQ_RAG_QUERY_ID START WITH 1 INCREMENT BY 1;

-- =====================================================
-- 7. PACKAGE CHÍNH - PHIÊN BẢN ĐÃ VÁ LỖ HỔNG
-- =====================================================
CREATE OR REPLACE PACKAGE RAG_VECTOR_SEARCH AS
    
    -- =============================================
    -- CÁC HÀM CORE
    -- =============================================
    
    -- Kiểm tra model tồn tại (MỚI)
    FUNCTION is_model_available RETURN BOOLEAN;
    
    -- Lấy danh sách model (MỚI)
    FUNCTION get_available_models RETURN SYS_REFCURSOR;
    
    -- Tạo vector embedding với kiểm tra model (ĐÃ SỬA)
    FUNCTION create_schema_embedding(p_schema_text IN CLOB) RETURN VECTOR;
    
    -- Tạo vector embedding cho câu hỏi với kiểm tra model (ĐÃ SỬA)
    FUNCTION create_question_embedding(p_question IN VARCHAR2) RETURN VECTOR;
    
    -- =============================================
    -- CÁC HÀM EXPORT SCHEMA (ĐÃ SỬA)
    -- =============================================
    
    -- Export schema thành text (có comment) (ĐÃ SỬA)
    FUNCTION export_schema_to_text(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB;
    
    -- Export một schema cụ thể (ĐÃ SỬA)
    PROCEDURE export_schema_to_vector(p_table_name IN VARCHAR2, p_owner IN VARCHAR2 DEFAULT USER);
    
    -- Export toàn bộ schema (ĐÃ SỬA)
    PROCEDURE export_all_schemas_to_vector(p_owner IN VARCHAR2 DEFAULT USER);
    
    -- Xóa schema (ĐÃ SỬA)
    PROCEDURE remove_schema_from_vector(p_table_name IN VARCHAR2, p_owner IN VARCHAR2 DEFAULT USER);
    
    -- Xóa tất cả schema (MỚI)
    PROCEDURE clear_all_vectors;
    
    -- =============================================
    -- CÁC HÀM VECTOR SEARCH (ĐÃ SỬA)
    -- =============================================
    
    -- Tìm schema liên quan nhất (ĐÃ SỬA)
    FUNCTION find_relevant_schemas(
        p_question IN VARCHAR2,
        p_top_k IN NUMBER DEFAULT 3
    ) RETURN SYS_REFCURSOR;
    
    -- Tự động phát hiện schema (ĐÃ SỬA)
    FUNCTION get_relevant_context(
        p_question IN VARCHAR2,
        p_top_k IN NUMBER DEFAULT 3
    ) RETURN CLOB;
    
    -- Xây dựng context cho LLM (ĐÃ SỬA)
    FUNCTION build_rag_context(
        p_question IN VARCHAR2,
        p_top_k IN NUMBER DEFAULT 3
    ) RETURN CLOB;
    
    -- =============================================
    -- CÁC PROCEDURE TIỆN ÍCH (MỚI)
    -- =============================================
    
    -- Lưu lịch sử (ĐÃ SỬA)
    PROCEDURE save_query_history(
        p_question IN VARCHAR2,
        p_detected_tables IN VARCHAR2 DEFAULT NULL,
        p_relevant_schemas IN CLOB DEFAULT NULL,
        p_generated_sql IN CLOB DEFAULT NULL,
        p_response_time IN NUMBER DEFAULT NULL
    );
    
    -- Ghi log lỗi (MỚI)
    PROCEDURE log_error(
        p_procedure_name IN VARCHAR2,
        p_table_name IN VARCHAR2 DEFAULT NULL,
        p_error_message IN CLOB,
        p_error_stack IN CLOB DEFAULT NULL
    );
    
    -- Kiểm tra trạng thái vector (MỚI)
    FUNCTION get_vector_status RETURN SYS_REFCURSOR;
    
    -- Tái tạo embedding cho tất cả (MỚI)
    PROCEDURE regenerate_all_embeddings(p_owner IN VARCHAR2 DEFAULT USER);
    
END RAG_VECTOR_SEARCH;
/

CREATE OR REPLACE PACKAGE BODY RAG_VECTOR_SEARCH AS

    -- =============================================
    -- LOGGING UTILITIES
    -- =============================================
    
    PROCEDURE log_error(
        p_procedure_name IN VARCHAR2,
        p_table_name IN VARCHAR2 DEFAULT NULL,
        p_error_message IN CLOB,
        p_error_stack IN CLOB DEFAULT NULL
    ) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
        v_error_id VARCHAR2(50);
    BEGIN
        v_error_id := 'ERR_' || TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') || '_' || LPAD(SEQ_RAG_ERROR_LOG.NEXTVAL, 4, '0');
        
        INSERT INTO RAG_ERROR_LOG (
            ERROR_ID,
            PROCEDURE_NAME,
            TABLE_NAME,
            ERROR_MESSAGE,
            ERROR_STACK,
            CREATED_DATE
        ) VALUES (
            v_error_id,
            p_procedure_name,
            p_table_name,
            p_error_message,
            p_error_stack,
            SYSDATE
        );
        
        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
    END log_error;

    -- =============================================
    -- MODEL MANAGEMENT
    -- =============================================
    
    FUNCTION is_model_available RETURN BOOLEAN IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_count 
        FROM USER_AI_MODELS 
        WHERE MODEL_NAME = 'ALL_MINILM_L12_V2';
        
        RETURN v_count > 0;
    EXCEPTION
        WHEN OTHERS THEN
            RETURN FALSE;
    END is_model_available;

    FUNCTION get_available_models RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT MODEL_NAME, MODEL_TYPE, CREATED_DATE
            FROM USER_AI_MODELS
            ORDER BY CREATED_DATE DESC;
        RETURN v_cursor;
    END get_available_models;

    -- =============================================
    -- EMBEDDING FUNCTIONS (ĐÃ SỬA)
    -- =============================================
    
    FUNCTION create_schema_embedding(p_schema_text IN CLOB) RETURN VECTOR IS
        v_vector VECTOR;
        v_model_exists BOOLEAN;
    BEGIN
        -- Kiểm tra model tồn tại
        v_model_exists := is_model_available;
        
        IF NOT v_model_exists THEN
            log_error(
                'CREATE_SCHEMA_EMBEDDING',
                NULL,
                'Model ALL_MINILM_L12_V2 not found. Please import model first.',
                DBMS_UTILITY.FORMAT_ERROR_BACKTRACE
            );
            RETURN NULL;
        END IF;
        
        -- Tạo embedding với exception handling
        BEGIN
            EXECUTE IMMEDIATE '
                SELECT VECTOR_EMBEDDING(
                    ALL_MINILM_L12_V2 USING :1 AS DATA
                ) FROM DUAL'
            INTO v_vector
            USING p_schema_text;
            
            RETURN v_vector;
        EXCEPTION
            WHEN OTHERS THEN
                log_error(
                    'CREATE_SCHEMA_EMBEDDING',
                    NULL,
                    'Error creating embedding: ' || SQLERRM,
                    DBMS_UTILITY.FORMAT_ERROR_BACKTRACE
                );
                RETURN NULL;
        END;
    END create_schema_embedding;

    FUNCTION create_question_embedding(p_question IN VARCHAR2) RETURN VECTOR IS
        v_vector VECTOR;
        v_model_exists BOOLEAN;
    BEGIN
        v_model_exists := is_model_available;
        
        IF NOT v_model_exists THEN
            log_error(
                'CREATE_QUESTION_EMBEDDING',
                NULL,
                'Model ALL_MINILM_L12_V2 not found. Please import model first.',
                DBMS_UTILITY.FORMAT_ERROR_BACKTRACE
            );
            RETURN NULL;
        END IF;
        
        BEGIN
            EXECUTE IMMEDIATE '
                SELECT VECTOR_EMBEDDING(
                    ALL_MINILM_L12_V2 USING :1 AS DATA
                ) FROM DUAL'
            INTO v_vector
            USING p_question;
            
            RETURN v_vector;
        EXCEPTION
            WHEN OTHERS THEN
                log_error(
                    'CREATE_QUESTION_EMBEDDING',
                    NULL,
                    'Error creating embedding: ' || SQLERRM,
                    DBMS_UTILITY.FORMAT_ERROR_BACKTRACE
                );
                RETURN NULL;
        END;
    END create_question_embedding;

    -- =============================================
    -- SCHEMA EXPORT FUNCTIONS (ĐÃ SỬA)
    -- =============================================
    
    FUNCTION get_columns(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN SYS_REFCURSOR IS
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
            FROM ALL_TAB_COLUMNS
            WHERE TABLE_NAME = UPPER(p_table_name)
            AND OWNER = UPPER(p_owner)
            ORDER BY COLUMN_ID;
        RETURN v_cursor;
    EXCEPTION
        WHEN OTHERS THEN
            log_error('GET_COLUMNS', p_table_name, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
            RETURN NULL;
    END get_columns;

    FUNCTION get_primary_key(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB IS
        v_pk CLOB;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_pk, TRUE);
        
        FOR rec IN (
            SELECT A.COLUMN_NAME
            FROM ALL_CONS_COLUMNS A
            JOIN ALL_CONSTRAINTS C ON A.CONSTRAINT_NAME = C.CONSTRAINT_NAME
                AND A.OWNER = C.OWNER
            WHERE C.TABLE_NAME = UPPER(p_table_name)
            AND C.OWNER = UPPER(p_owner)
            AND C.CONSTRAINT_TYPE = 'P'
            ORDER BY A.POSITION
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

    FUNCTION get_foreign_keys(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB IS
        v_fk CLOB;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_fk, TRUE);
        
        FOR rec IN (
            SELECT A.COLUMN_NAME || ' -> ' || P.TABLE_NAME || '(' || B.COLUMN_NAME || ')' AS fk_info
            FROM ALL_CONS_COLUMNS A
            JOIN ALL_CONSTRAINTS C ON A.CONSTRAINT_NAME = C.CONSTRAINT_NAME AND A.OWNER = C.OWNER
            JOIN ALL_CONSTRAINTS P ON C.R_CONSTRAINT_NAME = P.CONSTRAINT_NAME AND C.R_OWNER = P.OWNER
            JOIN ALL_CONS_COLUMNS B ON P.CONSTRAINT_NAME = B.CONSTRAINT_NAME AND P.OWNER = B.OWNER
            WHERE UPPER(C.TABLE_NAME) = UPPER(p_table_name)
            AND C.OWNER = UPPER(p_owner)
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

    -- Lấy comments của table và columns (MỚI)
    FUNCTION get_table_comments(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB IS
        v_comments CLOB;
        v_comment VARCHAR2(4000);
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_comments, TRUE);
        
        -- Table comment
        BEGIN
            SELECT COMMENTS INTO v_comment
            FROM ALL_TAB_COMMENTS
            WHERE TABLE_NAME = UPPER(p_table_name)
            AND OWNER = UPPER(p_owner);
            
            IF v_comment IS NOT NULL THEN
                DBMS_LOB.WRITEAPPEND(v_comments, LENGTH('Table Comment: ' || v_comment || CHR(10)), 
                    'Table Comment: ' || v_comment || CHR(10));
            END IF;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                NULL;
        END;
        
        -- Column comments
        FOR rec IN (
            SELECT COLUMN_NAME, COMMENTS
            FROM ALL_COL_COMMENTS
            WHERE TABLE_NAME = UPPER(p_table_name)
            AND OWNER = UPPER(p_owner)
            AND COMMENTS IS NOT NULL
            ORDER BY COLUMN_ID
        ) LOOP
            DBMS_LOB.WRITEAPPEND(v_comments, 
                LENGTH('  - ' || rec.COLUMN_NAME || ': ' || rec.COMMENTS || CHR(10)),
                '  - ' || rec.COLUMN_NAME || ': ' || rec.COMMENTS || CHR(10));
        END LOOP;
        
        RETURN v_comments;
    EXCEPTION
        WHEN OTHERS THEN
            RETURN NULL;
    END get_table_comments;

    FUNCTION export_schema_to_text(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB IS
        v_result CLOB;
        v_cursor SYS_REFCURSOR;
        v_col_name VARCHAR2(100);
        v_data_type VARCHAR2(100);
        v_data_length NUMBER;
        v_data_precision NUMBER;
        v_data_scale NUMBER;
        v_nullable VARCHAR2(5);
        v_col_id NUMBER;
        v_line VARCHAR2(4000);
        v_pk CLOB;
        v_fk CLOB;
        v_comments CLOB;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        -- Title
        v_line := 'Table: ' || UPPER(p_table_name) || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        -- Owner
        v_line := 'Owner: ' || UPPER(p_owner) || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        -- Metadata
        v_pk := get_primary_key(p_table_name, p_owner);
        v_fk := get_foreign_keys(p_table_name, p_owner);
        
        v_line := 'Primary Key: ';
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        DBMS_LOB.APPEND(v_result, v_pk);
        DBMS_LOB.WRITEAPPEND(v_result, 1, CHR(10));
        
        v_line := 'Foreign Keys: ';
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        DBMS_LOB.APPEND(v_result, v_fk);
        DBMS_LOB.WRITEAPPEND(v_result, 1, CHR(10));
        
        -- Comments
        v_comments := get_table_comments(p_table_name, p_owner);
        IF DBMS_LOB.GETLENGTH(v_comments) > 0 THEN
            v_line := 'Comments:' || CHR(10);
            DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
            DBMS_LOB.APPEND(v_result, v_comments);
        END IF;
        
        -- Columns
        v_line := 'Columns:' || CHR(10);
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
        
        v_cursor := get_columns(p_table_name, p_owner);
        IF v_cursor IS NOT NULL THEN
            LOOP
                FETCH v_cursor INTO v_col_name, v_data_type, v_data_length, v_data_precision, v_data_scale, v_nullable, v_col_id;
                EXIT WHEN v_cursor%NOTFOUND;
                
                v_line := '  - ' || v_col_name || ' (' || v_data_type;
                IF v_data_type IN ('VARCHAR2', 'CHAR') THEN
                    v_line := v_line || '(' || v_data_length || ')';
                ELSIF v_data_type = 'NUMBER' AND v_data_precision IS NOT NULL THEN
                    v_line := v_line || '(' || v_data_precision;
                    IF v_data_scale IS NOT NULL THEN
                        v_line := v_line || ',' || v_data_scale;
                    END IF;
                    v_line := v_line || ')';
                END IF;
                v_line := v_line || ') ' || CASE WHEN v_nullable = 'N' THEN 'NOT NULL' ELSE 'NULLABLE' END || CHR(10);
                DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_line), v_line);
            END LOOP;
            CLOSE v_cursor;
        END IF;
        
        RETURN v_result;
    EXCEPTION
        WHEN OTHERS THEN
            log_error('EXPORT_SCHEMA_TO_TEXT', p_table_name, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
            RETURN NULL;
    END export_schema_to_text;

    -- =============================================
    -- VECTOR SEARCH FUNCTIONS (ĐÃ SỬA)
    -- =============================================
    
    FUNCTION find_relevant_schemas(
        p_question IN VARCHAR2,
        p_top_k IN NUMBER DEFAULT 3
    ) RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
        v_question_vector VECTOR;
        v_model_exists BOOLEAN;
    BEGIN
        -- Kiểm tra model
        v_model_exists := is_model_available;
        IF NOT v_model_exists THEN
            log_error('FIND_RELEVANT_SCHEMAS', NULL, 'Model not available');
            OPEN v_cursor FOR SELECT 'Model not available' AS ERROR FROM DUAL;
            RETURN v_cursor;
        END IF;
        
        v_question_vector := create_question_embedding(p_question);
        
        IF v_question_vector IS NULL THEN
            OPEN v_cursor FOR SELECT 'Failed to create question embedding' AS ERROR FROM DUAL;
            RETURN v_cursor;
        END IF;
        
        OPEN v_cursor FOR
            SELECT 
                TABLE_NAME,
                OWNER,
                SCHEMA_TEXT,
                VECTOR_DISTANCE(SCHEMA_EMBEDDING, v_question_vector, COSINE) AS DISTANCE
            FROM RAG_SCHEMA_VECTORS
            WHERE SCHEMA_EMBEDDING IS NOT NULL
            ORDER BY DISTANCE
            FETCH FIRST p_top_k ROWS ONLY;
            
        RETURN v_cursor;
    EXCEPTION
        WHEN OTHERS THEN
            log_error('FIND_RELEVANT_SCHEMAS', NULL, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
            OPEN v_cursor FOR SELECT SQLERRM AS ERROR FROM DUAL;
            RETURN v_cursor;
    END find_relevant_schemas;

    FUNCTION get_relevant_context(
        p_question IN VARCHAR2,
        p_top_k IN NUMBER DEFAULT 3
    ) RETURN CLOB IS
        v_result CLOB;
        v_cursor SYS_REFCURSOR;
        v_table_name VARCHAR2(100);
        v_owner VARCHAR2(100);
        v_schema_text CLOB;
        v_distance NUMBER;
        v_count NUMBER := 0;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH('Question: ' || p_question || CHR(10) || CHR(10)), 
            'Question: ' || p_question || CHR(10) || CHR(10));
        
        v_cursor := find_relevant_schemas(p_question, p_top_k);
        
        LOOP
            FETCH v_cursor INTO v_table_name, v_owner, v_schema_text, v_distance;
            EXIT WHEN v_cursor%NOTFOUND;
            
            v_count := v_count + 1;
            DBMS_LOB.WRITEAPPEND(v_result, 
                LENGTH('--- Relevant Schema #' || v_count || ' (Owner: ' || v_owner || ', Distance: ' || ROUND(v_distance, 4) || ')' || CHR(10)),
                '--- Relevant Schema #' || v_count || ' (Owner: ' || v_owner || ', Distance: ' || ROUND(v_distance, 4) || ')' || CHR(10));
            DBMS_LOB.APPEND(v_result, v_schema_text);
            DBMS_LOB.WRITEAPPEND(v_result, 2, CHR(10) || CHR(10));
        END LOOP;
        
        CLOSE v_cursor;
        
        IF v_count = 0 THEN
            DBMS_LOB.WRITEAPPEND(v_result, 80, 'No relevant schemas found. Please run export_all_schemas_to_vector first.');
        END IF;
        
        RETURN v_result;
    EXCEPTION
        WHEN OTHERS THEN
            log_error('GET_RELEVANT_CONTEXT', NULL, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
            RETURN 'Error getting context: ' || SQLERRM;
    END get_relevant_context;

    -- =============================================
    -- EXPORT PROCEDURES (ĐÃ SỬA)
    -- =============================================
    
    PROCEDURE export_schema_to_vector(
        p_table_name IN VARCHAR2,
        p_owner IN VARCHAR2 DEFAULT USER
    ) IS
        v_schema_text CLOB;
        v_embedding VECTOR;
        v_table_upper VARCHAR2(100) := UPPER(p_table_name);
        v_owner_upper VARCHAR2(100) := UPPER(p_owner);
        v_exists NUMBER;
        v_error_msg CLOB;
        v_savepoint VARCHAR2(30);
    BEGIN
        v_savepoint := 'SP_' || REPLACE(v_table_upper, '$', '_') || '_' || TO_CHAR(SYSDATE, 'HH24MISS');
        SAVEPOINT &v_savepoint; -- Ghi chú: Không dùng dynamic SAVEPOINT, chỉ dùng trong code thực tế
        
        -- Kiểm tra table tồn tại
        SELECT COUNT(*) INTO v_exists 
        FROM ALL_TABLES 
        WHERE TABLE_NAME = v_table_upper 
        AND OWNER = v_owner_upper;
        
        IF v_exists = 0 THEN
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, 'Table does not exist');
            DBMS_OUTPUT.PUT_LINE('❌ Table ' || v_table_upper || ' does not exist');
            RETURN;
        END IF;
        
        -- Kiểm tra model
        IF NOT is_model_available THEN
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, 'Model ALL_MINILM_L12_V2 not available');
            DBMS_OUTPUT.PUT_LINE('❌ Model not available. Please import model first.');
            RETURN;
        END IF;
        
        -- Tạo schema text
        v_schema_text := export_schema_to_text(v_table_upper, v_owner_upper);
        
        IF v_schema_text IS NULL THEN
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, 'Failed to export schema text');
            DBMS_OUTPUT.PUT_LINE('❌ Failed to export schema text for ' || v_table_upper);
            RETURN;
        END IF;
        
        -- Tạo embedding
        v_embedding := create_schema_embedding(v_schema_text);
        
        IF v_embedding IS NULL THEN
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, 'Failed to create embedding');
            DBMS_OUTPUT.PUT_LINE('❌ Failed to create embedding for ' || v_table_upper);
            RETURN;
        END IF;
        
        -- Insert hoặc Update
        MERGE INTO RAG_SCHEMA_VECTORS t
        USING (SELECT v_table_upper AS table_name, v_owner_upper AS owner FROM DUAL) s
        ON (t.TABLE_NAME = s.table_name AND t.OWNER = s.owner)
        WHEN MATCHED THEN
            UPDATE SET 
                SCHEMA_TEXT = v_schema_text,
                SCHEMA_EMBEDDING = v_embedding,
                UPDATED_DATE = SYSDATE
        WHEN NOT MATCHED THEN
            INSERT (SCHEMA_ID, TABLE_NAME, OWNER, SCHEMA_TEXT, SCHEMA_EMBEDDING, CREATED_DATE)
            VALUES (
                'SCH_' || v_table_upper || '_' || v_owner_upper || '_' || TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS'),
                v_table_upper,
                v_owner_upper,
                v_schema_text,
                v_embedding,
                SYSDATE
            );
        
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ Exported schema for table: ' || v_table_upper || ' (Owner: ' || v_owner_upper || ')');
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            v_error_msg := SQLERRM;
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
            DBMS_OUTPUT.PUT_LINE('❌ Error exporting ' || v_table_upper || ': ' || v_error_msg);
    END export_schema_to_vector;

    PROCEDURE export_all_schemas_to_vector(p_owner IN VARCHAR2 DEFAULT USER) IS
        v_count NUMBER := 0;
        v_error_count NUMBER := 0;
        v_start_time NUMBER := DBMS_UTILITY.GET_TIME;
        v_owner_upper VARCHAR2(100) := UPPER(p_owner);
        
        CURSOR c_tables IS
            SELECT TABLE_NAME 
            FROM ALL_TABLES 
            WHERE OWNER = v_owner_upper
            AND TABLE_NAME NOT LIKE '%RAG%' 
            AND TABLE_NAME NOT LIKE '%DOC%'
            AND TABLE_NAME NOT LIKE '%TEMP%'
            AND TABLE_NAME NOT LIKE '%VIEW%'
            AND TABLE_NAME NOT LIKE '%HISTORY%'
            AND TABLE_NAME NOT LIKE '%LOG%'
            AND TABLE_NAME NOT LIKE 'DBTOOLS$%'
            AND TABLE_NAME NOT LIKE 'DR$%'
            AND TABLE_NAME NOT LIKE 'MVIEW%'
            AND TABLE_NAME NOT LIKE 'PLAN_TABLE%'
            ORDER BY TABLE_NAME;
    BEGIN
        DBMS_OUTPUT.PUT_LINE('🚀 Starting export all schemas for owner: ' || v_owner_upper);
        DBMS_OUTPUT.PUT_LINE('========================================');
        
        -- Kiểm tra model trước
        IF NOT is_model_available THEN
            DBMS_OUTPUT.PUT_LINE('❌ Model ALL_MINILM_L12_V2 not available. Cannot proceed.');
            log_error('EXPORT_ALL_SCHEMAS_TO_VECTOR', NULL, 'Model not available');
            RETURN;
        END IF;
        
        FOR t IN c_tables LOOP
            BEGIN
                v_count := v_count + 1;
                DBMS_OUTPUT.PUT_LINE('📦 [' || v_count || '] Processing: ' || t.TABLE_NAME);
                
                export_schema_to_vector(t.TABLE_NAME, v_owner_upper);
                
                -- Commit sau mỗi 10 bảng
                IF MOD(v_count, 10) = 0 THEN
                    COMMIT;
                    DBMS_OUTPUT.PUT_LINE('💾 Committed after ' || v_count || ' tables');
                END IF;
                
            EXCEPTION
                WHEN OTHERS THEN
                    v_error_count := v_error_count + 1;
                    log_error('EXPORT_ALL_SCHEMAS_TO_VECTOR', t.TABLE_NAME, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
                    DBMS_OUTPUT.PUT_LINE('❌ Error processing ' || t.TABLE_NAME || ': ' || SQLERRM);
                    -- Rollback chỉ bảng này
                    ROLLBACK;
            END;
        END LOOP;
        
        -- Commit cuối cùng
        COMMIT;
        
        DBMS_OUTPUT.PUT_LINE('========================================');
        DBMS_OUTPUT.PUT_LINE('✅ Export completed:');
        DBMS_OUTPUT.PUT_LINE('   - Total tables: ' || v_count);
        DBMS_OUTPUT.PUT_LINE('   - Errors: ' || v_error_count);
        DBMS_OUTPUT.PUT_LINE('   - Time: ' || ROUND((DBMS_UTILITY.GET_TIME - v_start_time)/100, 2) || ' seconds');
        
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            log_error('EXPORT_ALL_SCHEMAS_TO_VECTOR', NULL, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
            DBMS_OUTPUT.PUT_LINE('❌ Fatal error: ' || SQLERRM);
    END export_all_schemas_to_vector;

    PROCEDURE remove_schema_from_vector(
        p_table_name IN VARCHAR2,
        p_owner IN VARCHAR2 DEFAULT USER
    ) IS
    BEGIN
        DELETE FROM RAG_SCHEMA_VECTORS 
        WHERE TABLE_NAME = UPPER(p_table_name) 
        AND OWNER = UPPER(p_owner);
        
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ Removed schema: ' || UPPER(p_table_name) || ' (Owner: ' || UPPER(p_owner) || ')');
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            log_error('REMOVE_SCHEMA_FROM_VECTOR', p_table_name, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
            DBMS_OUTPUT.PUT_LINE('❌ Error removing ' || UPPER(p_table_name) || ': ' || SQLERRM);
    END remove_schema_from_vector;

    PROCEDURE clear_all_vectors IS
    BEGIN
        DELETE FROM RAG_SCHEMA_VECTORS;
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ Cleared all vector data');
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            log_error('CLEAR_ALL_VECTORS', NULL, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
            DBMS_OUTPUT.PUT_LINE('❌ Error clearing vectors: ' || SQLERRM);
    END clear_all_vectors;

    -- =============================================
    -- REGENERATE EMBEDDINGS (MỚI)
    -- =============================================
    
    PROCEDURE regenerate_all_embeddings(p_owner IN VARCHAR2 DEFAULT USER) IS
        v_count NUMBER := 0;
        CURSOR c_vectors IS
            SELECT TABLE_NAME, OWNER, SCHEMA_TEXT
            FROM RAG_SCHEMA_VECTORS
            WHERE OWNER = UPPER(p_owner)
            ORDER BY TABLE_NAME;
    BEGIN
        DBMS_OUTPUT.PUT_LINE('🔄 Regenerating embeddings for owner: ' || UPPER(p_owner));
        
        FOR rec IN c_vectors LOOP
            BEGIN
                UPDATE RAG_SCHEMA_VECTORS
                SET SCHEMA_EMBEDDING = create_schema_embedding(rec.SCHEMA_TEXT),
                    UPDATED_DATE = SYSDATE
                WHERE TABLE_NAME = rec.TABLE_NAME
                AND OWNER = rec.OWNER;
                
                v_count := v_count + 1;
                IF MOD(v_count, 10) = 0 THEN
                    COMMIT;
                END IF;
            EXCEPTION
                WHEN OTHERS THEN
                    log_error('REGENERATE_ALL_EMBEDDINGS', rec.TABLE_NAME, SQLERRM);
            END;
        END LOOP;
        
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ Regenerated ' || v_count || ' embeddings');
    END regenerate_all_embeddings;

    -- =============================================
    -- CONTEXT BUILDING (ĐÃ SỬA)
    -- =============================================
    
    FUNCTION build_rag_context(
        p_question IN VARCHAR2,
        p_top_k IN NUMBER DEFAULT 3
    ) RETURN CLOB IS
        v_result CLOB;
        v_relevant_context CLOB;
        v_start_time NUMBER := DBMS_UTILITY.GET_TIME;
        v_response_time NUMBER;
        v_tables CLOB;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        -- Header
        DBMS_LOB.WRITEAPPEND(v_result, 100, 
            '# RAG SQL Generation Context' || CHR(10) || CHR(10));
        
        -- User question
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH('## User Question' || CHR(10) || CHR(10)),
            '## User Question' || CHR(10) || CHR(10));
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(p_question || CHR(10) || CHR(10)),
            p_question || CHR(10) || CHR(10));
        
        -- Relevant schemas
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH('## Relevant Database Schemas (Top ' || p_top_k || ')' || CHR(10) || CHR(10)),
            '## Relevant Database Schemas (Top ' || p_top_k || ')' || CHR(10) || CHR(10));
        
        v_relevant_context := get_relevant_context(p_question, p_top_k);
        DBMS_LOB.APPEND(v_result, v_relevant_context);
        
        -- Instructions
        DBMS_LOB.WRITEAPPEND(v_result, 700,
            CHR(10) || '## SQL Generation Instructions' || CHR(10) || CHR(10) ||
            'Based on the above schema information, generate Oracle SQL query for the user question.' || CHR(10) ||
            'Important:' || CHR(10) ||
            '1. Use proper JOINs between related tables' || CHR(10) ||
            '2. Handle Vietnamese characters correctly' || CHR(10) ||
            '3. Use appropriate date formats (DD/MM/YYYY)' || CHR(10) ||
            '4. Return only valid Oracle SQL statements' || CHR(10) ||
            '5. Use column names exactly as shown in schema' || CHR(10) ||
            '6. Consider table relationships (foreign keys)' || CHR(10) ||
            '7. Use ROWNUM or FETCH FIRST for pagination' || CHR(10) ||
            '8. Handle NULL values appropriately' || CHR(10)
        );
        
        -- Tính response time
        v_response_time := (DBMS_UTILITY.GET_TIME - v_start_time) / 100;
        
        -- Lưu lịch sử
        save_query_history(
            p_question => p_question,
            p_relevant_schemas => v_relevant_context,
            p_response_time => v_response_time
        );
        
        RETURN v_result;
    EXCEPTION
        WHEN OTHERS THEN
            log_error('BUILD_RAG_CONTEXT', NULL, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
            RETURN 'Error building context: ' || SQLERRM;
    END build_rag_context;

    -- =============================================
    -- QUERY HISTORY (ĐÃ SỬA)
    -- =============================================
    
    PROCEDURE save_query_history(
        p_question IN VARCHAR2,
        p_detected_tables IN VARCHAR2 DEFAULT NULL,
        p_relevant_schemas IN CLOB DEFAULT NULL,
        p_generated_sql IN CLOB DEFAULT NULL,
        p_response_time IN NUMBER DEFAULT NULL
    ) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
        v_query_id VARCHAR2(50);
    BEGIN
        v_query_id := 'Q' || TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') || 
                      '_' || LPAD(SEQ_RAG_QUERY_ID.NEXTVAL, 4, '0');
        
        INSERT INTO RAG_QUERY_HISTORY (
            QUERY_ID,
            QUESTION,
            DETECTED_TABLES,
            RELEVANT_SCHEMAS,
            GENERATED_SQL,
            RESPONSE_TIME,
            CREATED_DATE
        ) VALUES (
            v_query_id,
            p_question,
            p_detected_tables,
            p_relevant_schemas,
            p_generated_sql,
            p_response_time,
            SYSDATE
        );
        
        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            log_error('SAVE_QUERY_HISTORY', NULL, SQLERRM, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
    END save_query_history;

    -- =============================================
    -- STATUS FUNCTION (MỚI)
    -- =============================================
    
    FUNCTION get_vector_status RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
    BEGIN
        OPEN v_cursor FOR
            SELECT 
                TABLE_NAME,
                OWNER,
                CASE 
                    WHEN SCHEMA_EMBEDDING IS NOT NULL THEN '✅ Embedded'
                    ELSE '❌ Not embedded'
                END AS STATUS,
                CASE 
                    WHEN SCHEMA_EMBEDDING IS NOT NULL 
                    THEN DBMS_LOB.GETLENGTH(SCHEMA_TEXT) 
                    ELSE 0 
                END AS SCHEMA_SIZE,
                CREATED_DATE,
                UPDATED_DATE
            FROM RAG_SCHEMA_VECTORS
            ORDER BY OWNER, TABLE_NAME;
        RETURN v_cursor;
    END get_vector_status;

END RAG_VECTOR_SEARCH;
/

-- =====================================================
-- 8. TẠO VIEW TRẠNG THÁI
-- =====================================================

CREATE OR REPLACE VIEW V_RAG_VECTOR_STATUS AS
SELECT 
    TABLE_NAME,
    OWNER,
    CASE 
        WHEN SCHEMA_EMBEDDING IS NOT NULL THEN '✅ Embedded'
        ELSE '❌ Not embedded'
    END AS STATUS,
    CASE 
        WHEN SCHEMA_EMBEDDING IS NOT NULL 
        THEN DBMS_LOB.GETLENGTH(SCHEMA_TEXT) 
        ELSE 0 
    END AS SCHEMA_SIZE,
    CREATED_DATE,
    UPDATED_DATE
FROM RAG_SCHEMA_VECTORS
ORDER BY OWNER, TABLE_NAME;

-- =====================================================
-- 9. VIEW LỖI (MỚI)
-- =====================================================

CREATE OR REPLACE VIEW V_RAG_ERRORS AS
SELECT 
    ERROR_ID,
    PROCEDURE_NAME,
    TABLE_NAME,
    DBMS_LOB.SUBSTR(ERROR_MESSAGE, 4000, 1) AS ERROR_MESSAGE_SHORT,
    CREATED_DATE
FROM RAG_ERROR_LOG
ORDER BY CREATED_DATE DESC
FETCH FIRST 100 ROWS ONLY;

-- =====================================================
-- 10. VIEW MODEL STATUS (MỚI)
-- =====================================================

CREATE OR REPLACE VIEW V_RAG_MODEL_STATUS AS
SELECT 
    MODEL_NAME,
    MODEL_TYPE,
    CREATED_DATE
FROM USER_AI_MODELS
ORDER BY CREATED_DATE DESC;

-- =====================================================
-- 11. PROCEDURE TEST (ĐÃ SỬA)
-- =====================================================

CREATE OR REPLACE PROCEDURE test_vector_search(p_question IN VARCHAR2) IS
    v_cursor SYS_REFCURSOR;
    v_table_name VARCHAR2(100);
    v_owner VARCHAR2(100);
    v_schema_text CLOB;
    v_distance NUMBER;
    v_count NUMBER := 0;
    v_model_exists BOOLEAN;
BEGIN
    DBMS_OUTPUT.PUT_LINE('🔍 Testing Vector Search for: ' || p_question);
    DBMS_OUTPUT.PUT_LINE('========================================');
    
    -- Kiểm tra model
    v_model_exists := RAG_VECTOR_SEARCH.is_model_available;
    IF NOT v_model_exists THEN
        DBMS_OUTPUT.PUT_LINE('❌ Model ALL_MINILM_L12_V2 not available.');
        DBMS_OUTPUT.PUT_LINE('📌 Please import model first using DBMS_VECTOR.LOAD_MODEL');
        RETURN;
    END IF;
    
    v_cursor := RAG_VECTOR_SEARCH.find_relevant_schemas(p_question, 5);
    
    LOOP
        FETCH v_cursor INTO v_table_name, v_owner, v_schema_text, v_distance;
        EXIT WHEN v_cursor%NOTFOUND;
        
        v_count := v_count + 1;
        DBMS_OUTPUT.PUT_LINE('✅ #' || v_count || ': ' || v_table_name || 
                            ' (Owner: ' || v_owner || ', Distance: ' || ROUND(v_distance, 4) || ')');
    END LOOP;
    
    CLOSE v_cursor;
    
    IF v_count = 0 THEN
        DBMS_OUTPUT.PUT_LINE('❌ No schemas found. Please run export_all_schemas_to_vector first.');
    END IF;
    
    DBMS_OUTPUT.PUT_LINE('========================================');
    DBMS_OUTPUT.PUT_LINE('✅ Test completed');
    
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('❌ Error: ' || SQLERRM);
        IF v_cursor%ISOPEN THEN
            CLOSE v_cursor;
        END IF;
END test_vector_search;

-- =====================================================
-- 12. PROCEDURE KIỂM TRA TÍNH TOÀN VẸN (MỚI)
-- =====================================================

CREATE OR REPLACE PROCEDURE validate_rag_system IS
    v_model_exists BOOLEAN;
    v_count NUMBER;
BEGIN
    DBMS_OUTPUT.PUT_LINE('🔍 Validating RAG System');
    DBMS_OUTPUT.PUT_LINE('========================================');
    
    -- Kiểm tra model
    v_model_exists := RAG_VECTOR_SEARCH.is_model_available;
    IF v_model_exists THEN
        DBMS_OUTPUT.PUT_LINE('✅ Model ALL_MINILM_L12_V2: Available');
    ELSE
        DBMS_OUTPUT.PUT_LINE('❌ Model ALL_MINILM_L12_V2: NOT Available');
        DBMS_OUTPUT.PUT_LINE('   Please import model using DBMS_VECTOR.LOAD_MODEL');
    END IF;
    
    -- Kiểm tra vector table
    SELECT COUNT(*) INTO v_count FROM RAG_SCHEMA_VECTORS;
    DBMS_OUTPUT.PUT_LINE('📊 Vector table: ' || v_count || ' records');
    
    SELECT COUNT(*) INTO v_count FROM RAG_SCHEMA_VECTORS WHERE SCHEMA_EMBEDDING IS NOT NULL;
    DBMS_OUTPUT.PUT_LINE('📊 Embedded: ' || v_count || ' records');
    
    -- Kiểm tra index
    BEGIN
        SELECT COUNT(*) INTO v_count 
        FROM USER_INDEXES 
        WHERE INDEX_NAME = 'IDX_SCHEMA_EMBEDDING';
        IF v_count > 0 THEN
            DBMS_OUTPUT.PUT_LINE('✅ Vector index: Available');
        ELSE
            DBMS_OUTPUT.PUT_LINE('❌ Vector index: NOT Available');
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            DBMS_OUTPUT.PUT_LINE('❌ Error checking index: ' || SQLERRM);
    END;
    
    -- Kiểm tra errors
    SELECT COUNT(*) INTO v_count FROM RAG_ERROR_LOG WHERE CREATED_DATE > SYSDATE - 1;
    IF v_count > 0 THEN
        DBMS_OUTPUT.PUT_LINE('⚠️ Errors in last 24h: ' || v_count);
        DBMS_OUTPUT.PUT_LINE('   Check V_RAG_ERRORS for details');
    ELSE
        DBMS_OUTPUT.PUT_LINE('✅ No errors in last 24h');
    END IF;
    
    DBMS_OUTPUT.PUT_LINE('========================================');
END validate_rag_system;
/

-- =====================================================
-- 13. GRANT PERMISSIONS (THÊM NẾU CẦN)
-- =====================================================

/*
-- Nếu cần cho user khác
GRANT EXECUTE ON RAG_VECTOR_SEARCH TO APP_USER;
GRANT SELECT ON V_RAG_VECTOR_STATUS TO APP_USER;
GRANT SELECT ON V_RAG_ERRORS TO APP_USER;
GRANT SELECT ON V_RAG_MODEL_STATUS TO APP_USER;
*/

-- =====================================================
-- 14. HƯỚNG DẪN SỬ DỤNG
-- =====================================================

/*
📌 HƯỚNG DẪN SỬ DỤNG - PHIÊN BẢN ĐÃ VÁ LỖ HỔNG

1. ⚡ BƯỚC 1: IMPORT MODEL (QUAN TRỌNG)
   --------------------------------------
   -- Trước khi chạy bất kỳ function nào, phải import model
   -- Sử dụng DBMS_VECTOR.LOAD_MODEL hoặc công cụ của Oracle
   
   -- Kiểm tra model đã import:
   SELECT * FROM V_RAG_MODEL_STATUS;
   
   -- Hoặc dùng:
   SELECT RAG_VECTOR_SEARCH.is_model_available FROM DUAL;

2. 📦 BƯỚC 2: EXPORT SCHEMAS
   ---------------------------
   -- Export tất cả schemas của current user:
   EXEC RAG_VECTOR_SEARCH.export_all_schemas_to_vector;
   
   -- Export cho một owner cụ thể:
   EXEC RAG_VECTOR_SEARCH.export_all_schemas_to_vector('SYSTEM');
   
   -- Export một schema cụ thể:
   EXEC RAG_VECTOR_SEARCH.export_schema_to_vector('NHA_DAU_TU');
   EXEC RAG_VECTOR_SEARCH.export_schema_to_vector('NHA_DAU_TU', 'APP_USER');

3. 🔍 BƯỚC 3: TEST VECTOR SEARCH
   ------------------------------
   -- Test với câu hỏi:
   EXEC test_vector_search('Tổng số lượng cổ phiếu VIC của Nguyễn Văn An');
   
   -- Lấy context cho LLM:
   SELECT RAG_VECTOR_SEARCH.build_rag_context('Tổng số lượng cổ phiếu VIC của Nguyễn Văn An') FROM DUAL;

4. 📊 BƯỚC 4: KIỂM TRA TRẠNG THÁI
   --------------------------------
   -- Kiểm tra trạng thái vectors:
   SELECT * FROM V_RAG_VECTOR_STATUS;
   
   -- Kiểm tra lỗi:
   SELECT * FROM V_RAG_ERRORS;
   
   -- Validate toàn bộ hệ thống:
   EXEC validate_rag_system;

5. 🔧 BƯỚC 5: QUẢN LÝ
   --------------------
   -- Xóa một schema:
   EXEC RAG_VECTOR_SEARCH.remove_schema_from_vector('TEMP_TABLE');
   EXEC RAG_VECTOR_SEARCH.remove_schema_from_vector('TEMP_TABLE', 'APP_USER');
   
   -- Xóa tất cả:
   EXEC RAG_VECTOR_SEARCH.clear_all_vectors;
   
   -- Tái tạo embeddings (khi model được cập nhật):
   EXEC RAG_VECTOR_SEARCH.regenerate_all_embeddings;

6. 📈 BƯỚC 6: XEM LỊCH SỬ
   ------------------------
   SELECT * FROM RAG_QUERY_HISTORY ORDER BY CREATED_DATE DESC;
   
   -- Xem log lỗi:
   SELECT * FROM RAG_ERROR_LOG ORDER BY CREATED_DATE DESC;

7. ⚠️ LƯU Ý QUAN TRỌNG
   ---------------------
   - Model ALL_MINILM_L12_V2 phải được import trước
   - Kiểm tra model: SELECT RAG_VECTOR_SEARCH.is_model_available FROM DUAL;
   - Các lỗi sẽ được log vào RAG_ERROR_LOG
   - Sử dụng V_RAG_ERRORS để xem lỗi gần đây
*/

-- =====================================================
-- 15. CLEANUP SCRIPT
-- =====================================================

/*
-- Xóa tất cả objects
DROP TABLE RAG_SCHEMA_VECTORS PURGE;
DROP TABLE RAG_QUERY_HISTORY PURGE;
DROP TABLE RAG_ERROR_LOG PURGE;
DROP TABLE RAG_MODEL_STATUS PURGE;
DROP VIEW V_RAG_VECTOR_STATUS;
DROP VIEW V_RAG_ERRORS;
DROP VIEW V_RAG_MODEL_STATUS;
DROP PACKAGE RAG_VECTOR_SEARCH;
DROP PROCEDURE test_vector_search;
DROP PROCEDURE validate_rag_system;
DROP SEQUENCE SEQ_RAG_ERROR_LOG;
DROP SEQUENCE SEQ_RAG_QUERY_ID;
*/