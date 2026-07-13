(function () {
  const PASSWORD_HASH = '6ed57ffc3cfbdc4ff0405a5e06f252709bbd91a6a1539d946f1b63bd3a1a7311';
  const SESSION_KEY = 'qlnhv-auth-ok';

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
      if (sessionStorage.getItem(SESSION_KEY) === '1') {
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
          const hash = await sha256Hex(input.value.trim());
          if (hash !== PASSWORD_HASH) {
            error.textContent = 'Mật khẩu chưa đúng. Vui lòng thử lại.';
            input.select();
            return;
          }
          sessionStorage.setItem(SESSION_KEY, '1');
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