// ============================================================
// QLNHV — Quản lý và lịch sử khoản cho vay nước ngoài
// Bảng ChoVay lưu thông tin gốc; lịch sử được ghép từ hồ sơ TTHC.
// ============================================================

const LENDING_FIELDS = ['MÃ SỐ KHOẢN CHO VAY','MÃ KH','SỐ VBXN','NGÀY VBXN','KIM NGẠCH VAY','NGUYÊN TỆ','FILE','DƯ NỢ','HẾT NỢ','CP BẢO LÃNH'];

function lendingIsPaid(lending) {
  const value = lending && lending['HẾT NỢ'];
  return value === true || String(value).toLowerCase() === 'true' || value === 1 || value === '1';
}

function lendingHasGovernmentGuarantee(lending) {
  const value = lending && lending['CP BẢO LÃNH'];
  return value === true || String(value).toLowerCase() === 'true' || value === 1 || value === '1';
}

function isLendingProcedure(maTTHC) {
  const t = tthcRow(maTTHC);
  return !!t && isSpecialGroup(t.NhomNghiepVu);
}

async function syncLendingFromCase(h) {
  const maKV = String(h && h.MaKhoanChoVay || '').trim();
  if (!maKV) return;
  const existing = DB.ChoVay.find(r => String(r['MÃ SỐ KHOẢN CHO VAY'] || '').trim() === maKV);
  const amount = parseNum(h.SoTienChoVayNguyenTe);
  const data = existing ? { ...existing } : {
    'MÃ SỐ KHOẢN CHO VAY': maKV, 'MÃ KH': '', 'SỐ VBXN': '', 'NGÀY VBXN': '',
    'KIM NGẠCH VAY': 0, 'NGUYÊN TỆ': '', 'FILE': '', 'DƯ NỢ': 0,
    'HẾT NỢ': false, 'CP BẢO LÃNH': false
  };
  if (h.MaKH) data['MÃ KH'] = h.MaKH;
  if (h.SoVanBan) data['SỐ VBXN'] = h.SoVanBan;
  if (h.NgayVanBan) data['NGÀY VBXN'] = h.NgayVanBan;
  if (h.SoTienChoVayNguyenTe !== '' && h.SoTienChoVayNguyenTe != null) {
    data['KIM NGẠCH VAY'] = amount;
    if (!existing) data['DƯ NỢ'] = amount;
  }
  if (h.NguyenTeChoVay) data['NGUYÊN TỆ'] = h.NguyenTeChoVay;
  if (h.FileVanBan) data.FILE = h.FileVanBan;
  await apiPost(existing ? 'update' : 'create', 'ChoVay', data, existing ? maKV : undefined);
  if (existing) Object.assign(existing, data); else DB.ChoVay.push(data);
}

// Dữ liệu lịch sử cũ có thể chưa điền MÃ KH trong ChoVay. Khi đó lấy
// khách hàng từ hồ sơ TTHC cùng mã khoản cho vay để vẫn nhóm đúng doanh nghiệp.
function lendingCustomerId(lending) {
  const direct = String(lending && lending['MÃ KH'] || '').trim();
  if (direct) return direct;
  const maKV = String(lending && lending['MÃ SỐ KHOẢN CHO VAY'] || '').trim();
  const linked = DB.HoSo.find(h => String(h.MaKhoanChoVay || '').trim() === maKV && h.MaKH);
  return linked ? String(linked.MaKH).trim() : '';
}

