import localforage from 'localforage';
import { backendApi } from './main';
import type {
	AccessTokenChallengeResponse,
	AccessTokenResponse,
	GeoScoutToken,
} from './types';

export async function parseAccessToken(token: string): Promise<GeoScoutToken> {
	return new Promise((resolve, reject) => {
		try {
			if (!token) {
				throw 'Invalid token';
			}
			const base64Url = token.split('.')[1];
			const base64 = String(base64Url)
				.replaceAll('-', '+')
				.replaceAll('_', '/');
			resolve(JSON.parse(window.atob(base64)));
		} catch (error) {
			reject(error);
		}
	});
}

async function newAccessToken(): Promise<string> {
	const uuid = crypto.randomUUID().toString();
	const data = await backendApi
		.post<AccessTokenChallengeResponse>('get-token', {
			json: {
				uuid,
			},
		})
		.json();
	const data_1 = await backendApi
		.post<AccessTokenResponse>('get-token', {
			json: {
				uuid,
				token: data.token,
			},
		})
		.json();
	return await localforage.setItem<string>('accessToken', data_1.accessToken);
}

export async function getAccessToken(
	required: boolean = false,
): Promise<string | false> {
	return new Promise((resolve, reject) => {
		localforage.getItem<string>('accessToken').then((accessToken) => {
			if (accessToken) {
				resolve(accessToken);
			} else {
				if (
					localStorage.getItem('accessToken') === null ||
					localStorage.getItem('accessToken') === ''
				) {
					if (required) {
						try {
							resolve(newAccessToken());
						} catch (error) {
							reject(error);
						}
					} else {
						resolve(false);
					}
				} else {
					// Migrate token to localforage
					resolve(
						localforage.setItem<string>(
							'accessToken',
							localStorage.getItem('accessToken') || '',
						),
					);
				}
			}
		});
	});
}

export async function checkAccessTokenValid(
	accessToken: GeoScoutToken,
): Promise<void> {
	return new Promise((resolve) => {
		const currentTime = Date.now() / 1000;
		if (currentTime > accessToken.exp) {
			resolve(newAccessToken());
		} else {
			// Refresh window of 2 months
			const refreshWindow = new Date(
				new Date().setMonth(new Date().getMonth() - 2),
			).getTime();
			if (refreshWindow > accessToken.exp) {
				resolve(refreshAccessToken());
			}
			resolve(false);
		}
	}).then(() => {});
}

function refreshAccessToken(): Promise<string> {
	return new Promise((resolve) => {
		localforage.getItem<string>('accessToken').then((accessToken) => {
			if (accessToken) {
				backendApi
					.post<AccessTokenResponse>('refresh-token', {
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					})
					.json()
					.then((data) => {
						// Migrate token to localforage
						resolve(
							localforage.setItem<string>('accessToken', data.accessToken),
						);
					});
			}
		});
	});
}
