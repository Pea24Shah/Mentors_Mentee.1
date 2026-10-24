/**
 * Staff sign-in page. On success the server sets a session cookie and we go to
 * the page the person was trying to reach (or the review page).
 */

(function () {
    const form = document.getElementById('loginForm');
    const errorBox = form.querySelector('.form-error');
    const button = form.querySelector('button[type="submit"]');

    // Only these pages can be the destination, so the link can't send staff elsewhere
    const ALLOWED_NEXT = ['/review.html', '/matches.html', '/dashboard.html', '/staff-orientation.html', '/participants.html',
        '/lessons.html', '/homework.html', '/analytics.html'];
    const requested = new URLSearchParams(window.location.search).get('next');
    const destination = ALLOWED_NEXT.includes(requested) ? requested : '/review.html';

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = !message;
    }

    // Already signed in? Go straight to the staff pages.
    fetch('/api/session', { cache: 'no-store' })
        .then(response => response.json())
        .then(data => { if (data.signedIn) window.location.replace(destination); })
        .catch(() => {});

    form.addEventListener('submit', async event => {
        event.preventDefault();
        showError('');
        button.disabled = true;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: form.elements.username.value.trim(),
                    password: form.elements.password.value
                })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                showError(data.error || 'Could not sign in.');
                form.elements.password.value = '';
                form.elements.password.focus();
                return;
            }
            window.location.assign(destination);
        } catch (err) {
            showError('Could not reach the server. Make sure it is running (node server.js).');
        } finally {
            button.disabled = false;
        }
    });
})();
