/**
 * Mentor-Mentee Matching Algorithm
 *
 * Weighted scoring over the survey responses saved in data/students.json and
 * data/mentors.json. `node match.js` or the staff review page run it and write
 * data/matches.json.
 *
 * WEIGHTS (max 95 points, the percentage is score / 95)
 * -----------------------------------------------------
 * 1. Passion (40)      Student's open-ended passion text is turned into topic areas
 *                      with keyword matching. Mentor topic areas are the expertise
 *                      they ticked plus areas found in their own passion text.
 *                      1 shared area = 20, 2 = 30, 3+ = 40.
 * 2. Major (30)        Matched by broad field, not exact major: Computer Science and
 *                      Data Science are both "Computing & Data" (see MAJOR_FIELDS).
 *                      The mentor's preferred fields include the student's field,
 *                      or the mentor is open to any major.
 * 3. Style (15)        Same mentorship style, mentor is adaptable, or the student
 *                      is open to any style.
 * 4. Availability (10) Up to 3 for matching meeting frequency, plus up to 7 for
 *                      shared available days (3.5 per shared day). Days are optional.
 *
 * A pair with a percentage of 50 or more is matched automatically (plan(), step 1).
 * Below 50, staff choose between a student's top two mentors (plan(), step 2).
 *
 * "challenges" and "goals" on the student form are not used for matching.
 */

// Majors are matched by broad field, so related majors count as the same thing.
// Field name -> the specific majors in it (the "Engineering" field also covers
// the old "Engineering (Other)" choice on the mentor form).
const MAJOR_FIELDS = {
    'Computing & Data': ['Computer Science', 'Software Engineering', 'Data Science', 'Computer Engineering'],
    'Engineering': ['Electrical Engineering', 'Mechanical Engineering', 'Engineering'],
    'Business': ['Business Administration'],
    'Life & Health Sciences': ['Biology', 'Psychology'],
    'Other': ['Other']
};

// Any major name, or a field name itself -> its field
const FIELD_LOOKUP = new Map();
for (const [field, majors] of Object.entries(MAJOR_FIELDS)) {
    FIELD_LOOKUP.set(field, field);
    majors.forEach(major => FIELD_LOOKUP.set(major, field));
}

class MatchingSystem {
    /**
     * The field a major (or a field name) belongs to, or null if unknown.
     * @param {string} value
     * @returns {string|null}
     */
    static majorFieldOf(value) {
        return FIELD_LOOKUP.get(value) || null;
    }

