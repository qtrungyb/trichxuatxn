function initFirebase() {
    try {
        if (typeof firebase === 'undefined' || !firebase.initializeApp) {
            console.error('[Firebase] SDK chưa load được (CDN bị chặn?)');
            state.firebaseInitState = 'error';
            if (typeof showToast === 'function')
                showToast("Không tải được Firebase SDK — chỉ lưu local!", true);
            return;
        }
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        state.firebaseDb = firebase.database();

        // Giữ dữ liệu đồng bộ kể cả khi offline → lần sau mở sẽ có cache
        try { state.firebaseDb.ref().keepSynced(true); } catch (e) {}

        state.firebaseInitState = 'ready';
        loadFromFirebase();
        loadHistoryFromFirebase();
        listenSharedHistory();
    } catch (e) {
        console.error('[Firebase] Init lỗi:', e);
        state.firebaseInitState = 'error';
        if (typeof showToast === 'function')
            showToast("Không kết nối được Cloud — chỉ lưu local!", true);
    }
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

        // Data rỗng: xoá node để không vi phạm .validate hasChildren
        if (!state.currentData || state.currentData.length === 0) {
            ref.remove().catch(err => console.error('[Firebase] Remove empty failed:', err));
            return;
        }

        const payload = {
            currentData: sanitizeDataForFirebase(state.currentData),
            activeColumns: state.activeColumns,
            updatedAt: Date.now(),
            deviceId: deviceId,
            tableTheme: state.tableTheme,
            customColumnOrder: state.customColumnOrder
        };
        ref.set(payload).catch(err => console.error('[Firebase] Sync failed:', err));
    } catch (e) { console.error('[Firebase] Sync exception:', e); }
}

/** Xoá workspace Cloud NGAY (không debounce), có đánh dấu updatedAt. */
function clearWorkspaceOnCloud() {
    if (state.firebaseInitState !== 'ready' || !state.firebaseDb) return Promise.resolve();
    if (state.firebaseSaveTimer) { clearTimeout(state.firebaseSaveTimer); state.firebaseSaveTimer = null; }
    try {
        const deviceId = getDeviceId();
        // XOÁ HẲN NODE: newData = null → Firebase BỎ QUA .validate
        return state.firebaseDb.ref('workspaces/' + deviceId).remove()
            .catch(err => console.error('[Firebase] Clear failed:', err));
    } catch (e) { console.error('[Firebase] Clear exception:', e); return Promise.resolve(); }
}

