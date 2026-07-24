// ============================================================
// QLNHV — Quản lý và lịch sử khoản vay nước ngoài
// Bảng Khoanvay lưu thông tin gốc; lịch sử được ghép từ hồ sơ TTHC.
// ============================================================

const LOAN_FIELDS = ['MÃ SỐ KV','MÃ KH','SỐ VBXN','NGÀY VBXN','KIM NGẠCH VAY','ĐỒNG TIỀN','FILE','DƯ NỢ','HẾT NỢ','CP BẢO LÃNH'];

function loanIsPaid(loan) {
  const value = loan && loan['HẾT NỢ'];
  return value === true || String(value).toLowerCase() === 'true' || value === 1 || value === '1';
}

function loanHasGovernmentGuarantee(loan) {
  const value = loan && loan['CP BẢO LÃNH'];
  return value === true || String(value).toLowerCase() === 'true' || value === 1 || value === '1';
}

function isLoanProcedure(maTTHC) {
  const t = tthcRow(maTTHC);
  return !!t && isSpecialGroup(t.NhomNghiepVu);
}

function loanDocumentStem(value) {
  return String(value || '').trim().toLowerCase().split('/')[0].replace(/[^a-z0-9]/g, '');
}

function isInitialLoanCase(h) {
  const name = String(tthcName(h && h.MaTTHC) || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  return name && !name.includes('thay doi');
}

// Khi hồ sơ TTHC đã được cấp mã khoản vay, tự tạo/cập nhật bản ghi chính
// trong Khoanvay. Hồ sơ vẫn được giữ riêng để hiển thị đầy đủ lịch sử xác
// nhận đăng ký và đăng ký thay đổi.
async function syncLoanFromCase(h) {
  const maKV = String(h && h.MaKhoanVay || '').trim();
  if (!maKV) return;

  const existing = DB.Khoanvay.find(r => String(r['MÃ SỐ KV'] || '').trim() === maKV);
  const amount = parseNum(h.SoTienVayNguyenTe);
  const data = existing ? { ...existing } : {
    'MÃ SỐ KV': maKV,
    'MÃ KH': '',
    'SỐ VBXN': '',
    'NGÀY VBXN': '',
    'KIM NGẠCH VAY': 0,
    'ĐỒNG TIỀN': '',
    'FILE': '',
    'DƯ NỢ': 0,
    'HẾT NỢ': false,
    'CP BẢO LÃNH': false
  };

  if (h.MaKH) data['MÃ KH'] = h.MaKH;
  if (h.SoVanBan) data['SỐ VBXN'] = h.SoVanBan;
  if (h.NgayVanBan) data['NGÀY VBXN'] = h.NgayVanBan;
  if (h.SoTienVayNguyenTe !== '' && h.SoTienVayNguyenTe != null) {
    data['KIM NGẠCH VAY'] = amount;
    if (!existing) data['DƯ NỢ'] = amount;
  }
  if (h.NguyenTeVay) data['ĐỒNG TIỀN'] = h.NguyenTeVay;
  // File của hồ sơ thay đổi chỉ thuộc chính hồ sơ đó; không được ghi đè file
  // xác nhận đăng ký ban đầu đang lưu trên bản ghi khoản vay.
  if (h.FileVanBan && (!existing || !data.FILE || isInitialLoanCase(h))) data.FILE = h.FileVanBan;
  data['HẾT NỢ'] = h.HetNo === true || String(h.HetNo).toLowerCase() === 'true';
  if (data['HẾT NỢ']) data['DƯ NỢ'] = 0;

  await apiPost(existing ? 'update' : 'create', 'Khoanvay', data, existing ? maKV : undefined);
  if (existing) Object.assign(existing, data);
  else DB.Khoanvay.push(data);
}

// Dữ liệu lịch sử cũ có thể chưa điền MÃ KH trong Khoanvay. Khi đó lấy
// khách hàng từ hồ sơ TTHC cùng mã khoản vay để vẫn nhóm đúng doanh nghiệp.
function loanCustomerId(loan) {
  const direct = String(loan && loan['MÃ KH'] || '').trim();
  if (direct) return direct;
  const maKV = String(loan && loan['MÃ SỐ KV'] || '').trim();
  const linked = DB.HoSo.find(h => String(h.MaKhoanVay || '').trim() === maKV && h.MaKH);
  return linked ? String(linked.MaKH).trim() : '';
}

let loanHistoryLoadPromise = null;

async function ensureLoanHistoryData() {
  const missing = ['HoSo','TTHC','NhomNghiepVu'].filter(s => !LOADED_SHEETS.has(s));
  if (!missing.length) return;
  if (loanHistoryLoadPromise) return loanHistoryLoadPromise;
  loanHistoryLoadPromise = (async () => {
    const bundle = await apiGet('batchList', { sheets: missing.join(',') });
    missing.forEach(sheet => {
      DB[sheet] = Array.isArray(bundle[sheet]) ? bundle[sheet] : [];
      LOADED_SHEETS.add(sheet);
    });
    normalizeIds();
  })().finally(() => { loanHistoryLoadPromise = null; });
  return loanHistoryLoadPromise;
}

// Chỉ lấy đúng các dòng Hồ sơ khớp field/value (vd MaKhoanVay = mã khoản vay
// đang xem) bằng action 'hosoLinked' phía Apps Script (dùng TextFinder), thay
// vì phải tải cả sheet Hồ sơ (~15.000 dòng) như ensureLoanHistoryData(). Nếu
// Apps Script chưa được cập nhật/deploy lại action này, tự động quay về cách
// cũ để tính năng vẫn chạy được (chỉ chậm hơn) thay vì báo lỗi.
async function fetchHoSoLinked(field, value) {
  try {
    const rows = await apiGet('hosoLinked', { field, value });
    const existingRows = new Set(DB.HoSo.map(h => h._row).filter(r => r != null));
    (rows || []).forEach(r => { if (!existingRows.has(r._row)) { DB.HoSo.push(r); existingRows.add(r._row); } });
    normalizeIds();
  } catch (err) {
    if (!/unknown action/i.test(err.message || '')) throw err;
    await ensureLoanHistoryData();
  }
}

function loanHistory(maKV) {
  const master = DB.Khoanvay.find(r => r['MÃ SỐ KV'] === maKV);
  const items = DB.HoSo.filter(h => String(h.MaKhoanVay || '').trim() === maKV && isLoanProcedure(h.MaTTHC))
    .map(h => ({
      kind: 'hoso', source: 'Hồ sơ TTHC', soVB: h.SoVanBan, ngayVB: h.NgayVanBan, maHS: h.MaHoSo, maKV: h.MaKhoanVay,
      tenTTHC: tthcName(h.MaTTHC), giaTri: h.SoTienVayNguyenTe, tien: h.NguyenTeVay,
      cv: cvName(h.MaCV) || h.MaCV, file: h.FileVanBan
    }));
  const sameDocument = (a, soVB, ngayVB) => {
    const sameDate = toISODate(a.ngayVB) === toISODate(ngayVB);
    const aNo = String(a.soVB || '').trim().toLowerCase();
    const bNo = String(soVB || '').trim().toLowerCase();
    return sameDate && (aNo === bNo || (loanDocumentStem(aNo) && loanDocumentStem(aNo) === loanDocumentStem(bNo)));
  };
  // Số văn bản trên bảng khoản vay cũ thường chỉ lưu phần số (ví dụ 621),
  // trong khi hồ sơ lưu đủ 621/HCM-QLNHV. Ghép chúng thành cùng một lịch sử
  // và đưa file của khoản vay vào hồ sơ xác nhận ban đầu, không sinh dòng tay.
  const initial = master && (items.find(x => sameDocument(x, master['SỐ VBXN'], master['NGÀY VBXN']))
    || items.find(x => {
      const h = DB.HoSo.find(r => String(r.MaHoSo) === String(x.maHS) && String(r.MaKhoanVay || '').trim() === maKV);
      return h && isInitialLoanCase(h);
    }));
  if (initial && master) {
    if (!initial.file && master.FILE) initial.file = master.FILE;
    if (!initial.giaTri && master['KIM NGẠCH VAY']) initial.giaTri = master['KIM NGẠCH VAY'];
    if (!initial.tien && master['ĐỒNG TIỀN']) initial.tien = master['ĐỒNG TIỀN'];
  }
  // Hồ sơ đã đồng bộ sang dòng khoản vay không phải là một lịch sử nhập tay mới.
  if (master && (master['SỐ VBXN'] || master['NGÀY VBXN'] || master.FILE)
      && !initial) {
    items.push({
      kind: 'manual', source: 'Nhập thủ công', soVB: master['SỐ VBXN'], ngayVB: master['NGÀY VBXN'],
      maHS: '', tenTTHC: 'Xác nhận đăng ký ban đầu', giaTri: master['KIM NGẠCH VAY'],
      tien: master['ĐỒNG TIỀN'], cv: '', file: master.FILE
    });
  }
  return items.sort((a,b) => parseVNDateSort(b.ngayVB) - parseVNDateSort(a.ngayVB));
}

function renderKhoanVay() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewLoan">+ Khoản vay mới</button>`;
  document.getElementById('btnNewLoan').onclick = () => openLoanForm();
  const customers = new Set(DB.Khoanvay.map(loanCustomerId).filter(Boolean));
  const currencies = new Set(DB.Khoanvay.map(r => r['ĐỒNG TIỀN']).filter(Boolean));
  const paidCount = DB.Khoanvay.filter(loanIsPaid).length;
  const guaranteedCount = DB.Khoanvay.filter(loanHasGovernmentGuarantee).length;
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="stats-bar">
      <div class="stat-chip stat-total">Tổng số khoản vay: <b>${DB.Khoanvay.length}</b></div>
      <div class="stat-chip">Doanh nghiệp: <b>${customers.size}</b></div>
      <div class="stat-chip">Còn dư nợ: <b>${DB.Khoanvay.length-paidCount}</b></div>
      <div class="stat-chip">Đã hết nợ: <b>${paidCount}</b></div>
      <div class="stat-chip">CP bảo lãnh: <b>${guaranteedCount}</b></div>
      <div class="stat-chip">Đồng tiền: <b>${currencies.size}</b></div>
      <div class="stat-chip">Hồ sơ liên quan: <b>${DB.HoSo.filter(h => h.MaKhoanVay && isLoanProcedure(h.MaTTHC)).length}</b></div>
    </div>
    <div class="toolbar">
      <input class="search-input" id="loanSearch" placeholder="Tìm mã khoản vay, doanh nghiệp, số văn bản…">
      <select class="select-filter" id="loanCurrency"><option value="">— Tất cả đồng tiền —</option>${[...currencies].sort().map(x=>`<option>${esc(x)}</option>`).join('')}</select>
      <select class="select-filter" id="loanPaid"><option value="">— Tất cả trạng thái —</option><option value="open">Chưa hết nợ</option><option value="paid">Đã hết nợ</option></select>
      <select class="select-filter" id="loanGuarantee"><option value="">— Tất cả bảo lãnh —</option><option value="yes">Có CP bảo lãnh</option><option value="no">Không CP bảo lãnh</option></select>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Mã số khoản vay</th><th>Số VB xác nhận</th><th>Ngày VB</th><th>Kim ngạch vay</th><th>Dư nợ</th><th>Đồng tiền</th><th>CP bảo lãnh</th><th>Trạng thái</th><th>Lịch sử</th><th></th></tr></thead>
      <tbody id="loanBody"></tbody>
    </table></div></div>`;
  const draw = () => {
    const q = (document.getElementById('loanSearch').value || '').trim().toLowerCase();
    const cur = document.getElementById('loanCurrency').value;
    const paid = document.getElementById('loanPaid').value;
    const guarantee = document.getElementById('loanGuarantee').value;
    const rows = DB.Khoanvay.filter(r => {
      const maKH = loanCustomerId(r);
      const text = [r['MÃ SỐ KV'],maKH,khName(maKH),r['SỐ VBXN']].join(' ').toLowerCase();
      return (!q || text.includes(q)) && (!cur || r['ĐỒNG TIỀN'] === cur) &&
        (!paid || (paid === 'paid') === loanIsPaid(r)) &&
        (!guarantee || (guarantee === 'yes') === loanHasGovernmentGuarantee(r));
    });
    const groups = new Map();
    rows.forEach(r => { const k=loanCustomerId(r); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); });
    const sortedGroups = [...groups.entries()].sort((a,b) => {
      const nameA = khName(a[0]), nameB = khName(b[0]);
      if (!!nameA !== !!nameB) return nameA ? -1 : 1;
      return (nameA || a[0] || '').localeCompare(nameB || b[0] || '', 'vi', {sensitivity:'base'});
    });
    const body = document.getElementById('loanBody');
    body.innerHTML = sortedGroups.length ? sortedGroups.map(([ma, loans]) => {
      loans.sort((a,b)=>parseVNDateSort(b['NGÀY VBXN'])-parseVNDateSort(a['NGÀY VBXN']));
      const paidCount=loans.filter(loanIsPaid).length, outstandingCount=loans.length-paidCount;
      return `<tr class="group-row"><td colspan="10"><b>${esc(khName(ma)||'Chưa xác định khách hàng')}</b><span class="group-meta mono">Mã KH: ${esc(ma||'—')}</span><span class="group-meta">${loans.length} khoản vay · Còn dư nợ: <b>${outstandingCount}</b> · Đã hết nợ: <b>${paidCount}</b></span></td></tr>` +
        loans.map(r => `<tr class="clickable-row" data-loan="${esc(r['MÃ SỐ KV'])}">
          <td class="mono"><b>${esc(r['MÃ SỐ KV'])}</b></td><td>${esc(r['SỐ VBXN'])}</td>
          <td class="mono">${esc(fmtDateVN(r['NGÀY VBXN']))}</td><td class="num">${esc(fmtNum(r['KIM NGẠCH VAY']))}</td><td class="num"><b>${esc(fmtNum(r['DƯ NỢ']))}</b></td>
          <td class="mono">${esc(r['ĐỒNG TIỀN'])}</td><td><span class="badge ${loanHasGovernmentGuarantee(r)?'badge-on':'badge-off'}">${loanHasGovernmentGuarantee(r)?'Có':'Không'}</span></td><td><span class="badge ${loanIsPaid(r)?'badge-off':'badge-on'}">${loanIsPaid(r)?'Đã hết nợ':'Chưa hết nợ'}</span></td><td><span class="badge badge-on">${loanHistory(r['MÃ SỐ KV']).length} văn bản</span></td>
          <td class="cell-actions"><button class="btn btn-outline btn-sm" data-edit="${esc(r['MÃ SỐ KV'])}">Sửa</button><button class="btn btn-danger btn-sm" data-del="${esc(r['MÃ SỐ KV'])}">Xóa</button></td></tr>`).join('');
    }).join('') : `<tr><td colspan="10"><div class="empty-state"><h3>Không có khoản vay phù hợp</h3></div></td></tr>`;
    body.querySelectorAll('tr[data-loan]').forEach(tr => tr.onclick=e=>{if(!e.target.closest('button')) showLoanHistory(tr.dataset.loan);});
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openLoanForm(DB.Khoanvay.find(r=>r['MÃ SỐ KV']===b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteRecord('Khoanvay',b.dataset.del,'MÃ SỐ KV',renderKhoanVay));
  };
  document.getElementById('loanSearch').oninput=draw;
  document.getElementById('loanCurrency').onchange=draw;
  document.getElementById('loanPaid').onchange=draw;
  document.getElementById('loanGuarantee').onchange=draw;
  draw();
  // Không chặn bảng chính trong lúc tải hơn 15.000 hồ sơ lịch sử.
  if (!LOADED_SHEETS.has('HoSo')) {
    ensureLoanHistoryData().then(() => {
      if ((location.hash || '#hoso') === '#khoanvay') renderKhoanVay();
    }).catch(err => toast('Chưa tải được lịch sử khoản vay: ' + err.message, true));
  }
}

async function showLoanHistory(maKV) {
  if (!LOADED_SHEETS.has('HoSo')) {
    openModal('Đang tải lịch sử khoản vay', '<div class="empty-state"><h3>Đang tải dữ liệu lịch sử…</h3><p>Danh sách khoản vay vẫn sử dụng được trong lúc chờ.</p></div>');
    const loadingToken = modalToken;
    try {
      const missingLookup = ['TTHC','NhomNghiepVu'].filter(s => !LOADED_SHEETS.has(s));
      if (missingLookup.length) {
        const bundle = await apiGet('batchList', { sheets: missingLookup.join(',') });
        missingLookup.forEach(sheet => { DB[sheet] = Array.isArray(bundle[sheet]) ? bundle[sheet] : []; LOADED_SHEETS.add(sheet); });
      }
      await fetchHoSoLinked('MaKhoanVay', maKV);
    }
    catch (err) { if (loadingToken === modalToken) { toast(err.message, true); closeModal(); } return; }
    // Người dùng đã tự đóng modal "đang tải" (vd: bấm ✕) trước khi dữ liệu về xong — không tự mở lại.
    if (loadingToken !== modalToken) return;
  }
  const master=DB.Khoanvay.find(r=>r['MÃ SỐ KV']===maKV), hist=loanHistory(maKV);
  const maKH=loanCustomerId(master), kh=master ? DB.KhachHang.find(k=>k.MaKH===maKH) : null;
  openModal(`Lịch sử khoản vay ${maKV}`, `<div class="loan-summary"><div><span>Doanh nghiệp</span><b>${esc(kh?kh.TenKhachHang:'—')}</b><small class="mono">${esc(maKH)}</small></div><div><span>Khoản vay / Dư nợ</span><b>${esc(fmtNum(master&&master['KIM NGẠCH VAY']))} / ${esc(fmtNum(master&&master['DƯ NỢ']))} ${esc(master&&master['ĐỒNG TIỀN'])}</b><small>${loanIsPaid(master)?'Đã trả hết nợ':'Chưa hết nợ'} · ${loanHasGovernmentGuarantee(master)?'Có CP bảo lãnh':'Không CP bảo lãnh'} · ${hist.length} văn bản/hồ sơ liên quan</small></div></div>
    <div style="text-align:right;margin-bottom:10px"><button class="btn btn-primary btn-sm" id="addLoanHistory">+ Thêm lịch sử</button></div>
    <div class="table-wrap loan-history-table"><table><thead><tr><th>Số văn bản</th><th>Ngày VB</th><th>Hồ sơ TTHC</th><th>Giá trị</th><th>Chuyên viên</th><th>Loại</th><th>File</th><th></th></tr></thead><tbody>
    ${hist.length?hist.map((x,i)=>`<tr><td><b>${esc(x.soVB||'—')}</b></td><td class="mono">${esc(fmtDateVN(x.ngayVB))}</td><td>${esc(x.maHS||'—')}<div class="muted">${esc(x.tenTTHC)}</div></td><td class="num">${esc(fmtNum(x.giaTri))} ${esc(x.tien)}</td><td>${esc(x.cv||'—')}</td><td>${esc(x.source)}</td><td>${fileListLinksHtml(x.file)}</td><td class="cell-actions"><button class="btn btn-outline btn-sm" data-hist-edit="${i}">Sửa</button><button class="btn btn-danger btn-sm" data-hist-del="${i}">Xóa</button></td></tr>`).join(''):`<tr><td colspan="8" class="muted">Chưa có văn bản lịch sử.</td></tr>`}
    </tbody></table></div><div class="modal-foot"><button class="btn btn-outline" id="loanClose">Đóng</button></div>`, el=>{
      el.querySelector('#loanClose').onclick=closeModal;
      el.querySelector('#addLoanHistory').onclick=()=>openHoSoForm({MaKH,MaKhoanVay:maKV,TrangThai:'Đã xử lý',MaCV:'CK',NguyenTeVay:master&&master['ĐỒNG TIỀN'],SoTienVayNguyenTe:master&&master['KIM NGẠCH VAY']},()=>showLoanHistory(maKV),true);
      el.querySelectorAll('[data-hist-edit]').forEach(b=>b.onclick=async()=>{
        const x=hist[Number(b.dataset.histEdit)];
        if(x.kind==='manual') return openLoanForm(master);
        b.disabled=true;b.textContent='Đang mở…';
        try{openHoSoForm(await apiGet('get',{sheet:'HoSo',id:x.maHS,matchField:'MaKhoanVay',matchValue:x.maKV||maKV}),()=>showLoanHistory(maKV));}catch(err){toast(err.message,true);}
      });
      el.querySelectorAll('[data-hist-del]').forEach(b=>b.onclick=async()=>{
        const x=hist[Number(b.dataset.histDel)];
        if(!confirm(x.kind==='manual'?'Xóa thông tin văn bản nhập thủ công này?':'Xóa hồ sơ TTHC '+x.maHS+' khỏi lịch sử?'))return;
        b.disabled=true;b.textContent='Đang xóa…';
        try{
          if(x.kind==='manual'){
            const data={...master,'SỐ VBXN':'','NGÀY VBXN':'',FILE:''};
            await apiPost('update','Khoanvay',data,maKV);Object.assign(master,data);
          }else{
            await apiPost('delete','HoSo',{},x.maHS,'MaKhoanVay',x.maKV||maKV);
            DB.HoSo=DB.HoSo.filter(h=>!(String(h.MaHoSo)===String(x.maHS) && String(h.MaKhoanVay||'')===String(x.maKV||maKV)));
          }
          showLoanHistory(maKV);toast('Đã xóa dòng lịch sử');
        }catch(err){toast(err.message,true);b.disabled=false;b.textContent='Xóa';}
      });
    });
}

function openLoanForm(record) {
  const edit=!!record; record=record||{};
  const customerOptions=DB.KhachHang.slice().sort((a,b)=>(a.TenKhachHang||'').localeCompare(b.TenKhachHang||'','vi')).map(k=>`<option value="${esc(k.MaKH)} — ${esc(k.TenKhachHang)}"></option>`).join('');
  const currencies=[...new Set(['USD','EUR','JPY','SGD','AUD','CAD','GBP','CHF','CNY',...DB.TyGia.map(x=>x.MaNgoaiTe)])];
  openModal(edit?'Sửa khoản vay':'Thêm khoản vay', `<form id="loanForm"><div class="form-grid">
    <div class="field mono"><label>Mã số khoản vay *</label><input name="MÃ SỐ KV" value="${esc(record['MÃ SỐ KV'])}" ${edit?'readonly':''} required></div>
    <div class="field"><label>Khách hàng *</label><input name="MÃ KH" list="loanCustomerOptions" value="${record['MÃ KH']?esc(record['MÃ KH']+' — '+khName(record['MÃ KH'])):''}" placeholder="Gõ mã hoặc tên khách hàng" autocomplete="off" required><datalist id="loanCustomerOptions">${customerOptions}</datalist></div>
    <div class="field"><label>Số văn bản xác nhận</label><input name="SỐ VBXN" value="${esc(record['SỐ VBXN'])}"></div>
    <div class="field"><label>Ngày văn bản xác nhận</label><input type="date" name="NGÀY VBXN" value="${toISODate(record['NGÀY VBXN'])}"></div>
    <div class="field"><label>Kim ngạch vay</label><input type="number" step="any" min="0" name="KIM NGẠCH VAY" value="${esc(record['KIM NGẠCH VAY'])}"></div>
    <div class="field"><label>Đồng tiền</label><select name="ĐỒNG TIỀN"><option value="">— Chọn —</option>${currencies.map(x=>`<option ${x===record['ĐỒNG TIỀN']?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label>Dư nợ (cùng đồng tiền vay)</label><input type="number" step="any" min="0" name="DƯ NỢ" value="${esc(record['DƯ NỢ'])}"></div>
    <div class="field"><label class="check-label"><input type="checkbox" name="HẾT NỢ" value="true" ${loanIsPaid(record)?'checked':''}> Khoản vay đã trả hết nợ</label><span class="hint">Mặc định để trống là chưa hết nợ.</span></div>
    <div class="field"><label class="check-label"><input type="checkbox" name="CP BẢO LÃNH" value="true" ${loanHasGovernmentGuarantee(record)?'checked':''}> Khoản vay được Chính phủ bảo lãnh</label><span class="hint">Mặc định để trống là không có bảo lãnh.</span></div>
    ${fileFieldHtml('FILE', record.FILE, { label: 'File văn bản xác nhận', accept: '.pdf,image/*' })}
    </div><div class="modal-foot"><button type="button" class="btn btn-outline" id="cancelLoan">Hủy</button><button class="btn btn-primary" id="saveLoan">Lưu</button></div></form>`, el=>{
      el.querySelector('#cancelLoan').onclick=closeModal;
      el.querySelector('form').onsubmit=async e=>{
        e.preventDefault();
        const btn=el.querySelector('#saveLoan'), oldLabel=btn.textContent;
        btn.disabled=true; btn.textContent='Đang lưu…';
        try {
          const fd=new FormData(e.target),data={};
          LOAN_FIELDS.forEach(k=>data[k]=fd.get(k)||'');
          data['MÃ KH']=lookupCode(data['MÃ KH']);
          data['NGÀY VBXN']=toVNDate(fd.get('NGÀY VBXN'));
          data['KIM NGẠCH VAY']=parseNum(fd.get('KIM NGẠCH VAY'));
          data['DƯ NỢ']=parseNum(fd.get('DƯ NỢ'));
          data['HẾT NỢ']=fd.get('HẾT NỢ')==='true';
          data['CP BẢO LÃNH']=fd.get('CP BẢO LÃNH')==='true';
          // Khoản vay đã hết nợ thì dư nợ phải bằng 0 để số liệu thống kê nhất quán.
          if(data['HẾT NỢ']) data['DƯ NỢ']=0;
          const fileContainer=el.querySelector('[data-file-field="FILE"]');
          const fileChanged=fileFieldChanged(fileContainer);
          btn.textContent='Đang tải file…';
          data.FILE=await collectFileFieldValue(fileContainer, file=>uploadLoanFile(file,data['MÃ SỐ KV']));
          btn.textContent='Đang lưu…';
          await apiPost(edit?'update':'create','Khoanvay',data,edit?record['MÃ SỐ KV']:undefined);

          // Không tải lại toàn bộ hơn 2.400 dòng. API đã xác nhận thành công thì
          // cập nhật đúng một bản ghi trong bộ nhớ và vẽ lại ngay trên màn hình.
          if(edit) Object.assign(record,data);
          else DB.Khoanvay.push(data);
          closeModal();
          renderKhoanVay();
          toast('Đã lưu khoản vay '+data['MÃ SỐ KV']);

          // File xác nhận ban đầu phải nằm trên hồ sơ TTHC đăng ký khoản vay.
          // Chỉ đồng bộ khi người dùng vừa chọn file mới, và chạy ngầm phía sau
          // (không chặn màn hình) — không được để việc này giữ modal Lưu đứng
          // chờ, kẻo tưởng như file mới chưa được lưu.
          if (fileChanged) {
            (async () => {
              try {
                await fetchHoSoLinked('MaKhoanVay', data['MÃ SỐ KV']);
                const initialCase = DB.HoSo.find(h => String(h.MaKhoanVay || '').trim() === String(data['MÃ SỐ KV']).trim() && isInitialLoanCase(h));
                if (initialCase) {
                  const updatedCase = { ...initialCase, FileVanBan: data.FILE };
                  await apiPost('update','HoSo',updatedCase,initialCase.MaHoSo,'MaKhoanVay',data['MÃ SỐ KV']);
                  Object.assign(initialCase, updatedCase);
                }
              } catch (err) {
                toast('Đã lưu khoản vay nhưng chưa đồng bộ được file sang hồ sơ gốc: ' + err.message, true);
              }
            })();
          }
        }catch(err){
          toast('Chưa lưu được: '+err.message,true);
          btn.disabled=false; btn.textContent=oldLabel;
        }
      };
    });
}

async function uploadLoanFile(file, maKV) {
  const base64Data=await fileToBase64(file);
  const res=await fetchWithTimeout(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'uploadLoanFile',fileName:file.name,mimeType:file.type,base64Data,maKhoanVay:maKV})},90000);
  const json=await res.json();if(json.error)throw Error(json.error);return json;
}
