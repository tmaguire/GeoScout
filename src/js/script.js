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

let username = '';
let authority = [];
let table;
let isNew = false;

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

function loadMap() {
	const map = L.map('mapContainer').fitWorld();
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: '© OpenStreetMap'
	}).addTo(map);
	map.locate({
		setView: true,
		maxZoom: 16
	});

	function onLocationFound(event) {
		const radius = event.accuracy;
		L.marker(event.latlng).addTo(map)
			.bindPopup(`You are within ${radius} metres from this point`).openPopup();
		L.circle(event.latlng, radius).addTo(map);
	}

	function onLocationError(event) {
		showToast.fire({
			title: event.message,
			icon: 'error'
		});
	}
	map.on('locationfound', onLocationFound);
	map.on('locationerror', onLocationError);
	changePage('map');
}


function changePage(page) {
	document.querySelectorAll('section').forEach(section => {
		if (section.id !== page) {
			section.setAttribute('class', 'row mx-auto d-none');
			section.setAttribute('aria-hidden', 'true');
		}
	});
	document.getElementById(page).setAttribute('class', 'row mx-auto');
	document.getElementById(page).setAttribute('aria-hidden', 'false');
}

// Function to start on page load
window.onload = function () {
	const router = new Navigo('/');
	router
		.on('/viewCaches', function () {
			loadMap();
		})
		.on('/test-:id', function (value) {
			console.log(value);
		})
		.on('/', function () {
			changePage('home');
		})
		.on('/home', function () {
			changePage('home');
		})
		.on('/foundCache', function () {
			changePage('cache');
		})
		.on('/about', function () {
			changePage('about');
		})
		.resolve();
};