// Tra cứu toàn bộ hoạt động ngoại hối của 1 khách hàng theo mã/tên khách hàng:
// khoản vay nước ngoài, cho vay ra nước ngoài, tài khoản ngoại tệ ở nước
// ngoài, đầu tư ra nước ngoài, thanh toán với Campuchia, xử lý vi phạm hành
// chính. Toàn bộ dữ liệu đã được tải cho các trang nghiệp vụ tương ứng, nên
// trang này chỉ lọc lại trên dữ liệu đã có trong bộ nhớ (DB), không gọi thêm API.

let customerLookupQuery = '';

function customerLookupMatches(raw) {
  const q = String(raw || '').trim();
  if (!q) return [];
  const byCode = findCustomerByCode(lookupCode(q));
  if (byCode) return [byCode];
  const ql = q.toLowerCase();
  return DB.KhachHang
    .filter(k => String(k.TenKhachHang || '').toLowerCase().includes(ql) || String(k.MaKH || '').toLowerCase().includes(ql))
    .sort((a, b) => String(a.TenKhachHang || '').localeCompare(String(b.TenKhachHang || ''), 'vi'))
    .slice(0, 30);
}

function customerLookupLoanStatusBadge(row) {
  return row['HẾT NỢ']
    ? '<span class="badge badge-neutral">Đã hết nợ</span>'
    : '<span class="badge badge-amber">Còn dư nợ</span>';
}

