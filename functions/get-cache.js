/* jshint esversion: 10 */
// Import modules for Google Maps image creation
import crypto from 'crypto';
import {
	URL
} from 'node:url';

function removeWebSafe(safeEncodedString) {
	return safeEncodedString.replace(/-/g, '+').replace(/_/g, '/');
}

function makeWebSafe(encodedString) {
	return encodedString.replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Hash(code) {
	return Buffer.from(code, 'base64');
}

function encodeBase64Hash(key, data) {
	return crypto.createHmac('sha1', key).update(data).digest('base64');
}

function sign(path, secret) {
	const uri = new URL(path);
	const safeSecret = decodeBase64Hash(removeWebSafe(secret));
	const hashedSignature = makeWebSafe(encodeBase64Hash(safeSecret, `${uri.pathname}${uri.search}`));
	return `${uri}&signature=${hashedSignature}`;
}
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
// Google Maps Secret
const mapsSecret = process.env.mapsSecret;

// Start Lambda Function
export async function handler(event, context) {
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

	let cacheGuid;

	try {
		cacheGuid = JSON.parse(event.body).cache;
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
	return client.api(`/sites/${siteId}/lists/${listId}/items?$expand=fields&$select=id,fields&filter=fields/Title eq '${cacheGuid}'`).get()
		.then(data => {
			if (data.hasOwnProperty('error')) {
				throw {
					error: data.error
				};
			}
			const fields = data.value[0].fields;
			return {
				location: fields.W3WLocation,
				coordinates: fields.Coordinates,
				id: fields.Title,
				image: sign(`https://maps.googleapis.com/maps/api/staticmap?center=${fields.Coordinates}&zoom=17&markers=color:0x7413DC|${fields.Coordinates}&size=400x400&scale=2&map_id=6b8e857a992e95a7&key=AIzaSyDoWhwCiUGlBzrTOFxS17QUjBT9-eh46C4`, mapsSecret)
			};
		})
		.then(obj => {
			return {
				statusCode: 200,
				body: JSON.stringify(obj),
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
					error: 'Unable to get caches',
					errorDebug: error
				}),
				headers: {
					'Content-Type': 'application/json'
				}
			};
		});
}