// Bao cao tinh hinh mo va su dung tai khoan o nuoc ngoai: 2 phan.
// 1) Tinh hinh giai quyet TTHC lien quan (theo khoang ngay) - lay tu Ho So.
// 2) Tinh hinh tai khoan con hieu luc tai 1 ngay chot - lay tu TKNHTONN.
(function(){
  const norm = v => String(v || '').trim().toUpperCase();
  const dateAtEnd = v => {
    const iso = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(+iso[1], +iso[2]-1, +iso[3], 23, 59, 59);
    return typeof parseTKNTVNDate === 'function' ? parseTKNTVNDate(v) : null;
  };
  const vnDate = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const safeName = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_');

  function accountExistsAt(account, cutoff){
    const licensed = dateAtEnd(toISODate(account['NGÀY GP']));
    if (!licensed || licensed > cutoff) return false;
    const closed = dateAtEnd(toISODate(account['NGÀY ĐÓNG']));
    const status = norm(account['TRẠNG THÁI']);
    const reportableNow = status === 'ĐANG HOẠT ĐỘNG' || status === 'CHƯA MỞ';
    return (reportableNow && (!closed || closed > cutoff)) || (!!closed && closed > cutoff);
  }

  function provinceName(customer){
    const raw = String(customer && customer.DiaChiTinhTP || 'Chưa xác định').trim();
    const known = DB.TinhThanh.find(t => provinceKey(t.TenTinh) === provinceKey(raw));
    return known ? known.TenTinh : raw;
  }

  function buildTKNTSnapshotReport(cutoffValue){
    const cutoff = dateAtEnd(cutoffValue);
    if (!cutoff) throw new Error('Ngày chốt không hợp lệ.');
    const byProvince = new Map(), allCountries = new Set();
    DB.TKNHTONN.filter(a => accountExistsAt(a, cutoff)).forEach(account => {
      const customer = DB.KhachHang.find(k => String(k.MaKH) === String(account['MÃ ĐƠN VỊ']));
      if (!customer) return;
      const province = provinceName(customer);
      if (!byProvince.has(province)) byProvince.set(province, {province, companies:new Set(), countries:new Set()});
      const row = byProvince.get(province);
      row.companies.add(String(customer.MaKH));
      const country = String(account['QUỐC GIA'] || '').trim();
      if (country) { row.countries.add(country); allCountries.add(country); }
    });
    const preferred = v => provinceKey(v).includes('dong nai') ? 0 : provinceKey(v).includes('ho chi minh') ? 1 : 2;
    const rows = [...byProvince.values()].map(x => ({province:x.province, companies:x.companies.size, countries:x.countries.size}))
      .sort((a,b) => preferred(a.province)-preferred(b.province) || a.province.localeCompare(b.province,'vi'));
    // Tong cong quoc gia dem theo ma quoc gia duy nhat tren toan bao cao.
    // Vi du Cuba o ca TP.HCM va Dong Nai chi tinh mot lan.
    return {cutoff, rows, companyTotal:rows.reduce((n,x)=>n+x.companies,0), countryTotal:allCountries.size};
  }

  // Cac sheet can cho phan thong ke TTHC nhung khong nam trong ROUTE_SHEETS
  // cua trang TKNT (HoSo ~15.000 dong khong tai khi vao trang, chi tai khi
  // nguoi dung thuc su mo bao cao nay).
  async function ensureTKNTProcedureData(){
    const missing = ['TTHC','HoSo'].filter(s => !LOADED_SHEETS.has(s));
    if (!missing.length) return;
    const bundle = await apiGet('batchList', {sheets: missing.join(',')});
    missing.forEach(s => { DB[s] = Array.isArray(bundle[s]) ? bundle[s] : []; LOADED_SHEETS.add(s); });
    normalizeIds();
  }

  function inDateRange(vnDateStr, fromISO, toISO){
    const t = typeof parseVNDateSort === 'function' ? parseVNDateSort(vnDateStr) : 0;
    if (!t) return false;
    const from = fromISO ? new Date(fromISO + 'T00:00:00').getTime() : -Infinity;
    const to = toISO ? new Date(toISO + 'T23:59:59').getTime() : Infinity;
    return t >= from && t <= to;
  }

  // Nhom nghiep vu lien quan doc dong tu sheet TTHC (khong hardcode ma TTHC) -
  // moi thu tuc thuoc nhom "Tài khoản ngoại tệ ở nước ngoài" deu duoc thong
  // ke, du sau nay co them/bot thu tuc trong danh muc cung khong can sua code.
  function tkntRelatedProcedures(){
    return DB.TTHC.filter(t => String(t.NhomNghiepVu || '').trim() === 'Tài khoản ngoại tệ ở nước ngoài')
      .sort((a,b) => String(a.MaTTHC).localeCompare(String(b.MaTTHC)));
  }

  // Voi moi thu tuc, lay cac ho so DA XU LY trong khoang ngay (theo Ngay van
  // ban - chinh la van ban tra loi xac nhan hoac tu choi). Quoc gia/Muc dich
  // lay tu tai khoan ngoai te tuong ung (doi chieu So van ban = So GP), chi
  // co du lieu neu ho so do thuc su duoc cap phep (da tao tai khoan).
  function buildTKNTProcedureStats(fromISO, toISO){
    return tkntRelatedProcedures().map(t => {
      const dossiers = DB.HoSo.filter(h => String(h.MaTTHC) === String(t.MaTTHC) && h.TrangThai === 'Đã xử lý' && inDateRange(h.NgayVanBan, fromISO, toISO))
        .sort((a,b) => parseVNDateSort(a.NgayVanBan) - parseVNDateSort(b.NgayVanBan));
      const rows = dossiers.map(h => {
        const customer = DB.KhachHang.find(k => String(k.MaKH) === String(h.MaKH));
        const account = DB.TKNHTONN.find(a => String(a['MÃ ĐƠN VỊ']) === String(h.MaKH) && String(a['SỐ GP'] || '').trim() === String(h.SoVanBan || '').trim() && String(h.SoVanBan || '').trim());
        return {
          maKH: h.MaKH,
          company: customer ? customer.TenKhachHang : (h.MaKH || 'Chưa xác định'),
          soGiayPhep: h.SoVanBan,
          ngayGiayPhep: h.NgayVanBan,
          quocGia: account ? qgName(account['QUỐC GIA']) : '',
          mucDich: account ? account['MỤC ĐÍCH'] : ''
        };
      });
      return {maTTHC: t.MaTTHC, tenTTHC: t.TenTTHC, rows};
    });
  }

  function procedureStatsHtml(procStats, fromISO, toISO){
    const intro = `<div class="snapshot-intro">Tình hình thực hiện thủ tục hành chính từ ngày ${esc(toVNDate(fromISO))} đến ngày ${esc(toVNDate(toISO))}:</div>`;
    const blocks = procStats.map(s => {
      if (!s.rows.length) return `<div class="snapshot-proc-empty">Thủ tục ${esc(s.tenTTHC)} (${esc(s.maTTHC)}): không phát sinh</div>`;
      return `<div class="snapshot-proc">
        <div class="snapshot-proc-title">Thủ tục ${esc(s.tenTTHC)} (${esc(s.maTTHC)}):</div>
        <table class="snapshot-table snapshot-proc-table"><thead><tr><th>TT</th><th>Doanh nghiệp</th><th>Số giấy phép</th><th>Ngày giấy phép</th><th>Quốc gia</th><th>Mục đích</th></tr></thead>
        <tbody>${s.rows.map((r,i) => `<tr><td class="num">${i+1}</td><td>${esc(r.company)}<div class="muted">${esc(r.maKH)}</div></td><td>${esc(r.soGiayPhep)}</td><td>${esc(r.ngayGiayPhep)}</td><td>${esc(r.quocGia) || '—'}</td><td>${esc(r.mucDich) || '—'}</td></tr>`).join('')}</tbody></table>
      </div>`;
    }).join('');
    return intro + blocks;
  }

  // Dung <table> thay vi CSS grid: Word (xuat .doc dang HTML) khong hieu
  // display:grid, se lam 2 khoi header/footer bi vo bo cuc. <table> la cach
  // duy nhat vua chay dung tren trinh duyet (xem/in/PDF) vua chay dung tren
  // Word.
  function reportHeader(){
    return `<table class="snapshot-head" align="center"><tr><td>NGÂN HÀNG NHÀ NƯỚC<br>VIỆT NAM<br><b>CHI NHÁNH KHU VỰC 2</b><br><b class="under">PHÒNG QUẢN LÝ NGOẠI HỐI VÀNG</b></td><td><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b class="under">Độc lập - Tự do - Hạnh phúc</b></td></tr></table>`;
  }
  // align="center" (thuoc tinh HTML cu) de Word can giua bang - CSS
  // margin:auto khong duoc Word ton trong du van chay dung tren trinh duyet.
  function tableHtml(result){
    return `<table class="snapshot-table" align="center"><thead><tr><th>Địa bàn</th><th>Số doanh nghiệp</th><th>Số quốc gia</th></tr></thead><tbody>${result.rows.map(x=>`<tr><td>${esc(x.province)}</td><td class="num">${x.companies}</td><td class="num">${x.countries}</td></tr>`).join('')}<tr class="total"><td>TỔNG CỘNG</td><td class="num">${result.companyTotal}</td><td class="num">${result.countryTotal}</td></tr></tbody></table>`;
  }
  function reportDocument(result, maker, forOffice=false){
    const now = new Date();
    return `${reportHeader()}<div class="snapshot-title">TÌNH HÌNH MỞ VÀ SỬ DỤNG TÀI KHOẢN Ở NƯỚC NGOÀI</div>${procedureStatsHtml(result.procStats, result.fromISO, result.cutoffISO)}<div class="snapshot-intro">Tính đến ngày ${vnDate(result.cutoff)}, số doanh nghiệp có mở tài khoản ngoại tệ tại nước ngoài đang hoạt động theo thống kê của NHNN CN KV2 như sau:</div>${tableHtml(result)}<div class="snapshot-date">Thành phố Hồ Chí Minh, ngày ${String(now.getDate()).padStart(2,'0')} tháng ${String(now.getMonth()+1).padStart(2,'0')} năm ${now.getFullYear()}</div><div class="snapshot-sign"><b>NGƯỜI LẬP BIỂU</b><strong>${esc(maker)}</strong></div>`;
  }
  function reportCss(){return `body{font:14px "Times New Roman",serif;color:#111;margin:0}.snapshot-page{width:210mm;min-height:297mm;padding:16mm 18mm;box-sizing:border-box}.snapshot-head{width:100%;border-collapse:collapse;text-align:center;line-height:1.35;font-size:12px}.snapshot-head td{border:0;padding:0;vertical-align:top;width:50%}.under{display:inline-block}.under:after{content:"";display:block;border-top:1px solid #111;width:90%;margin:2px auto}.snapshot-title{text-align:center;font-size:17px;font-weight:bold;margin:24px 0 8px}.snapshot-intro{text-align:justify;font-size:15px;line-height:1.45;margin:0 0 10px}.snapshot-proc{margin:0 0 12px}.snapshot-proc-title{font-size:15px;font-weight:bold;margin:0 0 4px}.snapshot-proc-empty{font-size:15px;margin:0 0 10px}.snapshot-proc-table{width:100%!important;margin:0 0 12px!important}.snapshot-proc-table .muted{font-size:11px;color:#555;font-weight:normal}.snapshot-table{width:78%;margin:0 auto 2px;border-collapse:collapse;border:1px solid #111;outline:1px solid #111;outline-offset:-1px}.snapshot-table th,.snapshot-table td{border:1px solid #111;padding:6px 10px}.snapshot-table tbody tr:last-child td{border-bottom:2px solid #111}.snapshot-table th{text-align:center}.snapshot-table .num{text-align:right}.snapshot-table .total{font-weight:bold}.snapshot-table .total td:first-child{text-align:center}.snapshot-date{text-align:right;font-style:italic;margin-top:28px}.snapshot-sign{width:42%;margin-left:auto;text-align:center;margin-top:8px}.snapshot-sign strong{display:block;margin-top:62px}.snapshot-preview .snapshot-head{display:none}.snapshot-preview .snapshot-title{margin-top:0}`}

  function downloadBlob(name, type, content){
    const blob=new Blob([content],{type}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function procedureStatsExcelRows(procStats, fromISO, toISO){
    const rows = [`<tr><td colspan="6">Tình hình thực hiện thủ tục hành chính từ ngày ${esc(toVNDate(fromISO))} đến ngày ${esc(toVNDate(toISO))}:</td></tr>`];
    procStats.forEach(s => {
      if (!s.rows.length) { rows.push(`<tr><td colspan="6">Thủ tục ${esc(s.tenTTHC)} (${esc(s.maTTHC)}): không phát sinh</td></tr>`); return; }
      rows.push(`<tr><td colspan="6"><b>Thủ tục ${esc(s.tenTTHC)} (${esc(s.maTTHC)})</b></td></tr>`);
      rows.push(`<tr><th style="border:1px solid #000">TT</th><th style="border:1px solid #000">Doanh nghiệp</th><th style="border:1px solid #000">Mã KH</th><th style="border:1px solid #000">Số giấy phép</th><th style="border:1px solid #000">Ngày giấy phép</th><th style="border:1px solid #000">Quốc gia</th><th style="border:1px solid #000">Mục đích</th></tr>`);
      s.rows.forEach((r,i) => rows.push(`<tr><td style="border:1px solid #000">${i+1}</td><td style="border:1px solid #000">${esc(r.company)}</td><td style="border:1px solid #000">${esc(r.maKH)}</td><td style="border:1px solid #000">${esc(r.soGiayPhep)}</td><td style="border:1px solid #000">${esc(r.ngayGiayPhep)}</td><td style="border:1px solid #000">${esc(r.quocGia)}</td><td style="border:1px solid #000">${esc(r.mucDich)}</td></tr>`));
    });
    rows.push('<tr></tr>');
    return rows.join('');
  }
  function exportExcel(result){
    const html=`<html><head><meta charset="utf-8"></head><body><table><tr><th colspan="6">NGÂN HÀNG NHÀ NƯỚC VIỆT NAM - CHI NHÁNH KHU VỰC 2</th></tr><tr><th colspan="6">PHÒNG QUẢN LÝ NGOẠI HỐI VÀNG</th></tr><tr><th colspan="6">TÌNH HÌNH MỞ VÀ SỬ DỤNG TÀI KHOẢN Ở NƯỚC NGOÀI</th></tr><tr></tr>${procedureStatsExcelRows(result.procStats,result.fromISO,result.cutoffISO)}<tr><td colspan="6">Tính đến ngày ${vnDate(result.cutoff)}</td></tr><tr></tr><tr><th style="border:1px solid #000">Địa bàn</th><th style="border:1px solid #000">Số doanh nghiệp</th><th style="border:1px solid #000">Số quốc gia</th></tr>${result.rows.map(x=>`<tr><td style="border:1px solid #000">${esc(x.province)}</td><td style="border:1px solid #000">${x.companies}</td><td style="border:1px solid #000">${x.countries}</td></tr>`).join('')}<tr><th style="border:1px solid #000">TỔNG CỘNG</th><th style="border:1px solid #000">${result.companyTotal}</th><th style="border:1px solid #000">${result.countryTotal}</th></tr></table></body></html>`;
    downloadBlob(`Tinh_hinh_TKNN_${safeName(vnDate(result.cutoff))}.xls`,'application/vnd.ms-excel;charset=utf-8','﻿'+html);
  }
  function exportWord(result,maker){
    const html=`<!doctype html><html><head><meta charset="utf-8"><style>${reportCss()}</style></head><body><div class="snapshot-page">${reportDocument(result,maker,true)}</div></body></html>`;
    downloadBlob(`Tinh_hinh_TKNN_${safeName(vnDate(result.cutoff))}.doc`,'application/msword;charset=utf-8','﻿'+html);
  }
  function exportPdf(result,maker){
    const node=document.createElement('div');node.className='snapshot-page';node.innerHTML=`<style>${reportCss()}</style>${reportDocument(result,maker)}`;
    // html2canvas chup theo vi tri hien thi thuc te: neu khong ghim goc
    // trai-tren, node se bi cac CSS can giua o ngoai (vd body flex) day
    // lech, sinh khoang trang lon quanh trang PDF. KHONG dung z-index am -
    // de node ngoai man hinh (left am) thay vi day xuong duoi cac lop khac,
    // tranh bi cac phan tu khac (modal, sidebar...) de len tren khi chup.
    node.style.cssText='position:absolute;left:-9999px;top:0;background:#fff';
    document.body.appendChild(node);
    const done=()=>node.remove();
    html2pdf().set({margin:0,filename:`Tinh_hinh_TKNN_${safeName(vnDate(result.cutoff))}.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy'],avoid:'tr'}}).from(node).save().then(done,done);
  }
  function printReport(result,maker){
    const popup=window.open('','_blank');
    if(!popup){toast('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up.',true);return;}
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tinh hinh TKNN ${safeName(vnDate(result.cutoff))}</title><style>${reportCss()}</style></head><body><div class="snapshot-page">${reportDocument(result,maker,true)}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  window.openTKNTSnapshotPrompt=async function(){
    const options=DB.ChuyenVien.slice().sort((a,b)=>String(a.HoTen).localeCompare(String(b.HoTen),'vi')).map(x=>`<option value="${esc(x.MaCV+' — '+x.HoTen)}"></option>`).join('');
    openModal('Báo cáo tình hình mở và sử dụng tài khoản',`<form id="snapshotForm"><div class="form-grid"><div class="field"><label>Từ ngày *</label><input type="date" name="from" required></div><div class="field"><label>Đến ngày (ngày chốt) *</label><input type="date" name="cutoff" required></div><div class="field span-2"><label>Chuyên viên lập báo cáo *</label><input name="maker" list="snapshotMakerList" placeholder="Gõ mã hoặc tên chuyên viên" required><datalist id="snapshotMakerList">${options}</datalist></div></div><div class="modal-foot"><button type="button" class="btn btn-outline" id="snapshotCancel">Hủy</button><button class="btn btn-primary" id="snapshotView">Xem báo cáo</button></div></form>`,el=>{
      const today=new Date();
      el.querySelector('[name=cutoff]').value=today.toISOString().slice(0,10);
      const from=new Date(today);from.setDate(from.getDate()-30);
      el.querySelector('[name=from]').value=from.toISOString().slice(0,10);
      el.querySelector('#snapshotCancel').onclick=closeModal;
      el.querySelector('form').onsubmit=async e=>{
        e.preventDefault();
        const btn=el.querySelector('#snapshotView'),oldLabel=btn.textContent;
        btn.disabled=true;btn.textContent='Đang tổng hợp…';
        try{
          const fd=new FormData(e.target),maker=cvName(lookupCode(fd.get('maker')));
          if(!maker)throw new Error('Vui lòng chọn đúng chuyên viên từ danh sách.');
          const fromISO=fd.get('from'),cutoffISO=fd.get('cutoff');
          if(fromISO>cutoffISO)throw new Error('Từ ngày không được lớn hơn đến ngày.');
          await ensureTKNTProcedureData();
          openTKNTSnapshotReport(cutoffISO,maker,fromISO);
        }catch(err){toast(err.message,true);btn.disabled=false;btn.textContent=oldLabel;}
      };
    });
  };
  window.openTKNTSnapshotReport=function(cutoff,maker,fromISO){
    const result=buildTKNTSnapshotReport(cutoff);
    result.fromISO=fromISO;
    result.cutoffISO=cutoff;
    result.procStats=buildTKNTProcedureStats(fromISO,cutoff);
    openModal('Tình hình mở và sử dụng tài khoản đến '+vnDate(result.cutoff),`<div class="snapshot-preview">${procedureStatsHtml(result.procStats,fromISO,cutoff)}<div class="snapshot-title">TÌNH HÌNH MỞ VÀ SỬ DỤNG TÀI KHOẢN Ở NƯỚC NGOÀI</div><div class="snapshot-intro">Tính đến ngày ${vnDate(result.cutoff)}, số doanh nghiệp có tài khoản ở nước ngoài còn hiệu lực: <b>${result.companyTotal}</b>; số quốc gia tương ứng: <b>${result.countryTotal}</b>.</div>${tableHtml(result)}</div><div class="modal-foot"><button class="btn btn-outline" id="snapshotClose">Đóng</button><button class="btn btn-outline" id="snapshotExcel">Xuất Excel</button><button class="btn btn-outline" id="snapshotWord">Xuất Word</button><button class="btn btn-outline" id="snapshotPrint">In trực tiếp</button><button class="btn btn-primary" id="snapshotPdf">Xuất PDF</button></div>`,el=>{
      el.querySelector('#snapshotClose').onclick=closeModal;el.querySelector('#snapshotExcel').onclick=()=>exportExcel(result);el.querySelector('#snapshotWord').onclick=()=>exportWord(result,maker);el.querySelector('#snapshotPrint').onclick=()=>printReport(result,maker);el.querySelector('#snapshotPdf').onclick=()=>exportPdf(result,maker);
    });
  };
})();
