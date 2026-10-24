/**
 * Matching workflow on top of the saved files. Used by server.js and match.js.
 *
 *  1. runAutoMatching()  pairs every student who has a mentor at 50% or more with
 *                        their highest-scoring free mentor and writes those
 *                        matches to data/matches.json.
 *  2. getReviewState() / applyDecision() / skipStudent()
 *                        staff then go through every student who is still
 *                        unmatched, one at a time. A student with options gets
 *                        their top two mentors: staff accept one, or deny both
 *                        (those mentors stay in the pool). A student with no
 *                        mentor available at the moment is shown as such.
 */

const crypto = require('crypto');
const MatchingSystem = require('./matching-algorithm.js');
const store = require('./store.js');

const pick = (obj, fields) => Object.fromEntries(fields.map(f => [f, obj[f]]));

const STUDENT_FIELDS = ['id', 'name', 'email', 'major', 'year', 'passion', 'mentorStyle',
    'meetingPreference', 'availableDays', 'challenges', 'goals'];
const MENTOR_FIELDS = ['id', 'name', 'email', 'title', 'company', 'passion', 'expertise',
    'preferredMajors', 'mentorshipStyle', 'availability', 'availableDays'];

function load() {
    const students = store.read('students');
    const mentors = store.read('mentors');
    const matches = store.read('matches');
    const denials = store.read('decisions');
    return { students, mentors, matches, denials, system: new MatchingSystem(students, mentors) };
}

/**
 * Write the automatic matches. Safe to run again: it only adds matches for
 * students and mentors that are still free, and never changes a match already written.
 * @returns {Object[]} the matches added by this run
 */
function runAutoMatching() {
    const { matches, denials, system } = load();
    const { auto } = system.plan(matches, denials);
    if (auto.length === 0) return [];

    const added = auto.map(({ student, mentor, result }) =>
        store.makeMatchRecord(student, mentor, result.percentage, 'auto'));
    store.write('matches', [...matches, ...added]);
    return added;
}

/**
 * Everything the staff review page needs.
 * @param {Set<string>} skipped - students staff skipped in this sign-in session
 */
function getReviewState(skipped = new Set()) {
    const { students, mentors, matches, denials, system } = load();
    const { auto, queue } = system.plan(matches, denials);
    const pool = system.poolState(matches, denials);

    // What staff see next: the first student who was not skipped
    const upcoming = queue.filter(q => !skipped.has(q.student.id));
    const next = upcoming[0] || null;
    const proposal = next && {
        kind: next.options.length > 0 ? 'options' : 'none',
        student: pick(next.student, STUDENT_FIELDS),
        options: next.options.map(({ mentor, result }) => ({
            percentage: result.percentage,
            breakdown: result.breakdown,
            details: result.details,
            mentor: pick(mentor, MENTOR_FIELDS)
        }))
    };

    const reasonFor = student => {
        if (auto.length > 0) return 'Waiting for automatic matching';
        const entry = queue.find(q => q.student.id === student.id);
        if (!entry) return 'No mentors available at the moment';
        if (skipped.has(student.id)) return 'Skipped for now';
        if (entry.options.length > 0) return 'Waiting for staff review';
        return entry.denials > 0
            ? 'No mentors left (suggested mentors were denied or matched)'
            : 'No mentors available at the moment';
    };

    return {
        threshold: system.matchThreshold,
        weights: system.weights,
        autoPending: auto.length,
        stats: {
            students: students.length,
            mentors: mentors.length,
            autoMatches: matches.filter(m => m.method === 'auto').length,
            staffMatches: matches.filter(m => m.method === 'staff').length,
            studentsToReview: upcoming.length,
            skipped: queue.filter(q => skipped.has(q.student.id)).length,
            studentsWithoutMentor: students.filter(s => !pool.matchedStudents.has(s.id)).length,
            mentorsAvailable: mentors.filter(m => !pool.matchedMentors.has(m.id)).length
        },
        proposal,
        matches: matches.map(m => pick(m, ['studentName', 'studentEmail', 'mentorName', 'mentorEmail',
            'percentage', 'method', 'matchedAt'])),
        unmatched: students
            .filter(s => !pool.matchedStudents.has(s.id))
            .map(s => ({ name: s.name, email: s.email, major: s.major, reason: reasonFor(s) }))
    };
}

/**
 * Record a staff decision on one student.
 *  approved: the chosen mentor is matched with the student (written to matches.json)
 *  denied:   neither offered mentor is paired with this student. Both stay in the pool,
 *            and the student comes up again later with the next best mentors.
 * `offered` must be exactly the mentors the staff member was looking at.
 *
 * @returns {{ status: number, body: Object }}
 */
function applyDecision({ studentId, decision, mentorId, offered }, skipped = new Set()) {
    const validIds = Array.isArray(offered) && offered.length >= 1 && offered.length <= 2 &&
        offered.every(id => typeof id === 'string');
    if (typeof studentId !== 'string' || !validIds || !['approved', 'denied'].includes(decision) ||
        (decision === 'approved' && (typeof mentorId !== 'string' || !offered.includes(mentorId)))) {
        return { status: 400, body: { error: 'Send studentId, decision, offered (1 or 2 mentor ids) and, for approved, the chosen mentorId' } };
    }

    const { students, mentors, matches, denials, system } = load();
    const student = students.find(s => s.id === studentId);
    if (!student) return { status: 404, body: { error: 'Student not found' } };

    // The page may be out of date. Only act on exactly what staff were shown.
    const { auto, queue } = system.plan(matches, denials);
    const entry = queue.find(q => q.student.id === studentId);
    const current = entry ? entry.options.map(o => o.mentor.id) : [];
    const sameOptions = current.length === offered.length && offered.every(id => current.includes(id));

    if (auto.length > 0 || !entry || !sameOptions) {
        const error = auto.length > 0
            ? 'Automatic matches are waiting to be written first'
            : 'This review is out of date';
        return { status: 409, body: { error, state: getReviewState(skipped) } };
    }

    if (decision === 'approved') {
        const option = entry.options.find(o => o.mentor.id === mentorId);
        const mentor = mentors.find(m => m.id === mentorId);
        store.write('matches', [...matches,
            store.makeMatchRecord(student, mentor, option.result.percentage, 'staff')]);
    } else {
        store.write('decisions', [...denials, {
            id: crypto.randomUUID(),
            studentId,
            mentorIds: current,
            decision: 'denied',
            decidedAt: new Date().toISOString()
        }]);
    }

    return { status: 201, body: { ok: true, state: getReviewState(skipped) } };
}

/**
 * Move past a student without deciding (also used to move on from a student with
 * no mentor available). Only lasts for this sign-in session. Nothing is saved to
 * the data files, so the student is shown again next time.
 */
function skipStudent({ studentId }, skipped) {
    if (typeof studentId !== 'string') return { status: 400, body: { error: 'Send studentId' } };
    if (!store.read('students').some(s => s.id === studentId)) {
        return { status: 404, body: { error: 'Student not found' } };
    }
    skipped.add(studentId);
    return { status: 201, body: { ok: true, state: getReviewState(skipped) } };
}

/** Bring skipped students back into the walk-through. */
function clearSkipped(skipped) {
    skipped.clear();
    return { status: 201, body: { ok: true, state: getReviewState(skipped) } };
}

module.exports = { runAutoMatching, getReviewState, applyDecision, skipStudent, clearSkipped };
