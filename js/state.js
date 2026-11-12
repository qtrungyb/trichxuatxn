const BASE_COLUMNS = [
    { key: 'hoTen', label: 'Họ và tên', category: 'Thông tin Hành chính' },
    { key: 'tuoi', label: 'Tuổi', category: 'Thông tin Hành chính' },
    { key: 'gioiTinh', label: 'Giới tính', category: 'Thông tin Hành chính' }
];

const CATEGORY_ORDER = [
    "Thông tin Hành chính", "Xét nghiệm huyết học", "Xét nghiệm hóa sinh",
    "Xét nghiệm Vi sinh", "Xét nghiệm nước tiểu", "Xét nghiệm khác"
];

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCGjF5HdZ4-UQcjSoT2Qqou8rkGAAYVgY0",
    authDomain: "trichxuatcls.firebaseapp.com",
    databaseURL: "https://trichxuatcls-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "trichxuatcls",
    storageBucket: "trichxuatcls.firebasestorage.app",
    messagingSenderId: "106071797365",
    appId: "1:106071797365:web:fffbfe5b2a02bc9107923c"
};

const SHARED_HISTORY_PATH = 'history/shared';
const SHARED_HISTORY_DELETED_PATH = 'history/shared_deleted';

const state = {
    dynamicTestCols: [],
    activeColumns: JSON.parse(localStorage.getItem('vox_all_active_columns')) || [],
    currentData: [],
    pendingDeleteHistoryId: null,
    previewHistoryId: null,
    firebaseDb: null,
    firebaseInitState: 'idle',
    firebaseSaveTimer: null,
    localSaveTimer: null,
    sharedHistoryListener: null,
	sortCol: null,
    sortDir: 'asc',
	tableTheme: localStorage.getItem('vox_table_theme') || 'default'
};

