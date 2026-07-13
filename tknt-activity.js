// Báo cáo tình hình hoạt động tài khoản ngoại tệ ở nước ngoài theo kỳ, quy USD.
function buildTKNTActivityReport(period) {
  const provinces = new Map(), missingRates = new Set();
  const fields = ['THU','CHI','CUỐI KỲ VP','CUỐI KỲ VAY','CUỐI KỲ HĐ'];
  DB.BCMoTKnTONN.filter(r => String(r['KỲ BÁO CÁO']) === String(period)).forEach(report => {
    const account = DB.TKNHTONN.find(a => String(a['MÃ TKNT']) === String(report['MÃ TKNT']));
    if (!account) return;
    const customer = DB.KhachHang.find(k => String(k.MaKH) === String(account['MÃ ĐƠN VỊ']));
    if (!customer) return;
    const currency = String(report['NGUYÊN TỆ'] || account['NGUYÊN TỆ'] || 'USD').toUpperCase();
    const rate = currency === 'USD' ? 1 : (rateRow(currency) && Number(rateRow(currency).TyGiaSoUSD));
    if (!rate) { missingRates.add(currency); return; }
    const rawProvince = customer.DiaChiTinhTP || 'Chưa xác định';
    const known = DB.TinhThanh.find(t => provinceKey(t.TenTinh) === provinceKey(rawProvince));
    const province = known ? known.TenTinh : rawProvince;
    if (!provinces.has(province)) provinces.set(province, new Map());
    const companies = provinces.get(province), id = String(customer.MaKH);
    if (!companies.has(id)) companies.set(id, {customer,thu:0,chi:0,vp:0,vay:0,hd:0,accounts:new Set()});
    const item = companies.get(id), vals = fields.map(f => tkntAmount(report[f]) / rate);
    item.thu += vals[0]; item.chi += vals[1]; item.vp += vals[2]; item.vay += vals[3]; item.hd += vals[4];
    item.accounts.add(String(account['MÃ TKNT']));
  });
  const groups = [...provinces.entries()].map(([province,companies]) => ({
    province,
    companies:[...companies.values()].sort((a,b) => String(a.customer.TenKhachHang).localeCompare(String(b.customer.TenKhachHang),'vi'))
  })).sort((a,b) => a.province.localeCompare(b.province,'vi'));
  return {groups, missingRates:[...missingRates]};
}

function activitySum(rows) {
  return rows.reduce((s,x) => { ['thu','chi','vp','vay','hd'].forEach(k => s[k] += x[k]); return s; }, {thu:0,chi:0,vp:0,vay:0,hd:0});
}
function activityCells(x) {
  return `<td class="num mono">${tkntMillion(x.thu)}</td><td class="num mono">${tkntMillion(x.chi)}</td><td class="num mono">${tkntMillion(x.vp)}</td><td class="num mono">${tkntMillion(x.vay)}</td><td class="num mono">${tkntMillion(x.hd)}</td><td class="num mono">${tkntMillion(x.vp+x.vay+x.hd)}</td>`;
}

function openTKNTActivityPrompt() {
  openModal('Báo cáo tình hình hoạt động TKNTONN', `<form id="activityReportForm"><div class="field"><label>Kỳ báo cáo (YYYYQQ)</label><input name="period" class="mono" maxlength="6" pattern="[0-9]{4}(0[1-4])" placeholder="Ví dụ: 202601" required><span class="hint">Toàn bộ số liệu được quy đổi sang USD.</span></div><div class="modal-foot"><button type="button" class="btn btn-outline" id="cancelActivityReport">Hủy</button><button class="btn btn-primary">Xem báo cáo</button></div></form>`, el => {
    el.querySelector('#cancelActivityReport').onclick = closeModal;
    el.querySelector('form').onsubmit = e => { e.preventDefault(); openTKNTActivityReport(new FormData(e.target).get('period')); };
  });
}

function openTKNTActivityReport(period) {
  const result = buildTKNTActivityReport(period);
  if (!result.groups.length) return toast('Không có dữ liệu báo cáo kỳ ' + period, true);
  let no = 0; const all = [];
  const body = result.groups.map((g,gi) => {
    const sum = activitySum(g.companies); all.push(...g.companies);
    return `<tr class="activity-province"><td>${tkntRoman(gi)}</td><td><b>${esc(g.province)}</b></td>${activityCells(sum)}</tr>${g.companies.map(x => `<tr><td class="num">${++no}</td><td><b>${esc(x.customer.TenKhachHang)}</b><br><span class="mono muted">${esc(x.customer.MaKH)} · ${x.accounts.size} TK</span></td>${activityCells(x)}</tr>`).join('')}`;
  }).join('');
  const grand = activitySum(all);
  openModal('Tình hình hoạt động TKNTONN ' + tkntQuarterLabel(period), `<div class="quarter-report-title"><b>BÁO CÁO TÌNH HÌNH HOẠT ĐỘNG TÀI KHOẢN NGOẠI TỆ Ở NƯỚC NGOÀI</b><span>${esc(tkntQuarterLabel(period))} · Đơn vị: USD</span></div>${result.missingRates.length ? `<div class="report-warning">Không tổng hợp được nguyên tệ thiếu tỷ giá: ${esc(result.missingRates.join(', '))}</div>` : ''}<div class="table-wrap activity-report-table"><table><thead><tr><th>TT</th><th>Doanh nghiệp</th><th>Thu</th><th>Chi</th><th>CK VP</th><th>CK Vay</th><th>CK HĐ</th><th>Tổng số dư</th></tr></thead><tbody>${body}<tr class="activity-grand"><td colspan="2">TỔNG CỘNG</td>${activityCells(grand)}</tr></tbody></table></div><div class="modal-foot"><button class="btn btn-outline" id="closeActivityReport">Đóng</button><button class="btn btn-outline" id="excelActivityReport">Xuất Excel</button><button class="btn btn-primary" id="printActivityReport">In / Lưu PDF</button></div>`, el => {
    el.querySelector('#closeActivityReport').onclick = closeModal;
    el.querySelector('#excelActivityReport').onclick = () => exportTKNTActivityExcel(period,result.groups);
    el.querySelector('#printActivityReport').onclick = () => printTKNTActivityReport(period,result.groups,result.missingRates);
  });
}

