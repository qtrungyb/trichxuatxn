window.toggleThemeMenu = toggleThemeMenu; // Lấy từ ui.js

window.setTableTheme = (theme) => {
    // Xóa các class theme cũ
    Array.from(document.body.classList).forEach(cls => {
        if (cls.startsWith('theme-')) document.body.classList.remove(cls);
    });
    
    // Thêm class theme mới
    if (theme !== 'default') {
        document.body.classList.add('theme-' + theme);
    }
    
    localStorage.setItem('vox_table_theme', theme);
    state.tableTheme = theme; // Cập nhật state
    
    // Cập nhật dấu tick trên menu
    document.querySelectorAll('#themeMenu .dropdown-item').forEach(el => {
        el.classList.toggle('active', el.dataset.theme === theme);
    });
    
    // Đóng menu
    document.getElementById('themeMenu').classList.remove('show');
    
    // ĐỒNG BỘ LÊN FIREBASE NGAY LẬP TỨC
    if (typeof persistChanges === 'function') persistChanges(true);
};

// Thêm hàm xử lý Sắp xếp (bỏ vào ngay dưới hàm setTableTheme)
window.handleSort = (colKey) => {
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
        
        // Xử lý số (nếu có thể parse ra số)
        let numA = parseFloat(valA);
        let numB = parseFloat(valB);
        
        if (!isNaN(numA) && !isNaN(numB)) {
            return state.sortDir === 'asc' ? numA - numB : numB - numA;
        }
        
        // Xử lý chuỗi
        if (typeof valA === 'string' && typeof valB === 'string') {
            return state.sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
    });
    
    renderTable();
};

// Sửa lại phần khởi tạo DOMContentLoaded ở cuối file main.js
document.addEventListener('DOMContentLoaded', () => {
    // ... (giữ nguyên code cũ)
    if (localStorage.getItem('vox_dark_mode') === 'true') { document.body.classList.add('dark-mode'); updateDarkModeIcon(true); }
    if (localStorage.getItem('vox_compact_mode') === 'true') { document.body.classList.add('compact-mode'); }
    
    // THÊM DÒNG NÀY: Khôi phục màu chủ đề đã lưu
    const savedTheme = localStorage.getItem('vox_table_theme') || 'default';
    window.setTableTheme(savedTheme);
    
    // ... (giữ nguyên phần còn lại)
    if (state.activeColumns.length === 0) state.activeColumns = BASE_COLUMNS.map(c => c.key);
    // ...
});
// Gắn các hàm vào window để HTML có thể gọi qua onclick
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
    e.stopPropagation();
    document.getElementById('splitDropdown').classList.toggle('show');
};
document.addEventListener('click', () => {
    document.getElementById('splitDropdown').classList.remove('show');
});

window.updateData = (rowIndex, key, newValue) => {
    if (newValue === '-') newValue = ''; 
    if (key.startsWith('test_')) {
        let actualKey = key.replace('test_', '');
        state.currentData[rowIndex].tests[actualKey] = newValue;
    } else state.currentData[rowIndex][key] = newValue;
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

window.clearCurrentWorkspace = () => {
    if(!confirm("Bạn có chắc chắn muốn xóa toàn bộ dữ liệu hiện tại?")) return;
    state.currentData = []; state.dynamicTestCols = [];
    document.getElementById('progressContainer').style.transform = 'translateY(-150%)';
    document.getElementById('statusPillBtn').style.display = 'none';
    document.getElementById('pdfFileInputHero').value = '';
    document.getElementById('pdfFileInputCompact').value = '';
    renderTable();
    persistChanges(true);
    showToast("Đã làm mới bảng dữ liệu!");
};

window.saveToHistory = () => {
    if (state.currentData.length === 0) return showToast("Không có dữ liệu để lưu!", true);
    let history = JSON.parse(localStorage.getItem('vox_history')) || [];
    let newRecord = {
        id: Date.now(),
        time: new Date().toLocaleString('vi-VN'),
        count: state.currentData.length,
        data: state.currentData
    };
    history.unshift(newRecord);
    localStorage.setItem('vox_history', JSON.stringify(history));
    window.renderHistory();

    if (state.firebaseInitState === 'ready') {
        saveHistoryToFirebase(newRecord).then(() => {
            showToast(`Đã lưu và đồng bộ Cloud!`);
        }).catch(() => {
            showToast("Đã lưu local — Lỗi Cloud!", true);
        });
    } else {
        showToast(`Đã lưu local!`);
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

window.loadHistory = (id) => {
    let history = JSON.parse(localStorage.getItem('vox_history')) || [];
    let record = history.find(item => item.id === id);
    if (record) {
        state.currentData = record.data;
        rebuildDynamicColumns();
        if (state.activeColumns.length <= BASE_COLUMNS.length) state.activeColumns = getDefaultColumns();
        renderTable();
        closeAllDrawers();
        persistChanges(true);
        showToast("Đã khôi phục dữ liệu!");
    }
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

// Khởi tạo khi trang load xong
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('vox_dark_mode') === 'true') { document.body.classList.add('dark-mode'); updateDarkModeIcon(true); }
    if (localStorage.getItem('vox_compact_mode') === 'true') { document.body.classList.add('compact-mode'); }
    
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