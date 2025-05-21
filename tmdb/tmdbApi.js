// tmdbApi.js
import { TMDB_API_CONFIG } from '../config.js';
import { normalizeTitleForSearch } from '../utils/titleSanitizer.js';

// Define a consistent logging prefix for this module
const LOG_PREFIX = "[TMDBApi]";

// --- Internal Helper Functions ---

/**
 * Handles the response from a TMDB API call made via fetch.
 * It checks if the response was successful (response.ok). If not, it attempts to parse
 * an error message from the response body and throws a contextualized error.
 * If the response was successful, it attempts to parse the body as JSON. If JSON parsing fails,
 * it throws an error. Otherwise, it returns the parsed JSON data.
 *
 * @async
 * @private
 * @function handleTmdbResponse
 * @param {Response} response - The Response object from a fetch call.
 * @param {string} contextTitle - A title for context in error messages (e.g., list title, movie title).
 * @param {string} actionDescription - A description of the action being performed (e.g., "create list", "search for movie").
 * @returns {Promise<object>} A promise that resolves with the parsed JSON data from the TMDB API response.
 * @throws {Error} If the response is not ok (e.g., 4xx or 5xx status) or if the response body cannot be parsed as JSON.
 * The error object will have a `status` property if it's an HTTP error.
 */
const handleTmdbResponse = async (response, contextTitle, actionDescription) => {
    let responseData;
    if (!response.ok) {
        let errorBodyText = `TMDB API Error ${response.status} ${response.statusText}`;
        try {
            const tempErrorBody = await response.text();
            errorBodyText = tempErrorBody.substring(0, 500) || errorBodyText; // Limit length for logging
        } catch (e) {
            // This catch is for if .text() itself fails after a !response.ok
            console.warn(`${LOG_PREFIX} WARN: [handleTmdbResponse] Could not read error body for ${actionDescription} on "${contextTitle}". Status: ${response.status}`);
        }
        const error = new Error(`TMDB API Error (${response.status}) for ${actionDescription} on "${contextTitle}": ${errorBodyText}`);
        error.status = response.status; // Attach status for potential retry logic or specific handling
        console.error(`${LOG_PREFIX} ERROR: [handleTmdbResponse] Failed to ${actionDescription} for "${contextTitle}". Status: ${response.status}. Body: ${errorBodyText}`);
        throw error;
    }

    try {
        responseData = await response.json();
    } catch (jsonError) {
        let responseText = "Could not read response text after JSON parse failure.";
        try {
            // Attempt to read the text of the response if JSON parsing failed.
            // Note: This might not always work if the response stream was already consumed by a failed .json() attempt,
            // depending on the fetch implementation and server behavior.
            responseText = await response.text();
        } catch (textReadError) {
            console.warn(`${LOG_PREFIX} WARN: [handleTmdbResponse] Failed to read response text after JSON parsing failed for ${actionDescription} on "${contextTitle}".`);
        }
        console.error(`${LOG_PREFIX} ERROR: [handleTmdbResponse] API call for ${actionDescription} on "${contextTitle}" was 'ok' (Status: ${response.status}) but failed to parse JSON. Response Text (first 500 chars):`, responseText.substring(0, 500));
        throw new Error(`TMDB API 'ok' (Status: ${response.status}) for ${actionDescription} on "${contextTitle}" but response was not valid JSON.`);
    }
    return responseData;
};

/**
 * Wraps a fetch call with retry logic, specifically for transient server errors (502, 503, 504)
 * or generic network errors. It uses exponential backoff for retries.
 *
 * @async
 * @private
 * @function fetchWithRetry
 * @param {string} url - The URL to fetch.
 * @param {object} options - The options object for the fetch call.
 * @param {object} context - An object containing contextual information for logging.
 * @param {string} [context.listTitle] - The title of the list being processed (if applicable).
 * @param {string} [context.collectionName] - The name of the collection being processed (if applicable).
 * @param {string} [context.movieTitle] - The title of the movie being processed (if applicable).
 * @param {string} context.actionDescription - A description of the action being performed.
 * @param {number} [maxRetries=3] - The maximum number of retry attempts.
 * @param {number} [initialDelay=2000] - The initial delay in milliseconds before the first retry.
 * @returns {Promise<object>} A promise that resolves with the parsed JSON data from the API response
 * if successful after retries.
 * @throws {Error} If all retry attempts fail or if a non-retryable error occurs.
 */
