/**
 * JSON file storage for survey responses.
 *
 *   data/students.json   student responses
 *   data/mentors.json    mentor responses
 *   data/matches.json    final matches (automatic and staff-approved), one per student
 *   data/decisions.json  manual reviews that staff denied (so those pairs are not offered again)
 *
 * Reads and writes are synchronous, so a read-modify-write can't interleave
 * with another request in the single Node process.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    students: path.join(DATA_DIR, 'students.json'),
    mentors: path.join(DATA_DIR, 'mentors.json'),
    matches: path.join(DATA_DIR, 'matches.json'),
    decisions: path.join(DATA_DIR, 'decisions.json')
};

/** Read a JSON file. A missing file reads as the fallback. A corrupt file throws. */
function read(name, fallback = []) {
    try {
        return JSON.parse(fs.readFileSync(FILES[name], 'utf8'));
    } catch (err) {
        if (err.code === 'ENOENT') return fallback;
        throw err;
    }
}

/** Write a JSON file through a temp file so a crash can't leave half a file. */
function write(name, data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILES[name]}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, FILES[name]);
}

/** One row in data/matches.json. method is "auto" or "staff". */
function makeMatchRecord(student, mentor, percentage, method, matchedAt = new Date().toISOString()) {
    return {
        id: crypto.randomUUID(),
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        mentorId: mentor.id,
        mentorName: mentor.name,
        mentorEmail: mentor.email,
        percentage,
        method,
        matchedAt
    };
}

/**
 * Convert data written by the earlier review flow:
 *  - matches.json used to hold a report object. It now holds the list of final matches.
 *  - approvals used to be stored in decisions.json. They are now rows in matches.json.
 */
function migrate() {
    let matches = read('matches');
    let changed = false;
    if (!Array.isArray(matches)) {
        matches = [];
        changed = true;
    }

    const decisions = read('decisions');
    const approved = decisions.filter(d => d.decision === 'approved');
    if (approved.length > 0) {
        const students = read('students');
        const mentors = read('mentors');
        for (const d of approved) {
            const student = students.find(s => s.id === d.studentId);
            const mentor = mentors.find(m => m.id === d.mentorId);
            const exists = matches.some(m => m.studentId === d.studentId && m.mentorId === d.mentorId);
            if (student && mentor && !exists) {
                matches.push(makeMatchRecord(student, mentor, d.percentage, 'staff', d.decidedAt));
            }
        }
        // Write matches first, so a crash between the two writes can't lose an approval
        write('matches', matches);
        write('decisions', decisions.filter(d => d.decision !== 'approved'));
        return;
    }
    if (changed) write('matches', matches);
}

/** Create the empty data files if they don't exist yet, and convert older data. */
function ensureFiles() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const name of ['students', 'mentors', 'decisions', 'matches']) {
        if (!fs.existsSync(FILES[name])) write(name, []);
    }
    migrate();
}

/**
 * Save a response. If the same email already answered, replace that answer
 * instead of adding a duplicate.
 * @param {'students'|'mentors'} kind
 * @param {Object} record - must include id and email
 */
function saveResponse(kind, record) {
    const records = read(kind);
    const index = records.findIndex(r => r.email === record.email);
    if (index >= 0) {
        // Keep the original id so earlier staff decisions stay attached to this person
        record.id = records[index].id;
        records[index] = record;
    } else {
        records.push(record);
    }
    write(kind, records);
    return { replaced: index >= 0 };
}

module.exports = { read, write, saveResponse, ensureFiles, makeMatchRecord, DATA_DIR };
