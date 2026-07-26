/// <reference types="google.maps" />
// Imports
import 'bootstrap';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import DOMPurify from 'dompurify';
import ky, { isHTTPError } from 'ky';
import localforage from 'localforage';
import Navigo from 'navigo';
import QrScanner from 'qr-scanner';
import Swal from 'sweetalert2';
import type {
	AccessTokenResponse,
	BackupToken,
	ErrorResponse,
	FoundCaches,
	GeoScoutCache,
	GeoScoutCaches,
	LeaderboardResponse,
} from './types';
import '@khmyznikov/pwa-install';
import {
	checkAccessTokenValid,
	getAccessToken,
	parseAccessToken,
	updateAccessTokenGreeting,
} from './accessTokens';
import { changePage } from './changePage';
import { loadFoundCachesDashboard } from './foundCachesDashboard';
import { loadLeaderboardTable } from './leaderboard';
import { loadMapDataTable } from './mapDataTable';
import { resetCachePage } from './resetCachePage';

// Constants from build process
export const appUrl = '/* @echo appUrl */';
export const appName = '/* @echo appName */';
const lng = Number('/* @echo lng */');
const lat = Number('/* @echo lat */');
const googleMapsApiKey = '/* @echo googleMapsApiKey */';
const what3wordsApiKey = '/* @echo what3wordsApiKey */';
const holdingEnabled = Boolean(
	'/* @echo appHolding */'.toLowerCase() !== 'false',
);
export const backendApi = ky.create({
	prefix: `/api/`,
	timeout: false,
	totalTimeout: false,
	hooks: {
		beforeError: [
			({ error }) => {
				if (isHTTPError(error)) {
					const test = error.data as ErrorResponse;
					error.message = test.errorDebug || test.error;
					return error;
				}
				return error;
			},
		],
	},
});
// Variables
let mainMap: google.maps.Map;
export let router: Navigo;
let newWorker: ServiceWorker | null;
let locationWatch: number | null = null;
// Loader animation
const loadingGif =
	'<div class="text-center"><img src="./img/loading.gif" height="150" width="150" class="img-fluid text-center" alt="Loading animation placeholder"></div>';

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
	},
});

function showError(
	error: string = 'An issue occurred',
	button: boolean = false,
	goBackToPage: false | string = false,
): void {
	Swal.fire({
		title: error,
		icon: 'error',
		buttonsStyling: false,
		customClass: {
			confirmButton: 'btn btn-primary m-1 shadow',
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
		},
	});
}

