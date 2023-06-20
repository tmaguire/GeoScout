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
const userListId = process.env.graphUserListId;
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

	// Get list items from library
	return client
		.api(`/sites/${siteId}/lists/${userListId}/items?expand=fields(select=Title,Total)&$select=id,fields&$orderby=fields/Total desc,fields/Title`)
		.get()
		.then(data => {
			if (data.value.length === 0) {
				return [];
			} else {
				const array = [];
				data.value.forEach(device => {
					const fields = device.fields;
					array.push({
						deviceId: fields.Title,
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
		.then(array => {
			return {
				statusCode: 200,
				body: JSON.stringify(array),
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
					error: 'Unable to load the leaderboard',
					errorDebug: error
				}),
				headers: {
					'Content-Type': 'application/json'
				}
			};
		});
}