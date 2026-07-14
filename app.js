// ============================================================
// QLNHV — app.js
// SPA don gian (khong dung framework) — goi thang API Apps Script
// ============================================================

const DB = { KhachHang: [], LoaiHinhKhachHang: [], ChuyenVien: [], TTHC: [], TyGia: [], HoSo: [], Khoanvay: [], ChoVay: [], DTRNNN: [], DTRNNN_NDT: [], Campuchia: [], VPHC: [], NhomNghiepVu: [], TinhThanh: [], PhuongXa: [], QG: [], TKNHTONN: [], BCMoTKnTONN: [] };

const TRANGTHAI_HOSO = ['Chưa tiếp nhận', 'Đã tiếp nhận', 'Bổ sung hồ sơ', 'Đang xử lý', 'Đã xử lý'];
const LOAI_TTHC_OPTIONS = ['Trực tuyến toàn trình', 'Thường'];
const TRANGTHAI_TTHC_OPTIONS = ['Đang hiệu lực', 'Hủy', 'Chưa hiệu lực'];
const LOAI_DAC_BIET_OPTIONS = [
  { value: 'Thuong', label: 'Thường' },
  { value: 'DacBiet', label: 'Đặc biệt' }
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
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 6 });
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
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  let s = String(v).trim().replace(/[\s\u00a0]/g, '').replace(/[^0-9,\.\-+]/g, '');
  if (!s) return '';
  const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    s = s.replace(thousands, '').replace(decimal, '.');
  } else if (comma >= 0) {
    const parts = s.split(',');
    s = parts.length === 2 ? parts[0] + '.' + parts[1] : parts.slice(0, -1).join('') + '.' + parts.at(-1);
  } else if ((s.match(/\./g) || []).length > 1) {
    const parts = s.split('.');
    const allThousands = parts.slice(1).every(x => x.length === 3);
    s = allThousands ? parts.join('') : parts.slice(0, -1).join('') + '.' + parts.at(-1);
  } else if (dot >= 0) {
    const parts = s.split('.');
    if (parts[0] !== '0' && parts[1]?.length === 3) s = parts.join('');
  }
  const n = Number(s);
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
  const value = String(iso).trim();
  let m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[1].padStart(2,'0') + '/' + m[2].padStart(2,'0') + '/' + m[3];
  m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[3].padStart(2,'0') + '/' + m[2].padStart(2,'0') + '/' + m[1];
  return value;
}
function fmtDateVN(value) { return toVNDate(value); }
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
function qgName(ma) { const r = DB.QG.find(x => x['MÃ QUỐC GIA'] === String(ma)); return r ? r['TÊN QUỐC GIA'] : String(ma || ''); }
function cvName(ma) { const r = DB.ChuyenVien.find(x => x.MaCV === ma); return r ? r.HoTen : ''; }
function tthcRow(ma) { return DB.TTHC.find(x => x.MaTTHC === ma); }
function tthcName(ma) { const r = tthcRow(ma); return r ? r.TenTTHC : ''; }
function rateRow(code) { return DB.TyGia.find(x => x.MaNgoaiTe === code); }
function nhomNghiepVuRow(ten) { return DB.NhomNghiepVu.find(x => sameText(x.TenNhom, ten)); }
function loaiDacBietOf(tenNhom) { const r = nhomNghiepVuRow(tenNhom); return r ? r.LoaiDacBiet : ''; }
function isSpecialGroup(tenNhom) { const v=loaiDacBietOf(tenNhom); return !!v && v !== 'Thuong'; }
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
  DB.LoaiHinhKhachHang = await apiGet('list', { sheet: 'LoaiHinhKhachHang' });
  DB.ChuyenVien = await apiGet('list', { sheet: 'ChuyenVien' });
  DB.TTHC = await apiGet('list', { sheet: 'TTHC' });
  DB.TyGia = await apiGet('list', { sheet: 'TyGia' });
  DB.HoSo = await apiGet('list', { sheet: 'HoSo' });
  DB.Khoanvay = await apiGet('list', { sheet: 'Khoanvay' });
  DB.ChoVay = await apiGet('list', { sheet: 'ChoVay' });
  DB.DTRNNN = await apiGet('list', { sheet: 'DTRNNN' });
  DB.DTRNNN_NDT = await apiGet('list', { sheet: 'DTRNNN_NDT' });
  DB.Campuchia = await apiGet('list', { sheet: 'Campuchia' });
  try { DB.VPHC = await apiGet('list', { sheet: 'VPHC' }); } catch (e) { DB.VPHC = []; }
  DB.NhomNghiepVu = await apiGet('list', { sheet: 'NhomNghiepVu' });
  DB.TinhThanh = await apiGet('list', { sheet: 'TinhThanh' });
  DB.PhuongXa = await apiGet('list', { sheet: 'PhuongXa' });
  DB.QG = await apiGet('list', { sheet: 'QG' });
  DB.TKNHTONN = await apiGet('list', { sheet: 'TKNHTONN' });
  DB.BCMoTKnTONN = await apiGet('list', { sheet: 'BCMoTKnTONN' });
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
  DB.QG.forEach(r => { r['MÃ QUỐC GIA'] = String(r['MÃ QUỐC GIA']); });
  DB.TKNHTONN.forEach(r => {
    r['MÃ TKNT'] = String(r['MÃ TKNT']);
    r['MÃ ĐƠN VỊ'] = String(r['MÃ ĐƠN VỊ']);
    r['NGÀY GP'] = fmtDateVN(r['NGÀY GP']);
    r['THỜI HẠN'] = fmtDateVN(r['THỜI HẠN']);
    r['NGÀY ĐÓNG'] = fmtDateVN(r['NGÀY ĐÓNG']);
  });
  DB.BCMoTKnTONN.forEach(r => {
    r['MÃ TKNT'] = String(r['MÃ TKNT']);
    r['KỲ BÁO CÁO'] = String(r['KỲ BÁO CÁO']);
    r._id = r._id || (r['MÃ TKNT'] + '||' + r['KỲ BÁO CÁO']);
  });
  DB.HoSo.forEach(r => {
    r.MaHoSo = String(r.MaHoSo);
    r.MaKH = String(r.MaKH);
    r.MaTTHC = String(r.MaTTHC);
    r.MaCV = String(r.MaCV);
    if (r.NguyenTeVay) r.NguyenTeVay = String(r.NguyenTeVay);
    if (r.NguyenTeChoVay) r.NguyenTeChoVay = String(r.NguyenTeChoVay);
    if (r.NguyenTeDauTu) r.NguyenTeDauTu = String(r.NguyenTeDauTu);
    ['NgayTiepNhan','NgayHenTra','NgayVanBan','NgayYeuCauBoSung'].forEach(k => { r[k] = fmtDateVN(r[k]); });
  });
  DB.Khoanvay.forEach(r => {
    r['MÃ SỐ KV'] = String(r['MÃ SỐ KV'] || '');
    r['MÃ KH'] = String(r['MÃ KH'] || '');
    r['NGÀY VBXN'] = fmtDateVN(r['NGÀY VBXN']);
  });
  DB.ChoVay.forEach(r => {
    r['MÃ SỐ KHOẢN CHO VAY'] = String(r['MÃ SỐ KHOẢN CHO VAY'] || '');
    r['MÃ KH'] = String(r['MÃ KH'] || '');
    r['NGÀY VBXN'] = fmtDateVN(r['NGÀY VBXN']);
  });
  DB.DTRNNN.forEach(r => {
    r['RECORD ID'] = String(r['RECORD ID'] || '');
    r['MÃ DỰ ÁN'] = String(r['MÃ DỰ ÁN'] || '');
    r['MÃ NH PHỤC VỤ'] = String(r['MÃ NH PHỤC VỤ'] || '');
  });
  DB.DTRNNN_NDT.forEach(r => {
    r['INVESTOR ID'] = String(r['INVESTOR ID'] || '');
    r['RECORD ID'] = String(r['RECORD ID'] || '');
    r['MÃ KH'] = String(r['MÃ KH'] || '');
  });
  DB.Campuchia.forEach(r => { r.BCID=String(r.BCID||''); r['KỲ BC']=String(r['KỲ BC']||''); r['MÃ KH']=String(r['MÃ KH']||''); });
  DB.VPHC.forEach(r => {
    r['MÃ HỒ SƠ VI PHẠM']=String(r['MÃ HỒ SƠ VI PHẠM']||'');
    r['MÃ KH']=String(r['MÃ KH']||''); r['MÃ HỒ SƠ']=String(r['MÃ HỒ SƠ']||'');
    r['MÃ CHUYÊN VIÊN']=String(r['MÃ CHUYÊN VIÊN']||'');
    ['NGÀY NHẬN HS','NGÀY VB CHUYỂN TTRA','NGÀY QUYẾT ĐỊNH','NGÀY ĐÃ NỘP PHẠT'].forEach(k=>r[k]=fmtDateVN(r[k]));
  });
  DB.TyGia.forEach(r => { r.NgayCapNhat = fmtDateVN(r.NgayCapNhat); });
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
  loaihinhkhachhang: { title: 'Loại hình khách hàng', render: renderLoaiHinhKhachHang },
  tthc: { title: 'Danh mục thủ tục hành chính', render: renderTTHC },
  chuyenvien: { title: 'Chuyên viên', render: renderChuyenVien },
  tygia: { title: 'Tỷ giá', render: renderTyGia },
  nhomnghiepvu: { title: 'Nhóm nghiệp vụ', render: renderNhomNghiepVu },
  tinhthanh: { title: 'Tỉnh/Thành phố', render: renderTinhThanh },
  phuongxa: { title: 'Phường/Xã', render: renderPhuongXa },
  quocgia: { title: 'Quốc gia', render: renderQuocGia },
  tknton: { title: 'Tài khoản ngoại tệ ở nước ngoài', render: renderTKNT },
  khoanvay: { title: 'Lịch sử khoản vay nước ngoài', render: renderKhoanVay },
  chovay: { title: 'Cho vay ra nước ngoài', render: renderChoVay },
  dtrnnn: { title: 'Đầu tư ra nước ngoài', render: renderDTRNNN },
  campuchia: { title: 'Thanh toán với Campuchia', render: renderCampuchia },
  vphc: { title: 'Xử lý vi phạm hành chính', render: renderVPHC }
};

