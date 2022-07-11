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
const siteId = process.env.graphSiteId;
// Admin PIN
const adminPin = process.env.adminPin;
// Imports for rate limiting
import crypto from 'crypto';
import limiterFactory from 'lambda-rate-limiter';

// Start Lambda Function
export async function handler(event, context) {
	// Rate limiting configuration to prevent abuse
	const limiter = limiterFactory({
		interval: 6000,
		uniqueTokenPerInterval: 500,
	});
	const ip = crypto.createHash('SHA256').update((event.headers['client-ip'] || event.headers['x-nf-client-connection-ip'])).digest('hex');
	limiter
		.check(10, ip)
		.catch(() => {
			return {
				statusCode: 429,
				body: JSON.stringify({
					error: 'Too many attempts'
				}),
				headers: {
					'Content-Type': 'application/json'
				}
			};
		});

	// Only allow POST
	if (event.httpMethod !== 'POST') {
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

	let cacheW3W;
	let requestPin;

	try {
		cacheW3W = JSON.parse(event.body).location;
		requestPin = JSON.parse(event.body).pin;
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
	return client.api(`/sites/${siteId}/lists/${listId}/items?$expand=fields&$select=id,fields&$orderby=id%20desc&$top=1`)
		.get()
		.then(data => {
			if (data.hasOwnProperty('error')) {
				throw {
					error: data.error
				};
			}
			const currentNumber = Number(data.value[0].fields.Title);
			const newNumber = String(currentNumber + 1).padStart(3, '0');
			return client.api(`/sites/${siteId}/lists/${listId}/items`)
				.post({
					fields: {
						Title: newNumber,

					}
				});
		})
		.then(data => {
			const currentTime = new Date();
			if (data.value.length === 0) {
				return client.api(`/sites/${siteId}/lists/${deviceListId}/items`)
					.post({
						fields: {
							Title: deviceId,
							FoundCaches: JSON.stringify([{
								id: cacheId,
								date: currentTime.toISOString()
							}])
						}
					});
			} else if (data.value.length === 1) {
				const found = [...JSON.parse(data.value[0].fields.FoundCaches)];
				found.push({
					id: cacheId,
					date: currentTime.toISOString()
				});
				return client.api(`/sites/${siteId}/lists/${deviceListId}/items/${data.value[0].id}/fields`)
					.patch({
						FoundCaches: JSON.stringify(found)
					});
			} else {
				throw 'Duplicate device ID!';
			}
		})
		.then(() => {
			return client.api(`/sites/${siteId}/lists/${listId}/items/${currentStats.id}/fields`)
				.patch({
					Found: Number(Number(currentStats.count) + 1)
				});
		})
		.then(() => {
			return {
				statusCode: 200,
				body: JSON.stringify({
					success: `You've found Cache ${cacheId}`
				}),
				headers: {
					'Content-Type': 'application/json'
				}
			};
		})
		.catch(error => {
			console.log(error);
			if (error === 'Invalid code') {
				return {
					statusCode: 403,
					body: JSON.stringify({
						error: error
					}),
					headers: {
						'Content-Type': 'application/json'
					}
				};
			} else {
				return {
					statusCode: 500,
					body: JSON.stringify({
						error: 'Unable to check cache code',
						errorDebug: error
					}),
					headers: {
						'Content-Type': 'application/json'
					}
				};
			}
		});
}