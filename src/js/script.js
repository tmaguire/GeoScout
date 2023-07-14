/* jshint esversion:10 */
let mainMap = null;
let router = null;
let newWorker = false;
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

function getAccessToken() {
	return new Promise((resolve, reject) => {
		if (localStorage.getItem('accessToken') === null || localStorage.getItem('accessToken') === '') {
			const uuid = crypto.randomUUID().toString();
			fetch('./api/get-token', {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					uuid
				})
			})
				.then(response => response.json())
				.then(handleErrors)
				.then(data => {
					return fetch('./api/get-token', {
						method: 'POST',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							uuid,
							token: data.tempToken
						})
					});
				})
				.then(response => response.json())
				.then(handleErrors)
				.then(data => {
					localStorage.setItem('accessToken', data.accessToken);
					resolve(data.accessToken);
				})
				.catch(error => {
					console.warn(error);
					reject(error);
				});
		} else {
			resolve(localStorage.getItem('accessToken'));
		}
	});
}

// Error Message Function
function showError(error, button) {
	console.log(`Showing error message: ${error}`);
	if (button) {
		Swal.fire({
			title: error,
			icon: 'error',
			buttonsStyling: false,
			customClass: {
				confirmButton: 'btn btn-link'
			},
			didOpen: () => {
				Swal.hideLoading();
			}
		});
	} else {
		Swal.fire({
			title: error,
			icon: 'error',
			showConfirmButton: false,
			allowOutsideClick: false,
			allowEscapeKey: false,
			allowEnterKey: false,
			didOpen: () => {
				Swal.hideLoading();
			}
		});
	}
}

// Loading Indicator Function
function setLoadingIndicator(show, message) {
	if (show) {
		console.log('Show full screen loading indicator');
		Swal.fire({
			title: `${message}...`,
			showConfirmButton: false,
			allowOutsideClick: false,
			allowEscapeKey: false,
			allowEnterKey: false,
			customClass: {
				loader: 'custom-loader'
			},
			loaderHtml: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
			didOpen: () => {
				Swal.showLoading();
			}
		});
	} else {
		console.log('Remove full screen loading indicator');
		Swal.close();
	}
}

function prettyDate(inputDate) {
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
	const inputDateObj = new Date(inputDate);
	const month = months[inputDateObj.getMonth()];
	const day = days[inputDateObj.getDay()];
	const date = String(inputDateObj.getDate());
	const prettyDate = `${date}${(date === '1') || (date === '21') || (date === '31') ? 'st' : (date === '2') || (date === '22') ? 'nd' : (date === '3') || (date === '23') ? 'rd' : 'th'}`;
	return `${day} ${prettyDate} of ${month} ${inputDateObj.getFullYear()}`;
}

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
	if (response.hasOwnProperty('error')) {
		// Throw error message
		throw Error(response.error);
	}
	// If the response has a lambda error
	if (response.hasOwnProperty('errorMessage')) {
		// Throw error message
		throw Error(`${response.errorType}: ${response.errorMessage}`);
	}
	// Return the data response object
	return response;
}


