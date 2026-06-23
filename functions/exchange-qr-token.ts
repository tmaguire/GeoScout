// Import JWT module
import { SignOptions, sign, VerifyOptions, verify } from 'jsonwebtoken';
// Import Fetch (Isomorphic Fetch)
import 'isomorphic-fetch';

// Microsoft Graph API details
const clientId = process.env.graphClientId as string;
const tenantId = process.env.tenantId as string;

import { ClientCertificateCredential } from '@azure/identity';
// Graph SDK Preparation
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import path from 'path';

const credential = new ClientCertificateCredential(tenantId, clientId, {
	certificatePath: path.join(__dirname, 'cert.pem'),
	certificatePassword: process.env.graphCertKey,
});
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
	scopes: ['.default'],
});
const client = Client.initWithMiddleware({
	debugLogging: true,
	authProvider: authProvider,
});
// SharePoint Site Details
const userListId = process.env.graphUserListId as string;
const siteId = process.env.graphSiteId as string;

import { HandlerEvent, HandlerResponse } from '@netlify/functions';
// Imports for rate limiting
import crypto from 'crypto';
import awsLimit from 'lambda-rate-limiter';
import { GeoScoutToken } from '../src/js/types';

// Rate limiting configuration to prevent abuse
const rateLimit = awsLimit({
	// Set 1 minute interval
	interval: 60 * 1000,
}).check;
// JWT authentication
const jwtSecret = process.env.jwtTokenSecret as string;
const jwtVerifyOptions: VerifyOptions = {
	audience: 'qr.geoscout.uk',
	maxAge: '1h',
	issuer: 'api.geoscout.uk',
	algorithms: ['HS256'],
};
const jwtSignOptions: SignOptions = {
	audience: 'www.geoscout.uk',
	expiresIn: '3y',
	issuer: 'api.geoscout.uk',
	algorithm: 'HS384',
};
// Return for all responses
const headers = {
	'Content-Type': 'application/json',
};

// Start Lambda Function
export async function handler(event: HandlerEvent): Promise<HandlerResponse> {
	// Only allow POST
	if (event.httpMethod !== 'POST') {
		return {
			statusCode: 405,
			body: JSON.stringify({
				error: 'Method Not Allowed',
			}),
			headers,
		};
	}

	let backupToken;
	let uuid;
	let userId: string;
	let backupTokenId: string;
	let backupTokenIds: string[];
	let recordId: string;
	let accessTokenId;
	let accessTokenIds: string[];
	let returnToken: string;

	try {
		backupToken = String(event.headers.authorization).split(' ')[1];
		if (!backupToken || backupToken === '') {
			return {
				statusCode: 401,
				body: JSON.stringify({
					error: 'Access denied',
				}),
				headers,
			};
		}
	} catch (error) {
		console.warn(error);
		return {
			statusCode: 400,
			body: JSON.stringify({
				error: 'Invalid request',
			}),
			headers,
		};
	}

	// Generate hash for current IP + UUID (stored in limiter)
	const uniqueToken = crypto
		.createHash('SHA256')
		.update(
			`${event.headers['x-nf-client-connection-ip'] || event.headers['client-ip']}`,
		)
		.digest('hex');
	try {
		// Limit to 5 attempts per IP (prevent abuse)
		await rateLimit(5, uniqueToken);
	} catch (error) {
		// If exceeds rate limit, return 429 (too many attempts)
		console.warn(error);
		return {
			statusCode: 429,
			body: JSON.stringify({
				error: 'Too many attempts',
				errorDebug:
					'Please contact support@geoscout.uk if you believe this is a mistake.',
			}),
			headers,
		};
	}

	// Validate exchange token
	return new Promise<GeoScoutToken>((resolve) => {
		resolve(verify(backupToken, jwtSecret, jwtVerifyOptions) as GeoScoutToken);
	})
		.then((decodedToken) => {
			userId = decodedToken.sub;
			backupTokenId = decodedToken.jwtId;
			recordId = decodedToken.oid;
			return client
				.api(
					`/sites/${siteId}/lists/${userListId}/items/${recordId}?$expand=fields($select=Title,FoundCaches,Total,Username,BackupTokenIDs)&$select=id,fields&$filter=fields/Title eq '${userId}'`,
				)
				.header('Prefer', 'allowthrottleablequeries')
				.get();
		})
		.then((data) => {
			if (data.hasOwnProperty('fields')) {
				const tempArray: string[] = [...JSON.parse(data.fields.BackupTokenIDs)];
				if (tempArray.find((id) => id === backupTokenId)) {
					backupTokenIds = tempArray.filter((item) => item !== backupTokenId);
					accessTokenId = crypto
						.createHash('SHA256')
						.update(
							Buffer.from(`${crypto.randomUUID()}-${uuid}`, 'ascii').toString(
								'base64',
							),
						)
						.digest('hex');
					accessTokenIds = [...JSON.parse(data.fields.Username)];
					accessTokenIds.push(accessTokenId);
					return sign(
						{
							sub: userId,
							oid: recordId,
							jwtId: accessTokenId,
						},
						jwtSecret,
						jwtSignOptions,
					);
				} else {
					throw 'Invalid User ID';
				}
			} else {
				throw 'Invalid User ID';
			}
		})
		.then((jwt) => {
			returnToken = jwt;
			return client
				.api(`/sites/${siteId}/lists/${userListId}/items/${recordId}/fields`)
				.patch({
					Username: JSON.stringify(accessTokenIds),
					BackupTokenIDs: JSON.stringify(backupTokenIds),
				});
		})
		.then(() => {
			return {
				statusCode: 201,
				body: JSON.stringify({
					accessToken: returnToken,
				}),
				headers,
			};
		})
		.catch((error) => {
			console.warn(error);
			return {
				statusCode: 500,
				body: JSON.stringify({
					error:
						'Unable to use this QR code, please generate a new one to scan',
					errorDebug: error,
				}),
				headers,
			};
		});
}
