// tmdb/tmdbAuth.js
import open from 'open'; // Used to open the TMDB authorization URL in the user's browser.

// Define a prefix for logs originating from this module for easier debugging.
const LOG_PREFIX = "[TMDBAuth]";

/**
 * Handles the TMDB v4 user authentication flow to obtain a user-specific access token.
 * This process involves:
 * 1. Requesting a temporary `request_token` from TMDB using the app's read access token.
 * 2. Opening a URL in the user's browser for them to approve the application's access.
 * 3. Pausing script execution until the user confirms approval (by pressing ENTER).
 * 4. Exchanging the approved `request_token` for a short-lived user `access_token` and `account_id`.
 *
 * Requires `TMDB_READ_ACCESS_TOKEN` to be set in the environment variables.
 * See: https://developer.themoviedb.org/v4/docs/authentication-user
 *
 * @async
 * @function authenticateForTMDB
 * @returns {Promise<object>} A promise that resolves with an object containing the user's
 * `access_token` and `account_id` upon successful authentication.
 * Example: `{ success: true, access_token: "user_access_token_here", account_id: "user_account_id_here" }`
 * @throws {Error} If authentication fails at any step (e.g., missing read access token,
 * API errors, token exchange failure, user approval timeout).
 */
export const authenticateForTMDB = async () => {
    // Base URL for TMDB API v4. Could be moved to config.js if not already there.
    const TMDB_API_BASE_V4 = 'https://api.themoviedb.org/4';
    const TMDB_APP_READ_ACCESS_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

    // Critical check: Ensure the application's read access token is available.
    if (!TMDB_APP_READ_ACCESS_TOKEN) {
        console.error(`${LOG_PREFIX} ERROR: Missing TMDB_READ_ACCESS_TOKEN in .env file. This token is required to initiate authentication.`);
        process.exit(1); // Exit if the token is not configured, as authentication cannot proceed.
    }

    // Standard headers for TMDB v4 API requests using the app's read access token.
    const headers = {
        'Authorization': `Bearer ${TMDB_APP_READ_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    };

    try {
        // --- Step 1: Request a temporary request_token ---
        console.log(`${LOG_PREFIX} INFO: Requesting TMDB request_token...`);
        const requestTokenResponse = await fetch(`${TMDB_API_BASE_V4}/auth/request_token`, {
            method: 'POST',
            headers: headers
            // Body is not typically required for this specific endpoint if using Bearer token auth
        });

        if (!requestTokenResponse.ok) {
            const errorBody = await requestTokenResponse.text().catch(() => "Could not read error body.");
            throw new Error(`Failed to obtain request_token from TMDB. Status: ${requestTokenResponse.status} ${requestTokenResponse.statusText}. Response: ${errorBody.substring(0, 200)}`);
        }

        const requestTokenData = await requestTokenResponse.json();
        const requestToken = requestTokenData.request_token;

        if (!requestToken) {
            throw new Error(`TMDB API Error: Did not receive request_token in response. Data: ${JSON.stringify(requestTokenData)}`);
        }
        console.log(`${LOG_PREFIX} INFO: Request token received: ${requestToken}`);

        // --- Step 2: Direct user to TMDB to approve the request_token ---
        const approveUrl = `https://www.themoviedb.org/auth/access?request_token=${requestToken}`;
        console.log(`${LOG_PREFIX} INFO: Opening browser for user approval: ${approveUrl}`);
        await open(approveUrl);

        // --- Step 3: Wait for user to manually confirm approval in the console ---
        console.log(`${LOG_PREFIX} INFO: Please approve the request in your browser and then press ENTER in this console.`);
        await promptContinue(); // Pauses script execution

        // --- Step 4: Exchange the (now approved) request_token for a user access_token ---
        console.log(`${LOG_PREFIX} INFO: Exchanging request_token for user access_token...`);
        const accessTokenResponse = await fetch(`${TMDB_API_BASE_V4}/auth/access_token`, {
            method: 'POST',
            headers: headers, // Same headers are used for this step
            body: JSON.stringify({ request_token: requestToken })
        });

        if (!accessTokenResponse.ok) {
            const errorBody = await accessTokenResponse.text().catch(() => "Could not read error body.");
            throw new Error(`Failed to exchange request_token for access_token. Status: ${accessTokenResponse.status} ${accessTokenResponse.statusText}. Response: ${errorBody.substring(0,200)}`);
        }

        const accessTokenData = await accessTokenResponse.json();

        if (!accessTokenData.access_token || !accessTokenData.account_id) {
            throw new Error(`TMDB API Error: Did not receive access_token or account_id in response. Data: ${JSON.stringify(accessTokenData)}`);
        }

        console.log(`\n${LOG_PREFIX} INFO: Access token granted successfully!`);
        console.log(`${LOG_PREFIX} INFO: User Access Token: ${accessTokenData.access_token}`); // Be mindful of logging sensitive tokens
        console.log(`${LOG_PREFIX} INFO: Account ID: ${accessTokenData.account_id}`);

        // Return the full object containing access_token, account_id, and success status.
        return accessTokenData; // This object includes { success: true, access_token: "...", account_id: "..." }

    } catch (error) {
        // Catch any error from the try block (fetch errors, JSON parsing, explicit throws).
        console.error(`${LOG_PREFIX} ERROR: TMDB Authentication process failed. Error: ${error.message}`, error.stack || '');
        // Re-throw a new error with context, or the original error if it's already contextualized.
        // The calling function (processScrapedData) will handle this.
        throw new Error(`TMDB Authentication failed: ${error.message}`);
    }
};

/**
 * Pauses script execution and waits for the user to press the ENTER key in the console.
 * Includes a timeout to prevent indefinite waiting.
 * This function is an internal helper for the TMDB authentication flow.
 *
 * @async
 * @function promptContinue
 * @param {number} [timeoutMs=300000] - The maximum time in milliseconds to wait for user input (defaults to 5 minutes).
 * @returns {Promise<void>} A promise that resolves when the user presses ENTER, or rejects if the timeout is reached.
 * @throws {Error} If the timeout is reached before the user presses ENTER.
 */
const promptContinue = (timeoutMs = 300000) => { // Default timeout: 5 minutes
    return new Promise((resolve, reject) => {
        // Set a timeout to automatically reject the promise if the user doesn't respond.
        const timeoutId = setTimeout(() => {
            process.stdin.pause(); // Stop listening for input
            console.warn(`${LOG_PREFIX} WARN: Timed out waiting for user to press ENTER after TMDB approval.`);
            reject(new Error('Timed out waiting for user to press ENTER.'));
        }, timeoutMs);

        // Ensure stdin is in a resumable state.
        process.stdin.resume();
        process.stdin.setEncoding('utf8'); // Set encoding for input

        console.log(`\n${LOG_PREFIX} ACTION: Press ENTER in this console after approving the request token in your browser... (Timeout: ${timeoutMs / 60000} minutes)`);

        // Listen for a single 'data' event (which includes the ENTER key press).
        process.stdin.once('data', (data) => {
            clearTimeout(timeoutId);    // Clear the timeout as user has responded.
            process.stdin.pause();      // Stop listening for further input.
            resolve();                  // Resolve the promise to continue execution.
        });
    });
};
