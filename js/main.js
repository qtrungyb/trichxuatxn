window.toggleThemeMenu = toggleThemeMenu;

window.openGuideModal = function() {
    document.getElementById('guideModal').classList.add('active');
};

window.closeGuideModal = function(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('guideModal').classList.remove('active');
};

window.setTableTheme = (theme) => {
    Array.from(document.body.classList).forEach(cls => {
        if (cls.startsWith('theme-')) document.body.classList.remove(cls);
    });

    if (theme !== 'default') {
        document.body.classList.add('theme-' + theme);
    }

    localStorage.setItem('vox_table_theme', theme);
    state.tableTheme = theme;

    document.querySelectorAll('#themeMenu .dropdown-item').forEach(el => {
        el.classList.toggle('active', el.dataset.theme === theme);
    });

    document.getElementById('themeMenu').classList.remove('show');

    if (typeof persistChanges === 'function') persistChanges(true);
};

// ================= DRAG & DROP COLUMN =================
let draggedColKey = null;
let isDraggingCol = false;

window.handleHeaderDragStart = (e, key) => {
    draggedColKey = key;
    isDraggingCol = true;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
};

window.handleHeaderDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

window.handleHeaderDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setTimeout(() => { isDraggingCol = false; }, 100);
};

/** Fix B: rebuild từ getSortedActiveCols() để luôn đầy đủ. */
window.handleHeaderDrop = (e, targetKey) => {
    e.preventDefault();
    e.currentTarget.style.opacity = '1';

    if (!draggedColKey || draggedColKey === targetKey) return;

    let order = getSortedActiveCols().map(c => c.key);

    [...state.customColumnOrder].forEach(k => {
        if (!order.includes(k)) order.push(k);
    });

    order = order.filter(k => k !== draggedColKey);
    let targetIdx = order.indexOf(targetKey);
    if (targetIdx === -1) order.push(draggedColKey);
    else order.splice(targetIdx, 0, draggedColKey);

    state.customColumnOrder = order;
    localStorage.setItem('vox_custom_column_order', JSON.stringify(order));

    draggedColKey = null;
    renderTable();
    persistChanges(true);
};

window.handleSort = (colKey) => {
    if (isDraggingCol) return;

    if (state.sortCol === colKey) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortCol = colKey;
        state.sortDir = 'asc';
    }

    state.currentData.sort((a, b) => {
        let getVal = (row) => {
            if (colKey.startsWith('test_')) {
                return row.tests[colKey.replace('test_', '')] || '';
            } else {
                return row[colKey] || '';
            }
        };

        let valA = getVal(a);
        let valB = getVal(b);

        let numA = parseFloat(valA);
        let numB = parseFloat(valB);

        if (!isNaN(numA) && !isNaN(numB)) {
            return state.sortDir === 'asc' ? numA - numB : numB - numA;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return state.sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
    });

    renderTable();
};

window.toggleDarkMode = toggleDarkMode;
window.toggleDensity = toggleDensity;
window.toggleHistoryDrawer = toggleHistoryDrawer;
window.toggleColumnDrawer = toggleColumnDrawer;
window.closeAllDrawers = closeAllDrawers;
window.toggleFileDrawer = toggleFileDrawer;
window.closePreview = closePreview;
window.copyTableData = copyTableData;
window.exportExcel = exportExcel;
window.renderColumnDrawer = renderColumnDrawer;
window.renderTable = renderTable;
window.showToast = showToast;

window.toggleSplitDropdown = function(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('splitDropdown');
    dropdown.classList.toggle('show');
};

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('splitDropdown');
    if (dropdown && dropdown.classList.contains('show')) {
        const splitBtn = dropdown.closest('.split-btn');
        if (splitBtn && !splitBtn.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    }
});

window.updateData = (rowIndex, key, newValue) => {
    if (newValue === '-') newValue = '';
    if (key.startsWith('test_')) {
        let actualKey = key.replace('test_', '');
        state.currentData[rowIndex].tests[actualKey] = newValue;
    } else state.currentData[rowIndex][key] = newValue;
    persistChanges(false);
};