// route <-> ten sheet trong Google Sheet (dung de sap xep lai sidebar theo dung thu tu tab)
const NAV_ITEMS = [
  { route: 'hoso', sheet: 'HoSo', label: 'Hồ sơ TTHC' },
  { route: 'khachhang', sheet: 'KhachHang', label: 'Khách hàng' },
  { route: 'loaihinhkhachhang', sheet: 'LoaiHinhKhachHang', label: 'Loại hình khách hàng' },
  { route: 'tthc', sheet: 'TTHC', label: 'Danh mục TTHC' },
  { route: 'chuyenvien', sheet: 'ChuyenVien', label: 'Chuyên viên' },
  { route: 'tygia', sheet: 'TyGia', label: 'Tỷ giá' },
  { route: 'nhomnghiepvu', sheet: 'NhomNghiepVu', label: 'Nhóm nghiệp vụ' },
  { route: 'tinhthanh', sheet: 'TinhThanh', label: 'Tỉnh/Thành phố' },
  { route: 'phuongxa', sheet: 'PhuongXa', label: 'Phường/Xã' },
  { route: 'quocgia', sheet: 'QG', label: 'Quốc gia' },
  { route: 'tknton', sheet: 'TKNHTONN', label: 'TK ngoại tệ ở NN' },
  { route: 'khoanvay', sheet: 'Khoanvay', label: 'Khoản vay nước ngoài' },
  { route: 'chovay', sheet: 'ChoVay', label: 'Cho vay ra nước ngoài' },
  { route: 'dtrnnn', sheet: 'DTRNNN', label: 'Đầu tư ra nước ngoài' },
  { route: 'campuchia', sheet: 'Campuchia', label: 'Thanh toán Campuchia' },
  { route: 'vphc', sheet: 'VPHC', label: 'Xử lý VPHC' }
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
    else display = (record[key] === undefined || record[key] === null || record[key] === '') ? '—' : esc(/ngay|ngày|thời hạn/i.test(key) ? fmtDateVN(record[key]) : record[key]);
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
        <td class="mono">${esc(fmtDateVN(r.NgayTiepNhan))}</td>
        <td class="mono">${esc(fmtDateVN(r.NgayHenTra))}</td>
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

        <fieldset class="subsection" id="fsChoVay"><legend>Cho vay ra nước ngoài</legend>
          <div class="form-grid">
            <div class="field mono"><label>Mã số khoản cho vay</label><input type="text" name="MaKhoanChoVay" value="${esc(rec.MaKhoanChoVay || '')}" /></div>
            <div class="field"><label>Nguyên tệ</label><select name="NguyenTeChoVay" id="fNguyenTeChoVay"><option value="">—</option>${nteOptions}</select></div>
            <div class="field"><label>Số tiền cho vay (nguyên tệ)</label><input type="text" name="SoTienChoVayNguyenTe" id="fSoTienChoVay" value="${rec.SoTienChoVayNguyenTe ? fmtNum(rec.SoTienChoVayNguyenTe) : ''}" /></div>
            <div class="field"><label>Quy đổi USD (tỷ giá hiện tại)</label><input type="text" id="fSoTienChoVayUSD" readonly /></div>
          </div>
        </fieldset>

        <fieldset class="subsection" id="fsDauTu"><legend>Đầu tư ra nước ngoài</legend>
          <div class="form-grid">
            <div class="field mono"><label>Mã số dự án</label><input type="text" name="MaDuAn" value="${esc(rec.MaDuAn || '')}" /></div>
            <div class="field"><label>Vốn chuyển ra quy USD</label><input type="text" name="SoTienDangKyNguyenTe" id="fSoTienDT" value="${rec.SoTienDangKyNguyenTe ? fmtNum(rec.SoTienDangKyNguyenTe) : ''}" /><span class="hint">Nhập trực tiếp số USD, không quy đổi từ nguyên tệ.</span></div>
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
    if (rec.NguyenTeChoVay) el.querySelector('#fNguyenTeChoVay').value = rec.NguyenTeChoVay;

    const updateVisibility = () => {
      const trangThai = el.querySelector('#fTrangThai').value;
      const tthc = tthcRow(el.querySelector('#fMaTTHC').value);
      const isDone = trangThai === 'Đã xử lý';
      const dacBiet = tthc ? isSpecialGroup(tthc.NhomNghiepVu) : false;
      el.querySelector('#fsKetQua').style.display = isDone ? '' : 'none';
      el.querySelector('#fsBoSung').style.display = (trangThai === 'Bổ sung hồ sơ') ? '' : 'none';
      el.querySelector('#fsVay').style.display = (isDone && dacBiet) ? '' : 'none';
      el.querySelector('#fsChoVay').style.display = (isDone && dacBiet) ? '' : 'none';
      el.querySelector('#fsDauTu').style.display = (isDone && dacBiet) ? '' : 'none';
    };
    const updateUSD = () => {
      const amt = parseNum(el.querySelector('#fSoTienVay').value);
      const code = el.querySelector('#fNguyenTeVay').value;
      const usd = toUSD(amt, code);
      el.querySelector('#fSoTienVayUSD').value = usd === null ? '' : '≈ $' + fmtNum(usd);
      const amtChoVay = parseNum(el.querySelector('#fSoTienChoVay').value);
      const codeChoVay = el.querySelector('#fNguyenTeChoVay').value;
      const usdChoVay = toUSD(amtChoVay, codeChoVay);
      el.querySelector('#fSoTienChoVayUSD').value = usdChoVay === null ? '' : '≈ $' + fmtNum(usdChoVay);
    };
    el.querySelector('#fMaKH').onchange = (e) => { el.querySelector('#khHint').textContent = khName(e.target.value); };
    if (rec.MaKH) el.querySelector('#khHint').textContent = khName(rec.MaKH);
    el.querySelector('#fMaTTHC').onchange = updateVisibility;
    el.querySelector('#fTrangThai').onchange = updateVisibility;
    el.querySelector('#fSoTienVay').oninput = updateUSD;
    el.querySelector('#fNguyenTeVay').onchange = updateUSD;
    el.querySelector('#fSoTienChoVay').oninput = updateUSD;
    el.querySelector('#fNguyenTeChoVay').onchange = updateUSD;
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
          MaKhoanChoVay: fd.get('MaKhoanChoVay') || '',
          SoTienChoVayNguyenTe: parseNum(fd.get('SoTienChoVayNguyenTe')),
          NguyenTeChoVay: fd.get('NguyenTeChoVay') || '',
          MaDuAn: fd.get('MaDuAn') || '',
          SoTienDangKyNguyenTe: parseNum(fd.get('SoTienDangKyNguyenTe')),
          NguyenTeDauTu: fd.get('MaDuAn') ? 'USD' : '',
          GhiChu: fd.get('GhiChu') || ''
        };
        if (isEdit) await apiPost('update', 'HoSo', data, data.MaHoSo);
        else await apiPost('create', 'HoSo', data);
        await reloadSheet('HoSo');
        await syncInvestmentFromCase(data);
        toast('Đã lưu hồ sơ ' + data.MaHoSo);
        closeModal();
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
  const loaiToChucOptions = DB.LoaiHinhKhachHang.slice().sort((a,b)=>String(a.MaLoai).localeCompare(String(b.MaLoai),'vi')).map(x=>`<option value="${esc(x.MaLoai)}" ${rec.LoaiToChuc===x.MaLoai?'selected':''}>${esc(x.MaLoai)} — ${esc(x.TenLoai)}</option>`).join('');
  const bodyHtml = `
    <form id="khForm">
      <div class="form-grid">
        <div class="field mono"><label>Mã khách hàng (MST)</label><input type="text" name="MaKH" value="${esc(rec.MaKH || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field mono"><label>Mã định danh</label><input type="text" name="MaDinhDanh" value="${esc(rec.MaDinhDanh || '')}" /></div>

        <div class="field"><label>Loại khách hàng</label>
          <select name="Loai" id="fLoai"><option value="CaNhan" ${rec.Loai === 'CaNhan' ? 'selected' : ''}>Cá nhân</option><option value="ToChuc" ${rec.Loai === 'ToChuc' ? 'selected' : ''}>Tổ chức</option></select></div>
        <div class="field" id="fLoaiToChucWrap"><label>Loại hình tổ chức</label>
          <select name="LoaiToChuc">
            <option value="">— Chọn loại hình —</option>${loaiToChucOptions}
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
    <div class="toolbar"><input type="text" class="search-input" id="tthcSearch" placeholder="Tìm mã, tên thủ tục hoặc nhóm nghiệp vụ…" /></div>
    <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Mã TTHC</th><th>Tên thủ tục</th><th>Loại</th><th>Nhóm nghiệp vụ</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody id="tthcBody"></tbody></table></div></div>`;
  const draw = () => {
    const q = (document.getElementById('tthcSearch').value || '').trim().toLowerCase();
    const rows = DB.TTHC.filter(r => !q || [r.MaTTHC, r.TenTTHC, r.NhomNghiepVu, r.LoaiTTHC, r.TrangThai].some(v => String(v || '').toLowerCase().includes(q)));
    const body = document.getElementById('tthcBody');
    if (!rows.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Không tìm thấy thủ tục phù hợp</h3></div></td></tr>`; return; }
    body.innerHTML = rows.map(r => `
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
    wireRowDetail(body, rows, 'MaTTHC', TTHC_DETAIL_FIELDS, 'TTHC');
  };
  document.getElementById('tthcSearch').oninput = draw;
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
const CHUYENVIEN_STATUS_OPTIONS = [
  ['on', 'Đang làm việc'],
  ['off', 'Ngừng'],
  ['chuyen_cong_tac', 'Chuyển công tác'],
  ['nghi_huu', 'Nghỉ hưu'],
  ['nghi_viec', 'Nghỉ việc'],
  ['chuyen_phong', 'Chuyển phòng'],
  ['bld', 'BLĐ']
];
function chuyenVienStatusLabel(value) {
  const item = CHUYENVIEN_STATUS_OPTIONS.find(([code]) => code === value);
  return item ? item[1] : (value || '—');
}
function chuyenVienStatusBadge(value) {
  const classes = { on: 'badge-sage', bld: 'badge-seal', chuyen_cong_tac: 'badge-amber', chuyen_phong: 'badge-amber', nghi_huu: 'badge-neutral', nghi_viec: 'badge-danger', off: 'badge-neutral' };
  return `<span class="badge ${classes[value] || 'badge-neutral'}">${esc(chuyenVienStatusLabel(value))}</span>`;
}
function renderChuyenVien() {
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="btnNewCV">+ Chuyên viên mới</button>`;
  document.getElementById('btnNewCV').onclick = () => openCVForm();
  const view = document.getElementById('view');
  view.innerHTML = `
    ${statsBarHtml(DB.ChuyenVien, 'TrangThai', chuyenVienStatusLabel)}
    <div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Mã CV</th><th>Họ tên</th><th>SĐT</th><th>Email</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody id="cvBody"></tbody></table></div></div>`;
  const draw = () => {
    const body = document.getElementById('cvBody');
    if (!DB.ChuyenVien.length) { body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Chưa có chuyên viên nào</h3></div></td></tr>`; return; }
    body.innerHTML = DB.ChuyenVien.map(r => `
      <tr data-view="${esc(r.MaCV)}">
        <td class="mono">${esc(r.MaCV)}</td><td>${esc(r.HoTen)}</td><td class="mono">${esc(r.SoDienThoai)}</td><td>${esc(r.Email)}</td>
        <td>${chuyenVienStatusBadge(r.TrangThai)}</td>
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
  ['TrangThai', 'Trạng thái', (v) => chuyenVienStatusBadge(v)],
  ['GhiChu', 'Ghi chú']
];
function openCVForm(rec) {
  const isEdit = !!rec;
  rec = rec || { TrangThai: 'on' };
  const bodyHtml = `
    <form id="cvForm">
      <div class="form-grid">
        <div class="field mono"><label>Mã chuyên viên</label><input type="text" name="MaCV" value="${esc(rec.MaCV || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field"><label>Trạng thái</label><select name="TrangThai">${CHUYENVIEN_STATUS_OPTIONS.map(([code, label]) => `<option value="${code}" ${rec.TrangThai === code ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
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
      <tr><td class="mono">${esc(r.MaNgoaiTe)}</td><td class="mono num">${usdPerUnit === '' ? '' : '$' + fmtUSD(usdPerUnit)}</td><td class="mono num">${fmtNum(r.TyGiaSoVND)}</td><td class="muted mono">${esc(fmtDateVN(r.NgayCapNhat))}</td></tr>
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
    <div class="stats-bar"><div class="stat-chip stat-total">Tổng số: <b>${DB.NhomNghiepVu.length}</b></div><div class="stat-chip">Thường: <b>${DB.NhomNghiepVu.filter(x=>!isSpecialGroup(x.TenNhom)).length}</b></div><div class="stat-chip">Đặc biệt: <b>${DB.NhomNghiepVu.filter(x=>isSpecialGroup(x.TenNhom)).length}</b></div></div>
    <div class="card" style="margin-bottom:16px"><div style="padding:14px 18px" class="muted">
      Chỉ phân loại nhóm là <b>Thường</b> hoặc <b>Đặc biệt</b>. Nhóm đặc biệt có thể sử dụng các trường mã nghiệp vụ, số tiền và nguyên tệ khi xử lý hồ sơ; tên nhóm được đặt tự do.
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
        <td class="muted">${isSpecialGroup(r.TenNhom) ? 'Đặc biệt' : 'Thường'}</td>
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
  ['LoaiDacBiet', 'Loại', (v) => v && v !== 'Thuong' ? 'Đặc biệt' : 'Thường'],
  ['MoTa', 'Mô tả'],
  ['GhiChu', 'Ghi chú']
];
function openNNVForm(rec) {
  const isEdit = !!rec;
  rec = rec || { LoaiDacBiet: 'Thuong' };
  const normalizedType = rec.LoaiDacBiet && rec.LoaiDacBiet !== 'Thuong' ? 'DacBiet' : 'Thuong';
  const bodyHtml = `
    <form id="nnvForm">
      <div class="form-grid cols-1">
        <div class="field"><label>Tên nhóm nghiệp vụ</label><input type="text" name="TenNhom" value="${esc(rec.TenNhom || '')}" ${isEdit ? 'readonly' : ''} required /></div>
        <div class="field"><label>Loại nghiệp vụ</label><select name="LoaiDacBiet">
          ${LOAI_DAC_BIET_OPTIONS.map(o => `<option value="${o.value}" ${normalizedType === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select><span class="hint">Nghiệp vụ đặc biệt được nhập thêm mã nghiệp vụ, số tiền và nguyên tệ khi xử lý hồ sơ.</span></div>
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
    <thead><tr><th>Tỉnh/Thành phố</th><th>Sáp nhập từ</th><th>Trung tâm hành chính</th><th>BC TKNTONN</th><th>Thao tác</th></tr></thead>
    <tbody id="ttBody"></tbody></table></div></div>`;
  const draw = () => {
    const q = (document.getElementById('ttSearch').value || '').toLowerCase();
    const rows = DB.TinhThanh.filter(r => !q || r.TenTinh.toLowerCase().includes(q));
    const body = document.getElementById('ttBody');
    if (!rows.length) { body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>Chưa có tỉnh/thành nào</h3></div></td></tr>`; return; }
    body.innerHTML = rows.map(r => `
      <tr data-view="${esc(r.TenTinh)}">
        <td>${esc(r.TenTinh)}</td>
        <td class="muted">${esc(r.TinhSapNhap)}</td>
        <td class="muted">${esc(r.TTHC)}</td>
        <td><button class="btn btn-primary btn-sm" data-report="${esc(r.TenTinh)}">Xem báo cáo</button></td>
        <td class="cell-actions">
          <button class="btn btn-outline btn-sm" data-edit="${esc(r.TenTinh)}">Sửa</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(r.TenTinh)}">Xóa</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openTinhThanhForm(DB.TinhThanh.find(x => x.TenTinh === b.dataset.edit)));
    body.querySelectorAll('[data-report]').forEach(b => b.onclick = () => openTinhThanhTKNTReport(b.dataset.report));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord('TinhThanh', b.dataset.del, 'TenTinh', renderTinhThanh));
    wireRowDetail(body, rows, 'TenTinh', TINHTHANH_DETAIL_FIELDS, 'Tỉnh/Thành phố');
  };
  document.getElementById('ttSearch').oninput = draw;
  draw();
}

function provinceKey(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/\b(thanh pho|tp|tinh)\b/g, '').replace(/[^a-z0-9]/g, '');
}

function provinceTKNTData(tinh) {
  const key = provinceKey(tinh);
  return DB.KhachHang.filter(k => provinceKey(k.DiaChiTinhTP) === key).map(k => {
    const accounts = DB.TKNHTONN.filter(t => String(t['MÃ ĐƠN VỊ']) === String(k.MaKH) && String(t['TRẠNG THÁI']).trim().toUpperCase() === 'ĐANG HOẠT ĐỘNG');
    const countries = [...new Set(accounts.map(t => qgName(t['QUỐC GIA'])).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'vi'));
    return { customer:k, accounts, countries };
  }).filter(x => x.accounts.length).sort((a,b) => String(a.customer.TenKhachHang).localeCompare(String(b.customer.TenKhachHang), 'vi'));
}

function provinceTKNTCountryData(tinh) {
  const companies = provinceTKNTData(tinh), map = new Map();
  companies.forEach(x => x.accounts.forEach(account => {
    const country = qgName(account['QUỐC GIA']) || 'Chưa xác định';
    if (!map.has(country)) map.set(country, new Map());
    const companyMap = map.get(country), id = String(x.customer.MaKH);
    if (!companyMap.has(id)) companyMap.set(id, { customer:x.customer, accounts:[] });
    companyMap.get(id).accounts.push(account);
  }));
  return [...map.entries()].map(([country, companyMap]) => ({
    country,
    companies:[...companyMap.values()].sort((a,b) => String(a.customer.TenKhachHang).localeCompare(String(b.customer.TenKhachHang), 'vi'))
  })).sort((a,b) => a.country.localeCompare(b.country, 'vi'));
}

function openTinhThanhTKNTReport(tinh) {
  const groups = provinceTKNTCountryData(tinh), companyCount = new Set(groups.flatMap(g => g.companies.map(x => String(x.customer.MaKH)))).size, accountCount = groups.reduce((n,g) => n + g.companies.reduce((m,x) => m + x.accounts.length, 0), 0);
  const table = groups.length ? groups.map((g,gi) => `<tr class="report-country-row"><td class="num">${gi+1}</td><td colspan="2"><b>${esc(g.country)}</b><span>${g.companies.length} doanh nghiệp</span></td><td class="num mono">${g.companies.reduce((n,x)=>n+x.accounts.length,0)}</td></tr>${g.companies.map((x,i)=>`<tr><td class="num muted">${gi+1}.${i+1}</td><td><b>${esc(x.customer.TenKhachHang)}</b><br><span class="mono muted">${esc(x.customer.MaKH)}</span></td><td>${x.accounts.map(a=>`<span class="mono report-account">${esc(a['MÃ TKNT'])}</span>`).join('')}</td><td class="num mono">${x.accounts.length}</td></tr>`).join('')}`).join('') : '<tr><td colspan="4" class="muted">Không có doanh nghiệp đang hoạt động tài khoản ngoại tệ ở nước ngoài.</td></tr>';
  openModal('Báo cáo tài khoản ngoại tệ - ' + tinh, `<div class="report-summary"><div><span>Quốc gia</span><b>${groups.length}</b></div><div><span>Doanh nghiệp</span><b>${companyCount}</b></div><div><span>Tài khoản hoạt động</span><b>${accountCount}</b></div></div><div class="table-wrap province-report"><table><thead><tr><th>TT</th><th>Quốc gia / Doanh nghiệp</th><th>Mã tài khoản</th><th>Số TK</th></tr></thead><tbody>${table}</tbody></table></div><div class="modal-foot"><button class="btn btn-outline" id="reportClose">Đóng</button><button class="btn btn-primary" id="reportPrint">In / Lưu PDF</button></div>`, el => { el.querySelector('#reportClose').onclick = closeModal; el.querySelector('#reportPrint').onclick = () => openTinhThanhTKNTPrintOptions(tinh, groups); });
}

function openTinhThanhTKNTPrintOptions(tinh, groups) {
  const cvOptions=DB.ChuyenVien.slice().sort((a,b)=>(a.HoTen||'').localeCompare(b.HoTen||'','vi')).map(x=>`<option value="${esc(x.MaCV+' — '+x.HoTen)}"></option>`).join('');
  openModal('Thông tin xuất báo cáo - '+tinh,`<form id="provincePrintForm"><div class="form-grid"><div class="field"><label>Chuyên viên lập biểu *</label><input name="maker" list="provinceMakerList" placeholder="Gõ mã hoặc tên" required><datalist id="provinceMakerList">${cvOptions}</datalist></div><div class="field"><label>Lãnh đạo ký *</label><input name="leader" list="provinceLeaderList" placeholder="Gõ mã hoặc tên" required><datalist id="provinceLeaderList">${cvOptions}</datalist></div><div class="field"><label>Chức danh lãnh đạo</label><input name="leaderTitle" value="TRƯỞNG PHÒNG"></div></div><div class="modal-foot"><button type="button" class="btn btn-outline" id="provincePrintCancel">Hủy</button><button class="btn btn-primary">In / Lưu PDF</button></div></form>`,el=>{el.querySelector('#provincePrintCancel').onclick=closeModal;el.querySelector('form').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),makerCode=fd.get('maker').split(' — ')[0].trim(),leaderCode=fd.get('leader').split(' — ')[0].trim(),maker=cvName(makerCode),leader=cvName(leaderCode);if(!maker||!leader){toast('Vui lòng chọn đúng chuyên viên và lãnh đạo từ danh sách.',true);return}printTinhThanhTKNTReport(tinh,groups,{maker,leader,leaderTitle:fd.get('leaderTitle').trim()||'TRƯỞNG PHÒNG'})}});
}

function printTinhThanhTKNTReport(tinh, groups, options) {
  const companyCount = new Set(groups.flatMap(g => g.companies.map(x => String(x.customer.MaKH)))).size, accountCount = groups.reduce((n,g) => n + g.companies.reduce((m,x) => m + x.accounts.length, 0), 0);
  const now=new Date(), day=String(now.getDate()).padStart(2,'0'), month=String(now.getMonth()+1).padStart(2,'0'), year=now.getFullYear();
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title></title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font:11px "Times New Roman",serif;color:#111}.page{width:210mm;min-height:297mm;padding:13mm 14mm 14mm}.heads{display:grid;grid-template-columns:48% 52%;text-align:center;line-height:1.35}.heads b{font-size:12px}.room,.motto{display:inline-block}.room:after,.motto:after{content:"";display:block;width:80%;border-top:1px solid #111;margin:2px auto 0}.date{text-align:right;font-style:italic;margin-top:9px}.title{text-align:center;font-size:15px;font-weight:bold;margin:14px 0 3px}.sub{text-align:center;font-weight:bold;margin-bottom:12px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #777;padding:4px;vertical-align:top}th{text-align:center}.num{text-align:center}.mono{font-family:monospace;font-size:10px}.group{font-weight:bold;background:#eee}.group span{float:right;font-weight:normal}.total{font-weight:bold}.signatures{display:grid;grid-template-columns:1fr 1fr;text-align:center;font-weight:bold;margin-top:18px}.sign-name{margin-top:55px}</style></head><body><div class="page"><div class="heads"><div>NGÂN HÀNG NHÀ NƯỚC<br>VIỆT NAM<br><b>CHI NHÁNH KHU VỰC 2</b><br><b class="room">PHÒNG QUẢN LÝ NGOẠI HỐI VÀNG</b></div><div><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b class="motto">Độc lập - Tự do - Hạnh phúc</b></div></div><div class="date">Thành phố Hồ Chí Minh, ngày ${day} tháng ${month} năm ${year}</div><div class="title">BÁO CÁO DANH SÁCH QUỐC GIA VÀ DOANH NGHIỆP<br>CÓ TÀI KHOẢN NGOẠI TỆ Ở NƯỚC NGOÀI</div><div class="sub">ĐANG HOẠT ĐỘNG - ${esc(String(tinh).toUpperCase())}</div><table><thead><tr><th style="width:7%">TT</th><th>QUỐC GIA / DOANH NGHIỆP</th><th style="width:25%">MÃ TÀI KHOẢN</th><th style="width:9%">SỐ TK</th></tr></thead><tbody>${groups.map((g,gi)=>`<tr class="group"><td class="num">${gi+1}</td><td colspan="2">${esc(g.country)} <span>${g.companies.length} doanh nghiệp</span></td><td class="num">${g.companies.reduce((n,x)=>n+x.accounts.length,0)}</td></tr>${g.companies.map((x,i)=>`<tr><td class="num">${gi+1}.${i+1}</td><td>${esc(x.customer.TenKhachHang)}<br><span class="mono">${esc(x.customer.MaKH)}</span></td><td class="mono">${x.accounts.map(a=>esc(a['MÃ TKNT'])).join('<br>')}</td><td class="num">${x.accounts.length}</td></tr>`).join('')}`).join('')}<tr class="total"><td colspan="3">TỔNG CỘNG: ${groups.length} QUỐC GIA · ${companyCount} DOANH NGHIỆP</td><td class="num">${accountCount}</td></tr></tbody></table><div class="signatures"><div>LẬP BIỂU<div class="sign-name">${esc(options.maker)}</div></div><div>${esc(options.leaderTitle)}<div class="sign-name">${esc(options.leader)}</div></div></div></div><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
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
// ============================================================
// MODULE: QUỐC GIA
// ============================================================
function renderQuocGia() {
  document.getElementById('topbarActions').innerHTML = '<button class="btn btn-primary" id="btnNewQG">+ Quốc gia mới</button>';
  document.getElementById('btnNewQG').onclick = () => openQuocGiaForm();
  document.getElementById('view').innerHTML = `<div class="stats-bar"><div class="stat-chip stat-total">Tổng số: <b>${DB.QG.length}</b></div></div><div class="toolbar"><input class="search-input" id="qgSearch" placeholder="Tìm mã, tên hoặc ký hiệu quốc gia…"></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Mã quốc gia</th><th>Tên quốc gia</th><th>Ký hiệu</th><th></th></tr></thead><tbody id="qgBody"></tbody></table></div></div>`;
  const draw = () => {
    const q = (document.getElementById('qgSearch').value || '').toLowerCase();
    const rows = DB.QG.filter(r => !q || [r['MÃ QUỐC GIA'], r['TÊN QUỐC GIA'], r['KÝ HIỆU']].some(v => String(v || '').toLowerCase().includes(q))).sort((a,b) => String(a['TÊN QUỐC GIA']).localeCompare(String(b['TÊN QUỐC GIA']), 'vi'));
    const body = document.getElementById('qgBody');
    body.innerHTML = rows.length ? rows.map(r => `<tr><td class="mono">${esc(r['MÃ QUỐC GIA'])}</td><td><b>${esc(r['TÊN QUỐC GIA'])}</b></td><td class="mono">${esc(r['KÝ HIỆU'])}</td><td class="cell-actions"><button class="btn btn-outline btn-sm" data-edit="${esc(r['MÃ QUỐC GIA'])}">Sửa</button><button class="btn btn-danger btn-sm" data-del="${esc(r['MÃ QUỐC GIA'])}">Xóa</button></td></tr>`).join('') : '<tr><td colspan="4"><div class="empty-state"><h3>Chưa có quốc gia phù hợp</h3></div></td></tr>';
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openQuocGiaForm(DB.QG.find(x => x['MÃ QUỐC GIA'] === b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteQuocGia(b.dataset.del));
  };
  document.getElementById('qgSearch').oninput = draw;
  draw();
}

function openQuocGiaForm(rec) {
  const isEdit = !!rec; rec = rec || {};
  openModal(isEdit ? 'Sửa quốc gia' : 'Thêm quốc gia', `<form id="qgForm"><div class="form-grid"><div class="field"><label>Mã quốc gia *</label><input name="MÃ QUỐC GIA" value="${esc(rec['MÃ QUỐC GIA'] || '')}" ${isEdit ? 'readonly' : ''} required></div><div class="field"><label>Ký hiệu</label><input name="KÝ HIỆU" maxlength="3" value="${esc(rec['KÝ HIỆU'] || '')}"></div><div class="field span-2"><label>Tên quốc gia *</label><input name="TÊN QUỐC GIA" value="${esc(rec['TÊN QUỐC GIA'] || '')}" required></div></div><div class="modal-foot"><button type="button" class="btn btn-outline" id="qgCancel">Hủy</button><button class="btn btn-primary">Lưu</button></div></form>`, el => {
    el.querySelector('#qgCancel').onclick = closeModal;
    el.querySelector('form').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target).entries()); d['MÃ QUỐC GIA'] = d['MÃ QUỐC GIA'].trim(); d['TÊN QUỐC GIA'] = d['TÊN QUỐC GIA'].trim(); d['KÝ HIỆU'] = d['KÝ HIỆU'].trim().toUpperCase(); try { await apiPost(isEdit ? 'update' : 'create', 'QG', d, isEdit ? rec['MÃ QUỐC GIA'] : undefined); await reloadSheet('QG'); toast('Đã lưu ' + d['TÊN QUỐC GIA']); closeModal(); renderQuocGia(); } catch(err) { toast(err.message, true); } };
  });
}

