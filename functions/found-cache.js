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
const listId = process.env.graphSiteListId;
const userListId = process.env.graphUserListId;
const siteId = process.env.graphSiteId;
// Imports for rate limiting
import crypto from 'crypto';
import limiterFactory from 'lambda-rate-limiter';
// JWT authentication
const jwtSecret = process.env.jwtTokenSecret;
const jwtOptions = {
	audience: 'www.geoscout.uk',
	maxAge: '3y',
	issuer: 'api.geoscout.uk',
	algorithms: 'HS384'
};
// Return for all responses
const headers = {
	'Content-Type': 'application/json'
};

// Start Lambda Function
export async function handler(event, context) {
	// Rate limiting configuration to prevent abuse
	const limiter = limiterFactory({
		interval: 6000,
		uniqueTokenPerInterval: 500,
	});
	// Hash IP address before storing it in the limiter (to comply with GDPR)
	const ip = crypto
		.createHash('SHA256')
		.update((event.headers['x-nf-client-connection-ip'] || event.headers['client-ip']))
		.digest('hex');
	limiter
		.check(10, ip)
		.catch((error) => {
			console.log(error);
			return {
				statusCode: 429,
				body: JSON.stringify({
					error: 'Too many attempts',
					errorDebug: 'Please contact support@geoscout.uk if you believe this is a mistake.'
				}),
				headers
			};
		});

	// Only allow POST
	if (event.httpMethod !== 'POST') {
		return {
			statusCode: 405,
			body: JSON.stringify({
				error: 'Method Not Allowed'
			}),
			headers
		};
	}

	let cacheId;
	let cacheCode;
	let userId;
	let token;
	let tokenId;
	let currentStats;

	try {
		cacheId = JSON.parse(event.body).cache;
		cacheCode = JSON.parse(event.body).cacheCode;
		token = String(event.headers.authorization).split(' ')[1];
		const check = new RegExp('^[0-9]{5}$');
		if (!check.test(cacheCode)) {
			return {
				statusCode: 400,
				body: JSON.stringify({
					error: 'Invalid code'
				}),
				headers
			};
		}
		if (!token) {
			return {
				statusCode: 401,
				body: JSON.stringify({
					error: 'Missing required headers'
				}),
				headers
			};
		}
	} catch (error) {
		console.log(error);
		return {
			statusCode: 400,
			body: JSON.stringify({
				error: 'Invalid request'
			}),
			headers
		};
	}

	return verify(token, jwtSecret, jwtOptions)
		.then(decodedToken => {
			userId = decodedToken.sub;
			tokenId = decodedToken.jwtId;
			return client
				.api(`/sites/${siteId}/lists/${listId}/items?expand=fields(select=Title,CableTieCode,Found)&$select=id,fields&filter=fields/Title eq '${cacheId}'`)
				.get();
		})
		.then(data => {
			if (data.value[0].fields.CableTieCode !== String(cacheCode)) {
				throw 'Invalid code';
			}
			currentStats = {
				count: Number(data.value[0].fields.Found),
				id: data.value[0].id
			};
			return client
				.api(`/sites/${siteId}/lists/${userListId}/items?expand=fields(select=Title,FoundCaches,Total,Username)&$select=id,fields&filter=fields/Title eq '${userId}'`)
				.get();
		})
		.then(data => {
			const currentTime = new Date();
			if (data.value.length === 1) {
				const tokenIds = [...JSON.parse(data.value[0].fields.Username)];
				if (tokenIds.find(id => id === tokenId)) {
					const found = [...JSON.parse(data.value[0].fields.FoundCaches)];
					found.forEach(entry => {
						if (entry.id === cacheId) {
							throw 'Duplicate entry';
						}
					});
					found.push({
						id: cacheId,
						date: currentTime.toISOString()
					});
					return client
						.api(`/sites/${siteId}/lists/${userListId}/items/${data.value[0].id}/fields`)
						.patch({
							FoundCaches: JSON.stringify(found),
							Total: Number(Number(data.value[0].fields.Total) + 1)
						});
				} else {
					throw 'Invalid User ID';
				}
			} else {
				throw 'Invalid User ID';
			}
		})
		.then(() => {
			return client
				.api(`/sites/${siteId}/lists/${listId}/items/${currentStats.id}/fields`)
				.patch({
					Found: Number(Number(currentStats.count) + 1)
				});
		})
		.then(() => {
			return {
				statusCode: 200,
				body: JSON.stringify({
					success: `You've found Cache ${cacheId}!`
				}),
				headers
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
					headers
				};
			} else if (error === 'Invalid User ID') {
				return {
					statusCode: 401,
					body: JSON.stringify({
						error: 'Unable to validate your User ID',
						errorDebug: 'Token not found in backend - contact support@geoscout.uk'
					}),
					headers
				};
			} else if (error === 'Duplicate entry') {
				return {
					statusCode: 403,
					body: JSON.stringify({
						error: "You've already found this cache!",
						errorDebug: 'Your User ID has already found this cache - contact support@geoscout.uk if you believe this is an error'
					}),
					headers
				};
			} else {
				return {
					statusCode: 500,
					body: JSON.stringify({
						error: 'Unable to check cache code',
						errorDebug: error
					}),
					headers
				};
			}
		});
}