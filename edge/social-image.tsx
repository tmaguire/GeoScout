import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";
// Dictionary list for usernames
const usernameList = [
	'Red', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Amber', 'Orange', 'Pink'
];

export default function handler(req: Request) {
	const url = new URL(req.url);
	const username = url.pathname.length > 7 ? url.pathname.substring(7) : false;
	const useUsername = username ? RegExp(`^(${usernameList.join('|')})-[1-9][0-9][0-9]$`).test(username) : false;
	return new ImageResponse(
		(
			<div
				style={{
					width: '100%',
					height: '100%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexDirection: 'column',
					textAlign: 'center',
					fontSize: 100,
					background: '#7413dc',
					color: 'white'
				}}
			>
				I'm geocaching with GeoScout{useUsername ? ` as ${username}` : ''}<br />🧭🗺️🏆
			</div>
		), {
		emoji: 'fluent'
	}
	)
}