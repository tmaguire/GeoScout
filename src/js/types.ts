import type { TDataObjectRow } from 'gridjs/dist/src/types.js';
import type { JwtPayload } from 'jsonwebtoken';

export interface GeoScoutCache extends TDataObjectRow {
	coordinates: string;
	polygon: string;
	image: string;
	found: boolean;
	location: string;
	id: string;
	gridRef: string;
	stats: number;
	suspended: boolean;
}

export interface GeoScoutCaches {
	caches: GeoScoutCache[];
}

export interface GeoScoutToken extends JwtPayload {
	sub: string;
	oid: string;
	jwtId: string;
	iat: number;
	exp: number;
	aud: string;
	iss: string;
}

export interface SharePointCacheRecord {
	id: string;
	fields: {
		Title: string;
		W3WLocation: string;
		Coordinates: string;
		Polygon: string;
		Found: number;
		Suspended: boolean;
		CableTieCode: string;
	};
}

export interface SharePointUserRecord {
	fields: {
		Title: string;
		FoundCaches: string;
		Total: number;
		Username: string;
		BackupTokenIDs: string;
		BackupBanner_x003f_: boolean;
	};
}

export interface FoundCache extends TDataObjectRow {
	id: string;
	date: string;
}

export interface LeaderboardRecord extends TDataObjectRow {
	userId: string;
	found: number;
	lastUpdate: string;
	position?: number;
}

export interface BackupToken {
	token: string;
	name: string;
}

export interface CurrentStats {
	count: number;
	id: string;
}

export interface FoundCaches extends TDataObjectRow {
	found: FoundCache[];
	total: number;
	position: number;
	backupOffer: boolean;
	userId: string;
}

export interface SharePointBatchResponse {
	responses: [
		{
			id: 'user' | 'caches';
			status: number;
			body: {
				value: SharePointUserRecord[] | SharePointCacheRecord[];
				error?: string;
			};
		},
	];
	error?: string;
}

export interface AccessTokenResponse {
	accessToken: string;
}

export interface AccessTokenChallengeResponse {
	token: string;
}

export interface ErrorResponse {
	error: string;
	errorDebug?: string;
}
