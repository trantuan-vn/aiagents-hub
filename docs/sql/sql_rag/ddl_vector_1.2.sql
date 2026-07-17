-- =====================================================
-- HỆ THỐNG RAG VỚI AI VECTOR SEARCH TRÊN OCI
-- Phiên bản đã vá lỗ hổng - FIX PLS-00597
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

-- 7. Tạo các index để tăng hiệu suất
CREATE INDEX RAG_SCHEMA_VECTORS_IDX1 ON RAG_SCHEMA_VECTORS(OWNER, TABLE_NAME);
CREATE INDEX RAG_QUERY_HISTORY_IDX1 ON RAG_QUERY_HISTORY(CREATED_DATE DESC);
CREATE INDEX RAG_ERROR_LOG_IDX1 ON RAG_ERROR_LOG(CREATED_DATE DESC);


-- =====================================================
-- 9. PACKAGE CHÍNH - PHIÊN BẢN ĐÃ VÁ LỖ HỔNG
-- =====================================================
-- Package Specification
CREATE OR REPLACE PACKAGE RAG_VECTOR_SEARCH AS
    -- Model Management
    FUNCTION is_model_available RETURN BOOLEAN;
    FUNCTION get_available_models RETURN SYS_REFCURSOR;
    
    -- Embedding Functions
    FUNCTION create_schema_embedding(p_schema_text IN CLOB) RETURN VECTOR;
    FUNCTION create_question_embedding(p_question IN VARCHAR2) RETURN VECTOR;
    
    -- Schema Export Functions
    FUNCTION get_columns(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN SYS_REFCURSOR;
    FUNCTION get_primary_key(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB;
    FUNCTION get_foreign_keys(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB;
    FUNCTION get_table_comments(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB;
    FUNCTION get_sample_data(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER, p_limit IN NUMBER DEFAULT 10) RETURN CLOB;
    FUNCTION export_schema_to_text(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB;
    
    -- Vector Search Functions
    FUNCTION find_relevant_schemas(p_question IN VARCHAR2, p_top_k IN NUMBER DEFAULT 3) RETURN SYS_REFCURSOR;
    FUNCTION get_relevant_context(p_question IN VARCHAR2, p_top_k IN NUMBER DEFAULT 3) RETURN CLOB;
    
    -- Export Procedures
    PROCEDURE export_schema_to_vector(p_table_name IN VARCHAR2, p_owner IN VARCHAR2 DEFAULT USER);
    PROCEDURE export_all_schemas_to_vector(p_owner IN VARCHAR2 DEFAULT USER);
    PROCEDURE remove_schema_from_vector(p_table_name IN VARCHAR2, p_owner IN VARCHAR2 DEFAULT USER);
    PROCEDURE clear_all_vectors;
    
    -- Regenerate Embeddings
    PROCEDURE regenerate_all_embeddings(p_owner IN VARCHAR2 DEFAULT USER);
    
    -- Context Building
    FUNCTION build_rag_context(p_question IN VARCHAR2, p_top_k IN NUMBER DEFAULT 3) RETURN CLOB;
    
    -- Query History
    PROCEDURE save_query_history(
        p_question IN VARCHAR2,
        p_detected_tables IN VARCHAR2 DEFAULT NULL,
        p_relevant_schemas IN CLOB DEFAULT NULL,
        p_generated_sql IN CLOB DEFAULT NULL,
        p_response_time IN NUMBER DEFAULT NULL
    );
    
    -- Status Function
    FUNCTION get_vector_status RETURN SYS_REFCURSOR;
    
    -- Related Tables Function (wrapper)
    FUNCTION get_related_tables(p_table_list IN VARCHAR2) RETURN SYS.ODCIVARCHAR2LIST;
    
END RAG_VECTOR_SEARCH;
/

-- Package Body
CREATE OR REPLACE PACKAGE BODY RAG_VECTOR_SEARCH AS

    -- =============================================
    -- LOGGING UTILITIES
    -- =============================================
    
    PROCEDURE log_error(
        p_procedure_name IN VARCHAR2,
        p_table_name IN VARCHAR2 DEFAULT NULL,
        p_error_message IN VARCHAR2,
        p_error_stack IN VARCHAR2 DEFAULT NULL
    ) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
        v_error_id VARCHAR2(50);
        v_error_msg VARCHAR2(4000);
    BEGIN
        v_error_id := 'ERR_' || TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') || '_' || LPAD(TO_CHAR(SEQ_RAG_ERROR_LOG.NEXTVAL), 4, '0');
        
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
        FROM USER_MINING_MODELS 
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
            SELECT MODEL_NAME, MINING_FUNCTION, CREATION_DATE 
            FROM USER_MINING_MODELS
            ORDER BY CREATION_DATE DESC;
        RETURN v_cursor;
    END get_available_models;

    -- =============================================
    -- EMBEDDING FUNCTIONS
    -- =============================================
    
    FUNCTION create_schema_embedding(p_schema_text IN CLOB) RETURN VECTOR IS
        v_vector VECTOR;
        v_model_exists BOOLEAN;
        v_error_msg VARCHAR2(4000);
    BEGIN
        -- Kiểm tra model tồn tại
        v_model_exists := is_model_available;
        
        IF NOT v_model_exists THEN
            log_error(
                'CREATE_SCHEMA_EMBEDDING',
                NULL,
                'Model ALL_MINILM_L12_V2 not found. Please import model first.',
                DBMS_UTILITY.FORMAT_ERROR_BACKTRACE()
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
                v_error_msg := SQLERRM;
                log_error(
                    'CREATE_SCHEMA_EMBEDDING',
                    NULL,
                    'Error creating embedding: ' || v_error_msg,
                    DBMS_UTILITY.FORMAT_ERROR_BACKTRACE()
                );
                RETURN NULL;
        END;
    END create_schema_embedding;

    FUNCTION create_question_embedding(p_question IN VARCHAR2) RETURN VECTOR IS
        v_vector VECTOR;
        v_model_exists BOOLEAN;
        v_error_msg VARCHAR2(4000);
    BEGIN
        v_model_exists := is_model_available;
        
        IF NOT v_model_exists THEN
            log_error(
                'CREATE_QUESTION_EMBEDDING',
                NULL,
                'Model ALL_MINILM_L12_V2 not found. Please import model first.',
                DBMS_UTILITY.FORMAT_ERROR_BACKTRACE()
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
                v_error_msg := SQLERRM;
                log_error(
                    'CREATE_QUESTION_EMBEDDING',
                    NULL,
                    'Error creating embedding: ' || v_error_msg,
                    DBMS_UTILITY.FORMAT_ERROR_BACKTRACE()
                );
                RETURN NULL;
        END;
    END create_question_embedding;

    -- =============================================
    -- SCHEMA EXPORT FUNCTIONS
    -- =============================================
    
    FUNCTION get_columns(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
        v_error_msg VARCHAR2(4000);
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
            v_error_msg := SQLERRM;
            log_error('GET_COLUMNS', p_table_name, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            RETURN NULL;
    END get_columns;

    FUNCTION get_primary_key(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB IS
        v_pk CLOB;
        v_error_msg VARCHAR2(4000);
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
        
        IF NVL(DBMS_LOB.GETLENGTH(v_pk), 0) = 0 THEN
            DBMS_LOB.WRITEAPPEND(v_pk, 15, 'No primary key');
        END IF;
        
        RETURN v_pk;
    EXCEPTION
        WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            DBMS_LOB.CREATETEMPORARY(v_pk, TRUE);
            DBMS_LOB.WRITEAPPEND(v_pk, 15, 'No primary key');
            RETURN v_pk;
    END get_primary_key;

    FUNCTION get_foreign_keys(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB IS
        v_fk CLOB;
        v_error_msg VARCHAR2(4000);
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
            IF NVL(DBMS_LOB.GETLENGTH(v_fk), 0) > 0 THEN
                DBMS_LOB.WRITEAPPEND(v_fk, 2, '; ');
            END IF;
            DBMS_LOB.WRITEAPPEND(v_fk, LENGTH(rec.fk_info), rec.fk_info);
        END LOOP;
        
        IF NVL(DBMS_LOB.GETLENGTH(v_fk), 0) = 0 THEN
            DBMS_LOB.WRITEAPPEND(v_fk, 15, 'No foreign keys');
        END IF;
        
        RETURN v_fk;
    EXCEPTION
        WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            DBMS_LOB.CREATETEMPORARY(v_fk, TRUE);
            DBMS_LOB.WRITEAPPEND(v_fk, 22, 'Error getting foreign keys');
            RETURN v_fk;
    END get_foreign_keys;

    -- Lấy comments của table và columns
    FUNCTION get_table_comments(p_table_name VARCHAR2, p_owner VARCHAR2 DEFAULT USER) RETURN CLOB IS
        v_comments CLOB;
        v_comment VARCHAR2(4000);
        v_error_msg VARCHAR2(4000);
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
            ORDER BY COLUMN_NAME
        ) LOOP
            DBMS_LOB.WRITEAPPEND(v_comments, 
                LENGTH('  - ' || rec.COLUMN_NAME || ': ' || rec.COMMENTS || CHR(10)),
                '  - ' || rec.COLUMN_NAME || ': ' || rec.COMMENTS || CHR(10));
        END LOOP;
        
        RETURN v_comments;
    EXCEPTION
        WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            RETURN NULL;
    END get_table_comments;

    -- =============================================
    -- HÀM LẤY DỮ LIỆU MẪU (FIX PLS-00597 - SỬ DỤNG CÁCH TIẾP CẬN ĐƠN GIẢN NHẤT)
    -- =============================================
    
    FUNCTION get_sample_data(
        p_table_name VARCHAR2, 
        p_owner VARCHAR2 DEFAULT USER, 
        p_limit IN NUMBER DEFAULT 10
    ) RETURN CLOB IS
        v_sample CLOB;
        v_sql VARCHAR2(4000);
        v_row_count NUMBER := 0;
        v_error_msg VARCHAR2(4000);
        v_col_count NUMBER := 0;
        
        -- Sử dụng REF CURSOR với các biến đơn giản
        TYPE ref_cursor IS REF CURSOR;
        v_cursor ref_cursor;
        
        -- Lấy danh sách cột
        CURSOR c_cols IS
            SELECT COLUMN_NAME
            FROM ALL_TAB_COLUMNS
            WHERE TABLE_NAME = UPPER(p_table_name)
            AND OWNER = UPPER(p_owner)
            AND DATA_TYPE NOT IN ('BLOB', 'CLOB', 'NCLOB', 'BFILE', 'LONG', 'LONG RAW')
            ORDER BY COLUMN_ID;
            
        TYPE col_list_type IS TABLE OF VARCHAR2(100) INDEX BY BINARY_INTEGER;
        v_cols col_list_type;
        
        -- Biến cho từng cột (tối đa 50 cột)
        v_val1 VARCHAR2(4000);
        v_val2 VARCHAR2(4000);
        v_val3 VARCHAR2(4000);
        v_val4 VARCHAR2(4000);
        v_val5 VARCHAR2(4000);
        v_val6 VARCHAR2(4000);
        v_val7 VARCHAR2(4000);
        v_val8 VARCHAR2(4000);
        v_val9 VARCHAR2(4000);
        v_val10 VARCHAR2(4000);
        v_val11 VARCHAR2(4000);
        v_val12 VARCHAR2(4000);
        v_val13 VARCHAR2(4000);
        v_val14 VARCHAR2(4000);
        v_val15 VARCHAR2(4000);
        v_val16 VARCHAR2(4000);
        v_val17 VARCHAR2(4000);
        v_val18 VARCHAR2(4000);
        v_val19 VARCHAR2(4000);
        v_val20 VARCHAR2(4000);
        v_val21 VARCHAR2(4000);
        v_val22 VARCHAR2(4000);
        v_val23 VARCHAR2(4000);
        v_val24 VARCHAR2(4000);
        v_val25 VARCHAR2(4000);
        v_val26 VARCHAR2(4000);
        v_val27 VARCHAR2(4000);
        v_val28 VARCHAR2(4000);
        v_val29 VARCHAR2(4000);
        v_val30 VARCHAR2(4000);
        
        v_row_data VARCHAR2(4000);
        v_has_data BOOLEAN := FALSE;
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_sample, TRUE);
        
        DBMS_LOB.WRITEAPPEND(v_sample, LENGTH('Sample Data (Top ' || p_limit || ' rows):' || CHR(10)), 
            'Sample Data (Top ' || p_limit || ' rows):' || CHR(10));
        
        -- Kiểm tra bảng có dữ liệu không
        BEGIN
            EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM ' || UPPER(p_table_name) INTO v_row_count;
        EXCEPTION
            WHEN OTHERS THEN
                DBMS_LOB.WRITEAPPEND(v_sample, LENGTH('  (Table may not exist or no access)' || CHR(10)), 
                    '  (Table may not exist or no access)' || CHR(10));
                RETURN v_sample;
        END;
        
        IF v_row_count = 0 THEN
            DBMS_LOB.WRITEAPPEND(v_sample, LENGTH('  (No data available)' || CHR(10)), 
                '  (No data available)' || CHR(10));
            RETURN v_sample;
        END IF;
        
        -- Lấy danh sách cột
        FOR col IN c_cols LOOP
            v_col_count := v_col_count + 1;
            v_cols(v_col_count) := col.COLUMN_NAME;
        END LOOP;
        
        IF v_col_count = 0 THEN
            DBMS_LOB.WRITEAPPEND(v_sample, LENGTH('  (No columns found)' || CHR(10)), 
                '  (No columns found)' || CHR(10));
            RETURN v_sample;
        END IF;
        
        -- Xây dựng SQL động với TO_CHAR cho tất cả cột
        v_sql := 'SELECT ';
        FOR i IN 1..v_col_count LOOP
            IF i > 1 THEN
                v_sql := v_sql || ', ';
            END IF;
            -- Chuyển tất cả về VARCHAR2 để tránh lỗi kiểu dữ liệu
            v_sql := v_sql || 'TO_CHAR(' || v_cols(i) || ') AS ' || v_cols(i);
        END LOOP;
        v_sql := v_sql || ' FROM ' || UPPER(p_table_name) || ' WHERE ROWNUM <= ' || p_limit;
        
        -- Thực thi và lấy dữ liệu
        BEGIN
            OPEN v_cursor FOR v_sql;
            
            v_row_count := 0;
            LOOP
                -- Sử dụng CASE để xác định số lượng cột
                IF v_col_count = 1 THEN
                    FETCH v_cursor INTO v_val1;
                ELSIF v_col_count = 2 THEN
                    FETCH v_cursor INTO v_val1, v_val2;
                ELSIF v_col_count = 3 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3;
                ELSIF v_col_count = 4 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4;
                ELSIF v_col_count = 5 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5;
                ELSIF v_col_count = 6 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6;
                ELSIF v_col_count = 7 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7;
                ELSIF v_col_count = 8 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8;
                ELSIF v_col_count = 9 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9;
                ELSIF v_col_count = 10 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10;
                ELSIF v_col_count = 11 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11;
                ELSIF v_col_count = 12 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11, v_val12;
                ELSIF v_col_count = 13 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11, v_val12, v_val13;
                ELSIF v_col_count = 14 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11, v_val12, v_val13, v_val14;
                ELSIF v_col_count = 15 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11, v_val12, v_val13, v_val14, v_val15;
                ELSIF v_col_count = 16 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11, v_val12, v_val13, v_val14, v_val15, v_val16;
                ELSIF v_col_count = 17 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11, v_val12, v_val13, v_val14, v_val15, v_val16, v_val17;
                ELSIF v_col_count = 18 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11, v_val12, v_val13, v_val14, v_val15, v_val16, v_val17, v_val18;
                ELSIF v_col_count = 19 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11, v_val12, v_val13, v_val14, v_val15, v_val16, v_val17, v_val18, v_val19;
                ELSIF v_col_count = 20 THEN
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10, v_val11, v_val12, v_val13, v_val14, v_val15, v_val16, v_val17, v_val18, v_val19, v_val20;
                ELSE
                    -- Nếu có nhiều hơn 20 cột, chỉ lấy 20 cột đầu
                    FETCH v_cursor INTO v_val1, v_val2, v_val3, v_val4, v_val5, v_val6, v_val7, v_val8, v_val9, v_val10,
                                       v_val11, v_val12, v_val13, v_val14, v_val15, v_val16, v_val17, v_val18, v_val19, v_val20;
                END IF;
                
                EXIT WHEN v_cursor%NOTFOUND;
                
                v_row_count := v_row_count + 1;
                v_has_data := TRUE;
                
                DBMS_LOB.WRITEAPPEND(v_sample, LENGTH('  Row ' || v_row_count || ': '), 
                    '  Row ' || v_row_count || ': ');
                
                -- Hiển thị các cột
                FOR i IN 1..LEAST(v_col_count, 20) LOOP
                    IF i > 1 THEN
                        DBMS_LOB.WRITEAPPEND(v_sample, 2, ', ');
                    END IF;
                    
                    -- Lấy giá trị theo index
                    IF i = 1 THEN v_row_data := v_val1;
                    ELSIF i = 2 THEN v_row_data := v_val2;
                    ELSIF i = 3 THEN v_row_data := v_val3;
                    ELSIF i = 4 THEN v_row_data := v_val4;
                    ELSIF i = 5 THEN v_row_data := v_val5;
                    ELSIF i = 6 THEN v_row_data := v_val6;
                    ELSIF i = 7 THEN v_row_data := v_val7;
                    ELSIF i = 8 THEN v_row_data := v_val8;
                    ELSIF i = 9 THEN v_row_data := v_val9;
                    ELSIF i = 10 THEN v_row_data := v_val10;
                    ELSIF i = 11 THEN v_row_data := v_val11;
                    ELSIF i = 12 THEN v_row_data := v_val12;
                    ELSIF i = 13 THEN v_row_data := v_val13;
                    ELSIF i = 14 THEN v_row_data := v_val14;
                    ELSIF i = 15 THEN v_row_data := v_val15;
                    ELSIF i = 16 THEN v_row_data := v_val16;
                    ELSIF i = 17 THEN v_row_data := v_val17;
                    ELSIF i = 18 THEN v_row_data := v_val18;
                    ELSIF i = 19 THEN v_row_data := v_val19;
                    ELSIF i = 20 THEN v_row_data := v_val20;
                    END IF;
                    
                    DBMS_LOB.WRITEAPPEND(v_sample, LENGTH(v_cols(i) || '='), v_cols(i) || '=');
                    DBMS_LOB.WRITEAPPEND(v_sample, LENGTH(NVL(v_row_data, 'NULL')), NVL(v_row_data, 'NULL'));
                END LOOP;
                
                IF v_col_count > 20 THEN
                    DBMS_LOB.WRITEAPPEND(v_sample, LENGTH(', ... (and ' || (v_col_count - 20) || ' more columns)'), 
                        ', ... (and ' || (v_col_count - 20) || ' more columns)');
                END IF;
                
                DBMS_LOB.WRITEAPPEND(v_sample, 1, CHR(10));
            END LOOP;
            
            CLOSE v_cursor;
            
            IF NOT v_has_data THEN
                DBMS_LOB.WRITEAPPEND(v_sample, LENGTH('  (No data returned)' || CHR(10)), 
                    '  (No data returned)' || CHR(10));
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                IF v_cursor%ISOPEN THEN
                    CLOSE v_cursor;
                END IF;
                DBMS_LOB.WRITEAPPEND(v_sample, LENGTH('  (Error getting sample data: ' || SQLERRM || ')' || CHR(10)), 
                    '  (Error getting sample data: ' || SQLERRM || ')' || CHR(10));
        END;
        
        RETURN v_sample;
    EXCEPTION
        WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            DBMS_LOB.CREATETEMPORARY(v_sample, TRUE);
            DBMS_LOB.WRITEAPPEND(v_sample, LENGTH('Error getting sample data: ' || v_error_msg), 
                'Error getting sample data: ' || v_error_msg);
            RETURN v_sample;
    END get_sample_data;

    -- =============================================
    -- EXPORT SCHEMA TO TEXT (ĐÃ CẬP NHẬT - CÓ DỮ LIỆU MẪU)
    -- =============================================
    
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
        v_sample_data CLOB;
        v_error_msg VARCHAR2(4000);
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
        IF NVL(DBMS_LOB.GETLENGTH(v_comments), 0) > 0 THEN
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
        
        -- =============================================
        -- THÊM DỮ LIỆU MẪU
        -- =============================================
        DBMS_LOB.WRITEAPPEND(v_result, 1, CHR(10));
        v_sample_data := get_sample_data(p_table_name, p_owner, 10);
        DBMS_LOB.APPEND(v_result, v_sample_data);
        
        RETURN v_result;
    EXCEPTION
        WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            log_error('EXPORT_SCHEMA_TO_TEXT', p_table_name, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            RETURN NULL;
    END export_schema_to_text;

    -- =============================================
    -- VECTOR SEARCH FUNCTIONS
    -- =============================================
    
    FUNCTION find_relevant_schemas(
        p_question IN VARCHAR2,
        p_top_k IN NUMBER DEFAULT 3
    ) RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
        v_question_vector VECTOR;
        v_model_exists BOOLEAN;
        v_error_msg VARCHAR2(4000);
    BEGIN
        -- Kiểm tra model
        v_model_exists := is_model_available;
        IF NOT v_model_exists THEN
            v_error_msg := 'Model not available';
            log_error('FIND_RELEVANT_SCHEMAS', NULL, v_error_msg);
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
            v_error_msg := SQLERRM;
            log_error('FIND_RELEVANT_SCHEMAS', NULL, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            OPEN v_cursor FOR SELECT v_error_msg AS ERROR FROM DUAL;
            RETURN v_cursor;
    END find_relevant_schemas;

    -- =============================================
    -- RELATED TABLES FUNCTION (WRAPPER)
    -- =============================================
    
    FUNCTION get_related_tables(p_table_list IN VARCHAR2)
    RETURN SYS.ODCIVARCHAR2LIST
    IS
        v_result SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST();
        v_new_tables SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST();
        v_has_new BOOLEAN := TRUE;
        v_loop_count NUMBER := 0;
        v_max_loop NUMBER := 100;
        
        -- Hàm kiểm tra bảng đã tồn tại trong danh sách (nội tuyến)
        FUNCTION exists_in_list(p_list IN SYS.ODCIVARCHAR2LIST, p_name IN VARCHAR2) 
        RETURN BOOLEAN
        IS
        BEGIN
            FOR i IN 1..p_list.COUNT LOOP
                IF UPPER(p_list(i)) = UPPER(p_name) THEN
                    RETURN TRUE;
                END IF;
            END LOOP;
            RETURN FALSE;
        END exists_in_list;
        
    BEGIN
        -- Bước 1: Thêm các bảng ban đầu từ chuỗi đầu vào
        FOR rec IN (
            SELECT TRIM(REGEXP_SUBSTR(p_table_list, '[^,]+', 1, LEVEL)) AS table_name
            FROM DUAL
            CONNECT BY LEVEL <= REGEXP_COUNT(p_table_list, ',') + 1
        ) LOOP
            IF rec.table_name IS NOT NULL AND NOT exists_in_list(v_result, rec.table_name) THEN
                v_result.EXTEND;
                v_result(v_result.COUNT) := UPPER(rec.table_name);
            END IF;
        END LOOP;
        
        -- Bước 2: Vòng lặp tìm tất cả bảng liên quan (cha và con)
        WHILE v_has_new AND v_loop_count < v_max_loop
        LOOP
            v_loop_count := v_loop_count + 1;
            v_has_new := FALSE;
            v_new_tables := SYS.ODCIVARCHAR2LIST();
            
            -- Tìm các bảng cha và con
            FOR fk_rec IN (
                WITH fk_info AS (
                    SELECT
                        uc.table_name AS child_table,
                        upc.table_name AS parent_table
                    FROM
                        user_constraints uc
                        JOIN user_constraints upc ON uc.r_constraint_name = upc.constraint_name
                    WHERE
                        uc.constraint_type = 'R'
                        AND upc.owner = USER
                ),
                current_tables AS (
                    SELECT COLUMN_VALUE AS table_name
                    FROM TABLE(v_result)
                )
                SELECT DISTINCT related_table
                FROM (
                    -- Lấy các bảng cha (parent)
                    SELECT parent_table AS related_table
                    FROM fk_info
                    WHERE child_table IN (SELECT table_name FROM current_tables)
                    UNION
                    -- Lấy các bảng con (child)
                    SELECT child_table AS related_table
                    FROM fk_info
                    WHERE parent_table IN (SELECT table_name FROM current_tables)
                )
                WHERE related_table IS NOT NULL
            ) LOOP
                IF NOT exists_in_list(v_result, fk_rec.related_table) THEN
                    v_new_tables.EXTEND;
                    v_new_tables(v_new_tables.COUNT) := UPPER(fk_rec.related_table);
                    v_has_new := TRUE;
                END IF;
            END LOOP;
            
            -- Thêm các bảng mới vào kết quả
            FOR i IN 1..v_new_tables.COUNT LOOP
                v_result.EXTEND;
                v_result(v_result.COUNT) := v_new_tables(i);
            END LOOP;
        END LOOP;
        
        RETURN v_result;
    END get_related_tables;


    -- =============================================
    -- GET RELEVANT CONTEXT
    -- =============================================

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
        v_error_msg VARCHAR2(4000);
        v_table_list VARCHAR2(4000);
        v_related_tables SYS.ODCIVARCHAR2LIST;
        
        -- Collection để lưu danh sách bảng đã xử lý (tránh trùng)
        TYPE table_set_type IS TABLE OF VARCHAR2(100) INDEX BY VARCHAR2(100);
        v_processed_tables table_set_type;
        
        -- Hàm kiểm tra bảng đã được xử lý chưa
        FUNCTION is_processed(p_table_name IN VARCHAR2) 
        RETURN BOOLEAN
        IS
        BEGIN
            RETURN v_processed_tables.EXISTS(UPPER(p_table_name));
        END is_processed;
        
        -- Procedure để đánh dấu bảng đã xử lý
        PROCEDURE mark_processed(p_table_name IN VARCHAR2)
        IS
        BEGIN
            v_processed_tables(UPPER(p_table_name)) := UPPER(p_table_name);
        END mark_processed;
        
        -- Hàm lấy schema từ RAG_SCHEMA_VECTORS
        FUNCTION get_schema_from_vector(p_table_name IN VARCHAR2) 
        RETURN CLOB
        IS
            v_schema CLOB;
        BEGIN
            SELECT SCHEMA_TEXT INTO v_schema
            FROM RAG_SCHEMA_VECTORS
            WHERE TABLE_NAME = UPPER(p_table_name)
            AND OWNER = USER;
            RETURN v_schema;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RETURN NULL;
        END get_schema_from_vector;
        
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH('Question: ' || p_question || CHR(10) || CHR(10)), 
            'Question: ' || p_question || CHR(10) || CHR(10));
        
        -- Bước 1: Tìm các bảng liên quan nhất bằng vector search
        v_cursor := find_relevant_schemas(p_question, p_top_k);
        
        -- Lưu danh sách bảng và xây dựng chuỗi table_list
        LOOP
            FETCH v_cursor INTO v_table_name, v_owner, v_schema_text, v_distance;
            EXIT WHEN v_cursor%NOTFOUND;
            
            v_count := v_count + 1;
            
            -- Đánh dấu bảng đã xử lý
            mark_processed(v_table_name);
            
            -- Thêm vào chuỗi table_list để tìm bảng liên quan
            IF v_table_list IS NULL THEN
                v_table_list := UPPER(v_table_name);
            ELSE
                v_table_list := v_table_list || ',' || UPPER(v_table_name);
            END IF;
            
            -- Thêm schema của bảng này vào kết quả
            DBMS_LOB.WRITEAPPEND(v_result, 
                LENGTH('--- Relevant Schema #' || v_count || ' (Owner: ' || v_owner || ', Distance: ' || ROUND(v_distance, 4) || ')' || CHR(10)),
                '--- Relevant Schema #' || v_count || ' (Owner: ' || v_owner || ', Distance: ' || ROUND(v_distance, 4) || ')' || CHR(10));
            DBMS_LOB.APPEND(v_result, v_schema_text);
            DBMS_LOB.WRITEAPPEND(v_result, 2, CHR(10) || CHR(10));
        END LOOP;
        
        CLOSE v_cursor;
        
        -- Bước 2: Tìm các bảng liên quan (cha và con) từ danh sách bảng đã tìm được
        IF v_table_list IS NOT NULL THEN
            DBMS_OUTPUT.PUT_LINE('🔍 Finding related tables for: ' || v_table_list);
            
            -- Gọi hàm get_related_tables để lấy danh sách bảng liên quan
            BEGIN
                v_related_tables := get_related_tables(v_table_list);
                
                -- Thêm các bảng liên quan vào kết quả nếu chưa được xử lý
                IF v_related_tables.COUNT > 0 THEN
                    DBMS_LOB.WRITEAPPEND(v_result, 
                        LENGTH('--- Related Tables (Parent/Child) ---' || CHR(10) || CHR(10)),
                        '--- Related Tables (Parent/Child) ---' || CHR(10) || CHR(10));
                    
                    FOR i IN 1..v_related_tables.COUNT LOOP
                        -- Chỉ xử lý nếu bảng chưa được đánh dấu
                        IF NOT is_processed(v_related_tables(i)) THEN
                            BEGIN
                                -- Đánh dấu đã xử lý
                                mark_processed(v_related_tables(i));
                                
                                -- Lấy schema từ bảng RAG_SCHEMA_VECTORS
                                v_schema_text := get_schema_from_vector(v_related_tables(i));
                                
                                IF v_schema_text IS NOT NULL THEN
                                    DBMS_LOB.WRITEAPPEND(v_result, 
                                        LENGTH('--- Related Table: ' || v_related_tables(i) || CHR(10)),
                                        '--- Related Table: ' || v_related_tables(i) || CHR(10));
                                    DBMS_LOB.APPEND(v_result, v_schema_text);
                                    DBMS_LOB.WRITEAPPEND(v_result, 2, CHR(10) || CHR(10));
                                ELSE
                                    DBMS_LOB.WRITEAPPEND(v_result, 
                                        LENGTH('⚠️ Table ' || v_related_tables(i) || ' not found in vector store' || CHR(10) || CHR(10)),
                                        '⚠️ Table ' || v_related_tables(i) || ' not found in vector store' || CHR(10) || CHR(10));
                                END IF;
                                
                            EXCEPTION
                                WHEN OTHERS THEN
                                    NULL;
                            END;
                        END IF;
                    END LOOP;
                END IF;
                
                DBMS_OUTPUT.PUT_LINE('✅ Processed ' || v_processed_tables.COUNT || ' unique tables');
            EXCEPTION
                WHEN OTHERS THEN
                    DBMS_OUTPUT.PUT_LINE('⚠️ Error getting related tables: ' || SQLERRM);
            END;
        END IF;
        
        IF v_count = 0 THEN
            DBMS_LOB.WRITEAPPEND(v_result, 80, 'No relevant schemas found. Please run export_all_schemas_to_vector first.');
        END IF;
        
        RETURN v_result;
    EXCEPTION
        WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            log_error('GET_RELEVANT_CONTEXT', NULL, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            IF v_cursor%ISOPEN THEN
                CLOSE v_cursor;
            END IF;
            RETURN 'Error getting context: ' || v_error_msg;
    END get_relevant_context;

    -- =============================================
    -- EXPORT PROCEDURES
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
        v_error_msg VARCHAR2(4000);
    BEGIN
        -- Kiểm tra table tồn tại
        SELECT COUNT(*) INTO v_exists 
        FROM ALL_TABLES 
        WHERE TABLE_NAME = v_table_upper 
        AND OWNER = v_owner_upper;
        
        IF v_exists = 0 THEN
            v_error_msg := 'Table does not exist';
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, v_error_msg);
            DBMS_OUTPUT.PUT_LINE('❌ Table ' || v_table_upper || ' does not exist');
            RETURN;
        END IF;
        
        -- Kiểm tra model
        IF NOT is_model_available THEN
            v_error_msg := 'Model ALL_MINILM_L12_V2 not available';
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, v_error_msg);
            DBMS_OUTPUT.PUT_LINE('❌ Model not available. Please import model first.');
            RETURN;
        END IF;
        
        -- Tạo schema text
        v_schema_text := export_schema_to_text(v_table_upper, v_owner_upper);
        
        IF v_schema_text IS NULL THEN
            v_error_msg := 'Failed to export schema text';
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, v_error_msg);
            DBMS_OUTPUT.PUT_LINE('❌ Failed to export schema text for ' || v_table_upper);
            RETURN;
        END IF;
        
        -- Tạo embedding
        v_embedding := create_schema_embedding(v_schema_text);
        
        IF v_embedding IS NULL THEN
            v_error_msg := 'Failed to create embedding';
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, v_error_msg);
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
            log_error('EXPORT_SCHEMA_TO_VECTOR', p_table_name, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            DBMS_OUTPUT.PUT_LINE('❌ Error exporting ' || v_table_upper || ': ' || v_error_msg);
    END export_schema_to_vector;

    PROCEDURE export_all_schemas_to_vector(p_owner IN VARCHAR2 DEFAULT USER) IS
        v_count NUMBER := 0;
        v_error_count NUMBER := 0;
        v_start_time NUMBER := DBMS_UTILITY.GET_TIME;
        v_owner_upper VARCHAR2(100) := UPPER(p_owner);
        v_error_msg VARCHAR2(4000);
        
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
            AND TABLE_NAME NOT LIKE '%$%'
            AND TABLE_NAME NOT LIKE 'MVIEW%'
            AND TABLE_NAME NOT LIKE 'PLAN_TABLE%'
            ORDER BY TABLE_NAME;
    BEGIN
        DBMS_OUTPUT.PUT_LINE('🚀 Starting export all schemas for owner: ' || v_owner_upper);
        DBMS_OUTPUT.PUT_LINE('========================================');
        
        -- Kiểm tra model trước
        IF NOT is_model_available THEN
            v_error_msg := 'Model ALL_MINILM_L12_V2 not available. Cannot proceed.';
            DBMS_OUTPUT.PUT_LINE('❌ ' || v_error_msg);
            log_error('EXPORT_ALL_SCHEMAS_TO_VECTOR', NULL, v_error_msg);
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
                    v_error_msg := SQLERRM;
                    log_error('EXPORT_ALL_SCHEMAS_TO_VECTOR', t.TABLE_NAME, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
                    DBMS_OUTPUT.PUT_LINE('❌ Error processing ' || t.TABLE_NAME || ': ' || v_error_msg);
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
            v_error_msg := SQLERRM;
            log_error('EXPORT_ALL_SCHEMAS_TO_VECTOR', NULL, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            DBMS_OUTPUT.PUT_LINE('❌ Fatal error: ' || v_error_msg);
    END export_all_schemas_to_vector;

    PROCEDURE remove_schema_from_vector(
        p_table_name IN VARCHAR2,
        p_owner IN VARCHAR2 DEFAULT USER
    ) IS
        v_error_msg VARCHAR2(4000);
    BEGIN
        DELETE FROM RAG_SCHEMA_VECTORS 
        WHERE TABLE_NAME = UPPER(p_table_name) 
        AND OWNER = UPPER(p_owner);
        
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ Removed schema: ' || UPPER(p_table_name) || ' (Owner: ' || UPPER(p_owner) || ')');
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            v_error_msg := SQLERRM;
            log_error('REMOVE_SCHEMA_FROM_VECTOR', p_table_name, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            DBMS_OUTPUT.PUT_LINE('❌ Error removing ' || UPPER(p_table_name) || ': ' || v_error_msg);
    END remove_schema_from_vector;

    PROCEDURE clear_all_vectors IS
        v_error_msg VARCHAR2(4000);
    BEGIN
        DELETE FROM RAG_SCHEMA_VECTORS;
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ Cleared all vector data');
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            v_error_msg := SQLERRM;
            log_error('CLEAR_ALL_VECTORS', NULL, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            DBMS_OUTPUT.PUT_LINE('❌ Error clearing vectors: ' || v_error_msg);
    END clear_all_vectors;

    -- =============================================
    -- REGENERATE EMBEDDINGS
    -- =============================================
    
    PROCEDURE regenerate_all_embeddings(p_owner IN VARCHAR2 DEFAULT USER) IS
        v_count NUMBER := 0;
        v_error_msg VARCHAR2(4000);
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
                    v_error_msg := SQLERRM;
                    log_error('REGENERATE_ALL_EMBEDDINGS', rec.TABLE_NAME, v_error_msg);
            END;
        END LOOP;
        
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ Regenerated ' || v_count || ' embeddings');
    EXCEPTION
        WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            log_error('REGENERATE_ALL_EMBEDDINGS', NULL, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            DBMS_OUTPUT.PUT_LINE('❌ Error regenerating embeddings: ' || v_error_msg);
    END regenerate_all_embeddings;

    -- =============================================
    -- CONTEXT BUILDING
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
        v_error_msg VARCHAR2(4000);
        v_instructions VARCHAR2(4000);
    BEGIN
        DBMS_LOB.CREATETEMPORARY(v_result, TRUE);
        
        -- Header
        DBMS_LOB.WRITEAPPEND(v_result, 
            LENGTH('# RAG SQL Generation Context' || CHR(10) || CHR(10)),
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
        v_instructions := 
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
            '8. Handle NULL values appropriately' || CHR(10) ||
            '9. Use sample data to understand data format and content' || CHR(10);        
        DBMS_LOB.WRITEAPPEND(v_result, LENGTH(v_instructions), v_instructions);            
        
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
            v_error_msg := SQLERRM;
            log_error('BUILD_RAG_CONTEXT', NULL, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            RETURN 'Error building context: ' || v_error_msg;
    END build_rag_context;

    -- =============================================
    -- QUERY HISTORY
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
        v_error_msg VARCHAR2(4000);
    BEGIN
        v_query_id := 'Q' || TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') || 
                      '_' || LPAD(TO_CHAR(SEQ_RAG_QUERY_ID.NEXTVAL), 4, '0');
        
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
            v_error_msg := SQLERRM;
            log_error('SAVE_QUERY_HISTORY', NULL, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
    END save_query_history;

    -- =============================================
    -- STATUS FUNCTION
    -- =============================================
    
    FUNCTION get_vector_status RETURN SYS_REFCURSOR IS
        v_cursor SYS_REFCURSOR;
        v_error_msg VARCHAR2(4000);
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
    EXCEPTION
        WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            log_error('GET_VECTOR_STATUS', NULL, v_error_msg, DBMS_UTILITY.FORMAT_ERROR_BACKTRACE());
            RETURN NULL;
    END get_vector_status;

END RAG_VECTOR_SEARCH;
/

-- =====================================================
-- 10. TẠO VIEW TRẠNG THÁI
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
/

-- =====================================================
-- 11. VIEW LỖI (MỚI)
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
/

-- =====================================================
-- 12. VIEW MODEL STATUS (MỚI)
-- =====================================================

CREATE OR REPLACE VIEW V_RAG_MODEL_STATUS AS
SELECT 
    MODEL_NAME, ALGORITHM, MINING_FUNCTION, CREATION_DATE
FROM USER_MINING_MODELS
ORDER BY CREATION_DATE DESC;
/

-- =====================================================
-- 13. PROCEDURE TEST (ĐÃ SỬA)
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
/

-- =====================================================
-- 14. PROCEDURE KIỂM TRA TÍNH TOÀN VẸN (MỚI)
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
-- 15. GRANT PERMISSIONS (THÊM NẾU CẦN)
-- =====================================================

/*
-- Nếu cần cho user khác
GRANT EXECUTE ON RAG_VECTOR_SEARCH TO APP_USER;
GRANT SELECT ON V_RAG_VECTOR_STATUS TO APP_USER;
GRANT SELECT ON V_RAG_ERRORS TO APP_USER;
GRANT SELECT ON V_RAG_MODEL_STATUS TO APP_USER;
*/

-- =====================================================
-- 16. LOAD MODEL
-- =====================================================
BEGIN
    -- ADB có sẵn thư mục DATA_PUMP_DIR, không cần tạo directory riêng
    DBMS_CLOUD.GET_OBJECT(
        credential_name => NULL,   -- NULL vì đây là public PAR link
        directory_name  => 'DATA_PUMP_DIR',
        object_uri      => 'https://adwc4pm.objectstorage.us-ashburn-1.oci.customer-oci.com/p/eLddQappgBJ7jNi6Guz9m9LOtYe2u8LWY19GfgU8flFK4N9YgP4kTlrE9Px3pE12/n/adwc4pm/b/OML-Resources/o/all_MiniLM_L12_v2.onnx'
    );
END;
/

BEGIN
    DBMS_VECTOR.LOAD_ONNX_MODEL(
        directory  => 'DATA_PUMP_DIR',
        file_name  => 'all_MiniLM_L12_v2.onnx',
        model_name => 'ALL_MINILM_L12_V2'
    );
END;
/

-- =====================================================
-- 17. HƯỚNG DẪN SỬ DỤNG
-- =====================================================

/*
📌 HƯỚNG DẪN SỬ DỤNG - FIX PLS-00597

1. ⚡ BƯỚC 1: IMPORT MODEL (QUAN TRỌNG)
   --------------------------------------
   -- Kiểm tra model đã import:
   SELECT * FROM V_RAG_MODEL_STATUS;

   -- Hoặc dùng:
   SELECT RAG_VECTOR_SEARCH.is_model_available FROM DUAL;
   
2. 📦 BƯỚC 2: EXPORT SCHEMAS
   ---------------------------
   -- Export tất cả schemas của current user:
   EXEC RAG_VECTOR_SEARCH.export_all_schemas_to_vector;
   
   -- Export một schema cụ thể:
   EXEC RAG_VECTOR_SEARCH.export_schema_to_vector('NHA_DAU_TU');

3. 🔍 BƯỚC 3: TEST VECTOR SEARCH
   ------------------------------
   -- Test với câu hỏi:
   EXEC test_vector_search('Tổng số lượng cổ phiếu VIC của Nguyễn Văn An');
   
   -- Lấy context cho LLM (có kèm dữ liệu mẫu):
   SELECT RAG_VECTOR_SEARCH.build_rag_context('Tổng số lượng cổ phiếu VIC của Nguyễn Văn An') FROM DUAL;

4. 📊 BƯỚC 4: KIỂM TRA TRẠNG THÁI
   --------------------------------
   -- Kiểm tra trạng thái vectors:
   SELECT * FROM V_RAG_VECTOR_STATUS;
   
   -- Validate toàn bộ hệ thống:
   EXEC validate_rag_system;

5. 🔧 BƯỚC 5: QUẢN LÝ
   --------------------
   -- Xóa một schema:
   EXEC RAG_VECTOR_SEARCH.remove_schema_from_vector('TEMP_TABLE');
   
   -- Xóa tất cả:
   EXEC RAG_VECTOR_SEARCH.clear_all_vectors;
   
   -- Tái tạo embeddings (khi model được cập nhật):
   EXEC RAG_VECTOR_SEARCH.regenerate_all_embeddings;

6. 📈 BƯỚC 6: XEM LỊCH SỬ
   ------------------------
   SELECT * FROM RAG_QUERY_HISTORY ORDER BY CREATED_DATE DESC;

7. ⚠️ LƯU Ý VỀ LỖI PLS-00597 ĐÃ ĐƯỢC FIX
   -----------------------------------------
   - Nguyên nhân: Fetch vào collection không đúng kiểu
   - Đã sửa bằng cách sử dụng các biến đơn giản cho từng cột
   - Sử dụng TO_CHAR trong SQL để chuyển tất cả về VARCHAR2
   - Hỗ trợ tối đa 20 cột, nếu nhiều hơn sẽ thông báo
8. CLEANUP SCRIPT
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

BEGIN
    -- Xoá model cũ nếu có (tránh lỗi trùng tên)
    DBMS_VECTOR.DROP_ONNX_MODEL(
        model_name => 'ALL_MINILM_L12_V2',
        force      => TRUE
    );
EXCEPTION WHEN OTHERS THEN NULL;
END;   
*/