function lendingHistory(maKV) {
  const master = DB.ChoVay.find(r => r['MÃ SỐ KHOẢN CHO VAY'] === maKV);
  const items = [];
  if (master && (master['SỐ VBXN'] || master['NGÀY VBXN'] || master.FILE)) {
    items.push({
      source: 'Nhập thủ công', soVB: master['SỐ VBXN'], ngayVB: master['NGÀY VBXN'],
      maHS: '', tenTTHC: 'Xác nhận đăng ký ban đầu', giaTri: master['KIM NGẠCH VAY'],
      tien: master['NGUYÊN TỆ'], cv: '', file: master.FILE
    });
  }
  DB.HoSo.filter(h => String(h.MaKhoanChoVay || '').trim() === maKV && isLendingProcedure(h.MaTTHC))
    .forEach(h => items.push({
      source: 'Hồ sơ TTHC', soVB: h.SoVanBan, ngayVB: h.NgayVanBan, maHS: h.MaHoSo,
      tenTTHC: tthcName(h.MaTTHC), giaTri: h.SoTienChoVayNguyenTe, tien: h.NguyenTeChoVay,
      cv: cvName(h.MaCV) || h.MaCV, file: h.FileVanBan
    }));
  return items.sort((a,b) => parseVNDateSort(b.ngayVB) - parseVNDateSort(a.ngayVB));
}

