/** Hàm chuyển đổi ký tự đặc biệt sang HTML entities */
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, '<br>'); 
}

/**
 * COPY VÀO EXCEL (Nâng cao)
 * @param {string} mode - 'visible' (cột đang hiển thị) | 'all' (tất cả) | 'abnormal' (chỉ số bất thường)
 */
function copyTableData(mode = 'visible') {
    if (state.currentData.length === 0) return showToast("Không có dữ liệu để copy!", true);
    
    let activeCols = (mode === 'all') ? getAllColumns() : getSortedActiveCols();
    
    // XỬ LÝ CHẾ ĐỘ CHỈ COPY BẤT THƯỜNG
    if (mode === 'abnormal') {
        let abnormalColKeys = new Set();
        state.currentData.forEach(row => {
            activeCols.forEach(c => {
                if (c.key.startsWith('test_')) {
                    let k = c.key.replace('test_', '');
                    let val = row.tests[k];
                    let ref = row.testRefRanges && row.testRefRanges[k];
                    if (ref && val) {
                        let numVal = parseFloat(String(val).replace(',', '.'));
                        if (Number.isFinite(numVal)) {
                            if ((ref.min !== null && numVal < ref.min) || (ref.max !== null && numVal > ref.max)) {
                                abnormalColKeys.add(c.key);
                            }
                        }
                    }
                }
            });
        });
        activeCols = activeCols.filter(c => abnormalColKeys.has(c.key) || c.category === 'Thông tin Hành chính');
        
        if (activeCols.filter(c => c.key.startsWith('test_')).length === 0) {
            return showToast("Không có chỉ số nào bất thường để copy!", true);
        }
    }

    if (activeCols.length === 0) return showToast("Vui lòng chọn ít nhất 1 cột!", true);

    let displayCols = [{ key: 'stt', label: 'STT', category: 'Thông tin Hành chính' }, ...activeCols];

    let groupedCols = [], currentGroup = null;
    displayCols.forEach(col => {
        let catName = formatCategoryName(col.category);
        if (!currentGroup || currentGroup.name !== catName) { currentGroup = { name: catName, count: 0 }; groupedCols.push(currentGroup); }
        currentGroup.count++;
    });

    const FONT_STYLE = "font-family: 'Times New Roman', Times, serif; font-size: 11pt;";
    let html = `<table border="1" cellspacing="0" cellpadding="0" style="border-collapse: collapse; text-align: center; ${FONT_STYLE}">`;
    
    // Render Header Nhóm
    html += `<tr>`;
    groupedCols.forEach(g => { 
        html += `<th colspan="${g.count}" style="background-color: #f1f5f9; padding: 8px; ${FONT_STYLE} font-weight: bold; border: 1px solid #cbd5e1; text-transform: uppercase;">${escapeHTML(g.name)}</th>`; 
    });
    html += `</tr><tr>`;
    
    // Render Header Tên Cột (Kèm khoảng tham chiếu)
    displayCols.forEach(c => { 
        let headerText = escapeHTML(c.label);
        if (c.refLabel) {
            headerText += `<br><span style="font-weight: normal; font-size: 10pt; color: #666;">${escapeHTML(c.refLabel)}</span>`;
        }
        html += `<th style="background-color: #ffffff; padding: 8px; ${FONT_STYLE} font-weight: bold; border: 1px solid #cbd5e1;">${headerText}</th>`; 
    });
    html += `</tr>`;

    // Render Body
    state.currentData.forEach((row, idx) => {
        html += `<tr>`;
        displayCols.forEach(col => {
            let val = '', extraStyle = '';
            let isExamResult = /^test_\[(?:CK|XQ|SA|NS)\]/.test(col.key);

            if (col.key === 'stt') {
                val = idx + 1;
            } else if (col.key.startsWith('test_')) {
                let actualKey = col.key.replace('test_', '');
                val = row.tests[actualKey] || '';

                if (!isExamResult) {
                    let ref = row.testRefRanges && row.testRefRanges[actualKey];
                    if (ref && val) {
                        let numVal = parseFloat(String(val).replace(',', '.'));
                        if (Number.isFinite(numVal)) {
                            let isLow  = (ref.min !== null && ref.min !== undefined && numVal < ref.min);
                            let isHigh = (ref.max !== null && ref.max !== undefined && numVal > ref.max);
                            if (isLow || isHigh) {
                                let color = isLow ? '#2563eb' : '#dc2626';
                                extraStyle = `font-weight: bold; color: ${color};`;
                                val = val + (isLow ? ' ↓' : ' ↑'); 
                            }
                        }
                    }
                }
            } else {
                val = row[col.key] || '';
            }

            let safeVal = escapeHTML(val);
            let align = col.key === 'hoTen' ? 'left' : 'center';
            let wrapStyle = isExamResult ? 'vertical-align: top; white-space: normal;' : '';
            if (isExamResult) align = 'left';

            html += `<td style="padding: 6px 12px; border: 1px solid #cbd5e1; text-align: ${align}; ${FONT_STYLE} ${extraStyle} ${wrapStyle}">${safeVal}</td>`;
        });
        html += `</tr>`;
    });
    html += `</table>`;

    let copyDiv = document.getElementById('hiddenCopyDiv');
    copyDiv.innerHTML = html;
    let range = document.createRange();
    range.selectNodeContents(copyDiv);
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    try {
        if (document.execCommand('copy')) {
            let msg = mode === 'all' ? 'tất cả dữ liệu' : (mode === 'abnormal' ? 'chỉ số bất thường' : 'cột hiển thị');
            showToast(`Đã Copy ${msg} thành công!`);
        } else {
            showToast("Lỗi Copy, vui lòng thử lại!", true);
        }
    } catch (err) { showToast("Lỗi Copy, vui lòng thử lại!", true); }
    
    selection.removeAllRanges();
    copyDiv.innerHTML = '';
    document.getElementById('splitDropdown').classList.remove('show');
}

