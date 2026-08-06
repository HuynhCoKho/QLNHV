(function () {
  const PASSWORD_HASH = '192ac13b114660e9a02b15f0f548d85fc88169a57f21c8860dad7ff549b8501b';
  const SESSION_KEY = 'qlnhv-auth-ok';
  // Mật khẩu đã nhập đúng cũng chính là mã xác thực gửi kèm mọi request lên
  // Apps Script (xem TOKEN_KEY trong app.js). Nhờ vậy API không còn mở công
  // khai cho bất kỳ ai biết URL — phải qua đúng màn hình nhập mật khẩu này.
  const TOKEN_KEY = 'qlnhv-auth-token';

  async function clearLegacyCaches() {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('qlnhv-')).map(key => caches.delete(key)));
  }

  async function sha256Hex(value) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function unlock(boot) {
    document.body.classList.remove('auth-locked');
    const gate = document.getElementById('authGate');
    if (gate) gate.setAttribute('hidden', '');
    boot();
  }

  window.QLNHVAuth = {
    start(boot) {
      clearLegacyCaches().catch(() => {});
      // Yêu cầu có cả TOKEN_KEY: phiên cũ trước khi thêm mã xác thực API sẽ
      // không có token, bắt nhập lại mật khẩu một lần thay vì gọi API lỗi.
      if (sessionStorage.getItem(SESSION_KEY) === '1' && sessionStorage.getItem(TOKEN_KEY)) {
        unlock(boot);
        return;
      }

      const form = document.getElementById('authForm');
      const input = document.getElementById('authPassword');
      const error = document.getElementById('authError');
      const toggle = document.getElementById('authToggle');

      if (!form || !input) {
        boot();
        return;
      }

      toggle.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggle.textContent = isPassword ? 'Ẩn' : 'Hiện';
        toggle.setAttribute('aria-label', isPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
        input.focus();
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.textContent = '';
        const submit = form.querySelector('.auth-submit');
        submit.disabled = true;
        submit.textContent = 'Đang kiểm tra...';

        try {
          const value = input.value.trim();
          const hash = await sha256Hex(value);
          if (hash !== PASSWORD_HASH) {
            error.textContent = 'Mật khẩu chưa đúng. Vui lòng thử lại.';
            input.select();
            return;
          }
          sessionStorage.setItem(SESSION_KEY, '1');
          sessionStorage.setItem(TOKEN_KEY, value);
          unlock(boot);
        } catch (err) {
          error.textContent = 'Trình duyệt không hỗ trợ kiểm tra mật khẩu.';
        } finally {
          submit.disabled = false;
          submit.textContent = 'Mở khóa';
        }
      });
    }
  };
})();