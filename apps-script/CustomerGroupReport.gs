// Báo cáo khách hàng theo nhóm nghiệp vụ.
// File này được triển khai cùng Code.gs trong dự án Apps Script QLNHV.

// Chuan hoa ten nhom nghiep vu (va cac ten alias) de so sanh khong phan biet
// hoa/thuong, khong phan biet khoang trang thua - dung chung cho ca gia tri
// nguoi dung chon (groupName) va gia tri doc tu cot NhomNghiepVu trong TTHC.
function normalizeReportText(value) {
  return String(value == null ? '' : value).trim().toLocaleLowerCase('vi');
}

// So sanh long le hon giua cac ma khach hang: bo so 0 dau (vd "0001" -> "1")
// de van khop duoc voi du lieu cu tung bi Google Sheets tu dong doi thanh so.
function normalizeReportCustomerCode(code) {
  return String(code == null ? '' : code).trim().replace(/^0+(?=\d)/, '');
}

const CUSTOMER_GROUP_REPORT_TTHC_ALIASES = {
  'đại lý đổi ngoại tệ': ['đại lý đổi ngoại tệ', 'đổi ngoại tệ']
};

// Nguon sheet nghiep vu rieng cua tung nhom nghiep vu (neu co) KHONG con
// hardcode o day - doc truc tiep tu 2 cot SheetLienKet/CotMaKH trong chinh
// sheet NhomNghiepVu (xem SHEETS.NhomNghiepVu trong Code.gs va
// bootstrapCustomerGroupReportMapping()). Them nhom nghiep vu moi co sheet
// rieng chi can dien 2 cot do vao dong tuong ung trong NhomNghiepVu, KHONG
// can sua file nay hay deploy lai.
function customerGroupReportSourcesFor(wantedGroup) {
  const row = listRows('NhomNghiepVu').find(function(r) {
    return normalizeReportText(r.TenNhom) === wantedGroup;
  });
  if (!row) return [];
  const sheetName = String(row.SheetLienKet || '').trim();
  const field = String(row.CotMaKH || '').trim();
  if (!sheetName || !field) return [];
  return [{sheet: sheetName, field: field}];
}

function addCustomerGroupReportCode(value, exactCodes, comparableCodes) {
  const code = normalizeRecordIdValue(value).trim();
  if (!code) return;
  exactCodes[code] = true;
  comparableCodes[normalizeReportCustomerCode(code)] = true;
}

function addCustomerGroupCodesFromSheet(ss, source, exactCodes, comparableCodes) {
  const sheet = ss.getSheetByName(source.sheet);
  const cfg = SHEETS[source.sheet];
  if (!sheet || !cfg || sheet.getLastRow() < 2) return;
  const headers = getLiveHeaders(sheet, cfg);
  const column = headers.indexOf(source.field);
  if (column === -1) return;
  sheet.getRange(2, column + 1, sheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .forEach(function(row) {
      addCustomerGroupReportCode(row[0], exactCodes, comparableCodes);
    });
}

function getCustomerGroupReport(groupName) {
  const wantedGroup = normalizeReportText(groupName);
  if (!wantedGroup) throw new Error('Thiếu nhóm nghiệp vụ');

  const ss = getDatabaseSpreadsheet();
  const customerSheet = ss.getSheetByName('KhachHang');
  if (!customerSheet) throw new Error('Không tìm thấy bảng KhachHang');

  const exactCodes = {};
  const comparableCodes = {};
  const wantedTthcGroups = CUSTOMER_GROUP_REPORT_TTHC_ALIASES[wantedGroup] || [wantedGroup];
  const wantedTthcLookup = {};
  wantedTthcGroups.forEach(function(name) {
    wantedTthcLookup[normalizeReportText(name)] = true;
  });

  // Nguồn 1: các hồ sơ có thủ tục thuộc nhóm nghiệp vụ đã chọn.
  const procedureCodes = {};
  const tthcSheet = ss.getSheetByName('TTHC');
  if (tthcSheet && tthcSheet.getLastRow() >= 2) {
    const headers = getLiveHeaders(tthcSheet, SHEETS.TTHC);
    const codeCol = headers.indexOf('MaTTHC');
    const groupCol = headers.indexOf('NhomNghiepVu');
    if (codeCol !== -1 && groupCol !== -1) {
      const firstCol = Math.min(codeCol, groupCol);
      const width = Math.abs(codeCol - groupCol) + 1;
      tthcSheet.getRange(2, firstCol + 1, tthcSheet.getLastRow() - 1, width)
        .getDisplayValues()
        .forEach(function(row) {
          const code = normalizeRecordIdValue(row[codeCol - firstCol]).trim();
          const group = normalizeReportText(row[groupCol - firstCol]);
          if (code && wantedTthcLookup[group]) procedureCodes[code] = true;
        });
    }
  }

  const hoSoSheet = ss.getSheetByName('HoSo');
  if (Object.keys(procedureCodes).length && hoSoSheet && hoSoSheet.getLastRow() >= 2) {
    const headers = getLiveHeaders(hoSoSheet, SHEETS.HoSo);
    const customerCol = headers.indexOf('MaKH');
    const procedureCol = headers.indexOf('MaTTHC');
    if (customerCol !== -1 && procedureCol !== -1) {
      const firstCol = Math.min(customerCol, procedureCol);
      const width = Math.abs(customerCol - procedureCol) + 1;
      hoSoSheet.getRange(2, firstCol + 1, hoSoSheet.getLastRow() - 1, width)
        .getDisplayValues()
        .forEach(function(row) {
          const procedureCode = normalizeRecordIdValue(row[procedureCol - firstCol]).trim();
          if (procedureCodes[procedureCode]) {
            addCustomerGroupReportCode(row[customerCol - firstCol], exactCodes, comparableCodes);
          }
        });
    }
  }

  // Nguồn 2: danh sách tổng trong các bảng nghiệp vụ. Mỗi bảng có thể chứa
  // dữ liệu cũ được nhập trực tiếp, không có hồ sơ TTHC tương ứng.
  customerGroupReportSourcesFor(wantedGroup).forEach(function(source) {
    addCustomerGroupCodesFromSheet(ss, source, exactCodes, comparableCodes);
  });

  // Chỉ sau khi có tập mã tổng mới match với danh mục KhachHang. Nhờ vậy mỗi
  // khách hàng xuất hiện một lần dù có nhiều hồ sơ hoặc nhiều bản ghi nghiệp vụ.
  return listRowsFromSheet('KhachHang', customerSheet).filter(function(customer) {
    const code = normalizeRecordIdValue(customer.MaKH).trim();
    return !!exactCodes[code] || !!comparableCodes[normalizeReportCustomerCode(code)];
  });
}