const ICON_STAR = `<svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
const ICON_CHECK_ALL = `<svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
const ICON_TRASH = `<svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

function encodeKey(k) {
    if (k === null || k === undefined) return 'k_';
    const s = String(k).replace(/\./g, '__DOT__').replace(/#/g, '__HASH__').replace(/\$/g, '__DOLLAR__').replace(/\//g, '__SLASH__').replace(/\[/g, '__LBRACKET__').replace(/\]/g, '__RBRACKET__');
    return 'k_' + s;
}

function decodeKey(k) {
    if (k === null || k === undefined) return k;
    let s = String(k);
    if (s.startsWith('k_')) s = s.slice(2);
    return s.replace(/__DOT__/g, '.').replace(/__HASH__/g, '#').replace(/__DOLLAR__/g, '$').replace(/__SLASH__/g, '/').replace(/__LBRACKET__/g, '[').replace(/__RBRACKET__/g, ']');
}

function sanitizeDataForFirebase(data) {
    if (!Array.isArray(data)) return [];
    return data.map(row => {
        const newRow = { hoTen: row.hoTen || '', tuoi: row.tuoi || '', gioiTinh: row.gioiTinh || '', tests: {}, testCategories: {} };
        if (row.tests) Object.keys(row.tests).forEach(k => { newRow.tests[encodeKey(k)] = row.tests[k]; });
        if (row.testCategories) Object.keys(row.testCategories).forEach(k => { newRow.testCategories[encodeKey(k)] = row.testCategories[k]; });
        return newRow;
    });
}

function desanitizeDataFromFirebase(data) {
    let arr = data;
    if (!arr) return [];
    if (!Array.isArray(arr)) arr = Object.keys(arr).sort((a, b) => Number(a) - Number(b)).map(k => arr[k]);
    return arr.filter(r => r !== null && r !== undefined).map(row => {
        const newRow = { hoTen: row.hoTen || '', tuoi: row.tuoi || '', gioiTinh: row.gioiTinh || '', tests: {}, testCategories: {} };
        if (row.tests && typeof row.tests === 'object') Object.keys(row.tests).forEach(k => { newRow.tests[decodeKey(k)] = row.tests[k]; });
        if (row.testCategories && typeof row.testCategories === 'object') Object.keys(row.testCategories).forEach(k => { newRow.testCategories[decodeKey(k)] = row.testCategories[k]; });
        return newRow;
    });
}

function getDeviceId() {
    let id = localStorage.getItem('vox_device_id');
    if (!id) { 
        id = 'dev_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36); 
        localStorage.setItem('vox_device_id', id); 
    }
    return id;
}

function getAllColumns() { 
    return [...BASE_COLUMNS, ...state.dynamicTestCols]; 
}

function getSortedActiveCols() {
    let allCols = getAllColumns();
    let activeCols = allCols.filter(c => state.activeColumns.includes(c.key));
    activeCols.sort((a, b) => {
        let catA = a.category || 'Thông tin Hành chính';
        let catB = b.category || 'Thông tin Hành chính';
        let idxA = CATEGORY_ORDER.indexOf(catA), idxB = CATEGORY_ORDER.indexOf(catB);
        if (idxA === -1) idxA = 99; if (idxB === -1) idxB = 99;
        return idxA - idxB;
    });
    return activeCols;
}

function getDefaultColumns() {
    let defaults = [...BASE_COLUMNS.map(c => c.key)];
    state.dynamicTestCols.forEach(c => {
        let cat = (c.category || "").toLowerCase().trim();
        let label = (c.label || "").toLowerCase().trim();
        
        if (label.includes("amphetamin")) {
            defaults.push(c.key);
        }
        else if (cat.includes("hóa sinh") || cat.includes("vi sinh")) {
            defaults.push(c.key);
        }
        else if (cat.includes("huyết học")) {
            let targetLabels = ["số lượng hồng cầu", "huyết sắc tố", "số lượng tiểu cầu", "số lượng bạch cầu"];
            if (targetLabels.some(t => label.includes(t))) defaults.push(c.key);
        }
        else if (cat.includes("nước tiểu")) {
            if (label === "tỷ trọng" || label === "ph") defaults.push(c.key);
        }
    });
    return [...new Set(defaults)];
}

function getDotClass(catName) {
    const c = (catName || "").toLowerCase();
    if (c.includes("hành chính")) return "dot-hanh-chinh";
    if (c.includes("huyết học")) return "dot-huyet-hoc";
    if (c.includes("hóa sinh")) return "dot-hoa-sinh";
    if (c.includes("nước tiểu")) return "dot-nuoc-tieu";
    if (c.includes("vi sinh")) return "dot-vi-sinh";
    if (c.includes("đông máu") || c.includes("miễn dịch")) return "dot-dong-mau";
    return "dot-khac";
}

function formatCategoryName(name) {
    if (!name) return '';
    let clean = name.replace(/^(Xét nghiệm\s+)/i, '').trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function getAllCategories() {
    let cats = ["Thông tin Hành chính"];
    state.dynamicTestCols.forEach(col => { if (!cats.includes(col.category)) cats.push(col.category); });
    cats.sort((a, b) => {
        let idxA = CATEGORY_ORDER.indexOf(a), idxB = CATEGORY_ORDER.indexOf(b);
        if (idxA === -1) idxA = 99; if (idxB === -1) idxB = 99;
        return idxA - idxB;
    });
    return cats;
}

function rebuildDynamicColumns() {
    let testKeys = new Set();
    state.currentData.forEach(row => { if (row.tests) Object.keys(row.tests).forEach(k => testKeys.add(k)); });
    state.dynamicTestCols = Array.from(testKeys).map(k => {
        let cat = "Xét nghiệm khác";
        let sample = "-";
        for (let r of state.currentData) if (r.testCategories && r.testCategories[k]) { cat = r.testCategories[k]; break; }
        for (let r of state.currentData) if (r.tests && r.tests[k]) { sample = r.tests[k]; break; }
        return { key: `test_${k}`, label: k, category: cat, sampleResult: sample };
    });
}