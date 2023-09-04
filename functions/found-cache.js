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
import awsLimit from 'lambda-rate-limiter';
// Rate limiting configuration to prevent abuse
const rateLimit = awsLimit({
	// Set 1 minute interval
	interval: 60 * 1000
}).check;
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
	let recordId;
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
		if (!token || token === '') {
			return {
				statusCode: 401,
				body: JSON.stringify({
					error: 'Access denied'
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

	// Generate hash for current IP + Cache ID (stored in limiter)
	const uniqueToken = crypto
		.createHash('SHA256')
		.update(`${(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'])}-${cacheId}`)
		.digest('hex');
	try {
		// Limit to 3 attempts per minute/per cache
		await rateLimit(3, uniqueToken);
	} catch (error) {
		// If exceeds rate limit, return 429 (too many attempts)
		console.warn(error);
		return {
			statusCode: 429,
			body: JSON.stringify({
				error: 'Too many attempts',
				errorDebug: 'Please contact support@geoscout.uk if you believe this is a mistake.'
			}),
			headers
		};
	}

	return verify(token, jwtSecret, jwtOptions)
		.then(decodedToken => {
			userId = decodedToken.sub;
			tokenId = decodedToken.jwtId;
			recordId = decodedToken.oid;
			return client
				// .api(`/sites/${siteId}/lists/${listId}/items?$expand=fields($select=Title,CableTieCode,Found)&$select=id,fields&$filter=fields/Title eq '${cacheId}'`)
				.api(`/sites/${siteId}/lists/${listId}/items?$expand=fields($select=Title,CableTieCode,Found)&$select=id,fields`)
				.header('Prefer','allowthrottleablequeries')
				.get();
		})
		.then(data => {
			const cacheRecord = data.value.find(record => record.fields.Title === cacheId);
			if (cacheRecord) {
				if (cacheRecord.fields.CableTieCode !== String(cacheCode)) {
					throw 'Invalid code';
				}
				currentStats = {
					count: Number(cacheRecord.fields.Found),
					id: cacheRecord.id
				};
				return client
					// .api(`/sites/${siteId}/lists/${userListId}/items/${recordId}?$expand=fields($select=Title,FoundCaches,Total,Username)&$select=id,fields&$filter=fields/Title eq '${userId}'`)
					.api(`/sites/${siteId}/lists/${userListId}/items/${recordId}?$expand=fields($select=Title,FoundCaches,Total,Username)&$select=id,fields`)
					.header('Prefer','allowthrottleablequeries')
					.get();
			} else {
				throw 'Invalid cache';
			}
		})
		.then(data => {
			if (data.hasOwnProperty('fields')) {
				const currentTime = new Date();
				const tokenIds = [...JSON.parse(data.fields.Username)];
				if (tokenIds.find(id => id === tokenId)) {
					const found = [...JSON.parse(data.fields.FoundCaches)];
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
						.api(`/sites/${siteId}/lists/${userListId}/items/${recordId}/fields`)
						.patch({
							FoundCaches: JSON.stringify(found),
							Total: Number(Number(data.fields.Total) + 1)
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
					success: `You've found cache ${cacheId}!`
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
						error
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
						errorDebug: 'Your User ID has already found this cache - contact support@geoscout.uk if you believe this is incorrect'
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