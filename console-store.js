/**
 * JSON storage for the staff console's own data. Kept separate from store.js,
 * which saves the survey responses and matches and is not changed.
 *
 *   data/orientation.json  the orientation page staff write
 *   data/program.json      lesson cadence and the date match emails were sent
 *   data/attendance.json   { "2026-11-22": ["<person id>", ...] }
 *   data/homework.json     { "<student id>": ["2026-11-22:pre", ...] } work turned in
 *
 * Synchronous reads and writes, so a read-modify-write can't interleave with
 * another request in the single Node process.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const fileFor = name => path.join(DATA_DIR, `${name}.json`);

/** Read a file, or a copy of `fallback` if it doesn't exist yet. A corrupt file throws. */
function read(name, fallback) {
    try {
        return JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
    } catch (err) {
        if (err.code === 'ENOENT') return JSON.parse(JSON.stringify(fallback));
        throw err;
    }
}

/** Write through a temp file so a crash can't leave half a file. */
function write(name, data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${fileFor(name)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, fileFor(name));
}

// ---------- backups (written before anything is deleted, so it can be undone) ----------

const BACKUP_DIR = path.join(DATA_DIR, 'backups');

/** Save a copy to data/backups/<prefix>-<timestamp>.json. Returns its path relative to the project. */
function writeBackup(prefix, data) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(BACKUP_DIR, name), JSON.stringify(data, null, 2) + '\n');
    return `data/backups/${name}`;
}

/** The newest backup for a prefix, or null. */
function latestBackup(prefix) {
    let names;
    try {
        names = fs.readdirSync(BACKUP_DIR);
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
    const name = names.filter(n => n.startsWith(`${prefix}-`) && n.endsWith('.json')).sort().pop();
    if (!name) return null;
    return { name, path: `data/backups/${name}`, data: JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, name), 'utf8')) };
}

function removeBackup(name) {
    fs.unlinkSync(path.join(BACKUP_DIR, path.basename(name)));
}

module.exports = { read, write, writeBackup, latestBackup, removeBackup };
