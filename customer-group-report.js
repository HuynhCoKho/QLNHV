// Báo cáo danh sách khách hàng đã thực hiện TTHC theo nhóm nghiệp vụ.
// Hồ sơ được tải ở chế độ rút gọn để báo cáo không làm chậm màn hình Khách hàng.

const CUSTOMER_GROUP_REPORT_CACHE = new Map();

async function ensureCustomerGroupReportGroups() {
  if (LOADED_SHEETS.has('NhomNghiepVu')) return;
  DB.NhomNghiepVu = await apiGet('list', { sheet: 'NhomNghiepVu' });
  LOADED_SHEETS.add('NhomNghiepVu');
  normalizeIds();
}

async function loadCustomerGroupReportRows(groupName) {
  if (CUSTOMER_GROUP_REPORT_CACHE.has(groupName)) {
    return CUSTOMER_GROUP_REPORT_CACHE.get(groupName);
  }
  const rows = await apiGet('customerGroupReport', { group: groupName });
  const result = (Array.isArray(rows) ? rows : []).sort((a, b) =>
    String(a.TenKhachHang || '').localeCompare(String(b.TenKhachHang || ''), 'vi')
  );
  CUSTOMER_GROUP_REPORT_CACHE.set(groupName, result);
  return result;
}

function customerGroupReportAddress(row) {
  return [row.DiaChiSo, row.DiaChiPhuongXa, row.DiaChiTinhTP]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

function customerGroupReportTable(rows) {
  return `<table class="customer-group-report-table">
    <thead><tr>
      <th>TT</th>
      <th>Mã khách hàng</th>
      <th>Số định danh</th>
      <th>Tên khách hàng</th>
      <th>Địa chỉ</th>
      <th>Số điện thoại</th>
      <th>Email</th>
    </tr></thead>
    <tbody>${rows.map((row, index) => `<tr>
      <td class="num">${index + 1}</td>
      <td class="mono">${esc(row.MaKH)}</td>
      <td class="mono">${esc(row.MaDinhDanh)}</td>
      <td>${esc(row.TenKhachHang)}</td>
      <td>${esc(customerGroupReportAddress(row))}</td>
      <td>${esc(row.SoDienThoai)}</td>
      <td>${esc(row.Email)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

async function openCustomerGroupReportOptions() {
  const groupsAlreadyLoaded = LOADED_SHEETS.has('NhomNghiepVu');
  openModal('Báo cáo khách hàng theo nhóm nghiệp vụ', `
    <form id="customerGroupReportForm">
      <div class="field">
        <label>Nhóm nghiệp vụ *</label>
        <select name="group" required ${groupsAlreadyLoaded ? '' : 'disabled'}>
          <option value="">${groupsAlreadyLoaded ? '— Chọn nhóm nghiệp vụ —' : 'Đang tải danh mục…'}</option>
          ${groupsAlreadyLoaded ? customerGroupReportOptions() : ''}
        </select>
        <span class="hint">Mỗi khách hàng chỉ xuất hiện một lần dù đã thực hiện nhiều hồ sơ trong cùng nhóm.</span>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-outline" id="customerGroupReportCancel">Hủy</button>
        <button class="btn btn-primary" id="customerGroupReportView" ${groupsAlreadyLoaded ? '' : 'disabled'}>Xem báo cáo</button>
      </div>
    </form>`, async modal => {
      modal.querySelector('#customerGroupReportCancel').onclick = closeModal;
      const select = modal.querySelector('[name="group"]');
      const viewButton = modal.querySelector('#customerGroupReportView');
      if (!groupsAlreadyLoaded) {
        try {
          await ensureCustomerGroupReportGroups();
          select.innerHTML = `<option value="">— Chọn nhóm nghiệp vụ —</option>${customerGroupReportOptions()}`;
          select.disabled = false;
          viewButton.disabled = false;
        } catch (err) {
          toast('Không tải được dữ liệu báo cáo: ' + err.message, true);
          closeModal();
          return;
        }
      }
      modal.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        viewButton.disabled = true;
        const oldLabel = viewButton.textContent;
        viewButton.textContent = 'Đang tổng hợp…';
        try {
          const groupName = String(new FormData(event.target).get('group') || '').trim();
          if (!groupName) throw new Error('Vui lòng chọn nhóm nghiệp vụ.');
          const rows = await loadCustomerGroupReportRows(groupName);
          showCustomerGroupReport(groupName, rows);
        } catch (err) {
          toast(err.message, true);
          viewButton.disabled = false;
          viewButton.textContent = oldLabel;
        }
      };
    });
}

function customerGroupReportOptions() {
  return DB.NhomNghiepVu
    .map(row => String(row.TenNhom || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'vi'))
    .map(name => `<option value="${esc(name)}">${esc(name)}</option>`)
    .join('');
}

function showCustomerGroupReport(groupName, rows) {
  openModal('Danh sách khách hàng — ' + groupName, `
    <div id="customerGroupReportDocument" class="customer-group-report-document">
      <div class="quarter-report-title">
        <b>DANH SÁCH KHÁCH HÀNG THỰC HIỆN THỦ TỤC HÀNH CHÍNH</b>
        <span>Nhóm nghiệp vụ: ${esc(groupName)} · ${rows.length} khách hàng</span>
      </div>
      <div class="table-wrap customer-group-report-preview">
        ${rows.length ? customerGroupReportTable(rows) : '<div class="empty-state"><h3>Không có khách hàng thuộc nhóm nghiệp vụ đã chọn</h3></div>'}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-outline" id="customerGroupReportClose">Đóng</button>
      <button class="btn btn-outline" id="customerGroupReportExcel" ${rows.length ? '' : 'disabled'}>Xuất Excel</button>
      <button class="btn btn-outline" id="customerGroupReportWord" ${rows.length ? '' : 'disabled'}>Xuất Word</button>
      <button class="btn btn-outline" id="customerGroupReportPdf" ${rows.length ? '' : 'disabled'}>Xuất PDF</button>
      <button class="btn btn-primary" id="customerGroupReportPrint" ${rows.length ? '' : 'disabled'}>In trực tiếp</button>
    </div>`, modal => {
      modal.querySelector('#customerGroupReportClose').onclick = closeModal;
      if (!rows.length) return;
      modal.querySelector('#customerGroupReportExcel').onclick = () => exportCustomerGroupReportExcel(groupName, rows);
      modal.querySelector('#customerGroupReportWord').onclick = () => exportCustomerGroupReportWord(groupName, rows);
      modal.querySelector('#customerGroupReportPdf').onclick = () => exportCustomerGroupReportPdf(groupName, rows);
      modal.querySelector('#customerGroupReportPrint').onclick = () => printCustomerGroupReport(groupName, rows);
    });
}

function customerGroupReportFileStem(groupName) {
  const safe = String(groupName || 'Nhom-nghiep-vu')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'd').replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `Danh-sach-khach-hang-${safe || 'Nhom-nghiep-vu'}`;
}

function customerGroupReportClean(value) {
  return String(value ?? '').replace(/\t|\r?\n/g, ' ').trim();
}

function exportCustomerGroupReportExcel(groupName, rows) {
  const lines = [
    ['STT', 'Mã khách hàng', 'Số định danh', 'Tên khách hàng', 'Địa chỉ', 'Số điện thoại', 'Email'].join('\t'),
    ...rows.map((row, index) => [
      index + 1, row.MaKH, row.MaDinhDanh, row.TenKhachHang,
      customerGroupReportAddress(row), row.SoDienThoai, row.Email
    ].map(customerGroupReportClean).join('\t'))
  ];
  downloadCustomerGroupReport(
    '\ufeff' + lines.join('\r\n'),
    'application/vnd.ms-excel;charset=utf-8',
    customerGroupReportFileStem(groupName) + '.xls'
  );
}

function customerGroupReportPrintableHtml(groupName, rows, autoPrint) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(customerGroupReportFileStem(groupName))}</title>
    <style>
      @page{size:A4 landscape;margin:10mm}
      *{box-sizing:border-box}
      body{margin:0;color:#111;font:10.5pt "Times New Roman",serif}
      h1{text-align:center;font-size:15pt;margin:0 0 5px}
      h2{text-align:center;font-size:12pt;margin:0 0 12px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      th,td{border:1px solid #555;padding:4px;vertical-align:top;overflow-wrap:anywhere}
      th{text-align:center;background:#eee}
      th:nth-child(1){width:4%}th:nth-child(2){width:11%}th:nth-child(3){width:10%}
      th:nth-child(4){width:22%}th:nth-child(5){width:29%}th:nth-child(6){width:11%}th:nth-child(7){width:13%}
      .num{text-align:center}.mono{font-family:"Courier New",monospace}
      .total{margin-top:8px;font-weight:bold}
    </style></head><body>
      <h1>DANH SÁCH KHÁCH HÀNG THỰC HIỆN THỦ TỤC HÀNH CHÍNH</h1>
      <h2>Nhóm nghiệp vụ: ${esc(groupName)}</h2>
      ${customerGroupReportTable(rows)}
      <div class="total">Tổng cộng: ${rows.length} khách hàng</div>
      ${autoPrint ? '<script>window.onload=()=>window.print()<\\/script>' : ''}
    </body></html>`;
}

function exportCustomerGroupReportWord(groupName, rows) {
  downloadCustomerGroupReport(
    '\ufeff' + customerGroupReportPrintableHtml(groupName, rows, false),
    'application/msword;charset=utf-8',
    customerGroupReportFileStem(groupName) + '.doc'
  );
}

function printCustomerGroupReport(groupName, rows) {
  const popup = window.open('', '_blank');
  if (!popup) {
    toast('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up.', true);
    return;
  }
  popup.document.write(customerGroupReportPrintableHtml(groupName, rows, true));
  popup.document.close();
}

async function exportCustomerGroupReportPdf(groupName, rows) {
  if (typeof html2pdf === 'undefined') {
    printCustomerGroupReport(groupName, rows);
    return;
  }
  const host = document.createElement('div');
  host.innerHTML = customerGroupReportPrintableHtml(groupName, rows, false)
    .replace(/^.*?<body>/s, '').replace(/<\/body>.*$/s, '');
  host.style.width = '277mm';
  host.style.padding = '0';
  host.style.background = '#fff';
  document.body.appendChild(host);
  try {
    await html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: customerGroupReportFileStem(groupName) + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' }
    }).from(host).save();
  } finally {
    host.remove();
  }
}

function downloadCustomerGroupReport(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
