/**
 * Staff match review.
 *
 * On load, the server writes the automatic matches (50% or more). Then staff go
 * through every student who is still unmatched, one at a time:
 *  - a student with options: their top two mentors. Accept one, or deny both
 *    (the mentors stay in the pool). Either way the next student is shown.
 *  - a student with no mentor available: a notice, then the next student.
 * All text is added with textContent.
 */

(function () {
    const $ = id => document.getElementById(id);
    let state = null;

    function el(tag, props = {}, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(props)) {
            if (key === 'text') node.textContent = value;
            else if (key === 'class') node.className = value;
            else node.setAttribute(key, value);
        }
        children.forEach(child => child && node.append(child));
        return node;
    }

    const show = value => {
        if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not given';
        return value ? String(value) : 'Not given';
    };

    // ---------- talking to the server ----------

    /** GET when body is undefined, otherwise POST JSON. Signed-out staff go to the sign-in page. */
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

    // ---------- rendering ----------

    function renderStats(stats) {
        const cards = [
            [stats.autoMatches, 'Automatic matches'],
            [stats.staffMatches, 'Staff-approved matches'],
            [stats.studentsToReview, 'Students left to review'],
            [stats.studentsWithoutMentor, 'Students without a mentor'],
            [stats.mentorsAvailable, 'Mentors in the pool']
        ];
        $('stats').replaceChildren(...cards.map(([value, label]) =>
            el('div', { class: 'kpi' },
                el('span', { class: 'value', text: String(value) }),
                el('span', { class: 'label', text: label }))));
    }

    function facts(rows) {
        const dl = el('dl', { class: 'facts' });
        rows.forEach(([label, value]) => dl.append(el('dt', { text: label }), el('dd', { text: show(value) })));
        return dl;
    }

    function criterionRow(name, points, max) {
        const percent = max > 0 ? (points / max) * 100 : 0;
        return el('div', { class: 'bar-row' },
            el('span', { class: 'name', text: name }),
            el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${percent}%` })),
            el('span', { class: 'num', text: `${points}/${max}` }));
    }

    function studentCard(s) {
        return el('section', { class: 'person', 'aria-label': 'Student' },
            el('h3', { text: `Student: ${s.name}` }),
            facts([
                ['Email', s.email],
                ['Major', s.major],
                ['Year', s.year],
                ['Passion', s.passion],
                ['Wants mentor style', s.mentorStyle],
                ['Meeting frequency', s.meetingPreference],
                ['Available days', s.availableDays],
                ['Challenges', s.challenges],
                ['Goals', s.goals]
            ]));
    }

    function optionCard(student, option, index, weights) {
        const m = option.mentor;
        const jobLine = [m.title, m.company].filter(Boolean).join(' at ');

        const accept = el('button', {
            type: 'button',
            class: 'btn-approve',
            'aria-label': `Accept ${m.name} for ${student.name}`,
            text: `Accept ${m.name}`
        });
        accept.addEventListener('click', () => decide('approved', m.id));

        return el('section', { class: 'person option', 'aria-label': `Option ${index + 1}: ${m.name}` },
            el('div', { class: 'option-head' },
                el('h3', { text: `Option ${index + 1}: ${m.name}` }),
                el('span', { class: 'pct-badge', text: `${option.percentage}%` })),
            facts([
                ['Email', m.email],
                ['Role', jobLine],
                ['Passion', m.passion],
                ['Expertise', m.expertise],
                ['Preferred majors', m.preferredMajors],
                ['Mentor style', m.mentorshipStyle],
                ['Meeting frequency', m.availability],
                ['Available days', m.availableDays]
            ]),
            el('div', { class: 'bars' },
                criterionRow('Passion', option.breakdown.passion, weights.passion),
                criterionRow('Major', option.breakdown.major, weights.major),
                criterionRow('Style', option.breakdown.style, weights.style),
                criterionRow('Availability', option.breakdown.availability, weights.availability)),
            option.details.length ? el('ul', {}, ...option.details.map(text => el('li', { text }))) : null,
            accept);
    }

    function button(className, text, onClick) {
        const b = el('button', { type: 'button', class: className, text });
        b.addEventListener('click', onClick);
        return b;
    }

    function renderProposal(p, weights, threshold) {
        const s = p.student;

        if (p.kind === 'none') {
            $('proposalTitle').textContent = 'No mentors for this student';
            $('proposalIntro').textContent = '';
            $('proposal').replaceChildren(
                studentCard(s),
                el('div', { class: 'notice', role: 'note' },
                    el('h3', { text: `There are no mentors available for ${s.name} at the moment.` }),
                    el('p', { text: 'No mentor currently shares anything with this student, or the mentors suggested earlier were denied or are already matched. ' +
                        'Check again after more mentors register.' })));
            $('decisionButtons').replaceChildren(button('btn-approve', 'Show next student', skip));
            $('decisionHint').textContent = 'This student stays in the "Students without a mentor" list below.';
            return;
        }

        $('proposalTitle').textContent = 'Next student';
        $('proposalIntro').textContent = `${s.name} has no mentor at ${threshold}% or more. Here are the two closest.`;
        $('proposal').replaceChildren(
            studentCard(s),
            el('div', { class: 'options' }, ...p.options.map((o, i) => optionCard(s, o, i, weights))));
        $('decisionButtons').replaceChildren(
            button('btn-deny', p.options.length === 1 ? 'Deny this mentor' : 'Deny both', () => decide('denied')),
            button('btn-skip', 'Skip this student for now', skip));
        $('decisionHint').textContent =
            'Accept one mentor to match them with this student. Deny if neither is a good fit: both mentors stay in the pool ' +
            'for other students, and this student comes up again later with the next best mentors. Either way, the next student is shown.';
    }

    const METHOD_LABEL = { auto: 'Automatic', staff: 'Staff' };

    function renderTable(table, headings, rows, emptyText) {
        const head = el('tr', {}, ...headings.map(text => el('th', { scope: 'col', text })));
        const body = rows.length
            ? rows
            : [el('tr', {}, el('td', { colspan: String(headings.length), text: emptyText }))];
        table.replaceChildren(el('thead', {}, head), el('tbody', {}, ...body));
    }

    function renderTables(next) {
        renderTable($('finalMatches'),
            ['Student', 'Student email', 'Mentor', 'Mentor email', 'Match', 'How', 'When'],
            next.matches.map(a => el('tr', {},
                el('th', { scope: 'row', text: a.studentName }),
                el('td', { text: a.studentEmail }),
                el('td', { text: a.mentorName }),
                el('td', { text: a.mentorEmail }),
                el('td', { class: 'num', text: `${a.percentage}%` }),
                el('td', { text: METHOD_LABEL[a.method] || a.method }),
                el('td', { text: new Date(a.matchedAt).toLocaleString() }))),
            'No matches yet.');

        renderTable($('unmatched'),
            ['Student', 'Email', 'Major', 'Status'],
            next.unmatched.map(u => el('tr', {},
                el('th', { scope: 'row', text: u.name }),
                el('td', { text: u.email }),
                el('td', { text: u.major }),
                el('td', { text: u.reason }))),
            'Every student has a mentor.');
    }

    function renderEmpty(stats) {
        const matched = stats.autoMatches + stats.staffMatches;
        if (stats.students === 0) {
            $('emptyTitle').textContent = 'No students yet';
            $('emptyText').textContent = 'Nobody has filled out the student survey yet.';
        } else {
            $('emptyTitle').textContent = 'All students reviewed';
            $('emptyText').textContent =
                `${matched} of ${stats.students} student(s) have a mentor. ` +
                (stats.studentsWithoutMentor > 0
                    ? `${stats.studentsWithoutMentor} still have none. See the list below.`
                    : 'Every student has a mentor.');
        }

        const unskip = $('unskip');
        unskip.hidden = stats.skipped === 0;
        unskip.textContent = `Review ${stats.skipped} skipped student${stats.skipped === 1 ? '' : 's'} again`;
    }

    function render(next) {
        state = next;
        $('content').hidden = false;
        renderStats(state.stats);
        renderTables(state);

        const hasProposal = Boolean(state.proposal);
        $('proposalSection').hidden = !hasProposal;
        $('emptySection').hidden = hasProposal;

        if (hasProposal) renderProposal(state.proposal, state.weights, state.threshold);
        else renderEmpty(state.stats);

        // Keep the timeline, summary numbers and match-emails panel in step with this page
        MM.refresh().then(renderEmails);
    }

    // ---------- match emails (the app does not send email; staff record that they did) ----------

    function renderEmails(summary) {
        if (!summary) return;
        const matches = summary.counts.matches;
        const waiting = summary.counts.awaitingReview;
        const sent = summary.emailsSentAt;
        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

        $('emailsPanel').hidden = false;
        $('sendbar').className = sent ? 'sendbar sent' : 'sendbar';
        $('sendMsg').textContent = sent
            ? `Marked as sent on ${MM.fmt(sent)} for ${plural(matches, 'matched pair')}.`
            : matches
                ? `${plural(matches, 'matched pair')} ready for introduction emails.` + (waiting ? ` ${plural(waiting, 'student')} still in review.` : '')
                : 'No matches yet.';
        $('csvLink').hidden = matches === 0;
        $('sendToggle').textContent = sent ? 'Undo' : 'Mark emails as sent';
        $('sendToggle').disabled = !sent && matches === 0;
        $('sendToggle').dataset.sent = sent ? 'true' : 'false';
    }

    $('sendToggle').addEventListener('click', async () => {
        const button = $('sendToggle');
        $('sendError').hidden = true;
        button.disabled = true;
        try {
            const { ok, data } = await api('/api/console/emails', { sent: button.dataset.sent !== 'true' });
            if (!ok) {
                $('sendError').textContent = data.error || 'Could not save that.';
                $('sendError').hidden = false;
            }
            renderEmails((await MM.refresh()) || null);
        } catch (err) {
            if (err.message !== 'Signed out') {
                $('sendError').textContent = 'Could not reach the server. Make sure it is running (node server.js).';
                $('sendError').hidden = false;
            }
        } finally {
            button.disabled = false;
        }
    });

    // ---------- status, loading, acting ----------

    function showStatus(message, isError) {
        const box = $('status');
        box.textContent = message;
        box.className = isError ? 'status error' : 'status';
        box.hidden = !message;
    }

    function focusMain() {
        (state.proposal ? $('proposalTitle') : $('emptyTitle')).focus();
    }

    function setBusy(busy) {
        document.querySelectorAll('#decisionButtons button, .option button, #unskip').forEach(b => { b.disabled = busy; });
    }

    const written = n => `Automatic matching wrote ${n} new match${n === 1 ? '' : 'es'} to data/matches.json.`;
    const nextText = s => (s.proposal ? ` Next student: ${s.proposal.student.name}.` : ' That was the last student.');

    /** Ask the server to write any automatic matches, then show the result. Returns how many were written. */
    async function runMatching() {
        const { ok, data } = await api('/api/matching/run', {});
        if (!ok) throw new Error('Could not run matching');
        render(data.state);
        return data.added;
    }

    async function load() {
        try {
            const added = await runMatching();
            showStatus(added > 0 ? written(added) : '', false);
        } catch (err) {
            if (err.message === 'Signed out') return;
            $('content').hidden = true;
            showStatus('Could not load the review. Make sure the server is running (node server.js).', true);
        }
    }

    /**
     * Send one action, show the new state, and tell staff what happened.
     * `describe(newState)` returns the message for a successful action.
     */
    async function act(path, body, describe) {
        setBusy(true);
        try {
            const { ok, status, data } = await api(path, body);

            if (status === 409 && data.state) {
                // Something changed (a new survey, or another match was made). Reload the latest.
                const added = await runMatching();
                showStatus(`${added > 0 ? written(added) + ' ' : ''}That review was out of date, so the latest is shown.`, true);
                focusMain();
                return;
            }
            if (!ok) {
                showStatus(data.error || 'Could not save that.', true);
                return;
            }

            render(data.state);
            let message = describe(data.state);

            // New surveys may have arrived with automatic matches ready
            if (data.state.autoPending > 0) message += ` ${written(await runMatching())}`;
            showStatus(message, false);
            focusMain();
        } catch (err) {
            if (err.message === 'Signed out') return;
            showStatus('Could not reach the server. Make sure it is running (node server.js).', true);
        } finally {
            setBusy(false);
        }
    }

    function decide(decision, mentorId) {
        const shown = state && state.proposal;
        if (!shown || shown.kind !== 'options') return;
        const studentName = shown.student.name;
        const chosen = shown.options.find(o => o.mentor.id === mentorId);
        const bothNames = shown.options.map(o => o.mentor.name).join(' and ');

        return act('/api/review/decision', {
            studentId: shown.student.id,
            decision,
            mentorId,
            offered: shown.options.map(o => o.mentor.id)
        }, newState => (decision === 'approved'
            ? `Accepted: ${studentName} with ${chosen.mentor.name} (${chosen.percentage}%).`
            : `Denied: ${bothNames} stay in the pool for other students.`) + nextText(newState));
    }

    function skip() {
        const shown = state && state.proposal;
        if (!shown) return;
        const studentName = shown.student.name;
        const reason = shown.kind === 'none' ? 'no mentors available at the moment' : 'skipped for now';
        return act('/api/review/skip', { studentId: shown.student.id },
            newState => `${studentName}: ${reason}.` + nextText(newState));
    }

    $('unskip').addEventListener('click', () =>
        act('/api/review/unskip', {}, newState => `Skipped students are back in the line.${nextText(newState)}`));

    load();
})();
