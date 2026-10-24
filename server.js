/**
 * SJSU Mentor Match server. No dependencies.
 *
 *   node server.js        then open http://localhost:3000
 *
 * Serves the website, saves survey submissions to the data/ folder, and runs the
 * staff review. Staff pages and their data need the demo sign-in (see auth.js).
 * It only listens on 127.0.0.1. Don't expose it to a network without real
 * accounts and HTTPS.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store.js');
const MatchingSystem = require('./matching-algorithm.js');
const matchingService = require('./matching-service.js');
const auth = require('./auth.js');
const consoleService = require('./console-service.js');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

// Only these files are served, so data/ and .git are never exposed
const STATIC_FILES = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/console.css': ['console.css', 'text/css; charset=utf-8'],
    '/console.js': ['console.js', 'text/javascript; charset=utf-8'],
    '/staff-orientation.html': ['staff-orientation.html', 'text/html; charset=utf-8'],
    '/staff-orientation.js': ['staff-orientation.js', 'text/javascript; charset=utf-8'],
    '/matches.html': ['matches.html', 'text/html; charset=utf-8'],
    '/matches.js': ['matches.js', 'text/javascript; charset=utf-8'],
    '/participants.html': ['participants.html', 'text/html; charset=utf-8'],
    '/participants.js': ['participants.js', 'text/javascript; charset=utf-8'],
    '/lessons.html': ['lessons.html', 'text/html; charset=utf-8'],
    '/lessons.js': ['lessons.js', 'text/javascript; charset=utf-8'],
    '/homework.html': ['homework.html', 'text/html; charset=utf-8'],
    '/homework.js': ['homework.js', 'text/javascript; charset=utf-8'],
    '/analytics.html': ['analytics.html', 'text/html; charset=utf-8'],
    '/analytics.js': ['analytics.js', 'text/javascript; charset=utf-8'],
    '/orientation.html': ['orientation.html', 'text/html; charset=utf-8'],
    '/orientation.js': ['orientation.js', 'text/javascript; charset=utf-8'],
    '/survey.html': ['survey.html', 'text/html; charset=utf-8'],
    '/login.html': ['login.html', 'text/html; charset=utf-8'],
    '/login.js': ['login.js', 'text/javascript; charset=utf-8'],
    '/site.js': ['site.js', 'text/javascript; charset=utf-8'],
    '/site.css': ['site.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/mentor-system.css': ['mentor-system.css', 'text/css; charset=utf-8'],
    '/sjsu-theme.css': ['sjsu-theme.css', 'text/css; charset=utf-8'],
    '/dashboard.html': ['dashboard.html', 'text/html; charset=utf-8'],
    '/dashboard.js': ['dashboard.js', 'text/javascript; charset=utf-8'],
    '/dashboard.css': ['dashboard.css', 'text/css; charset=utf-8'],
    '/review.html': ['review.html', 'text/html; charset=utf-8'],
    '/review.js': ['review.js', 'text/javascript; charset=utf-8'],
    '/review.css': ['review.css', 'text/css; charset=utf-8']
};

// ---------- Allowed values (must match the options in survey.html) ----------

const MAJORS = ['Computer Science', 'Software Engineering', 'Data Science', 'Computer Engineering',
    'Business Administration', 'Electrical Engineering', 'Mechanical Engineering', 'Psychology',
    'Biology', 'Other'];
// Mentors now choose broad fields. Specific majors are still accepted so a page that
// was open before this change, and mentors saved earlier, keep working.
const MENTOR_MAJORS = [
    ...Object.keys(MatchingSystem.MAJOR_FIELDS),
    ...Object.values(MatchingSystem.MAJOR_FIELDS).flat(),
    'Any'
].filter((value, index, all) => all.indexOf(value) === index);
const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
const STUDENT_STYLES = ['Hands-on/Structured', 'Flexible/Guidance-based', 'Goal-oriented', 'Open to any'];
const MENTOR_STYLES = ['Hands-on/Structured', 'Flexible/Guidance-based', 'Goal-oriented', 'Adaptable to student needs'];
const FREQUENCIES = ['Weekly', 'Bi-weekly', 'Monthly', 'As needed'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EXPERTISE = ['Software Development', 'Data Science & Analytics', 'Product Management', 'Entrepreneurship',
    'Research & Academia', 'Leadership & Management', 'Career Development', 'Graduate School Applications',
    'Healthcare', 'Finance & Investment', 'Environmental Sustainability', 'Social Impact'];

// ---------- Field rules ----------

const text = (max, required) => ({ type: 'text', max, required });
const email = () => ({ type: 'email', required: true });
const oneOf = (options, required) => ({ type: 'oneOf', options, required });
const listOf = (options, required) => ({ type: 'listOf', options, required });

const SPECS = {
    students: {
        name: text(100, true),
        email: email(),
        major: oneOf(MAJORS, true),
        year: oneOf(YEARS, true),
        passion: text(2000, true),
        mentorStyle: oneOf(STUDENT_STYLES, false),
        meetingPreference: oneOf(FREQUENCIES, false),
        availableDays: listOf(DAYS, false),
        challenges: text(2000, false),
        goals: text(2000, false)
    },
    mentors: {
        name: text(100, true),
        email: email(),
        title: text(100, false),
        company: text(100, false),
        passion: text(2000, true),
        expertise: listOf(EXPERTISE, true),
        preferredMajors: listOf(MENTOR_MAJORS, true),
        mentorshipStyle: oneOf(MENTOR_STYLES, false),
        availability: oneOf(FREQUENCIES, false),
        availableDays: listOf(DAYS, false)
    }
};

/**
 * Keep only known fields and check each one.
 * @returns {{ value: Object, errors: string[] }}
 */