/**
 * XUẤT EXCEL (Chuẩn Y Tế)
 */
function exportExcel() {
    if (state.currentData.length === 0) return showToast("Không có dữ liệu để xuất!", true);
    let activeCols = getSortedActiveCols();
    if (activeCols.length === 0) return showToast("Vui lòng chọn ít nhất 1 cột!", true);

    let displayCols = [{ key: 'stt', label: 'STT', category: 'Thông tin Hành chính' }, ...activeCols];
    const isExamCol = (key) => /^test_\[(?:CK|XQ|SA|NS)\]/.test(key);

    const today = new Date();
    const dateStr = today.toLocaleDateString('vi-VN');
    const timeStr = today.toLocaleTimeString('vi-VN');
    
    let wsData = [
        ["BỆNH VIỆN ĐA KHOA TRƯỜNG ĐỨC"],
        ["BÁO CÁO KẾT QUẢ XÉT NGHIỆM"],
        [`Ngày xuất: ${dateStr} - ${timeStr}`],
        [] 
    ];

    let rowGroups = [], rowHeaders = [];
    displayCols.forEach(col => {
        rowGroups.push(formatCategoryName(col.category));
        
        // Nối Khoảng tham chiếu vào Tên cột bằng ký tự xuống dòng \n
        let hLabel = col.label;
        if (col.refLabel) hLabel += `\n${col.refLabel}`;
        rowHeaders.push(hLabel);
    });

    wsData.push(rowGroups);
    wsData.push(rowHeaders);

    state.currentData.forEach((row, idx) => {
        let rowData = displayCols.map(col => {
            if (col.key === 'stt') return idx + 1;
            if (col.key.startsWith('test_')) {
                let k = col.key.replace('test_', '');
                return row.tests[k] || '';
            } else return row[col.key] || '';
        });
        wsData.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ép vùng dữ liệu (ref) bao phủ toàn bộ bảng, kể cả các ô trống
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: wsData.length - 1, c: displayCols.length - 1 } });

    ws['!cols'] = displayCols.map(col => {
        if (isExamCol(col.key)) return { wch: 50 };
        if (col.key === 'hoTen') return { wch: 25 };
        if (col.key === 'stt') return { wch: 8 };
        if (col.refLabel) return { wch: 18 }; // Rộng hơn chút để chứa range
        return { wch: 15 };
    });

    const lastColIndex = displayCols.length - 1;
    let merges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIndex } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIndex } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: lastColIndex } }
    ];

    let startCol = 0, currentGroupName = rowGroups[0];
    for (let i = 0; i < rowGroups.length; i++) {
        if (rowGroups[i] !== currentGroupName) {
            if (i - 1 > startCol) merges.push({ s: { r: 4, c: startCol }, e: { r: 4, c: i - 1 } });
            currentGroupName = rowGroups[i];
            startCol = i;
        }
    }
    if (rowGroups.length - 1 > startCol) merges.push({ s: { r: 4, c: startCol }, e: { r: 4, c: rowGroups.length - 1 } });
    ws['!merges'] = merges;

    // ===== STYLE TOÀN BẢNG & KẺ BẢNG (XỬ LÝ TRIỆT ĐỂ Ô TRỐNG) =====
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            let cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            // TẠO Ô RỖNG NẾU CHƯA CÓ DỮ LIỆU ĐỂ GÁN VIỀN
            if (!cell) {
                cell = { t: 's', v: '' };
                ws[XLSX.utils.encode_cell({ r: R, c: C })] = cell;
            }

            // Style cơ bản
            cell.s = {
                font: { name: "Times New Roman", sz: 11 },
                alignment: { horizontal: "center", vertical: "center", wrapText: true },
                border: {
                    top: { style: "thin", color: { rgb: "000000" } }, // Viền đen rõ nét
                    bottom: { style: "thin", color: { rgb: "000000" } },
                    left: { style: "thin", color: { rgb: "000000" } },
                    right: { style: "thin", color: { rgb: "000000" } }
                }
            };

            // Header Block (Bỏ viền)
            if (R <= 3) {
                cell.s.border = {};
                if (R === 0) cell.s.font = { name: "Times New Roman", sz: 14, bold: true, color: { rgb: "2563EB" } };
                if (R === 1) cell.s.font = { name: "Times New Roman", sz: 16, bold: true, color: { rgb: "000000" } };
                if (R === 2) cell.s.font = { name: "Times New Roman", sz: 11, italic: true };
            }
            
            // Tiêu đề bảng (Nhóm & Tên cột)
            else if (R === 4 || R === 5) {
                cell.s.font = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "000000" } };
                cell.s.fill = { fgColor: { rgb: "F1F5F9" } }; 
            }
            
            // Dữ liệu bệnh nhân
            else {
                let dataRowIndex = R - 6; 

                if (dataRowIndex % 2 !== 0) cell.s.fill = { fgColor: { rgb: "F9FAFB" } };

                let colKey = displayCols[C] && displayCols[C].key;
                
                if (colKey === 'hoTen') cell.s.alignment.horizontal = "left"; 
                if (colKey && isExamCol(colKey)) {
                    cell.s.alignment.horizontal = "left";
                    cell.s.alignment.vertical = "top";
                }

                // Mũi tên cảnh báo
                if (colKey && colKey.startsWith('test_') && !isExamCol(colKey)) {
                    let actualKey = colKey.replace('test_', '');
                    let row = state.currentData[dataRowIndex];
                    let ref = row && row.testRefRanges && row.testRefRanges[actualKey];
                    
                    if (ref && cell.v !== '' && cell.v !== null && cell.v !== undefined) {
                        let numVal = parseFloat(String(cell.v).replace(',', '.'));
                        if (Number.isFinite(numVal)) {
                            let isLow  = (ref.min !== null && ref.min !== undefined && numVal < ref.min);
                            let isHigh = (ref.max !== null && ref.max !== undefined && numVal > ref.max);
                            
                            if (isLow) {
                                cell.v = `${cell.v} ↓`;
                                cell.s.font = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: '2563EB' } };
                            } else if (isHigh) {
                                cell.v = `${cell.v} ↑`;
                                cell.s.font = { name: "Times New Roman", sz: 11, bold: true, color: { rgb: 'DC2626' } };
                            }
                        }
                    }
                }
            }
        }
    }

    ws['!freeze'] = { xSplit: "0", ySplit: "6" };
    ws['!pageSetup'] = { orientation: 'landscape', paperSize: 9, fitToWidth: 1, fitToHeight: 0 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KetQuaXN");
    XLSX.writeFile(wb, `KetQuaXN_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("Đã xuất file Excel chuẩn Y Tế!");
    document.getElementById('splitDropdown').classList.remove('show');
}