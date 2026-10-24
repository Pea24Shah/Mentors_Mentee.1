/**
 * Homework completion for matched mentees. Prework is due the day before each
 * lesson and postwork 3 days after. Staff click a cell to record that the work
 * was turned in. Pass or fail is based on completion only.
 */

(function () {
    const { esc, fmt, api } = MM;
    let data = null;
    let filter = 'all';
    let passMark = parseFloat(localStorage.getItem('mm.hwRule')) || 1;

    const $ = id => document.getElementById(id);

    function showError(message) {
        const box = $('hwError');
        box.textContent = message;
        box.hidden = !message;
    }

    function resultFor(mentee, dueList) {
        const turnedIn = new Set(mentee.turnedIn);
        const done = dueList.filter(a => turnedIn.has(a.key)).length;
        return { done, due: dueList.length, pass: dueList.length ? done / dueList.length >= passMark - 1e-9 : null };
    }

    const chip = r => r.pass === null ? '<span class="pf na">N/A</span>'
        : `<span class="pf ${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</span>`;

    function render() {
        const today = data.today;
        const assignments = data.assignments;
        const dueList = assignments.filter(a => a.due <= today);
        const mentees = [...data.mentees].sort((a, b) => a.name.localeCompare(b.name));

        $('hwRule').value = String(passMark);

        if (!mentees.length) {
            $('hwBody').innerHTML = '<div class="empty"><b>No matched students yet.</b><br>Homework is tracked for matched mentees. Match students on the Match review tab first.</div>';
            return;
        }
        if (!dueList.length) {
            $('hwBody').innerHTML = `<div class="empty"><b>No homework due yet.</b><br>Lesson 1 prework is due ${esc(fmt(assignments[0].due))}, the day before the first lesson. Pass or fail shows here once work comes due.</div>`;
            return;
        }

        const results = new Map(mentees.map(m => [m.id, resultFor(m, dueList)]));
        const failing = mentees.filter(m => results.get(m.id).pass === false).length;
        const rows = mentees.filter(m => filter === 'all' || results.get(m.id).pass === false);
        const rule = passMark === 1 ? 'every assignment' : `${Math.round(passMark * 100)}% or more of the assignments`;

        let html = `<div class="hw-sum">
            <div><div class="v" style="color:var(--sjsu-blue)">${mentees.length - failing}</div><div class="l">passing</div></div>
            <div><div class="v" style="color:var(--c-bad)">${failing}</div><div class="l">failing</div></div>
            <div><div class="v">${mentees.length}</div><div class="l">matched mentees</div></div></div>
            <p class="tbl-note"><b>Pass or fail is based on completion only.</b> Each lesson has prework (due the day before) and postwork (due 3 days after). A mentee passes if they turned in ${rule} due so far. Work that isn't due yet doesn't count. Click a cell to record that the work was turned in, or click again to undo.</p>
            <div class="tbl-wrap" tabindex="0" role="region" aria-label="Homework completion. Scroll to see more columns."><table class="console-table"><thead><tr><th>Mentee</th>` +
            assignments.map(a => `<th class="c" title="Due ${esc(fmt(a.due))}">${esc(a.label)}<br><span style="text-transform:none;letter-spacing:0">${esc(fmt(a.due))}</span></th>`).join('') +
            '<th class="n">Turned in</th><th>Result</th></tr></thead><tbody>';

        html += rows.length ? rows.map(m => {
            const r = results.get(m.id);
            const turnedIn = new Set(m.turnedIn);
            const cells = assignments.map(a => {
                if (a.due > today) return '<td class="c"><span class="mark later" title="Not due yet">·</span></td>';
                const yes = turnedIn.has(a.key);
                return `<td class="c"><button type="button" class="mark ${yes ? 'yes' : 'no'}" data-student="${esc(m.id)}" data-key="${esc(a.key)}" data-yes="${yes}" ` +
                    `aria-label="${esc(m.name)}, ${esc(a.label)}: ${yes ? 'turned in. Click to undo' : 'not turned in. Click to record it as turned in'}">${yes ? '✓' : '✗'}</button></td>`;
            }).join('');
            return `<tr><td><b>${esc(m.name)}</b></td>${cells}<td class="n">${r.done}/${r.due}</td><td>${chip(r)}</td></tr>`;
        }).join('') : `<tr><td colspan="${assignments.length + 3}" class="muted" style="text-align:center;padding:20px">Every mentee is passing.</td></tr>`;

        $('hwBody').innerHTML = html + '</tbody></table></div>';
    }

    $('hwBody').addEventListener('click', async event => {
        const button = event.target.closest('button.mark');
        if (!button) return;
        showError('');
        try {
            const { ok, data: payload } = await api('/api/console/homework', {
                studentId: button.dataset.student,
                key: button.dataset.key,
                submitted: button.dataset.yes !== 'true'
            });
            if (!ok) { showError(payload.error || 'Could not save that.'); return; }
            data = payload;
            render();
        } catch (err) {
            if (err.message !== 'Signed out') showError('Could not reach the server. Make sure it is running (node server.js).');
        }
    });

    $('hwRule').addEventListener('change', event => {
        passMark = Number(event.target.value);
        localStorage.setItem('mm.hwRule', String(passMark));
        render();
    });

    $('hwFilter').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        filter = button.dataset.h;
        [...$('hwFilter').children].forEach(b => b.setAttribute('aria-pressed', b === button));
        render();
    });

    (async function load() {
        try {
            const { ok, data: payload } = await api('/api/console/homework');
            if (!ok) throw new Error('load failed');
            data = payload;
            render();
        } catch (err) {
            if (err.message !== 'Signed out') showError('Could not load homework. Make sure the server is running (node server.js).');
        }
    })();
})();
