import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const size = {
    width: 512,
    height: 512,
};
export const contentType = 'image/png';

// Image generation
export default function Icon() {
    return new ImageResponse(
        (
            // ImageResponse JSX element
            <div
                style={{
                    fontSize: 320,
                    background: '#39ff14', // Neon Lime
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'black',
                    fontFamily: 'sans-serif',
                    fontWeight: 900,
                    borderRadius: 0, // Icons usually square, OS crops them. Or we can round.
                    // Let's keep square for max compatibility, or slight rounding.
                }}
            >
                <div style={{ marginTop: -20 }}>B</div>
            </div>
        ),
        // ImageResponse options
        {
            ...size,
        }
    );
}