// Gom dữ liệu + mô tả từng nhóm hoạt động vào 1 chỗ, dùng chung cho cả hiển
// thị trên màn hình (luôn hiện đủ 6 nhóm, kể cả nhóm chưa có hoạt động) và
// xuất báo cáo/in (chỉ lấy các nhóm khách hàng thực sự có hoạt động).
function customerLookupSections(customer) {
  const ma = String(customer.MaKH);
  const loans = DB.Khoanvay.filter(r => String(r['MÃ KH']) === ma);
  const lendings = DB.ChoVay.filter(r => String(r['MÃ KH']) === ma);
  const accounts = DB.TKNHTONN.filter(r => String(r['MÃ ĐƠN VỊ']) === ma);
  const investmentIds = new Set(DB.DTRNNN_NDT.filter(r => String(r['MÃ KH']) === ma).map(r => r['RECORD ID']));
  const investments = DB.DTRNNN.filter(p => investmentIds.has(p['RECORD ID']));
  const cambodia = DB.Campuchia.filter(r => String(r['MÃ KH']) === ma)
    .sort((a, b) => String(b['KỲ BC'] || '').localeCompare(String(a['KỲ BC'] || '')));
  const violations = DB.VPHC.filter(r => String(r['MÃ KH']) === ma);

  return [
    {
      title: 'Khoản vay nước ngoài', rows: loans,
      emptyText: 'Khách hàng chưa có khoản vay nước ngoài.',
      cols: ['Mã khoản vay', 'Số VBXN', 'Ngày VBXN', 'Kim ngạch vay', 'Đồng tiền', 'Dư nợ', 'Tình trạng'],
      rowHtml: r => `<tr><td class="mono">${esc(r['MÃ SỐ KV'])}</td><td>${esc(r['SỐ VBXN'])}</td><td class="mono">${esc(r['NGÀY VBXN'])}</td><td class="num">${fmtNum(r['KIM NGẠCH VAY'])}</td><td class="mono">${esc(r['ĐỒNG TIỀN'])}</td><td class="num">${fmtNum(r['DƯ NỢ'])}</td><td>${customerLookupLoanStatusBadge(r)}</td></tr>`,
      rowText: r => [r['MÃ SỐ KV'], r['SỐ VBXN'], r['NGÀY VBXN'], fmtNum(r['KIM NGẠCH VAY']), r['ĐỒNG TIỀN'], fmtNum(r['DƯ NỢ']), r['HẾT NỢ'] ? 'Đã hết nợ' : 'Còn dư nợ']
    },
    {
      title: 'Cho vay ra nước ngoài', rows: lendings,
      emptyText: 'Khách hàng chưa có khoản cho vay ra nước ngoài.',
      cols: ['Mã khoản cho vay', 'Số VBXN', 'Ngày VBXN', 'Kim ngạch vay', 'Nguyên tệ', 'Dư nợ', 'Tình trạng'],
      rowHtml: r => `<tr><td class="mono">${esc(r['MÃ SỐ KHOẢN CHO VAY'])}</td><td>${esc(r['SỐ VBXN'])}</td><td class="mono">${esc(r['NGÀY VBXN'])}</td><td class="num">${fmtNum(r['KIM NGẠCH VAY'])}</td><td class="mono">${esc(r['NGUYÊN TỆ'])}</td><td class="num">${fmtNum(r['DƯ NỢ'])}</td><td>${customerLookupLoanStatusBadge(r)}</td></tr>`,
      rowText: r => [r['MÃ SỐ KHOẢN CHO VAY'], r['SỐ VBXN'], r['NGÀY VBXN'], fmtNum(r['KIM NGẠCH VAY']), r['NGUYÊN TỆ'], fmtNum(r['DƯ NỢ']), r['HẾT NỢ'] ? 'Đã hết nợ' : 'Còn dư nợ']
    },
    {
      title: 'Tài khoản ngoại tệ ở nước ngoài', rows: accounts,
      emptyText: 'Khách hàng chưa mở tài khoản ngoại tệ ở nước ngoài.',
      cols: ['Mã TKNT', 'Số tài khoản', 'Nguyên tệ', 'Quốc gia', 'Ngân hàng', 'Trạng thái'],
      rowHtml: r => `<tr><td class="mono">${esc(r['MÃ TKNT'])}</td><td class="mono">${esc(r['SỐ TÀI KHOẢN'])}</td><td class="mono">${esc(r['NGUYÊN TỆ'])}</td><td>${esc(qgName(r['QUỐC GIA']))}</td><td>${esc(r['NGÂN HÀNG'])}</td><td>${tkntStatusBadge(r['TRẠNG THÁI'])}</td></tr>`,
      rowText: r => [r['MÃ TKNT'], r['SỐ TÀI KHOẢN'], r['NGUYÊN TỆ'], qgName(r['QUỐC GIA']), r['NGÂN HÀNG'], r['TRẠNG THÁI']]
    },
    {
      title: 'Đầu tư ra nước ngoài', rows: investments,
      emptyText: 'Khách hàng chưa có dự án đầu tư ra nước ngoài.',
      cols: ['Mã dự án', 'Tên dự án', 'Quốc gia', 'Tổng vốn đầu tư (USD)', 'Vốn đã chuyển ra (USD)', 'Trạng thái'],
      rowHtml: p => `<tr><td class="mono">${esc(p['MÃ DỰ ÁN'])}</td><td>${esc(p['TÊN DỰ ÁN'])}</td><td>${esc(p['QUỐC GIA'])}</td><td class="num">${fmtNum(p['TỔNG VỐN ĐẦU TƯ (USD)'])}</td><td class="num">${fmtNum(p['VỐN CHUYỂN RA (USD)'])}</td><td>${esc(p['TRẠNG THÁI'])}</td></tr>`,
      rowText: p => [p['MÃ DỰ ÁN'], p['TÊN DỰ ÁN'], p['QUỐC GIA'], fmtNum(p['TỔNG VỐN ĐẦU TƯ (USD)']), fmtNum(p['VỐN CHUYỂN RA (USD)']), p['TRẠNG THÁI']]
    },
    {
      title: 'Thanh toán với Campuchia', rows: cambodia,
      emptyText: 'Khách hàng chưa có báo cáo thanh toán với Campuchia.',
      cols: ['Kỳ báo cáo', 'Hình thức', 'Loại', 'Số tiền (USD)'],
      rowHtml: r => `<tr><td class="mono">${esc(r['KỲ BC'])}</td><td>${esc(r['Hình thức'])}</td><td>${esc(r.LoaiID)}</td><td class="num">${fmtNum(r['SỐ TIỀN (USD)'])}</td></tr>`,
      rowText: r => [r['KỲ BC'], r['Hình thức'], r.LoaiID, fmtNum(r['SỐ TIỀN (USD)'])]
    },
    {
      title: 'Xử lý vi phạm hành chính', rows: violations,
      emptyText: 'Khách hàng chưa có hồ sơ xử lý vi phạm hành chính.',
      cols: ['Mã hồ sơ VP', 'Nhóm nghiệp vụ', 'Loại xử lý', 'Số tiền phạt', 'Trạng thái'],
      rowHtml: r => `<tr><td class="mono">${esc(r['MÃ HỒ SƠ VI PHẠM'])}</td><td>${esc(r['NHÓM NV'])}</td><td>${esc(r['LOẠI XỬ LÝ'])}</td><td class="num">${fmtNum(r['SỐ TIỀN PHẠT'])}</td><td>${esc(r['TRẠNG THÁI'])}</td></tr>`,
      rowText: r => [r['MÃ HỒ SƠ VI PHẠM'], r['NHÓM NV'], r['LOẠI XỬ LÝ'], fmtNum(r['SỐ TIỀN PHẠT']), r['TRẠNG THÁI']]
    }
  ];
}