const fetchWithRetry = async (url, options, context, maxRetries = 3, initialDelay = 2000) => {
    let attempt = 0;
    let currentDelay = initialDelay;
    // Determine a clear identifier for logging based on the provided context.
    const contextIdentifier = context.movieTitle || context.collectionName || context.listTitle || "item";

    while (attempt < maxRetries) {
        attempt++;
        try {
            if (attempt > 1) { // Only log subsequent attempts
                console.log(`${LOG_PREFIX} INFO: [fetchWithRetry] Attempt ${attempt}/${maxRetries} to ${context.actionDescription} for "${contextIdentifier}"`);
            }
            const response = await fetch(url, options);

            // Check for specific HTTP status codes that warrant a retry.
            if ([502, 503, 504].includes(response.status)) {
                let errorBody = "Could not read error body on retryable error.";
                try { errorBody = await response.text(); } catch(e) { /* ignore if reading body fails */ }
                const error = new Error(`Retryable server error: ${response.status} ${response.statusText} while trying to ${context.actionDescription} for "${contextIdentifier}". Body: ${errorBody.substring(0,200)}`);
                error.status = response.status;
                throw error; // This will be caught by the catch block below for retry.
            }
            
            // If not a specific retryable status, pass to handleTmdbResponse.
            // handleTmdbResponse will throw for other !response.ok errors (e.g., 401, 404)
            // or if JSON parsing fails on a 2xx response.
            return await handleTmdbResponse(response, contextIdentifier, context.actionDescription);

        } catch (error) {
            console.warn(`${LOG_PREFIX} WARN: [fetchWithRetry] Attempt ${attempt} for "${context.actionDescription}" on "${contextIdentifier}" failed: ${error.message}`);
            
            // Determine if the error is retryable.
            const isRetryableHttpError = error.status && [502, 503, 504].includes(error.status);
            // Generic network errors might not have a .status property.
            const isNetworkError = !error.status && (
                error.name === 'FetchError' || // node-fetch specific
                error.message.toLowerCase().includes('network') ||
                error.message.toLowerCase().includes('failed to fetch')
            );

            if ((isRetryableHttpError || isNetworkError) && attempt < maxRetries) {
                console.log(`${LOG_PREFIX} INFO: [fetchWithRetry] Retrying in ${currentDelay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                currentDelay *= 2; // Exponential backoff for subsequent retries.
            } else {
                // If not retryable or max retries reached, re-throw the error.
                console.error(`${LOG_PREFIX} ERROR: [fetchWithRetry] All ${maxRetries} retry attempts failed for "${context.actionDescription}" on "${contextIdentifier}" or error not retryable (Status: ${error.status || 'N/A'}).`);
                throw error; 
            }
        }
    }
    // This line should ideally not be reached if maxRetries > 0,
    // as the loop will either return a result or throw an error.
    // Added as a fallback.
    throw new Error(`All retry attempts exhausted for "${context.actionDescription}" on "${contextIdentifier}".`);
};

// --- TMDB API Functions ---

/**
 * Creates a new list on TMDB.
 * It first checks if a list with the same title already exists for the authenticated user.
 *
 * @async
 * @function createList
 * @param {object} accessToken - The TMDB user access token object (containing `access_token` and `account_id`).
 * @param {string} listTitle - The title for the new TMDB list.
 * @param {string} listDescription - The description for the new TMDB list.
 * @returns {Promise<number|null>} A promise that resolves with the ID of the newly created list,
 * or null if creation failed (though it typically throws on failure).
 * @throws {Error} If the list already exists, or if any API error occurs during creation.
 */
const createList = async (accessToken, listTitle, listDescription) => {
    const FN_NAME = "createList"; // For consistent logging
    try {
        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Checking if list "${listTitle}" already exists...`);
        const existingListId = await getListId(accessToken, listTitle);
        if (existingListId) {
            const errorMessage = `Failed to create list: The list named "${listTitle}" already exists with ID ${existingListId}.`;
            console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] ${errorMessage}`); // Use warn as it's a pre-condition failure
            throw new Error(errorMessage);
        }

        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Creating new list "${listTitle}"...`);
        const url = `${TMDB_API_CONFIG.BASE_URL_V4}/list`;
        const options = {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken.access_token}`
            },
            body: JSON.stringify({
                name: listTitle, // No need for `${listTitle}` if listTitle is already a string
                iso_639_1: "en",
                description: listDescription,
                public: true // Assuming lists should be public by default
            })
        };

        // fetchWithRetry will call handleTmdbResponse internally.
        const responseData = await fetchWithRetry(url, options, { listTitle, actionDescription: "create list" });
        
        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] List "${listTitle}" created successfully. ID: ${responseData.id}`);
        return responseData.id;

    } catch (error) {
        // Re-throw errors that are already well-contextualized by previous checks or handleTmdbResponse.
        if (error.message.startsWith('TMDB API Error') || error.message.startsWith('Failed to create list:')) {
            throw error;
        }
        // For other unexpected errors specifically within this function's logic.
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Unexpected error for list "${listTitle}": ${error.message}`, error.stack || '');
        throw new Error(`Failed to create list "${listTitle}" (unexpected): ${error.message}`);
    }
};

/**
 * Fetches the ID of a TMDB list given its title for the authenticated user.
 *
 * @async
 * @function getListId
 * @param {object} accessToken - The TMDB user access token object.
 * @param {string} listTitle - The title of the list to find.
 * @returns {Promise<number|null>} A promise that resolves with the list ID if found, or null otherwise.
 * @throws {Error} If an API error occurs during fetching or if the response format is unexpected.
 */
const getListId = async (accessToken, listTitle) => {
    const FN_NAME = "getListId";
    try {
        // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Fetching lists for account ID ${accessToken.account_id} to find "${listTitle}"...`);
        const url = `${TMDB_API_CONFIG.BASE_URL_V4}/account/${accessToken.account_id}/lists?page=1`; // TMDB pagination starts at 1
        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                // 'content-type': 'application/json', // Not typically needed for GET requests
                Authorization: `Bearer ${accessToken.access_token}`
            }
        };

        const data = await fetchWithRetry(url, options, { listTitle, actionDescription: "fetch user lists" });

        if (!data.results || !Array.isArray(data.results)) {
            console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Unexpected TMDB response format when fetching lists for "${listTitle}". Data:`, data);
            throw new Error(`Unexpected TMDB response format when fetching lists for "${listTitle}"`);
        }

        const foundList = data.results.find(list => list.name === listTitle);
        if (foundList) {
            // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Found list "${listTitle}" with ID: ${foundList.id}.`);
        } else {
            // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] List "${listTitle}" not found for this account.`);
        }
        return foundList ? foundList.id : null;

    } catch (error) {
        if (error.message.startsWith('TMDB API Error') || error.message.startsWith('Unexpected TMDB response format')) {
            throw error; // Re-throw already contextualized errors
        }
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Error searching for list ID for "${listTitle}": ${error.message}`, error.stack || '');
        throw new Error(`Failed to get list ID for "${listTitle}": ${error.message}`);
    }
};

/**
 * Searches for a TMDB collection by its name.
 *
 * @async
 * @private
 * @function searchForTmdbCollectionByName
 * @param {string} apiKey - The TMDB API key (v3).
 * @param {string} collectionQueryName - The name or query string for the collection search.
 * @param {string} rawTitleForLog - The original raw title, used for logging context.
 * @returns {Promise<number|null>} The ID of the first matching collection, or null if not found or an error occurs.
 */
const searchForTmdbCollectionByName = async (apiKey, collectionQueryName, rawTitleForLog) => {
    const FN_NAME = "searchForTmdbCollectionByName";
    console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Attempting TMDB Collection search for: "${collectionQueryName}" (Original: "${rawTitleForLog}")`);
    const encodedCollectionName = encodeURIComponent(collectionQueryName);
    const collectionSearchUrl = `${TMDB_API_CONFIG.BASE_URL_V3}/search/collection?api_key=${apiKey}&query=${encodedCollectionName}&page=1`;
    const options = { method: 'GET', headers: { accept: 'application/json' } };

    try {
        const data = await fetchWithRetry(
            collectionSearchUrl,
            options,
            { collectionName: collectionQueryName, actionDescription: "search for collection" }
        );
        if (data.results && data.results.length > 0) {
            const foundCollection = data.results[0]; // Taking the first result
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Found collection: "${foundCollection.name}" (ID: ${foundCollection.id}) for query "${collectionQueryName}"`);
            return foundCollection.id;
        }
        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] No collections found for query: "${collectionQueryName}"`);
        return null;
    } catch (error) {
        // fetchWithRetry already logs warnings for attempts. This logs the final failure.
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Collection search failed for "${collectionQueryName}" (Original: "${rawTitleForLog}"): ${error.message}`);
        return null; // Return null on error so getMovieIds can continue with its flow
    }
}

/**
 * Fetches all movie IDs from a given TMDB collection ID.
 *
 * @async
 * @private
 * @function getMovieIdsFromTmdbCollection
 * @param {string} apiKey - The TMDB API key (v3).
 * @param {number} collectionId - The ID of the TMDB collection.
 * @param {string} collectionNameForLog - The name of the collection, for logging context.
 * @returns {Promise<Array<number>>} An array of movie IDs found in the collection. Returns an empty array on error or if no movies.
 */
const getMovieIdsFromTmdbCollection = async (apiKey, collectionId, collectionNameForLog) => {
    const FN_NAME = "getMovieIdsFromTmdbCollection";
    console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Fetching movies from TMDB Collection ID: ${collectionId} ("${collectionNameForLog}")`);
    const collectionDetailsUrl = `${TMDB_API_CONFIG.BASE_URL_V3}/collection/${collectionId}?api_key=${apiKey}`;
    const options = { method: 'GET', headers: { accept: 'application/json' } };
    const movieIds = [];

    try {
        const data = await fetchWithRetry(
            collectionDetailsUrl,
            options,
            { collectionName: collectionNameForLog, actionDescription: `get details for collection ID ${collectionId}` }
        );
        if (data.parts && data.parts.length > 0) {
            data.parts.forEach(part => {
                // Ensure it's a movie and has an ID before adding.
                if (part.media_type === 'movie' && part.id) {
                    movieIds.push(part.id);
                }
            });
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Found ${movieIds.length} movie IDs in collection "${data.name || collectionNameForLog}".`);
        } else {
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] No movie parts found in collection ID ${collectionId} ("${data.name || collectionNameForLog}").`);
        }
        return movieIds;
    } catch (error) {
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Error fetching movies from collection ID ${collectionId} ("${collectionNameForLog}"): ${error.message}`);
        return []; // Return empty array on error to allow main flow to continue
    }
}

/**
 * Takes an array of movie objects (title, year), searches TMDB for each,
 * attempts year-based retries and collection lookups, and returns the results.
 *
 * @async
 * @function getMovieIds
 * @param {object} accessToken - The TMDB user access token object (used by some internal calls if v4 endpoints were needed, though currently v3 search uses API key).
 * @param {Array<{title: string, year: string|null}>} moviesList - Array of movie objects to search for.
 * @returns {Promise<{successfulIds: Array<number>, notFoundTitles: Array<object>, failedToSearchTitles: Array<object>, attemptedCount: number}>}
 * An object containing:
 * - `successfulIds`: An array of TMDB movie IDs that were successfully found.
 * - `notFoundTitles`: An array of original movie objects ({title, year}) that were not found on TMDB.
 * - `failedToSearchTitles`: An array of original movie objects that encountered an error during the search process.
 * - `attemptedCount`: The total number of movies from `moviesList` that were attempted.
 */
const getMovieIds = async (accessToken, moviesList) => {
    const FN_NAME = "getMovieIds";
    const successfulIds = new Set(); // Use a Set to automatically handle duplicate IDs
    const notFoundTitles = [];
    const failedToSearchTitles = [];
    const apiKey = process.env.TMDB_API_KEY; // Ensure TMDB_API_KEY is loaded from .env

    if (!apiKey) {
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] CRITICAL - TMDB_API_KEY for v3 search is missing!`);
        moviesList.forEach(movie => {
            failedToSearchTitles.push({ title: movie.title, year: movie.year, reason: 'TMDB_API_KEY missing' });
        });
        return { successfulIds: [], notFoundTitles, failedToSearchTitles, attemptedCount: moviesList.length };
    }

    console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Starting TMDB ID lookup for ${moviesList.length} movies.`);

    for (const movie of moviesList) {
        const { title: rawTitle, year: rawScrapedYear } = movie;
        let movieFoundThisIteration = false; // Flag for the current movie object

        try {
            if (!rawTitle) {
                console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Skipping movie with no raw title data:`, movie);
                failedToSearchTitles.push({ title: 'N/A (Title Missing)', year: rawScrapedYear || 'N/A', reason: 'Missing title data from scraper' });
                continue;
            }

            const { sanitizedTitle, searchYear: initialSearchYear, isLikelyCollection } = normalizeTitleForSearch(rawTitle, rawScrapedYear);

            if (!sanitizedTitle) {
                console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Skipping movie because title became empty after sanitization (Original: "${rawTitle}"):`, movie);
                failedToSearchTitles.push({ title: rawTitle, year: rawScrapedYear || 'N/A', reason: 'Title became empty after sanitization' });
                continue;
            }
            
            // Prepare years to try for movie search (initial, year+1, year-1, null)
            const searchYearsToTry = [initialSearchYear];
            if (initialSearchYear && /^\d{4}$/.test(initialSearchYear)) {
                searchYearsToTry.push(String(parseInt(initialSearchYear, 10) + 1));
                searchYearsToTry.push(String(parseInt(initialSearchYear, 10) - 1));
            }
            const uniqueSearchYears = [...new Set(searchYearsToTry.filter(yr => yr !== null && yr !== undefined))];
            if (uniqueSearchYears.length === 0 || !uniqueSearchYears.some(yr => yr === initialSearchYear)) {
                 // Ensure a search without a year is also attempted if no specific years, or if initialSearchYear was null
                if(!uniqueSearchYears.includes(null)) uniqueSearchYears.push(null);
            }


            // console.log(`${LOG_PREFIX} DEBUG: [${FN_NAME}] Processing: "${rawTitle}" (Scraped Year: ${rawScrapedYear || 'N/A'}) -> Sanitized: "${sanitizedTitle}" (Likely Collection: ${isLikelyCollection}), Search Years: ${uniqueSearchYears.join(', ')}`);

            // --- Movie Search Attempt (with year variations) ---
            for (const currentSearchYear of uniqueSearchYears) {
                if (movieFoundThisIteration) break; // Found in a previous year attempt

                const encodedTitle = encodeURIComponent(sanitizedTitle);
                let movieSearchUrl = `${TMDB_API_CONFIG.BASE_URL_V3}/search/movie?api_key=${apiKey}&query=${encodedTitle}&include_adult=false&language=en-US&page=1`;
                if (currentSearchYear) {
                    movieSearchUrl += `&year=${currentSearchYear}&primary_release_year=${currentSearchYear}`;
                }
                
                try {
                    const movieData = await fetchWithRetry(
                        movieSearchUrl,
                        { method: 'GET', headers: { accept: 'application/json' } },
                        { movieTitle: sanitizedTitle, actionDescription: `search for movie "${sanitizedTitle}" (Year: ${currentSearchYear || 'Any'})` }
                    );

                    if (movieData.results?.length > 0) {
                        let foundM = movieData.results[0]; // Default to first result
                        if (currentSearchYear) { // If we searched with a specific year, try to find a better match
                            const yearMatch = movieData.results.find(r => r.release_date?.startsWith(currentSearchYear));
                            if (yearMatch) foundM = yearMatch;
                        }
                        // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}]   SUCCESS: Found TMDB Movie ID ${foundM.id} ("${foundM.title}") for query "${sanitizedTitle}" (Year: ${currentSearchYear || 'Any'})`);
                        successfulIds.add(foundM.id);
                        movieFoundThisIteration = true;
                    }
                } catch (movieSearchError) {
                    // fetchWithRetry already logs the attempt failure.
                    // console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}]   Movie search failed for "${sanitizedTitle}" with year ${currentSearchYear || 'Any'}: ${movieSearchError.message}`);
                }
            } // End of year retry loop

            // --- Collection Search Attempt (if movie not found via any year attempt AND it's likely a collection) ---
            if (!movieFoundThisIteration && isLikelyCollection) {
                // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Movie search yielded no results for "${sanitizedTitle}". Attempting collection search.`);
                // For collection search, the raw title (or a minimally cleaned version) might be better.
                const collectionQuery = normalizeTitleForSearch(rawTitle, null).sanitizedTitle || rawTitle; // Use a version more likely to match collection names
                
                const collectionId = await searchForTmdbCollectionByName(apiKey, collectionQuery, rawTitle);
                if (collectionId) {
                    const collectionMovieIds = await getMovieIdsFromTmdbCollection(apiKey, collectionId, collectionQuery);
                    if (collectionMovieIds.length > 0) {
                        // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}]   Added ${collectionMovieIds.length} movies from collection "${collectionQuery}" for original title "${rawTitle}".`);
                        collectionMovieIds.forEach(id => successfulIds.add(id));
                        movieFoundThisIteration = true; 
                    }
                }
            }

            if (!movieFoundThisIteration) {
                // console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] FINAL: No TMDB movies or collection parts found for: "${sanitizedTitle}" (Original: "${rawTitle}", Original year: ${rawScrapedYear || 'N/A'})`);
                notFoundTitles.push({ title: rawTitle, year: rawScrapedYear });
            }

        } catch (error) { // Catch errors from the outer try block for this movie's processing
            console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Unexpected error processing movie "${rawTitle}" (${rawScrapedYear || 'N/A'}): ${error.message}`, error.stack || '');
            failedToSearchTitles.push({ title: rawTitle, year: rawScrapedYear, reason: 'Unexpected error in getMovieIds main loop', details: error.message });
        }
    } // end for loop over moviesList

    console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Finished TMDB ID lookup. Found: ${successfulIds.size}, Not Found: ${notFoundTitles.length}, Failed Search: ${failedToSearchTitles.length}`);
    return { 
        successfulIds: Array.from(successfulIds), 
        notFoundTitles, 
        failedToSearchTitles,
        attemptedCount: moviesList.length 
    };
};

