import { TMDB_API_CONFIG } from '../config/config.js';
import { normalizeTitleForSearch } from '../utils/titleSanitizer.js';

const LOG_PREFIX = "[TMDBApi]";

// --- Helper Functions ---

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
    const FN_NAME = "handleTmdbResponse";
    let responseData;

    if (!response.ok) {
        let errorBodyText = `TMDB API Error ${response.status} ${response.statusText}`;
        try {
            const tempErrorBody = await response.text();
            // Use the error body if available and not empty, otherwise stick with status text. Limit length for logs.
            errorBodyText = tempErrorBody && tempErrorBody.trim().length > 0 ? tempErrorBody.substring(0, 500) : errorBodyText;
        } catch (e) {
            // This catch is for if .text() itself fails after a !response.ok
            console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Could not read error body for ${actionDescription} on "${contextTitle}". Status: ${response.status}. Error: ${e.message}`);
        }
        const error = new Error(`TMDB API Error (${response.status}) for ${actionDescription} on "${contextTitle}": ${errorBodyText}`);
        error.status = response.status; // Attach status for potential retry logic or specific handling
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Failed to ${actionDescription} for "${contextTitle}". Status: ${response.status}. Body Snippet: ${errorBodyText}`);
        throw error;
    }

    try {
        responseData = await response.json();
    } catch (jsonError) {
        let responseText = "Could not read response text after JSON parse failure.";
        try {
            // Attempt to read the text of the response if JSON parsing failed.
            // This might not always work if the response stream was already consumed by a failed .json() attempt.
            responseText = await response.text();
        } catch (textReadError) {
            console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Failed to read response text after JSON parsing failed for ${actionDescription} on "${contextTitle}". Error: ${textReadError.message}`);
        }
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] API call for ${actionDescription} on "${contextTitle}" was 'ok' (Status: ${response.status}) but failed to parse JSON. Response Text (first 500 chars):`, responseText.substring(0, 500));
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
 * @param {string} [context.listTitle] - The title of the list being processed.
 * @param {string} [context.collectionName] - The name of the collection being processed.
 * @param {string} [context.movieTitle] - The title of the movie being processed.
 * @param {string} context.actionDescription - A description of the action being performed.
 * @param {number} [maxRetries=3] - The maximum number of retry attempts.
 * @param {number} [initialDelay=2000] - The initial delay in milliseconds before the first retry.
 * @returns {Promise<object>} A promise that resolves with the parsed JSON data from the API response if successful.
 * @throws {Error} If all retry attempts fail or if a non-retryable error occurs.
 */
const fetchWithRetry = async (url, options, context, maxRetries = 3, initialDelay = 2000) => {
    const FN_NAME = "fetchWithRetry";
    let attempt = 0;
    let currentDelay = initialDelay;
    const contextIdentifier = context.movieTitle || context.collectionName || context.listTitle || "item";

    while (attempt < maxRetries) {
        attempt++;
        try {
            if (attempt > 1) { // Log only for actual retry attempts
                 console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Attempt ${attempt}/${maxRetries} to ${context.actionDescription} for "${contextIdentifier}"`);
            }
            const response = await fetch(url, options);

            // Check for specific HTTP status codes that warrant a retry.
            if ([502, 503, 504].includes(response.status)) {
                let errorBody = "Could not read error body on retryable error.";
                try { errorBody = await response.text(); } catch(e) { /* ignore */ }
                const error = new Error(`Retryable server error: ${response.status} ${response.statusText} while trying to ${context.actionDescription} for "${contextIdentifier}". Body: ${errorBody.substring(0,200)}`);
                error.status = response.status;
                // Log here before throwing to be caught by the retry logic below
                console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] ${error.message}`);
                throw error; 
            }
            
            // If not a specific retryable status, pass to handleTmdbResponse.
            return await handleTmdbResponse(response, contextIdentifier, context.actionDescription);

        } catch (error) {
            // This catch block handles errors from fetch() itself, or errors thrown by the 5xx check above,
            // or errors thrown by handleTmdbResponse (like 4xx or JSON parsing errors).
            console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Attempt ${attempt} for "${context.actionDescription}" on "${contextIdentifier}" failed: ${error.message}`);
            
            const isRetryableHttpError = error.status && [502, 503, 504].includes(error.status);
            const isNetworkError = !error.status && (
                error.name === 'FetchError' || 
                error.message.toLowerCase().includes('network') ||
                error.message.toLowerCase().includes('failed to fetch')
            );

            if ((isRetryableHttpError || isNetworkError) && attempt < maxRetries) {
                console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Retrying in ${currentDelay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                currentDelay *= 2; // Exponential backoff
            } else {
                // If not retryable or max retries reached, re-throw the error.
                // The final console.error will be in the function that called fetchWithRetry.
                throw error; 
            }
        }
    }
    // This line should ideally not be reached if maxRetries > 0.
    throw new Error(`[${FN_NAME}] All retry attempts exhausted for "${context.actionDescription}" on "${contextIdentifier}".`);
};

// --- TMDB API Functions ---

/**
 * Creates a new list on TMDB.
 * It first checks if a list with the same title already exists for the authenticated user.
 *
 * @async
 * @function createList
 * @param {object} accessToken - The TMDB user access token object (containing `access_token`).
 * @param {string} listTitle - The title for the new TMDB list.
 * @param {string} listDescription - The description for the new TMDB list.
 * @returns {Promise<number>} A promise that resolves with the ID of the newly created list.
 * @throws {Error} If the list already exists, or if any API error occurs during creation.
 */
const createList = async (accessToken, listTitle, listDescription) => { 
    const FN_NAME = "createList";
    try {
        // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Checking if list "${listTitle}" already exists...`);
        const existingListId = await getListId(accessToken, listTitle); // Uses fetchWithRetry
        if (existingListId) {
            const errorMessage = `Failed to create list: The list named "${listTitle}" already exists with ID ${existingListId}.`;
            console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] ${errorMessage}`);
            throw new Error(errorMessage);
        }

        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Creating new list "${listTitle}"...`);
        const url = `${TMDB_API_CONFIG.BASE_URL_V4}/list`;
        const options = {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json', Authorization: `Bearer ${accessToken.access_token}`},
            body: JSON.stringify({ name: listTitle, iso_639_1: "en", description: listDescription, public: true })
        };
        const responseData = await fetchWithRetry(url, options, { listTitle, actionDescription: "create list" });
        
        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] List "${listTitle}" created successfully. ID: ${responseData.id}`);
        return responseData.id;
    } catch (error) {
        if (error.message.startsWith('TMDB API Error') || error.message.startsWith('Failed to create list:')) {
            // These errors are already contextualized, re-throw them.
            throw error;
        }
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Unexpected error for list "${listTitle}": ${error.message}`, error.stack || '');
        throw new Error(`Failed to create list "${listTitle}" (unexpected): ${error.message}`);
    }
};

