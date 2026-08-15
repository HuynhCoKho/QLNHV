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

function customerLookupSectionHtml(title, rows, emptyText, theadHtml, rowFn) {
  return `<div class="card customer-lookup-section">
    <h3>${esc(title)} (${rows.length})</h3>
    ${rows.length
      ? `<div class="table-wrap"><table><thead><tr>${theadHtml}</tr></thead><tbody>${rows.map(rowFn).join('')}</tbody></table></div>`
      : `<div class="empty-state"><p class="muted">${esc(emptyText)}</p></div>`}
  </div>`;
}

function customerLookupLoanStatusBadge(row) {
  return row['HẾT NỢ']
    ? '<span class="badge badge-neutral">Đã hết nợ</span>'
    : '<span class="badge badge-amber">Còn dư nợ</span>';
}

function renderCustomerLookupDetail(customer) {
  const ma = String(customer.MaKH);
  const loans = DB.Khoanvay.filter(r => String(r['MÃ KH']) === ma);
  const lendings = DB.ChoVay.filter(r => String(r['MÃ KH']) === ma);
  const accounts = DB.TKNHTONN.filter(r => String(r['MÃ ĐƠN VỊ']) === ma);
  const investmentIds = new Set(DB.DTRNNN_NDT.filter(r => String(r['MÃ KH']) === ma).map(r => r['RECORD ID']));
  const investments = DB.DTRNNN.filter(p => investmentIds.has(p['RECORD ID']));
  const cambodia = DB.Campuchia.filter(r => String(r['MÃ KH']) === ma)
    .sort((a, b) => String(b['KỲ BC'] || '').localeCompare(String(a['KỲ BC'] || '')));
  const violations = DB.VPHC.filter(r => String(r['MÃ KH']) === ma);
  const totalActivities = loans.length + lendings.length + accounts.length + investments.length + cambodia.length + violations.length;

  const header = `<div class="card customer-lookup-header">
    <div class="detail-grid">
      <div class="detail-row"><div class="detail-label">Mã khách hàng</div><div class="detail-value mono">${esc(ma)}</div></div>
      <div class="detail-row"><div class="detail-label">Tên khách hàng</div><div class="detail-value"><b>${esc(customer.TenKhachHang)}</b></div></div>
      <div class="detail-row"><div class="detail-label">Số định danh / MST</div><div class="detail-value mono">${esc(customer.MaDinhDanh) || '—'}</div></div>
      <div class="detail-row"><div class="detail-label">Địa chỉ</div><div class="detail-value">${esc(tkntCustomerAddress(customer)) || '—'}</div></div>
      <div class="detail-row"><div class="detail-label">Điện thoại / Email</div><div class="detail-value">${[customer.SoDienThoai, customer.Email].filter(Boolean).map(esc).join(' · ') || '—'}</div></div>
    </div>
    <div class="stats-bar"><div class="stat-chip stat-total">Tổng số hoạt động ngoại hối: <b>${totalActivities}</b></div></div>
  </div>`;

  const loanSection = customerLookupSectionHtml('Khoản vay nước ngoài', loans,
    'Khách hàng chưa có khoản vay nước ngoài.',
    '<th>Mã khoản vay</th><th>Số VBXN</th><th>Ngày VBXN</th><th>Kim ngạch vay</th><th>Đồng tiền</th><th>Dư nợ</th><th>Tình trạng</th>',
    r => `<tr><td class="mono">${esc(r['MÃ SỐ KV'])}</td><td>${esc(r['SỐ VBXN'])}</td><td class="mono">${esc(r['NGÀY VBXN'])}</td><td class="num">${fmtNum(r['KIM NGẠCH VAY'])}</td><td class="mono">${esc(r['ĐỒNG TIỀN'])}</td><td class="num">${fmtNum(r['DƯ NỢ'])}</td><td>${customerLookupLoanStatusBadge(r)}</td></tr>`);

  const lendingSection = customerLookupSectionHtml('Cho vay ra nước ngoài', lendings,
    'Khách hàng chưa có khoản cho vay ra nước ngoài.',
    '<th>Mã khoản cho vay</th><th>Số VBXN</th><th>Ngày VBXN</th><th>Kim ngạch vay</th><th>Nguyên tệ</th><th>Dư nợ</th><th>Tình trạng</th>',
    r => `<tr><td class="mono">${esc(r['MÃ SỐ KHOẢN CHO VAY'])}</td><td>${esc(r['SỐ VBXN'])}</td><td class="mono">${esc(r['NGÀY VBXN'])}</td><td class="num">${fmtNum(r['KIM NGẠCH VAY'])}</td><td class="mono">${esc(r['NGUYÊN TỆ'])}</td><td class="num">${fmtNum(r['DƯ NỢ'])}</td><td>${customerLookupLoanStatusBadge(r)}</td></tr>`);

  const accountSection = customerLookupSectionHtml('Tài khoản ngoại tệ ở nước ngoài', accounts,
    'Khách hàng chưa mở tài khoản ngoại tệ ở nước ngoài.',
    '<th>Mã TKNT</th><th>Số tài khoản</th><th>Nguyên tệ</th><th>Quốc gia</th><th>Ngân hàng</th><th>Trạng thái</th>',
    r => `<tr><td class="mono">${esc(r['MÃ TKNT'])}</td><td class="mono">${esc(r['SỐ TÀI KHOẢN'])}</td><td class="mono">${esc(r['NGUYÊN TỆ'])}</td><td>${esc(qgName(r['QUỐC GIA']))}</td><td>${esc(r['NGÂN HÀNG'])}</td><td>${tkntStatusBadge(r['TRẠNG THÁI'])}</td></tr>`);

  const investmentSection = customerLookupSectionHtml('Đầu tư ra nước ngoài', investments,
    'Khách hàng chưa có dự án đầu tư ra nước ngoài.',
    '<th>Mã dự án</th><th>Tên dự án</th><th>Quốc gia</th><th>Tổng vốn đầu tư (USD)</th><th>Vốn đã chuyển ra (USD)</th><th>Trạng thái</th>',
    p => `<tr><td class="mono">${esc(p['MÃ DỰ ÁN'])}</td><td>${esc(p['TÊN DỰ ÁN'])}</td><td>${esc(p['QUỐC GIA'])}</td><td class="num">${fmtNum(p['TỔNG VỐN ĐẦU TƯ (USD)'])}</td><td class="num">${fmtNum(p['VỐN CHUYỂN RA (USD)'])}</td><td>${esc(p['TRẠNG THÁI'])}</td></tr>`);

  const cambodiaSection = customerLookupSectionHtml('Thanh toán với Campuchia', cambodia,
    'Khách hàng chưa có báo cáo thanh toán với Campuchia.',
    '<th>Kỳ báo cáo</th><th>Hình thức</th><th>Loại</th><th>Số tiền (USD)</th>',
    r => `<tr><td class="mono">${esc(r['KỲ BC'])}</td><td>${esc(r['Hình thức'])}</td><td>${esc(r.LoaiID)}</td><td class="num">${fmtNum(r['SỐ TIỀN (USD)'])}</td></tr>`);

  const violationSection = customerLookupSectionHtml('Xử lý vi phạm hành chính', violations,
    'Khách hàng chưa có hồ sơ xử lý vi phạm hành chính.',
    '<th>Mã hồ sơ VP</th><th>Nhóm nghiệp vụ</th><th>Loại xử lý</th><th>Số tiền phạt</th><th>Trạng thái</th>',
    r => `<tr><td class="mono">${esc(r['MÃ HỒ SƠ VI PHẠM'])}</td><td>${esc(r['NHÓM NV'])}</td><td>${esc(r['LOẠI XỬ LÝ'])}</td><td class="num">${fmtNum(r['SỐ TIỀN PHẠT'])}</td><td>${esc(r['TRẠNG THÁI'])}</td></tr>`);

  return header + loanSection + lendingSection + accountSection + investmentSection + cambodiaSection + violationSection;
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
  };
  input.oninput = draw;
  draw();
}