/**
 * Adds or updates items in a TMDB list in batches.
 * It distinguishes between critical batch API failures and individual item addition failures.
 *
 * @async
 * @function updateList
 * @param {object} accessToken - The TMDB user access token object.
 * @param {object} listData - Object containing list title and original movie data.
 * @param {{successfulIds: Array<number>, movieLookupFailures: {notFoundTitles: Array<object>, failedToSearchTitles: Array<object>}}} idLookupResult
 * The result from `getMovieIds`, containing TMDB IDs to add and any lookup failures.
 * @returns {Promise<{itemsAttemptedCount: number, itemsSuccessfullyAddedCount: number, movieLookupFailures: object}>}
 * An object with counts of items attempted, successfully added/confirmed, and any movie lookup failures.
 * @throws {Error} If a critical, unrecoverable error occurs during batch processing (e.g., auth error, repeated server errors).
 */
const updateList = async (accessToken, listData, idLookupResult) => {
    const FN_NAME = "updateList";
    const listTitle = listData.title;
    let listId; // To store the fetched list ID

    // Initialize stats and failures based on the pre-fetched ID lookup results
    let movieLookupFailures = idLookupResult.movieLookupFailures || { notFoundTitles: [], failedToSearchTitles: [] };
    const movieIdsToUpdate = idLookupResult.successfulIds || [];
    let itemsAttemptedCount = movieIdsToUpdate.length;
    let itemsSuccessfullyAddedOrConfirmedCount = 0;

    try {
        if (!listTitle) {
            throw new Error('Title for list was not provided in the listData.');
        }
        listId = await getListId(accessToken, listTitle); // Assumes getListId uses fetchWithRetry
        if (!listId) {
            throw new Error(`List with name: "${listTitle}" does not exist and cannot be updated.`);
        }

        if (movieIdsToUpdate.length === 0) {
            if (listData.movieData?.length > 0 && idLookupResult.attemptedCount > 0) { // Check if there was original data to look up
                console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] No TMDB movie IDs were resolved for list "${listTitle}", though ${listData.movieData.length} items were scraped. Skipping update.`);
            } else {
                console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] No movie IDs to add to list "${listTitle}". Skipping update.`);
            }
            return { itemsAttemptedCount, itemsSuccessfullyAddedCount: itemsSuccessfullyAddedOrConfirmedCount, movieLookupFailures };
        }

        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Preparing to update list ID ${listId} ("${listTitle}") with ${itemsAttemptedCount} items.`);
        const BATCH_SIZE = 100; // TMDB API v4 /list/{id}/items has a limit, often around 100-250. 100 is safe.
        let anyCriticalBatchFailure = false;

        for (let i = 0; i < movieIdsToUpdate.length; i += BATCH_SIZE) {
            const batchMovieIds = movieIdsToUpdate.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(movieIdsToUpdate.length / BATCH_SIZE);
            
            const url = `${TMDB_API_CONFIG.BASE_URL_V4}/list/${listId}/items`;
            const options = {
                method: 'POST',
                headers: { accept: 'application/json', 'content-type': 'application/json', Authorization: `Bearer ${accessToken.access_token}`},
                body: JSON.stringify({ items: batchMovieIds.map(id => ({ media_type: 'movie', media_id: id })) })
            };
            
            try {
                const responseData = await fetchWithRetry(
                    url,
                    options,
                    { listTitle, actionDescription: `update batch ${batchNumber}/${totalBatches} for list ID ${listId}` }
                );
                
                let individualItemFailuresInBatchCount = 0;
                let individualItemSuccessesOrConfirmedInBatchCount = 0;

                if (responseData?.results && Array.isArray(responseData.results)) {
                    const actualFailedItemsDetails = [];
                    responseData.results.forEach(itemResult => {
                        const isAlreadyTaken = itemResult.success === false && 
                                               itemResult.error?.some(errMsg => typeof errMsg === 'string' && errMsg.toLowerCase().includes('media has already been taken'));
                        
                        if (itemResult.success === true || isAlreadyTaken) {
                            itemsSuccessfullyAddedOrConfirmedCount++;
                            individualItemSuccessesOrConfirmedInBatchCount++;
                        } else {
                            individualItemFailuresInBatchCount++;
                            actualFailedItemsDetails.push(itemResult);
                        }
                    });
                    if (individualItemFailuresInBatchCount > 0) {
                        console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}": ${individualItemFailuresInBatchCount} item(s) had unexpected failures. Items confirmed/added: ${individualItemSuccessesOrConfirmedInBatchCount}. Failures:`, actualFailedItemsDetails);
                    }
                } else if (responseData && typeof responseData.success === 'boolean' && responseData.success === false) {
                    console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" reported overall failure by TMDB. Response:`, responseData);
                    anyCriticalBatchFailure = true;
                } else if (responseData && typeof responseData.success === 'boolean' && responseData.success === true && !responseData.results) {
                    // This means TMDB acknowledged the batch as successful but didn't return individual item statuses.
                    // Assume all items in this batch were processed as intended (added or were already there).
                    console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" reported overall success by TMDB. Assuming all ${batchMovieIds.length} items in batch were processed.`);
                    itemsSuccessfullyAddedOrConfirmedCount += batchMovieIds.length;
                    individualItemSuccessesOrConfirmedInBatchCount = batchMovieIds.length;
                } else if (!responseData || (!Array.isArray(responseData.results) && typeof responseData.success !== 'boolean')) {
                     // This case means the response format from TMDB was not what we expected for this endpoint.
                     console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" processed, but TMDB response format was unexpected. Response:`, responseData);
                     anyCriticalBatchFailure = true; // Treat unexpected format as a critical issue for the batch.
                }

                if (!anyCriticalBatchFailure) {
                    console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" processed. Items confirmed/added in batch: ${individualItemSuccessesOrConfirmedInBatchCount}. Unexpected failures in batch: ${individualItemFailuresInBatchCount}.`);
                }

            } catch (batchError) { // Catches critical errors from fetchWithRetry (after all retries, or non-retryable errors)
                console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] CRITICAL error processing batch ${batchNumber} for list "${listTitle}" after retries: ${batchError.message}`);
                anyCriticalBatchFailure = true;
                // If an authentication/authorization error occurs, stop processing further batches for this list.
                if (batchError.message.includes("(401)") || batchError.message.includes("(403)")) {
                    console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Authentication/Authorization error during batch update. Stopping further batches for list "${listTitle}".`);
                    break; // Exit the for-loop for batches of this list
                }
            }

            // Add delay only if there are more batches AND the loop wasn't broken by an auth error.
            if (i + BATCH_SIZE < movieIdsToUpdate.length) {
                 await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay
            }
        } // End of for loop (batches)

        if (anyCriticalBatchFailure) {
            const error = new Error(`One or more batches had critical API failures for list "${listTitle}"`);
            // Attach collected stats to the error for reporting
            error.movieLookupFailures = movieLookupFailures;
            error.itemsAttemptedCount = itemsAttemptedCount;
            error.itemsSuccessfullyAddedCount = itemsSuccessfullyAddedOrConfirmedCount;
            throw error;
        } else {
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] All item batches for list "${listTitle}" (ID: ${listId}) were processed. Total items confirmed on list (added or already present): ${itemsSuccessfullyAddedOrConfirmedCount}/${itemsAttemptedCount}.`);
        }
        // Return all relevant stats
        return { itemsAttemptedCount, itemsSuccessfullyAddedCount: itemsSuccessfullyAddedOrConfirmedCount, movieLookupFailures };

    } catch (error) { // Outer catch for setup errors (e.g., getListId) or errors propagated from critical batch failures
        const currentListTitle = listData?.title || 'Unknown Title (listData or listData.title missing in catch)';
        // Ensure all relevant stats are attached to the error object before re-throwing
        if (!error.movieLookupFailures && (movieLookupFailures.notFoundTitles.length > 0 || movieLookupFailures.failedToSearchTitles.length > 0)) {
            error.movieLookupFailures = movieLookupFailures;
        }
        if (error.itemsAttemptedCount === undefined) error.itemsAttemptedCount = itemsAttemptedCount;
        if (error.itemsSuccessfullyAddedCount === undefined) error.itemsSuccessfullyAddedCount = itemsSuccessfullyAddedOrConfirmedCount;
        
        // Re-throw known, contextualized errors directly.
        if (error.message.startsWith('TMDB API Error') || 
            error.message.startsWith('One or more batches had critical API failures') ||
            error.message.includes('not provided in the listData') || // from title check
            error.message.includes('does not exist and cannot be updated') || // from listId check
            error.message.startsWith('Failed to get list ID for') ) { // from getListId
            throw error;
        }
        // For truly unexpected errors within this function's logic
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Unexpected error for list "${currentListTitle}": ${error.message}`, error.stack || '');
        const newError = new Error(`Failed to update list "${currentListTitle}" (unexpected): ${error.message}`);
        // Attach all collected stats to the new error
        newError.movieLookupFailures = error.movieLookupFailures;
        newError.itemsAttemptedCount = error.itemsAttemptedCount;
        newError.itemsSuccessfullyAddedCount = error.itemsSuccessfullyAddedCount;
        throw newError;
    }
};