/**
 * Fetches the ID of a TMDB list given its title for the authenticated user.
 *
 * @async
 * @function getListId
 * @param {object} accessToken - The TMDB user access token object (containing `access_token` and `account_id`).
 * @param {string} listTitle - The title of the list to find.
 * @returns {Promise<number|null>} A promise that resolves with the list ID if found, or null otherwise.
 * @throws {Error} If an API error occurs during fetching or if the response format is unexpected.
 */
const getListId = async (accessToken, listTitle) => { 
    const FN_NAME = "getListId";
    try {
        const url = `${TMDB_API_CONFIG.BASE_URL_V4}/account/${accessToken.account_id}/lists?page=1`;
        const options = { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${accessToken.access_token}`}};
        
        // fetchWithRetry calls handleTmdbResponse, which will throw if response is not OK or not JSON.
        const data = await fetchWithRetry(url, options, { listTitle, actionDescription: `fetch user lists to find "${listTitle}"` });

        if (!data.results || !Array.isArray(data.results)) {
            console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Unexpected TMDB response format when fetching lists for "${listTitle}". Data:`, data);
            throw new Error(`Unexpected TMDB response format when fetching lists for "${listTitle}"`);
        }

        const foundList = data.results.find(list => list.name === listTitle);
        // Logging for found/not found can be verbose if called many times, keep it minimal or conditional.
        // if (foundList) console.log(`${LOG_PREFIX} DEBUG: [${FN_NAME}] Found list "${listTitle}" with ID: ${foundList.id}.`);
        // else console.log(`${LOG_PREFIX} DEBUG: [${FN_NAME}] List "${listTitle}" not found.`);
        return foundList ? foundList.id : null;
    } catch (error) {
        if (error.message.startsWith('TMDB API Error') || error.message.startsWith('Unexpected TMDB response format')) {
            throw error;
        }
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Error searching for list ID for "${listTitle}": ${error.message}`, error.stack || '');
        throw new Error(`Failed to get list ID for "${listTitle}": ${error.message}`);
    }
};

/**
 * Searches for a TMDB collection by its name using the v3 API.
 *
 * @async
 * @private
 * @function searchForTmdbCollectionByName
 * @param {string} apiKey - The TMDB API key (v3).
 * @param {string} collectionQueryName - The name or query string for the collection search.
 * @param {string} rawTitleForLog - The original raw title of the item being processed, for logging context.
 * @returns {Promise<number|null>} The ID of the first matching collection, or null if not found or an error occurs.
 */
const searchForTmdbCollectionByName = async (apiKey, collectionQueryName, rawTitleForLog) => { 
    const FN_NAME = "searchForTmdbCollectionByName";
    // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Attempting TMDB Collection search for: "${collectionQueryName}" (Original: "${rawTitleForLog}")`);
    const encodedCollectionName = encodeURIComponent(collectionQueryName);
    const collectionSearchUrl = `${TMDB_API_CONFIG.BASE_URL_V3}/search/collection?api_key=${apiKey}&query=${encodedCollectionName}&page=1`;
    const options = { method: 'GET', headers: { accept: 'application/json' } };

    try {
        const data = await fetchWithRetry(
            collectionSearchUrl,
            options,
            { collectionName: collectionQueryName, actionDescription: `search for collection "${collectionQueryName}"` }
        );
        if (data.results && data.results.length > 0) {
            const foundCollection = data.results[0]; // Taking the first result, TMDB usually orders by relevance.
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Found collection: "${foundCollection.name}" (ID: ${foundCollection.id}) for query "${collectionQueryName}" (Original: "${rawTitleForLog}")`);
            return foundCollection.id;
        }
        // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] No collections found for query: "${collectionQueryName}" (Original: "${rawTitleForLog}")`);
        return null;
    } catch (error) {
        // fetchWithRetry already logs attempts. This logs the final failure of the search.
        console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Collection search failed for "${collectionQueryName}" (Original: "${rawTitleForLog}"): ${error.message}`);
        return null; // Return null on error so getMovieIds can continue its flow.
    }
}

/**
 * Fetches all movie IDs from a given TMDB collection ID using the v3 API.
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
    // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Fetching movies from TMDB Collection ID: ${collectionId} ("${collectionNameForLog}")`);
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
                if (part.media_type === 'movie' && part.id) { // Ensure it's a movie and has an ID
                    movieIds.push(part.id);
                }
            });
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Found ${movieIds.length} movie IDs in collection "${data.name || collectionNameForLog}" (ID: ${collectionId}).`);
        } else {
            // console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] No movie parts found in collection ID ${collectionId} ("${data.name || collectionNameForLog}").`);
        }
        return movieIds;
    } catch (error) {
        console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Error fetching movies from collection ID ${collectionId} ("${collectionNameForLog}"): ${error.message}`);
        return []; // Return empty array on error.
    }
}

/**
 * Takes an array of movie objects (each with a title and optional year),
 * attempts to find corresponding TMDB IDs for each.
 * This process involves:
 * 1. Sanitizing the title and determining a primary search year.
 * 2. Performing a direct movie search on TMDB, trying the primary search year,
 * year + 1, year - 1, and a search without a year.
 * 3. If the initial search fails and the raw title contains " & ", splitting the title
 * into parts and searching for each part individually (also with year variations).
 * 4. If previous searches fail and the title is flagged as 'isLikelyCollection' by the sanitizer,
 * it attempts a TMDB collection search and then fetches movie IDs from that collection.
 *
 * @async
 * @function getMovieIds
 * @param {Array<{title: string, year: string|null}>} moviesListParam - An array of movie objects,
 * where each object has a `title` and an optional `year`.
 * @returns {Promise<{
* successfulIds: Array<number>,
* notFoundTitles: Array<{title: string, year: string|null}>,
* failedToSearchTitles: Array<{title: string, year: string|null, reason: string, details?: string}>,
* attemptedCount: number
* }>} An object containing:
* - `successfulIds`: An array of unique TMDB movie IDs found.
* - `notFoundTitles`: An array of original movie objects that were not found on TMDB after all search attempts.
* - `failedToSearchTitles`: An array of original movie objects for which a search attempt failed due to an error (e.g., missing API key, unexpected error).
* - `attemptedCount`: The total number of movies from `moviesListParam` that were processed.
*/
export const getMovieIds = async (moviesListParam) => {
   const FN_NAME = "getMovieIds";
   
   // Robust check for moviesListParam type to prevent iteration errors
   if (!Array.isArray(moviesListParam)) {
       console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Input 'moviesListParam' is not an array! Received type: ${typeof moviesListParam}, Value:`, moviesListParam);
       return { successfulIds: [], notFoundTitles: [], failedToSearchTitles: [], attemptedCount: 0 };
   }

   const successfulIds = new Set(); // Use a Set to automatically handle duplicate IDs
   const notFoundTitles = [];
   const failedToSearchTitles = [];
   const apiKey = process.env.TMDB_API_KEY; // Ensure TMDB_API_KEY is loaded via dotenv

   console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Starting TMDB ID lookup for ${moviesListParam.length} movies.`);

   if (!apiKey) {
       console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] CRITICAL - TMDB_API_KEY for v3 search is missing! Cannot perform lookups.`);
       // Populate failedToSearchTitles if API key is missing
       moviesListParam.forEach(movie => {
           failedToSearchTitles.push({ 
               title: movie?.title || 'N/A', 
               year: movie?.year || 'N/A', 
               reason: 'TMDB_API_KEY missing' 
           });
       });
       return { successfulIds: [], notFoundTitles, failedToSearchTitles, attemptedCount: moviesListParam.length };
   }

   // Iterate over each movie scraped from the source websites
   for (const movie of moviesListParam) {
       // Safely destructure title and year from the current movie object
       const { title: rawTitle, year: rawScrapedYear } = movie || {}; 
       let movieFoundThisIteration = false; // Flag to track if a TMDB ID was found for the current rawTitle

       try {
           // Skip if the raw title itself is missing
           if (!rawTitle) {
               // console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Skipping movie with no raw title data:`, movie);
               failedToSearchTitles.push({ title: 'N/A (Title Missing)', year: rawScrapedYear || 'N/A', reason: 'Missing title data from scraper' });
               continue;
           }

           // Sanitize the title and determine the best initial search year and if it's likely a collection
           const { sanitizedTitle: initialSanitizedTitle, searchYear: initialSearchYear, isLikelyCollection } = normalizeTitleForSearch(rawTitle, rawScrapedYear);

           if (!initialSanitizedTitle) {
               // console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Skipping movie because title became empty after initial sanitization (Original: "${rawTitle}"):`, movie);
               failedToSearchTitles.push({ title: rawTitle, year: rawScrapedYear || 'N/A', reason: 'Title became empty after initial sanitization' });
               continue;
           }
           
           // console.log(`${LOG_PREFIX} DEBUG: [${FN_NAME}] Processing: "${rawTitle}" (Scraped Year: ${rawScrapedYear || 'N/A'}) -> Initial Sanitized: "${initialSanitizedTitle}" (Search Year: ${initialSearchYear || 'None'}, Likely Collection: ${isLikelyCollection})`);
           
           // --- Attempt 1: Movie Search with initial sanitized title and year variations ---
           // Prepare an array of years to try: the initial search year, year+1, year-1, and null (for no year).
           const searchYearsToTry = [initialSearchYear];
           if (initialSearchYear && /^\d{4}$/.test(initialSearchYear)) { // Check if initialSearchYear is a valid 4-digit year
               searchYearsToTry.push(String(parseInt(initialSearchYear, 10) + 1));
               searchYearsToTry.push(String(parseInt(initialSearchYear, 10) - 1));
           }
           // Filter out null/undefined years and ensure uniqueness, then add `null` if not already present to try a yearless search.
           const uniqueSearchYears = [...new Set(searchYearsToTry.filter(yr => yr != null))]; // `!= null` checks for both null and undefined
           if (!uniqueSearchYears.includes(null)) { // Ensure a search without a year is attempted
               uniqueSearchYears.push(null);
           }


           for (const currentSearchYear of uniqueSearchYears) {
               if (movieFoundThisIteration) break; // If found in a previous year attempt, skip further year variations for this title

               // console.log(`  [TMDBApi][${FN_NAME}] Attempting movie search for: "${initialSanitizedTitle}" with year: ${currentSearchYear || 'Any'}`);
               const encodedTitle = encodeURIComponent(initialSanitizedTitle);
               let movieSearchUrl = `${TMDB_API_CONFIG.BASE_URL_V3}/search/movie?api_key=${apiKey}&query=${encodedTitle}&include_adult=false&language=en-US&page=1`;
               if (currentSearchYear) {
                   movieSearchUrl += `&year=${currentSearchYear}&primary_release_year=${currentSearchYear}`;
               }
               
               try {
                   const movieData = await fetchWithRetry(
                       movieSearchUrl,
                       { method: 'GET', headers: { accept: 'application/json' } },
                       { movieTitle: initialSanitizedTitle, actionDescription: `search for movie "${initialSanitizedTitle}" (Year: ${currentSearchYear || 'Any'})` }
                   );
                   if (movieData.results?.length > 0) {
                       let foundM = movieData.results[0]; // Default to the first, most relevant result from TMDB
                       // If a specific year was used in the search, try to find an exact match within the results.
                       if (currentSearchYear) {
                           const yearMatch = movieData.results.find(r => r.release_date?.startsWith(currentSearchYear));
                           if (yearMatch) foundM = yearMatch;
                       }
                       // console.log(`    [TMDBApi][${FN_NAME}] SUCCESS: Found TMDB Movie ID ${foundM.id} ("${foundM.title}") for query "${initialSanitizedTitle}" (Year: ${currentSearchYear || 'Any'})`);
                       successfulIds.add(foundM.id);
                       movieFoundThisIteration = true;
                   }
               } catch (movieSearchError) {
                   // Errors from fetchWithRetry (after retries or for non-retryable issues) are already logged by it.
                   // No additional logging here unless specific to this search failing.
               }
           }

           // --- Attempt 2: If not found and original title contained '&', split and search parts ---
           // This handles titles like "Film A & Film B" by searching for "Film A" and "Film B" separately.
           if (!movieFoundThisIteration && rawTitle.includes(' & ')) {
               // console.log(`  [TMDBApi][${FN_NAME}] Movie not found for "${initialSanitizedTitle}". Original title contained '&', attempting to split and search parts.`);
               const parts = rawTitle.split(' & ').map(p => p.trim()).filter(p => p.length > 0);
               
               for (const partTitle of parts) {
                   // Sanitize and determine search year for each part individually.
                   const { sanitizedTitle: partSanitized, searchYear: partInitialSearchYear } = normalizeTitleForSearch(partTitle, rawScrapedYear);
                   if (!partSanitized) continue; // Skip if a part becomes empty after sanitization

                   const partSearchYearsToTry = [partInitialSearchYear];
                    if (partInitialSearchYear && /^\d{4}$/.test(partInitialSearchYear)) {
                       partSearchYearsToTry.push(String(parseInt(partInitialSearchYear, 10) + 1));
                       partSearchYearsToTry.push(String(parseInt(partInitialSearchYear, 10) - 1));
                   }
                   const uniquePartSearchYears = [...new Set(partSearchYearsToTry.filter(yr => yr != null))];
                   if (!uniquePartSearchYears.includes(null)) uniquePartSearchYears.push(null);

                   for (const currentPartSearchYear of uniquePartSearchYears) {
                       if (movieFoundThisIteration && parts.length > 1) break; // If one part is found, we might consider the original "multi-title" entry handled.

                       // console.log(`    [TMDBApi][${FN_NAME}] Attempting movie search for part: "${partSanitized}" with year: ${currentPartSearchYear || 'Any'}`);
                       const encodedPartTitle = encodeURIComponent(partSanitized);
                       let partSearchUrl = `${TMDB_API_CONFIG.BASE_URL_V3}/search/movie?api_key=${apiKey}&query=${encodedPartTitle}&include_adult=false&language=en-US&page=1`;
                       if (currentPartSearchYear) partSearchUrl += `&year=${currentPartSearchYear}&primary_release_year=${currentPartSearchYear}`;

                       try {
                           const movieData = await fetchWithRetry( partSearchUrl, { method: 'GET', headers: { accept: 'application/json' } }, { movieTitle: partSanitized, actionDescription: `search for movie part "${partSanitized}" (Year: ${currentPartSearchYear || 'Any'})` });
                           if (movieData.results?.length > 0) {
                               let foundM = movieData.results[0];
                               if (currentPartSearchYear) {
                                   const yearMatch = movieData.results.find(r => r.release_date?.startsWith(currentPartSearchYear));
                                   if (yearMatch) foundM = yearMatch;
                               }
                               // console.log(`      [TMDBApi][${FN_NAME}] SUCCESS (part): Found TMDB Movie ID ${foundM.id} ("${foundM.title}") for part "${partSanitized}"`);
                               successfulIds.add(foundM.id);
                               movieFoundThisIteration = true; 
                               if (uniquePartSearchYears.length > 1) break; // Found this part with a year, no need to try other years for *this part*.
                           }
                       } catch (partSearchError) { /* Logged by fetchWithRetry */ }
                   }
                   if (movieFoundThisIteration && parts.length > 1) break; // If one part of an '&' title is found, stop searching other parts.
               }
           }

           // --- Attempt 3: Collection Search (if still not found AND it's marked as likely a collection) ---
           if (!movieFoundThisIteration && isLikelyCollection) {
               // console.log(`  [TMDBApi][${FN_NAME}] Movie/parts search yielded no results for "${initialSanitizedTitle}". Attempting collection search.`);
               // For collection search, the raw title (or a version more suitable for collection names) might be better.
               const collectionQuery = normalizeTitleForSearch(rawTitle, null).sanitizedTitle || rawTitle; 
               
               const collectionId = await searchForTmdbCollectionByName(apiKey, collectionQuery, rawTitle);
               if (collectionId) {
                   const collectionMovieIds = await getMovieIdsFromTmdbCollection(apiKey, collectionId, collectionQuery);
                   if (collectionMovieIds.length > 0) {
                       // console.log(`    [TMDBApi][${FN_NAME}] Added ${collectionMovieIds.length} movies from collection "${collectionQuery}" for original title "${rawTitle}".`);
                       collectionMovieIds.forEach(id => successfulIds.add(id));
                       movieFoundThisIteration = true; // Mark as found (via collection this time)
                   }
               }
           }

           // If after all attempts (direct movie, split parts, collection) the movie is still not found, add to notFoundTitles.
           if (!movieFoundThisIteration) {
               // console.warn(`  [TMDBApi][${FN_NAME}] FINAL: No TMDB movies or collection parts found for: "${initialSanitizedTitle}" (Original: "${rawTitle}", Original year: ${rawScrapedYear || 'N/A'})`);
               notFoundTitles.push({ title: rawTitle, year: rawScrapedYear });
           }

       } catch (error) { // Catch errors from the outer try block for this specific movie's processing loop
           console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Unexpected error processing movie "${rawTitle}" (${rawScrapedYear || 'N/A'}): ${error.message}`, error.stack || '');
           failedToSearchTitles.push({ title: rawTitle, year: rawScrapedYear, reason: 'Unexpected error in getMovieIds main processing loop', details: error.message });
       }
   }

   console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Finished TMDB ID lookup. Found: ${successfulIds.size} unique IDs, Not Found (original titles): ${notFoundTitles.length}, Failed Search (original titles): ${failedToSearchTitles.length}`);
   return { 
       successfulIds: Array.from(successfulIds), // Convert Set to Array for the return value
       notFoundTitles, 
       failedToSearchTitles,
       attemptedCount: moviesListParam.length 
   };
};

