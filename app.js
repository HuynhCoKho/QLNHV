// ============================================================
// QLNHV — app.js
// SPA don gian (khong dung framework) — goi thang API Apps Script
// ============================================================

const DB = { KhachHang: [], ChuyenVien: [], TTHC: [], TyGia: [], HoSo: [] };

const TRANGTHAI_HOSO = ['Chưa tiếp nhận', 'Đã tiếp nhận', 'Bổ sung hồ sơ', 'Đang xử lý', 'Đã xử lý'];
const NHOM_NGHIEPVU = [
  { value: 'VayTraNoNuocNgoai', label: 'Vay, trả nợ nước ngoài' },
  { value: 'DauTuRaNuocNgoai', label: 'Đầu tư ra nước ngoài' },
  { value: 'Khac', label: 'Khác' }
];

// ---------------- API helpers ----------------
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function apiPost(action, sheet, data, id) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, sheet, data, id })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// ---------------- Utils ----------------
function fmtNum(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
}
function fmtRate(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 4 });
}
function parseNum(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(String(v).replace(/\./g, '').replace(/,/g, '.'));
  return isNaN(n) ? '' : n;
}
function toISODate(ddmmyyyy) {
  if (!ddmmyyyy) return '';
  const parts = String(ddmmyyyy).split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  return y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0');
}
function toVNDate(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts;
  return d + '/' + m + '/' + y;
}
function esc(s) { return (s === undefined || s === null) ? '' : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg, isError) {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------------- Lookups ----------------
function khName(ma) { const r = DB.KhachHang.find(x => x.MaKH === ma); return r ? r.TenKhachHang : ''; }
function cvName(ma) { const r = DB.ChuyenVien.find(x => x.MaCV === ma); return r ? r.HoTen : ''; }
function tthcRow(ma) { return DB.TTHC.find(x => x.MaTTHC === ma); }
function tthcName(ma) { const r = tthcRow(ma); return r ? r.TenTTHC : ''; }
function rateRow(code) { return DB.TyGia.find(x => x.MaNgoaiTe === code); }
function toUSD(amount, code) {
  if (amount === '' || amount === null || amount === undefined || !code) return null;
  const r = rateRow(code);
  if (!r || !r.TyGiaSoUSD) return null;
  return Number(amount) / Number(r.TyGiaSoUSD);
}

// ---------------- Boot ----------------
async function boot() {
  const status = document.getElementById('connStatus');
  try {
    await apiGet('ping');
    status.textContent = '● đã kết nối';
    status.className = 'conn-status conn-ok';
    await loadAll();
    route();
  } catch (err) {
    status.textContent = '● lỗi kết nối API';
    status.className = 'conn-status conn-error';
    document.getElementById('view').innerHTML = `<div class="empty-state"><h3>Chưa kết nối được API</h3>
      <p>Kiểm tra lại API_URL trong config.js và đảm bảo Web App đã Deploy với quyền "Anyone".</p>
      <p class="mono">${esc(err.message)}</p></div>`;
  }
}

async function loadAll() {
  const [kh, cv, tthc, tygia, hoso] = await Promise.all([
    apiGet('list', { sheet: 'KhachHang' }),
    apiGet('list', { sheet: 'ChuyenVien' }),
    apiGet('list', { sheet: 'TTHC' }),
    apiGet('list', { sheet: 'TyGia' }),
    apiGet('list', { sheet: 'HoSo' })
  ]);
  DB.KhachHang = kh; DB.ChuyenVien = cv; DB.TTHC = tthc; DB.TyGia = tygia; DB.HoSo = hoso;
}

// ---------------- Router ----------------
const ROUTES = {
  hoso: { title: 'Hồ sơ TTHC', render: renderHoSo },
  khachhang: { title: 'Khách hàng', render: renderKhachHang },
  tthc: { title: 'Danh mục thủ tục hành chính', render: renderTTHC },
  chuyenvien: { title: 'Chuyên viên', render: renderChuyenVien },
  tygia: { title: 'Tỷ giá', render: renderTyGia }
};

function route() {
  const r = (location.hash || '#hoso').replace('#', '');
  const cfg = ROUTES[r] || ROUTES.hoso;
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === r));
  document.getElementById('pageTitle').textContent = cfg.title;
  cfg.render();
}
window.addEventListener('hashchange', route);