/**
 * Feature C: Re-evaluate 1 cell khi user rời focus — cập nhật badge
 * abnormal/text-badge/empty hiển thị ngay, không cần re-render cả bảng.
 */
window.refreshCellAbnormal = function(td, rowIndex, colKey) {
    if (!colKey.startsWith('test_')) return;
    let actualKey = colKey.replace('test_', '');
    let row = state.currentData[rowIndex];
    if (!row) return;

    let newVal = (td.innerText || '').trim();
    if (newVal === '-') newVal = ''; // empty-cell hiển thị dấu '-' → coi là rỗng

    if (!row.tests) row.tests = {};
    row.tests[actualKey] = newVal;

    if (newVal === '') {
        td.innerHTML = '<span class="empty-cell">-</span>';
        persistChanges(false);
        return;
    }

    let lowerVal = newVal.toLowerCase();
    if (lowerVal.includes('dương tính') || lowerVal === 'positive' || lowerVal === '+') {
        td.innerHTML = `<span class="badge-danger">${newVal}</span>`;
        persistChanges(false);
        return;
    }
    if (lowerVal.includes('âm tính') || lowerVal === 'negative' || lowerVal === '-') {
        td.innerHTML = `<span class="badge-success">${newVal}</span>`;
        persistChanges(false);
        return;
    }

    let ref = row.testRefRanges && row.testRefRanges[actualKey];
		if (ref) {
			let numVal = parseFloat(newVal.replace(',', '.'));
			if (Number.isFinite(numVal)) {
				let isLow  = (ref.min !== null && ref.min !== undefined && numVal < ref.min);
				let isHigh = (ref.max !== null && ref.max !== undefined && numVal > ref.max);
				if (isLow || isHigh) {
					let rangeStr = (ref.min !== null && ref.max !== null)
						? `${ref.min} - ${ref.max}`
						: (ref.min !== null ? `≥ ${ref.min}` : `≤ ${ref.max}`);
					let suffix = isLow ? 'thấp' : 'cao';
					let cls    = isLow ? 'val-low' : 'val-high';
					td.innerHTML = `<span class="${cls}" title="Khoảng tham chiếu: ${rangeStr} (${suffix})">${newVal}</span>`;
					persistChanges(false);
					return;
				}
			}
		}

    td.innerText = newVal;
    persistChanges(false);
};

window.applyPreset = (presetType) => {
    if (presetType === 'clear') state.activeColumns = [];
    else if (presetType === 'all') state.activeColumns = getAllColumns().map(c => c.key);
    else if (presetType === 'default') state.activeColumns = getDefaultColumns();

    state.activeColumns = [...new Set(state.activeColumns)];
    localStorage.setItem('vox_all_active_columns', JSON.stringify(state.activeColumns));
    renderColumnDrawer();
    renderTable();
    scheduleFirebaseSync();
};

window.toggleColumn = (key, checkbox) => {
    if (checkbox.checked) { if (!state.activeColumns.includes(key)) state.activeColumns.push(key); }
    else state.activeColumns = state.activeColumns.filter(k => k !== key);
    localStorage.setItem('vox_all_active_columns', JSON.stringify(state.activeColumns));
    renderTable();
    scheduleFirebaseSync();

    const allCols = getAllColumns();
    document.getElementById('modalSelectedSummary').innerText = allCols.filter(c => state.activeColumns.includes(c.key)).length;
};

/** Fix A: clear với tombstone + xoá cloud ngay. */
window.clearCurrentWorkspace = () => {
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ dữ liệu hiện tại?")) return;

    state.currentData = [];
    state.dynamicTestCols = [];
    state.customColumnOrder = [];
    state.sortCol = null;
    state.sortDir = 'asc';
    state.previewHistoryId = null;

    localStorage.removeItem('vox_custom_column_order');
    localStorage.setItem('vox_current_data', '[]');
    // Tombstone: bản ghi cloud cũ hơn mốc này sẽ bị bỏ qua khi load
    localStorage.setItem('vox_last_cleared_at', String(Date.now()));

    document.getElementById('progressContainer').style.transform = 'translateY(-150%)';
    document.getElementById('statusPillBtn').style.display = 'none';
    document.getElementById('pdfFileInputHero').value = '';
    document.getElementById('pdfFileInputCompact').value = '';

    renderTable();
    persistChanges(true);
    clearWorkspaceOnCloud(); // Xoá cloud NGAY, huỷ timer debounce

    showToast("Đã làm mới bảng dữ liệu!");
};

