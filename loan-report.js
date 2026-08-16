// ============================================================
// QLNHV — Báo cáo danh sách khoản vay nước ngoài (theo địa bàn/trạng thái)
// ============================================================

let loanReportProvinceLoadPromise = null;
async function ensureLoanReportProvinces() {
  if (LOADED_SHEETS.has('TinhThanh')) return;
  if (loanReportProvinceLoadPromise) return loanReportProvinceLoadPromise;
  loanReportProvinceLoadPromise = apiGet('list', { sheet: 'TinhThanh' }).then(rows => {
    DB.TinhThanh = Array.isArray(rows) ? rows : [];
    LOADED_SHEETS.add('TinhThanh');
  }).finally(() => { loanReportProvinceLoadPromise = null; });
  return loanReportProvinceLoadPromise;
}

function loanReportCityOptions() {
  return DB.TinhThanh.slice()
    .sort((a,b) => String(a.TenTinh).localeCompare(String(b.TenTinh), 'vi'))
    .map(t => `<option value="${esc(t.TenTinh)}">${esc(t.TenTinh)}</option>`).join('');
}

let loanReportRatesLoadPromise = null;
// Trang Khoan vay nuoc ngoai (ROUTE_SHEETS.khoanvay) khong tai san TyGia vi
// da so man hinh khong can - phai tai rieng truoc khi tinh Quy USD, neu
// khong DB.TyGia rong se lam MOI dong tien deu khong quy doi duoc (khong
// chi rieng USD).
async function ensureLoanReportRates() {
  if (LOADED_SHEETS.has('TyGia')) return;
  if (loanReportRatesLoadPromise) return loanReportRatesLoadPromise;
  loanReportRatesLoadPromise = apiGet('list', { sheet: 'TyGia' }).then(rows => {
    DB.TyGia = Array.isArray(rows) ? rows : [];
    LOADED_SHEETS.add('TyGia');
  }).finally(() => { loanReportRatesLoadPromise = null; });
  return loanReportRatesLoadPromise;
}

function loanReportStatusLabel(row) {
  return loanIsPaid(row) ? 'Đã hết nợ' : 'Chưa hết nợ';
}

