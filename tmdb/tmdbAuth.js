import open from 'open';

// Authenticates user to create 15 minute access token for TMDB API actions
// https://developer.themoviedb.org/v4/docs/authentication-user
export const authenticateForTMDB = async () => {

    const TMDB_API_BASE = 'https://api.themoviedb.org/4';
    const TMDB_READ_ACCESS_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

    if (!TMDB_READ_ACCESS_TOKEN) {
        console.error('Missing TMDB_READ_ACCESS_TOKEN in .env file');
        process.exit(1);
    }

    const headers = {
        'Authorization': `Bearer ${TMDB_READ_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    };

    try {
        // 1. Request a request_token
        const reqTokenRes = await fetch(`${TMDB_API_BASE}/auth/request_token`, {
            method: 'POST',
            headers
        });

        if (!reqTokenRes.ok) {
            throw new Error(`Failed to request token: ${reqTokenRes.statusText}`);
        }

        const reqTokenData = await reqTokenRes.json();
        const requestToken = reqTokenData.request_token;

        if (!requestToken) {
            throw new Error(`Failed to get request token. Response: ${JSON.stringify(reqTokenData)}`);
        }

        console.log(`Request token received: ${requestToken}`);

        // 2. Open browser for user to approve
        const approveUrl = `https://www.themoviedb.org/auth/access?request_token=${requestToken}`;
        console.log(`Opening browser for you to approve access: ${approveUrl}`);
        await open(approveUrl);

        // 3. Wait for user confirmation before proceeding
        await promptContinue();

        // 4. Exchange request token for access token
        const accessTokenRes = await fetch(`${TMDB_API_BASE}/auth/access_token`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ request_token: requestToken })
        });

        if (!accessTokenRes.ok) {
            const errorBody = await accessTokenRes.text();
            throw new Error(`TMDB authentication failed to get access token. Status: ${accessTokenRes.status}. Response: ${errorBody}`);
        }

        const accessTokenData = await accessTokenRes.json();

        if (!accessTokenData.access_token) {
            throw new Error(`TMDB authentication failed: No access token returned. Response: ${JSON.stringify(accessTokenData)}`);
        }

        console.log('\n Access token granted!');
        console.log('Your user access token:', accessTokenData.access_token);
        console.log('Account ID:', accessTokenData.account_id);

        // Return token for future API actions
        return accessTokenData;

    } catch (error) {
        console.error('Authentication failed:', error);
        throw new Error(`Authentication failed: ${error.message}`);
    }
}

// Helper function to pause for user approval
const promptContinue = (timeoutMs = 300000) => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            process.stdin.pause();
            reject(new Error('Timed out waiting for user to press ENTER.'));
        }, timeoutMs);

        process.stdin.resume();
        console.log('\nPress ENTER after approving the request token in your browser...');

        process.stdin.once('data', () => {
            clearTimeout(timeout);
            process.stdin.pause();
            resolve();
        });
    });
};