// ---------------- Modal helper ----------------
function openModal(title, bodyHtml, onMount) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal">
        <div class="modal-head"><h2>${esc(title)}</h2><button class="btn btn-ghost" id="modalClose">✕</button></div>
        <div id="modalBody">${bodyHtml}</div>
      </div>
    </div>`;
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
  if (onMount) onMount(document.getElementById('modalBody'));
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

// ============================================================
// MODULE: HO SO TTHC
// ============================================================
function renderHoSo() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewHoSo">+ Hồ sơ mới</button>`;
  document.getElementById('btnNewHoSo').onclick = () => openHoSoForm();

  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="toolbar">
      <input type="text" class="search-input" id="hsSearch" placeholder="Tìm theo mã hồ sơ, tên khách hàng…" />
      <select class="select-filter" id="hsFilterTrangThai">
        <option value="">— Tất cả trạng thái —</option>
        ${TRANGTHAI_HOSO.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr>
        <th>Mã hồ sơ</th><th>Khách hàng</th><th>TTHC</th><th>Ngày tiếp nhận</th><th>Hẹn trả</th><th>Chuyên viên</th><th>Trạng thái</th><th></th>
      </tr></thead>
      <tbody id="hsBody"></tbody>
    </table></div></div>`;

  const draw = () => {
    const q = (document.getElementById('hsSearch').value || '').toLowerCase();
    const ft = document.getElementById('hsFilterTrangThai').value;
    const rows = DB.HoSo.filter(r => {
      const matchQ = !q || r.MaHoSo.toLowerCase().includes(q) || khName(r.MaKH).toLowerCase().includes(q);
      const matchT = !ft || r.TrangThai === ft;
      return matchQ && matchT;
    });
    const body = document.getElementById('hsBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>Chưa có hồ sơ nào</h3><p>Bấm "+ Hồ sơ mới" để bắt đầu.</p></div></td></tr>`;
      return;
    }
    body.innerHTML = rows.map(r => `
      <tr>
        <td class="mono">${esc(r.MaHoSo)}</td>
        <td>${esc(khName(r.MaKH))}<div class="muted mono" style="font-size:11px">${esc(r.MaKH)}</div></td>
        <td>${esc(tthcName(r.MaTTHC))}</td>
        <td class="mono">${esc(r.NgayTiepNhan)}</td>
        <td class="mono">${esc(r.NgayHenTra)}</td>
        <td>${esc(cvName(r.MaCV) || r.MaCV)}</td>
        <td>${statusBadge(r.TrangThai)}</td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.MaHoSo)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.MaHoSo)}">Xóa</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openHoSoForm(DB.HoSo.find(x => x.MaHoSo === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('HoSo', b.dataset.del, 'MaHoSo', renderHoSo));
  };
  document.getElementById('hsSearch').oninput = draw;
  document.getElementById('hsFilterTrangThai').onchange = draw;
  draw();
}

function statusBadge(t) {
  const map = {
    'Chưa tiếp nhận': 'badge-neutral', 'Đã tiếp nhận': 'badge-sage', 'Bổ sung hồ sơ': 'badge-amber',
    'Đang xử lý': 'badge-amber', 'Đã xử lý': 'badge-seal'
  };
  return `<span class="badge ${map[t] || 'badge-neutral'}">${esc(t || '—')}</span>`;
}

function openHoSoForm(rec) {
  const isEdit = !!rec;
  rec = rec || { TrangThai: 'Chưa tiếp nhận', MaCV: 'CK', HetNo: false };

  const khOptions = DB.KhachHang.map(k => `<option value="${esc(k.MaKH)}" ${rec.MaKH === k.MaKH ? 'selected' : ''}>${esc(k.MaKH)} — ${esc(k.TenKhachHang)}</option>`).join('');
  const tthcOptions = DB.TTHC.map(t => `<option value="${esc(t.MaTTHC)}" ${rec.MaTTHC === t.MaTTHC ? 'selected' : ''}>${esc(t.MaTTHC)} — ${esc(t.TenTTHC)}</option>`).join('');
  const cvOptions = DB.ChuyenVien.map(c => `<option value="${esc(c.MaCV)}" ${(rec.MaCV || 'CK') === c.MaCV ? 'selected' : ''}>${esc(c.MaCV)} — ${esc(c.HoTen || '')}</option>`).join('');
  const trangThaiOptions = TRANGTHAI_HOSO.map(t => `<option value="${t}" ${rec.TrangThai === t ? 'selected' : ''}>${t}</option>`).join('');
  const nteOptions = DB.TyGia.map(r => `<option value="${esc(r.MaNgoaiTe)}">${esc(r.MaNgoaiTe)}</option>`).join('');

  const bodyHtml = `
    <form id="hsForm">
      <div class="form-grid">
        <div class="field mono"><label>Mã số hồ sơ (Cổng DVC)</label>
          <input type="text" name="MaHoSo" value="${esc(rec.MaHoSo || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field"><label>Chuyên viên tiếp nhận</label>
          <select name="MaCV">${cvOptions}</select></div>

        <div class="field"><label>Khách hàng</label>
          <select name="MaKH" id="fMaKH" required><option value="">— chọn khách hàng —</option>${khOptions}</select>
          <span class="hint" id="khHint"></span></div>
        <div class="field"><label>Thủ tục hành chính</label>
          <select name="MaTTHC" id="fMaTTHC" required><option value="">— chọn TTHC —</option>${tthcOptions}</select></div>

        <div class="field"><label>Ngày tiếp nhận hồ sơ</label>
          <input type="date" name="NgayTiepNhan" value="${toISODate(rec.NgayTiepNhan)}" required /></div>
        <div class="field"><label>Ngày hẹn trả kết quả</label>
          <input type="date" name="NgayHenTra" value="${toISODate(rec.NgayHenTra)}" /></div>

        <div class="field span-2"><label>Trạng thái hồ sơ</label>
          <select name="TrangThai" id="fTrangThai">${trangThaiOptions}</select></div>

        <fieldset class="subsection" id="fsKetQua"><legend>Kết quả xử lý</legend>
          <div class="form-grid">
            <div class="field"><label>Số văn bản</label><input type="text" name="SoVanBan" value="${esc(rec.SoVanBan || '')}" /></div>
            <div class="field"><label>Ngày văn bản</label><input type="date" name="NgayVanBan" value="${toISODate(rec.NgayVanBan)}" /></div>
          </div>
        </fieldset>

        <fieldset class="subsection" id="fsVay"><legend>Vay, trả nợ nước ngoài</legend>
          <div class="form-grid">
            <div class="field mono"><label>Mã số khoản vay</label><input type="text" name="MaKhoanVay" value="${esc(rec.MaKhoanVay || '')}" /></div>
            <div class="field"><label>Nguyên tệ</label><select name="NguyenTeVay" id="fNguyenTeVay"><option value="">—</option>${nteOptions}</select></div>
            <div class="field"><label>Số tiền vay (nguyên tệ)</label><input type="text" name="SoTienVayNguyenTe" id="fSoTienVay" value="${rec.SoTienVayNguyenTe ? fmtNum(rec.SoTienVayNguyenTe) : ''}" /></div>
            <div class="field"><label>Quy đổi USD (tỷ giá hiện tại)</label><input type="text" id="fSoTienVayUSD" readonly /></div>
            <div class="field span-2 checkbox-row">
              <input type="checkbox" id="fHetNo" name="HetNo" ${rec.HetNo === true ? 'checked' : ''} />
              <label for="fHetNo" style="margin:0">Hết nợ sau khi hoàn thành thủ tục</label></div>
          </div>
        </fieldset>

        <fieldset class="subsection" id="fsDauTu"><legend>Đầu tư ra nước ngoài</legend>
          <div class="form-grid">
            <div class="field mono"><label>Mã số dự án</label><input type="text" name="MaDuAn" value="${esc(rec.MaDuAn || '')}" /></div>
            <div class="field"><label>Nguyên tệ</label><select name="NguyenTeDauTu" id="fNguyenTeDauTu"><option value="">—</option>${nteOptions}</select></div>
            <div class="field"><label>Số tiền đăng ký chuyển ra (nguyên tệ)</label><input type="text" name="SoTienDangKyNguyenTe" id="fSoTienDT" value="${rec.SoTienDangKyNguyenTe ? fmtNum(rec.SoTienDangKyNguyenTe) : ''}" /></div>
            <div class="field"><label>Quy đổi USD (tỷ giá hiện tại)</label><input type="text" id="fSoTienDTUSD" readonly /></div>
          </div>
        </fieldset>

        <div class="field span-2"><label>Ghi chú</label><textarea name="GhiChu">${esc(rec.GhiChu || '')}</textarea></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-outline" id="hsCancel">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu hồ sơ</button>
      </div>
    </form>`;

  openModal(isEdit ? 'Sửa hồ sơ ' + rec.MaHoSo : 'Tạo hồ sơ mới', bodyHtml, (el) => {
    if (rec.NguyenTeVay) el.querySelector('#fNguyenTeVay').value = rec.NguyenTeVay;
    if (rec.NguyenTeDauTu) el.querySelector('#fNguyenTeDauTu').value = rec.NguyenTeDauTu;

    const updateVisibility = () => {
      const trangThai = el.querySelector('#fTrangThai').value;
      const tthc = tthcRow(el.querySelector('#fMaTTHC').value);
      const isDone = trangThai === 'Đã xử lý';
      el.querySelector('#fsKetQua').style.display = isDone ? '' : 'none';
      el.querySelector('#fsVay').style.display = (isDone && tthc && tthc.NhomNghiepVu === 'VayTraNoNuocNgoai') ? '' : 'none';
      el.querySelector('#fsDauTu').style.display = (isDone && tthc && tthc.NhomNghiepVu === 'DauTuRaNuocNgoai') ? '' : 'none';
    };
    const updateUSD = () => {
      const amt = parseNum(el.querySelector('#fSoTienVay').value);
      const code = el.querySelector('#fNguyenTeVay').value;
      const usd = toUSD(amt, code);
      el.querySelector('#fSoTienVayUSD').value = usd === null ? '' : '≈ $' + fmtNum(usd);
      const amt2 = parseNum(el.querySelector('#fSoTienDT').value);
      const code2 = el.querySelector('#fNguyenTeDauTu').value;
      const usd2 = toUSD(amt2, code2);
      el.querySelector('#fSoTienDTUSD').value = usd2 === null ? '' : '≈ $' + fmtNum(usd2);
    };
    el.querySelector('#fMaKH').onchange = (e) => { el.querySelector('#khHint').textContent = khName(e.target.value); };
    if (rec.MaKH) el.querySelector('#khHint').textContent = khName(rec.MaKH);
    el.querySelector('#fMaTTHC').onchange = updateVisibility;
    el.querySelector('#fTrangThai').onchange = updateVisibility;
    el.querySelector('#fSoTienVay').oninput = updateUSD;
    el.querySelector('#fNguyenTeVay').onchange = updateUSD;
    el.querySelector('#fSoTienDT').oninput = updateUSD;
    el.querySelector('#fNguyenTeDauTu').onchange = updateUSD;
    updateVisibility(); updateUSD();
    el.querySelector('#hsCancel').onclick = closeModal;

    el.querySelector('#hsForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        MaHoSo: fd.get('MaHoSo').trim(),
        MaKH: fd.get('MaKH'),
        MaTTHC: fd.get('MaTTHC'),
        NgayTiepNhan: toVNDate(fd.get('NgayTiepNhan')),
        NgayHenTra: toVNDate(fd.get('NgayHenTra')),
        MaCV: fd.get('MaCV'),
        TrangThai: fd.get('TrangThai'),
        SoVanBan: fd.get('SoVanBan') || '',
        NgayVanBan: toVNDate(fd.get('NgayVanBan')),
        MaKhoanVay: fd.get('MaKhoanVay') || '',
        SoTienVayNguyenTe: parseNum(fd.get('SoTienVayNguyenTe')),
        NguyenTeVay: fd.get('NguyenTeVay') || '',
        HetNo: el.querySelector('#fHetNo').checked,
        MaDuAn: fd.get('MaDuAn') || '',
        SoTienDangKyNguyenTe: parseNum(fd.get('SoTienDangKyNguyenTe')),
        NguyenTeDauTu: fd.get('NguyenTeDauTu') || '',
        GhiChu: fd.get('GhiChu') || ''
      };
      try {
        if (isEdit) await apiPost('update', 'HoSo', data, data.MaHoSo);
        else await apiPost('create', 'HoSo', data);
        toast('Đã lưu hồ sơ ' + data.MaHoSo);
        closeModal();
        DB.HoSo = await apiGet('list', { sheet: 'HoSo' });
        renderHoSo();
      } catch (err) { toast(err.message, true); }
    };
  });
}

// ============================================================
// MODULE: KHACH HANG
// ============================================================
function renderKhachHang() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewKH">+ Khách hàng mới</button>`;
  document.getElementById('btnNewKH').onclick = () => openKHForm();
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="toolbar"><input type="text" class="search-input" id="khSearch" placeholder="Tìm theo mã, tên khách hàng…" /></div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Mã KH</th><th>Loại</th><th>Tên khách hàng</th><th>Địa chỉ</th><th>SĐT</th><th>Email</th><th></th></tr></thead>
      <tbody id="khBody"></tbody>
    </table></div></div>`;
  const draw = () => {
    const q = (document.getElementById('khSearch').value || '').toLowerCase();
    const rows = DB.KhachHang.filter(r => !q || r.MaKH.toLowerCase().includes(q) || (r.TenKhachHang || '').toLowerCase().includes(q));
    const body = document.getElementById('khBody');
    if (!rows.length) { body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>Chưa có khách hàng nào</h3></div></td></tr>`; return; }
    body.innerHTML = rows.map(r => `
      <tr>
        <td class="mono">${esc(r.MaKH)}</td>
        <td>${loaiKHLabel(r)}</td>
        <td>${esc(r.TenKhachHang)}</td>
        <td class="muted">${esc([r.DiaChiSo, r.DiaChiPhuongXa, r.DiaChiTinhTP].filter(Boolean).join(', '))}</td>
        <td class="mono">${esc(r.SoDienThoai)}</td>
        <td>${esc(r.Email)}</td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.MaKH)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.MaKH)}">Xóa</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openKHForm(DB.KhachHang.find(x => x.MaKH === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('KhachHang', b.dataset.del, 'MaKH', renderKhachHang));
  };
  document.getElementById('khSearch').oninput = draw;
  draw();
}
function loaiKHLabel(r) {
  if (r.Loai === 'ToChuc') return `Tổ chức <span class="muted">(${esc(r.LoaiToChuc || '')})</span>`;
  return `Cá nhân <span class="muted">(${r.LoaiCaNhan === 'NuocNgoai' ? 'nước ngoài' : 'Việt Nam'})</span>`;
}
function openKHForm(rec) {
  const isEdit = !!rec;
  rec = rec || { Loai: 'CaNhan', LoaiCaNhan: 'VietNam' };
  const bodyHtml = `
    <form id="khForm">
      <div class="form-grid">
        <div class="field mono"><label>Mã khách hàng (MST)</label><input type="text" name="MaKH" value="${esc(rec.MaKH || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field mono"><label>Mã định danh</label><input type="text" name="MaDinhDanh" value="${esc(rec.MaDinhDanh || '')}" /></div>

        <div class="field"><label>Loại khách hàng</label>
          <select name="Loai" id="fLoai"><option value="CaNhan" ${rec.Loai === 'CaNhan' ? 'selected' : ''}>Cá nhân</option><option value="ToChuc" ${rec.Loai === 'ToChuc' ? 'selected' : ''}>Tổ chức</option></select></div>
        <div class="field" id="fLoaiToChucWrap"><label>Loại hình tổ chức</label>
          <select name="LoaiToChuc">
            <option value="F0" ${rec.LoaiToChuc === 'F0' ? 'selected' : ''}>F0 — 100% vốn trong nước</option>
            <option value="F10" ${rec.LoaiToChuc === 'F10' ? 'selected' : ''}>F10 — vốn ĐTNN ≤ 50%</option>
            <option value="F51" ${rec.LoaiToChuc === 'F51' ? 'selected' : ''}>F51 — vốn ĐTNN ≥ 51%</option>
            <option value="F100" ${rec.LoaiToChuc === 'F100' ? 'selected' : ''}>F100 — 100% vốn ĐTNN</option>
          </select></div>
        <div class="field" id="fLoaiCaNhanWrap"><label>Quốc tịch</label>
          <select name="LoaiCaNhan"><option value="VietNam" ${rec.LoaiCaNhan === 'VietNam' ? 'selected' : ''}>Người Việt Nam</option><option value="NuocNgoai" ${rec.LoaiCaNhan === 'NuocNgoai' ? 'selected' : ''}>Người nước ngoài</option></select></div>

        <div class="field span-2"><label>Tên khách hàng</label><input type="text" name="TenKhachHang" value="${esc(rec.TenKhachHang || '')}" required /></div>

        <div class="field"><label>Số nhà, tên đường</label><input type="text" name="DiaChiSo" value="${esc(rec.DiaChiSo || '')}" /></div>
        <div class="field"><label>Phường/Xã</label><input type="text" name="DiaChiPhuongXa" value="${esc(rec.DiaChiPhuongXa || '')}" /></div>
        <div class="field"><label>Tỉnh/Thành phố</label><input type="text" name="DiaChiTinhTP" value="${esc(rec.DiaChiTinhTP || '')}" /></div>
        <div class="field"><label>Số điện thoại</label><input type="tel" name="SoDienThoai" value="${esc(rec.SoDienThoai || '')}" /></div>

        <div class="field"><label>Email</label><input type="email" name="Email" value="${esc(rec.Email || '')}" /></div>
        <div class="field span-2"><label>Ghi chú</label><textarea name="GhiChu">${esc(rec.GhiChu || '')}</textarea></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn btn-outline" id="khCancel">Hủy</button><button type="submit" class="btn btn-primary">Lưu</button></div>
    </form>`;
  openModal(isEdit ? 'Sửa khách hàng' : 'Khách hàng mới', bodyHtml, (el) => {
    const toggle = () => {
      const isTC = el.querySelector('#fLoai').value === 'ToChuc';
      el.querySelector('#fLoaiToChucWrap').style.display = isTC ? '' : 'none';
      el.querySelector('#fLoaiCaNhanWrap').style.display = isTC ? 'none' : '';
    };
    el.querySelector('#fLoai').onchange = toggle; toggle();
    el.querySelector('#khCancel').onclick = closeModal;
    el.querySelector('#khForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.MaKH = data.MaKH.trim();
      try {
        if (isEdit) await apiPost('update', 'KhachHang', data, data.MaKH);
        else await apiPost('create', 'KhachHang', data);
        toast('Đã lưu khách hàng ' + data.MaKH);
        closeModal();
        DB.KhachHang = await apiGet('list', { sheet: 'KhachHang' });
        renderKhachHang();
      } catch (err) { toast(err.message, true); }
    };
  });
}

// ============================================================
// MODULE: TTHC
// ============================================================
function renderTTHC() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewTTHC">+ Thủ tục mới</button>`;
  document.getElementById('btnNewTTHC').onclick = () => openTTHCForm();
  const view = document.getElementById('view');
  view.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Mã TTHC</th><th>Tên thủ tục</th><th>Loại</th><th>Nhóm nghiệp vụ</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody id="tthcBody"></tbody></table></div></div>`;
  const draw = () => {
    const body = document.getElementById('tthcBody');
    if (!DB.TTHC.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Chưa có thủ tục nào</h3></div></td></tr>`; return; }
    body.innerHTML = DB.TTHC.map(r => `
      <tr>
        <td class="mono">${esc(r.MaTTHC)}</td>
        <td>${esc(r.TenTTHC)}</td>
        <td class="muted">${r.LoaiTTHC === 'TrucTuyenToanTrinh' ? 'Trực tuyến toàn trình' : 'Thường'}</td>
        <td class="muted">${(NHOM_NGHIEPVU.find(n => n.value === r.NhomNghiepVu) || {}).label || 'Khác'}</td>
        <td>${tthcStatusBadge(r.TrangThai)}</td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.MaTTHC)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.MaTTHC)}">Xóa</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openTTHCForm(DB.TTHC.find(x => x.MaTTHC === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('TTHC', b.dataset.del, 'MaTTHC', renderTTHC));
  };
  draw();
}
function tthcStatusBadge(t) {
  const map = { 'DangHieuLuc': ['badge-sage', 'Đang hiệu lực'], 'Huy': ['badge-seal', 'Hủy'], 'ChuaHieuLuc': ['badge-amber', 'Chưa hiệu lực'] };
  const pair = map[t] || ['badge-neutral', t || '—'];
  return `<span class="badge ${pair[0]}">${esc(pair[1])}</span>`;
}
function openTTHCForm(rec) {
  const isEdit = !!rec;
  rec = rec || { LoaiTTHC: 'Thuong', NhomNghiepVu: 'Khac', TrangThai: 'DangHieuLuc' };
  const bodyHtml = `
    <form id="tthcForm">
      <div class="form-grid">
        <div class="field mono"><label>Mã TTHC</label><input type="text" name="MaTTHC" value="${esc(rec.MaTTHC || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field span-2"><label>Tên thủ tục hành chính</label><input type="text" name="TenTTHC" value="${esc(rec.TenTTHC || '')}" required /></div>
        <div class="field"><label>Loại TTHC</label><select name="LoaiTTHC">
          <option value="TrucTuyenToanTrinh" ${rec.LoaiTTHC === 'TrucTuyenToanTrinh' ? 'selected' : ''}>Trực tuyến toàn trình</option>
          <option value="Thuong" ${rec.LoaiTTHC === 'Thuong' ? 'selected' : ''}>Thường (không nộp trực tuyến)</option></select></div>
        <div class="field"><label>Nhóm nghiệp vụ</label><select name="NhomNghiepVu">
          ${NHOM_NGHIEPVU.map(n => `<option value="${n.value}" ${rec.NhomNghiepVu === n.value ? 'selected' : ''}>${n.label}</option>`).join('')}
        </select><span class="hint">Quyết định các trường nhập thêm khi xử lý hồ sơ</span></div>
        <div class="field span-2"><label>Trạng thái</label><select name="TrangThai">
          <option value="DangHieuLuc" ${rec.TrangThai === 'DangHieuLuc' ? 'selected' : ''}>Đang hiệu lực</option>
          <option value="Huy" ${rec.TrangThai === 'Huy' ? 'selected' : ''}>Hủy</option>
          <option value="ChuaHieuLuc" ${rec.TrangThai === 'ChuaHieuLuc' ? 'selected' : ''}>Chưa hiệu lực</option></select></div>
        <div class="field span-2"><label>Ghi chú</label><textarea name="GhiChu">${esc(rec.GhiChu || '')}</textarea></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn btn-outline" id="tthcCancel">Hủy</button><button type="submit" class="btn btn-primary">Lưu</button></div>
    </form>`;
  openModal(isEdit ? 'Sửa thủ tục' : 'Thủ tục mới', bodyHtml, (el) => {
    el.querySelector('#tthcCancel').onclick = closeModal;
    el.querySelector('#tthcForm').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.MaTTHC = data.MaTTHC.trim();
      try {
        if (isEdit) await apiPost('update', 'TTHC', data, data.MaTTHC);
        else await apiPost('create', 'TTHC', data);
        toast('Đã lưu thủ tục ' + data.MaTTHC);
        closeModal();
        DB.TTHC = await apiGet('list', { sheet: 'TTHC' });
        renderTTHC();
      } catch (err) { toast(err.message, true); }
    };
  });
}

// ============================================================
// MODULE: CHUYEN VIEN
// ============================================================
function renderChuyenVien() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewCV">+ Chuyên viên mới</button>`;
  document.getElementById('btnNewCV').onclick = () => openCVForm();
  const view = document.getElementById('view');
  view.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Mã CV</th><th>Họ tên</th><th>SĐT</th><th>Email</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody id="cvBody"></tbody></table></div></div>`;
  const draw = () => {
    const body = document.getElementById('cvBody');
    if (!DB.ChuyenVien.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Chưa có chuyên viên nào</h3></div></td></tr>`; return; }
    body.innerHTML = DB.ChuyenVien.map(r => `
      <tr>
        <td class="mono">${esc(r.MaCV)}</td><td>${esc(r.HoTen)}</td><td class="mono">${esc(r.SoDienThoai)}</td><td>${esc(r.Email)}</td>
        <td><span class="badge ${r.TrangThai === 'on' ? 'badge-sage' : 'badge-neutral'}">${r.TrangThai === 'on' ? 'Đang làm việc' : 'Ngừng'}</span></td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.MaCV)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.MaCV)}">Xóa</button>
        </td></tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openCVForm(DB.ChuyenVien.find(x => x.MaCV === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('ChuyenVien', b.dataset.del, 'MaCV', renderChuyenVien));
  };
  draw();
}
function openCVForm(rec) {
  const isEdit = !!rec;
  rec = rec || { TrangThai: 'on' };
  const bodyHtml = `
    <form id="cvForm">
      <div class="form-grid">
        <div class="field mono"><label>Mã chuyên viên</label><input type="text" name="MaCV" value="${esc(rec.MaCV || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field"><label>Trạng thái</label><select name="TrangThai"><option value="on" ${rec.TrangThai === 'on' ? 'selected' : ''}>Đang làm việc</option><option value="off" ${rec.TrangThai === 'off' ? 'selected' : ''}>Ngừng</option></select></div>
        <div class="field span-2"><label>Họ tên</label><input type="text" name="HoTen" value="${esc(rec.HoTen || '')}" required /></div>
        <div class="field"><label>Số điện thoại</label><input type="tel" name="SoDienThoai" value="${esc(rec.SoDienThoai || '')}" /></div>
        <div class="field"><label>Email</label><input type="email" name="Email" value="${esc(rec.Email || '')}" /></div>
        <div class="field span-2"><label>Địa chỉ</label><input type="text" name="DiaChi" value="${esc(rec.DiaChi || '')}" /></div>
        <div class="field span-2"><label>Ghi chú</label><textarea name="GhiChu">${esc(rec.GhiChu || '')}</textarea></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn btn-outline" id="cvCancel">Hủy</button><button type="submit" class="btn btn-primary">Lưu</button></div>
    </form>`;
  openModal(isEdit ? 'Sửa chuyên viên' : 'Chuyên viên mới', bodyHtml, (el) => {
    el.querySelector('#cvCancel').onclick = closeModal;
    el.querySelector('#cvForm').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.MaCV = data.MaCV.trim();
      try {
        if (isEdit) await apiPost('update', 'ChuyenVien', data, data.MaCV);
        else await apiPost('create', 'ChuyenVien', data);
        toast('Đã lưu chuyên viên ' + data.MaCV);
        closeModal();
        DB.ChuyenVien = await apiGet('list', { sheet: 'ChuyenVien' });
        renderChuyenVien();
      } catch (err) { toast(err.message, true); }
    };
  });
}

// ============================================================
// MODULE: TY GIA
// ============================================================
function renderTyGia() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnRefreshRate">↻ Cập nhật tỷ giá live</button>`;
  document.getElementById('btnRefreshRate').onclick = async () => {
    const btn = document.getElementById('btnRefreshRate');
    btn.disabled = true; btn.textContent = 'Đang cập nhật…';
    try {
      await apiGet('refreshRates');
      DB.TyGia = await apiGet('list', { sheet: 'TyGia' });
      toast('Đã cập nhật tỷ giá live');
      renderTyGia();
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = '↻ Cập nhật tỷ giá live'; }
  };
  const view = document.getElementById('view');
  const rows = [...DB.TyGia].sort((a, b) => a.MaNgoaiTe.localeCompare(b.MaNgoaiTe));
  view.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Mã ngoại tệ</th><th>1 USD =</th><th>Quy đổi VND</th><th>Cập nhật lúc</th></tr></thead>
    <tbody>${rows.length ? rows.map(r => `
      <tr><td class="mono">${esc(r.MaNgoaiTe)}</td><td class="mono">${fmtRate(r.TyGiaSoUSD)}</td><td class="mono">${fmtNum(r.TyGiaSoVND)}</td><td class="muted mono">${esc(r.NgayCapNhat)}</td></tr>
    `).join('') : `<tr><td colspan="4"><div class="empty-state"><h3>Chưa có dữ liệu tỷ giá</h3><p>Bấm "Cập nhật tỷ giá live" để lấy tỷ giá mới nhất.</p></div></td></tr>`}
    </tbody></table></div></div>`;
}

// ---------------- Shared delete ----------------
async function deleteRecord(sheet, id, idField, rerender) {
  if (!confirm('Xóa bản ghi "' + id + '"? Hành động này không thể hoàn tác.')) return;
  try {
    await apiPost('delete', sheet, {}, id);
    toast('Đã xóa ' + id);
    DB[sheet] = await apiGet('list', { sheet });
    rerender();
  } catch (err) { toast(err.message, true); }
}

boot();