async function loadCachesMapPage(): Promise<void> {
	const mapContainer = document.getElementById('mapContainer') as HTMLElement;
	const mapToolbar = document.getElementById('mapToolbar') as HTMLElement;
	mapToolbar?.replaceChildren();
	mapContainer.innerHTML = loadingGif;
	changePage('viewCaches', 'View caches', false);
	setOptions({
		key: googleMapsApiKey,
		v: 'quarterly',
		libraries: ['drawing', 'marker'],
	});
	let caches: GeoScoutCache[];
	let cluster: MarkerClusterer;
	return getAccessToken()
		.then((accessToken) => {
			return backendApi
				.get<GeoScoutCaches>('get-caches', {
					...(accessToken && {
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					}),
				})
				.json();
		})
		.then((data) => {
			if (Object.hasOwn(data, 'caches')) {
				caches = data.caches;
			} else {
				throw 'No caches found';
			}
			return importLibrary('maps');
		})
		.then(() => {
			mapContainer.innerHTML =
				'<div id="mapFilter"></div><div id="mainMap" class="rounded shadow"></div><div class="my-3 text-center"><a href="viewCachesTable" class="text-decoration-none" data-navigo="true"><i class="bi bi-table" aria-hidden="true"></i>&nbsp;View map data as a table</a></div>';
			router.updatePageLinks();
			mainMap = new google.maps.Map(
				document.getElementById('mainMap') as HTMLElement,
				{
					center: {
						lat,
						lng,
					},
					zoom: 13,
					minZoom: 12,
					mapId: '6b8e857a992e95a7',
					streetViewControl: false,
					mapTypeControl: true,
					fullscreenControl: true,
					zoomControl: true,
					renderingType: google.maps.RenderingType.VECTOR,
				},
			);
			return importLibrary('marker');
		})
		.then(() => {
			try {
				const markers = caches.flatMap((cache) => {
					if (!cache.suspended) {
						const markerContent = document.createElement('div');
						markerContent.textContent = DOMPurify.sanitize(cache.id);
						markerContent.classList.add(
							cache.found ? 'marker-found' : 'marker-notfound',
						);
						const marker = new google.maps.marker.AdvancedMarkerElement({
							position: {
								lat: Number(
									DOMPurify.sanitize(cache.coordinates).split(',')[0],
								),
								lng: Number(
									DOMPurify.sanitize(cache.coordinates).split(',')[1],
								),
							},
							map: mainMap,
							title: `Cache ${DOMPurify.sanitize(cache.id)}`,
							gmpClickable: true,
							content: markerContent,
						});
						marker.addListener('gmp-click', () => {
							router.navigate(`/viewCache-${cache.id}`);
						});
						return [marker];
					} else {
						return [];
					}
				});
				cluster = new MarkerClusterer({
					map: mainMap,
					markers,
				});
				return true;
			} catch (error) {
				console.warn(error);
				throw 'Unable to load caches';
			}
		})
		.then(() => {
			let currentFilter = 'all';
			(document.getElementById('mapFilter') as HTMLElement).innerHTML =
				`<fieldset><div class="btn-group mb-3 shadow">
				<legend class="visually-hidden">Filter control for the map to toggle which caches are visible</legend>
				<input type="radio" class="btn-check" name="mapFilterBtn" id="mapFilterAll" autocomplete="off" value="all" checked>
				<label class="btn btn-outline-primary rounded-start" for="mapFilterAll">All caches</label>
				<input type="radio" class="btn-check" name="mapFilterBtn" id="mapFilterNotFound" autocomplete="off" value="notFound">
				<label class="btn btn-outline-primary" for="mapFilterNotFound">Caches you haven't found</label>
				<input type="radio" class="btn-check" name="mapFilterBtn" id="mapFilterFound" autocomplete="off" value="found">
				<label class="btn btn-outline-primary" for="mapFilterFound">Caches you've found</label>
			</div></fieldset>`;

			function changeFilter(filter: string) {
				if (currentFilter !== filter) {
					cluster.clearMarkers();
					currentFilter = filter;
					const filterMode =
						filter === 'all'
							? {
									found: true,
									notFound: true,
								}
							: {
									found: filter === 'found',
									notFound: filter === 'notFound',
								};
					const markers: google.maps.marker.AdvancedMarkerElement[] = [];
					caches.forEach((cache) => {
						if (
							((cache.found && filterMode.found) ||
								(!cache.found && filterMode.notFound)) &&
							!cache.suspended
						) {
							const markerContent = document.createElement('div');
							markerContent.textContent = DOMPurify.sanitize(cache.id);
							markerContent.classList.add(
								cache.found ? 'marker-found' : 'marker-notfound',
							);
							const marker = new google.maps.marker.AdvancedMarkerElement({
								position: {
									lat: Number(
										DOMPurify.sanitize(cache.coordinates).split(',')[0],
									),
									lng: Number(
										DOMPurify.sanitize(cache.coordinates).split(',')[1],
									),
								},
								map: mainMap,
								title: `Cache ${DOMPurify.sanitize(cache.id)}`,
								gmpClickable: true,
								content: markerContent,
							});
							marker.addListener('gmp-click', () => {
								router.navigate(`/viewCache-${cache.id}`);
							});
							markers.push(marker);
						}
					});
					cluster.addMarkers(markers);
				}
			}
			['mapFilterAll', 'mapFilterNotFound', 'mapFilterFound'].forEach(
				(element) => {
					document.getElementById(element)?.addEventListener('click', () => {
						changeFilter(
							(
								document.querySelector(
									'input[name="mapFilterBtn"]:checked',
								) as HTMLInputElement
							).value,
						);
					});
				},
			);
			return true;
		})
		.then(() => {
			// Create button and add to toolbar
			const defaultBtn =
				'<i class="bi bi-crosshair" aria-hidden="true"></i>&nbsp;Show your location';
			const activeBtn =
				'<i class="bi bi-crosshair" aria-hidden="true"></i>&nbsp;Move map to your location';
			const button = document.createElement('button');
			button.setAttribute('id', 'mapLocation');
			button.setAttribute('class', 'btn btn-primary shadow');
			button.innerHTML = defaultBtn;
			mapToolbar.appendChild(button);
			const locateBtn = document.getElementById('mapLocation') as HTMLElement;
			let locationActive = false;
			let currentUserLocation = {
				lat: 0,
				lng: 0,
			};
			let marker: google.maps.marker.AdvancedMarkerElement | null = null;
			let accuracy: google.maps.Circle | null = null;
			locateBtn.addEventListener('click', () => {
				if (locationActive) {
					mainMap.setCenter(currentUserLocation);
					mainMap.setZoom(19);
				} else {
					locateBtn.setAttribute('disabled', 'true');
					locateBtn.innerHTML =
						'<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>&nbsp;Locating...';
					locationWatch = navigator.geolocation.watchPosition(
						({ coords }) => {
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
								const pinSvgString =
									'<svg height="22" width="22" xmlns="http://www.w3.org/2000/svg"><circle r="10" cx="11" cy="11" stroke="rgb(255,255,255)" stroke-width="2" fill="#4285F4" /></svg>';
								const pinSvg = parser.parseFromString(
									pinSvgString,
									'image/svg+xml',
								).documentElement;
								marker = new google.maps.marker.AdvancedMarkerElement({
									map: mainMap,
									position: currentUserLocation,
									content: pinSvg,
									title: 'Your location',
								});
							} else {
								marker.position = currentUserLocation;
							}
							if (accuracy === null) {
								accuracy = new google.maps.Circle({
									center: currentUserLocation,
									radius: coords.accuracy,
									clickable: false,
									fillColor: '#61a0bf',
									fillOpacity: 0.4,
									strokeColor: '#1bb6ff',
									strokeOpacity: 0.4,
									strokeWeight: 1,
									zIndex: 1,
									map: mainMap,
								});
							} else {
								accuracy.setCenter(currentUserLocation);
								accuracy.setRadius(coords.accuracy);
							}
						},
						(error) => {
							if (error.message !== '') {
								locateBtn.removeAttribute('disabled');
								locateBtn.innerHTML = defaultBtn;
								showToast.fire({
									title: error.message,
									icon: 'error',
								});
							}
						},
						{
							enableHighAccuracy: true,
							maximumAge: 0,
							timeout: 15000,
						},
					);
				}
			});
			return mainMap;
		})
		.then((map) => {
			// Cache for grid data
			let gridData: google.maps.Data.Feature[] | null = null;
			map.addListener('bounds_changed', () => {
				// Get current zoom level
				const zoom = map.getZoom();
				// Only show grid if zoom is at least 17
				const loadFeatures = zoom ? Boolean(zoom > 17) : false;
				if (loadFeatures) {
					// Get bounds of map
					const ne = map.getBounds()?.getNorthEast();
					const sw = map.getBounds()?.getSouthWest();
					// Call the what3words Grid API to obtain the grid squares within the current visble bounding box
					ky.get<object>(
						`https://api.what3words.com/v3/grid-section?key=${what3wordsApiKey}&bounding-box=${sw?.lat()},${sw?.lng()},${ne?.lat()},${ne?.lng()}&format=geojson`,
						{
							timeout: false,
							totalTimeout: false,
						},
					)
						.json()
						.then((data) => {
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
					strokeColor: '#777',
					strokeWeight: 0.5,
				});
			});
		})
		.catch((error) => {
			showError(error, true, 'home');
		});
}

