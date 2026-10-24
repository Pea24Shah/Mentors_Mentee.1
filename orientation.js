/**
 * Public orientation page for students and mentors. Shows only what staff
 * published for that audience. All text is added with textContent.
 */

(function () {
    const content = document.getElementById('content');
    const who = document.getElementById('who');

    function el(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    /** Lines starting with "- " become bullet points, other lines become paragraphs. */
    function renderBody(text) {
        const box = el('div', undefined, 'body');
        let list = null;
        text.split('\n').forEach(line => {
            const t = line.trim();
            if (t.startsWith('- ')) {
                if (!list) { list = el('ul'); box.append(list); }
                list.append(el('li', t.slice(2)));
            } else {
                list = null;
                if (t) box.append(el('p', t));
            }
        });
        return box;
    }

    async function show(audience) {
        [...who.children].forEach(b => b.setAttribute('aria-pressed', b.dataset.for === audience));
        content.replaceChildren(el('p', 'Loading...', 'muted'));

        try {
            const response = await fetch(`/api/orientation?for=${audience}`, { cache: 'no-store' });
            const page = await response.json();
            if (!response.ok) throw new Error(page.error || 'failed');

            if (!page.visible) {
                const empty = el('div', undefined, 'empty');
                empty.append(el('b', 'The orientation page is not published yet.'), document.createElement('br'),
                    document.createTextNode('Please check back soon.'));
                content.replaceChildren(empty);
                return;
            }

            const hero = el('div', undefined, 'or-hero');
            hero.append(el('h3', page.title));
            if (page.subtitle) hero.append(el('p', page.subtitle));

            const doc = el('div', undefined, 'or-doc');
            doc.append(hero);
            if (!page.sections.length) doc.append(el('div', 'Nothing has been added yet.', 'empty'));
            page.sections.forEach(section => {
                const box = el('div', undefined, 'or-sec');
                const head = el('div', undefined, 'hd');
                head.append(el('h4', section.title));
                box.append(head, renderBody(section.body));
                doc.append(box);
            });
            content.replaceChildren(doc);
        } catch (err) {
            content.replaceChildren(el('div', 'Could not load the orientation page. Please try again.', 'status-line'));
        }
    }

    who.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        const url = new URL(window.location.href);
        url.searchParams.set('for', button.dataset.for);
        window.history.replaceState(null, '', url);
        show(button.dataset.for);
    });

    const requested = new URLSearchParams(window.location.search).get('for');
    if (requested === 'mentee' || requested === 'mentor') show(requested);
    else content.replaceChildren(el('p', 'Choose who you are to read the orientation for you.', 'muted'));
})();
