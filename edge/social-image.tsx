import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";

export default function handler(req: Request) {
	const url = new URL(req.url);
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
				I'm geocaching with GeoScout{url.pathname.length > 9 ? ` as ${url.pathname.substring(9)}` : ''}<br />🧭🗺️🏆
			</div>
		), {
		emoji: 'fluent'
	}
	)
}