function customerLookupHeaderHtml(customer, totalActivities) {
  const ma = String(customer.MaKH);
  return `<div class="detail-grid">
      <div class="detail-row"><div class="detail-label">Mã khách hàng</div><div class="detail-value mono">${esc(ma)}</div></div>
      <div class="detail-row"><div class="detail-label">Tên khách hàng</div><div class="detail-value"><b>${esc(customer.TenKhachHang)}</b></div></div>
      <div class="detail-row"><div class="detail-label">Số định danh / MST</div><div class="detail-value mono">${esc(customer.MaDinhDanh) || '—'}</div></div>
      <div class="detail-row"><div class="detail-label">Địa chỉ</div><div class="detail-value">${esc(tkntCustomerAddress(customer)) || '—'}</div></div>
      <div class="detail-row"><div class="detail-label">Điện thoại / Email</div><div class="detail-value">${[customer.SoDienThoai, customer.Email].filter(Boolean).map(esc).join(' · ') || '—'}</div></div>
    </div>
    <div class="stats-bar"><div class="stat-chip stat-total">Tổng số hoạt động ngoại hối: <b>${totalActivities}</b></div></div>`;
}

function renderCustomerLookupDetail(customer) {
  const sections = customerLookupSections(customer);
  const totalActivities = sections.reduce((n, s) => n + s.rows.length, 0);

  const header = `<div class="card customer-lookup-header">
    ${customerLookupHeaderHtml(customer, totalActivities)}
    <div class="modal-foot customer-lookup-actions">
      <button class="btn btn-outline btn-sm" id="custLookupExcel">Xuất Excel</button>
      <button class="btn btn-outline btn-sm" id="custLookupWord">Xuất Word</button>
      <button class="btn btn-outline btn-sm" id="custLookupPdf">Xuất PDF</button>
      <button class="btn btn-primary btn-sm" id="custLookupPrint">In A4</button>
    </div>
  </div>`;

  const body = sections.map(s => `<div class="card customer-lookup-section">
    <h3>${esc(s.title)} (${s.rows.length})</h3>
    ${s.rows.length
      ? `<div class="table-wrap"><table><thead><tr>${s.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(s.rowHtml).join('')}</tbody></table></div>`
      : `<div class="empty-state"><p class="muted">${esc(s.emptyText)}</p></div>`}
  </div>`).join('');

  return header + body;
}

function customerLookupWireActions(root, customer) {
  root.querySelector('#custLookupExcel').onclick = () => exportCustomerLookupExcel(customer);
  root.querySelector('#custLookupWord').onclick = () => exportCustomerLookupWord(customer);
  root.querySelector('#custLookupPdf').onclick = () => exportCustomerLookupPdf(customer);
  root.querySelector('#custLookupPrint').onclick = () => printCustomerLookup(customer);
}

