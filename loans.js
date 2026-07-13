// ============================================================
// QLNHV — Quản lý và lịch sử khoản vay nước ngoài
// Bảng Khoanvay lưu thông tin gốc; lịch sử được ghép từ hồ sơ TTHC.
// ============================================================

const LOAN_FIELDS = ['MÃ SỐ KV','MÃ KH','SỐ VBXN','NGÀY VBXN','KIM NGẠCH VAY','ĐỒNG TIỀN','FILE','DƯ NỢ','HẾT NỢ'];

function loanIsPaid(loan) {
  const value = loan && loan['HẾT NỢ'];
  return value === true || String(value).toLowerCase() === 'true' || value === 1 || value === '1';
}

function isLoanProcedure(maTTHC) {
  const t = tthcRow(maTTHC);
  if (!t) return false;
  return loaiDacBietOf(t.NhomNghiepVu) === 'VayTraNoNuocNgoai' ||
    /vay\s*,?\s*trả nợ nước ngoài/i.test(t.NhomNghiepVu || '');
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

function loanHistory(maKV) {
  const master = DB.Khoanvay.find(r => r['MÃ SỐ KV'] === maKV);
  const items = [];
  if (master && (master['SỐ VBXN'] || master['NGÀY VBXN'] || master.FILE)) {
    items.push({
      source: 'Nhập thủ công', soVB: master['SỐ VBXN'], ngayVB: master['NGÀY VBXN'],
      maHS: '', tenTTHC: 'Xác nhận đăng ký ban đầu', giaTri: master['KIM NGẠCH VAY'],
      tien: master['ĐỒNG TIỀN'], cv: '', file: master.FILE
    });
  }
  DB.HoSo.filter(h => String(h.MaKhoanVay || '').trim() === maKV && isLoanProcedure(h.MaTTHC))
    .forEach(h => items.push({
      source: 'Hồ sơ TTHC', soVB: h.SoVanBan, ngayVB: h.NgayVanBan, maHS: h.MaHoSo,
      tenTTHC: tthcName(h.MaTTHC), giaTri: h.SoTienVayNguyenTe, tien: h.NguyenTeVay,
      cv: cvName(h.MaCV) || h.MaCV, file: h.FileVanBan
    }));
  return items.sort((a,b) => parseVNDateSort(b.ngayVB) - parseVNDateSort(a.ngayVB));
}

function renderKhoanVay() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewLoan">+ Khoản vay mới</button>`;
  document.getElementById('btnNewLoan').onclick = () => openLoanForm();
  const customers = new Set(DB.Khoanvay.map(loanCustomerId).filter(Boolean));
  const currencies = new Set(DB.Khoanvay.map(r => r['ĐỒNG TIỀN']).filter(Boolean));
  const paidCount = DB.Khoanvay.filter(loanIsPaid).length;
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="stats-bar">
      <div class="stat-chip stat-total">Tổng số khoản vay: <b>${DB.Khoanvay.length}</b></div>
      <div class="stat-chip">Doanh nghiệp: <b>${customers.size}</b></div>
      <div class="stat-chip">Còn dư nợ: <b>${DB.Khoanvay.length-paidCount}</b></div>
      <div class="stat-chip">Đã hết nợ: <b>${paidCount}</b></div>
      <div class="stat-chip">Đồng tiền: <b>${currencies.size}</b></div>
      <div class="stat-chip">Hồ sơ liên quan: <b>${DB.HoSo.filter(h => h.MaKhoanVay && isLoanProcedure(h.MaTTHC)).length}</b></div>
    </div>
    <div class="toolbar">
      <input class="search-input" id="loanSearch" placeholder="Tìm mã khoản vay, doanh nghiệp, số văn bản…">
      <select class="select-filter" id="loanCurrency"><option value="">— Tất cả đồng tiền —</option>${[...currencies].sort().map(x=>`<option>${esc(x)}</option>`).join('')}</select>
      <select class="select-filter" id="loanPaid"><option value="">— Tất cả trạng thái —</option><option value="open">Chưa hết nợ</option><option value="paid">Đã hết nợ</option></select>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Mã số khoản vay</th><th>Số VB xác nhận</th><th>Ngày VB</th><th>Kim ngạch vay</th><th>Dư nợ</th><th>Đồng tiền</th><th>Trạng thái</th><th>Lịch sử</th><th></th></tr></thead>
      <tbody id="loanBody"></tbody>
    </table></div></div>`;
  const draw = () => {
    const q = (document.getElementById('loanSearch').value || '').trim().toLowerCase();
    const cur = document.getElementById('loanCurrency').value;
    const paid = document.getElementById('loanPaid').value;
    const rows = DB.Khoanvay.filter(r => {
      const maKH = loanCustomerId(r);
      const text = [r['MÃ SỐ KV'],maKH,khName(maKH),r['SỐ VBXN']].join(' ').toLowerCase();
      return (!q || text.includes(q)) && (!cur || r['ĐỒNG TIỀN'] === cur) &&
        (!paid || (paid === 'paid') === loanIsPaid(r));
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
      const kh = DB.KhachHang.find(x=>x.MaKH===ma);
      const contact = kh ? [kh.DiaChiSo,kh.DiaChiPhuongXa,kh.DiaChiTinhTP].filter(Boolean).join(', ') : '';
      return `<tr class="group-row"><td colspan="9"><b>${esc(khName(ma)||'Chưa xác định khách hàng')}</b><span class="group-meta mono">Mã KH: ${esc(ma||'—')} · ${loans.length} khoản vay</span>${contact?`<span class="group-meta">${esc(contact)}</span>`:''}</td></tr>` +
        loans.map(r => `<tr class="clickable-row" data-loan="${esc(r['MÃ SỐ KV'])}">
          <td class="mono"><b>${esc(r['MÃ SỐ KV'])}</b></td><td>${esc(r['SỐ VBXN'])}</td>
          <td class="mono">${esc(fmtDateVN(r['NGÀY VBXN']))}</td><td class="num">${esc(fmtNum(r['KIM NGẠCH VAY']))}</td><td class="num"><b>${esc(fmtNum(r['DƯ NỢ']))}</b></td>
          <td class="mono">${esc(r['ĐỒNG TIỀN'])}</td><td><span class="badge ${loanIsPaid(r)?'badge-off':'badge-on'}">${loanIsPaid(r)?'Đã hết nợ':'Chưa hết nợ'}</span></td><td><span class="badge badge-on">${loanHistory(r['MÃ SỐ KV']).length} văn bản</span></td>
          <td class="cell-actions"><button class="btn btn-outline btn-sm" data-edit="${esc(r['MÃ SỐ KV'])}">Sửa</button><button class="btn btn-danger btn-sm" data-del="${esc(r['MÃ SỐ KV'])}">Xóa</button></td></tr>`).join('');
    }).join('') : `<tr><td colspan="9"><div class="empty-state"><h3>Không có khoản vay phù hợp</h3></div></td></tr>`;
    body.querySelectorAll('tr[data-loan]').forEach(tr => tr.onclick=e=>{if(!e.target.closest('button')) showLoanHistory(tr.dataset.loan);});
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openLoanForm(DB.Khoanvay.find(r=>r['MÃ SỐ KV']===b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteRecord('Khoanvay',b.dataset.del,'MÃ SỐ KV',renderKhoanVay));
  };
  document.getElementById('loanSearch').oninput=draw;
  document.getElementById('loanCurrency').onchange=draw;
  document.getElementById('loanPaid').onchange=draw;
  draw();
}

function showLoanHistory(maKV) {
  const master=DB.Khoanvay.find(r=>r['MÃ SỐ KV']===maKV), hist=loanHistory(maKV);
  const maKH=loanCustomerId(master), kh=master ? DB.KhachHang.find(k=>k.MaKH===maKH) : null;
  openModal(`Lịch sử khoản vay ${maKV}`, `<div class="loan-summary"><div><span>Doanh nghiệp</span><b>${esc(kh?kh.TenKhachHang:'—')}</b><small class="mono">${esc(maKH)}</small></div><div><span>Khoản vay / Dư nợ</span><b>${esc(fmtNum(master&&master['KIM NGẠCH VAY']))} / ${esc(fmtNum(master&&master['DƯ NỢ']))} ${esc(master&&master['ĐỒNG TIỀN'])}</b><small>${loanIsPaid(master)?'Đã trả hết nợ':'Chưa hết nợ'} · ${hist.length} văn bản/hồ sơ liên quan</small></div></div>
    <div class="table-wrap"><table><thead><tr><th>Số văn bản</th><th>Ngày VB</th><th>Hồ sơ TTHC</th><th>Giá trị</th><th>Chuyên viên</th><th>Loại</th><th>File</th></tr></thead><tbody>
    ${hist.length?hist.map(x=>`<tr><td><b>${esc(x.soVB||'—')}</b></td><td class="mono">${esc(fmtDateVN(x.ngayVB))}</td><td>${esc(x.maHS||'—')}<div class="muted">${esc(x.tenTTHC)}</div></td><td class="num">${esc(fmtNum(x.giaTri))} ${esc(x.tien)}</td><td>${esc(x.cv||'—')}</td><td>${esc(x.source)}</td><td>${x.file?`<a class="btn btn-outline btn-sm" href="${esc(x.file)}" target="_blank" rel="noopener">Mở file</a>`:'—'}</td></tr>`).join(''):`<tr><td colspan="7" class="muted">Chưa có văn bản lịch sử.</td></tr>`}
    </tbody></table></div><div class="modal-foot"><button class="btn btn-outline" id="loanClose">Đóng</button></div>`, el=>el.querySelector('#loanClose').onclick=closeModal);
}

function openLoanForm(record) {
  const edit=!!record; record=record||{};
  const customerOptions=DB.KhachHang.slice().sort((a,b)=>(a.TenKhachHang||'').localeCompare(b.TenKhachHang||'','vi')).map(k=>`<option value="${esc(k.MaKH)}" ${k.MaKH===record['MÃ KH']?'selected':''}>${esc(k.MaKH)} — ${esc(k.TenKhachHang)}</option>`).join('');
  const currencies=[...new Set(['USD','EUR','JPY','SGD','AUD','CAD','GBP','CHF','CNY',...DB.TyGia.map(x=>x.MaNgoaiTe)])];
  openModal(edit?'Sửa khoản vay':'Thêm khoản vay', `<form id="loanForm"><div class="form-grid">
    <div class="field mono"><label>Mã số khoản vay *</label><input name="MÃ SỐ KV" value="${esc(record['MÃ SỐ KV'])}" ${edit?'readonly':''} required></div>
    <div class="field"><label>Khách hàng *</label><select name="MÃ KH" required><option value="">— Chọn khách hàng —</option>${customerOptions}</select></div>
    <div class="field"><label>Số văn bản xác nhận</label><input name="SỐ VBXN" value="${esc(record['SỐ VBXN'])}"></div>
    <div class="field"><label>Ngày văn bản xác nhận</label><input type="date" name="NGÀY VBXN" value="${toISODate(record['NGÀY VBXN'])}"></div>
    <div class="field"><label>Kim ngạch vay</label><input type="number" step="any" min="0" name="KIM NGẠCH VAY" value="${esc(record['KIM NGẠCH VAY'])}"></div>
    <div class="field"><label>Đồng tiền</label><select name="ĐỒNG TIỀN"><option value="">— Chọn —</option>${currencies.map(x=>`<option ${x===record['ĐỒNG TIỀN']?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label>Dư nợ (cùng đồng tiền vay)</label><input type="number" step="any" min="0" name="DƯ NỢ" value="${esc(record['DƯ NỢ'])}"></div>
    <div class="field"><label class="check-label"><input type="checkbox" name="HẾT NỢ" value="true" ${loanIsPaid(record)?'checked':''}> Khoản vay đã trả hết nợ</label><span class="hint">Mặc định để trống là chưa hết nợ.</span></div>
    <div class="field span-2"><label>File văn bản xác nhận</label><input type="file" id="loanFile" accept=".pdf,image/*"><span class="hint">File lưu riêng trên Google Drive; giữ nguyên file cũ nếu không chọn file mới.</span>${record.FILE?`<a href="${esc(record.FILE)}" target="_blank" rel="noopener">Mở file hiện tại</a>`:''}</div>
    </div><div class="modal-foot"><button type="button" class="btn btn-outline" id="cancelLoan">Hủy</button><button class="btn btn-primary" id="saveLoan">Lưu</button></div></form>`, el=>{
      el.querySelector('#cancelLoan').onclick=closeModal;
      el.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=el.querySelector('#saveLoan');btn.disabled=true;try{const fd=new FormData(e.target),data={};LOAN_FIELDS.forEach(k=>data[k]=fd.get(k)||'');data['NGÀY VBXN']=toVNDate(fd.get('NGÀY VBXN'));data['KIM NGẠCH VAY']=parseNum(fd.get('KIM NGẠCH VAY'));data['DƯ NỢ']=parseNum(fd.get('DƯ NỢ'));data['HẾT NỢ']=fd.get('HẾT NỢ')==='true';data.FILE=record.FILE||'';const file=el.querySelector('#loanFile').files[0];if(file)data.FILE=(await uploadLoanFile(file,data['MÃ SỐ KV'])).url;await apiPost(edit?'update':'create','Khoanvay',data,edit?record['MÃ SỐ KV']:undefined);await reloadSheet('Khoanvay');toast('Đã lưu khoản vay '+data['MÃ SỐ KV']);closeModal();renderKhoanVay();}catch(err){toast(err.message,true);btn.disabled=false;}};
    });
}

async function uploadLoanFile(file, maKV) {
  const base64Data=await fileToBase64(file);
  const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'uploadLoanFile',fileName:file.name,mimeType:file.type,base64Data,maKhoanVay:maKV})});
  const json=await res.json();if(json.error)throw Error(json.error);return json;
}
