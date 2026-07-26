import DOMPurify from 'dompurify';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import { router } from './main';
import type { GeoScoutCache } from './types';

export async function loadMapDataTable(
	data: GeoScoutCache[],
	tableContainer: HTMLElement,
): Promise<void> {
	return new Promise<Tabulator>((resolve) => {
		tableContainer.innerHTML =
			'<div id="tableFilter"></div><div id="table" class="rounded shadow border"></div><div class="my-3 text-center"><a href="viewCaches" class="text-decoration-none" data-navigo="true"><i class="bi bi-map" aria-hidden="true"></i>&nbsp;View table data in a map</a></div>';
		const table = new Tabulator('#table', {
			data,
			columns: [
				{
					title: 'Cache ID',
					field: 'id',
					sorter: 'string',
					formatter: (cell) => {
						return `<a href="viewCache-${DOMPurify.sanitize(cell.getValue())}" data-navigo="true">${DOMPurify.sanitize(cell.getValue())}</a>`;
					},
					minWidth: 120,
					headerFilter: 'input',
				},
				{
					title: 'what3words Location',
					field: 'location',
					sorter: 'string',
					formatter: (cell) => {
						return `<a href="https://what3words.com/${DOMPurify.sanitize(cell.getValue())}?maptype=satellite" target="_blank" translate="no" rel="noopener noreferrer">${DOMPurify.sanitize(cell.getValue())}<span class="text-decoration-none ms-1"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></span></a>`;
					},
					minWidth: 300,
					headerFilter: 'input',
				},
				{
					title:
						'Difficulty<span class="visually-hidden"> of this cache</span>',
					titleFormatter: 'html',
					field: 'difficulty',
					sorter: 'string',
					formatter: (cell) => {
						const style =
							cell.getValue() === 'Easy'
								? 'success'
								: cell.getValue() === 'Medium'
									? 'warning'
									: 'danger';
						return `<span class="badge text-bg-${style}">${cell.getValue()}</span>`;
					},
					minWidth: 150,
					headerFilter: 'list',
					headerFilterParams: {
						values: ['Easy', 'Medium', 'Hard'],
					},
				},
				{
					title: 'Found<span class="visually-hidden"> this cache</span>?',
					titleFormatter: 'html',
					field: 'found',
					sorter: 'boolean',
					formatter: (cell) => {
						return cell.getValue() ? 'Yes 😊' : 'No ☹️';
					},
					minWidth: 120,
				},
				{
					title: 'Stats<span class="visually-hidden"> for this cache</span>',
					titleFormatter: 'html',
					field: 'stats',
					sorter: 'number',
					formatter: (cell) => {
						const count = Number(cell.getValue());
						return `${(count) > 0 ? `Found by ${count} ${(count) > 1 ? 'people 😊' : 'person 😮'}` : 'No one has found this cache yet 😢'}`;
					},
					minWidth: 300,
				},
			],
			responsiveLayout: false,
			layout: 'fitColumns',
			layoutColumnsOnNewData: true,
			pagination: true,
			paginationSize: 30,
			paginationCounter: (
				pageSize,
				currentRow,
				_currentPage,
				totalRows,
				_totalPages,
			) =>
				`${currentRow}-${(currentRow + pageSize) < totalRows ? currentRow + pageSize : totalRows}/${totalRows}`,
			paginationButtonCount: 2,
			initialSort: [{ column: 'id', dir: 'asc' }],
		});
		table.on('tableBuilt', () => {
			router.updatePageLinks();
		});
		table.on('pageLoaded', () => {
			router.updatePageLinks();
		});
		resolve(table);
	}).then((table) => {
		function changeFilter(filter: string) {
			switch (filter) {
				case 'all': {
					table.clearFilter(false);
					break;
				}
				default: {
					table.setFilter('found', '=', Boolean(filter === 'found'));
					break;
				}
			}
		}
		(document.getElementById('tableFilter') as HTMLElement).innerHTML =
			`<fieldset><div class="btn-group mb-3 shadow">
				<legend class="visually-hidden">Filter control for the table to toggle which caches are visible</legend>
				<input type="radio" class="btn-check" name="tableFilterBtn" id="tableFilterAll" autocomplete="off" value="all" checked>
				<label class="btn btn-outline-primary rounded-start" for="tableFilterAll">All caches</label>
				<input type="radio" class="btn-check" name="tableFilterBtn" id="tableFilterNotFound" autocomplete="off" value="notFound">
				<label class="btn btn-outline-primary" for="tableFilterNotFound">Caches you haven't found</label>
				<input type="radio" class="btn-check" name="tableFilterBtn" id="tableFilterFound" autocomplete="off" value="found">
				<label class="btn btn-outline-primary" for="tableFilterFound">Caches you've found</label>
			</div></fieldset>`;
		['tableFilterAll', 'tableFilterNotFound', 'tableFilterFound'].forEach(
			(element) => {
				document.getElementById(element)?.addEventListener('click', () => {
					changeFilter(
						(
							document.querySelector(
								'input[name="tableFilterBtn"]:checked',
							) as HTMLInputElement
						).value,
					);
				});
			},
		);
	});
}
