/* jshint esversion: 10 */
// Import JWT module
import {
	sign
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
// Imports for rate limiting
import crypto from 'crypto';
import limiterFactory from 'lambda-rate-limiter';
// JWT authentication
const jwtSecret = process.env.jwtTokenSecret;
const jwtOptions = {
	audience: 'www.geoscout.uk',
	maxAge: '3y',
	issuer: 'api.geoscout.uk',
	algorithm: 'HS384'
};
// Cache for validation
const uuidCache = {};

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

	let uuid;
	let tempToken;

	try {
		uuid = JSON.parse(event.body).uuid;
		const check = new RegExp('^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$');
		if (!check.test(uuid)) {
			return {
				statusCode: 400,
				body: JSON.stringify({
					error: 'Invalid UUID'
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

	if (JSON.parse(event.body).hasOwnProperty('token')) {
		tempToken = JSON.parse(event.body).token;
		if (tempToken === uuidCache[uuid]) {
			delete uuidCache[uuid];
			return client
				.api(``)
				.post({})
				.then(data => { })
				.catch(error => { });
		} else {
			try {
				delete uuidCache[uuid];
			} catch { }
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
	} else {
		const tempToken = Buffer.from(`${crypto.randomUUID()}-${uuid}`, 'ascii').toString('base64');
		uuidCache[uuid] = tempToken;
		return {
			statusCode: 200,
			body: JSON.stringify({
				token: tempToken
			}),
			headers: {
				'Content-Type': 'application/json'
			}
		};
	}
}