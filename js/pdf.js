pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

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
                if (foundLine) {
                    foundLine.items.push({ text: item.str, x: x });
                } else {
                    lines.push({ y: y, items: [{ text: item.str, x: x }] });
                }
            });
            
            lines.sort((a, b) => b.y - a.y);
            lines.forEach(line => {
                let lineStr = line.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim();
                if (lineStr) fullTextLines.push(lineStr);
            });
        }
        
        let data = { hoTen: '', tuoi: '', gioiTinh: '', tests: {}, testCategories: {} };
        let currentCategory = "Xét nghiệm khác";
        
        fullTextLines.forEach(line => {
            let catMatch = line.match(/^(Xét nghiệm\s+(?:huyết học|Vi sinh|hóa sinh|nước tiểu|đông máu|miễn dịch).*)/i);
            if (catMatch) { currentCategory = catMatch[1].replace(/\(.*?\)/g, '').trim(); return; }
            if (line.match(/^(Huyết học|Hóa sinh|Nước tiểu|Vi sinh)/i)) { currentCategory = "Xét nghiệm " + line.replace(/\(.*?\)/g, '').trim(); return; }
            
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
            
            if (line.match(/^(STT|Tên xét nghiệm|Xét nghiệm|Ngày|Trang|Kết quả in đậm)/i)) return;
            if (line.includes('KHOA XÉT NGHIỆM') || line.includes('Người thực hiện')) return;
            
            let cleanLine = line.replace(/^\s+|\s+$/g, '');
            let resultPattern = /((?:\+\/-|\+|\-)(?:\s*(?:neg|norm|[\d.,]+[A-Za-z%\/\^0-9]*))?|[\d.,]+[A-Za-z%\/\^0-9]*|Âm\s*tính|Dương\s*tính|neg|norm(?:\s*[\d.,]+[A-Za-z%\/\^0-9]*)?|Bình\s*thường|Không\s*phát\s*hiện|\(\+\)|\(-\))/i;
            let match = cleanLine.match(new RegExp(`^(\\d+)\\s+(.*?)\\s+${resultPattern.source}\\s+(.*)$`, 'i'));
            
            if (match) {
                let testName = match[2].trim().replace(/\s+/g, ' ');
                let testResult = match[3].trim();
                
                if (!/^[\d.,]+$/.test(testName)) {
                    if (!data.tests[testName]) { 
                        data.tests[testName] = testResult; 
                        data.testCategories[testName] = currentCategory; 
                    }
                }
            }
        });
        return data;
    } catch (error) { throw new Error("Không thể đọc file PDF này."); }
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
            state.currentData.push(data);
            successCount++;
            fileStatusEl.innerText = 'Hoàn tất';
            fileStatusEl.style.color = 'var(--success)';
        } catch (error) {
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