function validate(spec, body) {
    const value = {};
    const errors = [];

    for (const [field, rule] of Object.entries(spec)) {
        const raw = body[field];

        if (rule.type === 'listOf') {
            const list = Array.isArray(raw) ? raw : [];
            if (!list.every(item => rule.options.includes(item))) {
                errors.push(`${field} has an invalid choice`);
                continue;
            }
            value[field] = [...new Set(list)];
            if (rule.required && value[field].length === 0) errors.push(`${field} is required`);
            continue;
        }

        const str = typeof raw === 'string' ? raw.trim() : '';
        if (raw !== undefined && typeof raw !== 'string') {
            errors.push(`${field} must be text`);
            continue;
        }
        if (!str) {
            if (rule.required) errors.push(`${field} is required`);
            value[field] = '';
            continue;
        }

        if (rule.type === 'text' && str.length > rule.max) {
            errors.push(`${field} is too long (max ${rule.max} characters)`);
        } else if (rule.type === 'email') {
            const valid = str.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
            if (!valid) errors.push('email is not valid');
        } else if (rule.type === 'oneOf' && !rule.options.includes(str)) {
            errors.push(`${field} has an invalid choice`);
        }
        value[field] = rule.type === 'email' ? str.toLowerCase() : str;
    }

    return { value, errors };
}

// ---------- HTTP helpers ----------

function sendJson(res, status, payload) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(payload));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                // Reject now and drop the data. The socket is closed after the 413 is sent.
                chunks.length = 0;
                reject(Object.assign(new Error('Body too large'), { status: 413 }));
                return;
            }
            if (size <= MAX_BODY_BYTES) chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/**
 * Read and parse a JSON object body. On any problem this sends the error
 * response itself and returns undefined.
 */
async function readJsonObject(req, res) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) {
        sendJson(res, 415, { error: 'Send JSON' });
        return undefined;
    }

    let body;
    try {
        body = JSON.parse(await readBody(req));
    } catch (err) {
        if (err.status === 413) {
            res.setHeader('Connection', 'close');
            res.on('finish', () => req.destroy());
            sendJson(res, 413, { error: 'Response is too large' });
        } else {
            sendJson(res, 400, { error: 'Invalid JSON' });
        }
        return undefined;
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        sendJson(res, 400, { error: 'Invalid JSON' });
        return undefined;
    }
    return body;
}

async function handleSubmit(kind, req, res) {
    const body = await readJsonObject(req, res);
    if (body === undefined) return;

    const { value, errors } = validate(SPECS[kind], body);
    if (errors.length > 0) return sendJson(res, 400, { error: 'Please check your answers', details: errors });

    const record = { id: crypto.randomUUID(), ...value, submittedAt: new Date().toISOString() };
    const { replaced } = store.saveResponse(kind, record);
    return sendJson(res, 201, { ok: true, replaced });
}

/**
 * Scores for every student-mentor pair, computed fresh from the JSON files.
 * Names and numbers only. Emails and free-text answers are not included.
 * scores[studentIndex][mentorIndex] = [percentage, passion, major, style, availability]
 */
function buildResults() {
    const students = store.read('students');
    const mentors = store.read('mentors');
    const system = new MatchingSystem(students, mentors);

    const scores = students.map(student => mentors.map(mentor => {
        const r = system.calculateMatchScore(student, mentor);
        const b = r.breakdown;
        return [r.percentage, b.passion, b.major, b.style, b.availability];
    }));

    return {
        generatedAt: new Date().toISOString(),
        threshold: system.matchThreshold,
        weights: system.weights,
        students: students.map(s => ({ id: s.id, name: s.name })),
        mentors: mentors.map(m => ({ id: m.id, name: m.name })),
        scores
    };
}

// ---------- Matching and staff review (logic is in matching-service.js) ----------

