/**
 * Wikipedia System Tray Notifier (Mobile Native)
 * Author: Anaf
 */
(function ($, mw) {
    'use strict';

    const SW_URL = mw.util.getUrl('User:Anaf_Ibn_Shahibul/sw.js', { action: 'raw', ctype: 'text/javascript' });

    async function registerServiceWorker() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.register(SW_URL);
                console.log('Service Worker Registered');
                return registration;
            } catch (error) {
                console.error('Service Worker Error', error);
            }
        }
    }

    async function showNativeNotification(title, body, url) {
        const registration = await registerServiceWorker();
        if (Notification.permission === 'granted' && registration) {
            registration.showNotification(title, {
                body: body,
                icon: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png',
                data: { url: url },
                vibrate: [200, 100, 200]
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    function checkNotifications(isFirstLoad) {
        new mw.Api().get({
            action: 'query',
            meta: 'notifications',
            notfilter: 'unread',
            formatversion: 2,
            // এখানে উনিক টাইমস্ট্যাম্প যোগ করা হয়েছে যেন ব্রাউজার ক্যাশ থেকে পুরোনো ডাটা না দেখায়
            ustoken: new Date().getTime() 
        }).done(function (data) {
            if (!data || !data.query || !data.query.notifications) return;
            
            const list = data.query.notifications.list;
            if (list && list.length > 0) {
                const latest = list[0];
                const latestId = latest.id; 

                const lastSeenId = localStorage.getItem('wp_last_notification_id');
                
                if (isFirstLoad) {
                    localStorage.setItem('wp_last_notification_id', latestId);
                    return;
                }

                if (latestId !== lastSeenId) {
                    localStorage.setItem('wp_last_notification_id', latestId);
                    
                    const cleanMsg = latest.header.replace(/<[^>]+>/g, '');
                    const targetUrl = (latest.links && latest.links.primary) ? latest.links.primary.url : '#';
                    
                    showNativeNotification("উইকিপিডিয়া বার্তা", cleanMsg, targetUrl);
                }
            }
        });
    }

    $(function () {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
        
        checkNotifications(true);
        
        // প্রতি ৩০ সেকেন্ড পর পর একদম নতুন ডাটা চেক করবে
        setInterval(function() {
            checkNotifications(false);
        }, 30000); 
        
        var testLink = mw.util.addPortletLink('p-tb', '#', 'System Notif Test', 't-sys-test');
        $(testLink).click(function(e) {
            e.preventDefault();
            showNativeNotification("সফল!", "টেস্ট নোটিফিকেশন ঠিকঠাক কাজ করছে।", "#");
        });
    });

})(jQuery, mediaWiki);