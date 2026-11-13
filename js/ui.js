function toggleHistoryDrawer() {
    const drawer = document.getElementById('historyDrawer');
    const overlay = document.getElementById('drawerOverlay');
    const isActive = drawer.classList.contains('active');
    closeAllDrawers();
    if (!isActive) {
        drawer.classList.add('active');
        overlay.classList.add('active');
        document.getElementById('historyToggleBtn').classList.add('active');
    }
}

function toggleColumnDrawer() {
    const drawer = document.getElementById('columnDrawer');
    const overlay = document.getElementById('drawerOverlay');
    const isActive = drawer.classList.contains('active');
    closeAllDrawers();
    if (!isActive) {
        drawer.classList.add('active');
        overlay.classList.add('active');
        renderColumnDrawer();
    }
}

function closeAllDrawers() {
    document.querySelectorAll('.drawer').forEach(d => d.classList.remove('active'));
    document.getElementById('drawerOverlay').classList.remove('active');
    document.getElementById('historyToggleBtn').classList.remove('active');
}

function toggleFileDrawer() {
    const drawer = document.getElementById('progressContainer');
    if(drawer.style.transform === 'translateY(0px)') {
        drawer.style.transform = 'translateY(-150%)';
    } else {
        drawer.style.transform = 'translateY(0px)';
    }
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('active');
    state.previewHistoryId = null;
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.innerHTML = (isError ? '⚠️ ' : '✅ ') + message;
    toast.className = "show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

function updateDarkModeIcon(isDark) {
    document.getElementById('darkModeToggle').innerHTML = isDark
        ? `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
        : `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('vox_dark_mode', document.body.classList.contains('dark-mode'));
    updateDarkModeIcon(document.body.classList.contains('dark-mode'));
}

function toggleDensity() {
    document.body.classList.toggle('compact-mode');
    localStorage.setItem('vox_compact_mode', document.body.classList.contains('compact-mode'));
    showToast(document.body.classList.contains('compact-mode') ? "Đã bật chế độ thu gọn" : "Đã tắt chế độ thu gọn");
}

function updateWorkspaceStats() {
    const allCols = getAllColumns();
    const activeCount = allCols.filter(c => state.activeColumns.includes(c.key)).length;
    document.getElementById('statPatientsCount').innerText = state.currentData.length;
    document.getElementById('statColumnsCount').innerText = `${activeCount}/${allCols.length}`;

    const heroView = document.getElementById('uploadHeroContainer');
    const dataView = document.getElementById('dataWorkspace');

    if (state.currentData.length > 0) {
        heroView.style.display = 'none';
        dataView.classList.add('active');
    } else {
        heroView.style.display = 'flex';
        dataView.classList.remove('active');
    }
}

function renderTable() {
    updateWorkspaceStats();
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');

    if (state.currentData.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '';
        return;
    }

    let activeCols = getSortedActiveCols();
    if (activeCols.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = `<tr><td colspan="10" class="empty-table">Chưa có cột dữ liệu nào được chọn. Hãy bấm <b>Cột dữ liệu</b> để chọn.</td></tr>`;
        return;
    }

    let displayCols = [{ key: 'stt', label: 'STT', category: 'Thông tin Hành chính' }, ...activeCols];

    let groupedCols = [], currentGroup = null;
    displayCols.forEach(col => {
        let catName = col.category || 'Thông tin Hành chính';
        if (!currentGroup || currentGroup.name !== catName) {
            currentGroup = { name: catName, count: 0, dotClass: getDotClass(catName) };
            groupedCols.push(currentGroup);
        }
        currentGroup.count++;
    });

    let row1HTML = groupedCols.map(g => {
        let formattedName = formatCategoryName(g.name);
        let stickyClass = '';
        let stickyStyle = '';

        if (g.name === 'Thông tin Hành chính') {
            stickyClass = 'col-sticky col-sticky-last';
            stickyStyle = 'left: 0px; min-width: 410px; max-width: 410px;';
        }

        let borderClass = g.dotClass ? 'group-border-' + g.dotClass.replace('dot-', '') : 'group-border-khac';

        return `
        <th colspan="${g.count}" class="${stickyClass} ${borderClass}" style="${stickyStyle}">
            <span class="cat-group-title">
                <span class="color-dot ${g.dotClass}"></span> ${formattedName}
            </span>
        </th>
        `;
    }).join('');

    let stickyOffset = 0;
    let row2HTML = displayCols.map((c, i) => {
        let isGroupEnd = (i === displayCols.length - 1) || (displayCols[i+1].category !== c.category);
        let groupEndClass = isGroupEnd ? 'col-group-end' : '';

        let alignClass = 'text-center';
        if (c.key === 'hoTen') alignClass = 'text-left';

        let stickyStyle = '';
        let stickyClass = '';
        if (c.category === 'Thông tin Hành chính') {
            stickyClass = 'col-sticky';
            stickyStyle = `left: ${stickyOffset}px;`;

            let width = 0;
            if (c.key === 'stt') width = 50;
            else if (c.key === 'hoTen') width = 200;
            else if (c.key === 'tuoi') width = 70;
            else if (c.key === 'gioiTinh') width = 90;
            stickyOffset += width;

            if (isGroupEnd) stickyClass += ' col-sticky-last';
            stickyStyle += ` min-width: ${width}px; max-width: ${width}px;`;
        }

        let sortIcon = '';
        if (state.sortCol === c.key) {
            sortIcon = state.sortDir === 'asc' ? ' <span style="font-size:10px;">▲</span>' : ' <span style="font-size:10px;">▼</span>';
        }

        let cursorStyle = c.key === 'stt' ? 'default' : 'pointer';
        let onclickAttr = c.key === 'stt' ? '' : `onclick="window.handleSort('${c.key}')"`;

        let isTestCol = c.key.startsWith('test_');
        let draggableAttr = isTestCol ? `draggable="true" ondragstart="window.handleHeaderDragStart(event, '${c.key}')" ondragover="window.handleHeaderDragOver(event)" ondrop="window.handleHeaderDrop(event, '${c.key}')" ondragend="window.handleHeaderDragEnd(event)"` : '';
        let dragHandle = isTestCol ? `<svg class="drag-handle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px; color: var(--text-muted);"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>` : '';

        return `<th class="${groupEndClass} ${alignClass} ${stickyClass}" style="${stickyStyle} cursor: ${cursorStyle};" ${onclickAttr} ${draggableAttr}>
            <div style="display: inline-flex; align-items: center; justify-content: center;">
                ${dragHandle}
                <span>${c.label}${sortIcon}</span>
            </div>
        </th>`;
    }).join('');

    thead.innerHTML = `<tr class="tier-group">${row1HTML}</tr><tr class="tier-indicator">${row2HTML}</tr>`;

    tbody.innerHTML = state.currentData.map((row, rowIndex) => {
        let stickyOffset = 0;
        let tds = displayCols.map((col, i) => {
            let val = '', cellClass = '';
            if (col.key === 'stt') {
                val = rowIndex + 1;
                cellClass = 'col-data text-center';
            } else if (col.key.startsWith('test_')) {
                let actualKey = col.key.replace('test_', '');
                val = row.tests[actualKey] || '';
                cellClass = 'col-data';
            } else {
                val = row[col.key] || '';
                if (col.key !== 'hoTen') cellClass = 'col-data';
            }

            let isGroupEnd = (i === displayCols.length - 1) || (displayCols[i+1].category !== col.category);
            let groupEndClass = isGroupEnd ? 'col-group-end' : '';

            let alignClass = 'text-center';
            if (col.key === 'hoTen') alignClass = 'text-left';

            let stickyStyle = '';
            let stickyClass = '';
            if (col.category === 'Thông tin Hành chính') {
                stickyClass = 'col-sticky';
                stickyStyle = `left: ${stickyOffset}px;`;

                let width = 0;
                if (col.key === 'stt') width = 50;
                else if (col.key === 'hoTen') width = 200;
                else if (col.key === 'tuoi') width = 70;
                else if (col.key === 'gioiTinh') width = 90;
                stickyOffset += width;

                if (isGroupEnd) stickyClass += ' col-sticky-last';
                stickyStyle += ` min-width: ${width}px; max-width: ${width}px;`;
            }

            let displayVal = val;
            if (col.key !== 'stt') {
                if (val === '' || val === null || val === undefined) {
                    displayVal = '<span class="empty-cell">-</span>';
                } else {
                    let lowerVal = String(val).toLowerCase();
                    if (lowerVal.includes('dương tính') || lowerVal === 'positive' || lowerVal === '+') {
                        displayVal = `<span class="badge-danger">${val}</span>`;
                    } else if (lowerVal.includes('âm tính') || lowerVal === 'negative' || lowerVal === '-') {
                        displayVal = `<span class="badge-success">${val}</span>`;
                    } else if (col.key.startsWith('test_')) {
						// ===== Feature C: so sánh khoảng tham chiếu =====
						let actualKey = col.key.replace('test_', '');
						let ref = row.testRefRanges && row.testRefRanges[actualKey];
						if (ref) {
							let numVal = parseFloat(String(val).trim().replace(',', '.'));
							if (Number.isFinite(numVal)) {
								let isLow  = (ref.min !== null && ref.min !== undefined && numVal < ref.min);
								let isHigh = (ref.max !== null && ref.max !== undefined && numVal > ref.max);
								if (isLow || isHigh) {
									let rangeStr = (ref.min !== null && ref.max !== null)
										? `${ref.min} - ${ref.max}`
										: (ref.min !== null ? `≥ ${ref.min}` : `≤ ${ref.max}`);
									let suffix = isLow ? 'thấp' : 'cao';
									let cls    = isLow ? 'val-low' : 'val-high';
									displayVal = `<span class="${cls}" title="Khoảng tham chiếu: ${rangeStr} (${suffix})">${val}</span>`;
								}
							}
						}
					}
                }
            }

            let contentEditableAttr = col.key === 'stt' ? 'false' : 'true';
            let oninputAttr = col.key === 'stt' ? '' : `oninput="window.updateData(${rowIndex}, '${col.key}', this.innerText)"`;
            let onblurAttr = (col.key !== 'stt' && col.key.startsWith('test_'))
                ? `onblur="window.refreshCellAbnormal(this, ${rowIndex}, '${col.key}')"` : '';

            return `<td class="${cellClass} ${groupEndClass} ${alignClass} ${stickyClass}" style="${stickyStyle}" contenteditable="${contentEditableAttr}" spellcheck="false" data-row="${rowIndex}" data-col-index="${i}" data-key="${col.key}" ${oninputAttr} ${onblurAttr}>${displayVal}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
    }).join('');

    setupCrosshairHover();
}

function setupCrosshairHover() {
    const table = document.getElementById('dataTable');
    const container = document.getElementById('tableContainer');

    container.onmouseover = function(e) {
        let td = e.target.closest('td');
        if (!td) return;
        let tr = td.closest('tr');
        let colIndex = td.getAttribute('data-col-index');

        table.querySelectorAll('td, tr').forEach(el => el.classList.remove('cell-hover', 'row-hover'));

        if (tr) tr.classList.add('row-hover');

        if (colIndex !== null) {
            table.querySelectorAll(`td[data-col-index="${colIndex}"]`).forEach(el => el.classList.add('cell-hover'));
        }
    };

    container.onmouseleave = function() {
        table.querySelectorAll('td, tr').forEach(el => el.classList.remove('cell-hover', 'row-hover'));
    };
}

function renderColumnDrawer() {
    const keyword = document.getElementById('modalSearch').value.toLowerCase().trim();
    const listEl = document.getElementById('columnDrawerList');
    const isSearching = keyword.length > 0;

    const presetEl = document.getElementById('modalPresetRow');
    presetEl.innerHTML = `
        <button type="button" class="btn" style="padding: 4px 10px; font-size: 12px;" onclick="window.applyPreset('default')">${ICON_STAR} Mặc định</button>
        <button type="button" class="btn" style="padding: 4px 10px; font-size: 12px;" onclick="window.applyPreset('all')">${ICON_CHECK_ALL} Tất cả</button>
        <button type="button" class="btn" style="padding: 4px 10px; font-size: 12px; color: var(--danger);" onclick="window.applyPreset('clear')">${ICON_TRASH} Bỏ chọn</button>
    `;

    let cats = getAllCategories();
    let html = '';

    cats.forEach(cat => {
        let cols = cat === "Thông tin Hành chính" ? [...BASE_COLUMNS] : state.dynamicTestCols.filter(c => c.category === cat);

        cols.sort((a, b) => {
            let aSelected = state.activeColumns.includes(a.key) ? 1 : 0;
            let bSelected = state.activeColumns.includes(b.key) ? 1 : 0;
            return bSelected - aSelected;
        });

        if (isSearching) {
            cols = cols.filter(c => c.label.toLowerCase().includes(keyword));
        }
        if (cols.length === 0) return;

        let dotClass = getDotClass(cat);
        html += `<div class="setting-cat-title"><span class="color-dot ${dotClass}"></span> ${formatCategoryName(cat)}</div>`;

        cols.forEach(col => {
            let isChecked = state.activeColumns.includes(col.key);
            let sampleVal = (col.key === 'hoTen' || col.key === 'tuoi' || col.key === 'gioiTinh')
                ? (state.currentData[0] ? state.currentData[0][col.key] : '-')
                : (col.sampleResult || '-');
            html += `
                <label class="setting-item">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="window.toggleColumn('${col.key}', this)">
                    <span class="setting-label">${col.label}</span>
                    <span class="setting-sample">${sampleVal}</span>
                </label>
            `;
        });
    });

    if (html === '') html = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Không tìm thấy chỉ số phù hợp.</div>';
    listEl.innerHTML = html;

    const allCols = getAllColumns();
    document.getElementById('modalSelectedSummary').innerText = allCols.filter(c => state.activeColumns.includes(c.key)).length;
}

function toggleThemeMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('themeMenu');
    document.getElementById('splitDropdown').classList.remove('show');
    menu.classList.toggle('show');
}

document.addEventListener('click', (e) => {
    const themeMenu = document.getElementById('themeMenu');
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeMenu && themeMenu.classList.contains('show')) {
        if (!themeMenu.contains(e.target) && !themeBtn.contains(e.target)) {
            themeMenu.classList.remove('show');
        }
    }
});