(function ($, mw) {
    'use strict';

    const SPECIAL_PAGE_NAME = 'বিশেষ:খালি_পাতা/ImportTool';
    const DRAFTS_SUBPAGE    = 'User:' + mw.config.get('wgUserName') + '/ImportToolDrafts.json';
    const MAX_DRAFTS        = 10;

    function init() {
        mw.loader.using(['mediawiki.util'], function () {
            mw.util.addPortletLink('p-tb', mw.util.getUrl(SPECIAL_PAGE_NAME),
                'আমদানি সরঞ্জাম', 't-import-tool', 'পাতা অনুবাদ ও আমদানি করুন');
        });
        if (mw.config.get('wgPageName') === SPECIAL_PAGE_NAME) {
            mw.loader.using([
                'mediawiki.api', 'mediawiki.util',
                'oojs-ui-core', 'oojs-ui-widgets', 'oojs-ui-windows',
                'oojs-ui.styles.icons-editing-core', 'oojs-ui.styles.icons-content'
            ], loadTool);
        }
    }

    async function analyzeContent(content, api, options) {
        const opts = Object.assign({
            fixLinksEng: true, fixLinksRed: true, fixCatsEng: true, fixCatsRed: true,
            fixTempsEng: true, fixTempsRed: true, onlyRedTemplates: true
        }, options);

        const linkRegex            = /\[\[\s*([^|\]]+?)\s*(?:\|([^\]]+))?\]\]/g;
        const redTemplateRegex     = /\{\{(?:অনিবন্ধিত|বাংলায় নেই|মৌলিক নিবন্ধ)\|([^\|\}]+)\|([^\}]+)\}\}/g;
        const generalTemplateRegex = /\{\{\s*([a-zA-Z][^|{}#]*?)\s*(?:\||\}\})/g;

        let match;
        const candidates = new Set();

        if (opts.fixLinksEng || opts.fixLinksRed || opts.fixCatsEng || opts.fixCatsRed) {
            while ((match = linkRegex.exec(content)) !== null) {
                const target = match[1];
                if (/^(File|Image|চিত্র):/i.test(target)) continue;
                if (/[a-zA-Z]/.test(target)) {
                    let c = target.split('#')[0].trim().replace(/^:?en:/i, '');
                    if (c) { if (c.startsWith(':')) c = c.substring(1); candidates.add(c); }
                }
            }
        }
        if (opts.fixTempsEng || opts.fixTempsRed) {
            while ((match = redTemplateRegex.exec(content)) !== null) {
                const t = match[1]; if (/[a-zA-Z]/.test(t)) { const c = t.split('#')[0].trim(); if (c) candidates.add(c); }
            }
            while ((match = generalTemplateRegex.exec(content)) !== null) {
                const t = match[1].trim();
                if (t.includes(':') && !t.toLowerCase().startsWith('template:')) continue;
                candidates.add(t.toLowerCase().startsWith('template:') ? t : 'Template:' + t);
            }
        }
        if (candidates.size === 0) return { changes: [], allCandidates: [], newContent: content, missingTemplates: [] };

        if ((opts.fixTempsEng || opts.fixTempsRed) && opts.onlyRedTemplates) {
            const tc = Array.from(candidates).filter(c => c.toLowerCase().startsWith('template:'));
            for (let i = 0; i < tc.length; i += 50) {
                const chunk = tc.slice(i, i + 50);
                try {
                    const localData = await api.get({ action: 'query', titles: chunk.join('|'), formatversion: 2 });
                    const nm = {};
                    if (localData.query.normalized) localData.query.normalized.forEach(n => nm[n.to] = n.from);
                    localData.query.pages.forEach(p => {
                        if (!p.missing) {
                            if (candidates.has(p.title)) candidates.delete(p.title);
                            else if (nm[p.title] && candidates.has(nm[p.title])) candidates.delete(nm[p.title]);
                        }
                    });
                } catch (e) { console.error('Local check failed', e); }
            }
            if (candidates.size === 0) return { changes: [], allCandidates: [], newContent: content, missingTemplates: [] };
        }

        const enApi = new mw.ForeignApi('https://en.wikipedia.org/w/api.php');
        const wdApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php');
        const candidateArray = Array.from(candidates);
        const mappings = {};
        const missingTemplates = [];

        for (let i = 0; i < candidateArray.length; i += 50) {
            const chunk = candidateArray.slice(i, i + 50);
            const enData = await enApi.get({
                action: 'query', titles: chunk.join('|'), redirects: 1,
                prop: 'pageprops', ppprop: 'wikibase_item', formatversion: 2
            });
            const normMap = {}; if (enData.query.normalized) enData.query.normalized.forEach(n => normMap[n.from] = n.to);
            const redirectMap = {}; if (enData.query.redirects) enData.query.redirects.forEach(r => redirectMap[r.from] = r.to);
            const titleToQid = {}; const qids = [];
            enData.query.pages.forEach(p => {
                if (p.pageprops && p.pageprops.wikibase_item) { qids.push(p.pageprops.wikibase_item); titleToQid[p.title] = p.pageprops.wikibase_item; }
            });
            if (qids.length === 0) continue;
            const wdData = await wdApi.get({ action: 'wbgetentities', ids: qids.join('|'), props: 'sitelinks', sitefilter: 'bnwiki', formatversion: 2 });
            chunk.forEach(origTitle => {
                let nt = normMap[origTitle] || origTitle;
                let rt = redirectMap[nt] || nt;
                if (redirectMap[rt]) rt = redirectMap[rt];
                const qid = titleToQid[rt];
                const isRedirect = (rt !== nt && rt !== origTitle);
                if (qid) {
                    if (wdData.entities[qid]?.sitelinks?.bnwiki) {
                        mappings[origTitle] = { title: wdData.entities[qid].sitelinks.bnwiki.title, isRedirect };
                    } else if (rt.toLowerCase().startsWith('template:') || rt.toLowerCase().startsWith('category:')) {
                        missingTemplates.push({ title: origTitle, qid, resolvedTitle: rt, isRedirect });
                    }
                }
            });
        }

        const changes = [];
        let newContent = content;

        if (opts.fixLinksEng || opts.fixLinksRed || opts.fixCatsEng || opts.fixCatsRed) {
            newContent = newContent.replace(linkRegex, (match, target, label) => {
                let ct = target.split('#')[0].trim().replace(/^:?en:/i, '');
                const anchor = target.includes('#') ? '#' + target.split('#')[1] : '';
                if (/^(File|Image|চিত্র):/i.test(ct)) return match;
                const isCat = /^(Category|বিষয়শ্রেণী):/i.test(ct);
                const lu = ct.startsWith(':') ? ct.substring(1) : ct;
                const me = mappings[lu];
                if (me) {
                    if (isCat) { if (me.isRedirect && !opts.fixCatsRed) return match; if (!me.isRedirect && !opts.fixCatsEng) return match; }
                    else { if (me.isRedirect && !opts.fixLinksRed) return match; if (!me.isRedirect && !opts.fixLinksEng) return match; }
                    let nt2 = me.title + anchor;
                    if ((target.trim().startsWith(':') || /^\s*:?en:/i.test(target)) && !nt2.startsWith(':') &&
                        (nt2.startsWith('Category:') || nt2.startsWith('বিষয়শ্রেণী:') || nt2.startsWith('File:') || nt2.startsWith('চিত্র:'))) nt2 = ':' + nt2;
                    const nl = label ? `[[${nt2}|${label}]]` : `[[${nt2}]]`;
                    if (match !== nl) { changes.push({ original: ct + (me.isRedirect ? ' (R)' : ''), new: nt2, link: me.isRedirect ? 'Redirect' : 'Link' }); return nl; }
                }
                return match;
            });
        }
        if (opts.fixTempsEng || opts.fixTempsRed) {
            newContent = newContent.replace(redTemplateRegex, (match, target, label) => {
                const ct = target.split('#')[0].trim(); const me = mappings[ct];
                if (me) {
                    if (me.isRedirect && !opts.fixTempsRed) return match;
                    if (!me.isRedirect && !opts.fixTempsEng) return match;
                    const nl = `[[${me.title}|${label}]]`;
                    if (match !== nl) { changes.push({ original: `${ct} (Wrapper)`, new: me.title, link: 'Template' }); return nl; }
                }
                return match;
            });
            newContent = newContent.replace(/(\{\{\s*)([a-zA-Z][^|{}#]*?)(\s*(?:\||\}\}))/g, (match, prefix, target, suffix) => {
                const ct = target.trim();
                const lu = (!ct.toLowerCase().startsWith('template:') && !ct.includes(':')) ? 'Template:' + ct : ct;
                const me = mappings[lu];
                if (me) {
                    if (me.isRedirect && !opts.fixTempsRed) return match;
                    if (!me.isRedirect && !opts.fixTempsEng) return match;
                    let bnTitle = me.title;
                    if (!ct.toLowerCase().startsWith('template:')) bnTitle = bnTitle.replace(/^টেমপ্লেট:/, '');
                    if (target !== bnTitle) { changes.push({ original: `{{${ct}}}`, new: `{{${bnTitle}}}`, link: 'Template' }); return prefix + bnTitle + suffix; }
                }
                return match;
            });
        }
        return { changes, allCandidates: candidateArray, newContent, missingTemplates };
    }

    async function loadDrafts(api) {
        try {
            const data = await api.get({ action: 'query', prop: 'revisions', titles: DRAFTS_SUBPAGE, rvprop: 'content', rvslots: 'main', formatversion: 2 });
            const page = data.query.pages[0];
            if (page.missing || !page.revisions) return {};
            return JSON.parse(page.revisions[0].slots.main.content);
        } catch (e) { console.warn('ImportTool: Could not load drafts', e); return {}; }
    }
    
    async function saveDrafts(api, drafts) {
        const keys = Object.keys(drafts);
        if (keys.length > MAX_DRAFTS) keys.slice(0, keys.length - MAX_DRAFTS).forEach(k => delete drafts[k]);
        await api.postWithToken('csrf', { 
            action: 'edit', 
            title: DRAFTS_SUBPAGE, 
            text: JSON.stringify(drafts, null, 2), 
            summary: 'আমদানি সরঞ্জাম: খসড়া আপডেট',
            minor: 1
        });
    }

    function getActiveRefId(rawText, caretPos) {
        const refTagRE = /<(\/ref|ref\b[^>]*)>/gi;
        let match, stack = [], idCounter = 0;

        while ((match = refTagRE.exec(rawText)) !== null) {
            const full      = match[0];
            const inner     = match[1];
            const isClose   = /^\/ref/i.test(inner);
            const isSelf    = /\/$/.test(inner.trimEnd());
            let   currentId;

            if (isSelf) {
                currentId = idCounter++;
            } else if (isClose) {
                currentId = stack.length > 0 ? stack.pop() : -1;
            } else {
                currentId = idCounter++;
                stack.push(currentId);
            }

            if (caretPos !== undefined && caretPos >= match.index && caretPos <= match.index + full.length) {
                return currentId;
            }
        }
        return null;
    }

    function buildHighlightHTML(text, cursorPos) {
        const activeRefId = getActiveRefId(text, cursorPos);

        let s = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const sp = (cls, c) => `<span class="wht-${cls}">${c}</span>`;

        s = s.replace(/(&lt;!--[\s\S]*?--&gt;)/g,          m => sp('comment', m));
        s = s.replace(/(\{\{[^{}]*?\}\})/g,                m => sp('template', m));
        s = s.replace(/(\[\[[^\[\]]*?\]\])/g,              m => sp('wikilink', m));
        s = s.replace(/(\[https?:\/\/[^\]]*?\])/g,         m => sp('extlink', m));
        s = s.replace(/(^={1,6}[^=\n]+=+[ \t]*)$/mg,       m => sp('heading', m));
        s = s.replace(/('{5})(.*?)('{5})/g,                (m,a,b,c) => sp('bold-italic', a+b+c));
        s = s.replace(/('{3})(.*?)('{3})/g,                (m,a,b,c) => sp('bold', a+b+c));
        s = s.replace(/('{2})(.*?)('{2})/g,                (m,a,b,c) => sp('italic', a+b+c));
        s = s.replace(/(&lt;(?!\/?ref\b|!--)[a-z][^&]*?&gt;)/gi, m => sp('htmltag', m));
        s = s.replace(/(_{2}[A-Z_]+_{2})/g,                m => sp('magic', m));

        let stack2 = [], idCounter2 = 0;
        s = s.replace(/(&lt;(\/ref|ref\b[^&]*?)(&gt;|\/&gt;))/gi, (m) => {
            const isClose = /^&lt;\/ref/i.test(m);
            const isSelf  = /\/&gt;$/.test(m);
            let currentId;

            if (isSelf) {
                currentId = idCounter2++;
            } else if (isClose) {
                currentId = stack2.length > 0 ? stack2.pop() : -1;
            } else {
                currentId = idCounter2++;
                stack2.push(currentId);
            }

            const isActive = (activeRefId !== null && currentId === activeRefId);
            let cls;
            if (isSelf) {
                cls = isActive ? 'ref-named wht-ref-active' : 'ref-named';
            } else if (isClose) {
                cls = isActive ? 'ref-close wht-ref-active' : 'ref-close';
            } else {
                cls = isActive ? 'ref-open wht-ref-active'  : 'ref-open';
            }
            return `<span class="wht-${cls}">${m}</span>`;
        });

        return s + '\n';
    }

    function injectCSS() {
        if ($('#wht-styles').length) return;
        $('<style id="wht-styles">').text(`
            /* ── Desktop: CSS grid stack ── */
            .wht-stack {
                display: grid;
                position: relative;
                width: 100%;
                box-sizing: border-box;
                border: 1px solid #a2a9b1;
                border-radius: 2px;
                background: #fff;
            }
            .wht-stack:focus-within {
                border-color: #3366cc;
                box-shadow: 0 0 0 2px rgba(51,102,204,.15);
            }
            .wht-stack > * {
                grid-area: 1 / 1;
                width: 100%;
                height: 480px;
                max-height: 75vh;
                padding: 10px 12px !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                font-family: 'Courier New', monospace, sans-serif !important;
                font-size: 13.5px !important;
                line-height: 1.6 !important;
                letter-spacing: normal !important;
                word-spacing: normal !important;
                tab-size: 4 !important;
                white-space: pre-wrap !important;
                word-wrap: break-word !important;
                overflow-wrap: break-word !important;
                border: none !important;
                outline: none !important;
                resize: none !important;
                overflow-y: scroll !important;
                overflow-x: hidden !important;
            }
            .wht-stack { resize: vertical; overflow: hidden; }
            .wht-hl {
                pointer-events: none;
                color: #202122;
                background: transparent;
            }
            .wht-ta {
                background: transparent;
                color: transparent;
                caret-color: #202122;
                z-index: 1;
                position: relative;
            }
            .wht-ta::selection { background: rgba(51,102,204,.25); color: transparent; }

            /* ── Mobile stack overrides ── */
            .wht-mobile-stack > * {
                height: 320px !important;
                max-height: 55vh !important;
                font-size: 13px !important;
            }
            .wht-mobile-ta {
                -webkit-overflow-scrolling: touch !important;
            }

            /* ── Token colours ── */
            .wht-comment    { color: #72777d; background: #f8f9fa; }
            .wht-template   { color: #0645ad; background: #eaf3ff; }
            .wht-wikilink   { color: #006400; background: #eaffea; }
            .wht-extlink    { color: #0645ad; background: #e8f4f8; }
            .wht-heading    { color: #d33; background: #ffe6e6; }
            .wht-bold-italic{ color: #8B008B; background: #f8e6f8; }
            .wht-bold       { color: #202122; background: #e6e6e6; }
            .wht-italic     { color: #202122; background: #f0f0f0; }
            .wht-htmltag    { color: #555; background: #f0f0f0; }
            .wht-magic      { color: #8B008B; background: #fff0ff; }
            .wht-ref-open,
            .wht-ref-close  { color: #fff; background: #c33; }
            .wht-ref-named  { color: #fff; background: #e66; }
            .wht-ref-active { background: #ffeb3b !important; color: #000 !important; }

            /* ── MW Shortcut Toolbar ── */
            .wht-toolbar {
                display: flex;
                flex-wrap: wrap;
                gap: 3px;
                padding: 5px 6px;
                background: #f8f9fa;
                border: 1px solid #a2a9b1;
                border-bottom: none;
                border-radius: 2px 2px 0 0;
            }
            .wht-toolbar button {
                padding: 3px 8px;
                font-size: 12px;
                font-family: 'Courier New', monospace;
                background: #fff;
                border: 1px solid #c8ccd1;
                border-radius: 2px;
                cursor: pointer;
                color: #202122;
                line-height: 1.4;
                white-space: nowrap;
                transition: background 0.1s;
            }
            .wht-toolbar button:hover { background: #eaf3ff; border-color: #3366cc; color: #3366cc; }
            .wht-toolbar button:active { background: #d0e3ff; }
            .wht-toolbar .wht-tb-sep { width: 1px; background: #c8ccd1; margin: 2px 2px; align-self: stretch; }

            /* ── Tool layout ── */
            .it-wrap { max-width: 1200px; width: 100%; box-sizing: border-box; overflow-x: hidden; }
            .it-grid { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; transition: grid-template-columns 0.3s ease; width: 100%; box-sizing: border-box; }
            .it-grid.sidebar-hidden { grid-template-columns: 0px 1fr; }
            @media (max-width: 768px) {
                .it-grid { grid-template-columns: 1fr; gap: 8px; }
                .it-wrap { padding: 0; }
                .it-right-topbar { flex-wrap: wrap; }
            }
            .it-log  { max-height: 350px; overflow-y: auto; border: 1px solid #ccc; padding: 6px; border-radius: 2px; background: #fafafa; }
            .it-log-e { padding: 5px 9px; margin-bottom: 2px; border-left: 4px solid #aaa; font-size: .93em; }
            .it-log-e.success  { border-color: #14866d; background: #e6f5f2; }
            .it-log-e.error    { border-color: #d33;    background: #fee7e6; }
            .it-log-e.imported { border-color: #6633cc; background: #f3e6ff; }

            /* ── Sidebar toggle button ── */
            .it-sidebar-toggle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                background: #fff;
                border: 1px solid #c8ccd1;
                border-radius: 3px;
                cursor: pointer;
                padding: 0;
                margin-bottom: 6px;
                flex-shrink: 0;
                transition: background 0.15s, border-color 0.15s;
            }
            .it-sidebar-toggle:hover { background: #eaf3ff; border-color: #3366cc; }
            .it-sidebar-toggle svg { display: block; }

            /* ── Left column collapse ── */
            .it-left-col {
                overflow: hidden;
                transition: opacity 0.3s ease, transform 0.3s ease;
            }
            .it-left-col.collapsed {
                opacity: 0;
                pointer-events: none;
                transform: translateX(-10px);
                width: 0 !important;
                min-width: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: hidden !important;
            }

            /* ── Right col top bar with toggle ── */
            .it-right-topbar {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }

            /* ── Floating scroll percentage button ── */
            .it-scroll-fab {
                position: absolute;
                bottom: 14px;
                right: 20px;
                width: 42px;
                height: 42px;
                border-radius: 50%;
                background: #3366cc;
                color: #fff;
                font-size: 11px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none;
                z-index: 10;
                box-shadow: 0 2px 6px rgba(0,0,0,0.25);
                transition: background 0.2s;
                line-height: 1;
                text-align: center;
                user-select: none;
                opacity: 0;
                transition: opacity 0.3s;
            }
            .it-scroll-fab.visible { opacity: 1; }

            /* wrapper for positioning the FAB */
            .it-editor-positioner {
                position: relative;
                width: 100%;
            }
        `).appendTo('head');
    }


    function wrapSelection(textarea, prefix, suffix, placeholder) {
        const el  = textarea[0];
        const s   = el.selectionStart;
        const e   = el.selectionEnd;
        const val = el.value;
        const sel = val.substring(s, e) || placeholder || '';

        const before    = val.substring(0, s);
        const after     = val.substring(e);
        const newVal    = before + prefix + sel + suffix + after;
        el.value        = newVal;

        const newStart  = s + prefix.length;
        const newEnd    = newStart + sel.length;
        el.selectionStart = newStart;
        el.selectionEnd   = newEnd;

        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const MW_SHORTCUTS = [
        { key: 'b',      ctrl: true,  shift: false, label: "'''B'''", title: 'Bold (Ctrl+B)',        prefix: "'''",       suffix: "'''",       placeholder: 'Bold text'   },
        { key: 'i',      ctrl: true,  shift: false, label: "''I''",   title: 'Italic (Ctrl+I)',      prefix: "''",        suffix: "''",        placeholder: 'Italic text' },
        { key: 'k',      ctrl: true,  shift: false, label: '[[L]]',   title: 'Wikilink (Ctrl+K)',    prefix: '[[',        suffix: ']]',        placeholder: 'Page title'  },
        { key: 'k',      ctrl: true,  shift: true,  label: '[URL]',   title: 'Ext. link (Ctrl+Shift+K)', prefix: '[https://example.com ', suffix: ']', placeholder: 'link text' },
        { key: '2',      ctrl: true,  shift: false, label: '== H2 ==', title: 'Heading 2 (Ctrl+2)',  prefix: '== ',       suffix: ' ==',       placeholder: 'Heading'     },
        { key: '3',      ctrl: true,  shift: false, label: '=== H3 ===', title: 'Heading 3 (Ctrl+3)',prefix: '=== ',      suffix: ' ===',      placeholder: 'Heading'     },
        { key: '4',      ctrl: true,  shift: false, label: '==== H4 ====', title: 'Heading 4 (Ctrl+4)',prefix: '==== ',   suffix: ' ====',     placeholder: 'Heading'     },
        { key: 'r',      ctrl: true,  shift: false, label: '<ref>',   title: 'Reference (Ctrl+R)',   prefix: '<ref>',     suffix: '</ref>',    placeholder: 'Reference text' },
        { key: 't',      ctrl: true,  shift: false, label: '{{T}}',   title: 'Template (Ctrl+T)',    prefix: '{{',        suffix: '}}',        placeholder: 'Template name' },
        { key: 'n',      ctrl: true,  shift: false, label: '<nowiki>', title: 'Nowiki (Ctrl+N)',     prefix: '<nowiki>',  suffix: '</nowiki>', placeholder: 'text'        },
        { key: '/',      ctrl: true,  shift: false, label: '',  title: 'Comment (Ctrl+/)',    prefix: '',      placeholder: 'comment'     },
        { key: 'm',      ctrl: true,  shift: false, label: '[[File:]]', title: 'File (Ctrl+M)',      prefix: '[[File:',   suffix: ']]',        placeholder: 'filename.jpg' },
    ];


    function attachMWShortcuts(textarea) {
        textarea.on('keydown.mwshortcuts', function (e) {
            if (!e.ctrlKey && !e.metaKey) return;
            const key   = e.key.toLowerCase();
            const shift = e.shiftKey;

            for (const sc of MW_SHORTCUTS) {
                if (sc.key === key && sc.ctrl && sc.shift === shift) {
                    e.preventDefault();
                    wrapSelection(textarea, sc.prefix, sc.suffix, sc.placeholder);
                    return;
                }
            }
        });
    }

    function buildMWToolbar(textarea) {
        const bar = $('<div>').addClass('wht-toolbar');
        const groups = [
            ['b', 'i'], ['k'], ['2', '3', '4'], ['r'], ['t'], ['n', '/'], ['m'],
        ];

        const scByKey = {};
        MW_SHORTCUTS.forEach(sc => {
            const k = sc.key + (sc.shift ? ':s' : '');
            scByKey[k] = sc;
        });

        let first = true;
        groups.forEach(grp => {
            if (!first) bar.append($('<div>').addClass('wht-tb-sep'));
            first = false;
            grp.forEach(key => {
                const sc = scByKey[key];
                if (sc) {
                    $('<button>').attr({ title: sc.title, type: 'button' })
                        .html(sc.label)
                        .on('click', function () {
                            textarea.focus();
                            wrapSelection(textarea, sc.prefix, sc.suffix, sc.placeholder);
                        })
                        .appendTo(bar);
                }
                const scS = scByKey[key + ':s'];
                if (scS) {
                    $('<button>').attr({ title: scS.title, type: 'button' })
                        .html(scS.label)
                        .on('click', function () {
                            textarea.focus();
                            wrapSelection(textarea, scS.prefix, scS.suffix, scS.placeholder);
                        })
                        .appendTo(bar);
                }
            });
        });

        return bar;
    }

    // Floating scroll percentage FAB — placed inside the editor positioner
    function createScrollFab() {
        return $('<div>').addClass('it-scroll-fab').text('0%');
    }

    function createDesktopEditor(initialValue, placeholder, onScrollUpdate) {
        injectCSS();

        const hl = $('<div>').addClass('wht-hl').attr('aria-hidden', 'true');
        const ta = $('<textarea>').addClass('wht-ta')
            .attr({ placeholder: placeholder || '', spellcheck: 'false', autocorrect: 'off', autocomplete: 'off' });

        const toolbar   = buildMWToolbar(ta);
        const stack     = $('<div>').addClass('wht-stack').append(hl, ta);

        // Positioner wraps the stack so we can absolutely position the FAB inside
        const scrollFab = createScrollFab();
        const positioner = $('<div>').addClass('it-editor-positioner').append(stack, scrollFab);

        const wrapper = $('<div>').append(toolbar, positioner);

        let cursorPos  = -1;
        let _rafPending = false;

        function scheduleRender() {
            if (_rafPending) return;
            _rafPending = true;
            requestAnimationFrame(() => {
                _rafPending = false;
                hl.html(buildHighlightHTML(ta.val(), ta[0].selectionStart));
                hl[0].scrollTop = ta[0].scrollTop;
                _updateScroll();
            });
        }

        function _updateScroll() {
            const maxScroll = ta[0].scrollHeight - ta[0].clientHeight;
            const pct = maxScroll > 0 ? Math.round((ta[0].scrollTop / maxScroll) * 100) : 0;
            const clamped = Math.min(100, Math.max(0, pct));

            // Update FAB
            scrollFab.text(clamped + '%');
            if (maxScroll > 0) {
                scrollFab.addClass('visible');
            } else {
                scrollFab.removeClass('visible');
            }

            if (onScrollUpdate) onScrollUpdate(clamped);
        }

        ta.on('input', function () {
            cursorPos = ta[0].selectionStart;
            scheduleRender();
        });

        ta.on('keyup click focus', function () {
            const pos = ta[0].selectionStart;
            if (pos !== cursorPos) {
                cursorPos = pos;
                scheduleRender();
            }
        });

        ta.on('scroll', function () {
            hl[0].scrollTop = ta[0].scrollTop;
            _updateScroll();
        });

        ta.on('keydown', function (e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const el = this, s = el.selectionStart, end = el.selectionEnd;
                el.value = el.value.substring(0, s) + '    ' + el.value.substring(end);
                el.selectionStart = el.selectionEnd = s + 4;
                cursorPos = el.selectionStart;
                scheduleRender();
                return;
            }
        });

        attachMWShortcuts(ta);

        function getValue() { return ta.val(); }
        function setValue(v) { ta.val(v); cursorPos = 0; scheduleRender(); }
        setValue(initialValue || '');

        return { container: wrapper, getValue, setValue, textarea: ta };
    }

    function createMobileEditor(initialValue, placeholder, onScrollUpdate) {
        injectCSS();

        // Use stacked textarea+highlight (same as desktop).
        // contenteditable breaks cursor/IME on mobile; plain textarea does not.
        const hl = $('<div>').addClass('wht-hl').attr('aria-hidden', 'true');
        const ta = $('<textarea>').addClass('wht-ta wht-mobile-ta')
            .attr({ placeholder: placeholder || '', spellcheck: 'false', autocorrect: 'off',
                    autocomplete: 'off', autocapitalize: 'off', 'data-gramm': 'false' });

        const stack = $('<div>').addClass('wht-stack wht-mobile-stack').append(hl, ta);
        const container = $('<div>').css({
            position: 'relative', width: '100%', maxWidth: '100%',
            boxSizing: 'border-box', overflowX: 'hidden'
        }).append(stack);

        let _rafPending = false;

        function scheduleRender() {
            if (_rafPending) return;
            _rafPending = true;
            requestAnimationFrame(function () {
                _rafPending = false;
                hl.html(buildHighlightHTML(ta.val(), ta[0].selectionStart));
                hl[0].scrollTop = ta[0].scrollTop;
                _updateScroll();
            });
        }

        function _updateScroll() {
            const maxScroll = ta[0].scrollHeight - ta[0].clientHeight;
            const pct = maxScroll > 0 ? Math.round((ta[0].scrollTop / maxScroll) * 100) : 0;
            if (onScrollUpdate) onScrollUpdate(Math.min(100, Math.max(0, pct)));
        }

        ta.on('input', function () { scheduleRender(); });
        ta.on('scroll', function () { hl[0].scrollTop = ta[0].scrollTop; _updateScroll(); });
        ta.on('keyup click focus touchend', function () { scheduleRender(); });

        ta.on('keydown', function (e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const el = this, s = el.selectionStart, en = el.selectionEnd;
                el.value = el.value.substring(0, s) + '    ' + el.value.substring(en);
                el.selectionStart = el.selectionEnd = s + 4;
                scheduleRender();
            }
        });

        function getValue() { return ta.val(); }
        function setValue(v) { ta.val(v); scheduleRender(); }
        setValue(initialValue || '');

        return { container: container, getValue, setValue, editor: ta };
    }


    function isMobile() {
        return mw.config.get('skin') === 'minerva' || window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
    }
    function parseSections(content) {
        const lines = content.split('\n'), sections = [];
        let cur = { level: 0, title: 'Lead', content: [] };
        for (const line of lines) {
            const m = line.match(/^(={1,6})\s*(.+?)\s*\1\s*$/);
            if (m) { if (cur.content.length || sections.length) sections.push(cur); cur = { level: m[1].length, title: m[2], content: [line] }; }
            else cur.content.push(line);
        }
        sections.push(cur);
        return sections;
    }
    function sectionsToContent(sections) { return sections.map(s => s.content.join('\n')).join('\n'); }

    function buildMobileSectionEditor(sections, onScrollUpdate, onContentChange) {
        const wrap = $('<div>');
        sections.forEach((sec, idx) => {
            const isLead = idx === 0;
            const hdr = $('<div>').css({ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'#f8f9fa', borderBottom:'1px solid #ccc', cursor:'pointer', fontWeight:'bold', fontSize:'.95em' }).text(isLead ? '(Lead Section)' : sec.title);
            const arrow = $('<span>').text('▾').css({ marginLeft:'8px', color:'#666' });
            hdr.append(arrow);
            const body = $('<div>').css({ display:'none', padding:'10px', boxSizing:'border-box', width:'100%', overflowX:'hidden' });
            if (!isLead) {
                const ti = $('<input type="text">').val(sec.title).css({ width:'100%', maxWidth:'100%', padding:'6px', border:'1px solid #a2a9b1', borderRadius:'2px', fontFamily:'monospace', boxSizing:'border-box', marginBottom:'6px' });
                ti.on('input', function () { 
                    sec.title = $(this).val(); hdr.text(sec.title); hdr.append(arrow); sec.content[0] = `${'='.repeat(sec.level)} ${sec.title} ${'='.repeat(sec.level)}`; 
                    if (onContentChange) onContentChange(); 
                });
                body.append($('<label>').text('Section Title:').css({ fontWeight:'bold', display:'block', marginBottom:'4px' }), ti);
            }
            const ct = isLead ? sec.content.join('\n') : sec.content.slice(1).join('\n');
            const ed = createMobileEditor(ct, 'Section content...', onScrollUpdate);
            ed.editor.on('input', function () {
                const v = ed.getValue();
                sec.content = isLead ? v.split('\n') : [`${'='.repeat(sec.level)} ${sec.title} ${'='.repeat(sec.level)}`, ...v.split('\n')];
                if (onContentChange) onContentChange(); 
            });
            body.append($('<label>').text('Content:').css({ fontWeight:'bold', display:'block', marginBottom:'4px' }), ed.container);
            hdr.on('click', function () { const open = body.is(':visible'); body.slideToggle(150); arrow.text(open ? '▾' : '▴'); });
            wrap.append($('<div>').css({ border:'1px solid #ccc', borderRadius:'3px', marginBottom:'8px', overflow:'hidden', width:'100%', boxSizing:'border-box' }).append(hdr, body));
        });
        return wrap;
    }

    function loadTool() {
        document.title = 'আমদানি সরঞ্জাম - বাংলা উইকিপিডিয়া';
        $('#firstHeading').text('পাতা আমদানি ও অনুবাদ সরঞ্জাম');
        $('#mw-content-text').empty();

        injectCSS();
        const api = new mw.Api();
        const mobile = isMobile();

        const wrap = $('<div>').addClass('it-wrap');
        $('#mw-content-text').append(wrap);

        const grid     = $('<div>').addClass('it-grid');
        const leftCol  = $('<div>').addClass('it-left-col');
        const rightCol = $('<div>').css({ borderLeft: mobile ? 'none' : '1px solid #ccc', paddingLeft: mobile ? '0' : '15px', minWidth: 0, width: '100%', boxSizing: 'border-box', overflowX: 'hidden' });
        wrap.append(grid.append(leftCol, rightCol));

        // ── Sidebar toggle button (hamburger) ──
        const toggleBtn = $('<button>')
            .addClass('it-sidebar-toggle')
            .attr({ title: 'পার্শ্বপ্যানেল টগল করুন', type: 'button' })
            .html(`<svg width="18" height="14" viewBox="0 0 18 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect y="0" width="18" height="2" rx="1" fill="#555"/>
                <rect y="6" width="18" height="2" rx="1" fill="#555"/>
                <rect y="12" width="18" height="2" rx="1" fill="#555"/>
            </svg>`);

        let sidebarVisible = true;
        toggleBtn.on('click', function () {
            sidebarVisible = !sidebarVisible;
            if (sidebarVisible) {
                leftCol.removeClass('collapsed');
                grid.removeClass('sidebar-hidden');
            } else {
                leftCol.addClass('collapsed');
                grid.addClass('sidebar-hidden');
            }
        });

        const importTypes = [
            { val:'article',  label:'📄 নিবন্ধ (Article)',     ns:'' },
            { val:'template', label:'🔧 টেমপ্লেট (Template)',   ns:'টেমপ্লেট' },
            { val:'category', label:'📂 বিষয়শ্রেণী (Category)', ns:'বিষয়শ্রেণী' },
            { val:'module',   label:'⚙️ মডিউল (Module)',         ns:'মডিউল' },
            { val:'image',    label:'🖼️ চিত্র (Image/File)',     ns:'চিত্র' },
            { val:'draft',    label:'📝 খসড়া (Draft)',           ns:'খসড়া' },
            { val:'portal',   label:'🚪 প্রবেশদ্বার (Portal)',   ns:'প্রবেশদ্বার' },
        ];
        const selStyle = { width:'100%', padding:'6px', border:'1px solid #a2a9b1', borderRadius:'2px', fontFamily:'sans-serif', fontSize:'.95em', boxSizing:'border-box', marginBottom:'6px', background:'#fff', cursor:'pointer' };

        const importTypeSelect = $('<select>').css(selStyle);
        importTypes.forEach(t => importTypeSelect.append($('<option>').val(t.val).text(t.label)));

        const listTA = $('<textarea>').attr({ rows:10, placeholder:'ইংরেজিতে শিরোনাম দিন (প্রতি লাইনে একটি)...' })
            .css({ width:'100%', fontFamily:'monospace', fontSize:'13px', padding:'6px', boxSizing:'border-box', border:'1px solid #a2a9b1', borderRadius:'2px', resize:'vertical' });

        const processBtn  = $('<button>').text('শুরু করুন (Start)').css({ padding:'8px 16px', background:'#14866d', color:'#fff', border:'none', borderRadius:'3px', cursor:'pointer', fontWeight:'bold', flex:'1', fontSize:'1em' });
        const killBtn     = $('<button>').text('⛔ বন্ধ করুন').css({ padding:'8px 12px', background:'#8b0000', color:'#fff', border:'none', borderRadius:'3px', cursor:'pointer', fontWeight:'bold', fontSize:'1em', display:'none' });
        const queueStatus = $('<div>').css({ marginTop:'8px', fontStyle:'italic', color:'#555', fontSize:'.9em' });
        const logArea     = $('<div>').addClass('it-log');

        const draftSaveBtn = $('<button>').text('💾 খসড়া সংরক্ষণ করুন').css({ padding:'4px 12px', cursor:'pointer', background:'#36c', color:'#fff', border:'none', borderRadius:'3px', fontSize:'.9em', width:'100%', marginBottom:'6px' });
        const draftList    = $('<div>');
        const draftSection = $('<div>').css({ marginTop:'12px', padding:'10px', background:'#f8f9fa', border:'1px solid #ccc', borderRadius:'3px' }).append(draftSaveBtn, draftList);

        leftCol.append(
            $('<label>').text('আমদানির তালিকা:').css({ fontWeight:'bold', display:'block', marginBottom:'4px' }),
            $('<label>').text('আমদানির ধরন:').css({ fontSize:'.9em', color:'#555', display:'block', marginBottom:'3px' }),
            importTypeSelect, listTA,
            $('<div>').css({ display:'flex', gap:'6px', marginTop:'6px' }).append(processBtn, killBtn),
            queueStatus,
            $('<h4>').text('Import Log').css({ marginTop:'14px', marginBottom:'4px' }),
            logArea,
            $('<h4>').text('💾 সংরক্ষিত খসড়া').css({ marginTop:'14px', marginBottom:'4px' }),
            draftSection
        );

        // Scroll update callback — no longer updates a bar, just kept for mobile section editors
        function handleScrollUpdate(pct) {
            // FAB is now handled inside createDesktopEditor directly
        }

        const nsInput = $('<select>').css(selStyle).prop('disabled', true);
        [
            { val:'',             label:'— নিবন্ধ (Article / মূল নামস্থান)' },
            { val:'চিত্র',        label:'চিত্র (Image / File)' },
            { val:'খসড়া',        label:'খসড়া (Draft)' },
            { val:'মডিউল',        label:'মডিউল (Module)' },
            { val:'টেমপ্লেট',    label:'টেমপ্লেট (Template)' },
            { val:'বিষয়শ্রেণী', label:'বিষয়শ্রেণী (Category)' },
            { val:'প্রবেশদ্বার', label:'প্রবেশদ্বার (Portal)' },
            { val:'উইকিপিডিয়া',  label:'উইকিপিডিয়া (Wikipedia NS)' },
            { val:'সাহায্য',      label:'সাহায্য (Help)' },
        ].forEach(o => nsInput.append($('<option>').val(o.val).text(o.label)));

        const titleInputEl = $('<input type="text">').attr('placeholder','বাংলা শিরোনাম লিখুন…')
            .css({ width:'100%', padding:'6px', border:'1px solid #a2a9b1', borderRadius:'2px', fontFamily:'monospace', boxSizing:'border-box', marginBottom:'2px' })
            .prop('disabled', true);
        const titleWarning = $('<div>').css({ fontSize:'.85em', color:'#c33', marginBottom:'6px', display:'none' }).text('⚠️ শিরোনাম অবশ্যই বাংলায় হতে হবে');
        function isBengali(s) { return /[ঀ-৿]/.test(s); }
        
        titleInputEl.on('input', function () {
            const v = $(this).val().trim();
            if (v && !isBengali(v)) { titleWarning.show(); $(this).css('border-color','#c33'); }
            else { titleWarning.hide(); $(this).css('border-color','#a2a9b1'); }
            triggerAutoSave();
        });

        const progressFill  = $('<div>').css({ height:'100%', width:'0%', background:'#14866d', borderRadius:'3px', transition:'width .3s' });
        const progressLabel = $('<div>').css({ fontSize:'.8em', color:'#555', textAlign:'right', marginTop:'2px' });
        const progressWrap  = $('<div>').css({ marginBottom:'4px', display:'none' })
            .append($('<div>').css({ height:'6px', background:'#eaecf0', borderRadius:'3px', overflow:'hidden' }).append(progressFill), progressLabel);

        const editorWrap = $('<div>').css({ width:'100%', maxWidth:'100%', boxSizing:'border-box', overflowX:'hidden' });
        let currentEditorAPI = null, currentSections = null, currentItem = null;
        
        let drafts = {};
        let autoSaveTimer = null;

        function triggerAutoSave() {
            if (!titleInputEl.val().trim()) return;

            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(async () => {
                const key = (nsInput.val() ? nsInput.val()+':' : '') + titleInputEl.val();
                drafts[key] = {
                    namespace: nsInput.val(),
                    title: titleInputEl.val(),
                    content: getEditorValue(),
                    enTitle: currentItem ? currentItem.enTitle : null,
                    savedAt: new Date().toISOString()
                };

                draftSaveBtn.text('স্বয়ংক্রিয়ভাবে সংরক্ষিত হচ্ছে...');
                try {
                    await saveDrafts(api, drafts);
                    renderDraftPills();
                    draftSaveBtn.text('✅ স্বয়ংক্রিয়ভাবে সংরক্ষিত');
                    setTimeout(() => draftSaveBtn.text('💾 খসড়া সংরক্ষণ করুন'), 2000);
                } catch(e) {
                    console.warn('Autosave failed:', e);
                    draftSaveBtn.text('💾 খসড়া সংরক্ষণ করুন');
                }
            }, 180000); 
        }

        function updateProgress(text) {
            if (!currentItem || !currentItem._totalChars) return;
            const pct = Math.min(100, Math.round((text.length / currentItem._totalChars) * 100));
            progressFill.css('width', pct + '%');
            progressLabel.text('সম্পাদনা: ' + pct + '% (' + text.length + ' / ' + currentItem._totalChars + ' অক্ষর)');
        }

        function setupDesktopEditor(value) {
            editorWrap.empty(); currentSections = null;
            const ed = createDesktopEditor(value, 'বিষয়বস্তু...', handleScrollUpdate);
            ed.textarea.on('input', function () { 
                updateProgress(ed.getValue()); 
                triggerAutoSave();
            });
            editorWrap.append(ed.container);
            currentEditorAPI = ed;
            if (currentItem && currentItem._totalChars) { progressWrap.show(); updateProgress(value); }
        }
        
        function setupMobileEditor(value) {
            editorWrap.empty(); currentEditorAPI = null;
            currentSections = parseSections(value);
            editorWrap.append(buildMobileSectionEditor(currentSections, handleScrollUpdate, triggerAutoSave)); 
        }
        
        function getEditorValue() {
            if (mobile && currentSections) return sectionsToContent(currentSections);
            if (currentEditorAPI) return currentEditorAPI.getValue();
            return '';
        }
        
        function setEditorValue(value) { mobile ? setupMobileEditor(value) : setupDesktopEditor(value); }

        setEditorValue('');

        const saveBtn        = $('<button>').text('✅ সংরক্ষণ ও পরবর্তী').css({ padding:'7px 12px', background:'#14866d', color:'#fff', border:'none', borderRadius:'3px', cursor:'pointer', fontWeight:'bold' }).prop('disabled', true);
        const draftInlineBtn = $('<button>').text('💾 খসড়া').css({ padding:'7px 12px', background:'#36c', color:'#fff', border:'none', borderRadius:'3px', cursor:'pointer', fontWeight:'bold' }).prop('disabled', true);
        const skipBtn        = $('<button>').text('⏭ বাদ দিন').css({ padding:'7px 12px', background:'#c33', color:'#fff', border:'none', borderRadius:'3px', cursor:'pointer', fontWeight:'bold' }).prop('disabled', true);

        const shortcutHelp = $('<details>').css({ marginTop:'6px', fontSize:'.85em', color:'#555' });
        $('<summary>').text('⌨️ কীবোর্ড শর্টকাট দেখুন').css({ cursor:'pointer', color:'#3366cc' }).appendTo(shortcutHelp);
        const scTable = $('<table>').css({ borderCollapse:'collapse', marginTop:'6px', width:'100%' });
        $('<tr>').append(
            $('<th>').text('শর্টকাট').css({ textAlign:'left', padding:'3px 8px', borderBottom:'1px solid #ccc', background:'#f8f9fa' }),
            $('<th>').text('কাজ').css({ textAlign:'left', padding:'3px 8px', borderBottom:'1px solid #ccc', background:'#f8f9fa' })
        ).appendTo(scTable);
        MW_SHORTCUTS.forEach(sc => {
            $('<tr>').append(
                $('<td>').css({ padding:'2px 8px', fontFamily:'monospace', background:'#f8f9fa', border:'1px solid #eaecf0' }).text(sc.title.match(/\(([^)]+)\)/)?.[1] || ''),
                $('<td>').css({ padding:'2px 8px', border:'1px solid #eaecf0' }).text(sc.title.replace(/\s*\([^)]*\)/, ''))
            ).appendTo(scTable);
        });
        $('<tr>').append(
            $('<td>').css({ padding:'2px 8px', fontFamily:'monospace', background:'#f8f9fa', border:'1px solid #eaecf0' }).text('Tab'),
            $('<td>').css({ padding:'2px 8px', border:'1px solid #eaecf0' }).text('4 স্পেস ঢোকান')
        ).appendTo(scTable);
        shortcutHelp.append(scTable);

        const attrNotice = $('<div>').css({
            fontSize: '.88em', color: '#555', background: '#f8f9fa',
            border: '1px solid #c8ccd1', borderRadius: '3px',
            padding: '7px 10px', marginBottom: '12px', lineHeight: '1.6'
        });
        attrNotice.append(
            document.createTextNode('এই সরঞ্জামটি '),
            $('<a>').attr({ href: mw.util.getUrl('ব্যবহারকারী:Anaf Ibn Shahibul'), target: '_blank' }).text('Anaf Ibn Shahibul'),
            document.createTextNode(' কর্তৃক Gemini AI চালিত সংস্করণে রূপান্তরিত, যা '),
            $('<a>').attr({ href: mw.util.getUrl('ব্যবহারকারী:ARI'), target: '_blank' }).text('ARI'),
            document.createTextNode(' এবং '),
            $('<a>').attr({ href: mw.util.getUrl('ব্যবহারকারী:Aishik Rehman'), target: '_blank' }).text('Aishik Rehman'),
            document.createTextNode('-এর মূল কাজের ওপর ভিত্তি করে তৈরি।')
        );

        // Top bar for right column: toggle button + attribution notice inline
        const rightTopBar = $('<div>').addClass('it-right-topbar').append(toggleBtn, attrNotice);

        rightCol.append(
            rightTopBar,
            $('<label>').text('নেমস্পেস (Namespace):').css({ fontWeight:'bold', display:'block', marginBottom:'2px' }),
            nsInput,
            $('<label>').text('শিরোনাম (Title) — বাংলায় লিখুন:').css({ fontWeight:'bold', display:'block', marginBottom:'2px' }),
            titleInputEl, titleWarning,
            $('<label>').text('বিষয়বস্তু (Content):').css({ fontWeight:'bold', display:'block', marginBottom:'4px' }),
            progressWrap, editorWrap,
            $('<div>').css({ marginTop:'8px', display:'flex', gap:'6px', flexWrap:'wrap' }).append(saveBtn, draftInlineBtn, skipBtn),
            shortcutHelp
        );


        function loadDraftIntoEditor(draft) {
            if (!draft) return;
            nsInput.val(draft.namespace || '').prop('disabled', false);
            titleInputEl.val(draft.title || '').prop('disabled', false);
            titleWarning.hide(); titleInputEl.css('border-color','#a2a9b1');
            setEditorValue(draft.content || '');
            saveBtn.prop('disabled', false); draftInlineBtn.prop('disabled', false); skipBtn.prop('disabled', false);
            progressWrap.hide();
        }

        function renderDraftPills() {
            draftList.empty();
            const keys = Object.keys(drafts);
            if (!keys.length) { draftList.html('<i style="color:#72777d;font-size:.9em;">কোনো খসড়া নেই।</i>'); return; }
            [...keys].reverse().forEach(k => {
                const draft = drafts[k];
                const ts = draft.savedAt ? new Date(draft.savedAt).toLocaleString('bn-BD',{ year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit' }) : '';
                const row = $('<div>').css({ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 8px', marginBottom:'3px', background:'#fff', border:'1px solid #c8ccd1', borderRadius:'3px', cursor:'pointer', fontSize:'.88em' });
                const info = $('<div>').css({ flex:'1', marginRight:'8px', minWidth:0 });
                $('<div>').css({ fontWeight:'bold', color:'#0645ad', wordBreak:'break-all' }).text(k).appendTo(info);
                if (draft.enTitle) {
                    const enLinkRow = $('<div>').css({ display:'flex', alignItems:'center', gap:'4px', marginTop:'2px' });
                    $('<span>').css({ fontSize:'.8em', color:'#72777d', flexShrink:0 }).text('en:').appendTo(enLinkRow);
                    $('<a>').attr({ href:'https://en.wikipedia.org/wiki/'+encodeURIComponent(draft.enTitle.replace(/ /g,'_')), target:'_blank' })
                        .css({ fontSize:'.83em', color:'#3366cc', wordBreak:'break-all', fontFamily:'monospace' })
                        .text(draft.enTitle)
                        .on('click', e => e.stopPropagation())
                        .appendTo(enLinkRow);
                    enLinkRow.appendTo(info);
                }
                const right = $('<div>').css({ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'3px', flexShrink:0 });
                $('<span>').css({ color:'#72777d', whiteSpace:'nowrap', fontSize:'.85em' }).text(ts).appendTo(right);
                $('<span>').css({ color:'#c33', cursor:'pointer', fontSize:'1.1em' }).text('✕').attr('title','খসড়া মুছুন')
                    .on('click', async function(e) {
                        e.stopPropagation();
                        if (!confirm(k+' — এই খসড়াটি মুছবেন?')) return;
                        delete drafts[k];
                        try { await saveDrafts(api, drafts); } catch(err) { console.warn(err); }
                        renderDraftPills();
                    }).appendTo(right);
                row.append(info, right).on('click', () => loadDraftIntoEditor(draft));
                draftList.append(row);
            });
        }

        draftSaveBtn.on('click', async function () {
            const key = (nsInput.val() ? nsInput.val()+':' : '') + titleInputEl.val();
            if (!key.trim()) { alert('শিরোনাম খালি থাকলে খসড়া সংরক্ষণ করা যাবে না।'); return; }
            drafts[key] = { namespace: nsInput.val(), title: titleInputEl.val(), content: getEditorValue(), enTitle: currentItem ? currentItem.enTitle : null, savedAt: new Date().toISOString() };
            draftSaveBtn.text('সংরক্ষণ হচ্ছে...');
            try { await saveDrafts(api, drafts); renderDraftPills(); draftSaveBtn.text('✅ সংরক্ষিত!'); setTimeout(() => draftSaveBtn.text('💾 খসড়া সংরক্ষণ করুন'), 2000); }
            catch(e) { alert('খসড়া সংরক্ষণ ব্যর্থ: '+e); draftSaveBtn.text('💾 খসড়া সংরক্ষণ করুন'); }
        });

        loadDrafts(api).then(d => {
            drafts = d;
            renderDraftPills();
            const keys = Object.keys(drafts);
            if (keys.length) loadDraftIntoEditor(drafts[keys[keys.length - 1]]);
        });

        function addLog(title, type, msg) {
            const icon = type==='imported'?'📥':type==='error'?'❌':'✅';
            const e = $('<div>').addClass('it-log-e '+type);
            const link = mw.util.getUrl ? `<a href="${mw.util.getUrl(title)}" target="_blank">${title}</a>` : title;
            e.html(`${icon} <b>${link}</b>: ${msg}`);
            logArea.prepend(e);
        }

        importTypeSelect.on('change', function () {
            const chosen = importTypes.find(t => t.val === $(this).val());
            if (chosen && !nsInput.prop('disabled')) nsInput.val(chosen.ns);
        });

        let queue = [], isKilled = false;

        function setRunning(on) {
            if (on) { processBtn.prop('disabled',true).text('প্রসেস হচ্ছে...'); killBtn.show(); listTA.prop('disabled',true); importTypeSelect.prop('disabled',true); }
            else { processBtn.prop('disabled',false).text('শুরু করুন (Start)'); killBtn.hide().text('⛔ বন্ধ করুন').prop('disabled',false); listTA.prop('disabled',false); importTypeSelect.prop('disabled',false); }
        }

        killBtn.on('click', function () { isKilled=true; queue=[]; killBtn.text('থামছে...').prop('disabled',true); queueStatus.text('⛔ প্রক্রিয়া বাতিল করা হয়েছে।'); });
        processBtn.on('click', function () {
            const raw = listTA.val().trim(); if (!raw) { alert('তালিকা খালি!'); return; }
            queue = raw.split('\n').map(l=>l.trim()).filter(Boolean); isKilled=false; setRunning(true); processNext();
        });

        function clearEditor() {
            nsInput.val('').prop('disabled',true); titleInputEl.val('').prop('disabled',true);
            titleWarning.hide(); titleInputEl.css('border-color','#a2a9b1');
            setEditorValue('');
            saveBtn.prop('disabled',true); draftInlineBtn.prop('disabled',true); skipBtn.prop('disabled',true);
            progressWrap.hide(); currentItem=null;
        }

        async function processNext() {
            if (isKilled || !queue.length) { queueStatus.text(isKilled?'⛔ বাতিল করা হয়েছে।':'✅ সমস্ত কাজ সম্পন্ন!'); setRunning(false); clearEditor(); return; }
            const enTitle = queue.shift();
            queueStatus.text('⏳ বাকি: '+(queue.length+1)+' | প্রসেস হচ্ছে: '+enTitle);
            saveBtn.prop('disabled',true); draftInlineBtn.prop('disabled',true); skipBtn.prop('disabled',true);
            try {
                const data = await fetchAndTranslate(enTitle, api);
                if (isKilled) { setRunning(false); clearEditor(); return; }
                data._totalChars = data.content.length || 1; currentItem = data;
                const typeNs = (importTypes.find(t=>t.val===importTypeSelect.val())||{}).ns||'';
                nsInput.val(data.bnNamespace||typeNs).prop('disabled',false);
                titleInputEl.val(data.bnTitleOnly).prop('disabled',false);
                titleWarning.hide(); titleInputEl.css('border-color','#a2a9b1');
                setEditorValue(data.content);
                if (!mobile) { progressWrap.show(); updateProgress(data.content); }
                saveBtn.prop('disabled',false); draftInlineBtn.prop('disabled',false); skipBtn.prop('disabled',false);
            } catch(err) { addLog(enTitle,'error',String(err)); if (!isKilled) processNext(); }
        }

        draftInlineBtn.on('click', function () {
            if (!isBengali(titleInputEl.val().trim())) { titleWarning.show(); titleInputEl.css('border-color','#c33'); alert('শিরোনাম বাংলায় লিখুন।'); return; }
            draftSaveBtn.trigger('click');
        });

        saveBtn.on('click', async function () {
            const finalTitle = titleInputEl.val().trim();
            if (!isBengali(finalTitle)) { titleWarning.show(); titleInputEl.css('border-color','#c33'); alert('শিরোনাম অবশ্যই বাংলায় হতে হবে।'); return; }
            if (isKilled) { alert('প্রক্রিয়া বাতিল — নতুন করে শুরু করুন।'); return; }
            saveBtn.prop('disabled',true);
            const finalNs = nsInput.val().trim();
            const fullTitle = finalNs ? finalNs+':'+finalTitle : finalTitle;
            try {
                await api.postWithToken('csrf', { action:'edit', title:fullTitle, text:getEditorValue(), summary:`${currentItem?currentItem.enTitle:fullTitle} থেকে অনুবাদ/আমদানি`, createonly:1 });
                if (currentItem && currentItem.qid) {
                    const wdApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php');
                    await wdApi.postWithEditToken({ action:'wbsetsitelink', id:currentItem.qid, linksite:'bnwiki', linktitle:fullTitle });
                }
                addLog(fullTitle,'imported',`আমদানি সম্পন্ন (QID: ${currentItem?(currentItem.qid||'N/A'):'N/A'})`);
                processNext();
            } catch(e) {
                if (e==='articleexists') { alert('এই পাতাটি ইতিমধ্যে বিদ্যমান! শিরোনাম পরিবর্তন করুন।'); saveBtn.prop('disabled',false); }
                else { alert('Error: '+e); saveBtn.prop('disabled',false); }
            }
        });

        skipBtn.on('click', function () { if (currentItem) addLog(currentItem.enTitle,'error','ব্যবহারকারী এড়িয়ে গেছেন'); processNext(); });
    }

    async function fetchAndTranslate(enTitle, api) {
        const enApi = new mw.ForeignApi('https://en.wikipedia.org/w/api.php');
        const enData = await enApi.get({ action:'query', titles:enTitle, prop:'revisions|pageprops', rvprop:'content', rvslots:'main', ppprop:'wikibase_item', redirects:1, formatversion:2 });
        const page = enData.query.pages[0];
        if (page.missing) throw 'English page not found';
        
        const qid = page.pageprops?.wikibase_item, rawContent = page.revisions[0].slots.main.content, resolvedEnTitle = page.title, enNsId = page.ns;
        
        // ১. লিঙ্ক, ক্যাটাগরি ও টেমপ্লেট ম্যাপিং বিশ্লেষণ
        const analysis = await analyzeContent(rawContent, api, { fixLinksEng:true,fixLinksRed:true,fixCatsEng:true,fixCatsRed:true,fixTempsEng:true,fixTempsRed:true,onlyRedTemplates:false });
        let processedContent = analysis.newContent;

        // ২. Gemini API কী চেক করা
        let apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            apiKey = prompt("অনুগ্রহ করে তোমার Gemini API Key-টি দাও (এটি ব্রাউজারে সংরক্ষিত থাকবে):");
            if (apiKey) localStorage.setItem('gemini_api_key', apiKey);
        }

        // ৩. Gemini API এর মাধ্যমে নিবন্ধের মূল টেক্সট অনুবাদ করা
        if (apiKey && processedContent.trim()) {
            console.log('🤖 Gemini দিয়ে অনুবাদ করা হচ্ছে: ' + enTitle);
            try {
                // উইকিকোড ফরম্যাট ঠিক রেখে অনুবাদ করার জন্য প্রম্পট
                const promptText = `You are a professional Wikipedia translator. Translate the following English Wikipedia article content into Bengali. 
CRITICAL RULES:
1. Preserve all Wikipedia syntax, templates (e.g., {{...}}), links (e.g., [[...]]), and HTML tags exactly as they are.
2. Only translate the human-readable text. Do not translate template names, parameters, or link targets.
3. Maintain the precise encyclopedic tone of Bengali Wikipedia.

Content to translate:
${processedContent}`;

                const response = await $.ajax({
                    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        contents: [{ parts: [{ text: promptText }] }]
                    })
                });

                if (response.candidates && response.candidates[0].content.parts[0].text) {
                    processedContent = response.candidates[0].content.parts[0].text;
                }
            } catch (geminiErr) {
                console.error('Gemini translation failed, using link-resolved text instead.', geminiErr);
                // API ব্যর্থ হলে স্ক্রিপ্টটি থামবে না, লিঙ্ক ঠিক করা ইংরেজি টেক্সটটিই এডিটরে পাঠাবে
            }
        }

        // ৪. নামস্থান (Namespace) নির্ধারণ
        let bnNamespace='', bnTitleOnly=resolvedEnTitle;
        if (enNsId===10)       { bnNamespace='টেমপ্লেট'; bnTitleOnly=resolvedEnTitle.replace(/^Template:/,''); }
        else if (enNsId===14)  { bnNamespace='বিষয়শ্রেণী'; bnTitleOnly=resolvedEnTitle.replace(/^Category:/,''); }
        else if (enNsId===828) { bnNamespace='মডিউল'; bnTitleOnly=resolvedEnTitle.replace(/^Module:/,''); }
        else if (enNsId!==0)   { const p=resolvedEnTitle.split(':'); if (p.length>1) { bnNamespace=p[0]; bnTitleOnly=p.slice(1).join(':'); } }
        
        if (qid) {
            const wdApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php');
            const wd = await wdApi.get({ action:'wbgetentities', ids:qid, props:'sitelinks', sitefilter:'bnwiki', formatversion:2 });
            if (wd.entities[qid].sitelinks?.bnwiki) throw `Already exists in BnWiki as: ${wd.entities[qid].sitelinks.bnwiki.title}`;
        }
        
        return { enTitle:resolvedEnTitle, bnNamespace, bnTitleOnly, content:processedContent, qid };
    }

    $(document).ready(init);

})(jQuery, mediaWiki);