/** Fix B: deep copy + lưu layout. */
window.saveToHistory = () => {
    if (state.currentData.length === 0) return showToast("Không có dữ liệu để lưu!", true);
    let history = JSON.parse(localStorage.getItem('vox_history')) || [];
    let newRecord = {
        id: Date.now(),
        time: new Date().toLocaleString('vi-VN'),
        count: state.currentData.length,
        data: JSON.parse(JSON.stringify(state.currentData)),
        customColumnOrder: [...state.customColumnOrder],
        activeColumns: [...state.activeColumns]
    };
    history.unshift(newRecord);
    localStorage.setItem('vox_history', JSON.stringify(history));
    window.renderHistory();

	if (state.firebaseInitState === 'ready') {
		saveHistoryToFirebase(newRecord).then(() => {
			showToast(`Đã lưu và đồng bộ Cloud!`);
		}).catch((err) => {
			console.error('[Firebase] Lưu lịch sử lỗi:', err);
			showToast("Đã lưu local — Cloud từ chối (kiểm tra Rules)!", true);
		});
	} else if (state.firebaseInitState === 'error') {
		showToast("Đã lưu local — Firebase chưa kết nối được!", true);
	} else {
		showToast("Đã lưu local — Firebase đang khởi tạo, thử lại sau!");
	}
};

