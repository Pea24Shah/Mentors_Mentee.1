/**
 * Analytics: sign-ups over time, attendance per lesson, and the student funnel.
 * Drawn from the saved responses, matches and recorded attendance.
 */

(function () {
    const { esc, fmt, api } = MM;
    const $ = id => document.getElementById(id);

    const W = 460, PL = 34, PR = 16, PT = 26;

    function joinChart(d) {
        const H = 220, PB = 28;
        const shown = d.days.filter(day => day.shown);
        const peak = Math.max(0, ...d.days.map(day => Math.max(day.mentees, day.mentors)));
        const max = Math.max(4, Math.ceil(peak / 4) * 4);

        const last = Math.max(1, d.days.length - 1);
        const x = i => PL + i * (W - PL - PR) / last;
        const y = v => PT + (H - PT - PB) * (1 - v / max);

        let g = '';
        for (let t = 0; t <= max; t += max / 4) {
            g += `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${y(t)}" y2="${y(t)}"/><text x="${PL - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
        }
        [...new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * last)))].forEach(i => {
            g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(fmt(d.days[i].date))}</text>`;
        });

        const path = key => shown.map((day, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(day[key]).toFixed(1)}`).join('');
        const end = shown.length - 1;
        if (end >= 0) {
            g += `<path d="${path('mentees')} L${x(end)},${y(0)} L${x(0)},${y(0)} Z" fill="var(--sjsu-blue)" opacity=".1"/>`;
            g += `<path class="ln" d="${path('mentees')}" stroke="var(--sjsu-blue)"/><path class="ln" d="${path('mentors')}" stroke="var(--sjsu-gold)"/>`;
            const a = shown[end].mentees, b = shown[end].mentors;
            // Labels sit to the left of the last point so they never run off the edge
            g += `<circle cx="${x(end)}" cy="${y(a)}" r="4.5" fill="var(--sjsu-blue)"/><text class="strong" x="${x(end) - 8}" y="${y(a) - 8}" text-anchor="end">${a}</text>`;
            g += `<circle cx="${x(end)}" cy="${y(b)}" r="4.5" fill="var(--sjsu-gold)"/><text class="strong" x="${x(end) - 8}" y="${y(b) + 16}" text-anchor="end">${b}</text>`;
        }

        const a = end >= 0 ? shown[end].mentees : 0, b = end >= 0 ? shown[end].mentors : 0;
        $('joinChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${a} students and ${b} professionals have applied so far">${g}</svg>`;
    }

    function attendanceChart(d) {
        const H = 220, PB = 40;
        const top = Math.max(d.expected, 4);
        const bw = (W - PL - PR) / d.lessons.length;
        const y = v => PT + (H - PT - PB) * (1 - v / top);

        let s = '';
        const step = Math.max(1, Math.round(top / 4));
        for (let t = 0; t <= top; t += step) {
            s += `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${y(t)}" y2="${y(t)}"/><text x="${PL - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
        }
        d.lessons.forEach((l, i) => {
            const cx = PL + i * bw + bw * 0.2, w = bw * 0.6;
            s += `<rect x="${cx}" y="${y(top)}" width="${w}" height="${y(0) - y(top)}" rx="3" fill="var(--c-soft)"/>`;
            if (l.held && d.expected) {
                s += `<rect x="${cx}" y="${y(l.attendedCount)}" width="${w}" height="${y(0) - y(l.attendedCount)}" rx="3" fill="var(--sjsu-blue)"/>` +
                    `<text class="strong" x="${cx + w / 2}" y="${y(l.attendedCount) - 6}" text-anchor="middle">${l.attendedCount}</text>`;
            } else if (!l.held) {
                s += `<text x="${cx + w / 2}" y="${y(top / 2)}" text-anchor="middle">upcoming</text>`;
            }
            s += `<text x="${cx + w / 2}" y="${H - 22}" text-anchor="middle">Lesson ${l.n}</text><text x="${cx + w / 2}" y="${H - 8}" text-anchor="middle">${esc(fmt(l.date))}</text>`;
        });
        $('attChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Attendance per lesson, out of ${d.expected} matched people">${s}</svg>`;
    }

    function funnel(d) {
        const total = Math.max(1, d.funnel[0].value);
        $('funnel').innerHTML = d.funnel.map(step =>
            `<div class="row"><span>${esc(step.label)}</span><span class="track"><i style="width:${step.value / total * 100}%"></i></span>` +
            `<span class="tnum" style="text-align:right">${step.value}</span></div>`).join('');
    }

    (async function load() {
        try {
            const { ok, data } = await api('/api/console/analytics');
            if (!ok) throw new Error('load failed');
            joinChart(data);
            attendanceChart(data);
            funnel(data);
        } catch (err) {
            if (err.message === 'Signed out') return;
            $('joinChart').innerHTML = '<div class="status-line">Could not load analytics. Make sure the server is running (node server.js).</div>';
        }
    })();
})();
