// Bao cao tinh hinh mo va su dung tai khoan o nuoc ngoai tai mot ngay chot.
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
    const activeNow = norm(account['TRẠNG THÁI']) === 'ĐANG HOẠT ĐỘNG';
    return (activeNow && (!closed || closed > cutoff)) || (!!closed && closed > cutoff);
  }

  function provinceName(customer){
    const raw = String(customer && customer.DiaChiTinhTP || 'Chưa xác định').trim();
    const known = DB.TinhThanh.find(t => provinceKey(t.TenTinh) === provinceKey(raw));
    return known ? known.TenTinh : raw;
  }

  function buildTKNTSnapshotReport(cutoffValue){
    const cutoff = dateAtEnd(cutoffValue);
    if (!cutoff) throw new Error('Ngày chốt không hợp lệ.');
    const byProvince = new Map();
    DB.TKNHTONN.filter(a => accountExistsAt(a, cutoff)).forEach(account => {
      const customer = DB.KhachHang.find(k => String(k.MaKH) === String(account['MÃ ĐƠN VỊ']));
      if (!customer) return;
      const province = provinceName(customer);
      if (!byProvince.has(province)) byProvince.set(province, {province, companies:new Set(), countries:new Set()});
      const row = byProvince.get(province);
      row.companies.add(String(customer.MaKH));
      const country = String(account['QUỐC GIA'] || '').trim();
      if (country) row.countries.add(country);
    });
    const preferred = v => provinceKey(v).includes('dong nai') ? 0 : provinceKey(v).includes('ho chi minh') ? 1 : 2;
    const rows = [...byProvince.values()].map(x => ({province:x.province, companies:x.companies.size, countries:x.countries.size}))
      .sort((a,b) => preferred(a.province)-preferred(b.province) || a.province.localeCompare(b.province,'vi'));
    return {cutoff, rows, companyTotal:rows.reduce((n,x)=>n+x.companies,0), countryTotal:rows.reduce((n,x)=>n+x.countries,0)};
  }

  function reportHeader(){
    return `<div class="snapshot-head"><div>NGÂN HÀNG NHÀ NƯỚC<br>VIỆT NAM<br><b>CHI NHÁNH KHU VỰC 2</b><br><b class="under">PHÒNG QUẢN LÝ NGOẠI HỐI VÀNG</b></div><div><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b class="under">Độc lập - Tự do - Hạnh phúc</b></div></div>`;
  }
  function tableHtml(result){
    return `<table class="snapshot-table"><thead><tr><th>Địa bàn</th><th>Số doanh nghiệp</th><th>Số quốc gia</th></tr></thead><tbody>${result.rows.map(x=>`<tr><td>${esc(x.province)}</td><td class="num">${x.companies}</td><td class="num">${x.countries}</td></tr>`).join('')}<tr class="total"><td>TỔNG CỘNG</td><td class="num">${result.companyTotal}</td><td class="num">${result.countryTotal}</td></tr></tbody></table>`;
  }
  function reportDocument(result, maker, forOffice=false){
    const now = new Date();
    return `${reportHeader()}<div class="snapshot-title">TÌNH HÌNH MỞ VÀ SỬ DỤNG TÀI KHOẢN Ở NƯỚC NGOÀI</div><div class="snapshot-intro">Tính đến ngày ${vnDate(result.cutoff)}, số doanh nghiệp có mở tài khoản ngoại tệ tại nước ngoài đang hoạt động theo thống kê của NHNN CN KV2 như sau:</div>${tableHtml(result)}<div class="snapshot-date">Thành phố Hồ Chí Minh, ngày ${String(now.getDate()).padStart(2,'0')} tháng ${String(now.getMonth()+1).padStart(2,'0')} năm ${now.getFullYear()}</div><div class="snapshot-sign"><b>NGƯỜI LẬP BIỂU</b><strong>${esc(maker)}</strong></div>`;
  }
  function reportCss(){return `body{font:14px "Times New Roman",serif;color:#111;margin:0}.snapshot-page{width:210mm;min-height:297mm;padding:16mm 18mm;box-sizing:border-box}.snapshot-head{display:grid;grid-template-columns:1fr 1fr;text-align:center;line-height:1.35;font-size:12px}.under{display:inline-block}.under:after{content:"";display:block;border-top:1px solid #111;width:90%;margin:2px auto}.snapshot-title{text-align:center;font-size:17px;font-weight:bold;margin:24px 0 8px}.snapshot-intro{text-align:justify;font-size:15px;line-height:1.45;margin:0 0 10px}.snapshot-table{width:78%;margin:0 auto;border-collapse:collapse}.snapshot-table th,.snapshot-table td{border:1px solid #111;padding:6px 10px}.snapshot-table th{text-align:center}.snapshot-table .num{text-align:right}.snapshot-table .total{font-weight:bold}.snapshot-table .total td:first-child{text-align:center}.snapshot-date{text-align:right;font-style:italic;margin-top:28px}.snapshot-sign{width:42%;margin-left:auto;text-align:center;margin-top:8px}.snapshot-sign strong{display:block;margin-top:62px}.snapshot-preview .snapshot-head{display:none}.snapshot-preview .snapshot-title{margin-top:0}`}

  function downloadBlob(name, type, content){
    const blob=new Blob([content],{type}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportExcel(result){
    const html=`<html><head><meta charset="utf-8"></head><body><table><tr><th colspan="3">NGÂN HÀNG NHÀ NƯỚC VIỆT NAM - CHI NHÁNH KHU VỰC 2</th></tr><tr><th colspan="3">PHÒNG QUẢN LÝ NGOẠI HỐI VÀNG</th></tr><tr><th colspan="3">TÌNH HÌNH MỞ VÀ SỬ DỤNG TÀI KHOẢN Ở NƯỚC NGOÀI</th></tr><tr><td colspan="3">Tính đến ngày ${vnDate(result.cutoff)}</td></tr><tr></tr><tr><th style="border:1px solid #000">Địa bàn</th><th style="border:1px solid #000">Số doanh nghiệp</th><th style="border:1px solid #000">Số quốc gia</th></tr>${result.rows.map(x=>`<tr><td style="border:1px solid #000">${esc(x.province)}</td><td style="border:1px solid #000">${x.companies}</td><td style="border:1px solid #000">${x.countries}</td></tr>`).join('')}<tr><th style="border:1px solid #000">TỔNG CỘNG</th><th style="border:1px solid #000">${result.companyTotal}</th><th style="border:1px solid #000">${result.countryTotal}</th></tr></table></body></html>`;
    downloadBlob(`Tinh_hinh_TKNN_${safeName(vnDate(result.cutoff))}.xls`,'application/vnd.ms-excel;charset=utf-8','\ufeff'+html);
  }
  function exportWord(result,maker){
    const html=`<!doctype html><html><head><meta charset="utf-8"><style>${reportCss()}</style></head><body><div class="snapshot-page">${reportDocument(result,maker,true)}</div></body></html>`;
    downloadBlob(`Tinh_hinh_TKNN_${safeName(vnDate(result.cutoff))}.doc`,'application/msword;charset=utf-8','\ufeff'+html);
  }
  function exportPdf(result,maker){
    const node=document.createElement('div');node.className='snapshot-page';node.innerHTML=`<style>${reportCss()}</style>${reportDocument(result,maker)}`;node.style.background='#fff';document.body.appendChild(node);
    const done=()=>node.remove();
    html2pdf().set({margin:0,filename:`Tinh_hinh_TKNN_${safeName(vnDate(result.cutoff))}.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(node).save().then(done,done);
  }

  window.openTKNTSnapshotPrompt=function(){
    const options=DB.ChuyenVien.slice().sort((a,b)=>String(a.HoTen).localeCompare(String(b.HoTen),'vi')).map(x=>`<option value="${esc(x.MaCV+' — '+x.HoTen)}"></option>`).join('');
    openModal('Báo cáo tình hình mở và sử dụng tài khoản',`<form id="snapshotForm"><div class="form-grid"><div class="field"><label>Ngày chốt *</label><input type="date" name="cutoff" required></div><div class="field"><label>Chuyên viên lập báo cáo *</label><input name="maker" list="snapshotMakerList" placeholder="Gõ mã hoặc tên chuyên viên" required><datalist id="snapshotMakerList">${options}</datalist></div></div><div class="modal-foot"><button type="button" class="btn btn-outline" id="snapshotCancel">Hủy</button><button class="btn btn-primary">Xem báo cáo</button></div></form>`,el=>{
      el.querySelector('[name=cutoff]').value=new Date().toISOString().slice(0,10);
      el.querySelector('#snapshotCancel').onclick=closeModal;
      el.querySelector('form').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),maker=cvName(lookupCode(fd.get('maker')));if(!maker)return toast('Vui lòng chọn đúng chuyên viên từ danh sách.',true);openTKNTSnapshotReport(fd.get('cutoff'),maker)};
    });
  };
  window.openTKNTSnapshotReport=function(cutoff,maker){
    const result=buildTKNTSnapshotReport(cutoff);
    openModal('Tình hình mở và sử dụng tài khoản đến '+vnDate(result.cutoff),`<div class="snapshot-preview"><div class="snapshot-title">TÌNH HÌNH MỞ VÀ SỬ DỤNG TÀI KHOẢN Ở NƯỚC NGOÀI</div><div class="snapshot-intro">Tính đến ngày ${vnDate(result.cutoff)}, số doanh nghiệp có tài khoản ở nước ngoài còn hiệu lực: <b>${result.companyTotal}</b>; số quốc gia tương ứng: <b>${result.countryTotal}</b>.</div>${tableHtml(result)}</div><div class="modal-foot"><button class="btn btn-outline" id="snapshotClose">Đóng</button><button class="btn btn-outline" id="snapshotExcel">Xuất Excel</button><button class="btn btn-outline" id="snapshotWord">Xuất Word</button><button class="btn btn-primary" id="snapshotPdf">Xuất PDF</button></div>`,el=>{
      el.querySelector('#snapshotClose').onclick=closeModal;el.querySelector('#snapshotExcel').onclick=()=>exportExcel(result);el.querySelector('#snapshotWord').onclick=()=>exportWord(result,maker);el.querySelector('#snapshotPdf').onclick=()=>exportPdf(result,maker);
    });
  };
})();