async function deleteQuocGia(id) {
  if (DB.TKNHTONN.some(r => String(r['QUỐC GIA']) === String(id))) return toast('Không thể xóa quốc gia đang được tài khoản ngoại tệ sử dụng.', true);
  if (!confirm('Xóa quốc gia này?')) return;
  try { await apiPost('delete', 'QG', {}, id); await reloadSheet('QG'); toast('Đã xóa quốc gia'); renderQuocGia(); } catch(err) { toast(err.message, true); }
}

function wireVNDateInputs() {
  document.querySelectorAll('#modalRoot input[type="date"]').forEach(input => {
    const value = input.value;
    input.type = 'text';
    input.value = fmtDateVN(value);
    input.placeholder = 'dd/mm/yyyy';
    input.pattern = '(0[1-9]|[12][0-9]|3[01])\\/(0[1-9]|1[0-2])\\/[0-9]{4}';
    input.title = 'Nhập ngày theo định dạng dd/mm/yyyy';
    input.inputMode = 'numeric';
  });
}
new MutationObserver(wireVNDateInputs).observe(document.getElementById('modalRoot'), {childList:true, subtree:true});

function wireFlexibleNumberInputs() {
  document.querySelectorAll('#modalRoot input[type="number"]').forEach(input => {
    if (input.dataset.flexNumber === '1') return;
    input.dataset.flexNumber = '1';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.title = 'Có thể nhập phần thập phân bằng dấu phẩy hoặc dấu chấm';
  });
}
new MutationObserver(wireFlexibleNumberInputs).observe(document.getElementById('modalRoot'), {childList:true, subtree:true});

document.addEventListener('submit', event => {
  event.target.querySelectorAll?.('input[data-flex-number="1"]').forEach(input => {
    const value = input.dataset.grouped === '1' ? input.dataset.rawValue : input.value;
    const parsed = parseNum(value);
    input.value = parsed === '' ? '' : String(parsed);
  });
}, true);

if (window.QLNHVAuth && typeof window.QLNHVAuth.start === 'function') {
  window.QLNHVAuth.start(boot);
} else {
  boot();
}
