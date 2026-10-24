/**
 * Survey page controller.
 * Shows the right form and sends each submission to the server,
 * which saves it to data/students.json or data/mentors.json.
 */

const roleSelection = document.getElementById('roleSelection');
const forms = {
    students: document.getElementById('studentForm'),
    mentors: document.getElementById('mentorForm')
};
const successPanels = [document.getElementById('studentSuccess'), document.getElementById('mentorSuccess')];

function showStudentSurvey() {
    roleSelection.style.display = 'none';
    forms.students.classList.add('active');
}

function showMentorSurvey() {
    roleSelection.style.display = 'none';
    forms.mentors.classList.add('active');
}

function goBack() {
    roleSelection.style.display = 'block';
    Object.values(forms).forEach(form => {
        form.classList.remove('active');
        form.reset();
        showError(form, '');
    });
    successPanels.forEach(panel => panel.classList.add('hidden'));
}

function showError(form, message) {
    const box = form.querySelector('.form-error');
    box.textContent = message;
    box.hidden = !message;
}

/** Collect a form into the JSON shape the server expects. */
function collect(form) {
    const data = {};
    const checkboxes = {};

    for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === 'checkbox') {
            checkboxes[el.name] = checkboxes[el.name] || [];
            if (el.checked) checkboxes[el.name].push(el.value);
        } else {
            data[el.name] = el.value.trim();
        }
    }
    return { ...data, ...checkboxes };
}

/** Required checkbox groups can't use the browser's `required`, so check them here. */
function missingGroup(form, data) {
    for (const group of form.querySelectorAll('[data-required-group]')) {
        if (!data[group.dataset.requiredGroup]?.length) {
            return `Please choose ${group.dataset.label}.`;
        }
    }
    return '';
}

async function submitSurvey(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const data = collect(form);

    const missing = missingGroup(form, data);
    if (missing) {
        showError(form, missing);
        return;
    }

    showError(form, '');
    button.disabled = true;

    try {
        const response = await fetch(`/api/${form.dataset.kind}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            const details = result.details ? ` (${result.details.join(', ')})` : '';
            showError(form, (result.error || 'Could not save your answers.') + details);
            return;
        }

        form.classList.remove('active');
        document.getElementById(form.dataset.success).classList.remove('hidden');
        form.reset();
    } catch (err) {
        showError(form, 'Could not reach the server. Make sure it is running (node server.js).');
    } finally {
        button.disabled = false;
    }
}

Object.values(forms).forEach(form => form.addEventListener('submit', submitSurvey));

// The home page links straight to a form with ?role=student or ?role=mentor
const requestedRole = new URLSearchParams(window.location.search).get('role');
if (requestedRole === 'student') showStudentSurvey();
if (requestedRole === 'mentor') showMentorSurvey();
