pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

function extractReferenceRange(tail) {
    if (!tail) return null;
    const t = tail.replace(/\s+/g, ' ').trim();
    if (!t) return null;

    const rangeRe = /(\d+[.,]?\d*)\s*[-–—]\s*(\d+[.,]?\d*)/g;
    let matches = [...t.matchAll(rangeRe)];
    if (matches.length) {
        const last = matches[matches.length - 1];
        const min = parseFloat(last[1].replace(',', '.'));
        const max = parseFloat(last[2].replace(',', '.'));
        if (Number.isFinite(min) && Number.isFinite(max) && min < max && max < 100000) {
            return { min, max };
        }
    }
    const upper = t.match(/[<≤]\s*(\d+[.,]?\d*)/);
    if (upper) return { min: null, max: parseFloat(upper[1].replace(',', '.')) };
    const lower = t.match(/[>≥]\s*(\d+[.,]?\d*)/);
    if (lower) return { min: parseFloat(lower[1].replace(',', '.')), max: null };
    return null;
}

function setupDragAndDrop() {
    const heroInput = document.getElementById('pdfFileInputHero');
    const compactInput = document.getElementById('pdfFileInputCompact');
    const heroZone = document.getElementById('dropZoneHero');

    heroInput.addEventListener('change', function (e) {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length > 0) processBatchPDF(files, false);
    });
    compactInput.addEventListener('change', function (e) {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length > 0) processBatchPDF(files, true);
    });

    heroZone.addEventListener('dragover', (e) => { e.preventDefault(); heroZone.classList.add('dragover'); });
    heroZone.addEventListener('dragleave', (e) => { e.preventDefault(); heroZone.classList.remove('dragover'); });
    heroZone.addEventListener('drop', (e) => {
        e.preventDefault();
        heroZone.classList.remove('dragover');
        const pdfFiles = Array.from(e.dataTransfer.files || []).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith('.pdf'));
        if (pdfFiles.length > 0) processBatchPDF(pdfFiles, false);
        else showToast("Vui lòng chọn file định dạng PDF!", true);
    });
}

