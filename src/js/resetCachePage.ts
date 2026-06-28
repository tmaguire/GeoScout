export function resetCachePage(): void {
	document.getElementById('cacheCard')?.setAttribute('aria-hidden', 'true');
	const img = document.getElementById('cacheMapImg') as HTMLElement;
	img.setAttribute('src', './img/loading.gif');
	img.setAttribute('alt', 'Loading animation placeholder');
	img.setAttribute('height', '150');
	img.setAttribute('width', '150');
	const header = document.getElementById('cacheHeader') as HTMLElement;
	header.setAttribute('class', 'card-title placeholder-glow');
	header.innerHTML = '<span class="placeholder col-6"></span>';
	const w3wLink = document.getElementById('cacheW3WLink') as HTMLElement;
	w3wLink.setAttribute('class', 'card-text placeholder-glow');
	w3wLink.innerHTML =
		'<span class="placeholder col-7"></span><span class="placeholder col-4"></span><span class="placeholder col-4"></span><span class="placeholder col-6"></span><span class="placeholder col-8"></span>';
	const w3wBtn = document.getElementById('cacheW3WBtn') as HTMLElement;
	w3wBtn.removeAttribute('target');
	w3wBtn.removeAttribute('href');
	w3wBtn.setAttribute('tabindex', '-1');
	w3wBtn.setAttribute(
		'class',
		'btn btn-primary m-1 disabled placeholder col-5'
	);
	w3wBtn.replaceChildren();
	const mapBtn = document.getElementById('cacheMapsLink') as HTMLElement;
	mapBtn.removeAttribute('target');
	mapBtn.removeAttribute('href');
	mapBtn.setAttribute('tabindex', '-1');
	mapBtn.setAttribute(
		'class',
		'btn btn-primary m-1 disabled placeholder col-5'
	);
	mapBtn.replaceChildren();
	const foundBtn = document.getElementById('cacheFoundLink') as HTMLElement;
	foundBtn.removeAttribute('target');
	foundBtn.removeAttribute('href');
	foundBtn.setAttribute('tabindex', '-1');
	foundBtn.setAttribute(
		'class',
		'btn btn-outline-primary m-1 disabled placeholder col-4'
	);
	foundBtn.replaceChildren();
}