window.renderHistory = function() {
    const history = JSON.parse(localStorage.getItem('vox_history')) || [];
    const listEl = document.getElementById('historyList');

    if (history.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding: 40px 0; color: var(--text-muted); font-size: 13px;">Chưa có lịch sử lưu trữ.</div>`;
        return;
    }

    const docIcon = `<svg class="svg-icon" style="color: var(--primary);" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

    listEl.innerHTML = history.map(item => {
        const data = item.data || [];
        const count = item.count || data.length;
        const isConfirmingDelete = (state.pendingDeleteHistoryId === item.id);
        const visiblePatients = data.slice(0, 3);
        const remaining = count - visiblePatients.length;
        const patientChips = visiblePatients.map(p => `<span class="patient-chip">${p.hoTen || 'BN'}</span>`).join('') +
                             (remaining > 0 ? `<span class="patient-chip" style="background:var(--primary-light);color:var(--primary);">+${remaining}</span>` : '');

        return `
        <div class="history-item">
            <div class="history-meta">
                <div class="history-time" style="display:flex; align-items:center; gap:6px;">${docIcon} ${item.time}</div>
                <div class="history-count">${count} BN</div>
            </div>
            <div class="history-patients">${patientChips || '<span style="font-size:12px; color:var(--text-muted);">Không có dữ liệu</span>'}</div>
            <div class="history-actions">
                <button class="btn" onclick="window.previewHistory(${item.id})">Xem</button>
                <button class="btn" onclick="window.loadHistory(${item.id})">Khôi phục</button>
                ${isConfirmingDelete
                    ? `<button class="btn" style="background:var(--danger); color:#fff; border-color:var(--danger);" onclick="window.confirmDeleteHistory(${item.id})">Xác nhận xoá</button>`
                    : `<button class="btn btn-icon-only danger" style="width:28px; height:28px;" onclick="window.requestDeleteHistory(${item.id})"><svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`
                }
            </div>
        </div>`;
    }).join('');
};

/** Fix B: khôi phục cả layout, ghi lại localStorage để F5 vẫn giữ. */
window.loadHistory = (id) => {
    let history = JSON.parse(localStorage.getItem('vox_history')) || [];
    let record = history.find(item => item.id === id);
    if (!record) return;

    state.currentData = JSON.parse(JSON.stringify(record.data || []));
    rebuildDynamicColumns();

    if (Array.isArray(record.customColumnOrder) && record.customColumnOrder.length > 0) {
        state.customColumnOrder = [...record.customColumnOrder];
    }
    if (Array.isArray(record.activeColumns) && record.activeColumns.length > 0) {
        state.activeColumns = [...record.activeColumns];
    } else if (state.activeColumns.length <= BASE_COLUMNS.length) {
        state.activeColumns = getDefaultColumns();
    }

    localStorage.setItem('vox_custom_column_order', JSON.stringify(state.customColumnOrder));
    localStorage.setItem('vox_all_active_columns', JSON.stringify(state.activeColumns));

    renderTable();
    closeAllDrawers();
    persistChanges(true);
    showToast("Đã khôi phục dữ liệu!");
};

window.requestDeleteHistory = (id) => {
    state.pendingDeleteHistoryId = id;
    window.renderHistory();
    setTimeout(() => {
        if (state.pendingDeleteHistoryId === id) {
            state.pendingDeleteHistoryId = null;
            window.renderHistory();
        }
    }, 3500);
};

window.confirmDeleteHistory = (id) => {
    state.pendingDeleteHistoryId = null;
    let history = JSON.parse(localStorage.getItem('vox_history')) || [];
    history = history.filter(item => item.id !== id);
    localStorage.setItem('vox_history', JSON.stringify(history));
    window.renderHistory();
    if (state.firebaseInitState === 'ready') {
        deleteHistoryFromFirebase(id).catch(err => console.error(err));
    }
};

window.previewHistory = (id) => {
    const history = JSON.parse(localStorage.getItem('vox_history')) || [];
    const record = history.find(item => item.id === id);
    if (!record) return showToast("Không tìm thấy!", true);

    state.previewHistoryId = id;
    document.getElementById('previewTime').innerText = record.time;
    const data = record.data || [];
    document.getElementById('previewCount').innerText = data.length;

    document.getElementById('previewTableBody').innerHTML = data.map((p, idx) => {
        const testsCount = Object.keys(p.tests || {}).length;
        return `<tr>
            <td style="text-align:center; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${idx + 1}</td>
            <td style="font-weight: 500;">${p.hoTen || '-'}</td>
            <td style="text-align:center;">${p.tuoi || '-'}</td>
            <td style="text-align:center;">${p.gioiTinh || '-'}</td>
            <td style="text-align:center;"><span style="font-family: 'JetBrains Mono', monospace; color: var(--primary);">${testsCount}</span></td>
        </tr>`;
    }).join('');

    document.getElementById('previewModal').classList.add('active');
};

window.restoreFromPreview = () => {
    if (state.previewHistoryId) {
        const id = state.previewHistoryId;
        closePreview();
        window.loadHistory(id);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('vox_dark_mode') === 'true') { document.body.classList.add('dark-mode'); updateDarkModeIcon(true); }
    if (localStorage.getItem('vox_compact_mode') === 'true') { document.body.classList.add('compact-mode'); }

    const savedTheme = localStorage.getItem('vox_table_theme') || 'default';
    window.setTableTheme(savedTheme);

    if (state.activeColumns.length === 0) state.activeColumns = BASE_COLUMNS.map(c => c.key);
    try {
        const savedData = JSON.parse(localStorage.getItem('vox_current_data') || '[]');
        if (Array.isArray(savedData) && savedData.length > 0) {
            state.currentData = savedData;
            rebuildDynamicColumns();
            if (!state.activeColumns || state.activeColumns.length === 0) state.activeColumns = getDefaultColumns();
        }
    } catch (e) {}

    renderTable();
    renderHistory();
    setupDragAndDrop();
    initFirebase();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Service Worker đã hoạt động! Scope:', registration.scope);
            })
            .catch(error => {
                console.error('Lỗi đăng ký Service Worker:', error);
            });
    });
}