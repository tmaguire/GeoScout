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
const listId = process.env.graphSiteListId;
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

	const returnObj = {
		caches: []
	};
	let userId = false;
	let userObj = [];
	let caches = [];

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
			// Use batch request
			return client
				.api('/$batch')
				.post({
					requests: [{
						id: 'caches',
						method: 'GET',
						url: `/sites/${siteId}/lists/${listId}/items?$expand=fields($select=Title,Coordinates,W3WLocation,Polygon,Found,Suspended)&$select=id,fields&$filter=fields/Suspended eq 0`,
						// url: `/sites/${siteId}/lists/${listId}/items?$expand=fields($select=Title,Coordinates,W3WLocation,Found,Suspended)&$select=id,fields&$top=3000`,
						headers: {
							'Prefer': 'allowthrottleablequeries'
						}
					},
					{
						id: 'user',
						method: 'GET',
						url: `/sites/${siteId}/lists/${userListId}/items?$expand=fields($select=Title,FoundCaches)&$select=id,fields&$filter=fields/Title eq '${userId}'`,
						// url: `/sites/${siteId}/lists/${userListId}/items?$expand=fields($select=Title,FoundCaches)&$select=id,fields&$top=3000`,
						headers: {
							'Prefer': 'allowthrottleablequeries'
						}
					}]
				});
		})
		.then(data => {
			if (data.hasOwnProperty('error')) {
				throw {
					error: data.error
				};
			}
			data.responses.forEach(response => {
				if (response.status !== 200) {
					throw {
						error: response.body.error
					};
				}
				if (response.id === 'user') {
					userObj = response.body.value;
				} else if (response.id === 'caches') {
					caches = response.body.value;
				}
			});
			return caches;
		})
		.then(data => {
			data.forEach(cache => {
				const fields = cache.fields;
				returnObj.caches.push({
					location: fields.W3WLocation,
					coordinates: fields.Coordinates,
					polygon: fields.Polygon,
					id: fields.Title,
					found: false,
					stats: fields.Found,
					suspended: fields.Suspended
				});
			});
			return userObj;
		})
		.then(user => {
			if (user.length === 0) {
				return returnObj;
			} else {
				const userRecord = user.find(record => (record.fields.Title === userId));
				if (userRecord) {
					const found = [...JSON.parse(userRecord.fields.FoundCaches)];
					found.forEach(item => {
						try {
							const cache = returnObj.caches.find(cache => (cache.id === item.id));
							cache.found = true;
						} catch {
							console.log('Found cache is suspended - skipping over it');
						}
					});
				}
				return returnObj;
			}
			// } else if (user.length === 1) {
			// 	const found = [...JSON.parse(user[0].fields.FoundCaches)];
			// 	found.forEach(item => {
			// 		try {
			// 			const cache = returnObj.caches.find(cache => (cache.id === item.id));
			// 			cache.found = true;
			// 		} catch {
			// 			console.log('Found cache is suspended - skipping over it');
			// 		}
			// 	});
			// 	return returnObj;
			// } else {
			// 	throw 'Duplicate User ID!';
			// }
		})
		.then(obj => {
			return {
				statusCode: 200,
				body: JSON.stringify(obj),
				headers
			};
		})
		.catch(error => {
			console.log(error);
			return {
				statusCode: 500,
				body: JSON.stringify({
					error: 'Unable to get caches',
					errorDebug: error
				}),
				headers
			};
		});
}