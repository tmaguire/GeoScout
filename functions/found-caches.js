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
const deviceListId = process.env.graphUserListId;
const siteId = process.env.graphSiteId;
// JWT authentication
const jwtSecret = process.env.jwtTokenSecret;
const jwtOptions = {
	audience: 'www.geoscout.uk',
	maxAge: '3y',
	issuer: 'api.geoscout.uk',
	algorithms: 'HS384'
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
			headers: {
				'Content-Type': 'application/json'
			}
		};
	}

	let token;
	let deviceId;

	try {
		token = String(event.headers.Authorization).split(' ')[1];
		if (!token) {
			return {
				statusCode: 401,
				body: JSON.stringify({
					error: 'Missing access token'
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

	return verify(token, jwtSecret, jwtOptions)
		.then(decodedToken => {
			deviceId = decodedToken.sub;
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
		});
}