async function loadCachesTablePage(): Promise<void> {
	const tableContainer = document.getElementById(
		'tableContainer',
	) as HTMLElement;
	tableContainer.innerHTML = loadingGif;
	changePage('viewCachesTable', 'View caches', false);
	let caches: GeoScoutCache[];
	return getAccessToken()
		.then((accessToken) => {
			return backendApi
				.get<GeoScoutCaches>('get-caches', {
					...(accessToken && {
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					}),
				})
				.json();
		})
		.then((data) => {
			if (Object.hasOwn(data, 'caches')) {
				caches = data.caches;
				return caches;
			} else {
				throw 'No caches found';
			}
		})
		.then((data) => {
			return loadMapDataTable(data, tableContainer);
		})
		.catch((error) => {
			showError(error, true, 'home');
		});
}

async function loadCachePage(id: string): Promise<void> {
	resetCachePage();
	changePage('viewCache', `Cache ${id}`, id);
	return getAccessToken()
		.then((accessToken) => {
			return backendApi
				.post<GeoScoutCache>('get-cache', {
					json: {
						cache: id,
					},
					...(accessToken && {
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					}),
				})
				.json();
		})
		.then((data) => {
			if (!data.suspended) {
				document.getElementById('cacheCard')?.removeAttribute('aria-hidden');
				const img = document.getElementById('cacheMapImg') as HTMLElement;
				img.setAttribute('src', `${DOMPurify.sanitize(data.image)}`);
				img.setAttribute('alt', `Map for cache ${id}`);
				img.removeAttribute('height');
				img.removeAttribute('width');
				const header = document.getElementById('cacheHeader') as HTMLElement;
				header.setAttribute('class', 'card-title');
				header.replaceChildren();
				header.innerText = `Cache ${id}`;
				const w3wLink = document.getElementById('cacheW3WLink') as HTMLElement;
				w3wLink.setAttribute('class', 'card-text');
				const w3wAddress = String(DOMPurify.sanitize(data.location)).split(
					'///',
				)[1];
				const coordinates = String(DOMPurify.sanitize(data.coordinates));
				const style =
					data.difficulty === 'Easy'
						? 'success'
						: data.difficulty === 'Medium'
							? 'warning'
							: 'danger';
				w3wLink.innerHTML = `<p><strong>what3words address:</strong>&nbsp;<a href="https://what3words.com/${w3wAddress}?maptype=satellite" target="_blank" translate="no" rel="noopener noreferrer">///${w3wAddress}<span class="text-decoration-none ms-1"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span></a></p>
				<p><strong>Grid reference:</strong>&nbsp;<a href="https://explore.osmaps.com/pin?lat=${coordinates.split(',')[0]}&lon=${coordinates.split(',')[1]}&zoom=18.0000&overlays=&style=Aerial&type=2d&placesCategory=" target="_blank" rel="noopener noreferrer">${DOMPurify.sanitize(data.gridRef)}<span class="text-decoration-none ms-1"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span></a><br><a class="text-decoration-none" href="https://getoutside.ordnancesurvey.co.uk/guides/beginners-guide-to-grid-references/" target="_blank" rel="noopener noreferrer">Learn more about grid references&nbsp;<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a></p>
				<p><strong>Cache difficulty:</strong>&nbsp;<span class="badge text-bg-${style}">${DOMPurify.sanitize(data.difficulty)}</span></p>
				<p><br><strong id="cacheStats"></strong></p>`;
				const w3wBtn = document.getElementById('cacheW3WBtn') as HTMLElement;
				w3wBtn.removeAttribute('tabindex');
				w3wBtn.setAttribute('class', 'btn btn-primary m-1 shadow');
				w3wBtn.setAttribute(
					'href',
					`https://what3words.com/${w3wAddress}?maptype=satellite`,
				);
				w3wBtn.setAttribute('target', '_blank');
				w3wBtn.setAttribute('rel', 'noopener noreferrer');
				w3wBtn.innerHTML =
					'<i class="bi bi-geo-alt" aria-hidden="true"></i>&nbsp;Open in what3words';
				const mapBtn = document.getElementById('cacheMapsLink') as HTMLElement;
				mapBtn.removeAttribute('tabindex');
				mapBtn.setAttribute('class', 'btn btn-primary m-1 shadow');
				mapBtn.setAttribute(
					'href',
					`https://www.google.com/maps/search/?api=1&query=${coordinates}`,
				);
				mapBtn.setAttribute('target', '_blank');
				mapBtn.setAttribute('rel', 'noopener noreferrer');
				mapBtn.innerHTML =
					'<i class="bi bi-geo-alt" aria-hidden="true"></i>&nbsp;Open in Google Maps';
				const foundBtn = document.getElementById(
					'cacheFoundLink',
				) as HTMLElement;
				const cacheStats = document.getElementById('cacheStats') as HTMLElement;
				if (data.found) {
					foundBtn.setAttribute(
						'class',
						'btn btn-outline-primary m-1 disabled',
					);
					foundBtn.removeAttribute('tabindex');
					foundBtn.innerHTML = `<i class="bi bi-patch-check" aria-hidden="true"></i>&nbsp;You've already found this cache`;
					cacheStats.innerText = `You ${Number(data.stats) === 1 ? 'are the only person that has found this cache! 😮' : `and ${Number(data.stats) - 1} other ${Number(data.stats) - 1 === 1 ? 'person has' : 'people have'} found this cache 😊`}`;
				} else {
					foundBtn.setAttribute('class', 'btn btn-outline-primary m-1 shadow');
					foundBtn.setAttribute('href', `foundCache-${id}`);
					foundBtn.setAttribute('data-navigo', 'true');
					foundBtn.removeAttribute('tabindex');
					foundBtn.innerHTML =
						'<i class="bi bi-123" aria-hidden="true"></i>&nbsp;Found this cache?';
					cacheStats.innerText = `${Number(data.stats) === 0 ? 'No one has found this cache yet 😢 can you find it?' : `${Number(data.stats)} ${Number(data.stats) === 1 ? 'person has' : 'people have'} found this cache - can you find it?`}`;
					router.updatePageLinks();
				}
			} else {
				throw 'This cache is temporarily unavailable';
			}
		})
		.catch((error) => {
			showError(error, true, 'viewCaches');
		});
}