/**
 * Adds or updates items in a TMDB list in batches.
 * This function is called after TMDB IDs for movies have been looked up.
 * It handles potential individual item failures (e.g., "media already taken") differently
 * from critical failures of an entire batch API call (e.g., network errors, 504 timeouts).
 *
 * @async
 * @function updateList
 * @param {object} accessToken - The TMDB user access token object (containing `access_token`).
 * @param {object} listData - An object containing the list's `title`.
 * @param {object} idLookupResult - The result from `getMovieIds`.
 * @param {Array<number>} idLookupResult.successfulIds - Array of TMDB movie IDs to add/update.
 * @param {object} idLookupResult.movieLookupFailures - Object containing `notFoundTitles` and `failedToSearchTitles`.
 * @param {number} idLookupResult.attemptedCount - The number of movies for which ID lookup was attempted.
 * @returns {Promise<{
* itemsAttemptedCount: number,
* itemsSuccessfullyAddedCount: number,
* movieLookupFailures: object
* }>} An object with statistics:
* - `itemsAttemptedCount`: Number of TMDB IDs that were attempted to be added/updated.
* - `itemsSuccessfullyAddedCount`: Number of items TMDB reported as successfully added OR confirmed as already present.
* - `movieLookupFailures`: The passed-through movie lookup failures.
* @throws {Error} If a critical, unrecoverable error occurs during batch processing (e.g., auth error, repeated server errors for a batch).
* The error object will have statistics attached.
*/
const updateList = async (accessToken, listData, idLookupResult) => {
    const FN_NAME = "updateList";
    const listTitle = listData.title;
    let listId;

    // Initialize stats and failures based on the pre-fetched ID lookup results
    let movieLookupFailures = idLookupResult.movieLookupFailures || { notFoundTitles: [], failedToSearchTitles: [] };
    const movieIdsToUpdate = idLookupResult.successfulIds || []; // Ensure it's an array for .length and .slice
    let itemsAttemptedCount = movieIdsToUpdate.length; 
    let itemsSuccessfullyAddedOrConfirmedCount = 0; // Counts items successfully added OR already present

    try {
        // --- Pre-checks ---
        if (!listTitle) {
            throw new Error('Title for list was not provided in the listData.');
        }
        // console.log(`${LOG_PREFIX} DEBUG: [${FN_NAME}] Getting List ID for "${listTitle}"`);
        listId = await getListId(accessToken, listTitle); // Uses fetchWithRetry
        if (!listId) {
            throw new Error(`List with name: "${listTitle}" does not exist and cannot be updated.`);
        }

        // If no valid TMDB IDs were found to update, exit early.
        if (movieIdsToUpdate.length === 0) {
            if (listData.movieData?.length > 0 && idLookupResult.attemptedCount > 0) {
                console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] No TMDB movie IDs were resolved for list "${listTitle}", though ${listData.movieData.length} items were scraped. Skipping update.`);
            } else {
                console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] No movie IDs to add to list "${listTitle}". Skipping update.`);
            }
            return { itemsAttemptedCount, itemsSuccessfullyAddedCount: itemsSuccessfullyAddedOrConfirmedCount, movieLookupFailures };
        }

        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Preparing to update list ID ${listId} ("${listTitle}") with ${itemsAttemptedCount} items.`);
        
        // --- Batch Processing ---
        const BATCH_SIZE = 100; // TMDB API v4 /list/{id}/items often has a limit (e.g., 100-250).
        let anyCriticalBatchFailure = false; // Flag to track if any batch API call critically fails

        for (let i = 0; i < movieIdsToUpdate.length; i += BATCH_SIZE) {
            const batchMovieIds = movieIdsToUpdate.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(movieIdsToUpdate.length / BATCH_SIZE);
            
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Processing batch ${batchNumber}/${totalBatches} for list "${listTitle}" (items ${i + 1} to ${i + batchMovieIds.length})`);

            const url = `${TMDB_API_CONFIG.BASE_URL_V4}/list/${listId}/items`;
            const options = {
                method: 'POST',
                headers: { 
                    accept: 'application/json', 
                    'content-type': 'application/json', 
                    Authorization: `Bearer ${accessToken.access_token}`
                },
                body: JSON.stringify({ 
                    items: batchMovieIds.map(id => ({ media_type: 'movie', media_id: id })) 
                })
            };
            
            try {
                // fetchWithRetry handles HTTP errors and retries for server issues (5xx)
                const responseData = await fetchWithRetry(
                    url,
                    options,
                    { listTitle, actionDescription: `update batch ${batchNumber}/${totalBatches} for list ID ${listId}` }
                );
                
                // Initialize counters for this specific batch's outcome
                let individualItemUnexpectedFailuresCount = 0;
                let individualItemSuccessesOrConfirmedInBatchCount = 0;

                // Process results if the API call was successful and returned expected structure
                if (responseData?.results && Array.isArray(responseData.results)) {
                    const actualFailedItemsDetails = [];
                    responseData.results.forEach(itemResult => {
                        // Check if the item was successfully added OR if it failed because it was "already taken"
                        const isAlreadyTaken = itemResult.success === false && 
                                                itemResult.error?.some(errMsg => typeof errMsg === 'string' && errMsg.toLowerCase().includes('media has already been taken'));
                        
                        if (itemResult.success === true || isAlreadyTaken) {
                            itemsSuccessfullyAddedOrConfirmedCount++; // Increment global list counter
                            individualItemSuccessesOrConfirmedInBatchCount++; // Increment batch-specific counter
                        } else {
                            individualItemUnexpectedFailuresCount++;
                            actualFailedItemsDetails.push(itemResult); // Collect details of actual, unexpected failures
                        }
                    });
                    if (individualItemUnexpectedFailuresCount > 0) {
                        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" processed. Items confirmed/added: ${individualItemSuccessesOrConfirmedInBatchCount}. Unexpected item failures: ${individualItemUnexpectedFailuresCount}.`);
                    } else {
                        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" processed. All ${individualItemSuccessesOrConfirmedInBatchCount} items in batch were successfully added or already present.`);
                    }
                } else if (responseData && typeof responseData.success === 'boolean' && responseData.success === false) {
                    // Case: TMDB returns a top-level `success: false` for the whole batch, even on HTTP 2xx.
                    console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" reported overall failure by TMDB (e.g., top-level success:false). Response:`, responseData);
                    anyCriticalBatchFailure = true; // Treat this as a critical failure for this batch.
                } else if (responseData && typeof responseData.success === 'boolean' && responseData.success === true && !responseData.results) {
                    // Case: TMDB returns overall success for the batch without individual item statuses.
                    // Assume all items in this batch were processed as intended (added or were already there).
                    console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" reported overall success by TMDB. Assuming all ${batchMovieIds.length} items in batch were processed.`);
                    itemsSuccessfullyAddedOrConfirmedCount += batchMovieIds.length;
                    individualItemSuccessesOrConfirmedInBatchCount = batchMovieIds.length;
                } else if (!responseData || (!Array.isArray(responseData.results) && typeof responseData.success !== 'boolean')) {
                        // Case: Response format from TMDB was unexpected after a successful HTTP call.
                        console.warn(`${LOG_PREFIX} WARN: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" processed, but TMDB response format was unexpected. Response:`, responseData);
                        anyCriticalBatchFailure = true; // Treat unexpected format as a critical issue for this batch.
                }

                // Log summary for the current batch if no critical failure was flagged for its API call/content.
                if (!anyCriticalBatchFailure) { 
                    console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Batch ${batchNumber} for list "${listTitle}" processed. Items confirmed/added in batch: ${individualItemSuccessesOrConfirmedInBatchCount}. Unexpected failures in batch: ${individualItemUnexpectedFailuresCount}.`);
                }

            } catch (batchError) { // This catches critical errors from fetchWithRetry (e.g., after all retries, or non-retryable 4xx errors)
                console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] CRITICAL error processing batch ${batchNumber} for list "${listTitle}" after retries: ${batchError.message}`);
                anyCriticalBatchFailure = true;
                // If an authentication/authorization error occurs, stop processing further batches for this list.
                if (batchError.message.includes("(401)") || batchError.message.includes("(403)")) {
                    console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Authentication/Authorization error during batch update. Stopping further batches for list "${listTitle}".`);
                    break; // Exit the for-loop for batches of this list
                }
            }

            // Add delay between batches if there are more batches to process and the loop wasn't broken.
            if (i + BATCH_SIZE < movieIdsToUpdate.length) {
                    await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay
            }
        }

        // After all batches are processed, check if any critical failure occurred.
        if (anyCriticalBatchFailure) {
            const error = new Error(`One or more batches had critical API failures for list "${listTitle}"`);
            // Attach collected stats to the error for reporting purposes.
            error.movieLookupFailures = movieLookupFailures;
            error.itemsAttemptedCount = itemsAttemptedCount;
            error.itemsSuccessfullyAddedCount = itemsSuccessfullyAddedOrConfirmedCount;
            throw error;
        } else {
            console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] All item batches for list "${listTitle}" (ID: ${listId}) were processed. Total items confirmed on list (added or already present): ${itemsSuccessfullyAddedOrConfirmedCount}/${itemsAttemptedCount}.`);
        }
        // Return all relevant stats on successful completion of all batches.
        return { itemsAttemptedCount, itemsSuccessfullyAddedCount: itemsSuccessfullyAddedOrConfirmedCount, movieLookupFailures };

    } catch (error) { // Outer catch for setup errors (e.g., getListId) or errors propagated from critical batch failures
        const currentListTitle = listData?.title || 'Unknown Title (listData or listData.title missing in catch)';
        // Ensure all relevant stats are attached to the error object before re-throwing.
        error.movieLookupFailures = error.movieLookupFailures || movieLookupFailures;
        error.itemsAttemptedCount = error.itemsAttemptedCount === undefined ? itemsAttemptedCount : error.itemsAttemptedCount;
        error.itemsSuccessfullyAddedCount = error.itemsSuccessfullyAddedCount === undefined ? itemsSuccessfullyAddedOrConfirmedCount : error.itemsSuccessfullyAddedCount;
        
        // Re-throw known, contextualized errors directly.
        if (error.message.startsWith('TMDB API Error') || 
            error.message.startsWith('One or more batches had critical API failures') ||
            error.message.includes('not provided in the listData') || 
            error.message.includes('does not exist and cannot be updated') || 
            error.message.startsWith('Failed to get list ID for') ) {
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
 * It first calls `getMovieIds` to find TMDB IDs for the provided movie data.
 * Then, it creates the list if it doesn't exist.
 * Finally, it calls `updateList` to add/update items in the list using the found TMDB movie IDs.
 * This function gathers and returns comprehensive processing statistics.
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
        const idLookupResult = await getMovieIds(listData.movieData); 
        
        // Populate stats from getMovieIds result
        processingStats.tmdbIdsFoundCount = idLookupResult.successfulIds?.length || 0;
        processingStats.movieLookupFailures = {
            notFoundTitles: idLookupResult.notFoundTitles || [],
            failedToSearchTitles: idLookupResult.failedToSearchTitles || []
        };
        
        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] For list "${listData.title}", TMDB IDs found: ${processingStats.tmdbIdsFoundCount}. Original items for lookup: ${idLookupResult.attemptedCount}.`);

        // Pass the full idLookupResult (which includes successfulIds) to updateList
        const updateResult = await updateList(accessToken, listData, idLookupResult); 
        
        // Populate remaining stats from updateList result
        processingStats.itemsAttemptedCount = updateResult.itemsAttemptedCount;
        processingStats.itemsSuccessfullyAddedCount = updateResult.itemsSuccessfullyAddedCount;
        // movieLookupFailures in processingStats is already set from the initial idLookupResult

        console.log(`${LOG_PREFIX} INFO: [${FN_NAME}] Finished processing for list "${listData.title}". TMDB IDs Found: ${processingStats.tmdbIdsFoundCount}, Items Confirmed on List: ${processingStats.itemsSuccessfullyAddedCount}/${processingStats.itemsAttemptedCount}`);
        return processingStats;

    } catch (error) {
        console.error(`${LOG_PREFIX} ERROR: [${FN_NAME}] Error during processing for list "${listData.title}": ${error.message}`, error.stack || '');
        // Ensure all available stats are attached to the error object before re-throwing
        error.scrapedItemsCount = error.scrapedItemsCount === undefined ? processingStats.scrapedItemsCount : error.scrapedItemsCount;
        error.tmdbIdsFoundCount = error.tmdbIdsFoundCount === undefined ? processingStats.tmdbIdsFoundCount : error.tmdbIdsFoundCount;
        error.itemsAttemptedCount = error.itemsAttemptedCount === undefined ? processingStats.itemsAttemptedCount : error.itemsAttemptedCount;
        error.itemsSuccessfullyAddedCount = error.itemsSuccessfullyAddedCount === undefined ? processingStats.itemsSuccessfullyAddedCount : error.itemsSuccessfullyAddedCount;
        
        if (!error.movieLookupFailures && (processingStats.movieLookupFailures.notFoundTitles?.length > 0 || processingStats.movieLookupFailures.failedToSearchTitles?.length > 0)) {
            error.movieLookupFailures = processingStats.movieLookupFailures;
        }
        throw error; // Re-throw the (potentially augmented) error
    }
};
