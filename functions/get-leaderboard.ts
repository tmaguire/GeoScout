// Import JWT module
import { VerifyOptions, verify } from 'jsonwebtoken';
// Import Fetch (Isomorphic Fetch)
import 'isomorphic-fetch';

// Microsoft Graph API details
const clientId = process.env.graphClientId as string;
const tenantId = process.env.tenantId as string;

import { ClientCertificateCredential } from '@azure/identity';
// Graph SDK Preparation
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { HandlerEvent, HandlerResponse } from '@netlify/functions';
import path from 'path';
import {
	GeoScoutToken,
	LeaderboardRecord,
	SharePointUserRecord,
} from '../src/js/types';

const credential = new ClientCertificateCredential(tenantId, clientId, {
	certificatePath: path.join(__dirname, 'cert.pem'),
	certificatePassword: process.env.graphCertKey,
});
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
	scopes: ['.default'],
});
const client = Client.initWithMiddleware({
	debugLogging: true,
	authProvider: authProvider,
});
// SharePoint Site Details
const userListId = process.env.graphUserListId as string;
const siteId = process.env.graphSiteId as string;
// JWT authentication
const jwtSecret = process.env.jwtTokenSecret as string;
const jwtOptions: VerifyOptions = {
	audience: 'www.geoscout.uk',
	maxAge: '3y',
	issuer: 'api.geoscout.uk',
	algorithms: ['HS384'],
};
// Return for all responses
const headers = {
	'Content-Type': 'application/json',
};

// Start Lambda Function
export async function handler(event: HandlerEvent): Promise<HandlerResponse> {
	// Only allow GET
	if (event.httpMethod !== 'GET') {
		return {
			statusCode: 405,
			body: JSON.stringify({
				error: 'Method Not Allowed',
			}),
			headers,
		};
	}

	let userId: false | string = false;

	return new Promise<false | GeoScoutToken>((resolve, reject) => {
		// Get token (if provided)
		try {
			const authToken = String(event.headers.authorization).split(' ')[1];
			if (authToken) {
				resolve(verify(authToken, jwtSecret, jwtOptions) as GeoScoutToken);
			} else {
				resolve(false);
			}
		} catch (error) {
			reject(error);
		}
	})
		.then((decodedToken) => {
			if (typeof decodedToken === 'object') {
				userId = decodedToken.sub;
			}
			// Get items from list
			return client
				.api(
					`/sites/${siteId}/lists/${userListId}/items?$expand=fields($select=Title,Total,FoundCaches)&$select=id,fields&$orderby=fields/Total desc,fields/Title&$filter=fields/Total ne 0&$top=3000`,
				)
				.header('Prefer', 'allowthrottleablequeries')
				.get();
		})
		.then((data: { value: SharePointUserRecord[] }) => {
			if (data.value.length === 0) {
				return [];
			} else {
				const array: LeaderboardRecord[] = [];
				data.value.forEach((user) => {
					const fields = user.fields;
					if (fields.Total !== 0) {
						array.push({
							userId: fields.Title,
							found: fields.Total,
							lastUpdate: [...JSON.parse(fields.FoundCaches)][
								[...JSON.parse(fields.FoundCaches)].length - 1
							].date,
						});
					}
				});
				return array;
			}
		})
		.then((array) => {
			return array.sort(function (a, b) {
				return b.found - a.found;
			});
		})
		.then((array) => {
			let position = 1;
			for (let i = 0; i < array.length; i++) {
				if (i > 0 && array[i].found < array[i - 1].found) {
					position++;
				}
				array[i].position = position;
			}
			return array;
		})
		.then((data) => {
			data.sort(
				(a, b) =>
					(a.position || 0) - (b.position || 0) ||
					new Date(a.lastUpdate).getTime() - new Date(b.lastUpdate).getTime(),
			);
			return data;
		})
		.then((leaderboard) => {
			return {
				statusCode: 200,
				body: JSON.stringify({
					leaderboard,
					userId,
				}),
				headers,
			};
		})
		.catch((error) => {
			console.warn(error);
			return {
				statusCode: 500,
				body: JSON.stringify({
					error: 'Unable to load the leaderboard',
					errorDebug: error,
				}),
				headers,
			};
		});
}
