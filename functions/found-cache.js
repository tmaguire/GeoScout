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
// Imports for rate limiting
import crypto from 'crypto';
import limiterFactory from 'lambda-rate-limiter';
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
// Import validator for IPv4
import {
	isIPv4
} from 'net';

// Start Lambda Function
export async function handler(event, context) {
	// Rate limiting configuration to prevent abuse
	const limiter = limiterFactory({
		interval: 6000,
		uniqueTokenPerInterval: 500,
	});
	const ipCheck = isIPv4(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip']);
	const ip = crypto.createHash('SHA256').update((event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'])).digest('hex');
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

	let cacheId;
	let cacheCode;
	let deviceId;
	let requestId;
	let currentStats;

	try {
		cacheId = JSON.parse(event.body).cache;
		cacheCode = JSON.parse(event.body).cacheCode;
		deviceId = event.headers['device-id'];
		requestId = event.headers['request-id'];
		const check = new RegExp('^[0-9]{5}$');
		if (!check.test(cacheCode)) {
			return {
				statusCode: 400,
				body: JSON.stringify({
					error: 'Invalid code'
				}),
				headers: {
					'Content-Type': 'application/json'
				}
			};
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
			let sessionIp;
			let requestIp;
			try {
				sessionIp = sessionData.visits[0].ip;
				requestIp = crypto.createHash('SHA256').update(sessionIp).digest('hex');
			} catch {
				throw 'Session mismatch';
			}
			if (ipCheck) {
				if (requestIp === ip) {
					return true;
				} else {
					throw 'Session mismatch';
				}
			} else {
				console.log('IPv6 - unable to validate (at the moment)');
				return true;
			}
		})
		.then(() => {
			return client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields(select=Title,CableTieCode,Found)&$select=id,fields&filter=fields/Title eq '${cacheId}'`)
				.get();
		})
		.then(data => {
			if (data.hasOwnProperty('error')) {
				throw {
					error: data.error
				};
			}
			if (data.value[0].fields.CableTieCode !== String(cacheCode)) {
				throw 'Invalid code';
			}
			currentStats = {
				count: Number(data.value[0].fields.Found),
				id: data.value[0].id
			};

			return client.api(`/sites/${siteId}/lists/${deviceListId}/items?expand=fields(select=Title,FoundCaches,Total)&$select=id,fields&filter=fields/Title eq '${deviceId}'`)
				.get();
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
							}]),
							Total: 1
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
						FoundCaches: JSON.stringify(found),
						Total: Number(Number(data.value[0].fields.Total) + 1)
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
			} else if (error === 'Session mismatch') {
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