async function extractDataFromSinglePDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullTextLines = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            let lines = [];
            textContent.items.forEach(item => {
                if (!item.str.trim()) return;
                let y = item.transform[5];
                let x = item.transform[4];
                let foundLine = lines.find(line => Math.abs(line.y - y) <= 8);
                if (foundLine) foundLine.items.push({ text: item.str, x: x });
                else lines.push({ y: y, items: [{ text: item.str, x: x }] });
            });

            lines.sort((a, b) => b.y - a.y);
            lines.forEach(line => {
                let lineStr = line.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim();
                if (lineStr) fullTextLines.push(lineStr);
            });
        }

        let data = {
            hoTen: '', tuoi: '', gioiTinh: '',
            tests: {}, testCategories: {}, testRefRanges: {}
        };
        let currentCategory = "Xét nghiệm khác";

        // ====== TRACKER CHO KẾT QUẢ KHÁM ======
        let examResults = { chuyenKhoa: [], xQuang: [], sieuAm: [], noiSoi: [] };
        let pendingRequest = { type: null, name: null };
        let inResultSection = null;
        let resultBuffer = [];
        let expectChuyenKhoaName = false;
        let expectXQuangName = false;

        const flushResult = () => {
            if (!inResultSection) return;
            const section = inResultSection;
            const name = pendingRequest.name;
            let content = resultBuffer.join(' ').replace(/\s+/g, ' ').trim();

            inResultSection = null;
            resultBuffer = [];
            pendingRequest = { type: null, name: null };

            if (!content) return;

            // Siêu âm & Nội soi: chỉ lấy đoạn KẾT LUẬN
            if (section === 'SA' || section === 'NS') {
                let klIdx = content.search(/K[ẾE]T\s*LU[ẬA]N/i);
                if (klIdx === -1) return;
                content = content.substring(klIdx);
                content = content.replace(/^#*\s*K[ẾE]T\s*LU[ẬA]N[:\s]*/i, '').trim();
                content = content.split(/(?:Ng[àa]y\s+\d|B[ÁA]C\s*S[ĨI]|L[ờo]i\s*d[ặa]n)/i)[0].trim();
            }

            let finalName = name;
            if (!finalName) {
                if (section === 'CK') finalName = 'Khám chuyên khoa';
                else if (section === 'XQ') finalName = 'Chẩn đoán hình ảnh';
                else if (section === 'SA') finalName = 'Siêu âm';
                else if (section === 'NS') finalName = 'Nội soi';
            }

            if (section === 'CK') examResults.chuyenKhoa.push({ ten: finalName, ketQua: content });
            else if (section === 'XQ') examResults.xQuang.push({ ten: finalName, ketQua: content });
            else if (section === 'SA') examResults.sieuAm.push({ ten: finalName, ketQua: content });
            else if (section === 'NS') examResults.noiSoi.push({ ten: finalName, ketQua: content });
        };

        for (let line of fullTextLines) {
            // ===== 1) YÊU CẦU KIỂM TRA (Siêu âm / Nội soi / X-quang) =====
            let reqMatch = line.match(/Y[êe]u\s*c[ầa]u\s*ki[ểe]m\s*tra:\s*(.+)/i);
            if (reqMatch) {
                flushResult();
                let reqText = reqMatch[1].trim();
                reqText = reqText.replace(/[#\s]*K[ẾE]T\s*QU[ẢA][\s\S]*$/i, '').trim();

                if (/si[êe]u\s*[âa]m/i.test(reqText)) {
                    pendingRequest = { type: 'SA', name: reqText.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim() };
                    inResultSection = 'SA';
                } else if (/n[ộo]i\s*soi/i.test(reqText)) {
                    pendingRequest = { type: 'NS', name: reqText.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim() };
                    inResultSection = 'NS';
                } else {
                    pendingRequest = { type: 'XQ', name: reqText.trim() };
                    inResultSection = 'XQ';
                }
                continue;
            }

            // ===== 2) YÊU CẦU KHÁM CHUYÊN KHOA =====
            if (/^Y[ÊE]U\s*C[ẦA]U\s*KH[ÁA]M\s*CHUY[ÊE]N\s*KHOA/i.test(line)) {
                flushResult();
                expectChuyenKhoaName = true;
                continue;
            }
            if (expectChuyenKhoaName) {
                expectChuyenKhoaName = false;
                let specName = line.trim();
                if (specName && !/^(Ng[àa]y|B[ÁA]C|H[ọo])/i.test(specName)) {
                    pendingRequest = { type: 'CK', name: specName };
                }
                continue;
            }

            // ===== 3) YÊU CẦU CHIẾU/CHỤP =====
            if (/^Y[ÊE]U\s*C[ẦA]U\s*CHI[ẾE]U\/CH[ỤU]P/i.test(line)) {
                flushResult();
                expectXQuangName = true;
                continue;
            }
            if (expectXQuangName) {
                expectXQuangName = false;
                let xqName = line.trim();
                if (xqName) {
                    pendingRequest = { type: 'XQ', name: xqName.replace(/\s*\[.*?\]\s*/g, ' ').replace(/\s+/g, ' ').trim() };
                }
                continue;
            }

            // ===== 4) MARKER BẮT ĐẦU KẾT QUẢ (fallback) =====
            if (!inResultSection) {
                if (line.includes('KẾT QUẢ KHÁM CHUYÊN KHOA')) {
                    inResultSection = 'CK'; continue;
                }
                if (line.includes('KẾT QUẢ CHIẾU/CHỤP')) {
                    inResultSection = 'XQ'; continue;
                }
                if (line.includes('KẾT QUẢ SIÊU ÂM')) {
                    inResultSection = 'SA'; continue;
                }
            }

            // ===== 5) BUFFER HOẶC KẾT THÚC =====
            if (inResultSection) {
                const isSAorNS = (inResultSection === 'SA' || inResultSection === 'NS');
                const bufferStr = resultBuffer.join(' ');
                const hasConclusion = /K[ẾE]T\s*LU[ẬA]N/i.test(bufferStr);

                let isEnd = false;
                if (/Ng[àa]y\s+\d|B[ÁA]C\s*S[ĨI]|H[ọo]\s*v[àa]\s*t[êe]n\s*:|L[ờo]i\s*d[ặa]n|Signature\s*valid/i.test(line)) {
                    if (isSAorNS) {
                        if (hasConclusion) isEnd = true;
                    } else {
                        isEnd = true;
                    }
                }

                if (isEnd) {
                    flushResult();
                    continue;
                }

                if (line.includes('KẾT QUẢ SIÊU ÂM') || line.includes('KẾT QUẢ CHIẾU/CHỤP') ||
                    line.includes('KẾT QUẢ KHÁM CHUYÊN KHOA') || /^M[ôo]\s*t[ảa]$/i.test(line)) {
                    continue;
                }

                resultBuffer.push(line);
                continue;
            }

            // ===== 6) PARSE XÉT NGHIỆM =====
            // 🔥 FIX: `continue` thay vì `return` — tránh thoát cả hàm khi gặp dòng bảng kê
            if (/Thu\s*ph[íi]|BHYT|Miễn\s*ph[íi]|(?:^|\s)Lần(?:\s|$)/i.test(line)) continue;
            if (/(\d{1,3}(?:[.,]\d{3})+)\s*(?:đ|₫)?/i.test(line) && /(?:STT|Nội dung|Đối tượng|Đơn giá|Thành tiền)/i.test(line)) continue;

            let catMatch = line.match(/^(Xét nghiệm\s+(?:huyết học|Vi sinh|hóa sinh|nước tiểu|đông máu|miễn dịch).*)/i);
            if (catMatch) { currentCategory = catMatch[1].replace(/\(.*?\)/g, '').trim(); continue; }
            if (line.match(/^(Huyết học|Hóa sinh|Nước tiểu|Vi sinh)/i)) { currentCategory = "Xét nghiệm " + line.replace(/\(.*?\)/g, '').trim(); continue; }

            if (line.includes('Họ và tên:')) {
                let mTen = line.match(/Họ và tên:\s*([^:]+?)(?:\s+(?:Địa chỉ|Khoa|Chẩn đoán|Giới tính|Tuổi|Ngày|Giờ|Đối tượng)|$)/i);
                if (mTen) data.hoTen = mTen[1].trim();
            }
            if (line.includes('Tuổi:')) {
                let mTuoi = line.match(/Tuổi:\s*(\d+)/i); if (mTuoi) data.tuoi = mTuoi[1].trim();
            }
            if (line.includes('Giới tính:')) {
                let mGT = line.match(/Giới tính:\s*(Nam|Nữ)/i); if (mGT) data.gioiTinh = mGT[1].trim();
            }

            if (line.match(/^(STT|Tên xét nghiệm|Xét nghiệm|Ngày|Trang|Kết quả in đậm)/i)) continue;
            if (line.includes('KHOA XÉT NGHIỆM') || line.includes('Người thực hiện')) continue;

            let cleanLine = line.replace(/^\s+|\s+$/g, '');
            let resultPattern = /((?:\+\/-|\+|\-)(?:\s*(?:neg|norm|[\d.,]+[A-Za-z%\/\^0-9]*))?|[\d.,]+[A-Za-z%\/\^0-9]*|Âm\s*tính|Dương\s*tính|neg|norm(?:\s*[\d.,]+[A-Za-z%\/\^0-9]*)?|Bình\s*thường|Không\s*phát\s*hiện|\(\+\)|\(-\))/i;
            let match = cleanLine.match(new RegExp(`^(\\d+)\\s+(.*?)\\s+${resultPattern.source}\\s+(.*)$`, 'i'));

            if (match) {
                let testName = match[2].trim().replace(/\s+/g, ' ');
                let testResult = match[3].trim();
                let tail = (match[4] || '').trim();

                if (/Thu\s*ph[íi]|BHYT|Miễn\s*ph[íi]/i.test(testName)) continue;
                if (/Thu\s*ph[íi]|BHYT|Miễn\s*ph[íi]/i.test(testResult)) continue;

                if (!/^[\d.,]+$/.test(testName)) {
                    if (!data.tests[testName]) {
                        data.tests[testName] = testResult;
                        data.testCategories[testName] = currentCategory;
                        let ref = extractReferenceRange(tail);
                        if (ref) data.testRefRanges[testName] = ref;
                    }
                }
            }
        }

        flushResult();

        // ====== CHUYỂN EXAM RESULTS THÀNH PSEUDO-TEST ======
        examResults.chuyenKhoa.forEach(r => {
            let key = `[CK] ${r.ten}`;
            data.tests[key] = r.ketQua;
            data.testCategories[key] = "Kết quả chuyên khoa";
        });
        examResults.xQuang.forEach(r => {
            let key = `[XQ] ${r.ten}`;
            data.tests[key] = r.ketQua;
            data.testCategories[key] = "Kết quả chẩn đoán hình ảnh";
        });
        examResults.sieuAm.forEach(r => {
            let key = `[SA] ${r.ten}`;
            data.tests[key] = r.ketQua;
            data.testCategories[key] = "Kết quả chẩn đoán hình ảnh";
        });
        examResults.noiSoi.forEach(r => {
            let key = `[NS] ${r.ten}`;
            data.tests[key] = r.ketQua;
            data.testCategories[key] = "Kết quả nội soi";
        });

        return data;
    } catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error("Không thể đọc file PDF này.");
    }
}

