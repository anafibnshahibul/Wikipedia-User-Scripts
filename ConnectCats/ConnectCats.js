(function() {
    'use strict';

    if (![0, 2, 14, 118].includes(mw.config.get('wgNamespaceNumber'))) return;
    if (!mw.config.get('wgArticleId')) return;

    let categoryData = { toAdd: [], existing: [], notFound: [] };

    function getConfig() {
        const defaults = {
            autoReload: true,
            delay: 2500,
            extraGlossary: {},
            summary: '[[User:Anaf Ibn Shahibul/ConnectCats|কানেক্টক্যাটসের]] মাধ্যমে বিষয়শ্রেণী যুক্ত করা হয়েছে',
            createSummary: '[[User:Anaf Ibn Shahibul/ConnectCats|কানেক্টক্যাটসের]] মাধ্যমে তৈরি'
        };
        let localConf = {};
        try {
            localConf = JSON.parse(localStorage.getItem('ConnectCatsConfig')) || {};
        } catch (e) {}
        const windowConf = window.ConnectCatsConfig || {};
        return Object.assign({}, defaults, windowConf, localConf);
    }

    function toBnNum(num) {
        const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return String(num).replace(/\d/g, d => bnDigits[d]);
    }

    async function translateText(text) {
        if (!text) return '';
        try {
            let cleanText = text.replace(/^Category:/i, '').trim();
            const config = getConfig();

            const baseGlossary = {
                "establishments": "প্রতিষ্ঠা", "organizations": "সংগঠন", "companies": "প্রতিষ্ঠান",
                "people": "ব্যক্তিত্ব", "individuals": "ব্যক্তিত্ব", "history": "ইতিহাস",
                "culture": "সংস্কৃতি", "geography": "ভূগোল", "biota": "জীবসম্ভার",
                "by country": "দেশ অনুযায়ী", "by year": "বছর অনুযায়ী", "by century": "শতাব্দী অনুযায়ী",
                "births": "জন্ম", "deaths": "মৃত্যু", "writers": "লেখক",
                "actors": "অভিনেতা", "singers": "গায়ক", "musicians": "সঙ্গীতশিল্পী",
                "politicians": "রাজনীতিবিদ", "scientists": "বিজ্ঞানী", "directors": "পরিচালক",
                "films": "চলচ্চিত্র", "books": "বই"
            };
            
            const glossary = Object.assign({}, baseGlossary, config.extraGlossary);
            const lowerText = cleanText.toLowerCase();
            
            if (glossary[lowerText]) {
                return glossary[lowerText];
            }

            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=bn&dt=t&q=${encodeURIComponent(cleanText)}`;
            const res = await $.ajax({ url: url, dataType: 'json', timeout: 5000 });
            
            if (res && res[0]) {
                let trans = res[0].map(item => item[0]).join('');
                trans = trans.replace(/Category/gi, 'বিষয়শ্রেণী')
                             .replace(/বিভাগ/g, 'বিষয়শ্রেণী')
                             .replace(/ক্যাটাগরি/g, 'বিষয়শ্রেণী');
                trans = trans.replace(/(সমূহ|গুলি|গুলো|গণ|রা|বৃন্দ)(?=\s|$)/g, '');
                trans = trans.replace(/(\d+|[০-৯]+)\s*সালে/g, '$1-এ');
                trans = trans.replace(/দেশ\s*দ্বারা/g, 'দেশ অনুযায়ী');
                trans = trans.replace(/বছর\s*দ্বারা/g, 'বছর অনুযায়ী');
                trans = trans.replace(/শতাব্দী\s*দ্বারা/g, 'শতাব্দী অনুযায়ী');

                Object.keys(glossary).forEach(enWord => {
                    if (lowerText.includes(enWord) && trans.includes('প্রতিষ্ঠাপন')) {
                        trans = trans.replace('প্রতিষ্ঠাপন', 'প্রতিষ্ঠা');
                    }
                });
                trans = trans.replace(/\d/g, d => ['০','১','২','৩','৪','৫','৬','৭','৮','৯'][d]);
                return trans.replace(/\s+/g, ' ').trim();
            }
        } catch (e) {}
        return '';
    }

    function cleanDescriptionForWikidata(text) {
        if (!text) return 'উইকিপিডিয়ার বিষয়শ্রেণী';
        let firstSentence = text.split(/[।!?]/)[0].trim();
        firstSentence = firstSentence.replace(/সতর্কবার্তা:.*$/g, '').trim();
        return firstSentence || 'উইকিপিডিয়ার বিষয়শ্রেণী';
    }

    function addToolbarButton() {
        const importLink = mw.util.addPortletLink('p-tb', '#', 'Connect Cats', 'import-cats-btn', 'উইকিউপাত্তের মাধ্যমে ইংরেজি থেকে বিষয়শ্রেণী আমদানি করুন', 'i');
        const settingsLink = mw.util.addPortletLink('p-tb', '#', 'ConnectCats সেটিংস', 'import-cats-settings-btn', 'ConnectCats এর কনফিগারেশন পরিবর্তন করুন', 's');
        
        if (importLink) {
            $(importLink).click(e => {
                e.preventDefault();
                mw.loader.using(['oojs-ui-core', 'oojs-ui-windows', 'oojs-ui-widgets', 'mediawiki.ForeignApi', 'mediawiki.api'], startImportProcess);
            });
        }
        if (settingsLink) {
            $(settingsLink).click(e => {
                e.preventDefault();
                mw.loader.using(['oojs-ui-core', 'oojs-ui-windows', 'oojs-ui-widgets'], showSettingsDialog);
            });
        }
    }

    function showSettingsDialog() {
        const config = getConfig();
        
        const autoReloadInput = new OO.ui.ToggleSwitchWidget({ value: config.autoReload });
        const delayInput = new OO.ui.NumberInputWidget({ value: config.delay, min: 0, step: 500 });
        const summaryInput = new OO.ui.TextInputWidget({ value: config.summary });
        const createSummaryInput = new OO.ui.TextInputWidget({ value: config.createSummary });
        
        let glossaryString = JSON.stringify(config.extraGlossary, null, 2);
        if (glossaryString === '{}') glossaryString = '{\n  "engineering": "প্রকৌশল"\n}';
        const glossaryInput = new OO.ui.MultilineTextInputWidget({ value: glossaryString, rows: 5, autosize: true });

        const fieldset = new OO.ui.FieldsetLayout({ label: 'ConnectCats সেটিংস কনফিগারেশন' });
        fieldset.addItems([
            new OO.ui.FieldLayout(autoReloadInput, { label: 'কাজ শেষে স্বয়ংক্রিয় রিলোড', align: 'left' }),
            new OO.ui.FieldLayout(delayInput, { label: 'রিলোড দেওয়ার আগে অপেক্ষা (মিলিসেকেন্ড)', align: 'top' }),
            new OO.ui.FieldLayout(summaryInput, { label: 'নিবন্ধে বিষয়শ্রেণী যোগের সারাংশ', align: 'top' }),
            new OO.ui.FieldLayout(createSummaryInput, { label: 'নতুন ক্যাটাগরি তৈরির সারাংশ', align: 'top' }),
            new OO.ui.FieldLayout(glossaryInput, { label: 'ট্রান্সলেশন লাইব্রেরি (JSON ফরমেটে)', align: 'top' })
        ]);

        function SettingsDialog(c) { SettingsDialog.super.call(this, c); }
        OO.inheritClass(SettingsDialog, OO.ui.ProcessDialog);
        SettingsDialog.static.name = 'settingsDialog';
        SettingsDialog.static.title = 'ConnectCats সেটিংস';
        SettingsDialog.static.actions = [
            { action: 'save', label: 'সংরক্ষণ করুন', flags: ['primary', 'progressive'] },
            { label: 'বাতিল', flags: 'safe' }
        ];

        SettingsDialog.prototype.initialize = function() {
            SettingsDialog.super.prototype.initialize.apply(this, arguments);
            this.content = new OO.ui.PanelLayout({ padded: true, expanded: false });
            this.content.$element.append(fieldset.$element);
            this.$body.append(this.content.$element);
        };
        SettingsDialog.prototype.getActionProcess = function(action) {
            if (action === 'save') {
                return new OO.ui.Process(() => {
                    let parsedGlossary = {};
                    try {
                        parsedGlossary = JSON.parse(glossaryInput.getValue());
                    } catch (e) {
                        mw.notify('ট্রান্সলেশন লাইব্রেরির JSON ফরমেট সঠিক নয়!', { type: 'error' });
                        throw new Error('Invalid JSON');
                    }
                    
                    const newConfig = {
                        autoReload: autoReloadInput.getValue(),
                        delay: Number(delayInput.getValue()),
                        summary: summaryInput.getValue(),
                        createSummary: createSummaryInput.getValue(),
                        extraGlossary: parsedGlossary
                    };
                    
                    localStorage.setItem('ConnectCatsConfig', JSON.stringify(newConfig));
                    mw.notify('সেটিংস সফলভাবে সংরক্ষিত হয়েছে।', { type: 'success' });
                    this.close({ action });
                });
            }
            return SettingsDialog.super.prototype.getActionProcess.call(this, action);
        };
        SettingsDialog.prototype.getBodyHeight = () => 500;

        const windowManager = new OO.ui.WindowManager();
        $(document.body).append(windowManager.$element);
        windowManager.addWindows([new SettingsDialog({ size: 'medium' })]);
        windowManager.openWindow('settingsDialog').closed.then(() => {
            setTimeout(() => windowManager.destroy(), 300);
        });
    }

    function showLogDialog() {
        return new Promise(resolve => {
            const logBox = $('<div style="height: 250px; overflow-y: auto; background: #1e1e1e; color: #00ff00; padding: 12px; font-family: monospace; font-size: 13px; border-radius: 6px; border: 1px solid #333; line-height: 1.6; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);"></div>');
            const content = new OO.ui.PanelLayout({
                padded: true, expanded: false,
                $content: $('<div>').append(
                    $('<div style="margin-bottom:10px; font-weight:bold; color:var(--color-base, #202122);">প্রক্রিয়া চলছে...</div>'),
                    new OO.ui.ProgressBarWidget({ progress: false }).$element, 
                    $('<br>'), logBox
                )
            });

            const windowManager = new OO.ui.WindowManager();
            $(document.body).append(windowManager.$element);

            function LogDialog(config) { LogDialog.super.call(this, config); }
            OO.inheritClass(LogDialog, OO.ui.ProcessDialog);
            LogDialog.static.name = 'logDialog';
            LogDialog.static.title = 'Connect Cats - লগ টার্মিনাল';
            LogDialog.prototype.initialize = function() {
                LogDialog.super.prototype.initialize.apply(this, arguments);
                this.content = content;
                this.$body.append(this.content.$element);
            };

            windowManager.addWindows([new LogDialog({ size: 'medium' })]);
            windowManager.openWindow('logDialog');
            
            resolve({
                log: msg => {
                    const time = new Date().toLocaleTimeString('bn-BD', { hour12: false });
                    const timeStr = time.replace(/\d/g, d => ['০','১','২','৩','৪','৫','৬','৭','৮','৯'][d]);
                    logBox.append(`<div><span style="color:#888;">[${timeStr}]</span> ${msg}</div>`);
                    logBox.scrollTop(logBox[0].scrollHeight);
                },
                close: () => {
                    windowManager.closeWindow('logDialog');
                    setTimeout(() => windowManager.destroy(), 300);
                }
            });
        });
    }

    async function getWikidataItemId(logger) {
        logger.log('বর্তমান পাতার উইকিউপাত্ত সংযোগ খোঁজা হচ্ছে...');
        const api = new mw.Api();
        const result = await api.get({ action: 'query', prop: 'pageprops', titles: mw.config.get('wgPageName'), format: 'json' });
        const pageId = Object.keys(result.query.pages)[0];
        if (pageId === '-1' || !result.query.pages[pageId].pageprops?.wikibase_item) throw new Error('উইকিউপাত্ত সংযোগ পাওয়া যায়নি');
        return result.query.pages[pageId].pageprops.wikibase_item;
    }

    async function getEnglishPageTitle(wikidataId, logger) {
        logger.log('উইকিউপাত্ত থেকে ইংরেজি নিবন্ধের শিরোনাম সংগ্রহ করা হচ্ছে...');
        const response = await $.ajax({
            url: 'https://www.wikidata.org/w/api.php',
            data: { action: 'wbgetentities', ids: wikidataId, props: 'sitelinks', format: 'json', origin: '*' },
            dataType: 'json'
        });
        const enSitelink = response.entities[wikidataId].sitelinks?.enwiki;
        if (!enSitelink) throw new Error('ইংরেজি উইকিপিডিয়ার সাথে সংযুক্ত নেই');
        return enSitelink.title;
    }

    async function getEnglishCategories(pageTitle, logger) {
        logger.log('ইংরেজি নিবন্ধের বিষয়শ্রেণীসমূহ বিশ্লেষণ করা হচ্ছে...');
        const response = await $.ajax({
            url: 'https://en.wikipedia.org/w/api.php',
            data: { action: 'query', titles: pageTitle, prop: 'categories', clshow: '!hidden', cllimit: 'max', redirects: 1, format: 'json', origin: '*' },
            dataType: 'json'
        });
        const pages = response.query.pages;
        const pageKey = Object.keys(pages)[0];
        if (pageKey === '-1') return [];
        const categories = pages[pageKey].categories || [];
        return categories.map(cat => cat.title.replace('Category:', ''));
    }

    async function processCategories(enCategories, logger) {
        logger.log('বিষয়শ্রেণীগুলোর উইকিউপাত্ত আইডি সংগ্রহ করা হচ্ছে...');
        const wikidataItems = {};
        for (let i = 0; i < enCategories.length; i += 50) {
            const batch = enCategories.slice(i, i + 50).map(t => 'Category:' + t).join('|');
            const res = await $.ajax({
                url: 'https://en.wikipedia.org/w/api.php',
                data: { action: 'query', titles: batch, prop: 'pageprops', format: 'json', origin: '*' },
                dataType: 'json'
            });
            for (const id in res.query.pages) {
                const page = res.query.pages[id];
                if (page.pageprops?.wikibase_item) wikidataItems[page.title.replace('Category:', '')] = page.pageprops.wikibase_item;
            }
        }

        logger.log('বাংলা উইকিপিডিয়ার সংযোগ যাচাই করা হচ্ছে...');
        const wdIds = Object.values(wikidataItems);
        const bengaliCategories = [], notFoundCategories = [];
        
        if (wdIds.length) {
            for (let i = 0; i < wdIds.length; i += 50) {
                const batchIds = wdIds.slice(i, i + 50);
                const wdRes = await $.ajax({
                    url: 'https://www.wikidata.org/w/api.php',
                    data: { action: 'wbgetentities', ids: batchIds.join('|'), props: 'sitelinks', format: 'json', origin: '*' },
                    dataType: 'json'
                });
                for (const enCat of enCategories) {
                    const wid = wikidataItems[enCat];
                    if (batchIds.includes(wid)) {
                        const bnSitelink = wdRes.entities[wid]?.sitelinks?.bnwiki;
                        if (bnSitelink) bengaliCategories.push({ english: enCat, bengali: bnSitelink.title.replace('বিষয়শ্রেণী:', ''), wikidataId: wid });
                        else notFoundCategories.push({ english: enCat, wikidataId: wid });
                    }
                }
            }
        } else {
            enCategories.forEach(cat => notFoundCategories.push({ english: cat, wikidataId: null }));
        }

        logger.log('বর্তমান পাতায় থাকা বিষয়শ্রেণীসমূহ পরীক্ষা করা হচ্ছে...');
        const api = new mw.Api();
        const currentRes = await api.get({ action: 'query', titles: mw.config.get('wgPageName'), prop: 'categories', cllimit: 'max', format: 'json' });
        const currentPages = currentRes.query.pages;
        const currentCategories = (currentPages[Object.keys(currentPages)[0]].categories || []).map(cat => cat.title.replace('বিষয়শ্রেণী:', ''));

        if (bengaliCategories.length) {
            const existCheckTitles = bengaliCategories.map(c => 'বিষয়শ্রেণী:' + c.bengali).join('|');
            try {
                const exRes = await api.get({ action: 'query', titles: existCheckTitles, format: 'json' });
                const existing = [];
                for (const id in exRes.query.pages) {
                    if (id !== '-1') existing.push(exRes.query.pages[id].title.replace('বিষয়শ্রেণী:', ''));
                }
                bengaliCategories.forEach(c => c.exists = existing.includes(c.bengali));
            } catch (e) { bengaliCategories.forEach(c => c.exists = true); }
        }

        const categoriesToAdd = bengaliCategories.filter(cat => !currentCategories.includes(cat.bengali));
        const existingCategories = bengaliCategories.filter(cat => currentCategories.includes(cat.bengali)).map(cat => cat.bengali);

        return { toAdd: categoriesToAdd, existing: existingCategories, notFound: notFoundCategories };
    }

    async function linkCategoryToArticle(articleTitle, categoryTitle, logger) {
        logger.log(`'${articleTitle}' নিবন্ধে বিষয়শ্রেণী যুক্ত করা হচ্ছে...`);
        const api = new mw.Api();
        try {
            const res = await api.get({ action: 'query', titles: articleTitle, prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json' });
            const pages = res.query.pages;
            const pageId = Object.keys(pages)[0];
            if (pageId === '-1') return; 

            const content = pages[pageId].revisions[0].slots.main['*'];
            const catTag = `[[বিষয়শ্রেণী:${categoryTitle}]]`;
            
            if (!content.includes(categoryTitle)) {
                await api.postWithToken('csrf', {
                    action: 'edit', title: articleTitle, appendtext: `\n${catTag}`, summary: getConfig().summary
                });
                logger.log(`'${articleTitle}' নিবন্ধে বিষয়শ্রেণী সফলভাবে যুক্ত হয়েছে।`);
            } else {
                logger.log(`'${articleTitle}' নিবন্ধে বিষয়শ্রেণীটি আগে থেকেই বিদ্যমান।`);
            }
        } catch(e) { logger.log(`'${articleTitle}' নিবন্ধ সম্পাদনায় ত্রুটি।`); }
    }

    async function processTemplate(tplContent, catTitleBn, logger) {
        const parts = tplContent.split('|');
        const tplName = parts[0].trim().toLowerCase();
        
        if (['commons category', 'commonscat', 'commons category-inline'].includes(tplName)) {
            return `{{${tplContent}}}`;
        }

        if (parts.length > 1) {
            logger.log(`'${parts[0]}' টেমপ্লেটের প্যারামিটার অনুবাদ খোঁজা হচ্ছে...`);
            const args = parts.slice(1).map(p => p.trim());
            const plainArgs = args.filter(a => !a.includes('='));
            
            if (plainArgs.length > 0) {
                const enApi = new mw.ForeignApi('https://en.wikipedia.org/w/api.php');
                try {
                    const res = await enApi.get({ action: 'query', titles: plainArgs.join('|'), prop: 'pageprops', format: 'json' });
                    const qids = [], mapQidToEn = {};
                    for (let id in res.query.pages) {
                        const pp = res.query.pages[id].pageprops;
                        if (pp?.wikibase_item) {
                            qids.push(pp.wikibase_item);
                            mapQidToEn[pp.wikibase_item] = res.query.pages[id].title;
                        }
                    }
                    if (qids.length > 0) {
                        const wdApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php');
                        const wdRes = await wdApi.get({ action: 'wbgetentities', ids: qids.join('|'), props: 'sitelinks', format: 'json' });
                        const enToBn = {};
                        for (let qid of qids) {
                            const sl = wdRes.entities[qid]?.sitelinks?.bnwiki;
                            if (sl) enToBn[mapQidToEn[qid]] = sl.title;
                        }
                        for (let i = 1; i < parts.length; i++) {
                            let argVal = parts[i].trim();
                            if (enToBn[argVal]) {
                                parts[i] = enToBn[argVal];
                                if (['cat main', 'main', 'মূল'].includes(tplName)) {
                                    await linkCategoryToArticle(enToBn[argVal], catTitleBn, logger);
                                }
                            }
                        }
                    }
                } catch(e) {}
            }
        }
        return `{{${parts.join('|')}}}`;
    }

    async function getTranslatedDescription(enTitle, logger) {
        logger.log(`'${enTitle}' এর বর্ণনা অনুবাদ করা হচ্ছে...`);
        try {
            const enApi = new mw.ForeignApi('https://en.wikipedia.org/w/api.php');
            const res = await enApi.get({ action: 'query', titles: 'Category:' + enTitle, prop: 'extracts', exintro: 1, explaintext: 1, format: 'json' });
            const pages = res.query.pages;
            const plainText = pages[Object.keys(pages)[0]].extract;
            if (!plainText || !plainText.trim()) return '';

            const translatedText = await translateText(plainText.trim());
            if (translatedText) return `${translatedText}\n\n<small>'''সতর্কবার্তা:''' এই বর্ণনাটি স্বয়ংক্রিয়ভাবে অনুবাদ করা হয়েছে।</small>\n\n`;
        } catch (e) {}
        return '';
    }

    async function getBengaliParentCategories(enTitle, logger) {
        logger.log(`প্যারেন্ট বিষয়শ্রেণী খোঁজা হচ্ছে...`);
        try {
            const enApi = new mw.ForeignApi('https://en.wikipedia.org/w/api.php');
            const catRes = await enApi.get({ action: 'query', titles: 'Category:' + enTitle, prop: 'categories', clshow: '!hidden', cllimit: 'max', format: 'json' });
            const pages = catRes.query.pages;
            const pageId = Object.keys(pages)[0];
            
            if (pageId === '-1' || !pages[pageId].categories) return '';
            const enParents = pages[pageId].categories.map(c => c.title);

            const wdRes = await enApi.get({ action: 'query', titles: enParents.join('|'), prop: 'pageprops', format: 'json' });
            const wikidataIds = [];
            for (const id in wdRes.query.pages) {
                if (wdRes.query.pages[id].pageprops?.wikibase_item) wikidataIds.push(wdRes.query.pages[id].pageprops.wikibase_item);
            }

            if (!wikidataIds.length) return '';
            const wdApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php');
            const bnParents = [];
            
            for (let i = 0; i < wikidataIds.length; i += 50) {
                const batch = wikidataIds.slice(i, i + 50);
                const siteRes = await wdApi.get({ action: 'wbgetentities', ids: batch.join('|'), props: 'sitelinks', format: 'json' });
                for (const id of batch) {
                    const sl = siteRes.entities[id]?.sitelinks?.bnwiki;
                    if (sl) bnParents.push(`[[${sl.title}]]`);
                }
            }
            return bnParents.join('\n');
        } catch (e) { return ''; }
    }

    function showEditContentDialog(title, content) {
        return new Promise(resolve => {
            const textInput = new OO.ui.MultilineTextInputWidget({ value: content, rows: 10, autosize: true });
            const previewContainer = $('<div class="wikiEditor-preview-box" style="margin-top: 15px; padding: 12px; background: var(--background-color-neutral-subtle, #f8f9fa); border: 1px dashed var(--border-color-base, #a2a9b1); border-radius: 4px; display: none; max-height: 200px; overflow-y: auto;"></div>');
            const fieldset = new OO.ui.FieldsetLayout({ label: 'সম্পাদনা করুন: বিষয়শ্রেণী:' + title });
            fieldset.addItems([ new OO.ui.FieldLayout(textInput, { align: 'top' }) ]);
            const $dialogContent = $('<div>').append(fieldset.$element, previewContainer);

            function EditDialog(config) { EditDialog.super.call(this, config); }
            OO.inheritClass(EditDialog, OO.ui.ProcessDialog);
            EditDialog.static.name = 'editDialog';
            EditDialog.static.title = 'ক্যাটাগরি কন্টেন্ট যাচাই';
            EditDialog.static.actions = [
                { action: 'save', label: 'সংরক্ষণ করুন', flags: ['primary', 'progressive'] },
                { action: 'preview', label: 'প্রাকদর্শন দেখুন', flags: ['progressive'], icon: 'eye' },
                { label: 'বাতিল', flags: 'safe' }
            ];

            EditDialog.prototype.initialize = function() {
                EditDialog.super.prototype.initialize.apply(this, arguments);
                this.$body.append($dialogContent);
            };
            
            EditDialog.prototype.getActionProcess = function(action) {
                if (action === 'preview') {
                    return new OO.ui.Process(async () => {
                        previewContainer.html('<span style="color: var(--color-base, #202122);">প্রাকদর্শন লোড হচ্ছে...</span>').show();
                        try {
                            const api = new mw.Api();
                            const response = await api.post({ action: 'parse', text: textInput.getValue(), title: 'বিষয়শ্রেণী:' + title, pst: 1, format: 'json' });
                            if (response && response.parse && response.parse.text) {
                                previewContainer.html(response.parse.text['*']);
                            } else {
                                previewContainer.html('<span style="color: #d33;">প্রাকদর্শন তৈরি করা যায়নি।</span>');
                            }
                        } catch (err) {
                            previewContainer.html('<span style="color: #d33;">ত্রুটি: প্রাকদর্শন লোড করা যায়নি।</span>');
                        }
                    });
                }
                if (action === 'save') {
                    return new OO.ui.Process(() => {
                        resolve(textInput.getValue());
                        this.close({ action });
                    });
                }
                if (action === '') {
                    return new OO.ui.Process(() => {
                        resolve(null);
                        this.close({ action });
                    });
                }
                return EditDialog.super.prototype.getActionProcess.call(this, action);
            };
            EditDialog.prototype.getBodyHeight = () => 500;

            const windowManager = new OO.ui.WindowManager();
            $(document.body).append(windowManager.$element);
            windowManager.addWindows([new EditDialog({ size: 'large' })]);
            windowManager.openWindow('editDialog').closed.then(res => {
                if (!res) resolve(null);
                setTimeout(() => windowManager.destroy(), 300);
            });
        });
    }

    async function createCategoryWithTemplates(bnTitle, enTitle, wikidataId, logger) {
        logger.log(`'${bnTitle}' পাতা তৈরির প্রক্রিয়া শুরু হচ্ছে...`);
        let validTemplatesText = '';
        try {
            const enApi = new mw.ForeignApi('https://en.wikipedia.org/w/api.php');
            const enRes = await enApi.get({ action: 'query', titles: 'Category:' + enTitle, prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json' });
            const pages = enRes.query.pages;
            const pageId = Object.keys(pages)[0];
            
            if (pageId !== '-1') {
                const enText = pages[pageId].revisions[0].slots.main['*'];
                const templateRegex = /\{\{([^{}]+)\}\}/g;
                let match;
                while ((match = templateRegex.exec(enText)) !== null) {
                    const rawTpl = match[1];
                    if(rawTpl.toLowerCase().startsWith('category:')) continue;
                    const processedTpl = await processTemplate(rawTpl, bnTitle, logger);
                    validTemplatesText += processedTpl + '\n';
                }
            }
        } catch (e) {}

        const translatedDesc = await getTranslatedDescription(enTitle, logger);
        const parentCategoriesText = await getBengaliParentCategories(enTitle, logger);
        let finalContent = `${translatedDesc}${validTemplatesText}\n${parentCategoriesText}`.trim();

        logger.log(`'${bnTitle}' এর বিষয়বস্তু সম্পাদনার জন্য প্রস্তুত করা হচ্ছে...`);
        const editedContent = await showEditContentDialog(bnTitle, finalContent);
        
        if (editedContent === null) {
            logger.log(`'${bnTitle}' তৈরি বাতিল করা হয়েছে।`);
            return;
        }
        finalContent = editedContent;

        logger.log(`'${bnTitle}' পাতাটি সংরক্ষণ করা হচ্ছে...`);
        const bnApi = new mw.Api();
        await bnApi.postWithToken('csrf', {
            action: 'edit', title: 'বিষয়শ্রেণী:' + bnTitle, text: finalContent + '\n', summary: getConfig().createSummary, createonly: true
        });

        if (wikidataId) {
            logger.log(`'${bnTitle}' উইকিউপাত্তে সংযুক্ত করা হচ্ছে...`);
            try {
                const wdApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php');
                await wdApi.postWithToken('csrf', { action: 'wbsetsitelink', id: wikidataId, linksite: 'bnwiki', linktitle: 'বিষয়শ্রেণী:' + bnTitle, summary: 'Added bnwiki sitelink via ConnectCats' });
                logger.log(`উইকিউপাত্তে বাংলা লেবেল যুক্ত করা হচ্ছে...`);
                await wdApi.postWithToken('csrf', { action: 'wbsetlabel', id: wikidataId, language: 'bn', value: 'বিষয়শ্রেণী:' + bnTitle, summary: 'Added Bengali label via ConnectCats' });
                if (translatedDesc) {
                    logger.log(`উইকিউপাত্তে বাংলা বিবরণ যুক্ত করা হচ্ছে...`);
                    const shortDesc = cleanDescriptionForWikidata(translatedDesc);
                    await wdApi.postWithToken('csrf', { action: 'wbsetdescription', id: wikidataId, language: 'bn', value: shortDesc, summary: 'Added Bengali description via ConnectCats' });
                }
            } catch (e) {
                logger.log(`উইকিউপাত্তের তথ্য হালনাগাদ করতে সামান্য সমস্যা হয়েছে।`);
            }
        }
        logger.log(`'${bnTitle}' সফলভাবে তৈরি ও সংযুক্ত হয়েছে।`);
    }

    function showConfirmationDialog(data) {
        return new Promise(resolve => {
            const categoryItems = data.toAdd.map(cat => {
                const titleHtml = cat.exists ? `<strong>${cat.bengali}</strong>` : `<strong style="color: #d33;">${cat.bengali} (তৈরি নেই)</strong>`;
                return new OO.ui.FieldLayout(
                    new OO.ui.CheckboxInputWidget({ value: cat.bengali, selected: true, data: cat }),
                    { label: new OO.ui.HtmlSnippet(`${titleHtml}<br><small style="color: #54595d;">← ${cat.english}</small>`), align: 'inline' }
                );
            });

            const manualInputs = [];
            const statsHtml = `
                <div style="background: var(--background-color-interactive-subtle, #f8f9fa); border:1px solid var(--border-color-base, #a2a9b1); border-radius:4px; padding:12px; margin-bottom:16px; display:flex; justify-content:space-around; text-align:center;">
                    <div><div style="font-size:24px; font-weight:bold; color: var(--color-success, #00af89);">${toBnNum(data.toAdd.length)}</div><div style="font-size:12px; color: var(--color-base, #202122);">নতুন</div></div>
                    <div><div style="font-size:24px; font-weight:bold; color: var(--color-progressive, #36c);">${toBnNum(data.existing.length)}</div><div style="font-size:12px; color: var(--color-base, #202122);">বিদ্যমান</div></div>
                    <div><div style="font-size:24px; font-weight:bold; color: var(--color-destructive, #d33);">${toBnNum(data.notFound.length)}</div><div style="font-size:12px; color: var(--color-base, #202122);">অনুবাদ নেই</div></div>
                </div>
            `;

            const $content = $('<div>').append(statsHtml);

            if (data.toAdd.length > 0) {
                const selectAllCheckbox = new OO.ui.CheckboxInputWidget({ selected: true });
                selectAllCheckbox.on('change', selected => categoryItems.forEach(i => i.fieldWidget.setSelected(selected)));
                $content.append(
                    $('<div style="margin: 16px 0 8px; padding: 8px; background: #eaf3ff; border-left: 3px solid #3366cc; color: #202122;"><strong>যোগ করার জন্য বিষয়শ্রেণী নির্বাচন করুন:</strong></div>'),
                    new OO.ui.FieldLayout(selectAllCheckbox, { label: 'সব নির্বাচন করুন', align: 'inline' }).$element,
                    $('<div style="margin-bottom: 16px;">').append(categoryItems.map(i => i.$element))
                );
            }

            if (data.notFound.length > 0) {
                const $manualSec = $('<div style="margin-top: 16px; border-top: 1px solid #ccc; padding-top: 12px;">');
                $manualSec.append('<strong style="color: #d33;">নতুন বিষয়শ্রেণী তৈরি করুন (ম্যানুয়াল/এআই ইনপুট):</strong><br><small style="color: #202122;">চেকবক্স চিহ্নিত থাকলে পাতাগুলো তৈরি করে উইকিউপাত্তে যুক্ত করা হবে।</small><br><br>');
                
                const manualSelectAll = new OO.ui.CheckboxInputWidget({ selected: false });
                manualSelectAll.on('change', selected => manualInputs.forEach(i => i.checkbox.setSelected(selected)));
                $manualSec.append(new OO.ui.FieldLayout(manualSelectAll, { label: 'সব ম্যানুয়াল বিষয়শ্রেণী নির্বাচন করুন', align: 'inline' }).$element);
                $manualSec.append('<br>');

                data.notFound.forEach(catObj => {
                    const wrapper = $('<div style="display:flex; align-items:center; margin-bottom:12px;"></div>');
                    const cb = new OO.ui.CheckboxInputWidget({ selected: false });
                    const input = new OO.ui.TextInputWidget({ placeholder: 'অনুবাদ খুঁজছে...' });
                    
                    wrapper.append(cb.$element.css({'margin-right': '10px', 'margin-top': '5px'}), input.$element.css('flex-grow', '1'));
                    $manualSec.append($('<div style="margin-bottom: 4px; font-weight:bold; font-size:13px;"></div>').text(catObj.english), wrapper);
                    
                    manualInputs.push({ checkbox: cb, widget: input, data: catObj });
                    
                    translateText(catObj.english).then(trans => {
                        if (trans) input.setValue(trans);
                        else input.setPlaceholder('বাংলা নাম লিখুন...');
                    });
                });
                $content.append($manualSec);
            }

            const contentPanel = new OO.ui.PanelLayout({ padded: true, expanded: false, scrollable: true, $content: $content });

            function ConfirmDialog(config) { ConfirmDialog.super.call(this, config); }
            OO.inheritClass(ConfirmDialog, OO.ui.ProcessDialog);
            ConfirmDialog.static.name = 'confirmDialog';
            ConfirmDialog.static.title = 'Connect Cats';
            ConfirmDialog.static.actions = [
                { action: 'save', label: 'প্রয়োগ করুন', flags: ['primary', 'progressive'] },
                { label: 'বাতিল', flags: 'safe' }
            ];

            ConfirmDialog.prototype.initialize = function() {
                ConfirmDialog.super.prototype.initialize.apply(this, arguments);
                this.content = contentPanel;
                this.$body.append(this.content.$element);
                
                const updateActionState = () => {
                    const hasSelected = categoryItems.some(i => i.fieldWidget.isSelected());
                    const hasManual = manualInputs.some(inputObj => inputObj.checkbox.isSelected() && inputObj.widget.getValue().trim().length > 0);
                    this.actions.setAbilities({ save: (hasSelected || hasManual) });
                };

                categoryItems.forEach(i => i.fieldWidget.on('change', updateActionState));
                manualInputs.forEach(inputObj => {
                    inputObj.widget.on('change', updateActionState);
                    inputObj.checkbox.on('change', updateActionState);
                });
                this.updateActionStateFunc = updateActionState;
            };

            ConfirmDialog.prototype.getSetupProcess = function ( dialogData ) {
                return ConfirmDialog.super.prototype.getSetupProcess.call( this, dialogData ).next( function () {
                    this.updateActionStateFunc();
                }, this );
            };

            ConfirmDialog.prototype.getActionProcess = function(action) {
                if (action === 'save') {
                    return new OO.ui.Process(() => {
                        const selectedCats = [], catsToCreate = [];
                        categoryItems.forEach(i => { if (i.fieldWidget.isSelected()) selectedCats.push(i.fieldWidget.getValue()); });
                        manualInputs.forEach(inputObj => {
                            if (inputObj.checkbox.isSelected()) {
                                const val = inputObj.widget.getValue().trim();
                                if (val) {
                                    selectedCats.push(val);
                                    catsToCreate.push({ bnTitle: val, enTitle: inputObj.data.english, wikidataId: inputObj.data.wikidataId });
                                }
                            }
                        });
                        resolve({ confirmed: true, categories: selectedCats, toCreate: catsToCreate });
                        this.close({ action });
                    });
                }
                return ConfirmDialog.super.prototype.getActionProcess.call(this, action);
            };
            ConfirmDialog.prototype.getBodyHeight = () => 550;

            const windowManager = new OO.ui.WindowManager();
            $(document.body).append(windowManager.$element);
            windowManager.addWindows([new ConfirmDialog({ size: 'large' })]);
            windowManager.openWindow('confirmDialog').closed.then(res => {
                if (!res || res.action !== 'save') resolve({ confirmed: false });
                setTimeout(() => windowManager.destroy(), 300);
            });
        });
    }

    async function startImportProcess() {
        let logger;
        try {
            logger = await showLogDialog();
            const wikidataId = await getWikidataItemId(logger);
            const enPageTitle = await getEnglishPageTitle(wikidataId, logger);
            const enCategories = await getEnglishCategories(enPageTitle, logger);
            
            if (!enCategories.length) throw new Error('ইংরেজি পাতায় কোনো বিষয়শ্রেণী নেই');

            categoryData = await processCategories(enCategories, logger);
            logger.close(); 
            
            const result = await showConfirmationDialog(categoryData);
            if (!result.confirmed || !result.categories.length) return;

            logger = await showLogDialog();
            
            if (result.toCreate && result.toCreate.length > 0) {
                logger.log(`${toBnNum(result.toCreate.length)}টি নতুন বিষয়শ্রেণী একটির পর একটি (ধারাবাহিকভাবে) তৈরির কাজ শুরু হচ্ছে...`);
                for (const catData of result.toCreate) {
                    try {
                        logger.log(`----------------------------------------`);
                        logger.log(`এখন প্রসেস করা হচ্ছে: বিষয়শ্রেণী:${catData.bnTitle}`);
                        await createCategoryWithTemplates(catData.bnTitle, catData.enTitle, catData.wikidataId, logger);
                    } catch (e) {
                        logger.log(`'${catData.bnTitle}' তৈরি করতে সমস্যা হয়েছে: ${e.message || 'অজানা ত্রুটি'}`);
                    }
                }
                logger.log(`----------------------------------------`);
            }

            logger.log(`মূল পাতায় ${toBnNum(result.categories.length)}টি বিষয়শ্রেণী যুক্ত করা হচ্ছে...`);
            const api = new mw.Api();
            const pageName = mw.config.get('wgPageName');
            const categoryText = '\n' + result.categories.map(cat => `[[বিষয়শ্রেণী:${cat}]]`).join('\n');
            const finalSummaryMsg = `উইকিউপাত্ত থেকে ${toBnNum(result.categories.length)}টি বিষয়শ্রেণী আমদানি করা হয়েছে - ${getConfig().summary}`;

            await api.postWithToken('csrf', {
                action: 'edit', title: pageName, appendtext: categoryText, summary: finalSummaryMsg, format: 'json'
            });

            logger.log('সব কাজ সফলভাবে সম্পন্ন হয়েছে!');
            
            const conf = getConfig();
            if (conf.autoReload) {
                logger.log(`পাতাটি ${toBnNum(conf.delay / 1000)} সেকেন্ড পর পুনঃলোড করা হচ্ছে...`);
                setTimeout(() => location.reload(), conf.delay);
            } else {
                logger.log('স্বয়ংক্রিয় রিলোড বন্ধ আছে। ম্যানুয়ালি রিলোড করুন।');
            }

        } catch (error) {
            if (logger) {
                logger.log(`ত্রুটি: ${error.message || 'অজানা ত্রুটি'}`);
                setTimeout(() => logger.close(), 4000);
            }
            mw.notify(error.message || 'ব্যর্থ হয়েছে', { title: 'ত্রুটি', type: 'error' });
        }
    }

    $(function() {
        addToolbarButton();
    });

})();
