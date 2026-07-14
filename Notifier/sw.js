// sw.js - এটি ব্যাকগ্রাউন্ডে নোটিফিকেশন হ্যান্ডেল করবে
self.addEventListener('push', function(event) {
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png',
        badge: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png',
        vibrate: [200, 100, 200]
    };
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// নোটিফিকেশনে ক্লিক করলে পেজ ওপেন হবে
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