// Cot Quy USD la ket qua chia ty gia nen co the co rat nhieu chu so thap
// phan (vd 125.607,7747591) neu dung fmtNum() thong thuong - de nham. Luon
// co dung 2 chu so thap phan (dinh dang #.##0,00) cho de doc.
function loanReportFmtUSD(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '';
  return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function loanReportUSD(row) {
  const amount = parseNum(row['KIM NGẠCH VAY']);
  if (amount === '' || amount === null || amount === undefined) return null;
  // Sheet TyGia thuong khong co dong 'USD' (vi day la dong tien goc, khong
  // can quy doi) nen toUSD() se tra ve null cho khoan vay USD neu goi thang.
  // Cung cach xu ly nhu tknt.js (tkntToUSD)/tknt-activity.js.
  if (String(row['ĐỒNG TIỀN'] || '').toUpperCase() === 'USD') return Number(amount);
  return toUSD(amount, row['ĐỒNG TIỀN']);
}

// Nhom theo doanh nghiệp (khach hang) — tai su dung loanCustomerId de van
// nhom dung ca voi du lieu cu chua dien MÃ KH truc tiep trong Khoanvay.
function loanReportBuild(cityFilter, statusFilter) {
  const cityKey = cityFilter ? provinceKey(cityFilter) : '';
  const rows = DB.Khoanvay.filter(r => {
    if (statusFilter === 'paid' && !loanIsPaid(r)) return false;
    if (statusFilter === 'open' && loanIsPaid(r)) return false;
    if (cityKey) {
      const maKH = loanCustomerId(r);
      const customer = DB.KhachHang.find(k => String(k.MaKH) === maKH);
      if (provinceKey(customer && customer.DiaChiTinhTP) !== cityKey) return false;
    }
    return true;
  });
  const byCustomer = new Map();
  rows.forEach(r => {
    const maKH = loanCustomerId(r);
    if (!byCustomer.has(maKH)) byCustomer.set(maKH, []);
    byCustomer.get(maKH).push(r);
  });
  const groups = [...byCustomer.entries()].map(([maKH, loans]) => {
    loans.sort((a,b) => parseVNDateSort(b['NGÀY VBXN']) - parseVNDateSort(a['NGÀY VBXN']));
    const usd = loans.reduce((sum, r) => sum + (loanReportUSD(r) || 0), 0);
    return { maKH, name: khName(maKH) || 'Chưa xác định khách hàng', loans, usd };
  }).sort((a,b) => a.name.localeCompare(b.name, 'vi'));
  const totalUSD = groups.reduce((sum, g) => sum + g.usd, 0);
  return { rows, groups, companyCount: groups.length, loanCount: rows.length, totalUSD, cityFilter, statusFilter };
}

function loanReportMeta(data) {
  const cityText = data.cityFilter || 'Tất cả tỉnh/thành phố';
  const statusText = data.statusFilter === 'paid' ? 'Đã hết nợ' : data.statusFilter === 'open' ? 'Còn dư nợ' : 'Tất cả trạng thái';
  return { cityText, statusText };
}

function loanReportFileStem(data) {
  const meta = loanReportMeta(data);
  const safe = String(meta.cityText).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'D').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Danh-sach-khoan-vay-${safe || 'Tat-ca'}`;
}

function loanReportGroupRows(data) {
  let html = '';
  data.groups.forEach((g, gi) => {
    html += `<tr class="lr-group"><td colspan="9"><b>${gi + 1}. ${esc(g.name)}</b><span class="lr-code mono">${esc(g.maKH || '—')}</span><span class="lr-count">${g.loans.length} khoản vay</span></td></tr>`;
    g.loans.forEach((r, i) => {
      const usd = loanReportUSD(r);
      html += `<tr><td class="num muted">${gi + 1}.${i + 1}</td><td class="mono"><b>${esc(r['MÃ SỐ KV'])}</b></td><td>${esc(r['SỐ VBXN'] || '—')}</td><td class="mono">${esc(fmtDateVN(r['NGÀY VBXN']))}</td><td class="num">${esc(fmtNum(r['KIM NGẠCH VAY']))}</td><td class="mono">${esc(r['ĐỒNG TIỀN'])}</td><td class="num">${esc(fmtNum(r['DƯ NỢ']))}</td><td>${loanReportStatusLabel(r)}</td><td class="num">${usd === null ? '—' : esc(loanReportFmtUSD(usd))}</td></tr>`;
    });
    html += `<tr class="lr-subtotal"><td colspan="8">Tổng ${esc(g.name)}: ${g.loans.length} khoản vay</td><td class="num">${esc(loanReportFmtUSD(g.usd))}</td></tr>`;
  });
  return html;
}

function loanReportTable(data) {
  const body = data.rows.length
    ? loanReportGroupRows(data) + `<tr class="lr-grand"><td colspan="8">TỔNG CỘNG: ${data.companyCount} doanh nghiệp · ${data.loanCount} khoản vay</td><td class="num">${esc(loanReportFmtUSD(data.totalUSD))}</td></tr>`
    : '<tr><td colspan="9" class="muted">Không có khoản vay phù hợp với điều kiện đã chọn.</td></tr>';
  return `<table class="lr-table"><thead><tr><th>TT</th><th>Mã số khoản vay</th><th>Số VB xác nhận</th><th>Ngày VB</th><th>Kim ngạch vay</th><th>Đồng tiền</th><th>Dư nợ</th><th>Trạng thái</th><th>Quy USD</th></tr></thead><tbody>${body}</tbody></table>`;
}

function loanReportStyles() {
  return `@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#111;font:10pt "Times New Roman",serif}h1{text-align:center;font-size:15pt;margin:0 0 4px}h2{text-align:center;font-size:11pt;font-weight:normal;margin:0 0 12px}table.lr-table{width:100%;border-collapse:collapse;table-layout:fixed}table.lr-table th,table.lr-table td{border:1px solid #555;padding:4px;vertical-align:top;overflow-wrap:anywhere}table.lr-table th{text-align:center;background:#eee}table.lr-table .num{text-align:right}table.lr-table .mono{font-family:"Courier New",monospace}table.lr-table .muted{color:#666;font-size:8pt}.lr-group td{font-weight:bold;background:#dcebe5}.lr-group .lr-code{margin-left:8px;font-weight:normal}.lr-group .lr-count{float:right;font-weight:normal}.lr-subtotal td{font-weight:bold;background:#f1f1f1}.lr-grand td{font-weight:bold;background:#ddd}`;
}