async function loadFoundCachePage(id: string): Promise<void> {
	changePage('viewCache', `Cache ${id}`, id);
	return Swal.fire({
		titleText: `Found cache ${id}?`,
		text: "If you've found this cache, please enter the 5-digit code below to mark it as found:",
		input: 'text',
		inputAttributes: {
			// Set virtual keyboard to numbers only mode
			inputmode: 'numeric',
			// Regex for numbers only and length of 5 characters
			pattern: '[0-9]*',
			maxlength: '5',
			// Ignore autofill via browser/password manager(s)
			autocomplete: 'off',
			'data-lpignore': 'true',
			'data-1p-ignore': 'true',
			'data-form-type': 'other',
			// Change hint for virtual keyboard enter key
			enterkeyhint: 'go',
		},
		showCancelButton: true,
		buttonsStyling: false,
		customClass: {
			cancelButton: 'btn btn-link m-1',
			confirmButton: 'btn btn-primary m-1 shadow',
			input: 'form-control swal2-file',
			loader: 'custom-loader',
		},
		loaderHtml:
			'<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Verifying code...</span></div>',
		returnFocus: false,
		confirmButtonText: 'Verify cache code',
		backdrop: true,
		showLoaderOnConfirm: true,
		allowOutsideClick: (): boolean => !Swal.isLoading(),
		inputValidator: (
			value,
		):
			| 'You must enter the 5-digit code from the cache to confirm you have found it'
			| 'This code is invalid'
			| undefined => {
			if (!value) {
				return 'You must enter the 5-digit code from the cache to confirm you have found it';
			} else if (value.length !== 5 || Number.isNaN(Number(value))) {
				return 'This code is invalid';
			}
		},
		preConfirm: async (data): Promise<{ success: string }> => {
			Swal.getCancelButton()?.setAttribute('hidden', 'true');
			return getAccessToken(true).then((accessToken) => {
				return backendApi
					.post('found-cache', {
						json: {
							cache: id,
							cacheCode: Number(data),
						},
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					})
					.json();
			});
		},
	})
		.then((result): void => {
			if (result.isConfirmed) {
				Swal.fire({
					title: 'You did it!',
					text: result.value.success,
					icon: 'success',
					buttonsStyling: false,
					returnFocus: false,
					showConfirmButton: true,
					customClass: {
						confirmButton: 'btn btn-primary m-1 shadow',
					},
					didOpen: (): void => {
						Swal.hideLoading();
					},
					didClose: (): void => {
						router.navigate(`viewCache-${id}`);
					},
				});
			} else {
				router.navigate(`viewCache-${id}`);
			}
		})
		.catch((error): void => {
			Swal.fire({
				title: error,
				icon: 'error',
				buttonsStyling: false,
				customClass: {
					confirmButton: 'btn btn-primary m-1 shadow',
				},
				didOpen: (): void => {
					Swal.hideLoading();
				},
				didClose: (): void => {
					router.navigate(`viewCache-${id}`);
				},
			});
		});
}

