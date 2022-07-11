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
// What3Words API
import what3words from '@what3words/api';
import {
	fetchTransport
} from '@what3words/api';
const apiKey = process.env.w3wApiKey;
const config = {
	host: 'https://api.what3words.com',
	apiVersion: 'v3',
};
const transport = fetchTransport();
const w3wService = what3words(apiKey, config, {
	transport
});

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

	let cacheLocation;
	let cacheCode;
	let cacheCoordinates;
	let cacheNumber;
	let requestPin;

	try {
		cacheLocation = JSON.parse(event.body).location;
		cacheCode = JSON.parse(event.body).location;
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

	if (requestPin !== adminPin) {
		return {
			statusCode: 401,
			body: JSON.stringify({
				error: 'Unauthorised'
			}),
			headers: {
				'Content-Type': 'application/json'
			}
		};
	}

	// Get coordinates from W3W
	w3wService.convertToCoordinates({
			words: cacheLocation
		})
		.then(data => {
			cacheCoordinates = `${data.coordinates.lat},${data.coordinates.lng}`;
			return client.api(`/sites/${siteId}/lists/${listId}/items?$expand=fields&$select=id,fields&$orderby=id%20desc&$top=1`)
				.get();
		})
		.then(data => {
			if (data.hasOwnProperty('error')) {
				throw {
					error: data.error
				};
			}
			const currentNumber = Number(data.value[0].fields.Title);
			cacheNumber = String(currentNumber + 1).padStart(3, '0');
			return client.api(`/sites/${siteId}/lists/${listId}/items`)
				.post({
					fields: {
						Title: cacheNumber,
						CableTieCode: Number(cacheCode),
						W3WLocation: cacheLocation,
						Coordinates: cacheCoordinates,
						Found: 0
					}
				});
		})
		.then(() => {
			return {
				statusCode: 200,
				body: JSON.stringify({
					success: `Cache ${cacheNumber} has been added`
				}),
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
					error: 'Unable to check cache code',
					errorDebug: error
				}),
				headers: {
					'Content-Type': 'application/json'
				}
			};
		});
}