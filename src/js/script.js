/* jshint esversion:9 */
let mainMap;
let router;

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

function getDeviceId() {
	// Set up fingerprint agent
	const fpPromise = FingerprintJS.load({
		apiKey: 'a1ZJOENnGt4QCgAqBHHb',
		region: 'eu',
		endpoint: 'https://fp.withamscouts.org.uk'
	});
	// Get device ID and store in localStorage
	fpPromise
		.then(fp => fp.get())
		.then(result => {
			if (localStorage.getItem('deviceId') === null) {
				localStorage.setItem('deviceId', result.visitorId);
			}
		})
		.catch(error => {
			console.warn(error);
		});
}

// Error Message Function
function showError(error, button) {
	console.log(`Showing error message: ${error}`);
	if (button) {
		Swal.fire({
			title: 'Application error',
			text: error,
			icon: 'error',
			buttonsStyling: false,
			customClass: {
				confirmButton: 'btn btn-primary'
			},
			didOpen: () => {
				Swal.hideLoading();
			}
		});
	} else {
		Swal.fire({
			title: 'Application error',
			text: error,
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

function loadCachesPage() {
	mainMap = new google.maps.Map(document.getElementById('mapContainer'), {
		center: {
			lat: 51.80007,
			lng: 0.64038
		},
		zoom: 14.3,
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
		mapTypeControl: false
	});
	fetch('./api/get-caches', {
			method: 'GET',
			headers: {
				'Device-Id': localStorage.getItem('deviceId')
			}
		})
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			if (data.hasOwnProperty('caches')) {
				data.caches.forEach(cache => {
					const marker = new google.maps.Marker({
						position: {
							lat: Number(cache.coordinates.split(',')[0]),
							lng: Number(cache.coordinates.split(',')[1])
						},
						map: mainMap,
						title: `Cache ${cache.id}`,
						label: {
							text: cache.id,
							color: '#ffffff',
							fontSize: '16px'
						},
						animation: google.maps.Animation.DROP,
						icon: {
							url: cache.found ? './img/found.png' : './img/notFound.png',
							labelOrigin: new google.maps.Point(22, 20)
						},
						optimized: true
					});
					marker.addListener('click', () => {
						router.navigate(`/viewCache-${cache.id}`);
					});
				});
			} else {
				throw 'Invalid response received';
			}
		})
		.catch(error => {
			showToast.fire({
				title: error,
				icon: 'error'
			});
		});
	changePage('map', 'View caches');
}

function loadCachePage(id) {
	resetCachePage();
	fetch('./api/get-cache', {
			method: 'POST',
			body: JSON.stringify({
				cache: id,
			}),
			headers: {
				'Content-Type': 'application/json',
				'Device-Id': localStorage.getItem('deviceId')
			}
		})
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			document.getElementById('cacheCard').removeAttribute('aria-hidden');
			const img = document.getElementById('cacheMapImg');
			img.setAttribute('src', `${DOMPurify.sanitize(data.image)}`);
			img.setAttribute('alt', `Map for Cache ${id}`);
			const header = document.getElementById('cacheHeader');
			header.setAttribute('class', 'card-title');
			header.innerHTML = '';
			header.innerText = `Cache ${id}`;
			const w3wLink = document.getElementById('cacheW3WLink');
			w3wLink.setAttribute('class', 'card-text');
			const w3wAddress = String(DOMPurify.sanitize(data.location)).split('///')[1];
			w3wLink.innerHTML = `what3words address: <a href="https://what3words.com/${w3wAddress}" target="_blank" translate="no">///${w3wAddress}</a><br><br><strong id="cacheStats"></strong>`;
			const w3wBtn = document.getElementById('cacheW3WBtn');
			w3wBtn.removeAttribute('tabindex');
			w3wBtn.setAttribute('class', 'btn btn-primary m-1');
			w3wBtn.setAttribute('href', `https://what3words.com/${w3wAddress}`);
			w3wBtn.setAttribute('target', '_blank');
			w3wBtn.innerHTML = '<i class="bi bi-geo-alt" aria-hidden="true"></i>&nbsp;Open in What3Words';
			const mapBtn = document.getElementById('cacheMapsLink');
			mapBtn.removeAttribute('tabindex');
			mapBtn.setAttribute('class', 'btn btn-primary m-1');
			mapBtn.setAttribute('href', `https://www.google.com/maps/dir/?api=1&destination=${DOMPurify.sanitize(data.coordinates)}&travelmode=walking`);
			mapBtn.setAttribute('target', '_blank');
			mapBtn.innerHTML = '<i class="bi bi-geo-alt" aria-hidden="true"></i>&nbsp;Open in Google Maps';
			const foundBtn = document.getElementById('cacheFoundLink');
			const cacheStats = document.getElementById('cacheStats');
			if (data.found) {
				foundBtn.setAttribute('class', 'btn btn-outline-primary m-1 disabled');
				foundBtn.innerHTML = `<i class="bi bi-patch-check" aria-hidden="true"></i>&nbsp;You've already found this cache`;
				cacheStats.innerText = `You ${Number(data.stats) === 1 ? 'are the only person that has found this cache!' : `and ${Number(data.stats) - 1} other ${(Number(data.stats) - 1) === 1 ? 'person has' : 'people have'} found this cache`}`;
			} else {
				foundBtn.setAttribute('class', 'btn btn-outline-primary m-1');
				foundBtn.setAttribute('href', `foundCache-${id}`);
				foundBtn.innerHTML = '<i class="bi bi-123" aria-hidden="true"></i>&nbsp;Found this cache?';
				cacheStats.innerText = `${Number(data.stats) === 0 ? 'No one has found this cache yet. Can you find it?' : `${Number(data.stats)} ${Number(data.stats) === 1 ? 'person has' : 'people have'} found this cache - can you find it?`}`;
				foundBtn.onclick = function () {
					router.navigate(`/foundCache-${id}`);
				};
			}
		})
		.catch(error => {
			showError(error, false);
		});
	changePage('cache', `Cache ${id}`);
}

