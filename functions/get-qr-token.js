/* jshint esversion: 10 */
// Import JWT module
import {
	sign,
	verify
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
import awsLimit from 'lambda-rate-limiter';
// Rate limiting configuration to prevent abuse
const rateLimit = awsLimit({
	// Set 1 minute interval
	interval: 60 * 1000
}).check;
// Import for QR code generation
import QRCode from 'qrcode';
// JWT authentication
const jwtSecret = process.env.jwtTokenSecret;
const jwtVerifyOptions = {
	audience: 'www.geoscout.uk',
	maxAge: '3y',
	issuer: 'api.geoscout.uk',
	algorithm: 'HS384'
};
const jwtSignOptions = {
	audience: 'qr.geoscout.uk',
	expiresIn: '1h',
	issuer: 'api.geoscout.uk',
	algorithm: 'HS256'
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

	let accessToken;
	let uuid;
	let userId;
	let accessTokenId;
	let recordId;
	let backupTokenId;
	let backupTokenIds;
	let returnToken;

	try {
		uuid = JSON.parse(event.body).uuid;
		accessToken = String(event.headers.authorization).split(' ')[1];
		if (!isUUID(uuid)) {
			return {
				statusCode: 400,
				body: JSON.stringify({
					error: 'Invalid UUID'
				}),
				headers
			};
		}
		if (!accessToken || accessToken === '') {
			return {
				statusCode: 401,
				body: JSON.stringify({
					error: 'Access denied'
				}),
				headers
			};
		}
	} catch (error) {
		console.warn(error);
		return {
			statusCode: 400,
			body: JSON.stringify({
				error: 'Invalid request'
			}),
			headers
		};
	}

	// Generate hash for current IP + UUID (stored in limiter)
	const uniqueToken = crypto
		.createHash('SHA256')
		.update(`${(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'])}-${uuid}`)
		.digest('hex');
	try {
		// Limit to 1 attempt per IP/per UUID (prevent replay attack)
		await rateLimit(1, uniqueToken);
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

	// Validate current token
	return verify(accessToken, jwtSecret, jwtVerifyOptions)
		.then(decodedToken => {
			userId = decodedToken.sub;
			accessTokenId = decodedToken.jwtId;
			recordId = decodedToken.oid;
			return client
				// .api(`/sites/${siteId}/lists/${userListId}/items/${recordId}?$expand=fields($select=Title,FoundCaches,Total,Username,BackupTokenIDs)&$select=id,fields&$filter=fields/Title eq '${userId}'`)
				.api(`/sites/${siteId}/lists/${userListId}/items/${recordId}?$expand=fields($select=Title,FoundCaches,Total,Username,BackupTokenIDs)&$select=id,fields&$top=3000`)
				.header('Prefer','allowthrottleablequeries')
				.get();
		})
		.then(data => {
			if (data.hasOwnProperty('fields')) {
				const tokenIds = [...JSON.parse(data.fields.Username)];
				if (tokenIds.find(id => id === accessTokenId)) {
					backupTokenId = `qr-${crypto
						.createHash('SHA256')
						.update(Buffer.from(`${crypto.randomUUID()}-${uuid}`, 'ascii').toString('base64'))
						.digest('hex')}`;
					backupTokenIds = [...JSON.parse(data.fields.BackupTokenIDs)];
					backupTokenIds.push(backupTokenId);
					return sign({
						sub: userId,
						oid: recordId,
						jwtId: backupTokenId
					}, jwtSecret, jwtSignOptions);
				} else {
					throw 'Invalid User ID';
				}
			} else {
				throw 'Invalid User ID';
			}
		})
		.then(jwt => {
			returnToken = jwt;
			return client.api(`/sites/${siteId}/lists/${userListId}/items/${recordId}/fields`)
				.patch({
					BackupTokenIDs: JSON.stringify(backupTokenIds)
				});
		})
		.then(() => {
			return QRCode.toString(returnToken, {
				type: 'svg'
			});
		})
		.then(token => {
			return {
				statusCode: 201,
				body: JSON.stringify({
					token
				}),
				headers
			};
		})
		.catch(error => {
			console.warn(error);
			return {
				statusCode: 500,
				body: JSON.stringify({
					error: 'Unable to generate QR token',
					errorDebug: error
				}),
				headers
			};
		});
}