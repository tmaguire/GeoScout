/* jshint esversion:10 */
/** 
 * @typedef {String} AccessTokenString 
 */
/** 
 * @typedef {Object} AccessTokenObject
 * @property {String} [sub] - Subject/Display name for user
 * @property {String} [oid] - Object identifier (SharePoint List Item ID)
 * @property {String} [jwtId] - Unique identifier for JWT
 * @property {Number} [iat] - Valid since
 * @property {Number} [exp] - Valid to
 * @property {String} [aud] - Audience (www.geoscout.uk for app tokens)
 * @property {String} [iss] - Issuer (api.geoscout.uk)
 */
// Imports
import 'bootstrap';
import { Collapse } from 'bootstrap';
import Navigo from 'navigo';
import Swal from 'sweetalert2';
import DOMPurify from 'dompurify';
import { Loader } from '@googlemaps/js-api-loader';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import QrScanner from 'qr-scanner';
import { Grid, html } from 'gridjs';
import localforage from 'localforage';
import ky from 'ky';
// Constants from build process
const appUrl = '/* @echo appUrl */';
const appName = '/* @echo appName */';
const googleMapsApiKey = '/* @echo googleMapsApiKey */';
const what3wordsApiKey = '/* @echo what3wordsApiKey */';
const holdingEnabled = Boolean('/* @echo appHolding */'.toLowerCase() !== 'false');
// Variables
let mainMap = null;
let router = null;
let newWorker = false;
let locationWatch = null;
// Loader animation
const loadingGif = '<div class="text-center"><img src="./img/loading.gif" height="150" width="150" class="img-fluid text-center" alt="Loading animation placeholder"></div>';

// Method for creating toast notifications
const showToast = Swal.mixin({
	toast: true,
	position: 'top-end',
	showConfirmButton: false,
	timer: 3000,
	timerProgressBar: true,
	didOpen: (toast) => {
		toast.addEventListener('mouseenter', Swal.stopTimer);
		toast.addEventListener('mouseleave', Swal.resumeTimer);
	}
});

/**
 * @function getAccessToken - Retrieves an access token (if present)
 * @param {Boolean} [required=false] - Forces an access token to be generated if not already acquired
 * @returns {Promise<AccessTokenString>} - Access token
 */
function getAccessToken(required = false) {
	return new Promise((resolve, reject) => {
		localforage.getItem('accessToken')
			.then(accessToken => {
				if (accessToken) {
					resolve(accessToken);
				} else {
					if (localStorage.getItem('accessToken') === null || localStorage.getItem('accessToken') === '') {
						if (required) {
							try {
								resolve(newAccessToken());
							} catch (error) {
								reject(error);
							}
						} else {
							resolve(false);
						}
					} else {
						// Migrate token to localforage
						resolve(localforage.setItem('accessToken', localStorage.getItem('accessToken')));
					}

				}
			});
	});
}

/**
 * @function newAccessToken - Registers a new account and stores access token
 * @returns {Promise<AccessTokenString>} - Access token
 */
function newAccessToken() {
	const uuid = crypto.randomUUID().toString();
	return ky.post('./api/get-token', {
		json: {
			uuid
		}
	})
		.json()
		.then(handleErrors)
		.then(data => {
			return ky.post('./api/get-token', {
				json: {
					uuid,
					token: data.token
				}
			})
				.json();
		})
		.then(handleErrors)
		.then(data => {
			return localforage.setItem('accessToken', data.accessToken);
		});
}

/**
 * @function parseAccessToken - Parse access token to populate UI
 * @param {AccessTokenString} [token] - Access token string to parse
 * @returns {Promise<AccessTokenObject>}
 */
function parseAccessToken(token) {
	return new Promise((resolve, reject) => {
		try {
			if (!token) {
				resolve(false);
			}
			const base64Url = token.split('.')[1];
			const base64 = String(base64Url).replaceAll('-', '+').replaceAll('_', '/');
			resolve(JSON.parse(window.atob(base64)));
		} catch (error) {
			reject(error);
		}
	});
}

/**
 * @function showError - Error message function
 * @param {String} [error='An issue occurred'] 
 * @param {Boolean} [button=false] 
 * @param {false|String} [goBackToPage=false]
 * @return {void}
 */
function showError(error = 'An issue occurred', button = false, goBackToPage = false) {
	Swal.fire({
		title: error,
		icon: 'error',
		buttonsStyling: false,
		customClass: {
			confirmButton: 'btn btn-primary m-1 shadow'
		},
		showConfirmButton: button,
		allowOutsideClick: button,
		allowEscapeKey: button,
		allowEnterKey: button,
		didOpen: () => {
			Swal.hideLoading();
		},
		didClose: () => {
			if (goBackToPage) {
				router.navigate(goBackToPage);
			}
		}
	});
}

/**
 * @function getPrettyDate - Format dates in simple/human readable way
 * @param {Date} [date] - Date object to format
 * @param {false|String} [prefomattedDate=false] - Optional string to replace date in output
 * @param {Boolean} [hideYear=false] - Hide year from output
 * @returns {String}
 */
function getPrettyDate(date = new Date(), prefomattedDate = false, hideYear = false) {
	const months = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];
	const days = [
		'Sunday',
		'Monday',
		'Tuesday',
		'Wednesday',
		'Thursday',
		'Friday',
		'Saturday'
	];
	const day = String(date.getDate());
	const prettyDay = `${days[date.getDay()]} ${day}${(day === '1') || (day === '21') || (day === '31') ? 'st' : (day === '2') || (day === '22') ? 'nd' : (day === '3') || (day === '23') ? 'rd' : 'th'}`;
	const month = months[date.getMonth()];
	const year = date.getFullYear();
	const time = String(date.toLocaleTimeString('en-GB', {
		hour: 'numeric',
		minute: 'numeric',
		hour12: true,
		hourCycle: 'h12'
	})).replace(/\s+/g, '');
	const formattedTime = `${time.split(':')[0] === '0' ? `12:${time.split(':')[1]}` : time}`;
	if (prefomattedDate) {
		// Today at 10:20am
		// Yesterday at 10:20am
		return `${prefomattedDate} at ${formattedTime}`;
	}
	if (hideYear) {
		// Tuesday 1st August at 10:20am
		return `${prettyDay} ${month} at ${formattedTime}`;
	}
	// Tuesday 1st August 2023 at 10:20am
	return `${prettyDay} ${month} ${year} at ${formattedTime}`;
}

/**
 * @function getTimeAgo - Function to return formatted date based on time ago
 * @param {Date|String} [dateParam] 
 * @returns {String|null}
 */
