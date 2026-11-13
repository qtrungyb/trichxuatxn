function copyTableData() {
    if (state.currentData.length === 0) return showToast("Không có dữ liệu để copy!", true);
    let activeCols = getSortedActiveCols();
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
    html += `<tr>`;
    groupedCols.forEach(g => { html += `<th colspan="${g.count}" style="background-color: #f1f5f9; padding: 8px; ${FONT_STYLE} font-weight: bold; border: 1px solid #cbd5e1; text-transform: uppercase;">${g.name}</th>`; });
    html += `</tr><tr>`;
    displayCols.forEach(c => { html += `<th style="background-color: #ffffff; padding: 8px; ${FONT_STYLE} font-weight: bold; border: 1px solid #cbd5e1;">${c.label}</th>`; });
    html += `</tr>`;

    state.currentData.forEach((row, idx) => {
        html += `<tr>`;
        displayCols.forEach(col => {
            let val = '', extraStyle = '';
            if (col.key === 'stt') {
                val = idx + 1;
            } else if (col.key.startsWith('test_')) {
                let actualKey = col.key.replace('test_', '');
                val = row.tests[actualKey] || '';
                let ref = row.testRefRanges && row.testRefRanges[actualKey];
                if (ref && val) {
					let numVal = parseFloat(String(val).replace(',', '.'));
					if (Number.isFinite(numVal)) {
						let isLow  = (ref.min !== null && ref.min !== undefined && numVal < ref.min);
						let isHigh = (ref.max !== null && ref.max !== undefined && numVal > ref.max);
						if (isLow || isHigh) {
							let color = isLow ? '#2563eb' : '#dc2626';   // low = blue, high = red
							extraStyle = `font-weight: bold; color: ${color};`;
						}
					}
				}
            } else {
                val = row[col.key] || '';
            }
            let align = col.key === 'hoTen' ? 'left' : 'center';
            html += `<td style="padding: 6px 12px; border: 1px solid #cbd5e1; text-align: ${align}; ${FONT_STYLE} ${extraStyle}">${val}</td>`;
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
        if (document.execCommand('copy')) showToast("Đã Copy thành công!");
        else showToast("Lỗi Copy, vui lòng thử lại!", true);
    } catch (err) { showToast("Lỗi Copy, vui lòng thử lại!", true); }
    selection.removeAllRanges();
    copyDiv.innerHTML = '';
    document.getElementById('splitDropdown').classList.remove('show');
}

function exportExcel() {
    if (state.currentData.length === 0) return showToast("Không có dữ liệu để xuất!", true);
    let activeCols = getSortedActiveCols();
    if (activeCols.length === 0) return showToast("Vui lòng chọn ít nhất 1 cột!", true);

    let displayCols = [{ key: 'stt', label: 'STT', category: 'Thông tin Hành chính' }, ...activeCols];

    let wsData = [];
    let rowGroups = [], rowHeaders = [];

    displayCols.forEach(col => {
        rowGroups.push(formatCategoryName(col.category));
        rowHeaders.push(col.label);
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
    ws['!cols'] = displayCols.map(() => ({ wch: 18 }));

    let merges = [], startCol = 0, currentGroupName = rowGroups[0];
    for (let i = 0; i < rowGroups.length; i++) {
        if (rowGroups[i] !== currentGroupName) {
            if (i - 1 > startCol) merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: i - 1 } });
            currentGroupName = rowGroups[i];
            startCol = i;
        }
    }
    if (rowGroups.length - 1 > startCol) merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: rowGroups.length - 1 } });
    ws['!merges'] = merges;

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            let cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            if (!cell) continue;

            cell.s = {
                font: { name: "Times New Roman", sz: 11 },
                alignment: { horizontal: "center", vertical: "center", wrapText: true },
                border: {
                    top: { style: "thin", color: { rgb: "000000" } },
                    bottom: { style: "thin", color: { rgb: "000000" } },
                    left: { style: "thin", color: { rgb: "000000" } },
                    right: { style: "thin", color: { rgb: "000000" } }
                }
            };

            if (R === 0 || R === 1) {
                cell.s.font.bold = true;
                cell.s.fill = { fgColor: { rgb: "F1F5F9" } };
            }
            if (C === 1 && R > 1) {
                cell.s.alignment.horizontal = "left";
            }

            // Feature C: highlight bất thường trong Excel (không tô nền)
			if (R >= 2) {
				let colKey = displayCols[C] && displayCols[C].key;
				if (colKey && colKey.startsWith('test_')) {
					let actualKey = colKey.replace('test_', '');
					let row = state.currentData[R - 2];
					let ref = row && row.testRefRanges && row.testRefRanges[actualKey];
					if (ref) {
						let cellVal = cell.v;
						if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
							let numVal = parseFloat(String(cellVal).replace(',', '.'));
							if (Number.isFinite(numVal)) {
								let isLow  = (ref.min !== null && ref.min !== undefined && numVal < ref.min);
								let isHigh = (ref.max !== null && ref.max !== undefined && numVal > ref.max);
								if (isLow || isHigh) {
									cell.s.font.bold = true;
									cell.s.font.color = { rgb: isLow ? '2563EB' : 'DC2626' };
									// KHÔNG set cell.s.fill → giữ nền trắng
								}
							}
						}
					}
				}
			}
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KetQuaXN");
    XLSX.writeFile(wb, `KetQuaXN_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("Đã xuất file Excel có định dạng!");
    document.getElementById('splitDropdown').classList.remove('show');
}