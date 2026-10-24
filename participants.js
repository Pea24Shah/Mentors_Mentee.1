/**
 * Participants: everyone who filled out a survey, with their match, lesson
 * attendance and homework result. Built from the saved responses.
 */

(function () {
    const { esc, fmt, api } = MM;
    let data = null;
    let roleFilter = 'all';

    // Homework pass mark is shared with the Homework page
    const passMark = () => parseFloat(localStorage.getItem('mm.hwRule')) || 1;

    function matchedWithCell(p) {
        if (p.match) {
            return `${esc(p.match.partner)} <span class="muted tnum">${p.match.percentage}%</span>`;
        }
        return p.status === 'in-review'
            ? '<span class="chip pending">In review</span>'
            : '<span class="muted">Not matched</span>';
    }

    function render() {
        const held = data.lessons.filter(l => l.held);
        const firstLesson = data.lessons[0] ? fmt(data.lessons[0].date) : '';

        document.getElementById('rosterNote').innerHTML = held.length
            ? '<b>Lessons attended</b> shows each lesson held so far: a filled square means the person came, a dashed square is a lesson not held yet. ' +
              '<b>Attendance rate</b> is the share of lessons held so far that the person attended. ' +
              '<b>Homework</b> is pass or fail based on the prework and postwork turned in; see the Homework tab for details.'
            : 'Match percentages are visible to staff only. <b>Attendance rate</b> fills in once lessons start ' + esc(firstLesson) +
              ': it is the share of lessons held so far that each person attended.';

        const rows = data.people
            .filter(p => roleFilter === 'all' || p.role === roleFilter)
            .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

        document.getElementById('rosterEmpty').hidden = data.people.length > 0;
        document.getElementById('rosterWrap').hidden = data.people.length === 0;

        document.getElementById('rosterBody').innerHTML = rows.map(p => {
            let lessonsCell, rateCell, hwCell = '<span class="muted">—</span>';

            if (!held.length) {
                lessonsCell = `<span class="muted">Starts ${esc(firstLesson)}</span>`;
                rateCell = '<span class="muted">—</span>';
            } else if (!p.match) {
                lessonsCell = '<span class="muted">Not in program</span>';
                rateCell = '<span class="muted">—</span>';
            } else {
                const attended = held.filter(l => p.attendedDates.includes(l.date)).length;
                const dots = data.lessons.map(l =>
                    `<i class="${l.held ? (p.attendedDates.includes(l.date) ? 'on' : '') : 'up'}" title="Lesson ${l.n}, ${esc(fmt(l.date))}"></i>`).join('');
                lessonsCell = `<span class="dots" aria-hidden="true">${dots}</span> <span class="tnum">${attended} of ${held.length}</span>`;
                rateCell = `${Math.round(attended / held.length * 100)}%`;

                if (p.homework) {
                    const { due, done } = p.homework;
                    const chip = !due ? '<span class="pf na">N/A</span>'
                        : done / due >= passMark() - 1e-9 ? '<span class="pf pass">PASS</span>' : '<span class="pf fail">FAIL</span>';
                    hwCell = `${chip} <span class="muted tnum">${done}/${due}</span>`;
                }
            }

            const roleChip = `<span class="chip ${p.role}">${p.role === 'mentor' ? 'Mentor' : 'Mentee'}</span>`;
            return `<tr><td><b>${esc(p.name)}</b></td><td>${roleChip}</td><td>${esc(p.field)}</td>` +
                `<td class="tnum">${esc(fmt(p.joined))}</td><td>${matchedWithCell(p)}</td><td>${lessonsCell}</td>` +
                `<td class="n">${rateCell}</td><td>${hwCell}</td></tr>`;
        }).join('');
    }

    document.getElementById('roleFilter').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        roleFilter = button.dataset.r;
        [...document.getElementById('roleFilter').children].forEach(b => b.setAttribute('aria-pressed', b === button));
        render();
    });

    (async function load() {
        try {
            const { ok, data: payload } = await api('/api/console/participants');
            if (!ok) throw new Error('load failed');
            data = payload;
            render();
        } catch (err) {
            if (err.message === 'Signed out') return;
            document.getElementById('rosterNote').textContent = 'Could not load participants. Make sure the server is running (node server.js).';
        }
    })();
})();
