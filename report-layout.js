// Chuẩn hóa phần đầu các mẫu báo cáo trên màn hình.
function normalizeReportLayout() {
  document.querySelectorAll('.quarter-report-title span').forEach(span => {
    if (!span.textContent.includes('· Đơn vị:') || span.dataset.normalized) return;
    const parts = span.textContent.split('· Đơn vị:');
    span.textContent = parts[0].trim();
    span.classList.add('report-period');
    span.dataset.normalized = '1';
    const unit = document.createElement('div');
    unit.className = 'report-unit';
    unit.textContent = 'Đơn vị tính: ' + parts[1].trim();
    span.closest('.quarter-report-title').insertAdjacentElement('afterend', unit);
  });
}
new MutationObserver(normalizeReportLayout).observe(document.getElementById('modalRoot'), {childList:true,subtree:true});
