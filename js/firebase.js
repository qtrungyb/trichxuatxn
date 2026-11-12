function initFirebase() {
    try {
        if (typeof firebase === 'undefined' || !firebase.initializeApp) { state.firebaseInitState = 'error'; return; }
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        state.firebaseDb = firebase.database();
        state.firebaseInitState = 'ready';
        loadFromFirebase();
        loadHistoryFromFirebase();
        listenSharedHistory();
    } catch (e) { state.firebaseInitState = 'error'; }
}

function scheduleFirebaseSync(delay = 1000) {
    if (state.firebaseInitState !== 'ready' || !state.firebaseDb) return;
    if (state.firebaseSaveTimer) clearTimeout(state.firebaseSaveTimer);
    state.firebaseSaveTimer = setTimeout(syncToFirebase, delay);
}

function syncToFirebase() {
    if (state.firebaseInitState !== 'ready' || !state.firebaseDb) return;
    try {
        const deviceId = getDeviceId();
        const ref = state.firebaseDb.ref('workspaces/' + deviceId);
        const payload = { 
            currentData: sanitizeDataForFirebase(state.currentData), 
            activeColumns: state.activeColumns, 
            updatedAt: Date.now(), 
            deviceId: deviceId,
            tableTheme: state.tableTheme,
            customColumnOrder: state.customColumnOrder // THÊM DÒNG NÀY
        };
        ref.set(payload).catch(err => console.error('[Firebase] Sync failed:', err));
    } catch (e) { console.error('[Firebase] Sync exception:', e); }
}

function loadFromFirebase() {
    if (!state.firebaseDb) return;
    try {
        const deviceId = getDeviceId();
        const ref = state.firebaseDb.ref('workspaces/' + deviceId);
        ref.once('value').then(snapshot => {
            const val = snapshot.val();

            // ===== CHỐNG HỒI SINH DỮ LIỆU ĐÃ XÓA =====
            // Bản ghi cloud được ghi trước (hoặc đúng lúc) lần xóa gần nhất => bỏ qua.
            const lastClearedAt = Number(localStorage.getItem('vox_last_cleared_at') || 0);
            const cloudUpdatedAt = Number((val && val.updatedAt) || 0);
            if (lastClearedAt && cloudUpdatedAt <= lastClearedAt) {
                scheduleFirebaseSync(0);   // đẩy trạng thái hiện tại (rỗng) lên cloud
                return;
            }
            if (val && val.currentData) {
                const restored = desanitizeDataFromFirebase(val.currentData);
                
                if (val.tableTheme && state.tableTheme !== val.tableTheme) {
                    state.tableTheme = val.tableTheme;
                    localStorage.setItem('vox_table_theme', val.tableTheme);
                    Array.from(document.body.classList).forEach(cls => { if (cls.startsWith('theme-')) document.body.classList.remove(cls); });
                    if (val.tableTheme !== 'default') document.body.classList.add('theme-' + val.tableTheme);
                    document.querySelectorAll('#themeMenu .dropdown-item').forEach(el => { el.classList.toggle('active', el.dataset.theme === val.tableTheme); });
                }

                // TẢI THỨ TỰ CỘT TÙY CHỈNH TỪ CLOUD
                if (val.customColumnOrder && Array.isArray(val.customColumnOrder)) {
                    state.customColumnOrder = val.customColumnOrder;
                    localStorage.setItem('vox_custom_column_order', JSON.stringify(val.customColumnOrder));
                }

                if (restored.length > 0) {
                    if (state.currentData.length === 0) {
                        state.currentData = restored;
                        if (Array.isArray(val.activeColumns) && val.activeColumns.length > 0) state.activeColumns = val.activeColumns;
                        
                        rebuildDynamicColumns();
                        if (!state.activeColumns || state.activeColumns.length === 0) state.activeColumns = getDefaultColumns();
                        
                        localStorage.setItem('vox_current_data', JSON.stringify(state.currentData));
                        if (typeof renderTable === 'function') renderTable();
                        if (typeof showToast === 'function') showToast("Đã khôi phục dữ liệu từ Cloud!");
                    } else scheduleFirebaseSync(0);
                    return;
                }
            }
            if (state.currentData.length > 0) scheduleFirebaseSync(0);
        }).catch(err => console.error(err));
    } catch (e) { console.error(e); }
}