function customerLookupFileStem(customer) {
  const safe = String(customer.TenKhachHang || customer.MaKH || 'Khach-hang')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'd').replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `Hoat-dong-ngoai-hoi-${customer.MaKH}-${safe}`;
}

// Chỉ xuất/in các nhóm khách hàng thực sự có hoạt động - khác với màn hình
// tra cứu (luôn hiện đủ 6 nhóm để người dùng biết là chưa có, không phải lỗi).
function customerLookupNonEmptySections(customer) {
  return customerLookupSections(customer).filter(s => s.rows.length);
}

function exportCustomerLookupExcel(customer) {
  const sections = customerLookupNonEmptySections(customer);
  const maxCols = Math.max(1, ...sections.map(s => s.cols.length));
  let table = xlsRow(xlsCell(`KHÁCH HÀNG: ${customer.MaKH} - ${customer.TenKhachHang}`, { header: true, colspan: maxCols }));
  sections.forEach(s => {
    table += xlsRow(xlsCell(`${s.title.toUpperCase()} (${s.rows.length})`, { header: true, colspan: maxCols, style: 'border:1px solid #000;background:#dcebe5' }));
    table += xlsRow(s.cols.map(c => xlsCell(c, { header: true })).join(''));
    table += s.rows.map(row => xlsRow(s.rowText(row).map(v => xlsCell(v)).join(''))).join('');
  });
  xlsDownload(customerLookupFileStem(customer) + '.xls', table);
}

