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
	FoundCache,
	FoundCaches,
	GeoScoutToken,
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
	if (event.httpMethod !== 'GET') {
		return {
			statusCode: 405,
			body: JSON.stringify({
				error: 'Method Not Allowed',
			}),
			headers,
		};
	}

	let accessToken = '';
	let userId: string;
	let tokenId: string;

	try {
		accessToken = String(event.headers.authorization).split(' ')[1];
		if (!accessToken || accessToken === '') {
			return {
				statusCode: 200,
				body: JSON.stringify({
					found: [],
				}),
				headers,
			};
		}
	} catch (error) {
		console.log(error);
		return {
			statusCode: 400,
			body: JSON.stringify({
				error: 'Invalid request',
			}),
			headers,
		};
	}

	// Validate current token
	return new Promise<GeoScoutToken>((resolve) => {
		resolve(verify(accessToken, jwtSecret, jwtVerifyOptions) as GeoScoutToken);
	})
		.then((decodedToken) => {
			userId = decodedToken.sub;
			tokenId = decodedToken.jwtId;
			return client
				.api(
					`/sites/${siteId}/lists/${userListId}/items?$expand=fields($select=Title,Total,FoundCaches,Username,BackupBanner_x003f_)&$select=id,fields&$orderby=fields/Total desc,fields/Title`,
				)
				.header('Prefer', 'allowthrottleablequeries')
				.get();
		})
		.then((data: { value: SharePointUserRecord[] }) => {
			if (data.value.length === 0) {
				return {
					found: [],
				};
			} else {
				const array: {
					found: FoundCache[];
					total: number;
					userId: string;
					backup: boolean;
					position?: number;
				}[] = [];
				const obj: FoundCaches = {
					found: [],
					total: 0,
					position: 0,
					backupOffer: false,
					userId,
				};
				data.value.forEach((user) => {
					array.push({
						found: [...JSON.parse(user.fields.FoundCaches)] as FoundCache[],
						total: user.fields.Total,
						userId: user.fields.Title,
						backup: !Boolean(user.fields.BackupBanner_x003f_),
					});
					if (user.fields.Title === userId) {
						const tokenIds = [...JSON.parse(user.fields.Username)];
						if (!tokenIds.find((id) => id === tokenId)) {
							throw 'Unable to validate your User ID';
						}
					}
				});
				array.sort(function (a, b) {
					return b.total - a.total;
				});
				let position = 1;
				for (let i = 0; i < array.length; i++) {
					if (i > 0 && array[i].found < array[i - 1].found) {
						position++;
					}
					array[i].position = position;
					if (array[i].userId === userId) {
						obj.found = array[i].found;
						obj.total = array[i].total;
						obj.position = array[i].position || 0;
						obj.backupOffer = array[i].backup;
					}
				}
				return obj;
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
					error: 'Unable to get found caches',
					errorDebug: error,
				}),
				headers,
			};
		});
}
