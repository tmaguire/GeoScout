/* jshint esversion:8 */
const {
	src,
	dest,
	parallel,
	series
} = require('gulp');
const uglify = require('gulp-uglify');
const concat = require('gulp-concat');
const fileInclude = require('gulp-file-include');
const sriHash = require('gulp-sri-hash');
const htmlmin = require('gulp-html-minifier-terser');
const {
	version,
	appName,
	author,
	appUrl,
	appBlurb
} = require('./package.json');
const sass = require('gulp-sass')(require('sass'));
const {
	marked
} = require('marked');
const preprocess = require('gulp-preprocess');

function licensePrep() {
	const licenses = require('./thirdparty-licenses.json');
	const array = [];
	let counter = 0;
	Object.keys(licenses).forEach(key => {
		counter++;
		const license = licenses[key];
		array.push({
			name: license.name,
			version: license.version,
			repo: license.repository,
			license: license.licenseText,
			counter
		});
	});
	return array;
}
const licenses = licensePrep();

function sri() {
	return src('dist/*.html', { encoding: false })
		.pipe(sriHash({
			algo: 'sha512',
			relative: true
		}))
		.pipe(dest('dist/'));
}

function bundleMainJs() {
	return src([
		'./node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
		'./node_modules/sweetalert2/dist/sweetalert2.min.js',
		'./node_modules/dompurify/dist/purify.min.js',
		'./node_modules/navigo/lib/navigo.min.js',
		'./node_modules/gridjs/dist/gridjs.production.min.js',
		'./node_modules/@googlemaps/js-api-loader/dist/index.min.js',
		'./node_modules/@googlemaps/markerclusterer/dist/index.min.js',
		'./node_modules/qr-scanner/qr-scanner.umd.min.js',
		'./src/js/script.js'
	], { encoding: false })
		.pipe(concat(`main-${version}.min.js`))
		.pipe(uglify())
		.pipe(dest('dist/js/'));
}

function bundleOfflineJs() {
	return src([
		'./node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
		'./src/js/offline.js'
	], { encoding: false })
		.pipe(concat(`offline-${version}.min.js`))
		.pipe(uglify())
		.pipe(dest('dist/js/'));
}

function bundleCss() {
	return src([
		'./src/css/style.scss',
		'./node_modules/bootstrap-icons/font/bootstrap-icons.scss',
		'./node_modules/sweetalert2/dist/sweetalert2.min.css',
		'./node_modules/gridjs/dist/theme/mermaid.min.css',
		'./node_modules/outdated-browser-rework/dist/style.css'
	], { encoding: false })
		.pipe(concat(`bundle-${version}.min.css`))
		.pipe(sass.sync({
			outputStyle: 'compressed'
		}).on('error', sass.logError))
		.pipe(dest('dist/css/'));
}

function copyImg() {
	return src([
		'./src/img/*',
		'./src/img/screenshots/*'
	], { encoding: false })
		.pipe(dest('dist/img/'));
}

function copyIcons() {
	return src('./node_modules/bootstrap-icons/font/fonts/*', { encoding: false })
		.pipe(dest('dist/css/fonts/'));
}

function sitePages() {
	return src('./src/html/*.html', { encoding: false })
		.pipe(fileInclude({
			prefix: '@@',
			basepath: '@root',
			context: {
				version,
				licenses,
				appName,
				author,
				appUrl,
				appBlurb
			},
			filters: {
				markdown: marked.options({ mangle: false, headerIds: false, headerPrefix: false }).parse
			}
		}))
		.pipe(htmlmin({
			collapseWhitespace: true,
			removeComments: true,
			continueOnParseError: true
		}))
		.pipe(dest('dist/'));
}

function copySite() {
	return src('./src/site/*', { encoding: false })
		.pipe(dest('dist/'));
}

function browserCompat() {
	return src([
		'./node_modules/outdated-browser-rework/dist/outdated-browser-rework.min.js',
		'./src/js/browser-compat.js'
	], { encoding: false })
		.pipe(concat(`browser-compat-${version}.min.js`))
		.pipe(uglify())
		.pipe(dest('dist/js/'));
}

function serviceWorker() {
	return src('./src/js/service-worker.js', { encoding: false })
		.pipe(preprocess({
			context: {
				version,
				appUrl,
				appName
			},
		}))
		.pipe(concat('service-worker.js'))
		.pipe(uglify())
		.pipe(dest('dist/'));
}

function copyQrCodeModule() {
	return src('./node_modules/qr-scanner/qr-scanner-worker.min.js', { encoding: false })
		.pipe(dest('dist/js/'));
}

function copyAppResources() {
	return src('./src/app/*', { encoding: false })
		.pipe(dest('./dist/.well-known/'));
}

exports.default = parallel(series(parallel(bundleMainJs, bundleOfflineJs, series(copyIcons, bundleCss), sitePages, copyImg, copySite, copyQrCodeModule, browserCompat, serviceWorker, copyAppResources), sri));