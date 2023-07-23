/* jshint esversion: 10 */
// Import JWT module
import {
	verify
} from 'jwt-promisify';
// Import Fetch (Isomorphic Fetch)
import 'isomorphic-fetch';
// Microsoft Graph API details
const clientId = process.env.graphClientId;
const tenantId = process.env.tenantId;
// Graph SDK Preparation
import {
	Client
} from '@microsoft/microsoft-graph-client';
import {
	TokenCredentialAuthenticationProvider
} from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import {
	ClientCertificateCredential
} from '@azure/identity';
import path from 'path';
const credential = new ClientCertificateCredential(tenantId, clientId, {
	certificatePath: path.join(__dirname, 'cert.pem'),
	certificatePassword: process.env.graphCertKey
});
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
	scopes: ['.default']
});
const client = Client.initWithMiddleware({
	debugLogging: true,
	authProvider: authProvider
});
// SharePoint Site Details
const userListId = process.env.graphUserListId;
const siteId = process.env.graphSiteId;
// JWT authentication
const jwtSecret = process.env.jwtTokenSecret;
const jwtOptions = {
	audience: 'www.geoscout.uk',
	maxAge: '3y',
	issuer: 'api.geoscout.uk',
	algorithms: 'HS384'
};
// Return for all responses
const headers = {
	'Content-Type': 'application/json'
};

// Start Lambda Function
export async function handler(event, context) {
	// Only allow GET
	if (event.httpMethod !== 'GET') {
		return {
			statusCode: 405,
			body: JSON.stringify({
				error: 'Method Not Allowed'
			}),
			headers
		};
	}

	let userId = false;

	return new Promise((resolve, reject) => {
		// Get token (if provided)
		try {
			const authToken = String(event.headers.authorization).split(' ')[1];
			if (authToken) {
				resolve(verify(authToken, jwtSecret, jwtOptions));
			} else {
				resolve(false);
			}
		} catch (error) {
			reject(error);
		}
	})
		.then(decodedToken => {
			if (decodedToken) {
				userId = decodedToken.sub;
			}
			// Get items from list
			return client
				.api(`/sites/${siteId}/lists/${userListId}/items?$expand=fields($select=Title,Total)&$select=id,fields&$orderby=fields/Total desc,fields/Title&$filter=fields/Total ne 0`)
				.get();
		})
		.then(data => {
			if (data.value.length === 0) {
				return [];
			} else {
				const array = [];
				data.value.forEach(user => {
					const fields = user.fields;
					array.push({
						userId: fields.Title,
						found: fields.Total
					});
				});
				return array;
			}
		})
		.then(array => {
			return array.sort(function (a, b) {
				return b.found - a.found;
			});
		})
		.then(array => {
			let position = 1;
			for (var i = 0; i < array.length; i++) {
				if (i > 0 && array[i].found < array[i - 1].found) {
					position++;
				}
				array[i].position = position;
			}
			return array;
		})
		.then(leaderboard => {
			return {
				statusCode: 200,
				body: JSON.stringify({
					leaderboard,
					userId
				}),
				headers
			};
		})
		.catch(error => {
			console.warn(error);
			return {
				statusCode: 500,
				body: JSON.stringify({
					error: 'Unable to load the leaderboard',
					errorDebug: error
				}),
				headers
			};
		});
}