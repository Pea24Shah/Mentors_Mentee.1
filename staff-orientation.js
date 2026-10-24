/**
 * Orientation page editor. Staff write the page, choose who can see it, and
 * preview it as a mentee or a mentor. Every change is saved to the server;
 * mentors and mentees read the published version at /orientation.html.
 */

(function () {
    const { esc, api } = MM;
    const $ = id => document.getElementById(id);

    const AUD_LABEL = { all: 'Everyone', mentee: 'Mentees only', mentor: 'Mentors only' };
    let doc = null;
    let view = 'edit';
    let editingId = null;     // a section id, or "hero"
    let deletingId = null;
    let undoFn = null;
    let toastTimer;

    // ---------- helpers ----------

    function bodyHtml(text) {
        let out = '', inList = false;
        text.split('\n').forEach(line => {
            const t = line.trim();
            if (t.startsWith('- ')) {
                if (!inList) { out += '<ul>'; inList = true; }
                out += `<li>${esc(t.slice(2))}</li>`;
            } else {
                if (inList) { out += '</ul>'; inList = false; }
                if (t) out += `<p>${esc(t)}</p>`;
            }
        });
        return inList ? out + '</ul>' : out;
    }

    function toast(message, undo) {
        undoFn = undo || null;
        $('toastMsg').textContent = message;
        $('toastUndo').hidden = !undo;
        $('toast').hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { $('toast').hidden = true; undoFn = null; }, 5000);
    }

    function showError(message) {
        const box = $('orError');
        box.textContent = message;
        box.hidden = !message;
    }

    /** Save the whole page. New sections that were never saved have no title yet, so they stay local. */
    async function save(message, undo) {
        showError('');
        const payload = { ...doc, sections: doc.sections.filter(s => !s.isNew).map(({ id, aud, title, body }) => ({ id, aud, title, body })) };
        try {
            const { ok, data } = await api('/api/console/orientation', payload);
            if (!ok) {
                showError((data.details && data.details.join('. ')) || data.error || 'Could not save the orientation page.');
                return false;
            }
            doc.edited = data.edited;
            if (message) toast(message, undo);
            return true;
        } catch (err) {
            if (err.message !== 'Signed out') showError('Could not reach the server. Make sure it is running (node server.js).');
            return false;
        }
    }

    // ---------- rendering ----------

    function render() {
        const editing = view === 'edit';
        const sections = editing ? doc.sections : doc.sections.filter(s => !s.isNew && (s.aud === 'all' || s.aud === view));
        let h = '';

        if (editing) {
            h += `<div class="or-bar"><div class="or-visible"><span class="muted">Show on:</span>` +
                [['mentee', 'Mentee page'], ['mentor', 'Mentor page'], ['staff', 'Staff']].map(([k, label]) =>
                    `<label><input type="checkbox" data-show="${k}" ${doc.showOn[k] ? 'checked' : ''}> ${label}</label>`).join('') +
                `</div><span class="hint">${doc.edited ? `Last edited ${esc(doc.edited)}` : 'Not edited yet'}</span></div>`;
        } else if (!doc.showOn[view]) {
            h += `<div class="empty" style="margin-bottom:12px">This page is hidden from the ${view} page. Turn it on under <b>Edit</b>.</div>`;
        }

        h += '<div class="or-doc">';
        if (editing && editingId === 'hero') {
            h += `<div class="or-sec editing"><div class="eyebrow">Page heading</div>
                <input type="text" id="or-title" value="${esc(doc.title)}" maxlength="120" aria-label="Page title">
                <input type="text" id="or-subtitle" value="${esc(doc.subtitle)}" maxlength="200" aria-label="Subtitle">
                <div class="tools"><button type="button" class="btn primary small" data-or="saveHero">Save</button><button type="button" class="btn small" data-or="cancel">Cancel</button></div></div>`;
        } else {
            h += `<div class="or-hero"><h3>${esc(doc.title)}</h3>${doc.subtitle ? `<p>${esc(doc.subtitle)}</p>` : ''}${editing ? '<div style="margin-top:10px"><button type="button" class="btn small" data-or="editHero">Edit heading</button></div>' : ''}</div>`;
        }

        if (!sections.length) {
            h += `<div class="empty">${editing ? '<b>No sections yet.</b><br>Add the first section: how the program works, what you expect from each person, who to contact.' : 'Nothing to show for this audience yet.'}</div>`;
        }

        sections.forEach((s, i) => {
            if (editing && editingId === s.id) {
                h += `<div class="or-sec editing">
                    <div class="row2"><input type="text" id="or-sec-title" value="${esc(s.title)}" maxlength="150" aria-label="Section title" placeholder="Section title">
                    <select id="or-sec-aud" aria-label="Who sees this section">${Object.entries(AUD_LABEL).map(([k, label]) => `<option value="${k}" ${s.aud === k ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
                    <textarea id="or-sec-body" maxlength="4000" aria-label="Section text">${esc(s.body)}</textarea>
                    <div class="hint">Start a line with "- " to make a bullet point.</div>
                    <div class="tools"><button type="button" class="btn primary small" data-or="save" data-id="${esc(s.id)}">Save</button><button type="button" class="btn small" data-or="cancel">Cancel</button></div></div>`;
                return;
            }
            h += `<div class="or-sec"><div class="hd"><h4>${esc(s.title)}</h4>${editing ? `<span class="chip ${s.aud === 'all' ? 'matched' : s.aud}">${AUD_LABEL[s.aud]}</span>` : ''}</div>
                <div class="body">${bodyHtml(s.body)}</div>`;
            if (editing) {
                h += deletingId === s.id
                    ? `<div class="or-confirm">Delete this section? <button type="button" class="btn danger small" data-or="confirmDel" data-id="${esc(s.id)}">Delete</button><button type="button" class="btn small" data-or="cancelDel">Keep</button></div>`
                    : `<div class="tools"><button type="button" class="btn small" data-or="edit" data-id="${esc(s.id)}">Edit</button>` +
                      `<button type="button" class="btn small" data-or="up" data-id="${esc(s.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>` +
                      `<button type="button" class="btn small" data-or="down" data-id="${esc(s.id)}" ${i === sections.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>` +
                      `<button type="button" class="btn danger small" data-or="del" data-id="${esc(s.id)}">Delete</button></div>`;
            }
            h += '</div>';
        });

        if (editing) h += '<div><button type="button" class="btn primary" data-or="add">Add section</button></div>';
        $('orBody').innerHTML = h + '</div>';

        if (editing && editingId) {
            const field = $('or-sec-title') || $('or-title');
            if (field) field.focus();
        }
    }

    // ---------- events ----------

    $('orView').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        view = button.dataset.v;
        editingId = null;
        deletingId = null;
        [...$('orView').children].forEach(b => b.setAttribute('aria-pressed', b === button));
        render();
    });

    $('orBody').addEventListener('change', async event => {
        const key = event.target.dataset.show;
        if (!key) return;
        doc.showOn[key] = event.target.checked;
        const ok = await save(`${event.target.checked ? 'Showing' : 'Hiding'} orientation for ${key === 'staff' ? 'staff' : 'the ' + key + ' page'}`);
        if (!ok) doc.showOn[key] = !event.target.checked;
        render();
    });

    $('orBody').addEventListener('click', async event => {
        const button = event.target.closest('button[data-or]');
        if (!button) return;
        const action = button.dataset.or, id = button.dataset.id;
        const list = doc.sections, index = list.findIndex(s => s.id === id);

        if (action === 'edit') { editingId = id; deletingId = null; }
        if (action === 'editHero') editingId = 'hero';
        if (action === 'cancel') {
            const current = list.find(s => s.id === editingId);
            if (current && current.isNew) list.splice(list.indexOf(current), 1);
            editingId = null;
        }
        if (action === 'saveHero') {
            const title = $('or-title').value.trim();
            if (!title) { showError('The page needs a title.'); return; }
            const before = { title: doc.title, subtitle: doc.subtitle };
            doc.title = title;
            doc.subtitle = $('or-subtitle').value.trim();
            if (await save('Heading saved')) editingId = null;
            else Object.assign(doc, before);
        }
        if (action === 'save') {
            const title = $('or-sec-title').value.trim();
            if (!title) { showError('Add a section title before saving.'); return; }
            const section = list[index];
            const before = { ...section };
            Object.assign(section, { title, aud: $('or-sec-aud').value, body: $('or-sec-body').value });
            delete section.isNew;
            if (await save('Section saved')) editingId = null;
            else Object.assign(section, before);
        }
        if ((action === 'up' && index > 0) || (action === 'down' && index < list.length - 1)) {
            const other = action === 'up' ? index - 1 : index + 1;
            [list[other], list[index]] = [list[index], list[other]];
            if (!(await save())) [list[other], list[index]] = [list[index], list[other]];
        }
        if (action === 'del') deletingId = id;
        if (action === 'cancelDel') deletingId = null;
        if (action === 'confirmDel') {
            const [gone] = list.splice(index, 1);
            deletingId = null;
            const restore = async () => { list.splice(index, 0, gone); await save('Section restored'); render(); };
            if (!(await save(`Deleted “${gone.title}”`, restore))) list.splice(index, 0, gone);
        }
        if (action === 'add') {
            const newId = `s${Date.now().toString(36)}`;
            list.push({ id: newId, aud: 'all', title: '', body: '', isNew: true });
            editingId = newId;
        }
        render();
    });

    $('toastUndo').addEventListener('click', () => {
        if (undoFn) undoFn();
        undoFn = null;
        $('toast').hidden = true;
    });

    (async function load() {
        try {
            const { ok, data } = await api('/api/console/orientation');
            if (!ok) throw new Error('load failed');
            doc = data;
            render();
        } catch (err) {
            if (err.message !== 'Signed out') showError('Could not load the orientation page. Make sure the server is running (node server.js).');
        }
    })();
})();
