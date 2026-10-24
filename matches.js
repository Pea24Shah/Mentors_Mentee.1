/**
 * Matches: every final match as a card, plus the students who have no match yet.
 *
 * Staff can fix things without starting over:
 *  - match a student who was left out, choosing from the free mentors
 *  - change a student's mentor
 *  - unmatch one pair
 *  - unmatch everyone (a backup is saved first, and Undo brings it back)
 */

(function () {
    const { esc, api } = MM;
    const $ = id => document.getElementById(id);

    let data = null;
    let view = 'pairs';            // 'pairs' or 'open' (students without a match)
    let viewChosen = false;        // once staff pick a view, don't switch it for them
    let methodFilter = 'all';
    let sortBy = 'score';
    let query = '';
    let flash = '';                // message from the last action
    let confirmingId = null;       // match id with the "unmatch this pair?" question open
    let picker = null;             // { studentId, mode: 'new' | 'change', info }

    const dateOf = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    // "match" -> "matches", everything else just adds an s
    const plural = (n, word) => `${n} ${n === 1 ? word : word.endsWith('ch') ? word + 'es' : word + 's'}`;

    function showError(message) {
        const box = $('matchError');
        box.textContent = message;
        box.hidden = !message;
    }

    // ---------- matched pairs ----------

    function confirmBlock(m) {
        const sent = MM.summary() && MM.summary().emailsSentAt;
        return `<div class="inline-confirm" role="group" aria-label="Confirm unmatching ${esc(m.student.name)} and ${esc(m.mentor.name)}">
            <p><b>Unmatch ${esc(m.student.name)} and ${esc(m.mentor.name)}?</b> Both go back into the pool.${sent ? ' Match emails were already marked as sent, so let them know.' : ''}</p>
            <label class="check"><input type="checkbox" class="block-pair" checked> Don't suggest this pair again</label>
            <div class="actions">
                <button type="button" class="btn danger small" data-act="confirm-unmatch" data-id="${esc(m.id)}">Yes, unmatch</button>
                <button type="button" class="btn small" data-act="cancel-unmatch">Cancel</button>
            </div>
        </div>`;
    }

    function card(m) {
        const pct = Math.max(0, Math.min(100, Number(m.percentage) || 0));
        const s = m.student, t = m.mentor;
        const byStaff = m.method === 'staff';
        const foot = confirmingId === m.id
            ? confirmBlock(m)
            : `<div class="mcard-foot">
                <span class="muted">Matched ${esc(dateOf(m.matchedAt))}</span>
                <span class="card-actions">
                    <button type="button" class="btn small" data-act="change" data-student="${esc(m.studentId)}" aria-label="Change mentor for ${esc(s.name)}">Change mentor</button>
                    <button type="button" class="btn small danger" data-act="unmatch" data-id="${esc(m.id)}" aria-label="Unmatch ${esc(s.name)} and ${esc(t.name)}">Unmatch</button>
                </span>
            </div>`;
        return `<article class="mcard">
            <div class="mcard-top">
                <div><span class="pct${pct < 50 ? ' low' : ''}">${pct}%</span> <span class="muted">match</span></div>
                <span class="chip ${byStaff ? 'pending' : 'matched'}">${byStaff ? 'Chosen by staff' : 'Automatic'}</span>
            </div>
            <div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div>
            <div class="pair-row">
                <div class="mperson">
                    <span class="chip mentee">Student</span>
                    <h3>${esc(s.name)}</h3>
                    <div>${esc(s.major || 'Major not given')}${s.year ? ` · ${esc(s.year)}` : ''}</div>
                    ${s.field ? `<div class="muted">${esc(s.field)}</div>` : ''}
                    <div class="muted addr">${esc(s.email)}</div>
                </div>
                <div class="pair-arrow" aria-hidden="true">→</div>
                <div class="mperson">
                    <span class="chip mentor">Mentor</span>
                    <h3>${esc(t.name)}</h3>
                    ${t.job ? `<div>${esc(t.job)}</div>` : ''}
                    ${t.expertise.length ? `<div class="muted">${esc(t.expertise.slice(0, 3).join(', '))}${t.expertise.length > 3 ? ` +${t.expertise.length - 3} more` : ''}</div>` : ''}
                    <div class="muted addr">${esc(t.email)}</div>
                </div>
            </div>
            ${foot}
        </article>`;
    }

    function visibleMatches() {
        const q = query.toLowerCase();
        const list = data.matches.filter(m =>
            (methodFilter === 'all' || m.method === methodFilter) &&
            (!q || `${m.student.name} ${m.student.email} ${m.mentor.name} ${m.mentor.email}`.toLowerCase().includes(q)));

        const byName = key => (a, b) => a[key].name.localeCompare(b[key].name);
        const sorters = {
            score: (a, b) => b.percentage - a.percentage || a.student.name.localeCompare(b.student.name),
            new: (a, b) => String(b.matchedAt).localeCompare(String(a.matchedAt)),
            student: byName('student'),
            mentor: byName('mentor')
        };
        return list.sort(sorters[sortBy]);
    }

    // ---------- students without a match ----------

    function openCard(s) {
        return `<article class="mcard open">
            <div class="mcard-top">
                <div><span class="chip mentee">Student</span></div>
                <span class="chip ${s.status === 'Waiting for staff review' || s.status === 'Waiting for automatic matching' ? 'pending' : 'none'}">${esc(s.status)}</span>
            </div>
            <div class="mperson">
                <h3>${esc(s.name)}</h3>
                <div>${esc(s.major || 'Major not given')}${s.year ? ` · ${esc(s.year)}` : ''}</div>
                ${s.field ? `<div class="muted">${esc(s.field)}</div>` : ''}
                <div class="muted addr">${esc(s.email)}</div>
            </div>
            <div class="mcard-foot">
                <span class="muted">No mentor yet</span>
                <button type="button" class="btn primary small" data-act="choose" data-student="${esc(s.id)}" aria-label="Choose a mentor for ${esc(s.name)}">Choose a mentor</button>
            </div>
        </article>`;
    }

    function visibleOpen() {
        const q = query.toLowerCase();
        return data.unmatchedStudents
            .filter(s => !q || `${s.name} ${s.email}`.toLowerCase().includes(q))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    // ---------- page ----------

    function renderSummary() {
        const list = data.matches;
        const auto = list.filter(m => m.method === 'auto').length;
        const average = list.length ? Math.round(list.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0) / list.length) : null;
        const items = [
            [list.length, 'matches'],
            [auto, 'automatic'],
            [list.length - auto, 'chosen by staff'],
            [average === null ? '—' : `${average}%`, 'average match'],
            [data.counts.studentsWithoutMatch, 'students without a match'],
            [data.counts.mentorsWithoutMatch, 'mentors without a match']
        ];
        $('matchSummary').innerHTML = items.map(([value, label]) =>
            `<div><div class="v"${label === 'matches' ? ' style="color:var(--sjsu-blue)"' : ''}>${esc(value)}</div><div class="l">${esc(label)}</div></div>`).join('');
    }

    function renderNotice() {
        const undo = data.undo;
        const box = $('notice');
        if (flash) {
            box.hidden = false;
            box.className = 'sendbar sent';
            $('noticeMsg').textContent = flash;
            $('undoBtn').hidden = !undo.available;
        } else if (undo.available) {
            box.hidden = false;
            box.className = 'sendbar';
            $('noticeMsg').textContent = `${plural(undo.removed, 'match')} removed on ${dateOf(undo.savedAt)}. A backup is saved in ${undo.file}. ` +
                'Opening Match review runs automatic matching again, so undo while this page is the last thing you did.';
            $('undoBtn').hidden = false;
        } else {
            box.hidden = true;
        }
    }

    function render() {
        const total = data.matches.length;
        const waiting = data.unmatchedStudents.length;

        // First load: if nobody is matched but some students are waiting, start on them
        if (!viewChosen) view = total === 0 && waiting > 0 ? 'open' : 'pairs';

        renderSummary();
        renderNotice();

        $('viewPairs').textContent = `Matched pairs (${total})`;
        $('viewOpen').textContent = `Without a match (${waiting})`;
        [...$('viewSwitch').children].forEach(b => b.setAttribute('aria-pressed', b.dataset.v === view));

        const pairsView = view === 'pairs';
        $('unmatchBtn').hidden = total === 0;
        $('csvLink').hidden = total === 0;
        $('methodFilter').hidden = !pairsView;
        $('matchSort').hidden = !pairsView;
        $('controls').hidden = total === 0 && waiting === 0;
        $('confirmTitle').textContent = `Unmatch all ${plural(total, 'match')}?`;
        $('matchGrid').hidden = !pairsView;
        $('openGrid').hidden = pairsView;

        if (pairsView) {
            $('openGrid').innerHTML = '';
            if (total === 0) {
                $('matchGrid').innerHTML = '';
                $('matchEmpty').hidden = false;
                $('matchEmpty').innerHTML = data.undo.available
                    ? '<b>All matches were removed.</b><br>Everyone is back in the pool. Undo above brings them back, or open <a href="/review.html">Match review</a> to run matching again.'
                    : '<b>No matches yet.</b><br>Open <a href="/review.html">Match review</a> to run automatic matching, or switch to <b>Without a match</b> to choose a mentor yourself.';
                return;
            }
            const list = visibleMatches();
            $('matchEmpty').hidden = list.length > 0;
            if (!list.length) $('matchEmpty').innerHTML = '<b>No matches fit that search.</b><br>Try a different name or filter.';
            $('matchGrid').innerHTML = list.map(card).join('');
            return;
        }

        $('matchGrid').innerHTML = '';
        const list = visibleOpen();
        $('matchEmpty').hidden = list.length > 0;
        if (!list.length) {
            $('matchEmpty').innerHTML = waiting === 0
                ? '<b>Every student has a mentor.</b>'
                : '<b>No students fit that search.</b><br>Try a different name.';
        }
        $('openGrid').innerHTML = list.map(openCard).join('');
    }

    // ---------- talking to the server ----------

    async function send(path, body) {
        showError('');
        try {
            const result = await api(path, body);
            if (!result.ok) { showError(result.data.error || 'Could not do that.'); return null; }
            return result.data;
        } catch (err) {
            if (err.message !== 'Signed out') showError('Could not reach the server. Make sure it is running (node server.js).');
            return null;
        }
    }

    function afterChange(message, newData) {
        data = newData;
        flash = message;
        confirmingId = null;
        render();
        MM.refresh();
    }

    // ---------- the mentor picker ----------

    function candidateRow(c, bestId) {
        const pct = Math.max(0, Math.min(100, Number(c.percentage) || 0));
        const chips = [
            c.current ? '<span class="chip matched">Current mentor</span>' : '',
            !c.current && c.id === bestId ? '<span class="chip pending">Best fit</span>' : '',
            c.denied ? '<span class="chip none">Denied earlier</span>' : ''
        ].join(' ');
        return `<div class="cand${c.current ? ' is-current' : ''}">
            <div class="cand-main">
                <h4>${esc(c.name)} ${chips}</h4>
                ${c.job ? `<div>${esc(c.job)}</div>` : ''}
                ${c.expertise.length ? `<div class="muted">${esc(c.expertise.slice(0, 3).join(', '))}</div>` : ''}
                ${c.details.length ? `<div class="muted why">${esc(c.details.join(' · '))}</div>` : '<div class="muted why">Nothing in common yet</div>'}
            </div>
            <div class="cand-pct"><span class="pct${pct < 50 ? ' low' : ''}">${pct}%</span><div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div></div>
            <button type="button" class="btn primary small" data-act="pick" data-mentor="${esc(c.id)}" ${c.current ? 'disabled' : ''}
                aria-label="${c.current ? `${esc(c.name)} is the current mentor` : `Match ${esc(picker.info.student.name)} with ${esc(c.name)}`}">${c.current ? 'Current' : 'Match'}</button>
        </div>`;
    }

    function renderPicker() {
        const { info, mode } = picker;
        const s = info.student;
        $('pickerTitle').textContent = mode === 'change' ? `Change mentor for ${s.name}` : `Choose a mentor for ${s.name}`;
        $('pickerSub').textContent = [s.major, s.year].filter(Boolean).join(' · ') + (s.passion ? ` · “${s.passion}”` : '');

        const showBlock = mode === 'change' && info.current;
        $('pickerBlockWrap').hidden = !showBlock;
        if (showBlock) $('pickerBlockText').textContent = `Don't suggest ${s.name} and ${info.current.mentorName} together again`;

        const free = info.candidates.filter(c => !c.current);
        if (!free.length) {
            $('pickerList').innerHTML = '<div class="empty"><b>No mentors are free right now.</b><br>Every mentor already has a student. Unmatch a pair first, then come back.</div>';
            return;
        }
        const bestId = free[0].id;
        $('pickerList').innerHTML = info.candidates.map(c => candidateRow(c, bestId)).join('');
    }

    async function openPicker(studentId, mode) {
        $('pickerError').hidden = true;
        const info = await send(`/api/console/candidates?student=${encodeURIComponent(studentId)}`);
        if (!info) return;
        picker = { studentId, mode, info };
        renderPicker();
        if (!$('picker').open) $('picker').showModal();
    }

    function closePicker() {
        if ($('picker').open) $('picker').close();
        picker = null;
    }

    $('pickerClose').addEventListener('click', closePicker);
    $('picker').addEventListener('cancel', () => { picker = null; });

    $('pickerList').addEventListener('click', async event => {
        const button = event.target.closest('button[data-act="pick"]');
        if (!button || !picker) return;

        const { studentId, mode } = picker;
        button.disabled = true;
        $('pickerError').hidden = true;

        const body = { studentId, mentorId: button.dataset.mentor };
        if (mode === 'change') body.blockPair = $('pickerBlock').checked;

        try {
            const result = await api('/api/console/match', body);
            if (!result.ok) {
                $('pickerError').textContent = result.data.error || 'Could not save that match.';
                $('pickerError').hidden = false;
                const fresh = await api(`/api/console/candidates?student=${encodeURIComponent(studentId)}`);
                if (fresh.ok) { picker.info = fresh.data; renderPicker(); }
                return;
            }
            const r = result.data;
            closePicker();
            afterChange(r.replaced
                ? `${r.matched.studentName} now has ${r.matched.mentorName} (${r.matched.percentage}%) instead of ${r.replaced.mentorName}.`
                : `${r.matched.studentName} is matched with ${r.matched.mentorName} (${r.matched.percentage}%).`, r.view);
        } catch (err) {
            if (err.message !== 'Signed out') {
                $('pickerError').textContent = 'Could not reach the server. Make sure it is running (node server.js).';
                $('pickerError').hidden = false;
            }
        } finally {
            button.disabled = false;
        }
    });

    // ---------- clicks on cards ----------

    async function onGridClick(event) {
        const button = event.target.closest('button[data-act]');
        if (!button) return;
        const act = button.dataset.act;

        if (act === 'choose') return openPicker(button.dataset.student, 'new');
        if (act === 'change') return openPicker(button.dataset.student, 'change');
        if (act === 'unmatch') { confirmingId = button.dataset.id; render(); return; }
        if (act === 'cancel-unmatch') { confirmingId = null; render(); return; }

        if (act === 'confirm-unmatch') {
            const block = button.closest('.inline-confirm').querySelector('.block-pair').checked;
            button.disabled = true;
            const result = await send('/api/console/unmatch', { matchId: button.dataset.id, blockPair: block });
            button.disabled = false;
            if (!result) return;
            afterChange(`${result.removed.studentName} and ${result.removed.mentorName} are unmatched.` +
                (result.blockedPair ? " They won't be suggested together again." : ' Automatic matching may pair them again.'), result.view);
        }
    }
    $('matchGrid').addEventListener('click', onGridClick);
    $('openGrid').addEventListener('click', onGridClick);

    // ---------- unmatch everyone ----------

    function openConfirm() {
        $('forgetDenials').checked = false;
        $('confirmBar').hidden = false;
        $('confirmNo').focus();
    }

    function closeConfirm() {
        $('confirmBar').hidden = true;
        $('unmatchBtn').focus();
    }

    $('unmatchBtn').addEventListener('click', openConfirm);
    $('confirmNo').addEventListener('click', closeConfirm);
    $('confirmBar').addEventListener('keydown', event => { if (event.key === 'Escape') closeConfirm(); });

    $('confirmYes').addEventListener('click', async () => {
        const buttons = [$('confirmYes'), $('confirmNo')];
        buttons.forEach(b => { b.disabled = true; });
        const result = await send('/api/console/unmatch-all', { confirm: true, forgetDenials: $('forgetDenials').checked });
        buttons.forEach(b => { b.disabled = false; });
        if (!result) return;

        viewChosen = false;
        $('confirmBar').hidden = true;
        afterChange(`${plural(result.removed, 'match')} removed. Everyone is back in the pool.` +
            (result.forgotDenials ? ' Denied pairs were forgotten too.' : '') + ` Backup saved in ${result.backup}.`, result.view);
    });

    $('undoBtn').addEventListener('click', async () => {
        $('undoBtn').disabled = true;
        const result = await send('/api/console/unmatch-undo', {});
        $('undoBtn').disabled = false;
        if (!result) return;

        viewChosen = false;
        afterChange(`${plural(result.matches.length, 'match')} restored.`, result);
    });

    // ---------- filters ----------

    $('matchSearch').addEventListener('input', event => { query = event.target.value.trim(); render(); });
    $('matchSort').addEventListener('change', event => { sortBy = event.target.value; render(); });
    $('methodFilter').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        methodFilter = button.dataset.m;
        [...$('methodFilter').children].forEach(b => b.setAttribute('aria-pressed', b === button));
        render();
    });
    $('viewSwitch').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        view = button.dataset.v;
        viewChosen = true;
        confirmingId = null;
        render();
    });

    (async function load() {
        const loaded = await send('/api/console/matches');
        if (!loaded) return;
        data = loaded;
        render();
    })();
})();
