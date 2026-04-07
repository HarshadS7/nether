import { NextResponse } from 'next/server';
import { createAuth } from 'auth-xyz';

// We initialize auth outside the request handler so it can be reused
let auth: any;

async function getAuth() {
    if (!auth) {
        auth = await createAuth({
            google: {
                clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'dummy_google_id',
            },
            github: {
                clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || 'dummy_github_id',
            },
            mode: 'jwt',
            jwt: {
                secret: process.env.JWT_SECRET || 'super-secret-key',
                expiresIn: '7d',
            },
        });
    }
    return auth;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { provider, idToken, code } = body;

        let requestForAuth = { body: { provider } } as any;
        let originalGithubToken = null;

        if (provider === 'google') {
            if (!idToken) {
                return NextResponse.json({ error: 'Missing idToken for Google authentication' }, { status: 400 });
            }
            requestForAuth.body.idToken = idToken;
        } else if (provider === 'github') {
            if (!code) {
                return NextResponse.json({ error: 'Missing code for GitHub authentication' }, { status: 400 });
            }

            // Exchange GitHub code for access token using client secret that stays on the backend
            const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
                    client_secret: process.env.GITHUB_CLIENT_SECRET,
                    code,
                }),
            });

            const tokenData = await tokenResponse.json();

            if (tokenData.error) {
                return NextResponse.json({ error: tokenData.error_description || tokenData.error }, { status: 400 });
            }

            originalGithubToken = tokenData.access_token;
            requestForAuth.body.accessToken = tokenData.access_token;
        } else {
            return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
        }

        const authInstance = await getAuth();
        const result = await authInstance.authenticate(requestForAuth);

        // Return the response, passing the raw github token back to frontend to fetch repos
        return NextResponse.json({
            success: true,
            user: result.user,
            token: result.token,
            githubToken: originalGithubToken
        });
    } catch (error: any) {
        console.error('Authentication Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Authentication failed',
            message: error.message
        }, { status: 401 });
    }
}
