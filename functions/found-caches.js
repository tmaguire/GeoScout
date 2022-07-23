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
import crypto from 'crypto';
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

	// Debugging line
	console.log((event.headers['x-nf-client-connection-ip'] || event.headers['client-ip']));
	const ip = crypto.createHash('SHA256').update((event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'])).digest('hex');
	let deviceId;
	let requestId;

	try {
		deviceId = event.headers['device-id'];
		requestId = event.headers['request-id'];
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
			let sessionIp;
			let requestIp;
			try {
				sessionIp = sessionData.visits[0].ip;
				requestIp = crypto.createHash('SHA256').update(sessionIp).digest('hex');
			} catch {
				throw 'Session mismatch';
			}
			if (requestIp === ip || event.headers['client-ip'] === '::1') {
				return true;
			} else {
				throw 'Session mismatch';
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
			if (error === 'Session mismatch') {
				return {
					statusCode: 401,
					body: JSON.stringify({
						error: 'Unable to validate your Device ID'
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