    /**
     * @param {Object[]} students - Student responses
     * @param {Object[]} mentors - Mentor responses
     */
    constructor(students = [], mentors = []) {
        this.students = students;
        this.mentors = mentors;

        this.weights = {
            passion: 10,
            major: 40,
            style: 15,
            availability: 80
        };

        // A student-mentor pair with a percentage at or above this is a match
        this.matchThreshold = 50;

        // Keyword -> topic areas (areas use the same names as the mentor expertise options)
        this.passionKeywords = {
            // Technology & Development
            'software': ['Software Development', 'Technical Skills', 'Career Development'],
            'coding': ['Software Development', 'Technical Skills'],
            'programming': ['Software Development', 'Technical Skills'],
            'develop': ['Software Development', 'Product Management'],
            'build': ['Software Development', 'Entrepreneurship'],
            'app': ['Software Development', 'Product Management'],
            'web': ['Software Development', 'Technical Skills'],

            // AI & Data
            'ai': ['Data Science & Analytics', 'Research & Academia'],
            'artificial intelligence': ['Data Science & Analytics', 'Research & Academia'],
            'machine learning': ['Data Science & Analytics', 'Research & Academia'],
            'ml': ['Data Science & Analytics', 'Research & Academia'],
            'data': ['Data Science & Analytics', 'Technical Skills'],
            'analytics': ['Data Science & Analytics', 'Career Development'],
            'science': ['Research & Academia', 'Data Science & Analytics'],

            // Business & Entrepreneurship
            'startup': ['Entrepreneurship', 'Product Management'],
            'business': ['Entrepreneurship', 'Career Development'],
            'entrepreneur': ['Entrepreneurship', 'Leadership & Management'],
            'company': ['Entrepreneurship', 'Career Development'],
            'found': ['Entrepreneurship'],
            'innovate': ['Entrepreneurship', 'Product Management'],
            'product': ['Product Management', 'Career Development'],

            // Research & Academia
            'research': ['Research & Academia', 'Graduate School Applications'],
            'phd': ['Research & Academia', 'Graduate School Applications'],
            'graduate': ['Graduate School Applications', 'Research & Academia'],
            'academic': ['Research & Academia'],
            'professor': ['Research & Academia'],
            'paper': ['Research & Academia'],
            'study': ['Research & Academia', 'Graduate School Applications'],

            // Leadership & Management
            'lead': ['Leadership & Management', 'Career Development'],
            'manage': ['Leadership & Management', 'Product Management'],
            'team': ['Leadership & Management', 'Career Development'],
            'executive': ['Leadership & Management', 'Career Development'],

            // Career & Skills
            'career': ['Career Development', 'Networking'],
            'job': ['Career Development', 'Networking'],
            'skill': ['Technical Skills', 'Career Development'],
            'learn': ['Technical Skills', 'Career Development'],
            'network': ['Networking', 'Career Development'],
            'interview': ['Career Development', 'Networking'],

            // Healthcare & Medicine
            'health': ['Healthcare', 'Research & Academia'],
            'medical': ['Healthcare', 'Research & Academia'],
            'medicine': ['Healthcare', 'Graduate School Applications'],
            'hospital': ['Healthcare'],

            // Environmental & Social
            'environment': ['Environmental Sustainability', 'Research & Academia'],
            'sustainability': ['Environmental Sustainability', 'Entrepreneurship'],
            'green': ['Environmental Sustainability'],
            'climate': ['Environmental Sustainability', 'Research & Academia'],
            'social': ['Social Impact', 'Entrepreneurship'],
            'impact': ['Social Impact', 'Entrepreneurship'],
            'nonprofit': ['Social Impact', 'Entrepreneurship'],
            'community': ['Social Impact', 'Networking'],

            // Finance
            'finance': ['Finance & Investment', 'Data Science & Analytics'],
            'investment': ['Finance & Investment'],
            'fintech': ['Finance & Investment', 'Software Development'],
            'banking': ['Finance & Investment', 'Career Development'],

            // Creative & Design
            'design': ['Product Management', 'Technical Skills'],
            'creative': ['Product Management', 'Entrepreneurship'],
            'ux': ['Product Management', 'Technical Skills'],
            'ui': ['Product Management', 'Technical Skills']
        };

        // Pre-compile keyword patterns. Short keywords (ai, ml, ux, ui, app) must
        // match a whole word, otherwise "ai" matches "maintain" and "ui" matches
        // "build". Longer keywords match word prefixes so "build" catches "building".
        this.passionPatterns = Object.entries(this.passionKeywords).map(([keyword, areas]) => {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = keyword.length <= 3 ? `\\b${escaped}s?\\b` : `\\b${escaped}`;
            return { regex: new RegExp(pattern), areas };
        });
    }

    /**
     * Turn free text into a set of topic areas using the keyword map.
     * @param {string} text
     * @returns {Set<string>}
     */
    extractAreas(text) {
        const areas = new Set();
        if (!text || !text.trim()) return areas;

        const lower = text.toLowerCase();
        for (const { regex, areas: keywordAreas } of this.passionPatterns) {
            if (regex.test(lower)) {
                keywordAreas.forEach(area => areas.add(area));
            }
        }
        return areas;
    }

    /**
     * Topic areas a mentor covers: ticked expertise plus areas in their passion text.
     * @param {Object} mentor
     * @returns {Set<string>}
     */
    getMentorAreas(mentor) {
        const areas = this.extractAreas(mentor.passion);
        (mentor.expertise || []).forEach(area => areas.add(area));
        return areas;
    }