function loadFromFirebase() {
    if (!state.firebaseDb) return;
    try {
        const deviceId = getDeviceId();
        const ref = state.firebaseDb.ref('workspaces/' + deviceId);
        ref.once('value').then(snapshot => {
            const val = snapshot.val();

            // ===== FIX A: chống hồi sinh dữ liệu đã xoá =====
            const lastClearedAt = Number(localStorage.getItem('vox_last_cleared_at') || 0);
            const cloudUpdatedAt = Number((val && val.updatedAt) || 0);
            if (lastClearedAt && cloudUpdatedAt <= lastClearedAt) {
                scheduleFirebaseSync(0);
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

                // ===== FIX B: chỉ dùng cloud khi local rỗng hoặc cloud đầy đủ hơn =====
                if (val.customColumnOrder) {
                    const cloudOrder = firebaseArrayToArray(val.customColumnOrder);
                    const localOrder = JSON.parse(localStorage.getItem('vox_custom_column_order') || '[]');
                    if (cloudOrder.length > 0 && (localOrder.length === 0 || cloudOrder.length > localOrder.length)) {
                        state.customColumnOrder = cloudOrder;
                        localStorage.setItem('vox_custom_column_order', JSON.stringify(cloudOrder));
                    }
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
    }
    else { scheduleLocalSave(200); scheduleFirebaseSync(1000); }
}

/** Fix B: lưu layout vào bản ghi lịch sử. */
function saveHistoryToFirebase(record) {
    if (state.firebaseInitState !== 'ready' || !state.firebaseDb) return Promise.reject(new Error('Firebase not ready'));
    const data = {
        time: record.time,
        count: record.count,
        data: sanitizeDataForFirebase(record.data || []),
        customColumnOrder: record.customColumnOrder || [],
        activeColumns: record.activeColumns || []
    };
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
        merged.set(id, {
            id: id,
            time: item.time || '',
            count: item.count || 0,
            data: desanitizeDataFromFirebase(item.data || []),
            customColumnOrder: firebaseArrayToArray(item.customColumnOrder),
            activeColumns: firebaseArrayToArray(item.activeColumns)
        });
    });
    localHistory.forEach(h => {
        if (!tombstoned.has(h.id) && !merged.has(h.id)) merged.set(h.id, h);
    });
    return Array.from(merged.values()).sort((a, b) => b.id - a.id);
}

function loadHistoryFromFirebase() {
    if (!state.firebaseDb) return;

    // ĐỌC ĐÚNG ĐƯỜNG DẪN ĐÃ GHI — tránh lỗi rules granular
    Promise.all([
        state.firebaseDb.ref(SHARED_HISTORY_PATH).once('value'),
        state.firebaseDb.ref(SHARED_HISTORY_DELETED_PATH).once('value')
    ]).then(([sharedSnap, deletedSnap]) => {
        const shared  = sharedSnap.val()  || {};
        const deleted = deletedSnap.val() || {};

        const merged = mergeHistoryFromCloud(shared, deleted);
        const localHistory = JSON.parse(localStorage.getItem('vox_history')) || [];
        if (JSON.stringify(merged) !== JSON.stringify(localHistory)) {
            localStorage.setItem('vox_history', JSON.stringify(merged));
            if (typeof renderHistory === 'function') renderHistory();
        }

        // Đẩy các bản ghi LOCAL-ONLY (chưa có trên cloud) lên
        const cloudIds = new Set(Object.keys(shared).map(k => Number(k)));
        const toPush = merged.filter(h => !cloudIds.has(h.id) && !(deleted[h.id]));
        if (toPush.length > 0) {
            const updates = {};
            toPush.forEach(h => {
                updates[SHARED_HISTORY_PATH + '/' + h.id] = {
                    time: h.time,
                    count: h.count,
                    data: sanitizeDataForFirebase(h.data || []),
                    customColumnOrder: h.customColumnOrder || [],
                    activeColumns: h.activeColumns || []
                };
            });
            state.firebaseDb.ref().update(updates)
                .catch(err => console.error('[Firebase] Push local-only failed:', err));
        }
    }).catch(err => {
        console.error('[Firebase] Đọc lịch sử thất bại:', err);
        if (typeof showToast === 'function')
            showToast("Không tải được lịch sử từ Cloud — kiểm tra Rules!", true);
    });
}

function listenSharedHistory() {
    if (!state.firebaseDb) return;

    // Huỷ listener cũ nếu có
    if (state.sharedHistoryListener)
        state.firebaseDb.ref(SHARED_HISTORY_PATH).off('value', state.sharedHistoryListener);
    if (state.sharedHistoryDeletedListener)
        state.firebaseDb.ref(SHARED_HISTORY_DELETED_PATH).off('value', state.sharedHistoryDeletedListener);

    let cachedShared  = null;
    let cachedDeleted = null;

    const tryUpdate = () => {
        if (cachedShared === null || cachedDeleted === null) return;
        const merged = mergeHistoryFromCloud(cachedShared, cachedDeleted);
        const localHistory = JSON.parse(localStorage.getItem('vox_history')) || [];
        if (JSON.stringify(merged) !== JSON.stringify(localHistory)) {
            localStorage.setItem('vox_history', JSON.stringify(merged));
            if (typeof renderHistory === 'function') renderHistory();
        }
    };

    // LẮNG NGHE ĐÚNG ĐƯỜNG DẪN ĐÃ GHI
    state.sharedHistoryListener = state.firebaseDb.ref(SHARED_HISTORY_PATH)
        .on('value', snap => {
            cachedShared = snap.val() || {};
            tryUpdate();
        }, err => {
            console.error('[Firebase] Listener shared-history lỗi:', err);
            if (typeof showToast === 'function')
                showToast("Mất kết nối Cloud cho lịch sử — kiểm tra Rules!", true);
        });

    state.sharedHistoryDeletedListener = state.firebaseDb.ref(SHARED_HISTORY_DELETED_PATH)
        .on('value', snap => {
            cachedDeleted = snap.val() || {};
            tryUpdate();
        }, err => console.error('[Firebase] Listener shared_deleted lỗi:', err));
}