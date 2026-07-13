// ============================================================
// QLNHV — app.js
// SPA don gian (khong dung framework) — goi thang API Apps Script
// ============================================================

const DB = { KhachHang: [], ChuyenVien: [], TTHC: [], TyGia: [], HoSo: [], NhomNghiepVu: [], TinhThanh: [], PhuongXa: [] };

const TRANGTHAI_HOSO = ['Chưa tiếp nhận', 'Đã tiếp nhận', 'Bổ sung hồ sơ', 'Đang xử lý', 'Đã xử lý'];
const LOAI_TTHC_OPTIONS = ['Trực tuyến toàn trình', 'Thường'];
const TRANGTHAI_TTHC_OPTIONS = ['Đang hiệu lực', 'Hủy', 'Chưa hiệu lực'];
const LOAI_DAC_BIET_OPTIONS = [
  { value: '', label: 'Không (nghiệp vụ thường)' },
  { value: 'VayTraNoNuocNgoai', label: 'Vay, trả nợ nước ngoài' },
  { value: 'DauTuRaNuocNgoai', label: 'Đầu tư ra nước ngoài' }
];

// ---------------- API helpers ----------------
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 700)); // cho 1 chut roi thu lai (Apps Script doi khi loi tam thoi)
    }
  }
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
function fmtUSD(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '';
  // Luon co dung 6 chu so thap phan (khong cat bot so 0) de dau phay thang hang
  // khi hien thi trong cot font monospace, de nhin hon.
  return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
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
function sameText(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
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
function nhomNghiepVuRow(ten) { return DB.NhomNghiepVu.find(x => sameText(x.TenNhom, ten)); }
function loaiDacBietOf(tenNhom) { const r = nhomNghiepVuRow(tenNhom); return r ? r.LoaiDacBiet : ''; }
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
    await buildSidebarNav();
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
  // Goi lan luot tung sheet (khong dung Promise.all) vi Apps Script Web App
  // xu ly nhieu request dong thoi khong on dinh, de gay loi ngau nhien.
  DB.KhachHang = await apiGet('list', { sheet: 'KhachHang' });
  DB.ChuyenVien = await apiGet('list', { sheet: 'ChuyenVien' });
  DB.TTHC = await apiGet('list', { sheet: 'TTHC' });
  DB.TyGia = await apiGet('list', { sheet: 'TyGia' });
  DB.HoSo = await apiGet('list', { sheet: 'HoSo' });
  DB.NhomNghiepVu = await apiGet('list', { sheet: 'NhomNghiepVu' });
  DB.TinhThanh = await apiGet('list', { sheet: 'TinhThanh' });
  DB.PhuongXa = await apiGet('list', { sheet: 'PhuongXa' });
  normalizeIds();
}

// Google Sheets co the tra ve ma so (MaKH, MaTTHC...) o dang kieu SO thay vi CHU
// (vi du "1.000555" bi hieu la so thap phan). Ep tat ca ve String() de tranh loi
// so sanh "===" giua so va chu khi tim kiem / sua / xoa ban ghi.
function normalizeIds() {
  DB.KhachHang.forEach(r => { r.MaKH = String(r.MaKH); });
  DB.ChuyenVien.forEach(r => { r.MaCV = String(r.MaCV); });
  DB.TTHC.forEach(r => { r.MaTTHC = String(r.MaTTHC); });
  DB.TyGia.forEach(r => { r.MaNgoaiTe = String(r.MaNgoaiTe); });
  DB.NhomNghiepVu.forEach(r => { r.TenNhom = String(r.TenNhom); });
  DB.TinhThanh.forEach(r => { r.TenTinh = String(r.TenTinh); });
  DB.PhuongXa.forEach(r => { r.TenPhuongXa = String(r.TenPhuongXa); });
  DB.HoSo.forEach(r => {
    r.MaHoSo = String(r.MaHoSo);
    r.MaKH = String(r.MaKH);
    r.MaTTHC = String(r.MaTTHC);
    r.MaCV = String(r.MaCV);
    if (r.NguyenTeVay) r.NguyenTeVay = String(r.NguyenTeVay);
    if (r.NguyenTeDauTu) r.NguyenTeDauTu = String(r.NguyenTeDauTu);
  });
}

async function reloadSheet(sheet) {
  DB[sheet] = await apiGet('list', { sheet });
  normalizeIds();
  return DB[sheet];
}

// ---------------- Router ----------------
const ROUTES = {
  hoso: { title: 'Hồ sơ TTHC', render: renderHoSo },
  khachhang: { title: 'Khách hàng', render: renderKhachHang },
  tthc: { title: 'Danh mục thủ tục hành chính', render: renderTTHC },
  chuyenvien: { title: 'Chuyên viên', render: renderChuyenVien },
  tygia: { title: 'Tỷ giá', render: renderTyGia },
  nhomnghiepvu: { title: 'Nhóm nghiệp vụ', render: renderNhomNghiepVu },
  tinhthanh: { title: 'Tỉnh/Thành phố', render: renderTinhThanh },
  phuongxa: { title: 'Phường/Xã', render: renderPhuongXa }
};

// route <-> ten sheet trong Google Sheet (dung de sap xep lai sidebar theo dung thu tu tab)
const NAV_ITEMS = [
  { route: 'hoso', sheet: 'HoSo', label: 'Hồ sơ TTHC' },
  { route: 'khachhang', sheet: 'KhachHang', label: 'Khách hàng' },
  { route: 'tthc', sheet: 'TTHC', label: 'Danh mục TTHC' },
  { route: 'chuyenvien', sheet: 'ChuyenVien', label: 'Chuyên viên' },
  { route: 'tygia', sheet: 'TyGia', label: 'Tỷ giá' },
  { route: 'nhomnghiepvu', sheet: 'NhomNghiepVu', label: 'Nhóm nghiệp vụ' },
  { route: 'tinhthanh', sheet: 'TinhThanh', label: 'Tỉnh/Thành phố' },
  { route: 'phuongxa', sheet: 'PhuongXa', label: 'Phường/Xã' }
];

async function buildSidebarNav() {
  let order = [];
  try { order = await apiGet('sheetOrder'); } catch (e) { /* giu thu tu mac dinh neu loi */ }
  let items = NAV_ITEMS.slice();
  if (order && order.length) {
    items.sort((a, b) => {
      const ia = order.indexOf(a.sheet), ib = order.indexOf(b.sheet);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }
  const nav = document.getElementById('nav');
  nav.innerHTML = items.map((it, idx) => `
    <a href="#${it.route}" data-route="${it.route}" class="nav-item">
      <span class="nav-idx">${String(idx + 1).padStart(2, '0')}</span>${it.label}
    </a>`).join('');
}

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

// ---------------- Sap xep & phan trang (danh cho bang co nhieu du lieu: HoSo, KhachHang...) ----------------
function parseVNDateSort(s) {
  if (!s) return 0;
  const parts = String(s).split('/');
  if (parts.length !== 3) return 0;
  const [d, m, y] = parts;
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
}
function pagerHtml(page, totalPages, totalItems, idPrefix) {
  if (totalItems === 0) return '';
  return `<div class="pager">
    <button class="btn btn-outline btn-sm" id="${idPrefix}Prev" ${page <= 1 ? 'disabled' : ''}>← Trước</button>
    <span class="pager-info">Trang ${page}/${totalPages} — ${totalItems} bản ghi</span>
    <button class="btn btn-outline btn-sm" id="${idPrefix}Next" ${page >= totalPages ? 'disabled' : ''}>Sau →</button>
  </div>`;
}
function wirePager(idPrefix, getPage, setPage, totalPages, redraw) {
  const prevBtn = document.getElementById(idPrefix + 'Prev');
  const nextBtn = document.getElementById(idPrefix + 'Next');
  if (prevBtn) prevBtn.onclick = () => { if (getPage() > 1) { setPage(getPage() - 1); redraw(); } };
  if (nextBtn) nextBtn.onclick = () => { if (getPage() < totalPages) { setPage(getPage() + 1); redraw(); } };
}

// ---------------- Stats bar helper ----------------
function statsBarHtml(rows, groupField, labelFn) {
  const total = rows.length;
  const counts = {};
  rows.forEach(r => {
    const v = (r[groupField] === undefined || r[groupField] === null || r[groupField] === '') ? '(chưa có)' : r[groupField];
    counts[v] = (counts[v] || 0) + 1;
  });
  const chips = Object.keys(counts).map(k => `<div class="stat-chip">${esc(labelFn ? labelFn(k) : k)}: <b>${counts[k]}</b></div>`).join('');
  return `<div class="stats-bar"><div class="stat-chip stat-total">Tổng số: <b>${total}</b></div>${chips}</div>`;
}

// ---------------- Detail view (click 1 dòng để xem đầy đủ) ----------------
function showRecordDetail(title, record, fieldDefs) {
  const rows = fieldDefs.map(([key, label, fmt]) => {
    let display;
    if (fmt) display = fmt(record[key], record);
    else display = (record[key] === undefined || record[key] === null || record[key] === '') ? '—' : esc(record[key]);
    return `<div class="detail-row"><div class="detail-label">${esc(label)}</div><div class="detail-value">${display}</div></div>`;
  }).join('');
  openModal(title, `<div class="detail-grid">${rows}</div>`, () => {});
}
// Gan su kien click xem chi tiet cho tung dong <tr data-view="ID">, tru khi click vao nut Sua/Xoa
function wireRowDetail(bodyEl, records, idField, fieldDefs, titlePrefix) {
  bodyEl.querySelectorAll('tr[data-view]').forEach(tr => {
    tr.onclick = (e) => {
      if (e.target.closest('button')) return;
      const rec = records.find(r => String(r[idField]) === tr.dataset.view);
      if (rec) showRecordDetail(titlePrefix + ' ' + rec[idField], rec, fieldDefs);
    };
  });
}

// ============================================================
// MODULE: HO SO TTHC
// ============================================================
function renderHoSo() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewHoSo">+ Hồ sơ mới</button>`;
  document.getElementById('btnNewHoSo').onclick = () => openHoSoForm();

  const view = document.getElementById('view');
  view.innerHTML = `
    ${statsBarHtml(DB.HoSo, 'TrangThai')}
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
    </table></div>
    <div id="hsPager"></div>
    </div>`;

  const PAGE_SIZE = 50;
  let page = 1;
  const draw = () => {
    const q = (document.getElementById('hsSearch').value || '').toLowerCase();
    const ft = document.getElementById('hsFilterTrangThai').value;
    const filtered = DB.HoSo.filter(r => {
      const matchQ = !q || r.MaHoSo.toLowerCase().includes(q) || khName(r.MaKH).toLowerCase().includes(q);
      const matchT = !ft || r.TrangThai === ft;
      return matchQ && matchT;
    });
    // Ho so moi nhat (theo ngay tiep nhan) hien len tren
    filtered.sort((a, b) => parseVNDateSort(b.NgayTiepNhan) - parseVNDateSort(a.NgayTiepNhan));

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > totalPages) page = totalPages;
    const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const body = document.getElementById('hsBody');
    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>Chưa có hồ sơ nào</h3><p>Bấm "+ Hồ sơ mới" để bắt đầu.</p></div></td></tr>`;
      document.getElementById('hsPager').innerHTML = '';
      return;
    }
    body.innerHTML = rows.map(r => `
      <tr data-view="${esc(r.MaHoSo)}">
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
    wireRowDetail(body, rows, 'MaHoSo', HOSO_DETAIL_FIELDS, 'Hồ sơ');

    document.getElementById('hsPager').innerHTML = pagerHtml(page, totalPages, filtered.length, 'hs');
    wirePager('hs', () => page, (p) => { page = p; }, totalPages, draw);
  };
  document.getElementById('hsSearch').oninput = () => { page = 1; draw(); };
  document.getElementById('hsFilterTrangThai').onchange = () => { page = 1; draw(); };
  draw();
}

const HOSO_DETAIL_FIELDS = [
  ['MaHoSo', 'Mã số hồ sơ'],
  ['MaKH', 'Mã khách hàng', (v) => `${esc(v)} — ${esc(khName(v))}`],
  ['MaTTHC', 'Thủ tục hành chính', (v) => `${esc(v)} — ${esc(tthcName(v))}`],
  ['NgayTiepNhan', 'Ngày tiếp nhận'],
  ['NgayHenTra', 'Ngày hẹn trả'],
  ['MaCV', 'Chuyên viên', (v) => `${esc(v)} — ${esc(cvName(v))}`],
  ['TrangThai', 'Trạng thái', (v) => statusBadge(v)],
  ['SoVanBan', 'Số văn bản'],
  ['NgayVanBan', 'Ngày văn bản'],
  ['FileVanBan', 'File văn bản đính kèm', (v) => v ? `<a href="${esc(v)}" target="_blank" rel="noopener">Xem file</a>` : '—'],
  ['SoPhieuBoSung', 'Số phiếu yêu cầu bổ sung'],
  ['NgayYeuCauBoSung', 'Ngày yêu cầu bổ sung'],
  ['NoiDungBoSung', 'Nội dung cần bổ sung'],
  ['MaKhoanVay', 'Mã số khoản vay'],
  ['SoTienVayNguyenTe', 'Số tiền vay (nguyên tệ)', (v, r) => v ? `${fmtNum(v)} ${esc(r.NguyenTeVay || '')}` : '—'],
  ['NguyenTeVay', 'Nguyên tệ (vay)'],
  ['HetNo', 'Hết nợ', (v) => v === true ? 'Có' : 'Không'],
  ['MaDuAn', 'Mã số dự án đầu tư'],
  ['SoTienDangKyNguyenTe', 'Số tiền đăng ký chuyển ra (nguyên tệ)', (v, r) => v ? `${fmtNum(v)} ${esc(r.NguyenTeDauTu || '')}` : '—'],
  ['NguyenTeDauTu', 'Nguyên tệ (đầu tư)'],
  ['GhiChu', 'Ghi chú']
];

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
            <div class="field span-2"><label>File văn bản đã xử lý</label>
              <input type="file" id="fFileVanBan" />
              ${rec.FileVanBan ? `<span class="hint">Đã có file: <a href="${esc(rec.FileVanBan)}" target="_blank" rel="noopener">xem file hiện tại</a> — chọn file mới nếu muốn thay thế</span>` : ''}
            </div>
          </div>
        </fieldset>

        <fieldset class="subsection" id="fsBoSung"><legend>Bổ sung hồ sơ</legend>
          <div class="form-grid">
            <div class="field"><label>Số phiếu yêu cầu bổ sung</label><input type="text" name="SoPhieuBoSung" value="${esc(rec.SoPhieuBoSung || '')}" /></div>
            <div class="field"><label>Ngày yêu cầu bổ sung</label><input type="date" name="NgayYeuCauBoSung" value="${toISODate(rec.NgayYeuCauBoSung)}" /></div>
            <div class="field span-2"><label>Nội dung cần bổ sung</label><textarea name="NoiDungBoSung">${esc(rec.NoiDungBoSung || '')}</textarea></div>
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
      const dacBiet = tthc ? loaiDacBietOf(tthc.NhomNghiepVu) : '';
      el.querySelector('#fsKetQua').style.display = isDone ? '' : 'none';
      el.querySelector('#fsBoSung').style.display = (trangThai === 'Bổ sung hồ sơ') ? '' : 'none';
      el.querySelector('#fsVay').style.display = (isDone && dacBiet === 'VayTraNoNuocNgoai') ? '' : 'none';
      el.querySelector('#fsDauTu').style.display = (isDone && dacBiet === 'DauTuRaNuocNgoai') ? '' : 'none';
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
      const submitBtn = el.querySelector('button[type=submit]');
      submitBtn.disabled = true;
      const originalBtnText = submitBtn.textContent;
      try {
        let fileVanBanUrl = rec.FileVanBan || '';
        const fileInput = el.querySelector('#fFileVanBan');
        if (fileInput.files && fileInput.files[0]) {
          submitBtn.textContent = 'Đang tải file lên…';
          const file = fileInput.files[0];
          const base64Data = await fileToBase64(file);
          const uploadRes = await apiUploadFile(file.name, file.type, base64Data, fd.get('MaHoSo').trim());
          fileVanBanUrl = uploadRes.url;
        }
        submitBtn.textContent = 'Đang lưu…';
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
          FileVanBan: fileVanBanUrl,
          SoPhieuBoSung: fd.get('SoPhieuBoSung') || '',
          NgayYeuCauBoSung: toVNDate(fd.get('NgayYeuCauBoSung')),
          NoiDungBoSung: fd.get('NoiDungBoSung') || '',
          MaKhoanVay: fd.get('MaKhoanVay') || '',
          SoTienVayNguyenTe: parseNum(fd.get('SoTienVayNguyenTe')),
          NguyenTeVay: fd.get('NguyenTeVay') || '',
          HetNo: el.querySelector('#fHetNo').checked,
          MaDuAn: fd.get('MaDuAn') || '',
          SoTienDangKyNguyenTe: parseNum(fd.get('SoTienDangKyNguyenTe')),
          NguyenTeDauTu: fd.get('NguyenTeDauTu') || '',
          GhiChu: fd.get('GhiChu') || ''
        };
        if (isEdit) await apiPost('update', 'HoSo', data, data.MaHoSo);
        else await apiPost('create', 'HoSo', data);
        toast('Đã lưu hồ sơ ' + data.MaHoSo);
        closeModal();
        await reloadSheet('HoSo');
        renderHoSo();
      } catch (err) {
        toast(err.message, true);
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
    };
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsDataURL(file);
  });
}