function getTimeAgo(dateParam) {
	if (!dateParam) {
		return null;
	}
	const date = typeof dateParam === 'object' ? dateParam : new Date(dateParam);
	const today = new Date();
	const yesterday = new Date(today - (24 * 60 * 60 * 1000));
	const seconds = Math.round((today - date) / 1000);
	const minutes = Math.round(seconds / 60);
	const isToday = today.toDateString() === date.toDateString();
	const isYesterday = yesterday.toDateString() === date.toDateString();
	const isThisYear = today.getFullYear() === date.getFullYear();
	if (seconds < 5) {
		return 'now';
	} else if (seconds < 60) {
		return `${seconds} seconds ago`;
	} else if (seconds < 90) {
		return 'about a minute ago';
	} else if (minutes < 60) {
		return `${minutes} minutes ago`;
	} else if (isToday) {
		return getPrettyDate(date, 'Today');
	} else if (isYesterday) {
		return getPrettyDate(date, 'Yesterday');
	} else if (isThisYear) {
		return getPrettyDate(date, false, true);
	}
	return getPrettyDate(date);
}

/**
 * @function appendSuffix - Adds correct suffix to position number for leaderboard
 * @param {Number} [number] 
 * @returns {String}
 */
function appendSuffix(number) {
	const firstPass = number % 10;
	const secondPass = number % 100;
	if (firstPass === 1 && secondPass !== 11) {
		return `${number}st`;
	}
	if (firstPass === 2 && secondPass !== 12) {
		return `${number}nd`;
	}
	if (firstPass === 3 && secondPass !== 13) {
		return `${number}rd`;
	}
	return `${number}th`;
}

// Function to handle errors from serverless functions
function handleErrors(response) {
	// If the response has an error property
	if (Object.prototype.hasOwnProperty.call(response, 'error')) {
		// Throw error message
		throw Error(response.error);
	}
	// If the response has a lambda error
	if (Object.prototype.hasOwnProperty.call(response, 'errorMessage')) {
		// Throw error message
		throw Error(`${response.errorType}: ${response.errorMessage}`);
	}
	// Return the data response object
	return response;
}

/**
 * @function changePage
 * @param {String} [page=''] 
 * @param {false|String} [title=false] 
 * @param {false|String} [id=false] 
 * @returns {void}
 */
function changePage(page = '', title = false, id = false) {
	// Update Canonical tag
	document.querySelector("link[rel='canonical']").setAttribute('href', page === '404' ? appUrl : (id ? `${appUrl}/${page}-${id}` : `${appUrl}/${page}`));
	// Update menu
	document.querySelectorAll('a.nav-link').forEach(menuItem => {
		if (menuItem.getAttribute('href') === (page === 'holding' ? 'home' : page)) {
			menuItem.classList.add('active');
			menuItem.setAttribute('aria-current', 'page');
		} else {
			menuItem.classList.remove('active');
			menuItem.removeAttribute('aria-current');
		}
	});
	// Hide all pages (except selected)
	document.querySelectorAll('section').forEach(section => {
		if (section.id !== page) {
			section.classList.add('d-none');
			section.setAttribute('aria-hidden', 'true');
		}
	});
	// Set page as active
	document.getElementById(page).classList.remove('d-none');
	document.getElementById(page).removeAttribute('aria-hidden');
	// Change document title
	document.title = `${title} | ${appName}`;
	// Scroll to top
	window.scrollTo({
		top: 0,
		left: 0,
		behavior: 'smooth'
	});
	// Close the navbar menu (if it is open)
	const menuToggle = document.getElementById('navbarToggler');
	const bsCollapse = new Collapse(menuToggle, {
		toggle: false
	});
	bsCollapse.hide();
}

/**
 * @function loadCachesMapPage
 * @returns {Promise<void>}
 */