/** Write the automatic matches, then return the state for the review page. */
async function handleRunMatching(req, res, session) {
    // Needs a JSON body on purpose: a web page on another site can't send that
    // without a CORS preflight, so it can't trigger matching behind staff's back.
    const body = await readJsonObject(req, res);
    if (body === undefined) return;

    const added = matchingService.runAutoMatching();
    return sendJson(res, 200, { added: added.length, state: matchingService.getReviewState(session.skipped) });
}

async function handleDecision(req, res, session) {
    const body = await readJsonObject(req, res);
    if (body === undefined) return;

    const { status, body: payload } = matchingService.applyDecision(body, session.skipped);
    return sendJson(res, status, payload);
}

async function handleSkip(req, res, session) {
    const body = await readJsonObject(req, res);
    if (body === undefined) return;

    const { status, body: payload } = matchingService.skipStudent(body, session.skipped);
    return sendJson(res, status, payload);
}

async function handleUnskip(req, res, session) {
    const body = await readJsonObject(req, res);
    if (body === undefined) return;

    const { status, body: payload } = matchingService.clearSkipped(session.skipped);
    return sendJson(res, status, payload);
}

// ---------- Staff sign-in (logic is in auth.js) ----------

async function handleLogin(req, res) {
    const ip = req.socket.remoteAddress;
    if (auth.isLockedOut(ip)) {
        res.setHeader('Retry-After', '60');
        return sendJson(res, 429, { error: 'Too many wrong attempts. Wait a minute and try again.' });
    }

    const body = await readJsonObject(req, res);
    if (body === undefined) return;

    if (!auth.credentialsValid(body.username, body.password)) {
        auth.recordFailure(ip);
        return sendJson(res, 401, { error: 'Wrong username or password' });
    }

    auth.clearFailures(ip);
    res.setHeader('Set-Cookie', auth.sessionCookie(auth.createSession()));
    return sendJson(res, 200, { ok: true });
}

async function handleLogout(req, res) {
    const body = await readJsonObject(req, res);
    if (body === undefined) return;

    auth.destroySession(req);
    res.setHeader('Set-Cookie', auth.clearedCookie());
    return sendJson(res, 200, { ok: true });
}

// ---------- Staff console (logic is in console-service.js) ----------

/** Run a console-service call and send its result. Service errors carry their own status. */
function consoleReply(res, fn) {
    try {
        return sendJson(res, 200, fn());
    } catch (err) {
        if (err instanceof consoleService.HttpError) {
            return sendJson(res, err.status, { error: err.message, ...(err.details ? { details: err.details } : {}) });
        }
        throw err;
    }
}

const consoleGet = fn => (req, res) => consoleReply(res, () => fn(req));

const consolePost = fn => async (req, res) => {
    const body = await readJsonObject(req, res);
    if (body === undefined) return;
    return consoleReply(res, () => fn(body));
};

function sendMatchesCsv(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="mentor-matches.csv"',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    // The byte-order mark makes Excel read accented names correctly
    res.end('\ufeff' + consoleService.matchesCsv());
}

// ---------- Routes ----------
// staff: true means a signed-in staff session is required (otherwise 401).