function scheduleLocalSave(delay = 200) {
    if (state.localSaveTimer) clearTimeout(state.localSaveTimer);
    state.localSaveTimer = setTimeout(() => {
        try { localStorage.setItem('vox_current_data', JSON.stringify(state.currentData)); } catch (e) {}
    }, delay);
}

function persistChanges(immediate = false) {
    if (immediate) {
        try { localStorage.setItem('vox_current_data', JSON.stringify(state.currentData)); } catch (e) {}
        scheduleFirebaseSync(0);
    } else {
        scheduleLocalSave(200);
        scheduleFirebaseSync(1000);
    }
}

function saveHistoryToFirebase(record) {
    if (state.firebaseInitState !== 'ready' || !state.firebaseDb) return Promise.reject(new Error('Firebase not ready'));
    const data = { time: record.time, count: record.count, data: sanitizeDataForFirebase(record.data || []) };
    return state.firebaseDb.ref(SHARED_HISTORY_PATH + '/' + record.id).set(data);
}

function deleteHistoryFromFirebase(id) {
    if (state.firebaseInitState !== 'ready' || !state.firebaseDb) return Promise.reject(new Error('Firebase not ready'));
    const updates = {};
    updates[SHARED_HISTORY_PATH + '/' + id] = null;
    updates[SHARED_HISTORY_DELETED_PATH + '/' + id] = Date.now();
    return state.firebaseDb.ref().update(updates);
}

function mergeHistoryFromCloud(cloud, deleted) {
    const localHistory = JSON.parse(localStorage.getItem('vox_history')) || [];
    const tombstoned = new Set(Object.keys(deleted || {}).map(k => Number(k)).filter(n => !isNaN(n) && n > 0));
    const merged = new Map();
    Object.keys(cloud || {}).forEach(k => {
        const id = Number(k);
        if (!id || tombstoned.has(id)) return;
        const item = cloud[k] || {};
        merged.set(id, { id: id, time: item.time || '', count: item.count || 0, data: desanitizeDataFromFirebase(item.data || []) });
    });
    localHistory.forEach(h => {
        if (!tombstoned.has(h.id) && !merged.has(h.id)) merged.set(h.id, h);
    });
    return Array.from(merged.values()).sort((a, b) => b.id - a.id);
}

function loadHistoryFromFirebase() {
    if (!state.firebaseDb) return;
    state.firebaseDb.ref('history').once('value').then(snap => {
        const val = snap.val() || {};
        const merged = mergeHistoryFromCloud(val.shared || {}, val.shared_deleted || {});
        const localHistory = JSON.parse(localStorage.getItem('vox_history')) || [];
        if (JSON.stringify(merged) !== JSON.stringify(localHistory)) {
            localStorage.setItem('vox_history', JSON.stringify(merged));
            if (typeof renderHistory === 'function') renderHistory();
        }
        const cloudIds = new Set(Object.keys(val.shared || {}).map(k => Number(k)));
        const toPush = merged.filter(h => !cloudIds.has(h.id) && !(val.shared_deleted && val.shared_deleted[h.id]));
        if (toPush.length > 0) {
            const updates = {};
            toPush.forEach(h => {
                updates[SHARED_HISTORY_PATH + '/' + h.id] = { time: h.time, count: h.count, data: sanitizeDataForFirebase(h.data || []) };
            });
            state.firebaseDb.ref().update(updates).catch(err => console.error(err));
        }
    }).catch(err => console.error(err));
}

function listenSharedHistory() {
    if (!state.firebaseDb) return;
    const ref = state.firebaseDb.ref('history');
    if (state.sharedHistoryListener) ref.off('value', state.sharedHistoryListener);
    state.sharedHistoryListener = ref.on('value', snap => {
        const val = snap.val() || {};
        const merged = mergeHistoryFromCloud(val.shared || {}, val.shared_deleted || {});
        const localHistory = JSON.parse(localStorage.getItem('vox_history')) || [];
        if (JSON.stringify(merged) !== JSON.stringify(localHistory)) {
            localStorage.setItem('vox_history', JSON.stringify(merged));
            if (typeof renderHistory === 'function') renderHistory();
        }
    }, err => console.error(err));
}