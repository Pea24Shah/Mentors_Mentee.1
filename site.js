/**
 * Shared navigation behavior for every page.
 *  - Marks the link for the current page.
 *  - Shows "Staff sign in" for visitors, or the staff links and "Sign out" once
 *    signed in. (The server enforces access. This only changes what is shown.)
 */

(function () {
    const slot = document.getElementById('staffNav');
    const nav = document.querySelector('.site-nav');
    if (!nav) return;

    const normalize = path => (path === '/' ? '/index.html' : path);

    // Every page of the staff console counts as "Staff console" in the main nav
    const STAFF_PAGES = ['/review.html', '/matches.html', '/dashboard.html', '/staff-orientation.html', '/participants.html',
        '/lessons.html', '/homework.html', '/analytics.html'];

    function markCurrent() {
        nav.querySelectorAll('a').forEach(link => {
            if (link.dataset.staffConsole) {
                if (STAFF_PAGES.includes(window.location.pathname.split)) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
                return;
            }
            const url = new URL(link.href);
            const samePage = normalize(url.pathname) === normalize(window.location.pathname);
            // Survey links differ only by ?role=, so compare that too
            const sameQuery = !url.search || url.search === window.location.search;
            if (samePage && sameQuery) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
    }

    const makeLink = (href, text, className) => {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = text;
        if (className) link.className = className;
        return link;
    };

    async function signOut() {
        try {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
        } finally {
            window.location.assign('./index.html');
        }
    }

    async function renderStaffNav() {
        if (!slot) return;

        let signedIn = false;
        try {
            const response = await fetch('/api/session', { cache: 'no-store' });
            signedIn = (await response.json()).signedIn === true;
        } catch (err) {
            // Offline or server stopped: show the signed-out links
        }

        const divider = document.createElement('span');
        divider.className = 'nav-divider';
        divider.setAttribute('aria-hidden', 'true');

        if (signedIn) {
            const signOutButton = document.createElement('button');
            signOutButton.type = 'button';
            signOutButton.className = 'link-btn';
            signOutButton.textContent = 'Sign out';
            signOutButton.addEventListener('click', signOut);
            const consoleLink = makeLink('/review.html', 'Staff console');
            consoleLink.dataset.staffConsole = 'true';
            slot.replaceChildren(divider, consoleLink, signOutButton);
        } else {
            slot.replaceChildren(divider, makeLink('./login.html', 'Staff sign in', 'btn-signin'));
        }
        markCurrent();
    }

    markCurrent();
    renderStaffNav();
})();