function loadCachesMapPage() {
	const mapContainer = document.getElementById('mapContainer');
	const mapToolbar = document.getElementById('mapToolbar');
	mapToolbar.replaceChildren();
	mapContainer.innerHTML = loadingGif;
	changePage('viewCaches', 'View caches', false)
	const loader = new Loader({
		apiKey: googleMapsApiKey,
		version: 'quarterly',
		libraries: ['drawing', 'marker'],
		language: 'en',
		region: 'GB',
		id: 'googleMapsScript'
	});
	let caches;
	let cluster;
	let Circle;
	return getAccessToken()
		.then(accessToken => {
			return ky.get('./api/get-caches', {
				...(accessToken && {
					headers: {
						Authorization: `Bearer ${accessToken}`
					}
				})
			})
				.json();
		})
		.then(handleErrors)
		.then(data => {
			if (Object.prototype.hasOwnProperty.call(data, 'caches')) {
				caches = data.caches;
			} else {
				throw 'No caches found';
			}
			try {
				return window.google.maps;
			} catch {
				return loader.importLibrary('maps');
			}
		})
		.then(google => {
			mapContainer.innerHTML = '<div id="mapFilter"></div><div id="mainMap" class="rounded shadow"></div><div class="my-3 text-center"><a href="viewCachesTable" class="text-decoration-none" data-navigo="true"><i class="bi bi-table" aria-hidden="true"></i>&nbsp;View map data as a table</a></div>';
			router.updatePageLinks();
			mainMap = null;
			mainMap = new google.Map(document.getElementById('mainMap'), {
				center: {
					lat: 51.80007,
					lng: 0.64038
				},
				zoom: 13,
				minZoom: 12,
				mapId: '6b8e857a992e95a7',
				streetViewControl: false,
				mapTypeControl: true,
				fullscreenControl: true,
				zoomControl: true,
				renderingType: google.RenderingType.VECTOR
			});
			Circle = google.Circle;
			try {
				return window.google.maps.marker;
			} catch {
				return loader.importLibrary('marker');
			}
		})
		.then(google => {
			try {
				const markers = caches.flatMap(cache => {
					if (!cache.suspended) {
						const markerContent = document.createElement('div');
						markerContent.textContent = DOMPurify.sanitize(cache.id);
						markerContent.classList.add(cache.found ? 'marker-found' : 'marker-notfound');
						const marker = new google.AdvancedMarkerElement({
							position: {
								lat: Number(DOMPurify.sanitize(cache.coordinates).split(',')[0]),
								lng: Number(DOMPurify.sanitize(cache.coordinates).split(',')[1])
							},
							map: mainMap,
							title: `Cache ${DOMPurify.sanitize(cache.id)}`,
							gmpClickable: true,
							content: markerContent
						});
						marker.addListener('click', () => {
							router.navigate(`/viewCache-${cache.id}`);
						});
						return [marker];
					} else {
						return [];
					}
				});
				cluster = new MarkerClusterer({
					map: mainMap,
					markers
				});
				return google;
			} catch (error) {
				console.warn(error);
				throw 'Unable to load caches';
			}
		})
		.then(google => {
			let currentFilter = 'all';
			document.getElementById('mapFilter').innerHTML = `<fieldset><div class="btn-group mb-3 shadow">
				<legend class="visually-hidden">Filter control for the map to toggle which caches are visible</legend>
				<input type="radio" class="btn-check" name="mapFilterBtn" id="mapFilterAll" autocomplete="off" value="all" checked>
				<label class="btn btn-outline-primary rounded-start" for="mapFilterAll">All caches</label>
				<input type="radio" class="btn-check" name="mapFilterBtn" id="mapFilterNotFound" autocomplete="off" value="notFound">
				<label class="btn btn-outline-primary" for="mapFilterNotFound">Caches you haven't found</label>
				<input type="radio" class="btn-check" name="mapFilterBtn" id="mapFilterFound" autocomplete="off" value="found">
				<label class="btn btn-outline-primary" for="mapFilterFound">Caches you've found</label>
			</div></fieldset>`;

			function changeFilter(filter) {
				if (currentFilter !== filter) {
					cluster.clearMarkers();
					currentFilter = filter;
					const filterMode = (filter === 'all') ? {
						found: true,
						notFound: true
					} : {
						found: (filter === 'found'),
						notFound: (filter === 'notFound')
					};
					const markers = [];
					caches.forEach(cache => {
						if ((cache.found && filterMode.found || !cache.found && filterMode.notFound) && !cache.suspended) {
							const markerContent = document.createElement('div');
							markerContent.textContent = DOMPurify.sanitize(cache.id);
							markerContent.classList.add(cache.found ? 'marker-found' : 'marker-notfound');
							const marker = new google.AdvancedMarkerElement({
								position: {
									lat: Number(DOMPurify.sanitize(cache.coordinates).split(',')[0]),
									lng: Number(DOMPurify.sanitize(cache.coordinates).split(',')[1])
								},
								map: mainMap,
								title: `Cache ${DOMPurify.sanitize(cache.id)}`,
								gmpClickable: true,
								content: markerContent
							});
							marker.addListener('click', () => {
								router.navigate(`/viewCache-${cache.id}`);
							});
							markers.push(marker);
						}
					});
					cluster.addMarkers(markers);
				}
			}
			['mapFilterAll', 'mapFilterNotFound', 'mapFilterFound'].forEach(element => {
				document.getElementById(element)
					.addEventListener('click', function () {
						changeFilter(document.querySelector('input[name="mapFilterBtn"]:checked').value);
					});
			});
			return google;
		})
		.then(google => {
			// Create button and add to toolbar
			const defaultBtn = '<i class="bi bi-crosshair" aria-hidden="true"></i>&nbsp;Show your location';
			const activeBtn = '<i class="bi bi-crosshair" aria-hidden="true"></i>&nbsp;Move map to your location';
			const button = document.createElement('button');
			button.setAttribute('id', 'mapLocation');
			button.setAttribute('class', 'btn btn-primary shadow');
			button.innerHTML = defaultBtn;
			mapToolbar.appendChild(button);
			const locateBtn = document.getElementById('mapLocation');
			let locationActive = false;
			let currentUserLocation = {
				lat: 0,
				lng: 0
			};
			let marker = null;
			let accuracy = null;
			locateBtn.addEventListener('click', function () {
				if (locationActive) {
					mainMap.setCenter(currentUserLocation);
					mainMap.setZoom(19);
				} else {
					locateBtn.setAttribute('disabled', true);
					locateBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>&nbsp;Locating...';
					locationWatch = navigator.geolocation.watchPosition(({ coords }) => {
						currentUserLocation = {
							lat: coords.latitude,
							lng: coords.longitude,
						};
						if (!locationActive) {
							mainMap.setCenter(currentUserLocation);
							mainMap.setZoom(19);
							locateBtn.removeAttribute('disabled');
							locateBtn.innerHTML = activeBtn;
							locationActive = true;
						}
						if (marker === null) {
							const parser = new DOMParser();
							const pinSvgString = '<svg height="22" width="22" xmlns="http://www.w3.org/2000/svg"><circle r="10" cx="11" cy="11" stroke="rgb(255,255,255)" stroke-width="2" fill="#4285F4" /></svg>';
							const pinSvg = parser.parseFromString(pinSvgString, 'image/svg+xml',).documentElement;
							marker = new google.AdvancedMarkerElement({
								map: mainMap,
								position: currentUserLocation,
								content: pinSvg,
								title: 'Your location',
							});
						} else {
							marker.position = currentUserLocation;
						}
						if (accuracy === null) {
							accuracy = new Circle({
								center: currentUserLocation,
								radius: coords.accuracy,
								clickable: false,
								fillColor: '#61a0bf',
								fillOpacity: 0.4,
								strokeColor: '#1bb6ff',
								strokeOpacity: 0.4,
								strokeWeight: 1,
								zIndex: 1,
								map: mainMap
							});
						} else {
							accuracy.setCenter(currentUserLocation);
							accuracy.setRadius(coords.accuracy);
						}
					}, (error) => {
						if (error.message !== '') {
							locateBtn.removeAttribute('disabled');
							locateBtn.innerHTML = defaultBtn;
							showToast.fire({
								title: error.message,
								icon: 'error'
							});
						}
					}, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
				}
			});
			return mainMap;
		})
		.then(map => {
			// Cache for grid data
			let gridData = null;
			map.addListener('bounds_changed', function () {
				// Get current zoom level
				const zoom = map.getZoom();
				// Only show grid if zoom is at least 17
				const loadFeatures = zoom > 17;
				if (loadFeatures) {
					// Get bounds of map
					const ne = map.getBounds().getNorthEast();
					const sw = map.getBounds().getSouthWest();
					// Call the what3words Grid API to obtain the grid squares within the current visble bounding box
					ky.get(`https://api.what3words.com/v3/grid-section?key=${what3wordsApiKey}&bounding-box=${sw.lat()},${sw.lng()},${ne.lat()},${ne.lng()}&format=geojson`)
						.json()
						.then(function (data) {
							if (gridData !== null) {
								for (let i = 0; i < gridData.length; i++) {
									map.data.remove(gridData[i]);
								}
							}
							// Cache grid data to clear later
							gridData = map.data.addGeoJson(data);
						})
						.catch(console.error);
				}
				// Set the grid display style
				map.data.setStyle({
					visible: loadFeatures,
					strokeColor: "#777",
					strokeWeight: 0.5
				});
			});
		})
		.catch(error => {
			showError(error, true, 'home');
		});
}

function loadCachesTablePage() {
	const tableContainer = document.getElementById('tableContainer');
	tableContainer.innerHTML = loadingGif;
	let caches;
	getAccessToken()
		.then(accessToken => {
			return ky.get('./api/get-caches', {
				...(accessToken && {
					headers: {
						Authorization: `Bearer ${accessToken}`
					}
				})
			})
				.json();
		})
		.then(handleErrors)
		.then(data => {
			if (Object.prototype.hasOwnProperty.call(data, 'caches')) {
				caches = data.caches;
				return caches;
			} else {
				throw 'No caches found';
			}
		})
		.then(data => {
			tableContainer.innerHTML = '<div id="tableFilter"></div><div id="table"></div><div class="my-3 text-center"><a href="viewCaches" class="text-decoration-none" data-navigo="true"><i class="bi bi-map" aria-hidden="true"></i>&nbsp;View table data in a map</a></div>';
			const table = new Grid({
				columns: [{
					id: 'id',
					name: 'Cache ID',
					sort: {
						enabled: true
					},
					formatter: (cell) => html(`<a href="viewCache-${DOMPurify.sanitize(cell)}" data-navigo="true">${DOMPurify.sanitize(cell)}</a>`)
				},
				{
					id: 'location',
					name: 'what3words location',
					sort: {
						enabled: true
					},
					formatter: (location) => {
						const locationString = String(DOMPurify.sanitize(location)).split('///')[1];
						return html(`<a href="https://what3words.com/${locationString}?maptype=satellite" target="_blank" translate="no" rel="noopener noreferrer">///${locationString}<span class="text-decoration-none ms-1"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span></a>`);
					}
				},
				{
					id: 'found',
					name: html('Found<span class="visually-hidden"> this cache</span>?'),
					sort: {
						enabled: true
					},
					formatter: (cell) => {
						return (Boolean(cell) ? 'Yes 😊' : 'No ☹️');
					}
				},
				{
					id: 'stats',
					name: 'Stats',
					sort: {
						enabled: true
					},
					formatter: (count) => `${Number(count) > 0 ? `Found by ${Number(count)} ${Number(count) > 1 ? 'people 😊' : 'person 😮'}` : 'No one has found this cache yet 😢'}`
				}
				],
				autoWidth: false,
				sort: true,
				pagination: {
					enabled: true,
					limit: 15,
					summary: true
				},
				data: () => data.flatMap(cache => cache.suspended ? [] : [cache]),
				search: {
					enabled: true,
					selector: (cell, rowIndex, cellIndex) => (cellIndex === 0) ? cell : null
				},
				language: {
					search: {
						placeholder: 'Search by Cache ID'
					}
				}
			})
				.render(document.getElementById('table'));
			return table;
		})
		.then(table => {
			let currentFilter = 'all';
			document.getElementById('tableFilter').innerHTML = `<fieldset><div class="btn-group mb-3 shadow">
				<legend class="visually-hidden">Filter control for the map to toggle which caches are visible</legend>
				<input type="radio" class="btn-check" name="tableFilterBtn" id="tableFilterAll" autocomplete="off" value="all" checked>
				<label class="btn btn-outline-primary rounded-start" for="tableFilterAll">All caches</label>
				<input type="radio" class="btn-check" name="tableFilterBtn" id="tableFilterNotFound" autocomplete="off" value="notFound">
				<label class="btn btn-outline-primary" for="tableFilterNotFound">Caches you haven't found</label>
				<input type="radio" class="btn-check" name="tableFilterBtn" id="tableFilterFound" autocomplete="off" value="found">
				<label class="btn btn-outline-primary" for="tableFilterFound">Caches you've found</label>
			</div></fieldset>`;

			function changeFilter(filter) {
				if (currentFilter !== filter) {
					currentFilter = filter;
					const filterMode = (filter === 'all') ? {
						found: true,
						notFound: true
					} : {
						found: (filter === 'found'),
						notFound: (filter === 'notFound')
					};
					const cacheList = [];
					caches.forEach(cache => {
						if ((cache.found && filterMode.found || !cache.found && filterMode.notFound) && !cache.suspended) {
							cacheList.push(cache);
						}
					});
					table.updateConfig({
						data: cacheList
					}).forceRender();
				}
			}
			['tableFilterAll', 'tableFilterNotFound', 'tableFilterFound'].forEach(element => {
				document.getElementById(element)
					.addEventListener('click', function () {
						changeFilter(document.querySelector('input[name="tableFilterBtn"]:checked').value);
					});
			});
		})
		.finally(() => {
			router.updatePageLinks();
		})
		.catch(error => {
			showError(error, true, 'home');
		});
	changePage('viewCachesTable', 'View caches', false);
}

function loadCachePage(id) {
	resetCachePage();
	getAccessToken()
		.then(accessToken => {
			return ky.post('./api/get-cache', {
				json: {
					cache: id
				},
				...(accessToken && {
					headers: {
						Authorization: `Bearer ${accessToken}`
					}
				})
			})
				.json();
		})
		.then(handleErrors)
		.then(data => {
			if (!data.suspended) {
				document.getElementById('cacheCard').removeAttribute('aria-hidden');
				const img = document.getElementById('cacheMapImg');
				img.setAttribute('src', `${DOMPurify.sanitize(data.image)}`);
				img.setAttribute('alt', `Map for cache ${id}`);
				img.removeAttribute('height');
				img.removeAttribute('width');
				const header = document.getElementById('cacheHeader');
				header.setAttribute('class', 'card-title');
				header.replaceChildren();
				header.innerText = `Cache ${id}`;
				const w3wLink = document.getElementById('cacheW3WLink');
				w3wLink.setAttribute('class', 'card-text');
				const w3wAddress = String(DOMPurify.sanitize(data.location)).split('///')[1];
				const coordinates = String(DOMPurify.sanitize(data.coordinates));
				w3wLink.innerHTML = `<p><strong>what3words address:</strong>&nbsp;<a href="https://what3words.com/${w3wAddress}?maptype=satellite" target="_blank" translate="no" rel="noopener noreferrer">///${w3wAddress}<span class="text-decoration-none ms-1"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span></a></p>
				<p><strong>Grid reference:</strong>&nbsp;<a href="https://explore.osmaps.com/pin?lat=${coordinates.split(',')[0]}&lon=${coordinates.split(',')[1]}&zoom=18.0000&overlays=&style=Aerial&type=2d&placesCategory=" target="_blank" rel="noopener noreferrer">${DOMPurify.sanitize(data.gridRef)}<span class="text-decoration-none ms-1"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span></a><br><a class="text-decoration-none" href="https://getoutside.ordnancesurvey.co.uk/guides/beginners-guide-to-grid-references/" target="_blank" rel="noopener noreferrer">Learn more about grid references&nbsp;<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a></p>
				<p><br><strong id="cacheStats"></strong></p>`;
				const w3wBtn = document.getElementById('cacheW3WBtn');
				w3wBtn.removeAttribute('tabindex');
				w3wBtn.setAttribute('class', 'btn btn-primary m-1 shadow');
				w3wBtn.setAttribute('href', `https://what3words.com/${w3wAddress}?maptype=satellite`);
				w3wBtn.setAttribute('target', '_blank');
				w3wBtn.setAttribute('rel', 'noopener noreferrer');
				w3wBtn.innerHTML = '<i class="bi bi-geo-alt" aria-hidden="true"></i>&nbsp;Open in what3words';
				const mapBtn = document.getElementById('cacheMapsLink');
				mapBtn.removeAttribute('tabindex');
				mapBtn.setAttribute('class', 'btn btn-primary m-1 shadow');
				mapBtn.setAttribute('href', `https://www.google.com/maps/search/?api=1&query=${coordinates}`);
				mapBtn.setAttribute('target', '_blank');
				mapBtn.setAttribute('rel', 'noopener noreferrer');
				mapBtn.innerHTML = '<i class="bi bi-geo-alt" aria-hidden="true"></i>&nbsp;Open in Google Maps';
				const foundBtn = document.getElementById('cacheFoundLink');
				const cacheStats = document.getElementById('cacheStats');
				if (data.found) {
					foundBtn.setAttribute('class', 'btn btn-outline-primary m-1 disabled');
					foundBtn.removeAttribute('tabindex');
					foundBtn.innerHTML = `<i class="bi bi-patch-check" aria-hidden="true"></i>&nbsp;You've already found this cache`;
					cacheStats.innerText = `You ${Number(data.stats) === 1 ? 'are the only person that has found this cache! 😮' : `and ${Number(data.stats) - 1} other ${(Number(data.stats) - 1) === 1 ? 'person has' : 'people have'} found this cache 😊`}`;
				} else {
					foundBtn.setAttribute('class', 'btn btn-outline-primary m-1 shadow');
					foundBtn.setAttribute('href', `foundCache-${id}`);
					foundBtn.setAttribute('data-navigo', true);
					foundBtn.removeAttribute('tabindex');
					foundBtn.innerHTML = '<i class="bi bi-123" aria-hidden="true"></i>&nbsp;Found this cache?';
					cacheStats.innerText = `${Number(data.stats) === 0 ? 'No one has found this cache yet 😢 can you find it?' : `${Number(data.stats)} ${Number(data.stats) === 1 ? 'person has' : 'people have'} found this cache - can you find it?`}`;
					router.updatePageLinks();
				}
			} else {
				throw "This cache is temporarily unavailable";
			}
		})
		.catch(error => {
			showError(error, true, 'viewCaches');
		});
	changePage('viewCache', `Cache ${id}`, id);
}

function resetCachePage() {
	document.getElementById('cacheCard').setAttribute('aria-hidden', 'true');
	const img = document.getElementById('cacheMapImg');
	img.setAttribute('src', './img/loading.gif');
	img.setAttribute('alt', 'Loading animation placeholder');
	img.setAttribute('height', '150');
	img.setAttribute('width', '150');
	const header = document.getElementById('cacheHeader');
	header.setAttribute('class', 'card-title placeholder-glow');
	header.innerHTML = '<span class="placeholder col-6"></span>';
	const w3wLink = document.getElementById('cacheW3WLink');
	w3wLink.setAttribute('class', 'card-text placeholder-glow');
	w3wLink.innerHTML = '<span class="placeholder col-7"></span><span class="placeholder col-4"></span><span class="placeholder col-4"></span><span class="placeholder col-6"></span><span class="placeholder col-8"></span>';
	const w3wBtn = document.getElementById('cacheW3WBtn');
	w3wBtn.removeAttribute('target');
	w3wBtn.removeAttribute('href');
	w3wBtn.setAttribute('tabindex', '-1');
	w3wBtn.setAttribute('class', 'btn btn-primary m-1 disabled placeholder col-5');
	w3wBtn.replaceChildren();
	const mapBtn = document.getElementById('cacheMapsLink');
	mapBtn.removeAttribute('target');
	mapBtn.removeAttribute('href');
	mapBtn.setAttribute('tabindex', '-1');
	mapBtn.setAttribute('class', 'btn btn-primary m-1 disabled placeholder col-5');
	mapBtn.replaceChildren();
	const foundBtn = document.getElementById('cacheFoundLink');
	foundBtn.removeAttribute('target');
	foundBtn.removeAttribute('href');
	foundBtn.setAttribute('tabindex', '-1');
	foundBtn.setAttribute('class', 'btn btn-outline-primary m-1 disabled placeholder col-4');
	foundBtn.replaceChildren();
}

function loadFoundCachePage(id) {
	changePage('viewCache', `Cache ${id}`, id);
	Swal.fire({
		title: `Found cache ${id}?`,
		text: "If you've found this cache, please enter the 5-digit code below to mark it as found:",
		input: 'text',
		inputAttributes: {
			// Set virtual keyboard to numbers only mode
			inputmode: 'numeric',
			// Regex for numbers only and length of 5 characters
			pattern: '[0-9]*',
			maxlength: 5,
			// Ignore autofill via browser/password manager(s)
			autocomplete: 'off',
			'data-lpignore': true,
			'data-1p-ignore': true,
			'data-form-type': 'other',
			// Change hint for virtual keyboard enter key
			enterkeyhint: 'go'
		},
		showCancelButton: true,
		buttonsStyling: false,
		customClass: {
			cancelButton: 'btn btn-link m-1',
			confirmButton: 'btn btn-primary m-1 shadow',
			input: 'form-control swal2-file',
			loader: 'custom-loader'
		},
		loaderHtml: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Verifying code...</span></div>',
		returnFocus: false,
		confirmButtonText: 'Verify cache code',
		backdrop: true,
		showLoaderOnConfirm: true,
		allowOutsideClick: () => !Swal.isLoading(),
		inputValidator: (value) => {
			if (!value) {
				return 'You must enter the 5-digit code from the cache to confirm you have found it';
			} else if (value.length !== 5 || (Number.isNaN(Number(value)))) {
				return 'This code is invalid';
			}
		},
		preConfirm: (data) => {
			Swal.getCancelButton().setAttribute('hidden', true);
			return getAccessToken(true)
				.then(accessToken => {
					return ky.post('./api/found-cache', {
						json: {
							cache: id,
							cacheCode: Number(data)
						},
						headers: {
							Authorization: `Bearer ${accessToken}`
						}
					})
						.json();
				})
				.then(handleErrors);
		}
	})
		.then(result => {
			if (result.isConfirmed) {
				Swal.fire({
					title: 'You did it!',
					text: result.value.success,
					icon: 'success',
					buttonsStyling: false,
					returnFocus: false,
					showConfirmButton: true,
					customClass: {
						confirmButton: 'btn btn-primary m-1 shadow'
					},
					didOpen: () => {
						Swal.hideLoading();
					},
					didClose: () => {
						router.navigate(`viewCache-${id}`);
					}
				});
			} else {
				router.navigate(`viewCache-${id}`);
			}
		})
		.catch(error => {
			Swal.fire({
				title: error,
				icon: 'error',
				buttonsStyling: false,
				customClass: {
					confirmButton: 'btn btn-primary m-1 shadow'
				},
				didOpen: () => {
					Swal.hideLoading();
				},
				didClose: () => {
					router.navigate(`viewCache-${id}`);
				}
			});
		});
}

function loadFoundCachesPage() {
	const noneFound = `<div class="p-3 text-center">
		<i class="bi bi-emoji-frown home-icon d-block mx-auto mb-4" aria-hidden="true"
			role="img"></i>
		<h1 class="display-6 fw-bold">You haven't found any geocaches (yet)</h1>
		<div class="col-lg-6 mx-auto">
			<p class="lead mb-4">Get outside and go find some!</p>
			<div class="d-grid gap-2 d-sm-flex justify-content-sm-center">
				<a href="viewCaches" class="btn btn-primary btn-lg px-4 gap-3 shadow" data-navigo="true">Find caches</a>
			</div>
		</div>
	</div>`;
	const foundContainer = document.getElementById('foundContainer');
	foundContainer.innerHTML = loadingGif;
	getAccessToken()
		.then(accessToken => {
			return ky.get('./api/found-caches', {
				...(accessToken && {
					headers: {
						Authorization: `Bearer ${accessToken}`
					}
				})
			})
				.json();
		})
		.then(handleErrors)
		.then(data => {
			if (data.found.length > 0) {
				foundContainer.innerHTML = `<div class="row">
					<div class="col-md-12 col-xl-4">
						<div class="card stat-card mb-2 shadow">
							<div class="card-body">
								<div class="row">
									<div class="col">
										<p class="card-title text-muted mb-0">User ID</p>
										<p class="font-weight-bold mb-0"><strong id="foundCachesUserId"></strong></p>
									</div>
									<div class="col-auto">
										<div class="icon rounded-circle">
											<img id="foundCachesProfilePic" src="./img/loading.gif" height="150" width="150" alt="Loading placeholder...">
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-md-6 col-xl-4">
						<div class="card stat-card mb-2 shadow">
							<div class="card-body">
								<div class="row">
									<div class="col">
										<p class="card-title text-muted mb-0">Caches found</p>
										<p class="font-weight-bold mb-0"><strong id="foundCachesTotal"></strong></p>
									</div>
									<div class="col-auto">
										<div class="icon icon-shape bg-primary text-white rounded-circle">
											<i class="bi bi-geo" aria-hidden="true"></i>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-md-6 col-xl-4">
						<div class="card stat-card mb-2 shadow">
							<div class="card-body">
								<div class="row">
									<div class="col">
										<p class="card-title text-muted mb-0">Ranking</p>
										<p class="font-weight-bold mb-0"><strong id="foundCacheRanking"></strong></p>
									</div>
									<div class="col-auto">
										<div class="icon icon-shape bg-primary text-white rounded-circle">
											<i class="bi bi-trophy" aria-hidden="true"></i>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div id="foundWrapper"></div>`;
				new Grid({
					columns: [{
						id: 'id',
						name: 'Cache number',
						sort: {
							enabled: true
						},
						formatter: (cell) => html(`<a href="viewCache-${DOMPurify.sanitize(cell)}" data-navigo="true">${DOMPurify.sanitize(cell)}</a>`)
					}, {
						id: 'date',
						name: 'Found',
						sort: {
							enabled: true
						},
						formatter: (date) => {
							return html(`<time datetime="${DOMPurify.sanitize(date)}">${getTimeAgo(date)}</time>`);
						}
					}],
					sort: true,
					style: {
						table: {
							'white-space': 'nowrap'
						}
					},
					pagination: {
						enabled: true,
						limit: 15,
						summary: true
					},
					data: data.found
				})
					.render(document.getElementById('foundWrapper'));
				const userId = DOMPurify.sanitize(data.userId);
				document.getElementById('foundCachesUserId').innerText = userId;
				document.getElementById('foundCachesProfilePic').setAttribute('src', `./profilePic/${userId}/96`);
				document.getElementById('foundCachesProfilePic').setAttribute('height', '48');
				document.getElementById('foundCachesProfilePic').setAttribute('width', '48');
				document.getElementById('foundCachesProfilePic').setAttribute('alt', `Profile picture for ${userId} (your User ID)`);
				document.getElementById('foundCachesTotal').innerText = Number(data.found.length);
				const positionString = appendSuffix(Number(data.position));
				document.getElementById('foundCacheRanking').innerHTML = `${positionString}${positionString === '1st' ? '&nbsp;🥇' : positionString === '2nd' ? '&nbsp;🥈' : positionString === '3rd' ? '&nbsp;🥉' : ''}`;
			} else {
				foundContainer.innerHTML = noneFound;
			}
		})
		.finally(() => {
			router.updatePageLinks();
		})
		.catch(error => {
			showError(error, true, 'home');
		});
	changePage('foundCaches', 'Found caches', false);
}

function loadLeaderboardPage() {
	const emptyLeaderboard = `<div class="p-3 text-center">
		<i class="bi bi-emoji-frown home-icon d-block mx-auto mb-4" aria-hidden="true"
			role="img"></i>
		<h1 class="display-6 fw-bold">No one has found any geocaches (yet)</h1>
		<div class="col-lg-6 mx-auto">
			<p class="lead mb-4">Get outside and go find some!</p>
			<div class="d-grid gap-2 d-sm-flex justify-content-sm-center">
				<a class="btn btn-primary btn-lg px-4 gap-3 shadow" href="viewCaches" data-navigo="true">Find caches</a>
			</div>
		</div>
	</div>`;
	const leaderboardContainer = document.getElementById('leaderboardContainer');
	leaderboardContainer.innerHTML = loadingGif;
	getAccessToken()
		.then(accessToken => {
			return ky.get('./api/get-leaderboard', {
				...(accessToken && {
					headers: {
						Authorization: `Bearer ${accessToken}`
					}
				})
			})
				.json();
		})
		.then(handleErrors)
		.then(data => {
			if (data.leaderboard.length > 0) {
				leaderboardContainer.innerHTML = '<div id="leaderboardWrapper"></div>';
				new Grid({
					columns: [{
						id: 'position',
						name: 'Position',
						sort: {
							enabled: true
						},
						formatter: (position) => {
							const positionString = appendSuffix(Number(position));
							return html(`${positionString}${positionString === '1st' ? '&nbsp;🥇' : positionString === '2nd' ? '&nbsp;🥈' : positionString === '3rd' ? '&nbsp;🥉' : ''}`);
						},
						attributes: (cell, row) => {
							if (cell) {
								return {
									'data-ranking': cell,
									'data-match': String(Boolean(row.cells[1].data === data.userId))
								};
							}
						}
					},
					{
						id: 'userId',
						name: 'User ID',
						sort: {
							enabled: true
						},
						formatter: (userId) => {
							const name = DOMPurify.sanitize(userId);
							return html(`${name}${(name === data.userId) ? '&nbsp;<strong>(You)</strong>' : ''}`);
						}
					},
					{
						id: 'found',
						name: 'Number of caches found',
						sort: {
							enabled: true
						}
					}
					],
					sort: true,
					style: {
						table: {
							'white-space': 'nowrap'
						}
					},
					data: data.leaderboard
				})
					.render(document.getElementById('leaderboardWrapper'));
			} else {
				leaderboardContainer.innerHTML = emptyLeaderboard;
			}
		})
		.finally(() => {
			setTimeout(function () {
				try {
					document.querySelectorAll('td[data-ranking="1"]').forEach(element => [...element.parentElement.children].forEach(child => {
						child.classList.add('gs-gold');
					}));
					document.querySelectorAll('td[data-ranking="2"]').forEach(element => [...element.parentElement.children].forEach(child => {
						child.classList.add('gs-silver');
					}));
					document.querySelectorAll('td[data-ranking="3"]').forEach(element => [...element.parentElement.children].forEach(child => {
						child.classList.add('gs-bronze');
					}));
					[...document.querySelector('td[data-match="true"]').parentElement.children].forEach(child => {
						child.classList.add('gs-your-device');
					});
				} catch { }
				router.updatePageLinks();
			}, 1000);
		})
		.catch(error => {
			showError(error, true, 'home');
		});
	changePage('leaderboard', 'Leaderboard', false);
}

function loadRestoreFile() {
	Swal.fire({
		title: 'Restore account using a backup file',
		text: 'Restore your GeoScout account using a backup file created by yourself earlier or provided by GeoScout Support.',
		showCancelButton: () => !Swal.isLoading(),
		confirmButtonText: 'Restore account',
		showLoaderOnConfirm: true,
		buttonsStyling: false,
		customClass: {
			loader: 'custom-loader',
			confirmButton: 'btn btn-primary mx-1 shadow',
			cancelButton: 'btn btn-link mx-1',
			input: 'form-control swal2-file'
		},
		loaderHtml: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
		allowOutsideClick: () => !Swal.isLoading(),
		backdrop: true,
		input: 'file',
		inputAttributes: {
			accept: '.geoscout',
			'aria-label': 'Upload the GeoScout backup'
		},
		inputAutoFocus: false,
		inputValidator: file => {
			return (file ? false : 'You need to select a backup file to restore');
		},
		preConfirm: file => {
			Swal.getCancelButton().setAttribute('hidden', true);
			return file
				.text()
				.then(backupToken => {
					return ky.post('./api/exchange-backup-token', {
						headers: {
							Authorization: `Bearer ${backupToken}`
						}
					})
						.json();
				})
				.then(handleErrors)
				.then(data => {
					localforage.setItem('accessToken', data.accessToken);
					return true;
				});
		},
		didClose: () => {
			router.navigate('manageAccount', { updateBrowserURL: false, historyAPIMethod: 'replaceState' });
		}
	})
		.then(result => {
			if (result.value) {
				router.navigate('home');
				showToast.fire({
					title: 'Restore successful!',
					icon: 'success'
				});
			}
		})
		.catch(error => {
			router.navigate('manageAccount', { updateBrowserURL: false, historyAPIMethod: 'replaceState' });
			showError(error, true);
		});
}

function loadRestoreCode() {
	let qrCodeToken = '';
	let qrScanner = null;
	Swal.fire({
		title: 'Restore from QR code',
		html: 'Restore your GeoScout account using a QR code generated on another device.<br><br><video id="webcamFeed" class="w-100 rounded"></video>',
		showCancelButton: () => !Swal.isLoading(),
		showConfirmButton: false,
		showLoaderOnConfirm: false,
		buttonsStyling: false,
		customClass: {
			loader: 'custom-loader',
			cancelButton: 'btn btn-link mx-1',
		},
		loaderHtml: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
		allowOutsideClick: false,
		backdrop: true,
		preConfirm: () => {
			Swal.getCancelButton().setAttribute('hidden', true);
			try {
				qrScanner.stop();
				qrScanner.destroy();
				qrScanner = null;
				document.getElementById('webcamFeed').outerHTML = loadingGif;
			} catch { }
			return ky.post('./api/exchange-qr-token', {
				headers: {
					Authorization: `Bearer ${qrCodeToken}`
				}
			})
				.json()
				.then(handleErrors)
				.then(data => {
					localforage.setItem('accessToken', data.accessToken);
					return true;
				});
		},
		didClose: () => {
			if (QrScanner.hasCamera()) {
				try {
					qrScanner.stop();
					qrScanner.destroy();
					qrScanner = null;
				} catch { }
			}
			router.navigate('manageAccount', { updateBrowserURL: false, historyAPIMethod: 'replaceState' });
		},
		didOpen: () => {
			if (QrScanner.hasCamera()) {
				const videoElem = document.getElementById('webcamFeed');
				qrScanner = new QrScanner(videoElem, result => {
					qrCodeToken = result.data;
					Swal.clickConfirm();
				}, {
					returnDetailedScanResult: true,
					preferredCamera: 'environment',
					highlightScanRegion: true,
					highlightCodeOutline: true,

				});
				qrScanner.start();
			} else {
				throw "Your device doesn't have a camera (or you haven't allowed permissions for GeoScout to access it), which is required for this feature";
			}
		}
	})
		.then(result => {
			if (result.value) {
				router.navigate('home');
				showToast.fire({
					title: 'Restore successful!',
					icon: 'success'
				});
			}
		})
		.catch(error => {
			router.navigate('manageAccount', { updateBrowserURL: false, historyAPIMethod: 'replaceState' });
			showError(error, true);
		});
}

function createRestoreFile() {
	Swal.fire({
		title: 'Create a backup file for your account',
		html: "Generating this file allows you to restore your account (and all the progress you've made) on any device.<br><br><strong>Please keep this file safe - anyone that has it will be able to load your GeoScout account on their device!</strong>",
		showCancelButton: () => !Swal.isLoading(),
		confirmButtonText: 'Create backup',
		showLoaderOnConfirm: true,
		buttonsStyling: false,
		customClass: {
			loader: 'custom-loader',
			confirmButton: 'btn btn-primary mx-1 shadow',
			cancelButton: 'btn btn-link mx-1'
		},
		loaderHtml: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
		allowOutsideClick: () => !Swal.isLoading(),
		backdrop: true,
		preConfirm: () => {
			Swal.getCancelButton().setAttribute('hidden', true);
			return getAccessToken()
				.then(accessToken => {
					if (accessToken) {
						return ky.post('./api/get-backup-token', {
							headers: {
								Authorization: `Bearer ${accessToken}`
							},
							json: {
								uuid: crypto.randomUUID().toString()
							}
						})
							.json();
					} else {
						throw "You don't have an account!";
					}
				})
				.then(handleErrors)
				.then(backupToken => {
					const backupFile = new File([DOMPurify.sanitize(String(backupToken.token))], `${backupToken.name}.GeoScout`, { type: 'text/plain' });
					const url = URL.createObjectURL(backupFile);
					const link = document.createElement('a');
					link.href = DOMPurify.sanitize(url);
					link.download = DOMPurify.sanitize(backupFile.name);
					link.setAttribute('class', 'd-none');
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
					window.URL.revokeObjectURL(url);
					return true;
				});
		},
		didClose: () => {
			router.navigate('manageAccount', { updateBrowserURL: false, historyAPIMethod: 'replaceState' });
		}
	})
		.then(result => {
			if (result.value) {
				router.navigate('home');
				showToast.fire({
					title: 'Backup file downloaded!',
					icon: 'success'
				});
			}
		})
		.catch(error => {
			router.navigate('manageAccount', { updateBrowserURL: false, historyAPIMethod: 'replaceState' });
			showError(error, true);
		});
}

function createRestoreCode() {
	Swal.fire({
		title: 'Add an additional device',
		html: "This feature allows you add an additional device to your account.<br><br><strong>Please note that a new QR code needs to be generated for each device you wish to add.",
		showCancelButton: () => !Swal.isLoading(),
		confirmButtonText: 'Add additional device',
		showLoaderOnConfirm: true,
		buttonsStyling: false,
		customClass: {
			loader: 'custom-loader',
			confirmButton: 'btn btn-primary mx-1 shadow',
			cancelButton: 'btn btn-link mx-1'
		},
		loaderHtml: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
		allowOutsideClick: () => !Swal.isLoading(),
		backdrop: true,
		preConfirm: () => {
			Swal.getCancelButton().setAttribute('hidden', true);
			return getAccessToken()
				.then(accessToken => {
					if (accessToken) {
						return ky.post('./api/get-qr-token', {
							headers: {
								Authorization: `Bearer ${accessToken}`
							},
							json: {
								uuid: crypto.randomUUID().toString()
							}
						})
							.json();
					} else {
						throw "You don't have an account!";
					}
				})
				.then(handleErrors)
				.then(qrCode => {
					return qrCode;
				});
		},
		didClose: () => {
			router.navigate('manageAccount', { updateBrowserURL: false, historyAPIMethod: 'replaceState' });
		}
	})
		.then(result => {
			if (result.value) {
				Swal.fire({
					title: 'Add an additional device',
					html: `<strong>Scan the QR code below using the GeoScout web-app on another device</strong><br>${DOMPurify.sanitize(result.value.token)}`,
					showCancelButton: false,
					allowOutsideClick: false,
					confirmButtonText: 'Close',
					buttonsStyling: false,
					customClass: {
						confirmButton: 'btn btn-link mx-1'
					},
					didClose: () => {
						router.navigate('manageAccount', { updateBrowserURL: false, historyAPIMethod: 'replaceState' });
					}
				});
			}
		})
		.catch(error => {
			router.navigate('manageAccount', { updateBrowserURL: false, historyAPIMethod: 'replaceState' });
			showError(error, true);
		});
}

// Function to start on page load
window.addEventListener('load', function () {
	// Create router
	router = new Navigo('/');
	// Define hooks for all routes
	router.hooks({
		before: (done) => {
			if (locationWatch !== null) {
				navigator.geolocation.clearWatch(locationWatch);
			}
			done();
		}
	});
	// Specify routes and resolve
	router
		.on('/', function () {
			router.navigate('/home', { historyAPIMethod: 'replaceState' });
		})
		.on('/home', function () {
			if (holdingEnabled) {
				router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			} else {
				changePage('home', 'Home', false);
			}
		})
		.on('/viewCaches', function () {
			if (holdingEnabled) {
				router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			} else {
				loadCachesMapPage();
			}
		})
		.on('/viewCachesTable', function () {
			if (holdingEnabled) {
				router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			} else {
				loadCachesTablePage();
			}
		})
		.on('/viewCache-:id', function (value) {
			if (holdingEnabled) {
				router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			} else {
				loadCachePage(value.data.id);
			}
		})
		.on('/foundCaches', function () {
			if (holdingEnabled) {
				router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			} else {
				loadFoundCachesPage();
			}
		})
		.on('/foundCache-:id', function (value) {
			if (holdingEnabled) {
				router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			} else {
				loadFoundCachePage(value.data.id);
			}
		})
		.on('/leaderboard', function () {
			if (holdingEnabled) {
				router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			} else {
				loadLeaderboardPage();
			}
		})
		.on('/about', function () {
			changePage('about', 'About', false);
		})
		.on('/disclaimer', function () {
			changePage('disclaimer', 'Disclaimer', false);
		})
		.on('/terms', function () {
			changePage('terms', 'Terms and Conditions', false);
		})
		.on('/privacy', function () {
			changePage('privacy', 'Privacy Policy', false);
		})
		// Legacy redirect
		.on('/restoreAccount', function () {
			router.navigate('manageAccount');
		})
		.on('/manageAccount', function () {
			getAccessToken()
				.then(hasAccount => {
					document.getElementById(hasAccount ? 'updateAccount' : 'restoreAccount').classList.remove('d-none');
					document.getElementById(hasAccount ? 'restoreAccount' : 'updateAccount').classList.add('d-none');
				})
				.finally(() => {
					changePage('manageAccount', 'Manage your account', false);
				})
				.catch(error => {
					showError(error, true, 'home');
				});
		})
		.on('/createFile', function () {
			createRestoreFile();
		})
		.on('/createCode', function () {
			createRestoreCode();
		})
		.on('/restoreFile', function () {
			loadRestoreFile();
		})
		.on('/restoreCode', function () {
			loadRestoreCode();
		})
		.notFound(function () {
			changePage('404', 'Page not found', false);
		})
		.resolve();
	// Sort out page links
	router.updatePageLinks();
	// Add holding page if active
	if (holdingEnabled) {
		router.on('/holding', function () {
			changePage('holding', 'Home', false);
		});
		router.resolve();
	}
	// Load service worker if supported
	if ('serviceWorker' in navigator && window.origin === appUrl) {
		const updateBtn = document.getElementById('updateBtn');
		// Register service worker
		navigator
			.serviceWorker
			.register('service-worker.js')
			.then(function (registration) {
				// Trigger update
				registration.update();
				// Listen for updates
				registration.addEventListener('updatefound', () => {
					newWorker = registration.installing;
					if (newWorker === null) {
						newWorker = registration.waiting;
					}
					// Listen for when the new worker is ready
					newWorker.addEventListener('statechange', () => {
						if (newWorker.state === 'installed') {
							if (navigator.serviceWorker.controller) {
								updateBtn.classList.remove('d-none');
								updateBtn.removeAttribute('disabled');
							}
						}
					});
				});
			})
			.catch(error => {
				console.warn(error);
			});
		// Set event handler for refresh app button
		updateBtn.addEventListener('click', (event) => {
			// Prevent any default events
			event.preventDefault();
			// Tell the new service worker to skip waiting and replace the old service worker
			newWorker.postMessage({
				action: 'skipWaiting'
			});
			// Reload the page
			window.location.reload();
		});
	}
	getAccessToken()
		.then(hasAccount => {
			if (hasAccount) {
				const backupBanner = document.getElementById('backupBanner');
				// Check if already dismissed
				return localforage.getItem('backupBannerClosed')
					.then(item => {
						if (!item) {
							// Unhide banner
							backupBanner.classList.remove('d-none');
							// Set listener to store dismissal event in local storage
							backupBanner.addEventListener('closed.bs.alert', function () {
								// Set key in local storage (if able)
								localforage.setItem('backupBannerClosed', true);
							});
						}
						const greetings = document.querySelectorAll('.welcomeGreeting');
						greetings.forEach(greeting => {
							greeting.innerText = 'back';
							parseAccessToken(hasAccount)
								.then(accountDetails => {
									greeting.innerText = `back ${accountDetails.sub}`;
								});
						});
					})
			}
		})
		.catch(error => {
			console.warn(error);
		});
});