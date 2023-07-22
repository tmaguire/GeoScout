/* jshint esversion: 10 */
// Import JWT module
import {
	sign
} from 'jwt-promisify';
// Import Fetch (Isomorphic Fetch)
import 'isomorphic-fetch';
// Validation module
import isUUID from 'validator/es/lib/isUUID';
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
// Imports for rate limiting
import crypto from 'crypto';
import limiterFactory from 'lambda-rate-limiter';
// JWT authentication
const jwtSecret = process.env.jwtTokenSecret;
const jwtOptions = {
	audience: 'www.geoscout.uk',
	expiresIn: '3y',
	issuer: 'api.geoscout.uk',
	algorithm: 'HS384'
};
// Cache for validation
const uuidCache = {};
// Return for all responses
const headers = {
	'Content-Type': 'application/json'
};
// Dictionary list for usernames
const usernameList = [
	'Red', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Amber', 'Orange', 'Pink'
];

// Start Lambda Function
export async function handler(event, context) {
	console.log(uuidCache);
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

	let uuid;

	try {
		uuid = JSON.parse(event.body).uuid;
		if (!isUUID(uuid)) {
			return {
				statusCode: 400,
				body: JSON.stringify({
					error: 'Invalid UUID'
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

	if (JSON.parse(event.body).hasOwnProperty('token')) {
		const tempToken = JSON.parse(event.body).token;
		let itemId;
		let accessToken;
		if (tempToken === uuidCache[uuid]) {
			delete uuidCache[uuid];
			return client
				.api(`/sites/${siteId}/lists/${userListId}/items`)
				.post({
					fields: {
						Title: `${usernameList[crypto.randomInt(usernameList.length)]}-${crypto.randomInt(100, 999)}`
					}
				})
				.then(data => {
					itemId = data.id;
					return sign({
						sub: data.fields.Title,
						oid: data.id,
						jwtId: tempToken,
					}, jwtSecret, jwtOptions);
				})
				.then(jwt => {
					accessToken = jwt;
					return client
						.api(`/sites/${siteId}/lists/${userListId}/items/${itemId}/fields`)
						.patch({
							Username: JSON.stringify([tempToken])
						});
				})
				.then(() => {
					return {
						statusCode: 200,
						body: JSON.stringify({
							accessToken
						}),
						headers
					};
				})
				.catch(error => {
					console.warn(error);
					return {
						statusCode: 500,
						body: JSON.stringify({
							error: 'Unable to generate an account for this device',
							errorDebug: error
						})
					};
				});
		} else {
			try {
				delete uuidCache[uuid];
			} catch { }
			return {
				statusCode: 400,
				body: JSON.stringify({
					error: 'Invalid request'
				}),
				headers
			};
		}
	} else {
		const tempToken = Buffer.from(`${crypto.randomUUID()}-${uuid}`, 'ascii').toString('base64');
		uuidCache[uuid] = tempToken;
		return {
			statusCode: 200,
			body: JSON.stringify({
				token: tempToken
			}),
			headers
		};
	}
}