const ROUTES = [
    { method: 'GET',  path: '/api/session',         staff: false, handler: (req, res, session) => sendJson(res, 200, { signedIn: Boolean(session) }) },
    { method: 'POST', path: '/api/login',           staff: false, handler: handleLogin },
    { method: 'POST', path: '/api/logout',          staff: false, handler: handleLogout },
    { method: 'POST', path: '/api/students',        staff: false, handler: (req, res) => handleSubmit('students', req, res) },
    { method: 'POST', path: '/api/mentors',         staff: false, handler: (req, res) => handleSubmit('mentors', req, res) },

    { method: 'GET',  path: '/api/results',         staff: true,  handler: (req, res) => sendJson(res, 200, buildResults()) },
    { method: 'GET',  path: '/api/review',          staff: true,  handler: (req, res, session) => sendJson(res, 200, matchingService.getReviewState(session.skipped)) },
    { method: 'POST', path: '/api/matching/run',    staff: true,  handler: handleRunMatching },
    { method: 'POST', path: '/api/review/decision', staff: true,  handler: handleDecision },
    { method: 'POST', path: '/api/review/skip',     staff: true,  handler: handleSkip },
    { method: 'POST', path: '/api/review/unskip',   staff: true,  handler: handleUnskip },

    // Mentors and mentees read the orientation page without signing in, but only what staff turned on
    { method: 'GET',  path: '/api/orientation',            staff: false, handler: consoleGet(req => consoleService.publicOrientation(new URL(req.url, 'http://localhost').searchParams.get('for'))) },

    { method: 'GET',  path: '/api/console/summary',        staff: true,  handler: consoleGet(() => consoleService.getSummary()) },
    { method: 'GET',  path: '/api/console/participants',   staff: true,  handler: consoleGet(() => consoleService.getParticipants()) },
    { method: 'GET',  path: '/api/console/matches',        staff: true,  handler: consoleGet(() => consoleService.getMatchesView()) },
    { method: 'POST', path: '/api/console/unmatch-all',    staff: true,  handler: consolePost(body => consoleService.unmatchAll(body)) },
    { method: 'GET',  path: '/api/console/candidates',      staff: true,  handler: consoleGet(req => consoleService.getCandidates(new URL(req.url, 'http://localhost').searchParams.get('student'))) },
    { method: 'POST', path: '/api/console/match',           staff: true,  handler: consolePost(body => consoleService.manualMatch(body)) },
    { method: 'POST', path: '/api/console/unmatch',         staff: true,  handler: consolePost(body => consoleService.unmatchOne(body)) },
    { method: 'POST', path: '/api/console/unmatch-undo',   staff: true,  handler: consolePost(() => consoleService.undoUnmatch()) },
    { method: 'GET',  path: '/api/console/lessons',        staff: true,  handler: consoleGet(() => consoleService.getLessons()) },
    { method: 'POST', path: '/api/console/cadence',        staff: true,  handler: consolePost(body => consoleService.setCadence(body)) },
    { method: 'POST', path: '/api/console/attendance',     staff: true,  handler: consolePost(body => consoleService.setAttendance(body)) },
    { method: 'GET',  path: '/api/console/homework',       staff: true,  handler: consoleGet(() => consoleService.getHomework()) },
    { method: 'POST', path: '/api/console/homework',       staff: true,  handler: consolePost(body => consoleService.setHomework(body)) },
    { method: 'GET',  path: '/api/console/analytics',      staff: true,  handler: consoleGet(() => consoleService.getAnalytics()) },
    { method: 'GET',  path: '/api/console/orientation',    staff: true,  handler: consoleGet(() => consoleService.getOrientation()) },
    { method: 'POST', path: '/api/console/orientation',    staff: true,  handler: consolePost(body => consoleService.saveOrientation(body)) },
    { method: 'POST', path: '/api/console/emails',         staff: true,  handler: consolePost(body => consoleService.setEmailsSent(body)) },
    { method: 'GET',  path: '/api/console/matches.csv',    staff: true,  handler: sendMatchesCsv }
];

// Pages only staff can open. Everyone else is sent to the sign-in page.
const STAFF_PAGES = new Set([
    '/review.html', '/matches.html', '/dashboard.html', '/staff-orientation.html', '/participants.html',
    '/lessons.html', '/homework.html', '/analytics.html'
]);

function serveStatic(pathname, res, signedIn) {
    const entry = STATIC_FILES[pathname];
    if (!entry) return sendJson(res, 404, { error: 'Not found' });

    const isStaffPage = STAFF_PAGES.has(pathname);
    if (isStaffPage && !signedIn) {
        res.writeHead(302, {
            Location: `/login.html?next=${encodeURIComponent(pathname)}`,
            'Cache-Control': 'no-store'
        });
        return res.end();
    }

    fs.readFile(path.join(__dirname, entry[0]), (err, content) => {
        if (err) return sendJson(res, 500, { error: 'Could not read file' });
        const headers = { 'Content-Type': entry[1], 'X-Content-Type-Options': 'nosniff' };
        // Don't let the back button show a staff page after signing out
        if (isStaffPage) headers['Cache-Control'] = 'no-store';
        res.writeHead(200, headers);
        res.end(content);
    });
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
    try {
        // Only answer requests addressed to localhost. This blocks DNS-rebinding,
        // where a web page on another site tries to read this local server.
        if (!ALLOWED_HOSTS.has(req.headers.host)) {
            return sendJson(res, 403, { error: 'Forbidden' });
        }

        const { pathname } = new URL(req.url, `http://${HOST}`);
        const session = auth.getSession(req);

        const candidates = ROUTES.filter(r => r.path === pathname);
        if (candidates.length > 0) {
            const route = candidates.find(r => r.method === req.method);
            if (!route) {
                res.setHeader('Allow', candidates.map(r => r.method).join(', '));
                return sendJson(res, 405, { error: 'Method not allowed' });
            }
            if (route.staff && !session) return sendJson(res, 401, { error: 'Sign in required' });
            return await route.handler(req, res, session);
        }

        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
        return serveStatic(pathname, res, Boolean(session));
    } catch (err) {
        console.error(err);
        return sendJson(res, 500, { error: 'Something went wrong' });
    }
});

store.ensureFiles();

server.listen(PORT, HOST, () => {
    console.log(`SJSU Mentor Match running at http://localhost:${PORT}`);
    console.log('Responses are saved in the data/ folder.');
    console.log('Staff sign-in (demo): username "staff", password "1111". Not for production.');
});
