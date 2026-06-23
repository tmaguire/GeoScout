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
	GeoScoutCache,
	GeoScoutCaches,
	GeoScoutToken,
	SharePointBatchResponse,
	SharePointCacheRecord,
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
const listId = process.env.graphSiteListId as string;
const userListId = process.env.graphUserListId as string;
const siteId = process.env.graphSiteId as string;
// JWT authentication
const jwtSecret = process.env.jwtTokenSecret as string;
const jwtVerifyOptions: VerifyOptions = {
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
	if (event.httpMethod !== 'GET' && event.httpMethod !== 'OPTIONS') {
		return {
			statusCode: 405,
			body: JSON.stringify({
				error: 'Method Not Allowed',
			}),
			headers,
		};
	}

	const returnObj: GeoScoutCaches = {
		caches: [],
	};
	let userId: false | string = false;
	let userObj: SharePointUserRecord[];
	let caches: SharePointCacheRecord[];

	return new Promise<false | GeoScoutToken>((resolve, reject) => {
		// Get token (if provided)
		try {
			const authToken = String(event.headers.authorization).split(' ')[1];
			if (authToken) {
				resolve(
					verify(authToken, jwtSecret, jwtVerifyOptions) as GeoScoutToken,
				);
			} else {
				resolve(false);
			}
		} catch (error) {
			reject(error);
		}
	})
		.then((decodedToken) => {
			if (decodedToken) {
				userId = decodedToken.sub;
			}
			// Use batch request
			return client.api('/$batch').post({
				requests: [
					{
						id: 'caches',
						method: 'GET',
						url: `/sites/${siteId}/lists/${listId}/items?$expand=fields($select=Title,Coordinates,W3WLocation,Polygon,Found,Suspended)&$select=id,fields&$filter=fields/Suspended eq 0`,
						headers: {
							Prefer: 'allowthrottleablequeries',
						},
					},
					{
						id: 'user',
						method: 'GET',
						url: `/sites/${siteId}/lists/${userListId}/items?$expand=fields($select=Title,FoundCaches)&$select=id,fields&$filter=fields/Title eq '${userId}'`,
						headers: {
							Prefer: 'allowthrottleablequeries',
						},
					},
				],
			});
		})
		.then((data: SharePointBatchResponse) => {
			if (data.hasOwnProperty('error')) {
				throw {
					error: data.error,
				};
			}
			data.responses.forEach((response) => {
				if (response.status !== 200) {
					throw {
						error: response.body.error,
					};
				}
				if (response.id === 'user') {
					userObj = response.body.value as SharePointUserRecord[];
				} else if (response.id === 'caches') {
					caches = response.body.value as SharePointCacheRecord[];
				}
			});
			return caches;
		})
		.then((data) => {
			data.forEach((cache) => {
				const fields = cache.fields;
				returnObj.caches.push({
					location: fields.W3WLocation,
					coordinates: fields.Coordinates,
					polygon: fields.Polygon,
					id: fields.Title,
					found: false,
					stats: fields.Found,
					suspended: fields.Suspended,
				} as GeoScoutCache);
			});
			return userObj;
		})
		.then((user) => {
			if (user.length === 0) {
				return returnObj;
			} else {
				const userRecord = user.find(
					(record) => record.fields.Title === userId,
				);
				if (userRecord) {
					const found = [...JSON.parse(userRecord.fields.FoundCaches)];
					found.forEach((item) => {
						try {
							const cache = returnObj.caches.find(
								(cache) => cache.id === item.id,
							) as GeoScoutCache;
							cache.found = true;
						} catch {
							console.log('Found cache is suspended - skipping over it');
						}
					});
				}
				return returnObj;
			}
		})
		.then((obj) => {
			return {
				statusCode: 200,
				body: JSON.stringify(obj),
				headers,
			};
		})
		.catch((error) => {
			console.log(error);
			return {
				statusCode: 500,
				body: JSON.stringify({
					error: 'Unable to get caches',
					errorDebug: error,
				}),
				headers,
			};
		});
}
