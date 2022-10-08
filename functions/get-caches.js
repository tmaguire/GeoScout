/* jshint esversion: 10 */
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
	let deviceObj;
	let caches;

	try {
		deviceId = event.headers['device-id'];
		if (!deviceId) {
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
	} catch (error) {
		console.log(error);
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

	// Use batch request
	return client
		.api('/$batch')
		.post({
			requests: [{
				id: 'caches',
				method: 'GET',
				url: `/sites/${siteId}/lists/${listId}/items?expand=fields(select=Title,Coordinates,W3WLocation,Found,Suspended)&$select=id,fields&filter=fields/Suspended eq 0`
			}, {
				id: 'device',
				method: 'GET',
				url: `/sites/${siteId}/lists/${deviceListId}/items?expand=fields(select=Title,FoundCaches)&$select=id,fields&filter=fields/Title eq '${deviceId}'`
			}]
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
				if (response.id === 'device') {
					deviceObj = response.body.value;
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
					id: fields.Title,
					found: false,
					stats: fields.Found,
					suspended: fields.Suspended
				});
			});
			return deviceObj;
		})
		.then(device => {
			if (device.length === 0) {
				return returnObj;
			} else if (device.length === 1) {
				const found = [...JSON.parse(device[0].fields.FoundCaches)];
				found.forEach(item => {
					try {
						const cache = returnObj.caches.find(cache => (cache.id === item.id));
						cache.found = true;
					} catch {
						console.log('Found cache is suspended - skipping over it');
					}
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