// ============================================
// Hills of Glory — Admin Authentication
// ============================================

(function () {
  'use strict';

  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmit');

  if (!loginForm) return;

  function showError(msg) {
    if (!loginError) return;
    loginError.textContent = msg || '';
    loginError.style.display = msg ? 'block' : 'none';
  }

  function sb() {
    return window.supabase;
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    showError('');

    // Honeypot bot trap
    const honeypot = document.getElementById('loginWebsite');
    if (honeypot && honeypot.value) return;

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    if (!sb() || typeof sb().auth === 'undefined') {
      showError('Authentication service is still loading. Please try again in a moment.');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    const { error } = await sb().auth.signInWithPassword({ email, password });

    if (error) {
      showError('Invalid credentials. Please try again.');
      console.error(error);
      if (submitBtn) submitBtn.disabled = false;
    } else {
      window.location.href = 'dashboard.html';
    }
  });

  // Redirect if already logged in
  function checkExistingSession() {
    if (!sb() || typeof sb().auth === 'undefined') {
      setTimeout(checkExistingSession, 100);
      return;
    }
    sb().auth.getSession().then(function (res) {
      if (res && res.data && res.data.session) {
        window.location.href = 'dashboard.html';
      }
    });
  }
  checkExistingSession();
})();
