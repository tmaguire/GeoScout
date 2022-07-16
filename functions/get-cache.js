/* jshint esversion: 10 */
// Import modules for Google Maps image creation
import {
	signUrl
} from '@googlemaps/url-signature';
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
// Google Maps Secret
const mapsSecret = process.env.mapsSecret;
// Grid reference library
import {
	LatLon
} from 'geodesy/osgridref.js';

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

	let cacheId;
	let deviceId;
	let returnObj;

	try {
		cacheId = JSON.parse(event.body).cache;
		deviceId = event.headers['device-id'];
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
	return client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields(select=Title,W3WLocation,Coordinates,Found)&$select=id,fields&filter=fields/Title eq '${cacheId}'`)
		.get()
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
				image: signUrl(`https://maps.googleapis.com/maps/api/staticmap?center=${fields.Coordinates}&zoom=17&markers=color:0x7413DC|${fields.Coordinates}&size=400x400&scale=2&map_id=6b8e857a992e95a7&key=AIzaSyDoWhwCiUGlBzrTOFxS17QUjBT9-eh46C4`, mapsSecret).href,
				gridRef: new LatLon(Number(String(fields.Coordinates).split(',')[0]), Number(String(fields.Coordinates).split(',')[1])).toOsGrid().toString(),
				stats: fields.Found,
				found: false
			};
			return client.api(`/sites/${siteId}/lists/${deviceListId}/items?expand=fields(select=Title,FoundCaches)&$select=id,fields&filter=fields/Title eq '${deviceId}'`)
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
					error: 'Cache not found',
					errorDebug: error
				}),
				headers: {
					'Content-Type': 'application/json'
				}
			};
		});
}