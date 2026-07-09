-- =====================================================
-- SỬ DỤNG CÁC FUNCTION/PROCEDURE
-- =====================================================

-- 1. Export một bảng ra Markdown (trả về CLOB)
SELECT RAG_EXPORT_MD.export_table_to_md('NHA_DAU_TU') FROM DUAL;

-- 2. Export một bảng và lưu vào bảng tạm
BEGIN
    RAG_EXPORT_MD.export_table_to_temp('NHA_DAU_TU');
END;
/

-- 3. Export nhiều bảng cùng lúc
SELECT RAG_EXPORT_MD.export_multiple_tables('NHA_DAU_TU,CHUNG_KHOAN,TAI_KHOAN_LUU_KY,GIAO_DICH_LUU_KY') FROM DUAL;

-- 4. Chỉ lấy schema
SELECT RAG_EXPORT_MD.get_table_schema('NHA_DAU_TU') FROM DUAL;

-- 5. Chỉ lấy dữ liệu mẫu
SELECT RAG_EXPORT_MD.get_sample_data('NHA_DAU_TU') FROM DUAL;

-- =====================================================
-- VÍ DỤ SỬ DỤNG THỰC TẾ
-- =====================================================

-- Export tất cả bảng
BEGIN
    export_all_tables_rag;
END;
/

-- Lấy document cho bảng cụ thể
SELECT get_rag_document('TAI_KHOAN_LUU_KY') FROM DUAL;

-- Xem danh sách đã export
SELECT * FROM V_RAG_DOCS;


-- =====================================================
-- VÍ DỤ SỬ DỤNG - TẠO PROMPT CHO LLM
-- =====================================================

-- Lấy prompt cho LLM
SELECT format_sql_question(
    'Lấy danh sách nhà đầu tư có số dư cổ phiếu VIC lớn hơn 1000',
    'TAI_KHOAN_LUU_KY'
) FROM DUAL;



-- =====================================================
-- TESTING - VÍ DỤ SỬ DỤNG THỰC TẾ
-- =====================================================

-- 1. Xuất dữ liệu training cho RAG
BEGIN
    RAG_CONTEXT.export_rag_training_data;
END;
/

-- 2. Tạo context cho câu hỏi cụ thể
SELECT RAG_CONTEXT.build_sql_context(
    'Tôi muốn biết tổng số lượng cổ phiếu VIC mà nhà đầu tư Nguyễn Văn An đang nắm giữ'
) FROM DUAL;

-- 3. Export một bảng cụ thể và xem kết quả
BEGIN
    RAG_EXPORT_MD.export_table_to_temp('NHA_DAU_TU');
END;
/

SELECT get_rag_document('NHA_DAU_TU') FROM DUAL;

-- 4. Xem danh sách các bảng đã export
SELECT * FROM V_RAG_DOCS;

-- 5. Tạo prompt hoàn chỉnh cho LLM
SELECT format_sql_question(
    'Liệt kê tất cả giao dịch lưu ký trong tháng 6/2024',
    'GIAO_DICH_LUU_KY'
) FROM DUAL;


SELECT LISTAGG(A.COLUMN_NAME || ' -> ' || P.TABLE_NAME || '(' || B.COLUMN_NAME || ')', '; ') 
WITHIN GROUP (ORDER BY A.POSITION)
INTO v_fk
FROM USER_CONS_COLUMNS A
JOIN USER_CONSTRAINTS C ON A.CONSTRAINT_NAME = C.CONSTRAINT_NAME  -- C là constraint của bảng con (CHUNG_KHOAN)
JOIN USER_CONSTRAINTS P ON C.R_CONSTRAINT_NAME = P.CONSTRAINT_NAME  -- P là constraint của bảng cha (LOAI_CK)
JOIN USER_CONS_COLUMNS B ON P.CONSTRAINT_NAME = B.CONSTRAINT_NAME  -- B là cột của bảng cha
WHERE UPPER(C.TABLE_NAME) = UPPER(p_table_name)
AND C.CONSTRAINT_TYPE = 'R'
AND A.POSITION = B.POSITION;