async function processBatchPDF(files, append = false) {
    const statusPillBtn = document.getElementById('statusPillBtn');
    const progressContainer = document.getElementById('progressContainer');
    const barFill = document.getElementById('progressBarFill');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const fileListEl = document.getElementById('fileList');

    statusPillBtn.style.display = 'inline-flex';
    progressContainer.style.transform = 'translateY(0px)';
    barFill.style.width = '0%';
    progressPercent.innerText = '0%';
    fileListEl.innerHTML = '';

    state.currentData = append ? [...state.currentData] : [];
    let validFiles = Array.from(files).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith('.pdf'));
    let total = validFiles.length, successCount = 0;

    for (let i = 0; i < total; i++) {
        let file = validFiles[i];
        progressText.innerText = `Đang đọc (${i + 1}/${total})`;
        let fileItemId = `file-${i}`;
        fileListEl.innerHTML += `<div class="file-item" id="${fileItemId}"><span class="file-item-name" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file.name}</span><span class="status-text" style="color:var(--text-muted); margin-left:8px;">Đang chờ...</span></div>`;
        let fileStatusEl = document.querySelector(`#${fileItemId} .status-text`);
        try {
            fileStatusEl.innerText = 'Đang đọc...';
            let data = await extractDataFromSinglePDF(file);
            // 🔥 FIX: guard phòng thủ — nếu hàm lỡ trả về falsy thì không crash
            if (!data || typeof data !== 'object') {
                data = { hoTen: '', tuoi: '', gioiTinh: '', tests: {}, testCategories: {}, testRefRanges: {} };
            }
            state.currentData.push(data);
            successCount++;
            fileStatusEl.innerText = 'Hoàn tất';
            fileStatusEl.style.color = 'var(--success)';
        } catch (error) {
            console.error('[processBatchPDF] File lỗi:', file.name, error);
            fileStatusEl.innerText = 'Lỗi';
            fileStatusEl.style.color = 'var(--danger)';
        }
        let percent = Math.round(((i + 1) / total) * 100);
        barFill.style.width = `${percent}%`;
        progressPercent.innerText = `${percent}%`;
    }
    progressText.innerText = `Xong`;
    setTimeout(() => { progressContainer.style.transform = 'translateY(-150%)'; }, 1200);

    rebuildDynamicColumns();
    if (!append || state.activeColumns.length === 0) state.activeColumns = getDefaultColumns();
    localStorage.setItem('vox_all_active_columns', JSON.stringify(state.activeColumns));

    renderTable();
    persistChanges(true);
    if (append && successCount > 0) showToast(`Đã thêm ${successCount} BN. Tổng: ${state.currentData.length}`);
}