import DOMPurify from 'dompurify';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import { getTimeAgo } from './dateFunctions';
import { appendSuffix } from './leaderboard';
import { router } from './main';
import type { FoundCaches } from './types';

export async function loadFoundCachesDashboard(
	data: FoundCaches,
	pageContainer: HTMLElement,
): Promise<void> {
	return new Promise<void>((resolve) => {
		pageContainer.innerHTML = `<div class="row">
					<div class="col-md-12 col-xl-4">
						<div class="card stat-card mb-2 shadow">
							<div class="card-body">
								<div class="row">
									<div class="col">
										<p class="card-title text-muted mb-0">User ID</p>
										<p class="font-weight-bold mb-0"><strong id="foundCachesUserId"></strong></p>
									</div>
									<div class="col-auto">
										<div class="icon rounded-circle">
											<img id="foundCachesProfilePic" src="./img/loading.gif" height="150" width="150" alt="Loading placeholder...">
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-md-6 col-xl-4">
						<div class="card stat-card mb-2 shadow">
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
						<div class="card stat-card mb-2 shadow">
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
				<div id="foundCachesTable" class="rounded shadow border"></div>`;
		const table = new Tabulator('#foundCachesTable', {
			data: data.found,
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
					title: 'Found',
					field: 'date',
					sorter: 'datetime',
					formatter: (cell) => {
						const date = DOMPurify.sanitize(cell.getValue());
						return `<time datetime="${DOMPurify.sanitize(date)}">${getTimeAgo(date)}</time>`;
					},
					minWidth: 150,
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
			initialSort: [{ column: 'date', dir: 'asc' }],
		});
		table.on('tableBuilt', () => {
			router.updatePageLinks();
		});
		table.on('pageLoaded', () => {
			router.updatePageLinks();
		});
		const userId = DOMPurify.sanitize(data.userId);
		(document.getElementById('foundCachesUserId') as HTMLElement).innerText =
			userId;
		document
			.getElementById('foundCachesProfilePic')
			?.setAttribute('src', `./profilePic/${userId}/96`);
		document
			.getElementById('foundCachesProfilePic')
			?.setAttribute('height', '48');
		document
			.getElementById('foundCachesProfilePic')
			?.setAttribute('width', '48');
		document
			.getElementById('foundCachesProfilePic')
			?.setAttribute('alt', `Profile picture for ${userId} (your User ID)`);
		(document.getElementById('foundCachesTotal') as HTMLElement).innerText =
			Number(data.found.length).toString();
		const positionString = appendSuffix(Number(data.position));
		(document.getElementById('foundCacheRanking') as HTMLElement).innerHTML =
			`${positionString}${positionString === '1st' ? '&nbsp;🥇' : positionString === '2nd' ? '&nbsp;🥈' : positionString === '3rd' ? '&nbsp;🥉' : ''}`;
		resolve();
	});
}