function changePage(page, title, id) {
	// Update Canonical tag
	document.querySelector("link[rel='canonical']").setAttribute('href', page === '404' ? 'https://www.geoscout.uk' : (id ? `https://www.geoscout.uk/${page}-${id}` : `https://www.geoscout.uk/${page}`));
	// Update menu
	document.querySelectorAll('a.nav-link').forEach(menuItem => {
		if (menuItem.getAttribute('href') === page) {
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
	document.title = `${title} | GeoScout`;
	// Scroll to top
	window.scrollTo({
		top: 0,
		left: 0,
		behavior: 'smooth'
	});
	// Close the navbar menu (if it is open)
	const menuToggle = document.getElementById('navbarToggler');
	const bsCollapse = new bootstrap.Collapse(menuToggle, {
		toggle: false
	});
	bsCollapse.hide();
}

function loadCachesPage() {
	const mapContainer = document.getElementById('mapContainer');
	mapContainer.innerHTML = loadingGif;
	const loader = new google.maps.plugins.loader.Loader({
		apiKey: 'AIzaSyDoWhwCiUGlBzrTOFxS17QUjBT9-eh46C4',
		version: 'quarterly',
		libraries: ['drawing'],
		language: 'en',
		region: 'GB',
		id: 'googleMapsScript'
	});
	let caches;
	getAccessToken()
		.then(accessToken => {
			return fetch('./api/get-caches', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${accessToken}`
				}
			});
		})
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			if (data.hasOwnProperty('caches')) {
				caches = data.caches;
			} else {
				throw 'No caches found';
			}
			return loader.load();
		})
		.then((google) => {
			mapContainer.innerHTML = '<div id="mapFilter"></div><div id="mainMap"></div><div class="my-3 text-center"><a href="viewCachesTable" class="text-decoration-none" data-navigo="true"><i class="bi bi-table" aria-hidden="true"></i>&nbsp;View map data as a table</a></div>';
			router.updatePageLinks();
			mainMap = null;
			mainMap = new google.maps.Map(document.getElementById('mainMap'), {
				center: {
					lat: 51.80007,
					lng: 0.64038
				},
				zoom: 13,
				minZoom: 13,
				maxZoom: 20,
				restriction: {
					latLngBounds: {
						north: 51.826601357825716,
						east: 0.7474966992187326,
						south: 51.773523020732,
						west: 0.5332633007812326
					},
					strictBounds: true
				},
				mapId: '6b8e857a992e95a7',
				streetViewControl: false,
				mapTypeControl: false,
				fullscreenControl: true
			});
			return loader.load();
		})
		.then((google) => {
			try {
				const markers = caches.flatMap(cache => {
					if (!cache.suspended) {
						const marker = new google.maps.Marker({
							position: {
								lat: Number(DOMPurify.sanitize(cache.coordinates).split(',')[0]),
								lng: Number(DOMPurify.sanitize(cache.coordinates).split(',')[1])
							},
							map: mainMap,
							title: `Cache ${DOMPurify.sanitize(cache.id)}`,
							label: {
								text: DOMPurify.sanitize(cache.id),
								color: '#ffffff',
								fontSize: '16px'
							},
							animation: google.maps.Animation.DROP,
							icon: {
								url: Boolean(cache.found) ? './img/found.png' : './img/notFound.png',
								labelOrigin: new google.maps.Point(22, 20)
							},
							optimized: true
						});
						marker.addListener('click', () => {
							router.navigate(`/viewCache-${cache.id}`);
						});
						return [marker];
					} else {
						return [];
					}
				});
				const cluster = new markerClusterer.MarkerClusterer({
					map: mainMap,
					markers
				});
				return cluster;
			} catch (error) {
				console.warn(error);
				throw 'Unable to load caches';
			}
		})
		.then(cluster => {
			let currentFilter = 'all';
			document.getElementById('mapFilter').innerHTML = `<fieldset><div class="btn-group mb-3">
				<legend class="visually-hidden">Filter control for the map to toggle which caches are visible</legend>
				<input type="radio" class="btn-check" name="mapFilterBtn" id="mapFilterAll" autocomplete="off" value="all" checked>
				<label class="btn btn-outline-primary" for="mapFilterAll">All caches</label>
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
							const marker = new google.maps.Marker({
								position: {
									lat: Number(DOMPurify.sanitize(cache.coordinates).split(',')[0]),
									lng: Number(DOMPurify.sanitize(cache.coordinates).split(',')[1])
								},
								map: mainMap,
								title: `Cache ${DOMPurify.sanitize(cache.id)}`,
								label: {
									text: DOMPurify.sanitize(cache.id),
									color: '#ffffff',
									fontSize: '16px'
								},
								animation: google.maps.Animation.DROP,
								icon: {
									url: Boolean(cache.found) ? './img/found.png' : './img/notFound.png',
									labelOrigin: new google.maps.Point(22, 20)
								},
								optimized: true
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
				document.getElementById(element).addEventListener('click', function () {
					changeFilter(document.querySelector('input[name="mapFilterBtn"]:checked').value);
				});
			});

		})
		.catch(error => {
			showError(error, true);
		});
	changePage('viewCaches', 'View caches', false);
}

function loadCachesTablePage() {
	const tableContainer = document.getElementById('tableContainer');
	tableContainer.innerHTML = loadingGif;
	let caches;
	getAccessToken()
		.then(accessToken => {
			return fetch('./api/get-caches', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${accessToken}`
				}
			});
		})
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			if (data.hasOwnProperty('caches')) {
				caches = data.caches;
				return caches;
			} else {
				throw 'No caches found';
			}
		})
		.then(data => {
			tableContainer.innerHTML = '<div id="tableFilter"></div><div id="table"></div><div class="my-3 text-center"><a href="viewCaches" class="text-decoration-none" data-navigo="true"><i class="bi bi-map" aria-hidden="true"></i>&nbsp;View table data in a map</a></div>';
			const table = new gridjs.Grid({
				columns: [{
					id: 'id',
					name: 'Cache ID',
					sort: {
						enabled: true
					},
					formatter: (cell) => gridjs.html(`<a href="viewCache-${DOMPurify.sanitize(cell)}" data-navigo="true">${DOMPurify.sanitize(cell)}</a>`)
				},
				{
					id: 'location',
					name: 'what3words location',
					sort: {
						enabled: true
					},
					formatter: (location) => {
						const locationString = String(DOMPurify.sanitize(location)).split('///')[1];
						return gridjs.html(`<a href="https://what3words.com/${locationString}" target="_blank" translate="no">///${locationString}<span class="text-decoration-none ms-1"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span></a>`);
					}
				},
				{
					id: 'found',
					name: gridjs.html('Found<span class="visually-hidden"> this cache</span>?'),
					sort: {
						enabled: true
					},
					formatter: (cell) => {
						return (cell ? 'Yes 😊' : 'No ☹️');
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
					selector: (cell, rowIndex, cellIndex) => cellIndex === 0 ? cell : null
				},
				language: {
					search: {
						placeholder: 'Search by Cache ID'
					}
				},
			}).render(document.getElementById('table'));
			return table;
		})
		.then(table => {
			let currentFilter = 'all';
			document.getElementById('tableFilter').innerHTML = `<fieldset><div class="btn-group mb-3">
				<legend class="visually-hidden">Filter control for the map to toggle which caches are visible</legend>
				<input type="radio" class="btn-check" name="tableFilterBtn" id="tableFilterAll" autocomplete="off" value="all" checked>
				<label class="btn btn-outline-primary" for="tableFilterAll">All caches</label>
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
				document.getElementById(element).addEventListener('click', function () {
					changeFilter(document.querySelector('input[name="tableFilterBtn"]:checked').value);
				});
			});
		})
		.finally(() => {
			router.updatePageLinks();
		})
		.catch(error => {
			showError(error, false);
		});
	changePage('viewCachesTable', 'View caches', false);
}

function loadCachePage(id) {
	resetCachePage();
	getAccessToken()
		.then(accessToken => {
			return fetch('./api/get-cache', {
				method: 'POST',
				body: JSON.stringify({
					cache: id
				}),
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`
				}
			});
		})
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			if (!data.suspended) {
				document.getElementById('cacheCard').removeAttribute('aria-hidden');
				const img = document.getElementById('cacheMapImg');
				img.setAttribute('src', `${DOMPurify.sanitize(data.image)}`);
				img.setAttribute('alt', `Map for Cache ${id}`);
				img.removeAttribute('height');
				img.removeAttribute('width');
				const header = document.getElementById('cacheHeader');
				header.setAttribute('class', 'card-title');
				header.innerHTML = '';
				header.innerText = `Cache ${id}`;
				const w3wLink = document.getElementById('cacheW3WLink');
				w3wLink.setAttribute('class', 'card-text');
				const w3wAddress = String(DOMPurify.sanitize(data.location)).split('///')[1];
				const coordinates = String(DOMPurify.sanitize(data.coordinates));
				w3wLink.innerHTML = `<p><strong>what3words address:</strong>&nbsp;<a href="https://what3words.com/${w3wAddress}" target="_blank" translate="no">///${w3wAddress}<span class="text-decoration-none ms-1"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span></a></p>
				<p><strong>Grid reference:</strong>&nbsp;<a href="https://explore.osmaps.com/pin?lat=${coordinates.split(',')[0]}&lon=${coordinates.split(',')[1]}&zoom=18.0000&overlays=&style=Standard&type=2d&placesCategory=" target="_blank">${DOMPurify.sanitize(data.gridRef)}<span class="text-decoration-none ms-1"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span></a><br><a class="text-decoration-none" href="https://getoutside.ordnancesurvey.co.uk/guides/beginners-guide-to-grid-references/" target="_blank">Learn more about grid references&nbsp;<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a></p>
				<p><br><strong id="cacheStats"></strong></p>`;
				const w3wBtn = document.getElementById('cacheW3WBtn');
				w3wBtn.removeAttribute('tabindex');
				w3wBtn.setAttribute('class', 'btn btn-primary m-1');
				w3wBtn.setAttribute('href', `https://what3words.com/${w3wAddress}`);
				w3wBtn.setAttribute('target', '_blank');
				w3wBtn.innerHTML = '<i class="bi bi-geo-alt" aria-hidden="true"></i>&nbsp;Open in what3words';
				const mapBtn = document.getElementById('cacheMapsLink');
				mapBtn.removeAttribute('tabindex');
				mapBtn.setAttribute('class', 'btn btn-primary m-1');
				mapBtn.setAttribute('href', `https://www.google.com/maps/search/?api=1&query=${coordinates}`);
				mapBtn.setAttribute('target', '_blank');
				mapBtn.innerHTML = '<i class="bi bi-geo-alt" aria-hidden="true"></i>&nbsp;Open in Google Maps';
				const foundBtn = document.getElementById('cacheFoundLink');
				const cacheStats = document.getElementById('cacheStats');
				if (data.found) {
					foundBtn.setAttribute('class', 'btn btn-outline-primary m-1 disabled');
					foundBtn.removeAttribute('tabindex');
					foundBtn.innerHTML = `<i class="bi bi-patch-check" aria-hidden="true"></i>&nbsp;You've already found this cache`;
					cacheStats.innerText = `You ${Number(data.stats) === 1 ? 'are the only person that has found this cache! 😮' : `and ${Number(data.stats) - 1} other ${(Number(data.stats) - 1) === 1 ? 'person has' : 'people have'} found this cache 😊`}`;
				} else {
					foundBtn.setAttribute('class', 'btn btn-outline-primary m-1');
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
			showError(error, false);
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
	w3wBtn.innerHTML = '';
	const mapBtn = document.getElementById('cacheMapsLink');
	mapBtn.removeAttribute('target');
	mapBtn.removeAttribute('href');
	mapBtn.setAttribute('tabindex', '-1');
	mapBtn.setAttribute('class', 'btn btn-primary m-1 disabled placeholder col-5');
	mapBtn.innerHTML = '';
	const foundBtn = document.getElementById('cacheFoundLink');
	foundBtn.removeAttribute('target');
	foundBtn.removeAttribute('href');
	foundBtn.setAttribute('tabindex', '-1');
	foundBtn.setAttribute('class', 'btn btn-outline-primary m-1 disabled placeholder col-4');
	foundBtn.innerHTML = '';
}

function loadFoundCachePage(id) {
	changePage('viewCache', `Cache ${id}`, id);
	Swal.fire({
		title: `Found Cache ${id}?`,
		text: "If you've found this cache, please enter the 5-digit code below to mark it as found:",
		input: 'text',
		inputAttributes: {
			autocomplete: 'off',
			inputmode: 'numeric',
			pattern: '[0-9]*',
			'data-lpignore': true,
			'data-form-type': 'other',
			maxlength: 5
		},
		showCancelButton: true,
		buttonsStyling: false,
		customClass: {
			cancelButton: 'btn btn-link m-1',
			confirmButton: 'btn btn-primary m-1',
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
			return getAccessToken()
				.then(accessToken => {
					return fetch('./api/found-cache', {
						method: 'POST',
						body: JSON.stringify({
							cache: id,
							cacheCode: Number(data)
						}),
						headers: {
							'Content-Type': 'application/json',
							Authorization: accessToken
						}
					});
				})
				.then(response => response.json())
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
						confirmButton: 'btn btn-primary m-1'
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
					confirmButton: 'btn btn-primary m-1'
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
				<a href="viewCaches" class="btn btn-primary btn-lg px-4 gap-3" data-navigo="true">Find caches</a>
			</div>
		</div>
	</div>`;
	const placeholder = loadingGif;
	const foundContainer = document.getElementById('foundContainer');
	foundContainer.innerHTML = placeholder;
	getAccessToken()
		.then(accessToken => {
			return fetch('./api/found-caches', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${accessToken}`
				}
			});
		})
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			if (data.found.length > 0) {
				foundContainer.innerHTML = `<div class="row">
					<div class="col-md-12 col-xl-4">
						<div class="card stat-card mb-2">
							<div class="card-body">
								<div class="row">
									<div class="col">
										<p class="card-title text-muted mb-0">Device ID</p>
										<p class="font-weight-bold mb-0"><strong id="foundCachesDeviceId"></strong></p>
									</div>
									<div class="col-auto">
										<div class="icon rounded-circle my-3 my-sm-auto">
											<img id="foundCachesProfilePic" src="./img/loading.gif" height="150" width="150" alt="Loading placeholder...">
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-md-6 col-xl-4">
						<div class="card stat-card mb-2">
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
						<div class="card stat-card mb-2">
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
				new gridjs.Grid({
					columns: [{
						id: 'id',
						name: 'Cache number',
						sort: {
							enabled: true
						},
						formatter: (cell) => gridjs.html(`<a href="viewCache-${DOMPurify.sanitize(cell)}" data-navigo="true">${DOMPurify.sanitize(cell)}</a>`)
					}, {
						id: 'date',
						name: 'Found',
						sort: {
							enabled: true
						},
						formatter: (date) => {
							const time = new Date(date);
							return gridjs.html(`<time datetime="${DOMPurify.sanitize(date)}">${time.toLocaleTimeString('en-GB', {
								hour: 'numeric',
								minute: 'numeric',
								hour12: true
							})} on ${prettyDate(date)}</time>`);
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
				const deviceId = DOMPurify.sanitize(data.deviceid);
				document.getElementById('foundCachesDeviceId').innerText = deviceId;
				document.getElementById('foundCachesProfilePic').setAttribute('src', `./profilePic/${deviceId}/96`);
				document.getElementById('foundCachesProfilePic').setAttribute('height', '48');
				document.getElementById('foundCachesProfilePic').setAttribute('width', '48');
				document.getElementById('foundCachesProfilePic').setAttribute('alt', `Profile picture for ${deviceId} (your device ID)`);
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
			showError(error, true);
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
				<a class="btn btn-primary btn-lg px-4 gap-3" href="viewCaches" data-navigo="true">Find caches</a>
			</div>
		</div>
	</div>`;
	const placeholder = loadingGif;
	const leaderboardContainer = document.getElementById('leaderboardContainer');
	leaderboardContainer.innerHTML = placeholder;
	getAccessToken()
		.then(accessToken => {
			return fetch('./api/get-leaderboard', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${accessToken}`
				}
			});
		})
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			if (data.leaderboard.length > 0) {
				leaderboardContainer.innerHTML = '<div id="leaderboardWrapper"></div>';
				new gridjs.Grid({
					columns: [{
						id: 'position',
						name: 'Position',
						sort: {
							enabled: true
						},
						formatter: (position) => {
							const positionString = appendSuffix(Number(position));
							return gridjs.html(`${positionString}${positionString === '1st' ? '&nbsp;🥇' : positionString === '2nd' ? '&nbsp;🥈' : positionString === '3rd' ? '&nbsp;🥉' : ''}`);
						},
						attributes: (cell, row) => {
							if (cell) {
								return {
									'data-ranking': cell,
									'data-match': String(Boolean(row.cells[1].data === data.deviceId))
								};
							}
						}
					},
					{
						id: 'deviceId',
						name: 'Device ID',
						sort: {
							enabled: true
						},
						formatter: (deviceId) => {
							const name = DOMPurify.sanitize(deviceId);
							return gridjs.html(`${name}${name === data.deviceId ? '&nbsp;<strong>(You)</strong>' : ''}`);
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
			showError(error, true);
		});
	changePage('leaderboard', 'Leaderboard', false);
}

// Function to start on page load
window.onload = function () {
	// Create router
	router = new Navigo('/');
	// Specify routes and resolve
	router
		.on('/', function () {
			router.navigate('/home', { historyAPIMethod: 'replaceState' });
		})
		// .on('/holding', function () {
		// 	changePage('holding', 'Home', false);
		// })
		.on('/home', function () {
			// router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			changePage('home', 'Home', false);
		})
		.on('/viewCaches', function () {
			// router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			loadCachesPage();
		})
		.on('/viewCachesTable', function () {
			// router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			loadCachesTablePage();
		})
		.on('/viewCache-:id', function (value) {
			// router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			loadCachePage(value.data.id);
		})
		.on('/foundCaches', function () {
			// router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			loadFoundCachesPage();
		})
		.on('/foundCache-:id', function (value) {
			// router.navigate('/holding', { historyAPIMethod: 'replaceState' });
			loadFoundCachePage(value.data.id);
		})
		.on('/leaderboard', function () {
			loadLeaderboardPage();
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
		.notFound(function () {
			changePage('404', 'Page not found', false);
		})
		.resolve();
	// Sort out page links
	router.updatePageLinks();
	// Load service worker if supported
	if ('serviceWorker' in navigator && window.origin === 'https://www.geoscout.uk') {
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
				console.log(error);
			});
		// Set event handler for refresh app button
		updateBtn.addEventListener('click', (event) => {
			event.preventDefault();
			newWorker.postMessage({
				action: 'skipWaiting'
			});
			window.location.reload();
		});
	}
};