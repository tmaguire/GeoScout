/* jshint esversion: 10 */
// Import modules for Google Maps image creation
import {
	signUrl
} from '@googlemaps/url-signature';
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
const deviceListId = process.env.graphUserListId;
const siteId = process.env.graphSiteId;
// Google Maps Secret
const mapsSecret = process.env.mapsSecret;
// Grid reference library
import {
	LatLon
} from 'geodesy/osgridref.js';
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
	let deviceId = false;
	let returnObj;

	try {
		cacheId = JSON.parse(event.body).cache;
		if (!cacheId || cacheId.length !== 3) {
			return {
				statusCode: 400,
				body: JSON.stringify({
					error: 'Invalid cache ID'
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

	return new Promise((resolve, reject) => {
		// Get token (if provided)
		try {
			const authToken = String(event.headers.Authorization).split(' ')[1];
			if (authToken) {
				resolve(verify(authToken, jwtSecret, jwtOptions));
			} else {
				resolve(false);
			}
		} catch (error) {
			reject(error);
		}
	})
		.then(decodedToken => {
			if (decodedToken) {
				deviceId = decodedToken.sub;
			}
			// Get items from list
			return client
				.api(`/sites/${siteId}/lists/${listId}/items?expand=fields(select=Title,W3WLocation,Coordinates,Found,Suspended)&$select=id,fields&filter=fields/Title eq '${cacheId}' and fields/Suspended eq 0`)
				.get();
		})
		.then(data => {

			if (data.hasOwnProperty('error')) {
				throw {
					error: data.error
				};
			}
			const fields = data.value[0].fields;
			returnObj = {
				location: fields.W3WLocation,
				coordinates: fields.Coordinates,
				id: fields.Title,
				image: signUrl(`https://maps.googleapis.com/maps/api/staticmap?center=${fields.Coordinates}&zoom=18&markers=color:0x7413DC|${fields.Coordinates}&size=400x400&scale=2&map_id=6b8e857a992e95a7&key=AIzaSyDoWhwCiUGlBzrTOFxS17QUjBT9-eh46C4`, mapsSecret).href,
				gridRef: new LatLon(Number(String(fields.Coordinates).split(',')[0]), Number(String(fields.Coordinates).split(',')[1])).toOsGrid().toString(),
				stats: fields.Found,
				found: false,
				suspended: fields.Suspended
			};
			return client
				.api(`/sites/${siteId}/lists/${deviceListId}/items?expand=fields(select=Title,FoundCaches)&$select=id,fields&filter=fields/Title eq '${deviceId ? deviceId : ''}'`)
				.get();
		})
		.then(data => {
			if (data.value.length === 0) {
				return returnObj;
			} else if (data.value.length === 1) {
				const found = JSON.parse(data.value[0].fields.FoundCaches);
				found.forEach(cache => {
					if (cache.id === cacheId) {
						returnObj.found = true;
						returnObj.image = signUrl(`https://maps.googleapis.com/maps/api/staticmap?center=${returnObj.coordinates}&zoom=17&markers=color:0x23A950|${returnObj.coordinates}&size=400x400&scale=2&map_id=6b8e857a992e95a7&key=AIzaSyDoWhwCiUGlBzrTOFxS17QUjBT9-eh46C4`, mapsSecret).href;
					}
				});
				return returnObj;
			} else {
				throw 'Duplicate device ID!';
			}
		})
		.then(obj => {
			return {
				statusCode: 200,
				body: JSON.stringify(obj),
				headers
			};
		})
		.catch(error => {
			console.log(error);
			return {
				statusCode: 500,
				body: JSON.stringify({
					error: 'Cache not found',
					errorDebug: error
				}),
				headers
			};
		});
}