    /**
     * Score one student-mentor pair.
     * @returns {Object} { score, maxScore, percentage, isMatch, details, breakdown }
     */
    calculateMatchScore(student, mentor) {
        let score = 0;
        const details = [];
        const breakdown = { passion: 0, major: 0, style: 0, availability: 0 };

        // 1. Passion
        const passion = this.calculatePassionMatch(student, mentor);
        if (passion.score > 0) {
            score += passion.score;
            breakdown.passion = passion.score;
            details.push(`Passion alignment: ${passion.matchedAreas.join(', ')}`);
        }

        // 2. Major
        const majorScore = this.calculateMajorMatch(student, mentor);
        if (majorScore > 0) {
            score += majorScore;
            breakdown.major = majorScore;
            details.push('Major aligned');
        }

        // 3. Mentorship style
        const styleScore = this.calculateStyleMatch(student, mentor);
        if (styleScore > 0) {
            score += styleScore;
            breakdown.style = styleScore;
            details.push('Mentorship style compatible');
        }

        // 4. Availability (frequency + days)
        const availability = this.calculateAvailabilityMatch(student, mentor);
        if (availability.score > 0) {
            score += availability.score;
            breakdown.availability = availability.score;
            if (availability.frequencyMatch) details.push('Meeting frequency aligned');
            if (availability.daysMatch > 0) details.push(`Available ${availability.daysMatch} same day(s)`);
        }

        // Weights add up to 95, so divide by the real maximum: a perfect pair is 100%
        const maxScore = Object.values(this.weights).reduce((sum, w) => sum + w, 0);
        const percentage = Math.round((score / maxScore) * 100);

        return {
            score,
            maxScore,
            percentage,
            isMatch: percentage >= this.matchThreshold,
            details,
            breakdown
        };
    }

    /**
     * Student passion areas vs mentor areas.
     */
    calculatePassionMatch(student, mentor) {
        const studentAreas = this.extractAreas(student.passion);
        const mentorAreas = this.getMentorAreas(mentor);
        const matchedAreas = [...studentAreas].filter(area => mentorAreas.has(area));

        if (matchedAreas.length === 0) return { score: 0, matchedAreas };
        if (matchedAreas.length === 1) return { score: this.weights.passion * 0.5, matchedAreas };
        if (matchedAreas.length === 2) return { score: this.weights.passion * 0.75, matchedAreas };
        return { score: this.weights.passion, matchedAreas };
    }

    /**
     * Student major vs mentor preferred majors, compared by broad field.
     * A mentor who wants "Computer Science" students (or the "Computing & Data"
     * field) matches Data Science students too. Mentors saved before the fields
     * existed still work, because their specific majors map to a field.
     */
    calculateMajorMatch(student, mentor) {
        if (!mentor.preferredMajors) return 0;
        if (mentor.preferredMajors.includes('Any')) return this.weights.major;

        const studentField = MatchingSystem.majorFieldOf(student.major);
        if (!studentField) return 0;

        const wantedFields = mentor.preferredMajors.map(major => MatchingSystem.majorFieldOf(major));
        return wantedFields.includes(studentField) ? this.weights.major : 0;
    }

    /**
     * Mentorship style compatibility.
     */
    calculateStyleMatch(student, mentor) {
        if (!student.mentorStyle || !mentor.mentorshipStyle) return 0;

        if (student.mentorStyle === mentor.mentorshipStyle ||
            mentor.mentorshipStyle === 'Adaptable to student needs' ||
            student.mentorStyle === 'Open to any') {
            return this.weights.style;
        }
        return 0;
    }

    /**
     * Meeting frequency compatibility.
     * @returns {boolean}
     */
    calculateMeetingMatch(student, mentor) {
        if (!student.meetingPreference || !mentor.availability) return false;

        return student.meetingPreference === mentor.availability ||
            student.meetingPreference === 'As needed';
    }

    /**
     * Availability: 3 points for frequency, up to 7 for shared days.
     * Days are optional. If either side left them blank, no day points are given.
     */
    calculateAvailabilityMatch(student, mentor) {
        const result = { score: 0, frequencyMatch: false, daysMatch: 0 };

        result.frequencyMatch = this.calculateMeetingMatch(student, mentor);

        const studentDays = student.availableDays || [];
        const mentorDays = mentor.availableDays || [];
        if (studentDays.length > 0 && mentorDays.length > 0) {
            result.daysMatch = studentDays.filter(day => mentorDays.includes(day)).length;
        }

        let score = 0;
        if (result.frequencyMatch) score += 3;
        if (result.daysMatch > 0) score += Math.min(7, result.daysMatch * 3.5);

        result.score = Math.min(score, this.weights.availability);
        return result;
    }

