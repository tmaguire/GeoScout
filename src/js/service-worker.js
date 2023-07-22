/* jshint esversion:8 */
// Install service worker
const cacheName = 'GeoScout-/* @echo VERSION */'; // Set cache name to align with version

// Static resources to cache immediately
let resourcesToCache = [
	// Core JavaScript
	'./js/browser-compat-/* @echo VERSION */.min.js',
	'./js/main-/* @echo VERSION */.min.js',
	// Core CSS
	'./css/bundle-/* @echo VERSION */.min.css',
	// Bootstrap icons (fonts)
	'./css/fonts/bootstrap-icons.woff',
	'./css/fonts/bootstrap-icons.woff2',
	// Navbar icon
	'./img/logo.webp',
	'./img/logo.png',
	// Footer icon
	'./img/group.png',
	'./img/group.webp',
	// Web app icons
	'./img/favicon.png',
	'./img/icon.png',
	'./img/maskable.png',
	'./img/splash.png',
	// Map icons
	'./img/found.png',
	'./img/notFound.png'
];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(cacheName).then(cache => {
			return cache.addAll(resourcesToCache);
		})
	);
});

// Cache and return requests
self.addEventListener('fetch', event => {
	// Parse the URL
	const requestURL = new URL(event.request.url);
	// Handle service worker URL
	if (/^\/service-worker.js$/.test(requestURL.pathname)) {
		event.respondWith(fetch(event.request));
		return;
	}
	const destination = event.request.destination;
	switch (destination) {
		case 'document':
		case 'style':
		case 'script':
		case 'font':
		case 'image': {
			event.respondWith(
				caches.match(event.request).then(function (response) {
					return response || fetch(event.request);
				}));
			return;
		}
		default: {
			event.respondWith(fetch(event.request));
			return;
		}
	}
});

// Update a service worker
const cacheAllowList = [cacheName];
self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys().then(cacheNames => {
			return Promise.all(
				cacheNames.map(cacheName => {
					if (cacheAllowList.indexOf(cacheName) === -1) {
						return caches.delete(cacheName);
					}
				})
			);
		})
	);
});

// Listen to messages
self.addEventListener('message', function (event) {
	if (event.origin !== '/* @echo APPURL */') {
		return;
	} else {
		if (event.data.action === 'skipWaiting') {
			self.skipWaiting();
		}
	}
});