/* ===== Tracheostomy Box Smart Scanner ===== */
(function(){
  'use strict';

  const SCANNER_STEP_IDS = ['intro', 'airway', 'trach_pick', 'trach_accessory', 'trach_tube', 'counting'];
  const FORM_TUBE_SIZES = ['2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6'];
  const KNOWN_TUBE_SIZES = ['2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7'];

  let trachScanState = {
    imageFile: null,
    imageUrl: '',
    imageSignature: '',
    ocrRunning: false,
    result: null
  };

  function escapeScanText(value){
    if(typeof escapeReportText === 'function') return escapeReportText(value);
    return String(value ?? '').replace(/[&<>'"]/g, function(ch){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' })[ch];
    });
  }

  function getTrachScannerHtml(){
    return '<section class="scan-card" id="trachBoxScanner" aria-label="Tracheostomy Box Smart Scanner">' +
      '<div class="scan-card-head">' +
        '<h4>📷 Scan Tracheostomy Box</h4>' +
        '<p>Take a close, straight photo of the label (REF, LOT, Use-by, I.D.). Avoid glare for best results.</p>' +
      '</div>' +
      '<div class="scan-card-body">' +
        '<div class="scan-upload-row">' +
          '<input type="file" class="scan-file-input" id="trachScanFileInput" accept="image/*" capture="environment">' +
          '<button type="button" class="scan-btn" id="trachScanUploadBtn">Take / Upload Photo</button>' +
        '</div>' +
        '<div class="scan-preview-wrap" id="trachScanPreviewWrap">' +
          '<img id="trachScanPreviewImg" alt="Tracheostomy box preview">' +
        '</div>' +
        '<div class="scan-status" id="trachScanStatus" role="status" aria-live="polite"></div>' +
        '<div class="scan-result" id="trachScanResult">' +
          '<div class="scan-result-head">' +
            '<strong>Detected values</strong>' +
            '<span class="scan-confidence" id="trachScanConfidence"></span>' +
          '</div>' +
          '<div class="scan-result-grid" id="trachScanResultGrid"></div>' +
          '<div class="scan-result-candidates" id="trachScanCandidates" hidden></div>' +
          '<p class="scan-warning">OCR may be inaccurate. Please verify tube size, type, and expiry date before submitting.</p>' +
        '</div>' +
        '<div class="scan-actions">' +
          '<button type="button" class="scan-btn" id="trachScanApplyBtn" disabled>Apply to Form</button>' +
          '<button type="button" class="scan-btn scan-btn--ghost" id="trachScanClearBtn">Clear Scan</button>' +
          '<button type="button" class="scan-btn scan-btn--ghost" id="trachScanEditBtn">Edit Manually</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function initTrachBoxScanner(){
    if(typeof Tesseract === 'undefined'){
      console.warn('Tesseract.js not loaded — Tracheostomy Box Smart Scanner disabled.');
    }
  }

  function setTrachScanStatus(message, type){
    const el = document.getElementById('trachScanStatus');
    if(!el) return;
    el.textContent = message || '';
    el.className = 'scan-status' + (message ? ' show' : '') + (type ? ' scan-status--' + type : '');
  }

  function revokeTrachScanImageUrl(){
    if(trachScanState.imageUrl){
      URL.revokeObjectURL(trachScanState.imageUrl);
      trachScanState.imageUrl = '';
    }
  }

  function clearTrachScan(silent){
    revokeTrachScanImageUrl();
    trachScanState.imageFile = null;
    trachScanState.imageSignature = '';
    trachScanState.ocrRunning = false;
    trachScanState.result = null;

    const fileInput = document.getElementById('trachScanFileInput');
    const previewWrap = document.getElementById('trachScanPreviewWrap');
    const previewImg = document.getElementById('trachScanPreviewImg');
    const result = document.getElementById('trachScanResult');
    const applyBtn = document.getElementById('trachScanApplyBtn');
    const candidates = document.getElementById('trachScanCandidates');

    if(fileInput) fileInput.value = '';
    if(previewWrap) previewWrap.classList.remove('show');
    if(previewImg) previewImg.removeAttribute('src');
    if(result) result.classList.remove('show');
    if(candidates){
      candidates.hidden = true;
      candidates.textContent = '';
    }
    if(applyBtn) applyBtn.disabled = true;
    if(!silent) setTrachScanStatus('', '');
  }

  function bindTrachScannerEvents(){
    const fileInput = document.getElementById('trachScanFileInput');
    const uploadBtn = document.getElementById('trachScanUploadBtn');
    const applyBtn = document.getElementById('trachScanApplyBtn');
    const clearBtn = document.getElementById('trachScanClearBtn');
    const editBtn = document.getElementById('trachScanEditBtn');

    if(uploadBtn && fileInput){
      uploadBtn.onclick = function(){ fileInput.click(); };
      fileInput.onchange = handleTrachImageUpload;
    }
    if(applyBtn) applyBtn.onclick = applyTrachScanToForm;
    if(clearBtn) clearBtn.onclick = function(){ clearTrachScan(false); };
    if(editBtn) editBtn.onclick = focusManualEntryFields;
  }

  function mountTrachBoxScanner(stepId){
    if(SCANNER_STEP_IDS.indexOf(stepId) === -1) return;
    const body = document.getElementById('entryWizardBody');
    if(!body || body.querySelector('#trachBoxScanner')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = getTrachScannerHtml();
    body.insertBefore(wrapper.firstElementChild, body.firstChild);
    bindTrachScannerEvents();

    if(trachScanState.imageUrl){
      const previewWrap = document.getElementById('trachScanPreviewWrap');
      const previewImg = document.getElementById('trachScanPreviewImg');
      if(previewWrap && previewImg){
        previewImg.src = trachScanState.imageUrl;
        previewWrap.classList.add('show');
      }
    }
    if(trachScanState.result) renderTrachScanPreview(trachScanState.result);
    if(trachScanState.ocrRunning) setTrachScanStatus('Reading box details…', 'loading');
  }

  async function handleTrachImageUpload(event){
    const file = event.target && event.target.files ? event.target.files[0] : null;
    if(!file || !file.type.startsWith('image/')){
      setTrachScanStatus('Please choose a valid image file.', 'error');
      return;
    }

    const signature = file.name + '|' + file.size + '|' + file.lastModified;
    if(signature === trachScanState.imageSignature && trachScanState.result){
      setTrachScanStatus('Scan result already available for this image.', 'info');
      return;
    }

    revokeTrachScanImageUrl();
    trachScanState.imageFile = file;
    trachScanState.imageSignature = signature;
    trachScanState.result = null;

    const previewWrap = document.getElementById('trachScanPreviewWrap');
    const previewImg = document.getElementById('trachScanPreviewImg');
    const applyBtn = document.getElementById('trachScanApplyBtn');
    const resultBox = document.getElementById('trachScanResult');

    trachScanState.imageUrl = URL.createObjectURL(file);
    if(previewImg) previewImg.src = trachScanState.imageUrl;
    if(previewWrap) previewWrap.classList.add('show');
    if(resultBox) resultBox.classList.remove('show');
    if(applyBtn) applyBtn.disabled = true;

    try{
      trachScanState.ocrRunning = true;
      setTrachScanStatus('Reading box details…', 'loading');
      const rawText = await runTrachOCR(file);
      const parsed = parseTrachBoxText(rawText);
      trachScanState.result = parsed;
      renderTrachScanPreview(parsed);

      if(parsed.confidence === 'failed'){
        setTrachScanStatus('Could not read the image clearly. Please retake the photo with better lighting or enter details manually.', 'error');
      }else{
        setTrachScanStatus('Box details detected. Review values, then click Apply to Form.', 'success');
      }
    }catch(error){
      console.error(error);
      setTrachScanStatus('Could not read the image clearly. Please retake the photo with better lighting or enter details manually.', 'error');
    }finally{
      trachScanState.ocrRunning = false;
    }
  }

  function fixOcrTypos(text){
    return String(text || '')
      .replace(/\r/g, '\n')
      .replace(/[|¦]/g, 'I')
      .replace(/\bCuff1ess\b/gi, 'Cuffless')
      .replace(/\bCuffIess\b/gi, 'Cuffless')
      .replace(/\bTracheostorny\b/gi, 'Tracheostomy')
      .replace(/\bShi1ey\b/gi, 'Shiley')
      .replace(/\bUse\s*by\b/gi, 'Use-by')
      .replace(/\bUse-bv\b/gi, 'Use-by')
      .replace(/\bl\.?\s*d\.?\b/gi, 'I.D.')
      .replace(/\b0\.D\./gi, 'O.D.')
      .replace(/\bPE[F5T]\b/gi, 'PEF')
      .replace(/\b(\d)[.,](\d)\s*PEF\b/gi, '$1.$2PEF')
      .replace(/\(\s*17\s*\)/gi, '(17)')
      .replace(/\(\s*10\s*\)/gi, '(10)')
      .replace(/\(\s*01\s*\)/gi, '(01)');
  }

  function preprocessTrachImageForOCR(imageFile){
    return new Promise(function(resolve, reject){
      const img = new Image();
      const objectUrl = URL.createObjectURL(imageFile);
      img.onload = function(){
        try{
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const targetMax = 2600;
          const scale = Math.max(1.6, targetMax / Math.max(img.naturalWidth, img.naturalHeight, 1));
          const width = Math.round(img.naturalWidth * scale);
          const height = Math.round(img.naturalHeight * scale);
          canvas.width = width;
          canvas.height = height;
          ctx.filter = 'contrast(1.35) brightness(1.05)';
          ctx.drawImage(img, 0, 0, width, height);
          ctx.filter = 'none';

          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          for(let i = 0; i < data.length; i += 4){
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const contrast = 1.55;
            const adjusted = ((gray - 128) * contrast) + 128;
            const value = adjusted < 128 ? 0 : 255;
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
          }
          ctx.putImageData(imageData, 0, 0);
          URL.revokeObjectURL(objectUrl);
          resolve(canvas);
        }catch(error){
          URL.revokeObjectURL(objectUrl);
          reject(error);
        }
      };
      img.onerror = function(){
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not load image for OCR preprocessing'));
      };
      img.src = objectUrl;
    });
  }

  async function recognizeTrachImageSource(source, label){
    const result = await Tesseract.recognize(source, 'eng', {
      rotateAuto: true,
      logger: function(message){
        if(message.status === 'recognizing text' && typeof message.progress === 'number'){
          const pct = Math.round(message.progress * 100);
          setTrachScanStatus('Reading box details' + (label ? ' (' + label + ')' : '') + '… ' + pct + '%', 'loading');
        }
      }
    });
    return result && result.data && result.data.text ? result.data.text : '';
  }

  async function runTrachOCR(imageFile){
    if(typeof Tesseract === 'undefined'){
      throw new Error('OCR library not available');
    }

    const chunks = [];
    const originalText = await recognizeTrachImageSource(imageFile, 'photo');
    if(originalText) chunks.push(originalText);

    try{
      const enhancedCanvas = await preprocessTrachImageForOCR(imageFile);
      const enhancedText = await recognizeTrachImageSource(enhancedCanvas, 'enhanced');
      if(enhancedText) chunks.push(enhancedText);
    }catch(error){
      console.warn('Trach OCR preprocessing skipped:', error);
    }

    return fixOcrTypos(chunks.join('\n'));
  }

  function normalizeTextForParsing(text){
    return fixOcrTypos(text)
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectGS1Fields(text){
    const result = { expiryIso: '', lot: '', gtin: '' };
    const expMatch = text.match(/\(17\)\s*(\d{6})\b/);
    if(expMatch){
      const code = expMatch[1];
      result.expiryIso = toIsoDate('20' + code.substring(0, 2), code.substring(2, 4), code.substring(4, 6));
    }

    const lotMatch = text.match(/\(10\)\s*([A-Z0-9][A-Z0-9\-]{2,})/i);
    if(lotMatch) result.lot = lotMatch[1].trim();

    const gtinMatch = text.match(/\(01\)\s*(\d{8,14})/);
    if(gtinMatch) result.gtin = gtinMatch[1];

    return result;
  }

  function normalizeTubeSizeValue(sizeText){
    const num = parseFloat(String(sizeText).replace(',', '.'));
    if(Number.isNaN(num)) return '';
    const normalized = String(num);
    if(FORM_TUBE_SIZES.indexOf(normalized) !== -1) return normalized;
    const oneDecimal = num.toFixed(1);
    if(FORM_TUBE_SIZES.indexOf(oneDecimal) !== -1) return oneDecimal;
    if(num % 1 === 0 && FORM_TUBE_SIZES.indexOf(String(Math.round(num))) !== -1) return String(Math.round(num));
    let closest = FORM_TUBE_SIZES[0];
    let bestDiff = Math.abs(parseFloat(closest) - num);
    FORM_TUBE_SIZES.forEach(function(size){
      const diff = Math.abs(parseFloat(size) - num);
      if(diff < bestDiff){
        bestDiff = diff;
        closest = size;
      }
    });
    return bestDiff <= 0.25 ? closest : '';
  }

  function pushTubeSizeCandidate(candidates, seen, raw, score){
    const cleaned = String(raw).replace(',', '.').trim();
    if(!cleaned || seen[cleaned]) return;
    const num = parseFloat(cleaned);
    if(Number.isNaN(num) || num < 2 || num > 8) return;
    seen[cleaned] = true;
    candidates.push({
      raw: cleaned,
      formSize: normalizeTubeSizeValue(cleaned),
      score: score
    });
  }

  function detectTrachTubeSize(text){
    const candidates = [];
    const seen = {};
    const upper = text.toUpperCase();

    let match;
    const idPatterns = [
      /\b(\d+(?:[.,]\d+)?)\s*mm\s*I\.?\s*D\.?\b/gi,
      /\bI\.?\s*D\.?\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*mm\b/gi,
      /\bREF\s*(\d+(?:[.,]\d+)?)\s*PE[FDL]\b/gi,
      /\b(\d+(?:[.,]\d+)?)\s*PE[FDL]\b/gi
    ];
    idPatterns.forEach(function(pattern){
      while((match = pattern.exec(text)) !== null){
        pushTubeSizeCandidate(candidates, seen, match[1], 8);
      }
    });

    const sizePatterns = [
      /\b(?:size|sz)\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*(?:mm|ped|pdl)?\b/gi,
      /\b(\d+(?:[.,]\d+)?)\s*(?:mm)\s*(?:ped|pdl)\b/gi
    ];
    sizePatterns.forEach(function(pattern){
      while((match = pattern.exec(text)) !== null){
        pushTubeSizeCandidate(candidates, seen, match[1], 5);
      }
    });

    if(!candidates.length){
      const generic = /\b(\d\.\d)\b/g;
      while((match = generic.exec(text)) !== null){
        pushTubeSizeCandidate(candidates, seen, match[1], 2);
      }
    }

    candidates.sort(function(a, b){
      if(b.score !== a.score) return b.score - a.score;
      return parseFloat(a.raw) - parseFloat(b.raw);
    });

    const best = candidates.find(function(item){ return item.formSize; }) || candidates[0] || null;
    return {
      value: best && best.formSize ? best.formSize : (best ? normalizeTubeSizeValue(best.raw) : ''),
      refCode: (upper.match(/\bREF\s*([0-9.]+PE[FDL])\b/) || upper.match(/\b([0-9.]+PE[FDL])\b/))?.[1] || '',
      candidates: candidates.map(function(item){ return item.raw; })
    };
  }

  function detectTrachTubeType(text){
    const lower = text.toLowerCase();
    const found = {
      cuffed: /\bcuffed\b/i.test(lower) && !/\bcuffless\b/i.test(lower),
      uncuffed: /\bun[-\s]?cuffed\b/i.test(lower) || /\bcuffless\b/i.test(lower),
      fenestrated: /\bfenestrated\b/i.test(lower) || /\bPEF\b/i.test(text),
      nonFenestrated: /\bnon[-\s]?fenestrated\b/i.test(lower),
      pediatric: /\b(pediatric|paediatric|pdiatric)\b/i.test(lower) || /\bPE[FDL]\b/i.test(text),
      neonatal: /\b(neonatal|neonate)\b/i.test(lower) || /\bNEO\b/i.test(text),
      adult: /\badult\b/i.test(lower)
    };

    let tubeType = '';
    if(found.uncuffed) tubeType = 'Uncuffed';
    else if(found.cuffed) tubeType = 'Cuffed';

    let typeCategory = '';
    if(found.neonatal) typeCategory = 'Neonate';
    else if(found.pediatric) typeCategory = 'Pediatric';
    else if(found.adult) typeCategory = 'Pediatric';

    const labels = [];
    if(tubeType) labels.push(tubeType);
    if(found.fenestrated) labels.push('Fenestrated');
    if(found.nonFenestrated) labels.push('Non-fenestrated');
    if(typeCategory) labels.push(typeCategory);

    return {
      tubeType: tubeType,
      trachTypeCategory: typeCategory,
      label: labels.join(' · ') || '—'
    };
  }

  function pad2(n){ return String(n).padStart(2, '0'); }

  function lastDayOfMonth(year, month){
    return new Date(year, month, 0).getDate();
  }

  function toIsoDate(year, month, day){
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if(!y || !m || !d) return '';
    if(m < 1 || m > 12 || d < 1 || d > 31) return '';
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  function isoToSheetDate(iso){
    if(!iso) return '';
    const parts = iso.split('-');
    if(parts.length !== 3) return iso;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function normalizeExpiryDate(dateText){
    const text = String(dateText || '').trim();
    if(!text) return { iso: '', sheet: '', label: '' };

    let match;

    match = text.match(/\b(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?\b/);
    if(match){
      const year = match[1];
      const month = match[2];
      const day = match[3] || String(lastDayOfMonth(year, month));
      const iso = toIsoDate(year, month, day);
      return { iso: iso, sheet: isoToSheetDate(iso), label: text };
    }

    match = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if(match){
      let day = match[1];
      let month = match[2];
      let year = match[3];
      if(year.length === 2) year = '20' + year;
      const iso = toIsoDate(year, month, day);
      return { iso: iso, sheet: isoToSheetDate(iso), label: text };
    }

    match = text.match(/\b(\d{1,2})[-/.](\d{4})\b/);
    if(match){
      const month = match[1];
      const year = match[2];
      const day = String(lastDayOfMonth(year, month));
      const iso = toIsoDate(year, month, day);
      return { iso: iso, sheet: isoToSheetDate(iso), label: text };
    }

    return { iso: '', sheet: '', label: text };
  }

  function detectExpiryDates(text, gs1ExpiryIso){
    const candidates = [];
    const seen = {};

    if(gs1ExpiryIso){
      candidates.push({
        raw: 'GS1 (17)',
        iso: gs1ExpiryIso,
        sheet: isoToSheetDate(gs1ExpiryIso),
        score: 10
      });
      seen[gs1ExpiryIso] = true;
    }

    const patterns = [
      { regex: /use[-\s]?by\s*[:.]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/gi, score: 9 },
      { regex: /(?:exp(?:iry)?|best\s*before|exp\.?\s*date)\s*[:.]?\s*(\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?)/gi, score: 8 },
      { regex: /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/g, score: 4 },
      { regex: /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g, score: 3 },
      { regex: /\b(\d{1,2}[-/.]\d{4})\b/g, score: 2 }
    ];

    patterns.forEach(function(item){
      let match;
      while((match = item.regex.exec(text)) !== null){
        const raw = String(match[1] || match[0]).trim();
        const normalized = normalizeExpiryDate(raw);
        if(!normalized.iso || seen[normalized.iso]) continue;
        seen[normalized.iso] = true;
        candidates.push({
          raw: raw,
          iso: normalized.iso,
          sheet: normalized.sheet,
          score: item.score
        });
      }
    });

    candidates.sort(function(a, b){
      if(b.score !== a.score) return b.score - a.score;
      return (b.iso || '').localeCompare(a.iso || '');
    });

    const best = candidates.find(function(item){ return item.iso; }) || null;
    return {
      iso: best ? best.iso : '',
      sheet: best ? best.sheet : '',
      candidates: candidates.map(function(item){ return item.raw; })
    };
  }

  function isProductRefCode(value){
    return /^\d+(\.\d+)?PE[FDL]$/i.test(String(value || '').trim());
  }

  function detectLotOrBatch(text, gs1Lot){
    if(gs1Lot) return gs1Lot;

    const patterns = [
      /\bLOT\s*[:.]?\s*([A-Z0-9][A-Z0-9\-]{4,})\b/gi,
      /\bBatch\s*(?:No\.?|Number)?\s*[:.]?\s*([A-Z0-9][A-Z0-9\-]{4,})\b/gi
    ];

    for(let p = 0; p < patterns.length; p++){
      let match;
      while((match = patterns[p].exec(text)) !== null){
        const value = String(match[1]).trim();
        if(value.length >= 4 && !isProductRefCode(value)) return value;
      }
    }

    return '';
  }

  function detectQuantity(text){
    const patterns = [
      /(?:qty|quantity)\s*[:.]?\s*(\d{1,4})\b/i,
      /\bpack\s*of\s*(\d{1,4})\b/i,
      /\bx\s*(\d{1,4})\b/i,
      /\b(\d{1,4})\s*(?:pcs|pieces|units)\b/i
    ];
    for(let i = 0; i < patterns.length; i++){
      const match = text.match(patterns[i]);
      if(match) return String(parseInt(match[1], 10));
    }
    return '';
  }

  function detectTrachItem(text){
    const lower = text.toLowerCase();
    if(/\bsuction\s*catheter\b/i.test(lower)) return { trachItem: 'Accessory', trachAccessory: '', itemLabel: 'Suction Catheter (manual item)' };
    if(/\b(tracheostomy|trach)\s*tie\b/i.test(lower)) return { trachItem: 'Accessory', trachAccessory: 'Tracheostomy Tie', itemLabel: 'Tracheostomy Tie' };
    if(/\b(polymem\s*dressing|tracheostomy\s*dressing|dressing)\b/i.test(lower)) return { trachItem: 'Accessory', trachAccessory: 'Tracheostomy Polymem Dressing', itemLabel: 'Tracheostomy Polymem Dressing' };
    if(/\b(swedish\s*nose|hme|heat\s*moisture)\b/i.test(lower)) return { trachItem: 'Accessory', trachAccessory: 'Swedish Nose', itemLabel: 'Swedish Nose / HME' };
    if(/\b(tracheostomy|trach|tracheal)\s*tube\b/i.test(lower) || /\bcannula\b/i.test(lower)) return { trachItem: 'Tracheostomy Tube', trachAccessory: '', itemLabel: 'Tracheostomy Tube' };
    if(/\btracheostomy\b|\btrach\b|\btracheal\b|\btube\b|\bairway\b|\bcannula\b/i.test(lower)) return { trachItem: 'Tracheostomy Tube', trachAccessory: '', itemLabel: 'Tracheostomy Tube' };
    return { trachItem: 'Tracheostomy Tube', trachAccessory: '', itemLabel: 'Tracheostomy (review item)' };
  }

  function computeValidityFromIso(iso){
    if(!iso) return '';
    const exp = new Date(iso + 'T00:00:00');
    if(Number.isNaN(exp.getTime())) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((exp - today) / 86400000);
    if(diffDays < 0) return 'Expired';
    if(diffDays <= 90) return 'Near Expiry';
    return 'Valid';
  }

  function scoreParseResult(result){
    let score = 0;
    if(result.trachItem) score += 1;
    if(result.tubeSize) score += 2;
    if(result.tubeType) score += 1;
    if(result.expiryIso) score += 2;
    if(result.quantity) score += 1;
    if(result.lotBatch) score += 1;
    if(score >= 5) return 'high';
    if(score >= 3) return 'medium';
    if(score >= 1) return 'low';
    return 'failed';
  }

  function parseTrachBoxText(rawText){
    const text = normalizeTextForParsing(rawText);
    const gs1 = detectGS1Fields(text);
    const item = detectTrachItem(text);
    const tubeTypeInfo = detectTrachTubeType(text);
    const sizeInfo = detectTrachTubeSize(text);
    const expiryInfo = detectExpiryDates(text, gs1.expiryIso);
    const lotBatch = detectLotOrBatch(text, gs1.lot);
    const quantity = detectQuantity(text);

    const result = {
      rawText: text,
      category: 'Airway Items',
      airwayItem: 'Tracheostomy',
      trachItem: item.trachItem,
      trachAccessory: item.trachAccessory,
      trachTypeCategory: tubeTypeInfo.trachTypeCategory,
      tubeType: tubeTypeInfo.tubeType,
      tubeTypeLabel: tubeTypeInfo.label,
      tubeSize: sizeInfo.value,
      refCode: sizeInfo.refCode || '',
      expiryIso: expiryInfo.iso,
      expiryDate: expiryInfo.sheet,
      lotBatch: lotBatch,
      quantity: quantity,
      validity: computeValidityFromIso(expiryInfo.iso),
      itemLabel: item.itemLabel,
      sizeCandidates: sizeInfo.candidates,
      dateCandidates: expiryInfo.candidates,
      needsReview: {
        expiry: !expiryInfo.iso,
        size: !sizeInfo.value && sizeInfo.candidates.length > 0
      }
    };

    if(!result.quantity && /\btracheostomy\s*tube\b/i.test(text)) result.quantity = '1';

    result.confidence = text.length < 12 ? 'failed' : scoreParseResult(result);
    return result;
  }

  function renderTrachScanPreview(result){
    const resultBox = document.getElementById('trachScanResult');
    const grid = document.getElementById('trachScanResultGrid');
    const confidence = document.getElementById('trachScanConfidence');
    const candidates = document.getElementById('trachScanCandidates');
    const applyBtn = document.getElementById('trachScanApplyBtn');
    if(!resultBox || !grid || !confidence) return;

    const sizeDisplay = result.tubeSize
      ? (result.refCode ? result.tubeSize + ' (REF ' + result.refCode + ')' : result.tubeSize)
      : 'Needs manual review';

    const rows = [
      { key: 'category', label: 'Category', value: 'Airway Items → Tracheostomy' },
      { key: 'item', label: 'Item', value: result.itemLabel || '—' },
      { key: 'type', label: 'Type', value: result.tubeTypeLabel || result.tubeType || '—', review: !result.tubeType },
      { key: 'size', label: 'Size', value: sizeDisplay, review: result.needsReview.size || !result.tubeSize },
      { key: 'expiry', label: 'Expiry Date', value: result.expiryDate || 'Needs manual review', review: result.needsReview.expiry },
      { key: 'lot', label: 'Lot / Batch', value: result.lotBatch || '—' },
      { key: 'qty', label: 'Quantity', value: result.quantity || '1 (single box)' },
      { key: 'validity', label: 'Validity', value: result.validity || '—', review: !result.validity }
    ];

    grid.innerHTML = rows.map(function(row){
      const reviewClass = row.review ? ' needs-review' : '';
      return '<div class="scan-result-item' + reviewClass + '"><span>' + escapeScanText(row.label) +
        '</span><strong>' + escapeScanText(row.value) + '</strong></div>';
    }).join('');

    const confidenceMap = {
      high: ['High confidence', 'high'],
      medium: ['Review recommended', 'medium'],
      low: ['Low confidence', 'low'],
      failed: ['Could not read clearly', 'failed']
    };
    const conf = confidenceMap[result.confidence] || confidenceMap.low;
    confidence.textContent = conf[0];
    confidence.className = 'scan-confidence scan-confidence--' + conf[1];

    if(candidates){
      const notes = [];
      if(result.sizeCandidates && result.sizeCandidates.length > 1){
        notes.push('Possible sizes: ' + result.sizeCandidates.join(', '));
      }
      if(result.dateCandidates && result.dateCandidates.length > 1){
        notes.push('Possible dates: ' + result.dateCandidates.join(', '));
      }
      if(result.rawText && result.rawText.length > 20){
        notes.push('OCR preview: ' + result.rawText.slice(0, 180) + (result.rawText.length > 180 ? '…' : ''));
      }
      if(notes.length){
        candidates.hidden = false;
        candidates.textContent = notes.join(' · ');
      }else{
        candidates.hidden = true;
        candidates.textContent = '';
      }
    }

    resultBox.classList.add('show');
    if(applyBtn) applyBtn.disabled = result.confidence === 'failed';
  }

  function findFieldByIdOrName(fieldKey){
    const body = document.getElementById('entryWizardBody');
    if(!body) return null;
    return body.querySelector('[data-entry-field="' + fieldKey + '"]');
  }

  function findSelectOptionByText(selectEl, text){
    if(!selectEl || !text) return null;
    const target = String(text).trim().toLowerCase();
    const options = Array.from(selectEl.options || []);
    return options.find(function(opt){
      return String(opt.value).trim().toLowerCase() === target ||
        String(opt.textContent).trim().toLowerCase() === target;
    }) || null;
  }

  function triggerFieldChange(el){
    if(!el) return;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setRadioFieldValue(fieldKey, value){
    if(!value) return false;
    const radios = document.querySelectorAll('#entryWizardBody input[type="radio"][data-entry-field="' + fieldKey + '"]');
    let applied = false;
    radios.forEach(function(radio){
      const isMatch = String(radio.value) === String(value);
      radio.checked = isMatch;
      const card = radio.closest('.entry-choice-card');
      if(card) card.classList.toggle('selected', isMatch);
      if(isMatch) applied = true;
    });
    if(applied) triggerFieldChange(radios[0]);
    return applied;
  }

  function setFieldValueSafely(fieldKey, value){
    if(value === '' || value == null) return false;
    const el = findFieldByIdOrName(fieldKey);
    if(!el) return false;

    if(el.type === 'radio'){
      return setRadioFieldValue(fieldKey, value);
    }
    if(el.tagName === 'SELECT'){
      const option = findSelectOptionByText(el, value);
      if(option){
        el.value = option.value;
        triggerFieldChange(el);
        return true;
      }
      return false;
    }

    let nextValue = value;
    if(el.type === 'date' && window.PHDUEntryWizard && typeof window.PHDUEntryWizard.sheetDateToIso === 'function'){
      nextValue = window.PHDUEntryWizard.sheetDateToIso(value) || value;
    }

    el.value = nextValue;
    triggerFieldChange(el);
    return true;
  }

  function getStateValue(state, key){
    return state && state[key] ? String(state[key]).trim() : '';
  }

  function applyTrachScanToForm(){
    const result = trachScanState.result;
    if(!result || result.confidence === 'failed'){
      setTrachScanStatus('No reliable scan result to apply. Please scan again or enter manually.', 'warning');
      return;
    }

    const wizard = window.PHDUEntryWizard;
    if(!wizard || typeof wizard.setState !== 'function'){
      setTrachScanStatus('Entry wizard is not ready. Please try again.', 'error');
      return;
    }

    wizard.readFields();
    const current = wizard.getState();
    const isUnmappedItem = /suction\s*catheter/i.test(result.itemLabel || '');
    const patch = {
      category: 'Airway Items',
      airwayItem: 'Tracheostomy'
    };

    if(!isUnmappedItem){
      patch.trachItem = result.trachItem || 'Tracheostomy Tube';
    }

    if(patch.trachItem === 'Accessory' && result.trachAccessory){
      patch.trachAccessory = result.trachAccessory;
    }
    if(patch.trachItem === 'Tracheostomy Tube'){
      if(result.trachTypeCategory) patch.trachTypeCategory = result.trachTypeCategory;
      if(result.tubeType) patch.tubeType = result.tubeType;
      if(result.tubeSize) patch.tubeSize = result.tubeSize;
    }
    if(result.quantity) patch.quantity = result.quantity;
    else if(result.trachItem === 'Tracheostomy Tube') patch.quantity = '1';
    if(result.expiryDate) patch.expiryDate = result.expiryDate;

    const conflictKeys = Object.keys(patch).filter(function(key){
      const nextVal = getStateValue(patch, key);
      const curVal = getStateValue(current, key);
      return nextVal && curVal && nextVal !== curVal;
    });

    if(conflictKeys.length){
      const proceed = window.confirm('Some form fields already contain values. Apply scanned values anyway?');
      if(!proceed) return;
    }

    wizard.setState(patch);
    wizard.rerender();

    window.setTimeout(function(){
      Object.keys(patch).forEach(function(key){
        setFieldValueSafely(key, patch[key]);
      });
      wizard.readFields();
      if(isUnmappedItem){
        setTrachScanStatus('Category applied. Please select the detected accessory item manually before submitting.', 'warning');
      }else{
        setTrachScanStatus('Applied to form. Please verify tube size, type, and expiry date before submitting.', 'success');
      }
    }, 0);
  }

  function focusManualEntryFields(){
    const scanner = document.getElementById('trachBoxScanner');
    const firstField = document.querySelector('#entryWizardBody [data-entry-field]');
    if(firstField && typeof firstField.scrollIntoView === 'function'){
      firstField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if(typeof firstField.focus === 'function') firstField.focus();
    }else if(scanner && scanner.nextElementSibling){
      scanner.nextElementSibling.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTrachScanStatus('Continue entering details manually in the form below.', 'info');
  }

  window.initTrachBoxScanner = initTrachBoxScanner;
  window.mountTrachBoxScanner = mountTrachBoxScanner;
  window.handleTrachImageUpload = handleTrachImageUpload;
  window.runTrachOCR = runTrachOCR;
  window.parseTrachBoxText = parseTrachBoxText;
  window.normalizeExpiryDate = normalizeExpiryDate;
  window.detectTrachTubeSize = detectTrachTubeSize;
  window.detectTrachTubeType = detectTrachTubeType;
  window.detectLotOrBatch = detectLotOrBatch;
  window.detectQuantity = detectQuantity;
  window.renderTrachScanPreview = renderTrachScanPreview;
  window.applyTrachScanToForm = applyTrachScanToForm;
  window.clearTrachScan = clearTrachScan;
  window.setTrachScanStatus = setTrachScanStatus;
  window.findFieldByIdOrName = findFieldByIdOrName;
  window.findSelectOptionByText = findSelectOptionByText;
  window.setFieldValueSafely = setFieldValueSafely;
  window.triggerFieldChange = triggerFieldChange;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initTrachBoxScanner);
  }else{
    initTrachBoxScanner();
  }
})();
