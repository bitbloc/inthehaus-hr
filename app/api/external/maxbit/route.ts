
import { NextRequest, NextResponse } from 'next/server';
import CryptoJS from 'crypto-js';

export const dynamic = 'force-dynamic';

const MAXBIT_BASE_URL = process.env.MAXBIT_BASE_URL || 'https://www.maxbit.com';
const API_KEY = process.env.MAXBIT_API_KEY;
const SECRET_KEY = process.env.MAXBIT_SECRET_KEY;

export async function GET(request: NextRequest) {
    console.log('[Maxbit API] Starting request');
    console.log('[Maxbit API] Config - Base URL:', MAXBIT_BASE_URL);
    console.log('[Maxbit API] Config - API Key:', API_KEY ? 'Set' : 'Missing');
    console.log('[Maxbit API] Config - Secret Key:', SECRET_KEY ? 'Set' : 'Missing');

    if (!API_KEY || !SECRET_KEY) {
        console.error('[Maxbit API] ❌ Credentials missing');
        return NextResponse.json({ error: 'Maxbit API credentials not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path'); // e.g., /api/v2/account/balances
    console.log('[Maxbit API] Requested path:', path);

    if (!path) {
        return NextResponse.json({ error: 'Path parameter is required' }, { status: 400 });
    }

    // Prepare parameters
    const timestamp = Date.now().toString();
    const params: Record<string, string> = {
        timestamp: timestamp,
    };

    // Remove 'path' from params to sign
    delete (params as any)['path'];

    // Add any other params passed in request (excluding 'path')
    searchParams.forEach((value, key) => {
        if (key !== 'path') {
            params[key] = value;
        }
    });

    // Create Query String (Sorted as per standard practice, though original script didn't explicit sort)
    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys
        .map(key => `${key}=${params[key]}`)
        .join('&');

    console.log('[Maxbit API] Query string:', queryString);

    // Generate Signature
    const signature = CryptoJS.HmacSHA256(queryString, SECRET_KEY).toString(CryptoJS.enc.Hex);
    console.log('[Maxbit API] Signature generated');

    // Final URL
    const finalUrl = `${MAXBIT_BASE_URL}${path}?${queryString}&signature=${signature}`;
    console.log('[Maxbit API] Final URL:', finalUrl);

    try {
        const response = await fetch(finalUrl, {
            method: 'GET',
            headers: {
                'X-Maxbit-API-Key': API_KEY, // header might be differennt
                'Content-Type': 'application/json',
                // 'api-key': API_KEY 
            },
        });

        console.log('[Maxbit API] Upstream Response Status:', response.status);

        const rawText = await response.text();
        console.log('[Maxbit API] Upstream Response Body:', rawText);

        try {
            const data = JSON.parse(rawText);
            return NextResponse.json(data, { status: response.status });
        } catch (e) {
            console.error('[Maxbit API] ❌ Failed to parse JSON response');
            return NextResponse.json({ error: 'Invalid JSON response from Maxbit', raw: rawText }, { status: 502 });
        }

    } catch (error) {
        console.error('[Maxbit API] ❌ Fatal Fetch Error:', error);
        return NextResponse.json({ error: 'Failed to fetch from Maxbit', details: String(error) }, { status: 500 });
    }
}
