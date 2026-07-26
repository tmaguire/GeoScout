import DOMPurify from 'dompurify';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import type { LeaderboardResponse } from './types';

export function appendSuffix(number: number): string {
	const firstPass = number % 10;
	const secondPass = number % 100;
	if (firstPass === 1 && secondPass !== 11) {
		return `${number}st`;
	}
	if (firstPass === 2 && secondPass !== 12) {
		return `${number}nd`;
	}
	if (firstPass === 3 && secondPass !== 13) {
		return `${number}rd`;
	}
	return `${number}th`;
}

export async function loadLeaderboardTable(
	data: LeaderboardResponse,
	tableContainer: HTMLElement,
): Promise<void> {
	return new Promise<void>((resolve) => {
		tableContainer.innerHTML =
			'<div id="leaderboardTable" class="rounded shadow border"></div>';
		new Tabulator('#leaderboardTable', {
			data: data.leaderboard,
			columns: [
				{
					title: 'Position',
					field: 'position',
					sorter: 'number',
					formatter: (cell) => {
						const positionString = appendSuffix(Number(cell.getValue()));
						return `${positionString}${positionString === '1st' ? '&nbsp;🥇' : positionString === '2nd' ? '&nbsp;🥈' : positionString === '3rd' ? '&nbsp;🥉' : ''}`;
					},
					minWidth: 120,
				},
				{
					title: 'User ID',
					field: 'userId',
					sorter: 'string',
					formatter: (cell) => {
						const name = DOMPurify.sanitize(cell.getValue());
						return `${name}${name === data.userId ? '&nbsp;<strong>(You)</strong>' : ''}`;
					},
					minWidth: 150,
				},
				{
					title: 'Caches found',
					field: 'found',
					sorter: 'number',
					minWidth: 170,
				},
			],
			responsiveLayout: false,
			layout: 'fitColumns',
			layoutColumnsOnNewData: true,
			rowFormatter: (row) => {
				const rankingStyles = {
					1: 'gs-gold',
					2: 'gs-silver',
					3: 'gs-bronze',
				};
				const ranking = Number(row.getData().position);
				let rankStyle: string | false;
				switch (ranking) {
					case 1:
					case 2:
					case 3: {
						rankStyle = rankingStyles[ranking];
						break;
					}
					default: {
						rankStyle = false;
						break;
					}
				}
				if (rankStyle) {
					row.getElement().classList.add(rankStyle);
				}
				const isUserRecord = row.getData().userId === data.userId;
				if (isUserRecord) {
					row.getElement().classList.add('gs-your-device');
				}
			},
			initialSort: [{ column: 'position', dir: 'asc' }],
		});
		resolve();
	});
}