function customerLookupPrintableHtml(customer, autoPrint) {
  const sections = customerLookupNonEmptySections(customer);
  const totalActivities = sections.reduce((n, s) => n + s.rows.length, 0);
  const sectionsHtml = sections.length
    ? sections.map(s => `<div class="clp-section">
        <h2>${esc(s.title)} (${s.rows.length})</h2>
        <table><thead><tr>${s.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${s.rows.map(s.rowHtml).join('')}</tbody></table>
      </div>`).join('')
    : '<p class="clp-empty">Khách hàng chưa có hoạt động ngoại hối nào được ghi nhận.</p>';

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(customerLookupFileStem(customer))}</title>
    <style>
      @page{size:A4 portrait;margin:12mm}
      *{box-sizing:border-box}
      body{margin:0;color:#111;font:10pt "Times New Roman",serif}
      h1{text-align:center;font-size:15pt;margin:0 0 10px}
      .clp-info{margin:0 0 14px;font-size:10.5pt;line-height:1.6}
      .clp-info b{display:inline-block;min-width:120px}
      .clp-section{margin-bottom:14px;break-inside:avoid}
      .clp-section h2{font-size:11pt;background:#eee;padding:4px 6px;margin:0 0 4px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      th,td{border:1px solid #555;padding:3px 4px;vertical-align:top;overflow-wrap:anywhere;font-size:9pt}
      th{text-align:center;background:#f5f5f5}
      td.num{text-align:right;font-variant-numeric:tabular-nums}
      td.mono,th.mono{font-family:"Courier New",monospace}
      .clp-empty{font-style:italic;color:#555}
      .clp-total{margin-top:6px;font-weight:bold}
    </style></head><body>
      <h1>HOẠT ĐỘNG NGOẠI HỐI CỦA KHÁCH HÀNG</h1>
      <div class="clp-info">
        <div><b>Mã khách hàng:</b> ${esc(customer.MaKH)}</div>
        <div><b>Tên khách hàng:</b> ${esc(customer.TenKhachHang)}</div>
        ${customer.MaDinhDanh ? `<div><b>Số định danh / MST:</b> ${esc(customer.MaDinhDanh)}</div>` : ''}
        ${tkntCustomerAddress(customer) ? `<div><b>Địa chỉ:</b> ${esc(tkntCustomerAddress(customer))}</div>` : ''}
      </div>
      ${sectionsHtml}
      <div class="clp-total">Tổng cộng: ${totalActivities} hoạt động ngoại hối</div>
      ${autoPrint ? '<script>window.onload=()=>window.print()<\\/script>' : ''}
    </body></html>`;
}

function exportCustomerLookupWord(customer) {
  downloadCustomerLookupFile(
    '﻿' + customerLookupPrintableHtml(customer, false),
    'application/msword;charset=utf-8',
    customerLookupFileStem(customer) + '.doc'
  );
}

function printCustomerLookup(customer) {
  const popup = window.open('', '_blank');
  if (!popup) {
    toast('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up.', true);
    return;
  }
  popup.document.write(customerLookupPrintableHtml(customer, true));
  popup.document.close();
}

async function exportCustomerLookupPdf(customer) {
  if (typeof html2pdf === 'undefined') {
    printCustomerLookup(customer);
    return;
  }
  const host = document.createElement('div');
  host.innerHTML = customerLookupPrintableHtml(customer, false)
    .replace(/^.*?<body>/s, '').replace(/<\/body>.*$/s, '');
  host.style.width = '190mm';
  host.style.padding = '0';
  host.style.background = '#fff';
  document.body.appendChild(host);
  try {
    await html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: customerLookupFileStem(customer) + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' }
    }).from(host).save();
  } finally {
    host.remove();
  }
}

function downloadCustomerLookupFile(content, type, filename) {
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

function customerLookupPickerHtml(matches) {
  return `<div class="card"><h3>Có ${matches.length} khách hàng phù hợp — chọn một</h3>
    <div class="table-wrap"><table><thead><tr><th>Mã KH</th><th>Tên khách hàng</th><th>Địa chỉ</th></tr></thead>
    <tbody>${matches.map(k => `<tr data-pick="${esc(k.MaKH)}"><td class="mono">${esc(k.MaKH)}</td><td><b>${esc(k.TenKhachHang)}</b></td><td>${esc(tkntCustomerAddress(k))}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
}

function renderCustomerLookup() {
  document.getElementById('topbarActions').innerHTML = '';
  document.getElementById('view').innerHTML = `
    <div class="card">
      <p class="muted">Nhập mã khách hàng hoặc tên khách hàng để xem toàn bộ hoạt động ngoại hối: khoản vay nước ngoài, cho vay ra nước ngoài, tài khoản ngoại tệ ở nước ngoài, đầu tư ra nước ngoài, thanh toán với Campuchia và xử lý vi phạm hành chính liên quan.</p>
      <div class="toolbar">
        <input id="custLookupInput" class="search-input" list="custLookupOptions" placeholder="Gõ mã khách hàng hoặc tên khách hàng…" value="${esc(customerLookupQuery)}" autocomplete="off">
        <datalist id="custLookupOptions">${camCustomerList()}</datalist>
      </div>
    </div>
    <div id="custLookupResult"></div>`;

  const input = document.getElementById('custLookupInput');
  const draw = () => {
    customerLookupQuery = input.value;
    const result = document.getElementById('custLookupResult');
    const q = input.value.trim();
    if (!q) { result.innerHTML = '<div class="empty-state"><h3>Nhập mã hoặc tên khách hàng để bắt đầu tra cứu</h3></div>'; return; }
    const matches = customerLookupMatches(q);
    if (!matches.length) { result.innerHTML = '<div class="empty-state"><h3>Không tìm thấy khách hàng phù hợp</h3></div>'; return; }
    if (matches.length > 1) {
      result.innerHTML = customerLookupPickerHtml(matches);
      result.querySelectorAll('tr[data-pick]').forEach(tr => {
        tr.onclick = () => {
          const k = findCustomerByCode(tr.dataset.pick);
          input.value = k.MaKH + ' — ' + k.TenKhachHang;
          draw();
        };
      });
      return;
    }
    result.innerHTML = renderCustomerLookupDetail(matches[0]);
    customerLookupWireActions(result, matches[0]);
  };
  input.oninput = draw;
  draw();
}
