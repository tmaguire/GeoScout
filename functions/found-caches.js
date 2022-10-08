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
			return {
				statusCode: 400,
				body: JSON.stringify({
					error: 'Missing required headers'
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

	return fingerprintClient
		.getVisitorHistory(deviceId, {
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
			return client
				.api(`/sites/${siteId}/lists/${deviceListId}/items?expand=fields(select=Title,Total,FoundCaches)&$select=id,fields&$orderby=fields/Total desc,fields/Title`)
				.get();
		})
		.then(data => {
			if (data.value.length === 0) {
				return {
					found: []
				};
			} else {
				const array = [];
				const obj = {
					found: '',
					total: '',
					position: ''
				};
				data.value.forEach(device => {
					array.push({
						found: [...JSON.parse(device.fields.FoundCaches)],
						total: device.fields.Total,
						deviceId: device.fields.Title
					});
				});
				array.sort(function (a, b) {
					return b.total - a.total;
				});
				let position = 1;
				for (var i = 0; i < array.length; i++) {
					if (i > 0 && array[i].found < array[i - 1].found) {
						position++;
					}
					array[i].position = position;
					if (array[i].deviceId === deviceId) {
						obj.found = array[i].found;
						obj.total = array[i].total;
						obj.position = array[i].position;
					}
				}
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
						errorDebug: 'No valid sessions were found for this device ID - contact support@geoscout.uk'
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