/* jshint esversion:10 */
// Modules to handle avatar generation
import React from 'react';
import {
	renderToString
} from 'react-dom/server';
import Avatar from 'boring-avatars';
import {
	builder
} from '@netlify/functions';

// Start Lambda Function
async function handler(event, context) {
	const config = String(event.path).split('/');
	console.log(config);
	return {
		statusCode: 200,
		body: renderToString(
			React.createElement(Avatar, {
				size: (config[3] || 80),
				name: config[2],
				variant: 'beam',
				colors: '#e22e12,#ffb4e5,#23a950,#003982,#ffe627'.split(','),
				square: false
			}, null)
		),
		headers: {
			'Content-Type': 'image/svg+xml'
		}
	};

}

exports.handler = builder(handler);