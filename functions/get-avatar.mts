import type { Config } from '@netlify/functions';
import Avatar from 'boring-avatars';
import { CacheHeaders } from 'cdn-cache-control';
import React from 'react';
import { renderToString } from 'react-dom/server';

export default async (request: Request): Promise<Response> => {
	const headers = new CacheHeaders({
		'Content-Type': 'image/svg+xml',
	}).immutable();
	const config = request.url.split('profilePic/')[1].split('/');
	const sizeProvided = config.length >= 2 && config.at(1) !== '';
	console.log(config);
	return new Response(
		renderToString(
			React.createElement(
				Avatar,
				{
					size: sizeProvided ? config.at(1) : 80,
					name: config.at(0),
					variant: 'beam',
					colors: ['#e22e12', '#ffb4e5', '#23a950', '#003982', '#ffe627'],
					square: false,
				},
				null,
			),
		),
		{
			headers,
		},
	);
};

export const config: Config = {
	method: 'GET',
};