    /**
     * Current state of the matching pool.
     *  - matches (final): the student and the mentor are both taken out of the pool
     *  - denials (staff said no): the mentor stays in the pool, but that exact
     *    student-mentor pair is never offered again
     *
     * @param {Object[]} matches - [{ studentId, mentorId }]
     * @param {Object[]} denials - [{ studentId, mentorIds: [...] }] (or a single mentorId)
     */
    poolState(matches = [], denials = []) {
        const matchedStudents = new Set();
        const matchedMentors = new Set();
        const deniedPairs = new Set();
        const denialCounts = new Map();

        for (const m of matches) {
            matchedStudents.add(m.studentId);
            matchedMentors.add(m.mentorId);
        }
        for (const d of denials) {
            if (d.decision && d.decision !== 'denied') continue;
            const mentorIds = Array.isArray(d.mentorIds) ? d.mentorIds : [d.mentorId];
            mentorIds.forEach(id => deniedPairs.add(`${d.studentId}|${id}`));
            denialCounts.set(d.studentId, (denialCounts.get(d.studentId) || 0) + 1);
        }
        return { matchedStudents, matchedMentors, deniedPairs, denialCounts };
    }

    /**
     * The plan from the current pool.
     *
     * Step 1, automatic: every pair at or above the match threshold is a candidate.
     * Highest score first, a pair is matched if neither side is taken yet. So each
     * student gets the highest-scoring mentor still free.
     *
     * Step 2, staff walk-through: only once step 1 has nothing left to do. Every
     * student who is not matched gets one entry, in this order:
     *   a. Students with options: their top two available mentors below the
     *      threshold (they must share at least something, score > 0). Students who
     *      staff have denied fewer times go first, so after a deny the student moves
     *      to the back of the line. Within that, the closest to the threshold first.
     *   b. Students with no option left: no mentor is available for them at the
     *      moment. They follow, in submission order, with an empty `options` list.
     *
     * A denied pair is never offered again, but both mentors stay in the pool for
     * other students. Ties go to the earlier submission.
     *
     * @returns {{ auto: Object[], queue: Object[] }}
     *   auto:  [{ student, mentor, result }]
     *   queue: [{ student, options: [{ mentor, result }], denials }]  (empty while auto is not empty)
     */
    plan(matches = [], denials = []) {
        const state = this.poolState(matches, denials);

        const pairs = [];
        for (const student of this.students) {
            if (state.matchedStudents.has(student.id)) continue;
            for (const mentor of this.mentors) {
                if (state.matchedMentors.has(mentor.id)) continue;
                if (state.deniedPairs.has(`${student.id}|${mentor.id}`)) continue;
                pairs.push({ student, mentor, result: this.calculateMatchScore(student, mentor) });
            }
        }

        // Array.sort is stable, so equal scores keep submission order
        const byScore = (a, b) => b.result.score - a.result.score;

        // Step 1: automatic matches
        const takenStudents = new Set();
        const takenMentors = new Set();
        const auto = [];
        for (const pair of pairs.filter(p => p.result.isMatch).sort(byScore)) {
            if (takenStudents.has(pair.student.id) || takenMentors.has(pair.mentor.id)) continue;
            takenStudents.add(pair.student.id);
            takenMentors.add(pair.mentor.id);
            auto.push(pair);
        }
        if (auto.length > 0) return { auto, queue: [] };

        // Step 2: two options per student for staff
        const optionsByStudent = new Map();
        for (const pair of pairs.filter(p => p.result.score > 0).sort(byScore)) {
            const list = optionsByStudent.get(pair.student.id) || [];
            if (list.length < 2) {
                list.push({ mentor: pair.mentor, result: pair.result });
                optionsByStudent.set(pair.student.id, list);
            }
        }

        const unmatched = this.students.filter(s => !state.matchedStudents.has(s.id));
        const entry = (student, options) => ({ student, options, denials: state.denialCounts.get(student.id) || 0 });

        const withOptions = unmatched
            .filter(s => optionsByStudent.has(s.id))
            .map(s => entry(s, optionsByStudent.get(s.id)))
            .sort((a, b) => a.denials - b.denials || b.options[0].result.score - a.options[0].result.score);

        const withoutOptions = unmatched
            .filter(s => !optionsByStudent.has(s.id))
            .map(s => entry(s, []));

        return { auto: [], queue: [...withOptions, ...withoutOptions] };
    }
}

MatchingSystem.MAJOR_FIELDS = MAJOR_FIELDS;

// Node export (used by matching-service.js and the scripts)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MatchingSystem;
}