async function loadFoundCachesPage(): Promise<void> {
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
	const foundContainer = document.getElementById(
		'foundContainer',
	) as HTMLElement;
	foundContainer.innerHTML = loadingGif;
	changePage('foundCaches', 'Found caches', false);
	return getAccessToken()
		.then((accessToken) => {
			return backendApi
				.get<FoundCaches>('found-caches', {
					...(accessToken && {
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					}),
				})
				.json();
		})
		.then((data) => {
			if (data.found.length > 0) {
				return loadFoundCachesDashboard(data, foundContainer);
			} else {
				foundContainer.innerHTML = noneFound;
			}
		})
		.catch((error) => {
			showError(error as string, true, 'home');
		});
}

async function loadLeaderboardPage(): Promise<void> {
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
	const leaderboardContainer = document.getElementById(
		'leaderboardContainer',
	) as HTMLElement;
	leaderboardContainer.innerHTML = loadingGif;
	changePage('leaderboard', 'Leaderboard', false);
	try {
		const accessToken = await getAccessToken();
		const data = await backendApi
			.get<LeaderboardResponse>('get-leaderboard', {
				...(accessToken && {
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				}),
			})
			.json();
		if (data.leaderboard.length > 0) {
			return loadLeaderboardTable(data, leaderboardContainer);
		} else {
			leaderboardContainer.innerHTML = emptyLeaderboard;
		}
	} catch (error) {
		showError(error as string, true, 'home');
	}
}