function loanReportDocument(data, autoPrint) {
  const meta = loanReportMeta(data);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(loanReportFileStem(data))}</title><style>${loanReportStyles()}</style></head><body><h1>BÁO CÁO DANH SÁCH KHOẢN VAY NƯỚC NGOÀI</h1><h2>${esc(meta.cityText)} · ${esc(meta.statusText)}</h2>${loanReportTable(data)}${autoPrint ? '<script>window.onload=()=>window.print()<\\/script>' : ''}</body></html>`;
}

function loanReportDownload(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportLoanReportWord(data) {
  loanReportDownload('﻿' + loanReportDocument(data, false), 'application/msword;charset=utf-8', loanReportFileStem(data) + '.doc');
}

// Chia cho ty gia co the ra rat nhieu chu so thap phan (vd 62407292.956651695).
// Lam tron 2 so cho de doc.
function loanReportExcelUSD(usd) {
  if (usd === null || usd === undefined || usd === '' || isNaN(usd)) return '';
  return Number(Number(usd).toFixed(2));
}

// Van ban thuan phan cach bang tab (gia dinh la .xls) khong duoc moi phien
// ban Excel nhan dung dinh dang bang - co the bi nhap nguyen ca dong vao 1 o
// cot A thay vi tach cot. Dung bang HTML that su (nhu exportExcel trong
// tknt-snapshot-report.js, cach da kiem chung hoat dong on dinh) de Excel
// luon nhan dung cau truc bang bat ke phien ban/locale.
function loanReportExcelRow(cells) {
  return `<tr>${cells.map(c => `<td style="border:1px solid #000" align="${c.right ? 'right' : 'left'}">${esc(c.v)}</td>`).join('')}</tr>`;
}

function exportLoanReportExcel(data) {
  const meta = loanReportMeta(data);
  const bodyRows = [];
  data.groups.forEach(g => {
    bodyRows.push(`<tr><th colspan="8" style="border:1px solid #000;text-align:left;background:#dcebe5">${esc(g.name)} (${esc(g.maKH || '—')}) — ${g.loans.length} khoản vay</th></tr>`);
    g.loans.forEach((r, i) => {
      const usd = loanReportUSD(r);
      bodyRows.push(loanReportExcelRow([
        { v: i + 1, right: true }, { v: r['MÃ SỐ KV'] }, { v: r['SỐ VBXN'] }, { v: fmtDateVN(r['NGÀY VBXN']) },
        { v: r['KIM NGẠCH VAY'], right: true }, { v: r['ĐỒNG TIỀN'] }, { v: r['DƯ NỢ'], right: true },
        { v: loanReportStatusLabel(r) }, { v: loanReportExcelUSD(usd), right: true }
      ]));
    });
    bodyRows.push(`<tr><th colspan="8" style="border:1px solid #000">Tổng ${esc(g.name)}: ${g.loans.length} khoản vay</th><th style="border:1px solid #000" align="right">${loanReportExcelUSD(g.usd)}</th></tr>`);
  });
  const html = `<html><head><meta charset="utf-8"></head><body><table>
    <tr><th colspan="9">BÁO CÁO DANH SÁCH KHOẢN VAY NƯỚC NGOÀI</th></tr>
    <tr><th colspan="9">${esc(meta.cityText)} · ${esc(meta.statusText)}</th></tr>
    <tr></tr>
    <tr><th style="border:1px solid #000">TT</th><th style="border:1px solid #000">Mã số khoản vay</th><th style="border:1px solid #000">Số VBXN</th><th style="border:1px solid #000">Ngày VB</th><th style="border:1px solid #000">Kim ngạch vay</th><th style="border:1px solid #000">Đồng tiền</th><th style="border:1px solid #000">Dư nợ</th><th style="border:1px solid #000">Trạng thái</th><th style="border:1px solid #000">Quy USD</th></tr>
    ${bodyRows.join('')}
    <tr><th colspan="8" style="border:1px solid #000">TỔNG CỘNG: ${data.companyCount} doanh nghiệp · ${data.loanCount} khoản vay</th><th style="border:1px solid #000" align="right">${loanReportExcelUSD(data.totalUSD)}</th></tr>
    </table></body></html>`;
  loanReportDownload('﻿' + html, 'application/vnd.ms-excel;charset=utf-8', loanReportFileStem(data) + '.xls');
}

function printLoanReport(data) {
  const popup = window.open('', '_blank');
  if (!popup) return toast('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up rồi thử lại.', true);
  popup.document.write(loanReportDocument(data, true));
  popup.document.close();
}

// Khong dung position:absolute/z-index tren node chup PDF — cach nay tung
// lam html2canvas chup ra trang trang (xem lich su sua exportPdf trong
// tknt-snapshot-report.js). Chi gan node vao body binh thuong nhu
// exportCustomerGroupReportPdf, la cach da kiem chung hoat dong dung.
// html2canvas dung MOT canvas duy nhat cho toan bo noi dung. Bao cao loc it
// (vd theo tinh/thanh + trang thai cu the) chi vai chuc dong thi khong sao,
// nhung loc rong (ca thanh pho lon, hang nghin khoan vay) lam canvas cao toi
// hang tram nghin px - vuot qua gioi han bo nho/kich thuoc canvas cua trinh
// duyet va ra PDF trang trong (da kiem chung bang html2canvas that: rendering
// bat dau hong ngay o vai tram dong, ~2.300 dong thi mat ~36s va gan chac
// chan hong). Voi bao cao qua lon, chuyen sang In truc tiep - trinh duyet tu
// phan trang khong gioi han kich thuoc - de nguoi dung van "Luu duoi dang
// PDF" duoc qua hop thoai in, thay vi im lang ra file trang.
const LOAN_REPORT_PDF_ROW_LIMIT = 150;

async function exportLoanReportPdf(data) {
  if (typeof html2pdf === 'undefined') { printLoanReport(data); return; }
  if (data.rows.length > LOAN_REPORT_PDF_ROW_LIMIT) {
    toast(`Báo cáo có ${data.rows.length} khoản vay, quá lớn để xuất PDF trực tiếp (dễ ra file trắng). Đang chuyển sang In để bạn lưu PDF qua hộp thoại in của trình duyệt — hoặc thu hẹp bộ lọc tỉnh/thành, trạng thái rồi thử lại.`, true);
    printLoanReport(data);
    return;
  }
  const host = document.createElement('div');
  host.innerHTML = loanReportDocument(data, false).replace(/^.*?<body>/s, '').replace(/<\/body>.*$/s, '');
  host.style.width = '277mm';
  host.style.padding = '0';
  host.style.background = '#fff';
  document.body.appendChild(host);
  try {
    await html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: loanReportFileStem(data) + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' }
    }).from(host).save();
  } finally {
    host.remove();
  }
}

function showLoanReport(data) {
  const meta = loanReportMeta(data);
  openModal('Danh sách khoản vay nước ngoài', `
    <div class="quarter-report-title"><b>BÁO CÁO DANH SÁCH KHOẢN VAY NƯỚC NGOÀI</b><span>${esc(meta.cityText)} · ${esc(meta.statusText)} · ${data.loanCount} khoản vay</span></div>
    <div class="table-wrap lr-preview">${loanReportTable(data)}</div>
    <div class="modal-foot">
      <button class="btn btn-outline" id="lrClose">Đóng</button>
      <button class="btn btn-outline" id="lrExcel" ${data.rows.length ? '' : 'disabled'}>Xuất Excel</button>
      <button class="btn btn-outline" id="lrWord" ${data.rows.length ? '' : 'disabled'}>Xuất Word</button>
      <button class="btn btn-outline" id="lrPdf" ${data.rows.length ? '' : 'disabled'}>Xuất PDF</button>
      <button class="btn btn-primary" id="lrPrint" ${data.rows.length ? '' : 'disabled'}>In trực tiếp</button>
    </div>`, el => {
    el.querySelector('#lrClose').onclick = closeModal;
    if (!data.rows.length) return;
    el.querySelector('#lrExcel').onclick = () => exportLoanReportExcel(data);
    el.querySelector('#lrWord').onclick = () => exportLoanReportWord(data);
    el.querySelector('#lrPdf').onclick = () => exportLoanReportPdf(data);
    el.querySelector('#lrPrint').onclick = () => printLoanReport(data);
  });
}

function openLoanReportOptions() {
  const provincesLoaded = LOADED_SHEETS.has('TinhThanh');
  openModal('Báo cáo danh sách khoản vay nước ngoài', `<form id="loanReportForm"><div class="form-grid">
    <div class="field"><label>Tỉnh/Thành phố</label><select name="city" ${provincesLoaded ? '' : 'disabled'}><option value="">${provincesLoaded ? '— Tất cả tỉnh/thành —' : 'Đang tải danh mục…'}</option>${provincesLoaded ? loanReportCityOptions() : ''}</select></div>
    <div class="field"><label>Trạng thái</label><select name="status"><option value="">— Tất cả trạng thái —</option><option value="open">Còn dư nợ</option><option value="paid">Đã hết nợ</option></select></div>
  </div><div class="modal-foot"><button type="button" class="btn btn-outline" id="loanReportCancel">Hủy</button><button class="btn btn-primary" id="loanReportView">Xem báo cáo</button></div></form>`, el => {
    el.querySelector('#loanReportCancel').onclick = closeModal;
    const citySelect = el.querySelector('[name="city"]');
    if (!provincesLoaded) {
      ensureLoanReportProvinces().then(() => {
        citySelect.innerHTML = `<option value="">— Tất cả tỉnh/thành —</option>${loanReportCityOptions()}`;
        citySelect.disabled = false;
      }).catch(err => toast('Không tải được danh mục tỉnh/thành: ' + err.message, true));
    }
    el.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const city = fd.get('city') || '', status = fd.get('status') || '';
      const btn = el.querySelector('#loanReportView'), oldLabel = btn.textContent;
      btn.disabled = true; btn.textContent = 'Đang tải tỷ giá…';
      try {
        await ensureLoanReportRates();
        showLoanReport(loanReportBuild(city, status));
      } catch (err) {
        toast('Không tải được tỷ giá quy đổi: ' + err.message, true);
        btn.disabled = false; btn.textContent = oldLabel;
      }
    };
  });
}