/**
 * Orchestrates the process of creating a new TMDB list or updating an existing one.
 * It first attempts to find TMDB IDs for the provided movie data, then proceeds
 * to create the list if it doesn't exist, and finally updates the list with the found movie IDs.
 * This function also gathers and returns processing statistics.
 *
 * @async
 * @function createOrUpdateList
 * @param {object} accessToken - The TMDB user access token object.
 * @param {object} listData - An object containing the list's title, description, and raw movieData.
 * @param {string} listData.title - The title of the TMDB list.
 * @param {string} listData.description - The description for the TMDB list.
 * @param {Array<{title: string, year: string|null}>} listData.movieData - Array of movie objects from scraping.
 * @returns {Promise<object>} A promise that resolves with an object containing detailed processing statistics:
 * - `scrapedItemsCount`: Number of items originally scraped for this list.
 * - `tmdbIdsFoundCount`: Number of unique TMDB movie IDs found for the scraped items.
 * - `itemsAttemptedCount`: Number of TMDB IDs that were attempted to be added/updated in the list.
 * - `itemsSuccessfullyAddedCount`: Number of items TMDB reported as successfully added or already present.
 * - `movieLookupFailures`: Object containing arrays of `notFoundTitles` and `failedToSearchTitles`.
 * @throws {Error} If a critical error occurs during list creation, ID lookup, or list update.
 * The error object will have the processing statistics attached if available.
 */