async function loadRestoreFile(): Promise<void> {
	return Swal.fire({
		title: 'Restore account using a backup file',
		text: 'Restore your GeoScout account using a backup file created by yourself earlier or provided by GeoScout Support.',
		showCancelButton: true,
		confirmButtonText: 'Restore account',
		showLoaderOnConfirm: true,
		buttonsStyling: false,
		customClass: {
			loader: 'custom-loader',
			confirmButton: 'btn btn-primary mx-1 shadow',
			cancelButton: 'btn btn-link mx-1',
			input: 'form-control swal2-file',
		},
		loaderHtml:
			'<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
		allowOutsideClick: (): boolean => !Swal.isLoading(),
		backdrop: true,
		input: 'file',
		inputAttributes: {
			accept: '.geoscout',
			'aria-label': 'Upload the GeoScout backup',
		},
		inputAutoFocus: false,
		inputValidator: (
			file,
		): false | 'You need to select a backup file to restore' => {
			return file ? false : 'You need to select a backup file to restore';
		},
		preConfirm: async (file: File): Promise<boolean> => {
			Swal.getCancelButton()?.setAttribute('hidden', 'true');
			const backupToken = await file.text();
			const data = await backendApi
				.post<AccessTokenResponse>('exchange-backup-token', {
					headers: {
						Authorization: `Bearer ${backupToken}`,
					},
				})
				.json();
			localforage.setItem('accessToken', data.accessToken);
			return true;
		},
		didClose: (): void => {
			router.navigate('manageAccount', {
				updateBrowserURL: false,
				historyAPIMethod: 'replaceState',
			});
		},
	})
		.then((result): void => {
			if (result.value) {
				updateAccessTokenGreeting();
				router.navigate('home');
				showToast.fire({
					title: 'Restore successful!',
					icon: 'success',
				});
			}
		})
		.catch((error): void => {
			router.navigate('manageAccount', {
				updateBrowserURL: false,
				historyAPIMethod: 'replaceState',
			});
			showError(error, true);
		});
}

async function loadRestoreCode(): Promise<void> {
	let qrCodeToken = '';
	let qrScanner: QrScanner;
	return Swal.fire({
		title: 'Restore from QR code',
		html: 'Restore your GeoScout account using a QR code generated on another device.<br><br><video id="webcamFeed" class="w-100 rounded"></video>',
		showCancelButton: true,
		showConfirmButton: false,
		showLoaderOnConfirm: false,
		buttonsStyling: false,
		customClass: {
			loader: 'custom-loader',
			cancelButton: 'btn btn-link mx-1',
		},
		loaderHtml:
			'<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
		allowOutsideClick: false,
		backdrop: true,
		preConfirm: async (): Promise<boolean> => {
			Swal.getCancelButton()?.setAttribute('hidden', 'true');
			try {
				qrScanner.stop();
				qrScanner.destroy();
				(document.getElementById('webcamFeed') as HTMLElement).outerHTML =
					loadingGif;
			} catch {}
			const data = await backendApi
				.post<AccessTokenResponse>('exchange-qr-token', {
					headers: {
						Authorization: `Bearer ${qrCodeToken}`,
					},
				})
				.json();
			localforage.setItem('accessToken', data.accessToken);
			return true;
		},
		didClose: (): void => {
			QrScanner.hasCamera().then((hasCamera): void => {
				if (hasCamera) {
					try {
						qrScanner.stop();
						qrScanner.destroy();
					} catch {}
				}
				router.navigate('manageAccount', {
					updateBrowserURL: false,
					historyAPIMethod: 'replaceState',
				});
			});
		},
		didOpen: (): void => {
			QrScanner.hasCamera().then((hasCamera): void => {
				if (hasCamera) {
					const videoElem = document.getElementById(
						'webcamFeed',
					) as HTMLVideoElement;
					qrScanner = new QrScanner(
						videoElem,
						(result) => {
							qrCodeToken = result.data;
							Swal.clickConfirm();
						},
						{
							returnDetailedScanResult: true,
							preferredCamera: 'environment',
							highlightScanRegion: true,
							highlightCodeOutline: true,
						},
					);
					qrScanner.start();
				} else {
					throw "Your device doesn't have a camera (or you haven't allowed permissions for GeoScout to access it), which is required for this feature";
				}
			});
		},
	})
		.then((result): void => {
			if (result.value) {
				updateAccessTokenGreeting();
				router.navigate('home');
				showToast.fire({
					title: 'Restore successful!',
					icon: 'success',
				});
			}
		})
		.catch((error): void => {
			router.navigate('manageAccount', {
				updateBrowserURL: false,
				historyAPIMethod: 'replaceState',
			});
			showError(error, true);
		});
}

