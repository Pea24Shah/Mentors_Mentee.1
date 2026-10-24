/**
 * Staff sign-in. A dummy login for the demo: the username and password are
 * "staff" and "1111" unless STAFF_USERNAME / STAFF_PASSWORD are set when the
 * server starts. Sessions are kept in memory, so restarting the server signs
 * everyone out.
 *
 * This is NOT production security: a 4-digit password is easy to guess, and the
 * cookie has no Secure flag because the demo runs on http://localhost. Before
 * putting this on a real network, use real accounts, hashed passwords and HTTPS.
 */

const crypto = require('crypto');

const STAFF_USERNAME = process.env.STAFF_USERNAME || 'staff';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || '1111';

const COOKIE_NAME = 'session';
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 60 * 1000;

const sessions = new Map();   // token -> { expires, skipped: Set }
const failures = new Map();   // ip -> [timestamps of recent failed sign-ins]

const digest = value => crypto.createHash('sha256').update(String(value)).digest();
const sameText = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function credentialsValid(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') return false;
    if (username.length > 200 || password.length > 200) return false;
    // Check both so the time taken doesn't reveal which one was wrong
    const userOk = sameText(username, STAFF_USERNAME);
    const passOk = sameText(password, STAFF_PASSWORD);
    return userOk && passOk;
}

// ---------- limit repeated wrong passwords ----------

function recentFailures(ip) {
    const now = Date.now();
    const recent = (failures.get(ip) || []).filter(t => now - t < FAILURE_WINDOW_MS);
    failures.set(ip, recent);
    return recent;
}

const isLockedOut = ip => recentFailures(ip).length >= MAX_FAILURES;
const recordFailure = ip => recentFailures(ip).push(Date.now());
const clearFailures = ip => failures.delete(ip);

// ---------- sessions ----------

function readToken(req) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === COOKIE_NAME) return rest.join('=');
    }
    return null;
}

/** @returns {{ expires: number, skipped: Set<string> }|null} the signed-in session, if any */
function getSession(req) {
    const token = readToken(req);
    const session = token && sessions.get(token);
    if (!session) return null;
    if (session.expires < Date.now()) {
        sessions.delete(token);
        return null;
    }
    return session;
}

/** Start a new session. A fresh token every time, so an old one can't be reused. */
function createSession() {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { expires: Date.now() + SESSION_SECONDS * 1000, skipped: new Set() });
    return token;
}

function destroySession(req) {
    const token = readToken(req);
    if (token) sessions.delete(token);
}

// HttpOnly: page scripts can't read it. SameSite=Strict: other sites can't send it.
const sessionCookie = token =>
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
const clearedCookie = () =>
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

module.exports = {
    credentialsValid, isLockedOut, recordFailure, clearFailures,
    getSession, createSession, destroySession, sessionCookie, clearedCookie
};
