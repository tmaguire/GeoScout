import { Collapse } from 'bootstrap/js/dist/collapse';
import { appName, appUrl } from './main';

export function changePage(
	page: string = '',
	title: false | string = false,
	id: false | string = false,
): void {
	// Update Canonical tag
	document
		.querySelector("link[rel='canonical']")
		?.setAttribute(
			'href',
			page === '404'
				? appUrl
				: id
					? `${appUrl}/${page}-${id}`
					: `${appUrl}/${page}`,
		);
	// Update menu
	document.querySelectorAll('a.nav-link').forEach((menuItem) => {
		if (
			menuItem.getAttribute('href') === (page === 'holding' ? 'home' : page)
		) {
			menuItem.classList.add('active');
			menuItem.setAttribute('aria-current', 'page');
		} else {
			menuItem.classList.remove('active');
			menuItem.removeAttribute('aria-current');
		}
	});
	// Hide all pages (except selected)
	document.querySelectorAll('section').forEach((section) => {
		if (section.id !== page) {
			section.classList.add('d-none');
			section.setAttribute('aria-hidden', 'true');
		}
	});
	// Set page as active
	document.getElementById(page)?.classList.remove('d-none');
	document.getElementById(page)?.removeAttribute('aria-hidden');
	// Change document title
	document.title = `${title} | ${appName}`;
	// Scroll to top
	window.scrollTo({
		top: 0,
		left: 0,
		behavior: 'smooth',
	});
	// Close the navbar menu (if it is open)
	const menuToggle = document.getElementById('navbarToggler') as HTMLElement;
	const bsCollapse = new Collapse(menuToggle, {
		toggle: false,
	});
	bsCollapse.hide();
}
