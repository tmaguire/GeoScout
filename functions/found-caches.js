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
const deviceListId = process.env.graphUserListId;
const siteId = process.env.graphSiteId;
// Import validation module for deviceId
import {
	FingerprintJsServerApiClient,
	Region
} from '@fingerprintjs/fingerprintjs-pro-server-api';
const fingerprintSecret = process.env.fingerprintSecret;
const fingerprintClient = new FingerprintJsServerApiClient({
	region: Region.EU,
	apiKey: fingerprintSecret
});

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

	let deviceId;
	let requestId;

	try {
		deviceId = event.headers['device-id'];
		requestId = event.headers['request-id'];
		if (!deviceId || !requestId) {
			throw 'Missing required headers';
		}
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

	return fingerprintClient.getVisitorHistory(deviceId, {
			request_id: requestId
		})
		.then(sessionData => {
			if (sessionData.visits.length === 0) {
				throw 'Invalid session';
			} else {
				return true;
			}
		})
		.then(() => {
			return client.api(`/sites/${siteId}/lists/${deviceListId}/items?expand=fields(select=Title,Total,FoundCaches)&$select=id,fields&$orderby=fields/Total desc,fields/Title`)
				.get();
		})
		.then(data => {
			if (data.value.length === 0) {
				return {
					found: []
				};
			} else {
				let counter = 0;
				const obj = {
					found: '',
					position: '',
					total: ''
				};
				data.value.every(device => {
					counter++;
					if (device.fields.Title === deviceId) {
						obj.found = [...JSON.parse(device.fields.FoundCaches)];
						obj.position = counter;
						obj.total = data.value.length;
						return false;
					}
					return true;
				});
				return obj;
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
			if (error === 'Invalid session') {
				return {
					statusCode: 401,
					body: JSON.stringify({
						error: 'Unable to validate your Device ID',
						errorDebug: 'No valid sessions were provided for this device ID...'
					}),
					headers: {
						'Content-Type': 'application/json'
					}
				};
			} else {
				return {
					statusCode: 500,
					body: JSON.stringify({
						error: 'Unable to get found caches',
						errorDebug: error
					}),
					headers: {
						'Content-Type': 'application/json'
					}
				};
			}
		});
}