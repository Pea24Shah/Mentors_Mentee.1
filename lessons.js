/**
 * Lessons and attendance. Staff click a matched person's name to record that
 * they came to a lesson that has already been held.
 */

(function () {
    const { esc, fmt, api } = MM;
    let data = null;
    let selected = null;   // lesson number

    const $ = id => document.getElementById(id);

    function showError(message) {
        const box = $('lessonError');
        box.textContent = message;
        box.hidden = !message;
    }

    function render() {
        const people = data.people;
        const held = data.lessons.filter(l => l.held);
        const first = data.lessons[0];
        const last = data.lessons[data.lessons.length - 1];

        $('lessonRange').textContent = first ? `${fmt(first.date)} – ${fmt(last.date)}` : 'Who attended each lesson';
        [...$('cadence').children].forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.c) === data.cadence));

        if (!held.length) {
            $('lessonSummary').textContent = '';
            $('lessonList').innerHTML = data.lessons.map(l =>
                `<div class="lesson-btn"><span class="eyebrow">Lesson ${l.n} · ${esc(fmt(l.date))}</span><span class="t">Lesson ${l.n}</span><span class="row"><span>Upcoming</span></span></div>`).join('');
            $('lessonDetail').innerHTML = `<div class="empty"><b>Lessons start ${esc(first ? fmt(first.date) : '')}.</b><br>Once a lesson has been held, click each matched person who came to record their attendance.</div>`;
            return;
        }

        if (!held.some(l => l.n === selected)) selected = held[held.length - 1].n;
        const checkIns = held.reduce((sum, l) => sum + l.attended.length, 0);
        const different = new Set(held.flatMap(l => l.attended)).size;
        $('lessonSummary').textContent = `${checkIns} check-ins · ${different} different people`;

        $('lessonList').innerHTML = data.lessons.map(l => {
            const pct = people.length ? Math.round(l.attended.length / people.length * 100) : 0;
            return `<button type="button" class="lesson-btn" aria-pressed="${l.n === selected}" data-n="${l.n}" ${l.held ? '' : 'disabled'}>` +
                `<span class="eyebrow">Lesson ${l.n} · ${esc(fmt(l.date))}</span><span class="t">Lesson ${l.n}</span>` +
                (l.held
                    ? `<span class="row"><span>${l.attended.length} of ${people.length} attended</span><span class="tnum">${pct}%</span></span><span class="meter"><i style="width:${pct}%"></i></span>`
                    : '<span class="row"><span>Upcoming</span></span>') +
                '</button>';
        }).join('');

        const lesson = data.lessons.find(l => l.n === selected);
        if (!people.length) {
            $('lessonDetail').innerHTML = '<div class="empty"><b>Nobody is matched yet.</b><br>Attendance is tracked for matched people. Match students on the Match review tab first.</div>';
            return;
        }

        const sorted = [...people].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
        const attended = new Set(lesson.attended);
        $('lessonDetail').innerHTML =
            `<h3>Lesson ${lesson.n}</h3>` +
            `<div class="muted" style="margin-bottom:10px">${esc(fmt(lesson.date))} · ${attended.size} of ${people.length} attended. Click a name to mark them as attended, or click again to undo.</div>` +
            `<div class="names-grid">${sorted.map(p =>
                `<button type="button" class="who" aria-pressed="${attended.has(p.id)}" data-id="${esc(p.id)}">` +
                `<span>${esc(p.name)}</span><span class="chip ${p.role}">${p.role === 'mentor' ? 'Mentor' : 'Mentee'}</span></button>`).join('')}</div>`;
    }

    async function send(path, body) {
        showError('');
        try {
            const { ok, data: payload } = await api(path, body);
            if (!ok) { showError(payload.error || 'Could not save that.'); return; }
            data = payload;
            render();
            MM.refresh();
        } catch (err) {
            if (err.message !== 'Signed out') showError('Could not reach the server. Make sure it is running (node server.js).');
        }
    }

    $('cadence').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button) send('/api/console/cadence', { days: Number(button.dataset.c) }).then(() => { selected = null; render(); MM.refresh(); });
    });

    $('lessonList').addEventListener('click', event => {
        const button = event.target.closest('button[data-n]');
        if (!button || button.disabled) return;
        selected = Number(button.dataset.n);
        render();
    });

    $('lessonDetail').addEventListener('click', event => {
        const button = event.target.closest('button.who');
        if (!button) return;
        const lesson = data.lessons.find(l => l.n === selected);
        send('/api/console/attendance', {
            date: lesson.date,
            personId: button.dataset.id,
            attended: button.getAttribute('aria-pressed') !== 'true'
        });
    });

    (async function load() {
        try {
            const { ok, data: payload } = await api('/api/console/lessons');
            if (!ok) throw new Error('load failed');
            data = payload;
            render();
        } catch (err) {
            if (err.message !== 'Signed out') showError('Could not load lessons. Make sure the server is running (node server.js).');
        }
    })();
})();
