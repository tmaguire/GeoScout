import ky from 'ky';
import localforage from 'localforage';
import type { AccessTokenChallengeResponse, AccessTokenResponse, GeoScoutToken } from './types';

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
	const data = await ky
		.post<AccessTokenChallengeResponse>('./api/get-token', {
			json: {
				uuid,
			},
		})
		.json();
	const data_1 = await ky
		.post<AccessTokenResponse>('./api/get-token', {
			json: {
				uuid,
				token: data.token,
			},
		})
		.json();
	return await localforage.setItem<string>('accessToken', data_1.accessToken);
}

export async function getAccessToken(required: boolean = false): Promise<string | false> {
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