function changePage(page, title) {
	// Update menu
	document.querySelectorAll('a.nav-link').forEach(menuItem => {
		if (menuItem.getAttribute('data-page') === page) {
			menuItem.setAttribute('class', 'nav-link active');
			menuItem.setAttribute('aria-current', 'page');
		} else {
			menuItem.setAttribute('class', 'nav-link');
			menuItem.removeAttribute('aria-current');
		}
	});
	// Hide all pages (except selected)
	document.querySelectorAll('section').forEach(section => {
		if (section.id !== page) {
			section.setAttribute('class', 'row mx-auto d-none');
			section.setAttribute('aria-hidden', 'true');
		}
	});
	// Set page as active
	document.getElementById(page).setAttribute('class', 'row mx-auto');
	document.getElementById(page).setAttribute('aria-hidden', 'false');
	// Change document title
	document.title = `${title} | Witham Scouts Geocaching`;
}

function resetCachePage() {
	document.getElementById('cacheCard').setAttribute('aria-hidden', 'true');
	const img = document.getElementById('cacheMapImg');
	img.setAttribute('src', './img/loading.gif');
	img.setAttribute('alt', 'Loading animation placeholder');
	const header = document.getElementById('cacheHeader');
	header.setAttribute('class', 'card-title placeholder-glow');
	header.innerHTML = '<span class="placeholder col-6"></span>';
	const w3wLink = document.getElementById('cacheW3WLink');
	w3wLink.setAttribute('class', 'card-text placeholder-glow');
	w3wLink.innerHTML = '<span class="placeholder col-7"></span><span class="placeholder col-4"></span><span class="placeholder col-4"></span><span class="placeholder col-6"></span><span class="placeholder col-8"></span>';
	const w3wBtn = document.getElementById('cacheW3WBtn');
	w3wBtn.removeAttribute('target');
	w3wBtn.setAttribute('href', '#');
	w3wBtn.setAttribute('tabindex', '-1');
	w3wBtn.setAttribute('class', 'btn btn-primary m-1 disabled placeholder col-5');
	w3wBtn.innerHTML = '';
	const mapBtn = document.getElementById('cacheMapsLink');
	mapBtn.removeAttribute('target');
	mapBtn.setAttribute('href', '#');
	mapBtn.setAttribute('tabindex', '-1');
	mapBtn.setAttribute('class', 'btn btn-primary m-1 disabled placeholder col-5');
	mapBtn.innerHTML = '';
	const foundBtn = document.getElementById('cacheFoundLink');
	foundBtn.setAttribute('class', 'btn btn-outline-primary m-1 disabled placeholder col-4');
	foundBtn.innerHTML = '';
}

