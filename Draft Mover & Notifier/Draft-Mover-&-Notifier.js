/**
 * Script Name: Draft Mover & Notifier
 * Description: Moves articles to Draft with Desktop/Mobile integration, clean notifications, dark mode support, and eligibility warnings.
 * Author: [[User:Anaf Ibn Shahibul]]
 * Version: 4.5.0 MUVS
 */
// <nowiki>
(function ($, mw) {
    'use strict';

    if (mw.config.get('wgNamespaceNumber') !== 0 || mw.config.get('wgArticleId') === 0) {
        return;
    }

    function setupDraftMover() {
        var moveText = 'খসড়ায় স্থানান্তর';
        var tooltip = 'এই নিবন্ধটি খসড়া নামস্থানে স্থানান্তর করুন';

        if (mw.config.get('skin') !== 'minerva') {
            if (!$('#ca-movedraft-dt-bottom').length) {
                var $desktopBtn = $('<button>')
                    .attr({ 'id': 'ca-movedraft-dt-bottom', 'title': tooltip })
                    .text(moveText)
                    .css({
                        'background': '#d33', 'color': '#fff', 'padding': '12px 25px',
                        'border': 'none', 'border-radius': '8px', 'cursor': 'pointer',
                        'font-weight': 'bold', 'font-size': '16px', 'margin': '20px auto',
                        'display': 'block', 'box-shadow': '0 4px 6px rgba(0,0,0,0.1)'
                    });

                $('#mw-content-text').append($desktopBtn);
                $desktopBtn.on('click', function(e) {
                    e.preventDefault();
                    launchMoverWizard();
                });
            }
        }

        var checkMenu = setInterval(function() {
            var $mobileMenu = $('#page-secondary-actions'); 
            if ($mobileMenu.length > 0) {
                if (!$('#ca-movedraft-mb').length) {
                    var $customLink = $('<a>')
                        .attr({ 'href': '#', 'id': 'ca-movedraft-mb', 'class': 'cdx-button cdx-button--action-destructive' })
                        .text(moveText)
                        .css({ 'color': '#d33', 'font-weight': 'bold', 'padding': '12px', 'margin': '5px', 'display': 'inline-block' });

                    $mobileMenu.append($customLink);
                    $customLink.on('click', function(e) { e.preventDefault(); launchMoverWizard(); });
                }
                clearInterval(checkMenu); 
            }
        }, 1000);
    }

    function launchMoverWizard() {
        var pageTitle = mw.config.get('wgPageName');
        var draftTitle = 'খসড়া:' + pageTitle;
        var displayTitle = pageTitle.replace(/_/g, ' ');
        var reasons = ["তথ্যসূত্র নেই", "যান্ত্রিক অনুবাদ", "প্রচারণামূলক", "ভাষাগত ত্রুটি", "নিবন্ধটি সম্পূর্ণ নয়", "তৈরিকারীর নিজে স্থানান্তর", "অনির্ভরযোগ্য উৎস", "অপসারণযোগ্য তবে সংশোধন করা হলে গ্রহণযোগ্য হতে পারে।"];

        var reasonHtml = reasons.map(function(r) {
            return '<div style="margin-bottom:12px;"><label style="font-size:15px; cursor:pointer; display:flex; align-items:center; color:var(--color-base, #202122);">' +
                   '<input type="checkbox" class="dm-reason-checkbox" value="'+r+'" style="width:18px; height:18px; margin-right:10px; cursor:pointer;"> '+r+'</label></div>';
        }).join('');

        var modalOverlay = $(
            '<div id="dm-modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); backdrop-filter: blur(3px); z-index:100000; display:flex; justify-content:center; align-items:center;">' +
            '<div style="background:var(--background-color-base, #ffffff); color:var(--color-base, #202122); width:90%; max-width:400px; padding:25px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.3); font-family: sans-serif;">' +
            '<h2 style="margin:0 0 18px 0; font-size:22px; border-bottom:1px solid var(--border-color-base, #eaecf0); padding-bottom:12px; font-weight:bold; color: var(--color-progressive, #36c);">খসড়া স্থানান্তর</h2>' +
            '<div style="margin-bottom:20px; max-height:260px; overflow-y:auto; padding-right:5px;">' + reasonHtml + '</div>' +
            '<input type="text" id="dm-other-reason" placeholder="অন্যান্য (ঐচ্ছিক)..." style="width:100%; padding:12px; background:var(--background-color-interactive-subtle, #f8f9fa); color:var(--color-base, #202122); border:1px solid var(--border-color-base, #a2a9b1); border-radius:6px; margin-bottom:20px; box-sizing:border-box; outline:none;">' +
            '<div style="display:flex; gap:12px;"><button id="dm-btn-cancel" style="flex:1; padding:12px; border:1px solid var(--border-color-base, #a2a9b1); background:transparent; color:var(--color-base, #202122); border-radius:6px; cursor:pointer; font-weight:bold;">বাতিল</button>' +
            '<button id="dm-btn-submit" style="flex:2; padding:12px; border:none; background:var(--background-color-progressive, #36c); color:#fff; border-radius:6px; font-weight:bold; cursor:pointer;">স্থানান্তর ও বিজ্ঞপ্তি</button></div>' +
            '<div style="margin-top: 20px; text-align: center; font-size: 13px; color: var(--color-subtle, #72777d); border-top: 1px solid var(--border-color-base, #eaecf0); padding-top: 12px;">তৈরি করেছেন: <a href="/wiki/User:Anaf_Ibn_Shahibul" target="_blank" style="color:var(--color-progressive, #36c); text-decoration:none; font-weight:bold;">Anaf Ibn Shahibul</a></div>' +
            '</div></div>'
        );

        $('body').append(modalOverlay);

        $('#dm-btn-cancel').on('click', function() { $('#dm-modal-overlay').remove(); });

        $('#dm-btn-submit').on('click', function() {
            var selected = [];
            $('.dm-reason-checkbox:checked').each(function() { selected.push($(this).val()); });
            var other = $('#dm-other-reason').val().trim();
            if (other) selected.push(other);
            
            if (selected.length === 0) { 
                alert('দয়া করে অন্তত একটি কারণ নির্বাচন করুন!'); 
                return; 
            }

            var $btn = $(this);
            $btn.text('যাচাই করা হচ্ছে...').prop('disabled', true).css('background', 'var(--background-color-disabled, #999)');

            var api = new mw.Api();
            api.get({
                action: 'query', prop: 'revisions', titles: pageTitle, rvlimit: 1, rvdir: 'newer', rvprop: 'timestamp|user'
            }).then(function(res) {
                var pages = res.query.pages;
                var rev = pages[Object.keys(pages)[0]].revisions[0];
                var creator = rev.user;
                var createdTime = new Date(rev.timestamp).getTime();

                return api.get({
                    action: 'query', list: 'users', ususers: creator, usprop: 'groups'
                }).then(function(userRes) {
                    var groups = userRes.query.users[0].groups || [];
                    var isAdmin = groups.indexOf('sysop') !== -1;
                    
                    var now = new Date().getTime();
                    var hoursDiff = (now - createdTime) / (1000 * 60 * 60);
                    var daysDiff = hoursDiff / 24;

                    var warnings = [];
                    if (hoursDiff < 48) warnings.push("- নিবন্ধটি ৪৮ ঘণ্টার কম পুরনো।");
                    if (daysDiff > 90) warnings.push("- নিবন্ধটি ৯০ দিনের বেশি পুরনো।");
                    if (isAdmin) warnings.push("- নিবন্ধটির প্রণেতা একজন প্রশাসক।");

                    if (warnings.length > 0) {
                        var proceed = confirm("সতর্কতা:\n" + warnings.join("\n") + "\n\nএরপরেও কি আপনি এটি স্থানান্তর করতে চান?");
                        if (!proceed) {
                            $btn.text('স্থানান্তর ও বিজ্ঞপ্তি').prop('disabled', false).css('background', 'var(--background-color-progressive, #36c)');
                            return $.Deferred().reject('Cancelled by user');
                        }
                    }

                    $btn.text('প্রক্রিয়াকরণ হচ্ছে...');
                    executeMigration(pageTitle, draftTitle, selected, displayTitle);
                });
            }).catch(function(err) {
                if (err !== 'Cancelled by user') {
                    alert('তথ্য যাচাই করতে সমস্যা হয়েছে।');
                    $btn.text('স্থানান্তর ও বিজ্ঞপ্তি').prop('disabled', false).css('background', 'var(--background-color-progressive, #36c)');
                }
            });
        });
    }

    function executeMigration(oldTitle, newTitle, reasonArray, displayTitle) {
        var api = new mw.Api();
        var reasonText = reasonArray.join(', ');
        var fullReason = 'খসড়ায় স্থানান্তর: ' + reasonText;
        var userName = mw.config.get('wgUserName');

        api.postWithToken('csrf', {
            action: 'move', from: oldTitle, to: newTitle, reason: fullReason, noredirect: false, movetalk: true
        }).then(function() {
            var dbTag = '{{দ্রুত অপসারণ|g6|খসড়ায় স্থানান্তরিত নিবন্ধের রিডাইরেক্ট}}\n{{db-move|' + newTitle + '}}\n';
            return api.postWithToken('csrf', {
                action: 'edit', title: oldTitle, text: dbTag, summary: 'খসড়ায় স্থানান্তরের পর দ্রুত অপসারণ প্রস্তাবনা যোগ করা হলো'
            });
        }).then(function() {
            return api.postWithToken('csrf', {
                action: 'edit', title: newTitle, prependtext: '{{AFC draft}}\n\n', summary: 'খসড়ায় স্থানান্তরের পর {{AFC draft}} যুক্ত করা হলো'
            });
        }).then(function() {
            var logEntry = '\n* [[' + oldTitle + ']] থেকে [[' + newTitle + ']] — কারণ: ' + reasonText + ' — স্থানান্তরের সময়: — 👋 '''[[User:Anaf Ibn Shahibul|<span style="color:#1B5E20">আনাফ</span> <span style="color:#388E3C">ইবনে</span> <span style="color:#66BB6A">সাহেবুল</span>]]''' <sup>([[User talk:Anaf Ibn Shahibul|📨/📥]])</sup> [[বাংলাদেশ|🇧🇩]] [[উইকিপিডিয়া|🌐]] ১২:৩৭, ২৫ জুন ২০২৬ (ইউটিসি)';
            return api.postWithToken('csrf', {
                action: 'edit', title: 'উইকিপিডিয়া:খসড়া স্থানান্তর/লগ', appendtext: logEntry, summary: '[[' + newTitle + ']] লগে যুক্ত করা হলো'
            });
        }).then(function() {
            var wikidataApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php');
            return wikidataApi.postWithToken('csrf', {
                action: 'wbsetsitelink',
                site: 'bnwiki',
                title: oldTitle,
                linktitle: ''
            }).css('background', 'transparent');
        }).then(function() {
            return api.get({
                action: 'query', prop: 'revisions', titles: newTitle, rvlimit: 1, rvdir: 'newer', rvprop: 'user'
            }).then(function(res) {
                var pages = res.query.pages;
                var creator = pages[Object.keys(pages)[0]].revisions[0].user;
                if (creator === userName) return; 
                
                var notice = `\nপ্রিয় ব্যবহারকারী, উইকিপিডিয়ায় অবদান রাখার জন্য আপনাকে ধন্যবাদ। তবে আপনার তৈরি করা [[${newTitle}|${displayTitle}]] নিবন্ধটি এখনো প্রধান নাম স্থানের জন্য প্রস্তুত মনে হচ্ছে না। তাই আমি এটি খসড়ায় স্থানান্তর করেছি যাতে আপনি উইকিপিডিয়ার প্রধান নাম স্থান থেকে কিছুদিনের জন্য নিরবিচ্ছিন্নভাবে নিবন্ধটির কাজ করতে পারেন। এটিকে খসড়ায় স্থানান্তর করার মূল কারণসমূহ হলো: '''${reasonText}'''।\n\n` +
                             `আপনি খসড়া পাতাটিতে প্রয়োজনীয় সংশোধন ও তথ্যসূত্র যুক্ত করতে পারেন। কাজ শেষ হলে খসড়াটি পর্যালোচনার জন্য জমা দিন বাটনে ক্লিক করে জমা দিতে পারবেন। 
ধন্যবাদান্তে, — ` + '~' + '~~' + '~';

                return api.postWithToken('csrf', {
                    action: 'edit', title: 'User talk:' + creator, appendtext: notice, section: 'new',
                    summary: `[[${newTitle}|${displayTitle}]] খসড়ায় স্থানান্তরিত হয়েছে`
                });
            });
        }).done(function() {
            window.location.href = mw.util.getUrl(newTitle);
        }).fail(function(code, err) {
            alert('ত্রুটি ঘটেছে (' + code + '): ' + (err.error ? err.error.info : 'অজানা সমস্যা'));
            $('#dm-modal-overlay').remove();
        });
    }

    $(document).ready(setupDraftMover);
})(jQuery, mediaWiki);
//</nowiki>