function renderChoVay() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewLending">+ Khoản cho vay mới</button>`;
  document.getElementById('btnNewLending').onclick = () => openLendingForm();
  const customers = new Set(DB.ChoVay.map(lendingCustomerId).filter(Boolean));
  const currencies = new Set(DB.ChoVay.map(r => r['NGUYÊN TỆ']).filter(Boolean));
  const paidCount = DB.ChoVay.filter(lendingIsPaid).length;
  const guaranteedCount = DB.ChoVay.filter(lendingHasGovernmentGuarantee).length;
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="stats-bar">
      <div class="stat-chip stat-total">Tổng số khoản cho vay: <b>${DB.ChoVay.length}</b></div>
      <div class="stat-chip">Doanh nghiệp: <b>${customers.size}</b></div>
      <div class="stat-chip">Còn dư nợ: <b>${DB.ChoVay.length-paidCount}</b></div>
      <div class="stat-chip">Đã hết nợ: <b>${paidCount}</b></div>
      <div class="stat-chip">CP bảo lãnh: <b>${guaranteedCount}</b></div>
      <div class="stat-chip">Đồng tiền: <b>${currencies.size}</b></div>
      <div class="stat-chip">Hồ sơ liên quan: <b>${DB.HoSo.filter(h => h.MaKhoanChoVay && isLendingProcedure(h.MaTTHC)).length}</b></div>
    </div>
    <div class="toolbar">
      <input class="search-input" id="lendingSearch" placeholder="Tìm mã khoản cho vay, doanh nghiệp, số văn bản…">
      <select class="select-filter" id="lendingCurrency"><option value="">— Tất cả đồng tiền —</option>${[...currencies].sort().map(x=>`<option>${esc(x)}</option>`).join('')}</select>
      <select class="select-filter" id="lendingPaid"><option value="">— Tất cả trạng thái —</option><option value="open">Chưa hết nợ</option><option value="paid">Đã hết nợ</option></select>
      <select class="select-filter" id="lendingGuarantee"><option value="">— Tất cả bảo lãnh —</option><option value="yes">Có CP bảo lãnh</option><option value="no">Không CP bảo lãnh</option></select>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Mã số khoản cho vay</th><th>Số VB xác nhận</th><th>Ngày VB</th><th>Kim ngạch cho vay</th><th>Dư nợ</th><th>Đồng tiền</th><th>CP bảo lãnh</th><th>Trạng thái</th><th>Lịch sử</th><th></th></tr></thead>
      <tbody id="lendingBody"></tbody>
    </table></div></div>`;
  const draw = () => {
    const q = (document.getElementById('lendingSearch').value || '').trim().toLowerCase();
    const cur = document.getElementById('lendingCurrency').value;
    const paid = document.getElementById('lendingPaid').value;
    const guarantee = document.getElementById('lendingGuarantee').value;
    const rows = DB.ChoVay.filter(r => {
      const maKH = lendingCustomerId(r);
      const text = [r['MÃ SỐ KHOẢN CHO VAY'],maKH,khName(maKH),r['SỐ VBXN']].join(' ').toLowerCase();
      return (!q || text.includes(q)) && (!cur || r['NGUYÊN TỆ'] === cur) &&
        (!paid || (paid === 'paid') === lendingIsPaid(r)) &&
        (!guarantee || (guarantee === 'yes') === lendingHasGovernmentGuarantee(r));
    });
    const groups = new Map();
    rows.forEach(r => { const k=lendingCustomerId(r); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); });
    const sortedGroups = [...groups.entries()].sort((a,b) => {
      const nameA = khName(a[0]), nameB = khName(b[0]);
      if (!!nameA !== !!nameB) return nameA ? -1 : 1;
      return (nameA || a[0] || '').localeCompare(nameB || b[0] || '', 'vi', {sensitivity:'base'});
    });
    const body = document.getElementById('lendingBody');
    body.innerHTML = sortedGroups.length ? sortedGroups.map(([ma, lendings]) => {
      lendings.sort((a,b)=>parseVNDateSort(b['NGÀY VBXN'])-parseVNDateSort(a['NGÀY VBXN']));
      const kh = DB.KhachHang.find(x=>x.MaKH===ma);
      const contact = kh ? [kh.DiaChiSo,kh.DiaChiPhuongXa,kh.DiaChiTinhTP].filter(Boolean).join(', ') : '';
      return `<tr class="group-row"><td colspan="10"><b>${esc(khName(ma)||'Chưa xác định khách hàng')}</b><span class="group-meta mono">Mã KH: ${esc(ma||'—')} · ${lendings.length} khoản cho vay</span>${contact?`<span class="group-meta">${esc(contact)}</span>`:''}</td></tr>` +
        lendings.map(r => `<tr class="clickable-row" data-lending="${esc(r['MÃ SỐ KHOẢN CHO VAY'])}">
          <td class="mono"><b>${esc(r['MÃ SỐ KHOẢN CHO VAY'])}</b></td><td>${esc(r['SỐ VBXN'])}</td>
          <td class="mono">${esc(fmtDateVN(r['NGÀY VBXN']))}</td><td class="num">${esc(fmtNum(r['KIM NGẠCH VAY']))}</td><td class="num"><b>${esc(fmtNum(r['DƯ NỢ']))}</b></td>
          <td class="mono">${esc(r['NGUYÊN TỆ'])}</td><td><span class="badge ${lendingHasGovernmentGuarantee(r)?'badge-on':'badge-off'}">${lendingHasGovernmentGuarantee(r)?'Có':'Không'}</span></td><td><span class="badge ${lendingIsPaid(r)?'badge-off':'badge-on'}">${lendingIsPaid(r)?'Đã hết nợ':'Chưa hết nợ'}</span></td><td><span class="badge badge-on">${lendingHistory(r['MÃ SỐ KHOẢN CHO VAY']).length} văn bản</span></td>
          <td class="cell-actions"><button class="btn btn-outline btn-sm" data-edit="${esc(r['MÃ SỐ KHOẢN CHO VAY'])}">Sửa</button><button class="btn btn-danger btn-sm" data-del="${esc(r['MÃ SỐ KHOẢN CHO VAY'])}">Xóa</button></td></tr>`).join('');
    }).join('') : `<tr><td colspan="10"><div class="empty-state"><h3>Không có khoản cho vay phù hợp</h3></div></td></tr>`;
    body.querySelectorAll('tr[data-lending]').forEach(tr => tr.onclick=e=>{if(!e.target.closest('button')) showLendingHistory(tr.dataset.lending);});
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openLendingForm(DB.ChoVay.find(r=>r['MÃ SỐ KHOẢN CHO VAY']===b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteRecord('ChoVay',b.dataset.del,'MÃ SỐ KHOẢN CHO VAY',renderChoVay));
  };
  document.getElementById('lendingSearch').oninput=draw;
  document.getElementById('lendingCurrency').onchange=draw;
  document.getElementById('lendingPaid').onchange=draw;
  document.getElementById('lendingGuarantee').onchange=draw;
  draw();
}

function showLendingHistory(maKV) {
  const master=DB.ChoVay.find(r=>r['MÃ SỐ KHOẢN CHO VAY']===maKV), hist=lendingHistory(maKV);
  const maKH=lendingCustomerId(master), kh=master ? DB.KhachHang.find(k=>k.MaKH===maKH) : null;
  openModal(`Lịch sử khoản cho vay ${maKV}`, `<div class="loan-summary"><div><span>Doanh nghiệp</span><b>${esc(kh?kh.TenKhachHang:'—')}</b><small class="mono">${esc(maKH)}</small></div><div><span>Khoản cho vay / Dư nợ</span><b>${esc(fmtNum(master&&master['KIM NGẠCH VAY']))} / ${esc(fmtNum(master&&master['DƯ NỢ']))} ${esc(master&&master['NGUYÊN TỆ'])}</b><small>${lendingIsPaid(master)?'Đã trả hết nợ':'Chưa hết nợ'} · ${lendingHasGovernmentGuarantee(master)?'Có CP bảo lãnh':'Không CP bảo lãnh'} · ${hist.length} văn bản/hồ sơ liên quan</small></div></div>
    <div class="table-wrap"><table><thead><tr><th>Số văn bản</th><th>Ngày VB</th><th>Hồ sơ TTHC</th><th>Giá trị</th><th>Chuyên viên</th><th>Loại</th><th>File</th></tr></thead><tbody>
    ${hist.length?hist.map(x=>`<tr><td><b>${esc(x.soVB||'—')}</b></td><td class="mono">${esc(fmtDateVN(x.ngayVB))}</td><td>${esc(x.maHS||'—')}<div class="muted">${esc(x.tenTTHC)}</div></td><td class="num">${esc(fmtNum(x.giaTri))} ${esc(x.tien)}</td><td>${esc(x.cv||'—')}</td><td>${esc(x.source)}</td><td>${fileListLinksHtml(x.file)}</td></tr>`).join(''):`<tr><td colspan="7" class="muted">Chưa có văn bản lịch sử.</td></tr>`}
    </tbody></table></div><div class="modal-foot"><button class="btn btn-outline" id="lendingClose">Đóng</button></div>`, el=>el.querySelector('#lendingClose').onclick=closeModal);
}

function openLendingForm(record) {
  const edit=!!record; record=record||{};
  const customerOptions=DB.KhachHang.slice().sort((a,b)=>(a.TenKhachHang||'').localeCompare(b.TenKhachHang||'','vi')).map(k=>`<option value="${esc(k.MaKH)} — ${esc(k.TenKhachHang)}"></option>`).join('');
  const currencies=[...new Set(['USD','EUR','JPY','SGD','AUD','CAD','GBP','CHF','CNY',...DB.TyGia.map(x=>x.MaNgoaiTe)])];
  openModal(edit?'Sửa khoản cho vay':'Thêm khoản cho vay', `<form id="lendingForm"><div class="form-grid">
    <div class="field mono"><label>Mã số khoản cho vay *</label><input name="MÃ SỐ KHOẢN CHO VAY" value="${esc(record['MÃ SỐ KHOẢN CHO VAY'])}" ${edit?'readonly':''} required></div>
    <div class="field"><label>Khách hàng *</label><input name="MÃ KH" list="lendingCustomerOptions" value="${record['MÃ KH']?esc(record['MÃ KH']+' — '+khName(record['MÃ KH'])):''}" placeholder="Gõ mã hoặc tên khách hàng" autocomplete="off" required><datalist id="lendingCustomerOptions">${customerOptions}</datalist></div>
    <div class="field"><label>Số văn bản xác nhận</label><input name="SỐ VBXN" value="${esc(record['SỐ VBXN'])}"></div>
    <div class="field"><label>Ngày văn bản xác nhận</label><input type="date" name="NGÀY VBXN" value="${toISODate(record['NGÀY VBXN'])}"></div>
    <div class="field"><label>Kim ngạch cho vay</label><input type="number" step="any" min="0" name="KIM NGẠCH VAY" value="${esc(record['KIM NGẠCH VAY'])}"></div>
    <div class="field"><label>Nguyên tệ</label><select name="NGUYÊN TỆ"><option value="">— Chọn —</option>${currencies.map(x=>`<option ${x===record['NGUYÊN TỆ']?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label>Dư nợ (cùng đồng tiền vay)</label><input type="number" step="any" min="0" name="DƯ NỢ" value="${esc(record['DƯ NỢ'])}"></div>
    <div class="field"><label class="check-label"><input type="checkbox" name="HẾT NỢ" value="true" ${lendingIsPaid(record)?'checked':''}> Khoản cho vay đã trả hết nợ</label><span class="hint">Mặc định để trống là chưa hết nợ.</span></div>
    <div class="field"><label class="check-label"><input type="checkbox" name="CP BẢO LÃNH" value="true" ${lendingHasGovernmentGuarantee(record)?'checked':''}> Khoản cho vay được Chính phủ bảo lãnh</label><span class="hint">Mặc định để trống là không có bảo lãnh.</span></div>
    ${fileFieldHtml('FILE', record.FILE, { label: 'File văn bản xác nhận', accept: '.pdf,image/*' })}
    </div><div class="modal-foot"><button type="button" class="btn btn-outline" id="cancelLending">Hủy</button><button class="btn btn-primary" id="saveLending">Lưu</button></div></form>`, el=>{
      el.querySelector('#cancelLending').onclick=closeModal;
      el.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=el.querySelector('#saveLending'),oldLabel=btn.textContent;btn.disabled=true;btn.textContent='Đang lưu…';try{const fd=new FormData(e.target),data={};LENDING_FIELDS.forEach(k=>data[k]=fd.get(k)||'');data['MÃ KH']=lookupCode(data['MÃ KH']);if(!DB.KhachHang.some(k=>k.MaKH===data['MÃ KH']))throw Error('Vui lòng chọn khách hàng trong danh sách.');data['NGÀY VBXN']=toVNDate(fd.get('NGÀY VBXN'));data['KIM NGẠCH VAY']=parseNum(fd.get('KIM NGẠCH VAY'));data['DƯ NỢ']=parseNum(fd.get('DƯ NỢ'));data['HẾT NỢ']=fd.get('HẾT NỢ')==='true';data['CP BẢO LÃNH']=fd.get('CP BẢO LÃNH')==='true';if(data['HẾT NỢ'])data['DƯ NỢ']=0;btn.textContent='Đang tải file…';data.FILE=await collectFileFieldValue(el.querySelector('[data-file-field="FILE"]'), file=>uploadLendingFile(file,data['MÃ SỐ KHOẢN CHO VAY']));btn.textContent='Đang lưu…';await apiPost(edit?'update':'create','ChoVay',data,edit?record['MÃ SỐ KHOẢN CHO VAY']:undefined);if(edit)Object.assign(record,data);else DB.ChoVay.push(data);closeModal();renderChoVay();toast('Đã lưu khoản cho vay '+data['MÃ SỐ KHOẢN CHO VAY']);}catch(err){toast('Chưa lưu được: '+err.message,true);btn.disabled=false;btn.textContent=oldLabel;}};
    });
}

async function uploadLendingFile(file, maKV) {
  const base64Data=await fileToBase64(file);
  const res=await fetchWithTimeout(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'uploadLoanFile',fileName:file.name,mimeType:file.type,base64Data,maKhoanVay:maKV})},90000);
  const json=await res.json();if(json.error)throw Error(json.error);return json;
}