function foundCachePage(id) {
	changePage('cache', `Cache ${id}`);
	Swal.fire({
			title: `Found Cache ${id}?`,
			text: "If you've found this cache, please enter the 5-digit code below to mark it as found:",
			input: 'number',
			inputAttributes: {
				autocomplete: 'off'
			},
			showCancelButton: true,
			buttonsStyling: false,
			customClass: {
				cancelButton: 'btn btn-outline-primary m-1',
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
				return fetch('./api/found-cache', {
						method: 'POST',
						body: JSON.stringify({
							cache: id,
							cacheCode: Number(data)
						}),
						headers: {
							'Content-Type': 'application/json',
							'Device-Id': localStorage.getItem('deviceId')
						}
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

function foundCachesPage() {
	const noneFound = `<div class="p-3 text-center">
		<i class="bi bi-emoji-frown home-icon d-block mx-auto mb-4" aria-hidden="true"
			role="img"></i>
		<h1 class="display-6 fw-bold">You haven't found any geocaches (yet)</h1>
		<div class="col-lg-6 mx-auto">
			<p class="lead mb-4">Get outside and go find some!</p>
			<div class="d-grid gap-2 d-sm-flex justify-content-sm-center">
				<button id="findCachesBtn" class="btn btn-primary btn-lg px-4 gap-3">Find caches</button>
			</div>
		</div>
	</div>`;
	const placeholder = `<div class="text-center"><img src="./img/loading.gif" class="img-fluid text-center" alt="Loading animation placeholder"></div>`;
	const foundContainer = document.getElementById('foundContainer');
	foundContainer.innerHTML = placeholder;
	fetch('./api/found-caches', {
			method: 'GET',
			headers: {
				'Device-Id': localStorage.getItem('deviceId')
			}
		})
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			if (data.found.length > 0) {
				foundContainer.innerHTML = `<div class="row">
					<div class="col-md-6">
						<div class="card stat-card mb-2">
							<div class="card-body">
								<div class="row">
									<div class="col">
										<p class="card-title text-muted mb-0">Device ID</p>
										<p class="h5 font-weight-bold mb-0" id="foundCachesDeviceId"></p>
									</div>
									<div class="col-auto">
										<div class="icon icon-shape bg-primary text-white rounded-circle shadow">
											<img id="foundCachesProfilePic" src="./img/loading.gif" alt="Loading placeholder...">
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-md-6">
						<div class="card stat-card mb-2">
							<div class="card-body">
								<div class="row">
									<div class="col">
										<p class="card-title text-muted mb-0">Caches found</p>
										<p class="h5 font-weight-bold mb-0" id="foundCachesTotal"></p>
									</div>
									<div class="col-auto">
										<div class="icon icon-shape bg-primary text-white rounded-circle shadow">
											<i class="bi bi-geo" aria-hidden="true"></i>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div id="wrapper"></div>`;
				new gridjs.Grid({
					columns: [{
							id: 'id',
							name: 'Cache Number',
							sort: true
						},
						{
							id: 'date',
							name: 'Found',
							sort: true,
							formatter: (date) => {
								const time = new Date(date);
								return `${time.toLocaleTimeString('en-GB',{
									hour12: false
								})} on ${prettyDate(date)}`;
							}
						}
					],
					data: data.found
				}).render(document.getElementById('wrapper'));
				const deviceId = DOMPurify.sanitize(localStorage.getItem('deviceId'));
				document.getElementById('foundCachesDeviceId').innerText = deviceId;
				document.getElementById('foundCachesProfilePic').setAttribute('src', `./profilePic/${deviceId}/48`);
				document.getElementById('foundCachesProfilePic').setAttribute('alt', `Profile picture for ${deviceId} (your device ID)`);
				document.getElementById('foundCachesTotal').innerText = Number(data.found.length);
			} else {
				foundContainer.innerHTML = noneFound;
				document.getElementById('findCachesBtn').onclick = function () {
					router.navigate('/viewCaches');
				};
			}
		})
		.catch(error => {
			showError(error, true);
		});
	changePage('found', 'Found caches');
}

function addCache() {
	const fields = ['editorPin', 'editorCacheLocation', 'editorCacheCode'];
	const saveBtn = document.getElementById('saveBtn');
	saveBtn.setAttribute('disabled', true);
	saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>&nbsp;Adding cache...';
	const record = {};
	fields.forEach(field => {
		record[field] = document.getElementById(field).value;
		document.getElementById(field).setAttribute('disabled', true);
	});

	function unlockForm(clear) {
		fields.forEach(field => {
			document.getElementById(field).removeAttribute('disabled');
			if (clear) {
				document.getElementById(field).value = '';
			}
		});
		saveBtn.removeAttribute('disabled');
		saveBtn.innerText = 'Add cache';
	}
	fetch('./api/add-cache', {
			method: 'POST',
			body: JSON.stringify({
				location: record.editorCacheLocation,
				code: record.editorCacheCode,
				pin: record.editorPin
			}),
			headers: {
				'Content-Type': 'application/json',
				'Device-Id': localStorage.getItem('deviceId')
			}
		})
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			unlockForm(true);
			showToast.fire({
				title: data.success,
				icon: 'success'
			});
		})
		.catch(error => {
			unlockForm(false);
			showError(error, true);
		});
}

// Function to start on page load
window.onload = function () {
	// Create router
	router = new Navigo('/');
	// Specify routes and resolve
	router
		.on('/', function () {
			changePage('home', 'Home');
		})
		.on('/home', function () {
			changePage('home', 'Home');
		})
		.on('/viewCaches', function () {
			loadCachesPage();
		})
		.on('/viewCache-:id', function (value) {
			loadCachePage(value.data.id);
		})
		.on('/foundCaches', function () {
			foundCachesPage();
		})
		.on('/foundCache-:id', function (value) {
			foundCachePage(value.data.id);
		})
		.on('/about', function () {
			changePage('about', 'About');
		})
		.on('/disclaimer', function () {
			window.scrollTo({
				top: 0,
				left: 0,
				behavior: 'smooth'
			});
			changePage('disclaimer', 'Disclaimer');
		})
		.on('/terms', function () {
			window.scrollTo({
				top: 0,
				left: 0,
				behavior: 'smooth'
			});
			changePage('terms', 'Terms and Conditions');
		})
		.on('/privacy', function () {
			window.scrollTo({
				top: 0,
				left: 0,
				behavior: 'smooth'
			});
			changePage('privacy', 'Privacy Policy');
		})
		.on('/openSourceLicenses', function () {
			window.scrollTo({
				top: 0,
				left: 0,
				behavior: 'smooth'
			});
			changePage('osl', 'Open Source Licenses');
		})
		.on('/editor', function () {
			changePage('editor', 'Cache editor');
		})
		.notFound(function () {
			changePage('404', 'Page not found');
		})
		.resolve();
	if (localStorage.getItem('deviceId') === null) {
		getDeviceId();
	}
	const form = document.getElementById('editorForm');
	form.addEventListener('submit', function (event) {
		event.preventDefault();
		if (!form.checkValidity()) {
			event.stopPropagation();
		} else {
			addCache();
		}
		form.classList.add('was-validated');
	}, false);
};