function exportTKNTActivityExcel(period, groups) {
  const clean = v => String(v ?? '').replace(/\t|\r?\n/g,' ');
  const lines = [['Tỉnh/Thành phố','Mã khách hàng','Tên doanh nghiệp','Số tài khoản','Thu (USD)','Chi (USD)','CK VP (USD)','CK Vay (USD)','CK HĐ (USD)','Tổng số dư (USD)'].join('\t')];
  const all = [];
  groups.forEach(g => {
    all.push(...g.companies);
    const s = activitySum(g.companies);
    lines.push([clean(g.province),'',String(g.province).toUpperCase(),'',tkntMillion(s.thu),tkntMillion(s.chi),tkntMillion(s.vp),tkntMillion(s.vay),tkntMillion(s.hd),tkntMillion(s.vp+s.vay+s.hd)].join('\t'));
    g.companies.forEach(x => lines.push([clean(g.province),clean(x.customer.MaKH),clean(x.customer.TenKhachHang),x.accounts.size,tkntMillion(x.thu),tkntMillion(x.chi),tkntMillion(x.vp),tkntMillion(x.vay),tkntMillion(x.hd),tkntMillion(x.vp+x.vay+x.hd)].join('\t')));
  });
  const grand = activitySum(all);
  lines.push(['','','TỔNG CỘNG','',tkntMillion(grand.thu),tkntMillion(grand.chi),tkntMillion(grand.vp),tkntMillion(grand.vay),tkntMillion(grand.hd),tkntMillion(grand.vp+grand.vay+grand.hd)].join('\t'));
  const blob = new Blob(['\ufeff'+lines.join('\r\n')], {type:'application/vnd.ms-excel;charset=utf-8'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download=`Tinh_hinh_TKNT_${period}.xls`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function printTKNTActivityReport(period, groups, missingRates) {
  let no=0; const all=[];
  const rows=groups.map((g,gi)=>{const s=activitySum(g.companies);all.push(...g.companies);return `<tr class="province"><td>${tkntRoman(gi)}</td><td>${esc(String(g.province).toUpperCase())}</td>${activityCells(s)}</tr>${g.companies.map(x=>`<tr><td>${++no}</td><td>${esc(x.customer.TenKhachHang)}<br><span class="mono">${esc(x.customer.MaKH)}</span></td>${activityCells(x)}</tr>`).join('')}`;}).join('');
  const grand=activitySum(all),w=window.open('','_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tình hình TKNT ${period}</title><style>@page{size:A4 landscape;margin:10mm}body{font:10px Arial,sans-serif;color:#111}h1{text-align:center;font-size:16px;margin:0 0 5px}h2{text-align:center;font-size:13px;margin:0 0 8px}.unit{text-align:right;font-style:italic;margin:0 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #555;padding:4px;vertical-align:top}th{background:#eee}.num{text-align:right}.mono{font-family:monospace}.province{font-weight:bold;background:#dfeee8}.subtotal{font-weight:bold;background:#f3f3f3}.grand{font-weight:bold;background:#ddd}.warning{color:#a33;margin-bottom:8px}</style></head><body><h1>BÁO CÁO TÌNH HÌNH HOẠT ĐỘNG TÀI KHOẢN NGOẠI TỆ Ở NƯỚC NGOÀI</h1><h2>${esc(tkntQuarterLabel(period).toUpperCase())}</h2><div class="unit">Đơn vị tính: USD</div>${missingRates.length?`<div class="warning">Thiếu tỷ giá: ${esc(missingRates.join(', '))}</div>`:''}<table><thead><tr><th>TT</th><th>DOANH NGHIỆP</th><th>THU</th><th>CHI</th><th>CK VP</th><th>CK VAY</th><th>CK HĐ</th><th>TỔNG SỐ DƯ</th></tr></thead><tbody>${rows}<tr class="grand"><td colspan="2">TỔNG CỘNG</td>${activityCells(grand)}</tr></tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
