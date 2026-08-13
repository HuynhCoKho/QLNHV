// Báo cáo khách hàng theo nhóm nghiệp vụ.
// File này được triển khai cùng Code.gs trong dự án Apps Script QLNHV.

const CUSTOMER_GROUP_REPORT_SOURCES = {
  'campuchia': [
    {sheet: 'Campuchia', field: 'MÃ KH'}
  ],
  'tài khoản ngoại tệ ở nước ngoài': [
    {sheet: 'TKNHTONN', field: 'MÃ ĐƠN VỊ'}
  ],
  'vay, trả nợ nước ngoài': [
    {sheet: 'Khoanvay', field: 'MÃ KH'}
  ],
  'cho vay ra nước ngoài': [
    {sheet: 'ChoVay', field: 'MÃ KH'}
  ],
  'đầu tư ra nước ngoài': [
    {sheet: 'DTRNNN_NDT', field: 'MÃ KH'}
  ]
};

const CUSTOMER_GROUP_REPORT_TTHC_ALIASES = {
  'đại lý đổi ngoại tệ': ['đại lý đổi ngoại tệ', 'đổi ngoại tệ']
};

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
  (CUSTOMER_GROUP_REPORT_SOURCES[wantedGroup] || []).forEach(function(source) {
    addCustomerGroupCodesFromSheet(ss, source, exactCodes, comparableCodes);
  });

  // Chỉ sau khi có tập mã tổng mới match với danh mục KhachHang. Nhờ vậy mỗi
  // khách hàng xuất hiện một lần dù có nhiều hồ sơ hoặc nhiều bản ghi nghiệp vụ.
  return listRowsFromSheet('KhachHang', customerSheet).filter(function(customer) {
    const code = normalizeRecordIdValue(customer.MaKH).trim();
    return !!exactCodes[code] || !!comparableCodes[normalizeReportCustomerCode(code)];
  });
}
