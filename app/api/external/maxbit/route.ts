
import { NextRequest, NextResponse } from 'next/server';
import CryptoJS from 'crypto-js';

export const dynamic = 'force-dynamic';

const MAXBIT_BASE_URL = process.env.MAXBIT_BASE_URL || 'https://www.maxbit.com'; // Fallback, must be updated
const API_KEY = process.env.MAXBIT_API_KEY;
const SECRET_KEY = process.env.MAXBIT_SECRET_KEY;

export async function GET(request: NextRequest) {
    if (!API_KEY || !SECRET_KEY) {
        return NextResponse.json({ error: 'Maxbit API credentials not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path'); // e.g., /api/v2/account/balances

    if (!path) {
        return NextResponse.json({ error: 'Path parameter is required' }, { status: 400 });
    }

    // Prepare parameters
    const timestamp = Date.now().toString();
    const params: Record<string, string> = {
        timestamp: timestamp,
        // Add other query params from the request if needed
        // ...Object.fromEntries(searchParams.entries())
    };

    // Remove 'path' from params to sign
    delete (params as any)['path'];

    // Construct query string for signing (alphabetical order usually required, but script didn't sort?)
    // The user's script: Object.keys(paramsObject).map...
    // It doesn't explicitly sort. But usually signature requires sorted keys. 
    // The script map uses Object.keys() which is insertion order for strings (mostly).
    // Let's assume we just sign the params we add.

    // Add any other params passed in request (excluding 'path')
    searchParams.forEach((value, key) => {
        if (key !== 'path') {
            params[key] = value;
        }
    });

    // Create Query String
    const queryString = Object.keys(params)
        .map(key => `${key}=${params[key]}`)
        .join('&');

    // Generate Signature
    const signature = CryptoJS.HmacSHA256(queryString, SECRET_KEY).toString(CryptoJS.enc.Hex);

    // Final URL
    const finalUrl = `${MAXBIT_BASE_URL}${path}?${queryString}&signature=${signature}`;

    try {
        const response = await fetch(finalUrl, {
            method: 'GET',
            headers: {
                'X-Maxbit-API-Key': API_KEY, // Assuming this header name
                'Content-Type': 'application/json',
                // 'api-key': API_KEY // Alternative header
            },
        });

        const data = await response.json();

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('Maxbit API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch from Maxbit' }, { status: 500 });
    }
}