export const createOrUpdateList = async (accessToken, listData) => {
    const FN_NAME = "createOrUpdateList";
    // Initialize stats object that will be returned or attached to an error
    let processingStats = {
        itemsAttemptedCount: 0,
        itemsSuccessfullyAddedCount: 0, // This will reflect items confirmed on the list
        movieLookupFailures: { notFoundTitles: [], failedToSearchTitles: [] },
        scrapedItemsCount: listData.movieData?.length || 0,
        tmdbIdsFoundCount: 0 // This will be set after getMovieIds
    };

    try {
        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Starting processing for list: "${listData.title}"`);
        let listId = await getListId(accessToken, listData.title); // Uses fetchWithRetry

        if (!listId) {
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] List "${listData.title}" not found. Attempting to create...`);
            listId = await createList(accessToken, listData.title, listData.description); // Uses fetchWithRetry
            if (!listId) {
                // This path should ideally not be reached if createList throws on failure, but as a safeguard:
                throw new Error(`List "${listData.title}" was not found and an ID was not returned after attempting creation.`);
            }
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] List "${listData.title}" created with ID: ${listId}.`);
        } else {
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] List "${listData.title}" found with ID ${listId}. Proceeding to update.`);
        }

        // Call getMovieIds ONCE here to get IDs and lookup failures for stats and for updateList
        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Looking up TMDB IDs for ${listData.movieData?.length || 0} items for list "${listData.title}"...`);
        const idLookupResult = await getMovieIds(accessToken, listData.movieData); // Uses fetchWithRetry for its searches
        
        // Populate stats from getMovieIds result
        processingStats.tmdbIdsFoundCount = idLookupResult.successfulIds?.length || 0;
        processingStats.movieLookupFailures = {
            notFoundTitles: idLookupResult.notFoundTitles || [],
            failedToSearchTitles: idLookupResult.failedToSearchTitles || []
        };
        
        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] For list "${listData.title}", TMDB IDs found: ${processingStats.tmdbIdsFoundCount}. Attempted lookups: ${idLookupResult.attemptedCount}.`);

        // Pass the full idLookupResult (which includes successfulIds) to updateList
        const updateResult = await updateList(accessToken, listData, idLookupResult); 
        
        // Populate remaining stats from updateList result
        processingStats.itemsAttemptedCount = updateResult.itemsAttemptedCount;
        processingStats.itemsSuccessfullyAddedCount = updateResult.itemsSuccessfullyAddedCount; // This is itemsSuccessfullyAddedOrConfirmedCount
        // movieLookupFailures in processingStats is already set from the initial idLookupResult

        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Finished processing for list "${listData.title}". TMDB IDs Found: ${processingStats.tmdbIdsFoundCount}, Items Confirmed on List: ${processingStats.itemsSuccessfullyAddedCount}/${processingStats.itemsAttemptedCount}`);
        return processingStats;

    } catch (error) {
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Error during processing for list "${listData.title}": ${error.message}`, error.stack || '');
        // Ensure all available stats are attached to the error object before re-throwing
        if (error.scrapedItemsCount === undefined) error.scrapedItemsCount = processingStats.scrapedItemsCount;
        if (error.tmdbIdsFoundCount === undefined) error.tmdbIdsFoundCount = processingStats.tmdbIdsFoundCount;
        if (error.itemsAttemptedCount === undefined) error.itemsAttemptedCount = processingStats.itemsAttemptedCount;
        if (error.itemsSuccessfullyAddedCount === undefined) error.itemsSuccessfullyAddedCount = processingStats.itemsSuccessfullyAddedCount;
        
        if (!error.movieLookupFailures && (processingStats.movieLookupFailures.notFoundTitles?.length > 0 || processingStats.movieLookupFailures.failedToSearchTitles?.length > 0)) {
            error.movieLookupFailures = processingStats.movieLookupFailures;
        }
        throw error; // Re-throw the (potentially augmented) error
    }
};
