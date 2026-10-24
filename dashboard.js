/**
 * Matching results dashboard.
 * Loads /api/results (scores for every student-mentor pair) and draws
 * summary cards, charts and tables. All text is added with textContent,
 * so names from the survey can't inject HTML.
 */

(function () {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const COLORS = { blue: '#0055A2', gold: '#E5A823', gray: '#939597' };
    const MAX_MENTOR_BARS = 15;

    const $ = id => document.getElementById(id);

    // ---------- tiny DOM helpers ----------

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

    function svg(tag, attrs = {}, text) {
        const node = document.createElementNS(SVG_NS, tag);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        if (text !== undefined) node.textContent = text;
        return node;
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // ---------- analysis ----------

    function analyze(data) {
        const threshold = data.threshold;

        const students = data.students.map((student, i) => {
            const row = data.scores[i];
            let best = -1;
            let bestIndex = -1;
            let hits = 0;
            row.forEach((cell, j) => {
                if (cell[0] > best) { best = cell[0]; bestIndex = j; }
                if (cell[0] >= threshold) hits++;
            });
            return { ...student, row, best, bestIndex, hits };
        });

        const mentors = data.mentors.map((mentor, j) => ({
            ...mentor,
            hits: data.scores.filter(row => row[j][0] >= threshold).length
        }));

        const allScores = data.scores.flat();
        const pairs = allScores.length;
        const criteria = ['passion', 'major', 'style', 'availability'].map((key, k) => ({
            key,
            max: data.weights[key],
            average: pairs ? allScores.reduce((sum, cell) => sum + cell[k + 1], 0) / pairs : 0
        }));

        const matchedStudents = students.filter(s => s.hits > 0).length;

        return {
            threshold,
            students,
            mentors,
            pairs,
            percentages: allScores.map(cell => cell[0]),
            criteria,
            matchedStudents,
            matchedPairs: students.reduce((sum, s) => sum + s.hits, 0),
            averageBest: students.length ? students.reduce((sum, s) => sum + s.best, 0) / students.length : 0
        };
    }

    // ---------- summary cards ----------

    function renderKpis(a) {
        const total = a.students.length;
        const matchedShare = total ? Math.round((a.matchedStudents / total) * 100) : 0;
        const cards = [
            [total, 'Students'],
            [a.mentors.length, 'Mentors'],
            [`${a.matchedStudents} (${matchedShare}%)`, `Students with a match (${a.threshold}%+)`],
            [total - a.matchedStudents, 'Students with no match'],
            [a.matchedPairs, `Matching pairs (${a.threshold}%+)`],
            [`${Math.round(a.averageBest)}%`, 'Average best match']
        ];
        const root = $('kpis');
        root.replaceChildren(...cards.map(([value, label]) =>
            el('div', { class: 'kpi' },
                el('span', { class: 'value', text: String(value) }),
                el('span', { class: 'label', text: label }))));
    }

    // ---------- charts ----------

    function renderDonut(a) {
        const total = a.students.length;
        const matched = a.matchedStudents;
        const radius = 70;
        const circumference = 2 * Math.PI * radius;
        const share = total ? matched / total : 0;

        const chart = svg('svg', {
            viewBox: '0 0 330 190', role: 'img',
            'aria-label': `${matched} of ${plural(total, 'student')} have at least one match of ${a.threshold}% or more`
        });
        const ring = (color, dash, offset) => svg('circle', {
            cx: 100, cy: 95, r: radius, fill: 'none', stroke: color, 'stroke-width': 28,
            'stroke-dasharray': `${dash} ${circumference - dash}`, 'stroke-dashoffset': offset,
            transform: 'rotate(-90 100 95)'
        });
        chart.append(ring(COLORS.gray, circumference, 0));
        if (matched > 0) chart.append(ring(COLORS.blue, circumference * share, 0));
        chart.append(
            svg('text', { x: 100, y: 102, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 700 }, `${Math.round(share * 100)}%`),
            svg('rect', { x: 188, y: 70, width: 12, height: 12, fill: COLORS.blue }),
            svg('text', { x: 205, y: 80, 'font-size': 13 }, `Matched (${matched})`),
            svg('rect', { x: 188, y: 100, width: 12, height: 12, fill: COLORS.gray }),
            svg('text', { x: 205, y: 110, 'font-size': 13 }, `None (${total - matched})`)
        );
        $('donut').replaceChildren(chart);
    }

    function renderHistogram(a) {
        const bins = new Array(10).fill(0);
        a.percentages.forEach(p => { bins[Math.min(9, Math.floor(p / 10))]++; });
        const maxCount = Math.max(1, ...bins);

        const W = 480, H = 250, left = 42, right = 10, top = 22, bottom = 44;
        const plotW = W - left - right;
        const plotH = H - top - bottom;
        const barW = plotW / bins.length;
        const y = count => top + plotH - (count / maxCount) * plotH;

        const chart = svg('svg', {
            viewBox: `0 0 ${W} ${H}`, role: 'img',
            'aria-label': `Histogram of ${plural(a.pairs, 'pair score')} in bins of 10 percent. Pairs at ${a.threshold}% or more count as matches.`
        });

        // Whole-number ticks only: 0, the max, and the middle when it is a whole number
        const ticks = [0, maxCount];
        if (maxCount % 2 === 0) ticks.splice(1, 0, maxCount / 2);
        ticks.forEach(value => {
            const yy = y(value);
            chart.append(
                svg('line', { x1: left, x2: W - right, y1: yy, y2: yy, stroke: '#D2D2D2', 'stroke-width': 1 }),
                svg('text', { x: left - 6, y: yy + 4, 'text-anchor': 'end', 'font-size': 13, class: 'muted' }, String(value))
            );
        });

        bins.forEach((count, i) => {
            const x = left + i * barW;
            const isMatchBin = i * 10 >= a.threshold;
            if (count > 0) {
                chart.append(
                    svg('rect', {
                        x: x + 3, y: y(count), width: barW - 6, height: top + plotH - y(count),
                        fill: isMatchBin ? COLORS.blue : COLORS.gray
                    }),
                    svg('text', { x: x + barW / 2, y: y(count) - 5, 'text-anchor': 'middle', 'font-size': 13 }, String(count))
                );
            }
            chart.append(svg('text', {
                x: x + barW / 2, y: H - bottom + 16, 'text-anchor': 'middle', 'font-size': 12, class: 'muted'
            }, `${i * 10}-${i === 9 ? 100 : i * 10 + 9}`));
        });

        const thresholdX = left + (a.threshold / 100) * plotW;
        chart.append(
            svg('line', { x1: thresholdX, x2: thresholdX, y1: top - 6, y2: top + plotH, stroke: COLORS.gold, 'stroke-width': 3, 'stroke-dasharray': '6 4' }),
            svg('text', { x: thresholdX + 6, y: top - 8, 'font-size': 13, 'font-weight': 700 }, `${a.threshold}% = match`),
            svg('text', { x: left + plotW / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 13, class: 'muted' }, 'Match percentage (number of pairs)')
        );

        $('histogram').replaceChildren(chart);
    }

    function barRow(name, value, max, display) {
        const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
        return el('div', { class: 'bar-row' },
            el('span', { class: 'name', text: name, title: name }),
            el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${percent}%` })),
            el('span', { class: 'num', text: display }));
    }

    function renderMentorBars(a) {
        const sorted = [...a.mentors].sort((x, y) => y.hits - x.hits || x.name.localeCompare(y.name));
        const shown = sorted.slice(0, MAX_MENTOR_BARS);
        const max = Math.max(1, a.students.length);
        const rows = shown.map(m => barRow(m.name, m.hits, max, String(m.hits)));
        if (sorted.length > shown.length) {
            rows.push(el('p', { class: 'more', text: `+ ${sorted.length - shown.length} more mentors in the table below` }));
        }
        $('mentorBars').replaceChildren(...rows);
    }

    function renderCriteriaBars(a) {
        const labels = { passion: 'Passion', major: 'Major', style: 'Style', availability: 'Availability' };
        $('criteriaBars').replaceChildren(...a.criteria.map(c =>
            barRow(labels[c.key], c.average, c.max, `${c.average.toFixed(1)}/${c.max}`)));
    }

    // ---------- tables ----------

    function renderMatrix(a, data) {
        const table = $('matrix');
        const T = a.threshold;

        const headRow = el('tr', {}, el('th', { class: 'corner', scope: 'col', text: 'Student' }));
        a.mentors.forEach(m => headRow.append(
            el('th', { class: 'col-head', scope: 'col', title: m.name }, el('span', { text: m.name }))));
        headRow.append(el('th', { class: 'total', scope: 'col', text: 'Matches' }));

        const body = el('tbody');
        a.students.forEach((student, i) => {
            const tr = el('tr', {}, el('th', { class: 'row-head', scope: 'row', text: student.name, title: student.name }));
            student.row.forEach((cell, j) => {
                const [pct, passion, major, style, availability] = cell;
                const td = el('td', {
                    text: String(pct),
                    class: pct >= T ? 'hit' : '',
                    style: `background:rgba(0,85,162,${(0.06 + (pct / 100) * 0.44).toFixed(3)})`,
                    title: `${student.name} x ${a.mentors[j].name}: ${pct}%` +
                        ` (passion ${passion}/${data.weights.passion}, major ${major}/${data.weights.major},` +
                        ` style ${style}/${data.weights.style}, availability ${availability}/${data.weights.availability})`
                });
                tr.append(td);
            });
            tr.append(el('td', { class: 'total', text: String(student.hits) }));
            body.append(tr);
        });

        const foot = el('tr', {}, el('th', { scope: 'row', text: 'Matches' }));
        a.mentors.forEach(m => foot.append(el('td', { text: String(m.hits) })));
        foot.append(el('td', { text: String(a.matchedPairs) }));

        table.replaceChildren(el('thead', {}, headRow), body, el('tfoot', {}, foot));

        $('legend').textContent =
            `Each cell is the match percentage. Bold cells with a gold frame are ${T}% or more, which counts as a match. ` +
            'Hover a cell to see the points for passion, major, style and availability.';
    }

    function renderBest(a) {
        const head = el('tr', {},
            ...['Student', 'Best mentor', 'Best match', `Mentors at ${a.threshold}%+`, 'Status']
                .map(text => el('th', { scope: 'col', text })));

        const rows = a.students.map(s => {
            const matched = s.hits > 0;
            return el('tr', {},
                el('th', { scope: 'row', text: s.name }),
                el('td', { text: s.bestIndex >= 0 ? a.mentors[s.bestIndex].name : '-' }),
                el('td', { class: 'num', text: `${s.best}%` }),
                el('td', { class: 'num', text: String(s.hits) }),
                el('td', { class: matched ? 'status-matched' : 'status-none', text: matched ? 'Matched' : 'No match' }));
        });

        $('best').replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
    }

    // ---------- loading ----------

    function showStatus(message, isError) {
        const box = $('status');
        box.textContent = message;
        box.className = isError ? 'status error' : 'status';
        box.hidden = !message;
    }

    async function load() {
        const button = $('refresh');
        button.disabled = true;
        try {
            const response = await fetch('/api/results', { cache: 'no-store' });
            if (response.status === 401) {
                // Signed out (or the server restarted): go to the sign-in page
                window.location.assign(`/login.html?next=${encodeURIComponent(window.location.pathname)}`);
                return;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            $('updated').textContent = `Updated ${new Date(data.generatedAt).toLocaleString()}`;

            if (data.students.length === 0 || data.mentors.length === 0) {
                $('content').hidden = true;
                showStatus('Nothing to compare yet. You need at least one student and one mentor survey response.', false);
                return;
            }

            showStatus('', false);
            const analysis = analyze(data);
            renderKpis(analysis);
            renderDonut(analysis);
            renderHistogram(analysis);
            renderMentorBars(analysis);
            renderCriteriaBars(analysis);
            renderMatrix(analysis, data);
            renderBest(analysis);
            $('subtitle').textContent =
                `${plural(analysis.students.length, 'student')} compared with ${plural(analysis.mentors.length, 'mentor')}`;
            $('content').hidden = false;
        } catch (err) {
            $('content').hidden = true;
            showStatus('Could not load results. Make sure the server is running (node server.js).', true);
        } finally {
            button.disabled = false;
        }
    }

    $('refresh').addEventListener('click', load);
    load();
})();
