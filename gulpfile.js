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
const version = require('./package.json').version;
const sass = require('gulp-sass')(require('sass'));

function licensePrep() {
	const licenses = require('./thirdparty-licenses.json');
	const array = [];
	Object.keys(licenses).forEach(key => {
		const license = licenses[key];
		array.push({
			name: license.name,
			version: license.version,
			repo: license.repository,
			license: license.licenseText
		});
	});
	return array;
}
const licenses = licensePrep();

function sri() {
	return src('dist/*.html')
		.pipe(sriHash({
			algo: 'sha512',
			relative: true
		}))
		.pipe(dest('dist/'));
}

function bundledJs() {
	return src([
			'./node_modules/@azure/msal-browser/lib/msal-browser.min.js',
			'./node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
			'./node_modules/sweetalert2/dist/sweetalert2.min.js',
			'./node_modules/dompurify/dist/purify.min.js',
			'./node_modules/navigo/lib/navigo.min.js',
			'./src/js/script.min.js'
		])
		.pipe(concat(`main-${version}.min.js`))
		.pipe(uglify())
		.pipe(dest('dist/js/'));
}

function bundledCss() {
	return src([
			'./src/css/style.scss',
			'./node_modules/bootstrap-icons/font/bootstrap-icons.scss',
			'./node_modules/sweetalert2/dist/sweetalert2.min.css'
		])
		.pipe(concat(`bundle-${version}.min.css`))
		.pipe(sass.sync({
			outputStyle: 'compressed'
		}).on('error', sass.logError))
		.pipe(dest('dist/css/'));
}

// function copyImg() {
// 	return src([
// 			'./src/img/*'
// 		])
// 		.pipe(dest('dist/img/'));
// }

function copyIcons() {
	return src('./node_modules/bootstrap-icons/font/fonts/*')
		.pipe(dest('dist/css/fonts/'));
}

function sitePages() {
	return src('./src/html/*.html')
		.pipe(fileInclude({
			prefix: '@@',
			basepath: '@root',
			context: {
				version: version,
				licenses: licenses
			}
		}))
		.pipe(htmlmin({
			collapseWhitespace: true,
			removeComments: true,
			continueOnParseError: true
		}))
		.pipe(dest('dist/'));
}

exports.default = parallel(series(parallel(bundledJs, bundledCss, sitePages, copyIcons), sri));
exports.dev = parallel(bundledJs, bundledCss, sitePages, copyIcons);