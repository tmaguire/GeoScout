/* jshint esversion:9 */
// Configuration for Microsoft Authentication Library
const msalConfig = {
	auth: {
		clientId: 'c8267731-79a3-4f25-9631-86492b136a27',
		authority: 'https://login.microsoftonline.com/withamscouts.onmicrosoft.com',
		redirectUri: '/'
	},
	cache: {
		cacheLocation: 'localStorage',
		storeAuthStateInCookie: false
	}
};

// Scope for MSAL login request
const requestObj = {
	scopes: ['User.Read']
};

const tokenRequest = {
	scopes: ['https://withamscouts.onmicrosoft.com/c8267731-79a3-4f25-9631-86492b136a27/App.Access']
};

const msalInstance = new msal.PublicClientApplication(msalConfig);

let mainMap;
let router;

// Redirect: once login is successful and redirects with tokens, call Graph API
msalInstance.handleRedirectPromise().then(handleResponse).catch(err => {
	console.error(err);
});

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

function handleResponse(resp) {
	if (resp !== null) {
		username = resp.account.username;
		loadApp();
	} else {
		const currentAccounts = msalInstance.getAllAccounts();
		if (currentAccounts === null) {
			return;
		} else if (currentAccounts.length > 1) {
			// Add choose account code here
			console.warn('Multiple accounts detected.');
		} else if (currentAccounts.length === 1) {
			username = currentAccounts[0].username;
			loadApp();
		}
	}
}

function signIn() {
	msalInstance.loginRedirect(requestObj);
}

function signOut() {
	const logoutRequest = {
		account: msalInstance.getAccountByUsername(username)
	};
	msalInstance.logout(logoutRequest);
}

function getTokenRedirect(request) {
	request.account = msalInstance.getAccountByUsername(username);
	return msalInstance.acquireTokenSilent(request).catch(error => {
		console.warn('silent token acquisition fails. acquiring token using redirect');
		if (error instanceof msal.InteractionRequiredAuthError) {
			// fallback to interaction when silent call fails
			return msalInstance.acquireTokenRedirect(request);
		} else {
			console.warn(error);
		}
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
				confirmButton: 'btn btn-secondary'
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
		zoom: 13,
		restriction: {
			latLngBounds: {
				north: 51.826601357825716,
				east: 0.7474966992187326,
				south: 51.773523020732,
				west: 0.5332633007812326
			},
			strictBounds: true
		},
		mapId: '6b8e857a992e95a7'
	});
	fetch('./api/get-caches')
		.then(response => response.json())
		.then(handleErrors)
		.then(data => {
			if (data.hasOwnProperty('caches')) {
				let count = 0;
				data.caches.forEach(cache => {
					count++;
					const marker = new google.maps.Marker({
						position: {
							lat: Number(cache.coordinates.split(',')[0]),
							lng: Number(cache.coordinates.split(',')[1])
						},
						map: mainMap,
						title: `Cache ${count}`,
						label: String(count)
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
	changePage('map');
}

function loadCachePage(id) {
	document.getElementById('cacheHeader').innerText = id;
	changePage('cache');
}

function changePage(page) {
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
}

// Function to start on page load
window.onload = function () {
	router = new Navigo('/');
	router
		.on('/', function () {
			changePage('home');
		})
		.on('/viewCaches', function () {
			loadCachesPage();
		})
		.on('/viewCache-:id', function (value) {
			loadCachePage(value.data.id);
		})
		.on('/foundCache-:id', function (value) {
			console.log(value.data.id);
			console.log(value);
		})
		.on('/about', function () {
			changePage('about');
		})
		.on('/disclaimer', function () {
			changePage('disclaimer');
		})
		.notFound(function () {
			changePage('404');
		})
		.resolve();
};