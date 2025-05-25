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
	appBlurb,
	appHolding,
	googleMapsApiKey,
	what3wordsApiKey
} = require('./package.json');
const sass = require('gulp-sass')(require('sass'));
const {
	marked
} = require('marked');
const preprocess = require('gulp-preprocess');
const gulpEsbuild = require('gulp-esbuild');
const mergeStream = require('merge-stream');

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

function bundleJs() {
	return mergeStream(['main', 'offline'].map(script => {
		return src(`./src/js/${script}.js`)
			.pipe(gulpEsbuild({
				outfile: `${script}-${version}.min.js`,
				bundle: true,
				format: 'iife',
				minify: true,
				platform: 'browser'
			}))
			.pipe(preprocess({
				context: {
					version,
					appUrl,
					appName,
					googleMapsApiKey,
					appHolding,
					what3wordsApiKey
				},
			}))
			.pipe(dest('dist/js/'));
	}));
}

function bundleCss() {
	return src('./src/css/style.scss', { encoding: false })
		.pipe(concat(`bundle-${version}.min.css`))
		.pipe(sass({
			style: 'compressed',
			quietDeps: true
		}))
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
				appBlurb,
				appHolding
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

function serviceWorker() {
	return src('./src/js/service-worker.js', { encoding: false })
		.pipe(preprocess({
			context: {
				version,
				appUrl,
				appName
			},
		}))
		.pipe(uglify())
		.pipe(dest('dist/'));
}

function copyAppResources() {
	return src('./src/app/*', { encoding: false })
		.pipe(dest('./dist/.well-known/'));
}

exports.default = parallel(series(parallel(bundleJs, series(copyIcons, bundleCss), sitePages, copyImg, copySite, serviceWorker, copyAppResources), sri));