async function apiUploadFile(fileName, mimeType, base64Data, maHoSo) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'uploadFile', fileName, mimeType, base64Data, maHoSo })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// ============================================================
// MODULE: KHACH HANG
// ============================================================
function renderKhachHang() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewKH">+ Khách hàng mới</button>`;
  document.getElementById('btnNewKH').onclick = () => openKHForm();
  const view = document.getElementById('view');
  view.innerHTML = `
    ${statsBarHtml(DB.KhachHang, 'Loai', (v) => v === 'ToChuc' ? 'Tổ chức' : v === 'CaNhan' ? 'Cá nhân' : v)}
    <div class="toolbar"><input type="text" class="search-input" id="khSearch" placeholder="Tìm theo mã, tên khách hàng…" /></div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Mã KH</th><th>Loại</th><th>Tên khách hàng</th><th>Địa chỉ</th><th>SĐT</th><th>Email</th><th></th></tr></thead>
      <tbody id="khBody"></tbody>
    </table></div>
    <div id="khPager"></div>
    </div>`;

  const PAGE_SIZE = 50;
  let page = 1;
  const draw = () => {
    const q = (document.getElementById('khSearch').value || '').toLowerCase();
    const filtered = DB.KhachHang.filter(r => !q || r.MaKH.toLowerCase().includes(q) || (r.TenKhachHang || '').toLowerCase().includes(q));
    // Sap xep A-Z theo ten khach hang
    filtered.sort((a, b) => (a.TenKhachHang || '').localeCompare(b.TenKhachHang || '', 'vi'));

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > totalPages) page = totalPages;
    const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const body = document.getElementById('khBody');
    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>Chưa có khách hàng nào</h3></div></td></tr>`;
      document.getElementById('khPager').innerHTML = '';
      return;
    }
    body.innerHTML = rows.map(r => `
      <tr data-view="${esc(r.MaKH)}">
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
    wireRowDetail(body, rows, 'MaKH', KHACHHANG_DETAIL_FIELDS, 'Khách hàng');

    document.getElementById('khPager').innerHTML = pagerHtml(page, totalPages, filtered.length, 'kh');
    wirePager('kh', () => page, (p) => { page = p; }, totalPages, draw);
  };
  document.getElementById('khSearch').oninput = () => { page = 1; draw(); };
  draw();
}
function loaiKHLabel(r) {
  if (r.Loai === 'ToChuc') return `Tổ chức <span class="muted">(${esc(r.LoaiToChuc || '')})</span>`;
  return `Cá nhân <span class="muted">(${r.LoaiCaNhan === 'NuocNgoai' ? 'nước ngoài' : 'Việt Nam'})</span>`;
}
const KHACHHANG_DETAIL_FIELDS = [
  ['MaKH', 'Mã khách hàng (MST)'],
  ['MaDinhDanh', 'Mã định danh'],
  ['TenKhachHang', 'Tên khách hàng'],
  ['Loai', 'Loại khách hàng', (v) => v === 'ToChuc' ? 'Tổ chức' : 'Cá nhân'],
  ['LoaiToChuc', 'Loại hình tổ chức'],
  ['LoaiCaNhan', 'Quốc tịch', (v) => v === 'NuocNgoai' ? 'Người nước ngoài' : (v ? 'Người Việt Nam' : '—')],
  ['DiaChiSo', 'Số nhà, tên đường'],
  ['DiaChiPhuongXa', 'Phường/Xã'],
  ['DiaChiTinhTP', 'Tỉnh/Thành phố'],
  ['SoDienThoai', 'Số điện thoại'],
  ['Email', 'Email'],
  ['GhiChu', 'Ghi chú']
];
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
        <div class="field"><label>Phường/Xã</label><select name="DiaChiPhuongXa">
          <option value="">— chọn phường/xã —</option>
          ${DB.PhuongXa.map(p => `<option value="${esc(p.TenPhuongXa)}" ${rec.DiaChiPhuongXa === p.TenPhuongXa ? 'selected' : ''}>${esc(p.TenPhuongXa)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Tỉnh/Thành phố</label><select name="DiaChiTinhTP">
          <option value="">— chọn tỉnh/thành —</option>
          ${DB.TinhThanh.map(t => `<option value="${esc(t.TenTinh)}" ${rec.DiaChiTinhTP === t.TenTinh ? 'selected' : ''}>${esc(t.TenTinh)}</option>`).join('')}
        </select></div>
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
        await reloadSheet('KhachHang');
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
  view.innerHTML = `
    ${statsBarHtml(DB.TTHC, 'TrangThai')}
    <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Mã TTHC</th><th>Tên thủ tục</th><th>Loại</th><th>Nhóm nghiệp vụ</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody id="tthcBody"></tbody></table></div></div>`;
  const draw = () => {
    const body = document.getElementById('tthcBody');
    if (!DB.TTHC.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Chưa có thủ tục nào</h3></div></td></tr>`; return; }
    body.innerHTML = DB.TTHC.map(r => `
      <tr data-view="${esc(r.MaTTHC)}">
        <td class="mono">${esc(r.MaTTHC)}</td>
        <td>${esc(r.TenTTHC)}</td>
        <td class="muted">${esc(r.LoaiTTHC)}</td>
        <td class="muted">${esc(r.NhomNghiepVu)}</td>
        <td>${tthcStatusBadge(r.TrangThai)}</td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.MaTTHC)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.MaTTHC)}">Xóa</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openTTHCForm(DB.TTHC.find(x => x.MaTTHC === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('TTHC', b.dataset.del, 'MaTTHC', renderTTHC));
    wireRowDetail(body, DB.TTHC, 'MaTTHC', TTHC_DETAIL_FIELDS, 'TTHC');
  };
  draw();
}
const TTHC_DETAIL_FIELDS = [
  ['MaTTHC', 'Mã TTHC'],
  ['TenTTHC', 'Tên thủ tục hành chính'],
  ['LoaiTTHC', 'Loại TTHC'],
  ['NhomNghiepVu', 'Nhóm nghiệp vụ'],
  ['TrangThai', 'Trạng thái', (v) => tthcStatusBadge(v)],
  ['GhiChu', 'Ghi chú']
];
function tthcStatusBadge(t) {
  if (sameText(t, 'Đang hiệu lực')) return `<span class="badge badge-sage">Đang hiệu lực</span>`;
  if (sameText(t, 'Hủy')) return `<span class="badge badge-danger">Hủy</span>`;
  if (sameText(t, 'Chưa hiệu lực')) return `<span class="badge badge-amber">Chưa hiệu lực</span>`;
  return `<span class="badge badge-neutral">${esc(t || '—')}</span>`;
}
function openTTHCForm(rec) {
  const isEdit = !!rec;
  rec = rec || { LoaiTTHC: 'Thường', NhomNghiepVu: 'Khác', TrangThai: 'Đang hiệu lực' };
  const nnvOptions = DB.NhomNghiepVu.map(n => `<option value="${esc(n.TenNhom)}" ${sameText(rec.NhomNghiepVu, n.TenNhom) ? 'selected' : ''}>${esc(n.TenNhom)}</option>`).join('');
  const bodyHtml = `
    <form id="tthcForm">
      <div class="form-grid">
        <div class="field mono"><label>Mã TTHC</label><input type="text" name="MaTTHC" value="${esc(rec.MaTTHC || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field span-2"><label>Tên thủ tục hành chính</label><input type="text" name="TenTTHC" value="${esc(rec.TenTTHC || '')}" required /></div>
        <div class="field"><label>Loại TTHC</label><select name="LoaiTTHC">
          ${LOAI_TTHC_OPTIONS.map(o => `<option value="${o}" ${sameText(rec.LoaiTTHC, o) ? 'selected' : ''}>${o}</option>`).join('')}
        </select></div>
        <div class="field"><label>Nhóm nghiệp vụ</label><select name="NhomNghiepVu">${nnvOptions}</select>
          <span class="hint">Quản lý danh mục ở tab "Nhóm nghiệp vụ"</span></div>
        <div class="field span-2"><label>Trạng thái</label><select name="TrangThai">
          ${TRANGTHAI_TTHC_OPTIONS.map(o => `<option value="${o}" ${sameText(rec.TrangThai, o) ? 'selected' : ''}>${o}</option>`).join('')}
        </select></div>
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
        await reloadSheet('TTHC');
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
  view.innerHTML = `
    ${statsBarHtml(DB.ChuyenVien, 'TrangThai', (v) => v === 'on' ? 'Đang làm việc' : 'Ngừng')}
    <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Mã CV</th><th>Họ tên</th><th>SĐT</th><th>Email</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody id="cvBody"></tbody></table></div></div>`;
  const draw = () => {
    const body = document.getElementById('cvBody');
    if (!DB.ChuyenVien.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Chưa có chuyên viên nào</h3></div></td></tr>`; return; }
    body.innerHTML = DB.ChuyenVien.map(r => `
      <tr data-view="${esc(r.MaCV)}">
        <td class="mono">${esc(r.MaCV)}</td><td>${esc(r.HoTen)}</td><td class="mono">${esc(r.SoDienThoai)}</td><td>${esc(r.Email)}</td>
        <td><span class="badge ${r.TrangThai === 'on' ? 'badge-sage' : 'badge-neutral'}">${r.TrangThai === 'on' ? 'Đang làm việc' : 'Ngừng'}</span></td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.MaCV)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.MaCV)}">Xóa</button>
        </td></tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openCVForm(DB.ChuyenVien.find(x => x.MaCV === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('ChuyenVien', b.dataset.del, 'MaCV', renderChuyenVien));
    wireRowDetail(body, DB.ChuyenVien, 'MaCV', CHUYENVIEN_DETAIL_FIELDS, 'Chuyên viên');
  };
  draw();
}
const CHUYENVIEN_DETAIL_FIELDS = [
  ['MaCV', 'Mã chuyên viên'],
  ['HoTen', 'Họ tên'],
  ['DiaChi', 'Địa chỉ'],
  ['SoDienThoai', 'Số điện thoại'],
  ['Email', 'Email'],
  ['TrangThai', 'Trạng thái', (v) => v === 'on' ? 'Đang làm việc' : 'Ngừng'],
  ['GhiChu', 'Ghi chú']
];
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
        await reloadSheet('ChuyenVien');
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
      await reloadSheet('TyGia');
      toast('Đã cập nhật tỷ giá live');
      renderTyGia();
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = '↻ Cập nhật tỷ giá live'; }
  };
  const view = document.getElementById('view');
  const rows = [...DB.TyGia].sort((a, b) => a.MaNgoaiTe.localeCompare(b.MaNgoaiTe));
  view.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Mã ngoại tệ</th><th class="num">Quy đổi USD (1 đơn vị)</th><th class="num">Quy đổi VND</th><th>Cập nhật lúc</th></tr></thead>
    <tbody>${rows.length ? rows.map(r => {
      const usdPerUnit = r.TyGiaSoUSD ? 1 / Number(r.TyGiaSoUSD) : '';
      return `
      <tr><td class="mono">${esc(r.MaNgoaiTe)}</td><td class="mono num">${usdPerUnit === '' ? '' : '$' + fmtUSD(usdPerUnit)}</td><td class="mono num">${fmtNum(r.TyGiaSoVND)}</td><td class="muted mono">${esc(r.NgayCapNhat)}</td></tr>
    `;}).join('') : `<tr><td colspan="4"><div class="empty-state"><h3>Chưa có dữ liệu tỷ giá</h3><p>Bấm "Cập nhật tỷ giá live" để lấy tỷ giá mới nhất.</p></div></td></tr>`}
    </tbody></table></div></div>`;
}

// ============================================================
// MODULE: NHOM NGHIEP VU (danh muc quan ly nhom nghiep vu TTHC)
// ============================================================
function renderNhomNghiepVu() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewNNV">+ Nhóm mới</button>`;
  document.getElementById('btnNewNNV').onclick = () => openNNVForm();
  const view = document.getElementById('view');
  view.innerHTML = `
    ${statsBarHtml(DB.NhomNghiepVu, 'LoaiDacBiet', (v) => (LOAI_DAC_BIET_OPTIONS.find(o => o.value === v) || {}).label || 'Không')}
    <div class="card" style="margin-bottom:16px"><div style="padding:14px 18px" class="muted">
      Danh mục này quyết định các trường nhập thêm khi xử lý <b>Hồ sơ</b> (ví dụ: khoản vay, dự án đầu tư).
      Chọn "Loại đặc biệt" đúng ý nghĩa nghiệp vụ, còn <b>Tên nhóm</b> bạn có thể đặt tên tự do theo ý muốn.
    </div></div>
    <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Tên nhóm</th><th>Loại đặc biệt</th><th>Mô tả</th><th></th></tr></thead>
    <tbody id="nnvBody"></tbody></table></div></div>`;
  const draw = () => {
    const body = document.getElementById('nnvBody');
    if (!DB.NhomNghiepVu.length) { body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><h3>Chưa có nhóm nghiệp vụ nào</h3></div></td></tr>`; return; }
    body.innerHTML = DB.NhomNghiepVu.map(r => `
      <tr data-view="${esc(r.TenNhom)}">
        <td>${esc(r.TenNhom)}</td>
        <td class="muted">${esc((LOAI_DAC_BIET_OPTIONS.find(o => o.value === r.LoaiDacBiet) || {}).label || 'Không')}</td>
        <td class="muted">${esc(r.MoTa || '')}</td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.TenNhom)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.TenNhom)}">Xóa</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openNNVForm(DB.NhomNghiepVu.find(x => x.TenNhom === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('NhomNghiepVu', b.dataset.del, 'TenNhom', renderNhomNghiepVu));
    wireRowDetail(body, DB.NhomNghiepVu, 'TenNhom', NNV_DETAIL_FIELDS, 'Nhóm nghiệp vụ');
  };
  draw();
}
const NNV_DETAIL_FIELDS = [
  ['TenNhom', 'Tên nhóm nghiệp vụ'],
  ['LoaiDacBiet', 'Loại đặc biệt', (v) => (LOAI_DAC_BIET_OPTIONS.find(o => o.value === v) || {}).label || 'Không'],
  ['MoTa', 'Mô tả'],
  ['GhiChu', 'Ghi chú']
];
function openNNVForm(rec) {
  const isEdit = !!rec;
  rec = rec || { LoaiDacBiet: '' };
  const bodyHtml = `
    <form id="nnvForm">
      <div class="form-grid cols-1">
        <div class="field"><label>Tên nhóm nghiệp vụ</label><input type="text" name="TenNhom" value="${esc(rec.TenNhom || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field"><label>Loại đặc biệt</label><select name="LoaiDacBiet">
          ${LOAI_DAC_BIET_OPTIONS.map(o => `<option value="${o.value}" ${rec.LoaiDacBiet === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select><span class="hint">Quyết định các trường nhập thêm khi xử lý hồ sơ (Khoản vay / Dự án đầu tư)</span></div>
        <div class="field"><label>Mô tả</label><input type="text" name="MoTa" value="${esc(rec.MoTa || '')}" /></div>
        <div class="field"><label>Ghi chú</label><textarea name="GhiChu">${esc(rec.GhiChu || '')}</textarea></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn btn-outline" id="nnvCancel">Hủy</button><button type="submit" class="btn btn-primary">Lưu</button></div>
    </form>`;
  openModal(isEdit ? 'Sửa nhóm nghiệp vụ' : 'Nhóm nghiệp vụ mới', bodyHtml, (el) => {
    el.querySelector('#nnvCancel').onclick = closeModal;
    el.querySelector('#nnvForm').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.TenNhom = data.TenNhom.trim();
      try {
        if (isEdit) await apiPost('update', 'NhomNghiepVu', data, data.TenNhom);
        else await apiPost('create', 'NhomNghiepVu', data);
        toast('Đã lưu nhóm nghiệp vụ ' + data.TenNhom);
        closeModal();
        await reloadSheet('NhomNghiepVu');
        renderNhomNghiepVu();
      } catch (err) { toast(err.message, true); }
    };
  });
}

// ---------------- Shared delete ----------------
async function deleteRecord(sheet, id, idField, rerender) {
  if (!confirm('Xóa bản ghi "' + id + '"? Hành động này không thể hoàn tác.')) return;
  try {
    await apiPost('delete', sheet, {}, id);
    toast('Đã xóa ' + id);
    await reloadSheet(sheet);
    rerender();
  } catch (err) { toast(err.message, true); }
}

// ============================================================
function renderTinhThanh() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewTT">+ Tỉnh/Thành mới</button>`;
  document.getElementById('btnNewTT').onclick = () => openTinhThanhForm();
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="stats-bar"><div class="stat-chip stat-total">Tổng số: <b>${DB.TinhThanh.length}</b></div></div>
    <div class="toolbar"><input type="text" class="search-input" id="ttSearch" placeholder="Tìm theo tên tỉnh/thành…" /></div>
    <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Tỉnh/Thành phố</th><th>Sáp nhập từ</th><th>Trung tâm hành chính</th><th></th></tr></thead>
    <tbody id="ttBody"></tbody></table></div></div>`;
  const draw = () => {
    const q = (document.getElementById('ttSearch').value || '').toLowerCase();
    const rows = DB.TinhThanh.filter(r => !q || r.TenTinh.toLowerCase().includes(q));
    const body = document.getElementById('ttBody');
    if (!rows.length) { body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><h3>Chưa có tỉnh/thành nào</h3></div></td></tr>`; return; }
    body.innerHTML = rows.map(r => `
      <tr data-view="${esc(r.TenTinh)}">
        <td>${esc(r.TenTinh)}</td>
        <td class="muted">${esc(r.TinhSapNhap)}</td>
        <td class="muted">${esc(r.TTHC)}</td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.TenTinh)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.TenTinh)}">Xóa</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openTinhThanhForm(DB.TinhThanh.find(x => x.TenTinh === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('TinhThanh', b.dataset.del, 'TenTinh', renderTinhThanh));
    wireRowDetail(body, rows, 'TenTinh', TINHTHANH_DETAIL_FIELDS, 'Tỉnh/Thành phố');
  };
  document.getElementById('ttSearch').oninput = draw;
  draw();
}
const TINHTHANH_DETAIL_FIELDS = [
  ['TenTinh', 'Tên tỉnh/thành phố'],
  ['TinhSapNhap', 'Sáp nhập từ'],
  ['TTHC', 'Trung tâm hành chính'],
  ['GhiChu', 'Ghi chú']
];
function openTinhThanhForm(rec) {
  const isEdit = !!rec;
  rec = rec || {};
  const bodyHtml = `
    <form id="ttForm">
      <div class="form-grid cols-1">
        <div class="field"><label>Tên tỉnh/thành phố</label><input type="text" name="TenTinh" value="${esc(rec.TenTinh || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field"><label>Sáp nhập từ (nếu có)</label><input type="text" name="TinhSapNhap" value="${esc(rec.TinhSapNhap || '')}" /></div>
        <div class="field"><label>Trung tâm hành chính (TTHC)</label><input type="text" name="TTHC" value="${esc(rec.TTHC || '')}" /></div>
        <div class="field"><label>Ghi chú</label><textarea name="GhiChu">${esc(rec.GhiChu || '')}</textarea></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn btn-outline" id="ttCancel">Hủy</button><button type="submit" class="btn btn-primary">Lưu</button></div>
    </form>`;
  openModal(isEdit ? 'Sửa tỉnh/thành phố' : 'Tỉnh/thành phố mới', bodyHtml, (el) => {
    el.querySelector('#ttCancel').onclick = closeModal;
    el.querySelector('#ttForm').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.TenTinh = data.TenTinh.trim();
      try {
        if (isEdit) await apiPost('update', 'TinhThanh', data, data.TenTinh);
        else await apiPost('create', 'TinhThanh', data);
        toast('Đã lưu ' + data.TenTinh);
        closeModal();
        await reloadSheet('TinhThanh');
        renderTinhThanh();
      } catch (err) { toast(err.message, true); }
    };
  });
}

// ============================================================
// MODULE: PHUONG/XA
// ============================================================
function renderPhuongXa() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewPX">+ Phường/Xã mới</button>`;
  document.getElementById('btnNewPX').onclick = () => openPhuongXaForm();
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="stats-bar"><div class="stat-chip stat-total">Tổng số: <b>${DB.PhuongXa.length}</b></div></div>
    <div class="toolbar"><input type="text" class="search-input" id="pxSearch" placeholder="Tìm theo tên phường/xã…" /></div>
    <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Phường/Xã</th><th>Nhóm địa bàn</th><th>CVPT Vay</th><th>CVPT Vàng</th><th>Ghi chú</th><th></th></tr></thead>
    <tbody id="pxBody"></tbody></table></div></div>`;
  const draw = () => {
    const q = (document.getElementById('pxSearch').value || '').toLowerCase();
    const rows = DB.PhuongXa.filter(r => !q || r.TenPhuongXa.toLowerCase().includes(q));
    const body = document.getElementById('pxBody');
    if (!rows.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Chưa có phường/xã nào</h3></div></td></tr>`; return; }
    body.innerHTML = rows.map(r => `
      <tr data-view="${esc(r.TenPhuongXa)}">
        <td>${esc(r.TenPhuongXa)}</td>
        <td class="mono">${esc(r.NhomDiaBan)}</td>
        <td class="mono">${esc(r.CVPTVay)}</td>
        <td class="mono">${esc(r.CVPTVang)}</td>
        <td class="muted">${esc(r.GhiChu)}</td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.TenPhuongXa)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.TenPhuongXa)}">Xóa</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openPhuongXaForm(DB.PhuongXa.find(x => x.TenPhuongXa === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('PhuongXa', b.dataset.del, 'TenPhuongXa', renderPhuongXa));
    wireRowDetail(body, rows, 'TenPhuongXa', PHUONGXA_DETAIL_FIELDS, 'Phường/Xã');
  };
  document.getElementById('pxSearch').oninput = draw;
  draw();
}
const PHUONGXA_DETAIL_FIELDS = [
  ['TenPhuongXa', 'Tên phường/xã'],
  ['NhomDiaBan', 'Nhóm địa bàn'],
  ['CVPTVay', 'CVPT Vay'],
  ['CVPTVang', 'CVPT Vàng'],
  ['GhiChu', 'Ghi chú']
];
function openPhuongXaForm(rec) {
  const isEdit = !!rec;
  rec = rec || {};
  const bodyHtml = `
    <form id="pxForm">
      <div class="form-grid">
        <div class="field span-2"><label>Tên phường/xã</label><input type="text" name="TenPhuongXa" value="${esc(rec.TenPhuongXa || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field"><label>Nhóm địa bàn</label><input type="text" name="NhomDiaBan" value="${esc(rec.NhomDiaBan || '')}" /></div>
        <div class="field"><label>CVPT Vay</label><input type="text" name="CVPTVay" value="${esc(rec.CVPTVay || '')}" /></div>
        <div class="field"><label>CVPT Vàng</label><input type="text" name="CVPTVang" value="${esc(rec.CVPTVang || '')}" /></div>
        <div class="field span-2"><label>Ghi chú</label><textarea name="GhiChu">${esc(rec.GhiChu || '')}</textarea></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn btn-outline" id="pxCancel">Hủy</button><button type="submit" class="btn btn-primary">Lưu</button></div>
    </form>`;
  openModal(isEdit ? 'Sửa phường/xã' : 'Phường/xã mới', bodyHtml, (el) => {
    el.querySelector('#pxCancel').onclick = closeModal;
    el.querySelector('#pxForm').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.TenPhuongXa = data.TenPhuongXa.trim();
      try {
        if (isEdit) await apiPost('update', 'PhuongXa', data, data.TenPhuongXa);
        else await apiPost('create', 'PhuongXa', data);
        toast('Đã lưu ' + data.TenPhuongXa);
        closeModal();
        await reloadSheet('PhuongXa');
        renderPhuongXa();
      } catch (err) { toast(err.message, true); }
    };
  });
}
boot();
