/**
 * Shared shell for every staff page: the section tabs, the program timeline and
 * the summary numbers. Everything comes from /api/console/summary, which is built
 * from the saved survey responses and matches. Pages can call MM.refresh() after
 * they change something so the numbers stay current.
 */

(function () {
    const TABS = [
        ['/staff-orientation.html', 'Orientation'],
        ['/review.html', 'Match review'],
        ['/matches.html', 'Matches'],
        ['/participants.html', 'Participants'],
        ['/lessons.html', 'Lessons & attendance'],
        ['/homework.html', 'Homework'],
        ['/analytics.html', 'Analytics'],
        ['/dashboard.html', 'Results']
    ];

    const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /** "2026-11-22" -> "Nov 22" */
    const fmt = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    /** GET when body is undefined, otherwise POST JSON. Signed-out staff are sent to the sign-in page. */
    async function api(path, body) {
        const options = body === undefined
            ? { cache: 'no-store' }
            : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
        const response = await fetch(path, options);

        if (response.status === 401) {
            window.location.assign(`/login.html?next=${encodeURIComponent(window.location.pathname)}`);
            throw new Error('Signed out');
        }
        return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
    }

    // ---------- tabs ----------

    const tabsEl = document.getElementById('consoleTabs');
    if (tabsEl) {
        tabsEl.setAttribute('aria-label', 'Staff sections');
        tabsEl.innerHTML = `<div class="wrap">${TABS.map(([href, label]) =>
            `<a href="${href}"${window.location.pathname === href ? ' aria-current="page"' : ''} data-tab="${href}">${esc(label)}</a>`).join('')}</div>`;
    }

    // ---------- timeline and numbers ----------

    const STATE_LABEL = { done: 'Done', now: 'Happening now', next: 'Upcoming' };

    function renderTimeline(s) {
        const el = document.getElementById('timeline');
        if (!el) return;
        const p = s.program;
        const stages = [
            ['apps', 'Applications', `${fmt(p.appsOpen)} – ${fmt(p.appsClose)}`, 'Students and professionals sign up'],
            ['review', 'Staff match review', `${fmt(p.reviewOpen)} – ${fmt(p.reviewClose)}`, 'Accept or deny matches'],
            ['emails', 'Match emails', fmt(p.reviewClose), s.emailsSentAt ? `Sent ${fmt(s.emailsSentAt)}` : 'Sent by staff when review is done'],
            ['lessons', 'Lessons', `${fmt(p.lessonStart)} – ${fmt(s.lastLesson)}`, `${s.lessonCount} lessons, ${s.cadence === 7 ? 'every week' : 'every 2 weeks'}`],
            ['end', 'Program ends', fmt(p.programEnd), 'Final attendance report']
        ];
        el.innerHTML = stages.map(([key, title, dates, detail]) => {
            const state = s.stages[key];
            return `<div class="stage ${state}"><div class="t">${esc(title)}</div><div class="d">${esc(dates)}</div>` +
                `<div class="d">${esc(detail)}</div><div class="state">${STATE_LABEL[state]}</div></div>`;
        }).join('');
    }

    function renderTiles(s) {
        const el = document.getElementById('stripKpis');
        if (!el) return;
        const c = s.counts;
        const closeLabel = fmt(s.program.appsClose);
        const tiles = [
            ['Total people', c.people, `${c.students} students · ${c.mentors} professionals`],
            c.applicationsClosed
                ? ['Applications', 'Closed', `closed ${closeLabel}`, false, true]
                : ['Joined this week', c.joinedThisWeek, `applications close ${closeLabel}`],
            ['Matches', c.matches, `of ${c.students} student${c.students === 1 ? '' : 's'}`, false, c.matches === 0],
            ['Awaiting review', c.awaitingReview, c.awaitingReview ? 'students need a staff decision' : 'nobody is waiting', c.awaitingReview > 0, c.awaitingReview === 0],
            ['Total attendance', c.lessonsHeld ? c.checkIns : '—', c.lessonsHeld ? `check-ins across ${c.lessonsHeld} lesson${c.lessonsHeld > 1 ? 's' : ''}` : `lessons start ${fmt(s.program.lessonStart)}`, false, !c.lessonsHeld],
            ['Attendance rate', c.attendanceRate === null ? '—' : `${c.attendanceRate}%`, c.lessonsHeld ? 'of matched people, per lesson' : `lessons start ${fmt(s.program.lessonStart)}`, false, c.attendanceRate === null]
        ];
        el.innerHTML = tiles.map(([label, value, sub, attn, dim]) =>
            `<div class="tile${attn ? ' attn' : ''}"><div class="l">${esc(label)}</div><div class="v${dim ? ' dim' : ''}">${esc(value)}</div><div class="s">${esc(sub)}</div></div>`).join('');

        // Waiting count on the Match review tab
        const tab = tabsEl && tabsEl.querySelector('[data-tab="/review.html"]');
        if (tab) {
            tab.querySelector('.count')?.remove();
            if (c.awaitingReview > 0) tab.insertAdjacentHTML('beforeend', `<span class="count tnum">${c.awaitingReview}</span>`);
        }
    }

    let latest = null;

    async function refresh() {
        try {
            const { ok, data } = await api('/api/console/summary');
            if (!ok) return null;
            latest = data;
            renderTimeline(data);
            renderTiles(data);
            return data;
        } catch (err) {
            return null;
        }
    }

    window.MM = { esc, fmt, api, refresh, summary: () => latest };
    refresh();
})();