async function createRestoreFile(): Promise<void> {
	return Swal.fire({
		title: 'Create a backup file for your account',
		html: "Generating this file allows you to restore your account (and all the progress you've made) on any device.<br><br><strong>Please keep this file safe - anyone that has it will be able to load your GeoScout account on their device!</strong>",
		showCancelButton: true,
		confirmButtonText: 'Create backup',
		showLoaderOnConfirm: true,
		buttonsStyling: false,
		customClass: {
			loader: 'custom-loader',
			confirmButton: 'btn btn-primary mx-1 shadow',
			cancelButton: 'btn btn-link mx-1',
		},
		loaderHtml:
			'<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
		allowOutsideClick: (): boolean => !Swal.isLoading(),
		backdrop: true,
		preConfirm: async (): Promise<boolean> => {
			Swal.getCancelButton()?.setAttribute('hidden', 'true');
			return getAccessToken()
				.then((accessToken): Promise<BackupToken> => {
					if (accessToken) {
						return backendApi
							.post<BackupToken>('get-backup-token', {
								headers: {
									Authorization: `Bearer ${accessToken}`,
								},
								json: {
									uuid: crypto.randomUUID().toString(),
								},
							})
							.json();
					} else {
						throw "You don't have an account!";
					}
				})
				.then((backupToken): boolean => {
					const backupFile = new File(
						[DOMPurify.sanitize(String(backupToken.token))],
						`${backupToken.name}.GeoScout`,
						{ type: 'text/plain' },
					);
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
		didClose: (): void => {
			router.navigate('manageAccount', {
				updateBrowserURL: false,
				historyAPIMethod: 'replaceState',
			});
		},
	})
		.then((result): void => {
			if (result.value) {
				router.navigate('home');
				showToast.fire({
					title: 'Backup file downloaded!',
					icon: 'success',
				});
			}
		})
		.catch((error): void => {
			router.navigate('manageAccount', {
				updateBrowserURL: false,
				historyAPIMethod: 'replaceState',
			});
			showError(error, true);
		});
}

async function createRestoreCode(): Promise<void> {
	return Swal.fire({
		title: 'Add an additional device',
		html: 'This feature allows you add an additional device to your account.<br><br><strong>Please note that a new QR code needs to be generated for each device you wish to add.',
		showCancelButton: true,
		confirmButtonText: 'Add additional device',
		showLoaderOnConfirm: true,
		buttonsStyling: false,
		customClass: {
			loader: 'custom-loader',
			confirmButton: 'btn btn-primary mx-1 shadow',
			cancelButton: 'btn btn-link mx-1',
		},
		loaderHtml:
			'<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
		allowOutsideClick: (): boolean => !Swal.isLoading(),
		backdrop: true,
		preConfirm: async (): Promise<{ token: string }> => {
			Swal.getCancelButton()?.setAttribute('hidden', 'true');
			return getAccessToken()
				.then((accessToken): Promise<{ token: string }> => {
					if (accessToken) {
						return backendApi
							.post<{ token: string }>('get-qr-token', {
								headers: {
									Authorization: `Bearer ${accessToken}`,
								},
								json: {
									uuid: crypto.randomUUID().toString(),
								},
							})
							.json();
					} else {
						throw "You don't have an account!";
					}
				})
				.then((qrCode): { token: string } => {
					return qrCode;
				});
		},
		didClose: (): void => {
			router.navigate('manageAccount', {
				updateBrowserURL: false,
				historyAPIMethod: 'replaceState',
			});
		},
	})
		.then((result): void => {
			if (result.value) {
				Swal.fire({
					title: 'Add an additional device',
					html: `<strong>Scan the QR code below using the GeoScout web-app on another device</strong><br>${DOMPurify.sanitize(result.value.token)}`,
					showCancelButton: false,
					allowOutsideClick: false,
					confirmButtonText: 'Close',
					buttonsStyling: false,
					customClass: {
						confirmButton: 'btn btn-link mx-1',
					},
					didClose: (): void => {
						router.navigate('manageAccount', {
							updateBrowserURL: false,
							historyAPIMethod: 'replaceState',
						});
					},
				});
			}
		})
		.catch((error): void => {
			router.navigate('manageAccount', {
				updateBrowserURL: false,
				historyAPIMethod: 'replaceState',
			});
			showError(error, true);
		});
}

// Function to start on page load
window.addEventListener('load', async (): Promise<void> => {
	// Create router
	router = new Navigo('/');
	// Define hooks for all routes
	router.hooks({
		before: (done): void => {
			if (locationWatch !== null) {
				navigator.geolocation.clearWatch(locationWatch);
			}
			done();
		},
	});
	// Specify routes and resolve
	router
		.on('/', (): void => {
			router.navigate('/home', { historyAPIMethod: 'replaceState' });
		})
		.on('/home', (): void => {
			if (holdingEnabled) {
				router.navigate('/holding', {
					historyAPIMethod: 'replaceState',
				});
			} else {
				changePage('home', 'Home', false);
			}
		})
		.on('/viewCaches', (): void => {
			if (holdingEnabled) {
				router.navigate('/holding', {
					historyAPIMethod: 'replaceState',
				});
			} else {
				loadCachesMapPage();
			}
		})
		.on('/viewCachesTable', (): void => {
			if (holdingEnabled) {
				router.navigate('/holding', {
					historyAPIMethod: 'replaceState',
				});
			} else {
				loadCachesTablePage();
			}
		})
		.on('/viewCache-:id', (value): void => {
			if (holdingEnabled) {
				router.navigate('/holding', {
					historyAPIMethod: 'replaceState',
				});
			} else {
				const id = value?.data?.id;
				if (id) {
					loadCachePage(id);
				} else {
					showError('Invalid cache ID');
				}
			}
		})
		.on('/foundCaches', (): void => {
			if (holdingEnabled) {
				router.navigate('/holding', {
					historyAPIMethod: 'replaceState',
				});
			} else {
				loadFoundCachesPage();
			}
		})
		.on('/foundCache-:id', (value): void => {
			if (holdingEnabled) {
				router.navigate('/holding', {
					historyAPIMethod: 'replaceState',
				});
			} else {
				const id = value?.data?.id;
				if (id) {
					loadFoundCachePage(id);
				} else {
					showError('Invalid cache ID');
				}
			}
		})
		.on('/leaderboard', (): void => {
			if (holdingEnabled) {
				router.navigate('/holding', {
					historyAPIMethod: 'replaceState',
				});
			} else {
				loadLeaderboardPage();
			}
		})
		.on('/about', (): void => {
			changePage('about', 'About', false);
		})
		.on('/disclaimer', (): void => {
			changePage('disclaimer', 'Disclaimer', false);
		})
		.on('/terms', (): void => {
			changePage('terms', 'Terms and Conditions', false);
		})
		.on('/privacy', (): void => {
			changePage('privacy', 'Privacy Policy', false);
		})
		// Legacy redirect
		.on('/restoreAccount', (): void => {
			router.navigate('manageAccount');
		})
		.on('/manageAccount', (): void => {
			getAccessToken()
				.then((hasAccount): void => {
					(
						document.getElementById(
							hasAccount ? 'updateAccount' : 'restoreAccount',
						) as HTMLElement
					).classList.remove('d-none');
					(
						document.getElementById(
							hasAccount ? 'restoreAccount' : 'updateAccount',
						) as HTMLElement
					).classList.add('d-none');
				})
				.finally((): void => {
					changePage('manageAccount', 'Manage your account', false);
				})
				.catch((error): void => {
					showError(error, true, 'home');
				});
		})
		.on('/createFile', (): void => {
			createRestoreFile();
		})
		.on('/createCode', (): void => {
			createRestoreCode();
		})
		.on('/restoreFile', (): void => {
			loadRestoreFile();
		})
		.on('/restoreCode', (): void => {
			loadRestoreCode();
		})
		.notFound((): void => {
			changePage('404', 'Page not found', false);
		})
		.resolve();
	// Sort out page links
	router.updatePageLinks();
	// Add holding page if active
	if (holdingEnabled) {
		router.on('/holding', (): void => {
			changePage('holding', 'Home', false);
		});
		router.resolve();
	}
	// Load service worker if supported
	if ('serviceWorker' in navigator && window.origin === appUrl) {
		const updateBtn = document.getElementById('updateBtn') as HTMLElement;
		// Register service worker
		navigator.serviceWorker
			.register('service-worker.js')
			.then((registration): void => {
				// Trigger update
				registration.update();
				// Listen for updates
				registration.addEventListener('updatefound', (): void => {
					newWorker = registration.installing;
					if (newWorker === null) {
						newWorker = registration.waiting;
					}
					// Listen for when the new worker is ready
					newWorker?.addEventListener('statechange', (): void => {
						if (newWorker?.state === 'installed') {
							if (navigator.serviceWorker.controller) {
								updateBtn.classList.remove('d-none');
								updateBtn.removeAttribute('disabled');
							}
						}
					});
				});
			})
			.catch((error): void => {
				console.warn(error);
			});
		// Set event handler for refresh app button
		updateBtn.addEventListener('click', (event) => {
			// Prevent any default events
			event.preventDefault();
			// Tell the new service worker to skip waiting and replace the old service worker
			newWorker?.postMessage({
				action: 'skipWaiting',
			});
			// Reload the page
			window.location.reload();
		});
	}
	return getAccessToken()
		.then((hasAccount): Promise<void> | undefined => {
			if (hasAccount) {
				const backupBanner = document.getElementById('backupBanner');
				// Check if already dismissed
				return localforage
					.getItem('backupBannerClosed')
					.then((item) => {
						if (!item) {
							// Unhide banner
							backupBanner?.classList.remove('d-none');
							// Set listener to store dismissal event in local storage
							backupBanner?.addEventListener('closed.bs.alert', (): void => {
								// Set key in local storage (if able)
								localforage.setItem('backupBannerClosed', true);
							});
						}
						const greetings =
							document.querySelectorAll<HTMLElement>('.welcomeGreeting');
						greetings.forEach((greeting) => {
							greeting.innerText = 'back';
							parseAccessToken(hasAccount).then((accountDetails) => {
								greeting.innerText = `back ${accountDetails.sub}`;
							});
						});
						return parseAccessToken(hasAccount);
					})
					.then((token) => {
						return checkAccessTokenValid(token);
					});
			}
		})
		.catch((error): void => {
			console.warn(error);
		});
});
