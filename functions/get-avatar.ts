import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import Avatar from 'boring-avatars';
import React from 'react';
import { renderToString } from 'react-dom/server';
// Start Lambda Function
export async function handler(event: HandlerEvent): Promise<HandlerResponse> {
	const config = String(event.path).split('/');
	console.log(config);
	return {
		statusCode: 200,
		body: renderToString(
			React.createElement(
				Avatar,
				{
					size: config[3] || 80,
					name: config[2],
					variant: 'beam',
					colors: ['#e22e12', '#ffb4e5', '#23a950', '#003982', '#ffe627'],
					square: false,
				},
				null,
			),
		),
		headers: {
			'Content-Type': 'image/svg+xml',
			'Netlify-CDN-Cache-Control':
				'public, durable, max-age=60, stale-while-revalidate=120',
		},
	};
}
