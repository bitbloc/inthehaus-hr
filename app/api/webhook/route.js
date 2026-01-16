import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const signature = request.headers.get('x-line-signature');

    // Forward to Supabase Function
    const response = await fetch('https://lxfavbzmebqqsffgyyph.supabase.co/functions/v1/line-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signature || '',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`Supabase function error: ${response.status} ${response.statusText}`);
      // return success to LINE to avoid retries even if our backend failed
      return NextResponse.json({ success: true, forwarded: false });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("Webhook Proxy Error:", error);
    // Always return 200 to LINE to prevent retries
    return NextResponse.json({ success: false }, { status: 200 });
  }
}