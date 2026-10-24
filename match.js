/**
 * Run the matching on the saved responses.
 *
 *   node match.js
 *
 * 1. Prints the match percentage for every student-mentor pair.
 * 2. Writes the automatic matches (50% or more, highest first) to data/matches.json.
 * 3. Says how many students are left for staff review. Staff do that on the
 *    review page (http://localhost:3000/review.html).
 *
 * Matches already written are never changed, so it is safe to run again.
 */

const MatchingSystem = require('./matching-algorithm.js');
const matchingService = require('./matching-service.js');
const store = require('./store.js');

store.ensureFiles();

const students = store.read('students');
const mentors = store.read('mentors');
const system = new MatchingSystem(students, mentors);

if (students.length === 0 || mentors.length === 0) {
    console.log('Need at least one student and one mentor.');
}

console.log('--- Match percentage for every student and mentor ---');
for (const student of students) {
    for (const mentor of mentors) {
        const { percentage } = system.calculateMatchScore(student, mentor);
        console.log(`${student.name}  x  ${mentor.name}:  ${percentage}%`);
    }
}

const added = matchingService.runAutoMatching();
console.log(`\n--- Automatic matches written to data/matches.json (${system.matchThreshold}% or more) ---`);
if (added.length === 0) console.log('None to add.');
for (const m of added) console.log(`${m.studentName}  ->  ${m.mentorName}:  ${m.percentage}%`);

const state = matchingService.getReviewState();
console.log(`\nStudents for staff to go through: ${state.stats.studentsToReview}`);
console.log('Staff do that after signing in at http://localhost:3000/login.html');
