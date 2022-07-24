/* jshint esversion: 10 */
// Import Fetch (Isomorphic Fetch)
import 'isomorphic-fetch';
// Microsoft Graph API details
const clientId = process.env.graphClientId;
const clientSecret = process.env.graphClientSecret;
const tenantId = process.env.tenantId;
// Graph SDK Preparation
import {
	Client
} from '@microsoft/microsoft-graph-client';
import {
	TokenCredentialAuthenticationProvider
} from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import {
	ClientSecretCredential
} from '@azure/identity';
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
	scopes: ['.default']
});
const client = Client.initWithMiddleware({
	debugLogging: true,
	authProvider: authProvider
});
// SharePoint Site Details
const listId = process.env.graphSiteListId;
const deviceListId = process.env.graphUserListId;
const siteId = process.env.graphSiteId;

// Start Lambda Function
export async function handler(event, context) {
	// Only allow GET
	if (event.httpMethod !== 'GET') {
		return {
			statusCode: 405,
			body: JSON.stringify({
				error: 'Method Not Allowed'
			}),
			headers: {
				'Content-Type': 'application/json'
			}
		};
	}

	const returnObj = {
		caches: []
	};
	let deviceId;

	try {
		deviceId = event.headers['device-id'];
	} catch {
		return {
			statusCode: 400,
			body: JSON.stringify({
				error: 'Invalid request'
			}),
			headers: {
				'Content-Type': 'application/json'
			}
		};
	}

	// Get list items from library
	return client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields(select=Title,Coordinates,W3WLocation,Found,Suspended)&$select=id,fields&filter=fields/Suspended eq 0`)
		.get()
		.then(data => {
			if (data.hasOwnProperty('error')) {
				throw {
					error: data.error
				};
			}
			data.value.forEach(cache => {
				const fields = cache.fields;
				returnObj.caches.push({
					location: fields.W3WLocation,
					coordinates: fields.Coordinates,
					id: fields.Title,
					found: false,
					stats: fields.Found,
					suspended: fields.Suspended
				});
			});
			return client.api(`/sites/${siteId}/lists/${deviceListId}/items?expand=fields(select=Title,FoundCaches)&$select=id,fields&filter=fields/Title eq '${deviceId}'`)
				.get();
		})
		.then(data => {
			if (data.value.length === 0) {
				return returnObj;
			} else if (data.value.length === 1) {
				const found = [...JSON.parse(data.value[0].fields.FoundCaches)];
				found.forEach(item => {
					const cache = returnObj.caches.find(cache => (cache.id === item.id));
					cache.found = true;
				});
				return returnObj;
			} else {
				throw 'Duplicate device ID!';
			}
		})
		.then(obj => {
			return {
				statusCode: 200,
				body: JSON.stringify(obj),
				headers: {
					'Content-Type': 'application/json'
				}
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
				headers: {
					'Content-Type': 'application/json'
				}
			};
		});
}