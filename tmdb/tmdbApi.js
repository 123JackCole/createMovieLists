import { TMDB_API_CONFIG } from '../config.js';
import { normalizeTitleForSearch } from '../utils/titleSanitizer.js';

// Function for handling responses from TMDB
// Used in createList and updateList
// Needed to parse errors received from TMDB API
const handleTmdbResponse = async (response, contextTitle, actionDescription) => {
    let responseData;
    if (!response.ok) {
        let errorBodyText = `TMDB API Error ${response.status} ${response.statusText}`;
        try {
            const tempErrorBody = await response.text();
            errorBodyText = tempErrorBody.substring(0, 500) || errorBodyText;
        } catch (e) {
            console.warn(`Could not read error body for ${actionDescription} on "${contextTitle}". Status: ${response.status}`);
        }
        const error = new Error(`TMDB API Error (${response.status}) for ${actionDescription} on "${contextTitle}": ${errorBodyText}`);
        error.status = response.status;
        throw error;
    }
    try {
        responseData = await response.json();
    } catch (jsonError) {
        let responseText = "Could not read response text after JSON parse failure.";
        try {
            // This is tricky as response might be consumed. Best to get text first if unsure.
            // For now, let's assume if .json() fails on an OK response, it's a content issue.
             responseText = await response.text(); // This might fail if stream already read by .json()
        } catch (textReadError) { /* ignore */ }
        console.error(`TMDB API call for ${actionDescription} on "${contextTitle}" was 'ok' (Status: ${response.status}) but failed to parse JSON response. Response Text (first 500 chars):`, responseText.substring(0, 500));
        throw new Error(`TMDB API 'ok' (Status: ${response.status}) for ${actionDescription} on "${contextTitle}" but response was not valid JSON.`);
    }
    return responseData;
};

// Helper function for fetch with retry logic
const fetchWithRetry = async (url, options, context, maxRetries = 3, initialDelay = 2000) => {
    let attempt = 0;
    let currentDelay = initialDelay;
    const contextIdentifier = context.listTitle || context.collectionName || context.movieTitle || "item";

    while (attempt < maxRetries) {
        attempt++;
        try {
            // console.log(`Attempt ${attempt}/${maxRetries} to ${context.actionDescription} for "${contextIdentifier}"`);
            const response = await fetch(url, options);
            if ([502, 503, 504].includes(response.status)) {
                const error = new Error(`Retryable server error: ${response.status} ${response.statusText} while trying to ${context.actionDescription} for "${contextIdentifier}"`);
                error.status = response.status;
                let errorBody = "Could not read error body.";
                try { errorBody = await response.text(); } catch(e) { /* ignore */ }
                console.warn(error.message, "Body:", errorBody.substring(0,200));
                throw error; 
            }
            return await handleTmdbResponse(response, contextIdentifier, context.actionDescription);
        } catch (error) {
            console.warn(`Attempt ${attempt} for "${context.actionDescription}" on "${contextIdentifier}" failed: ${error.message}`);
            const isRetryableHttpError = error.status && [502, 503, 504].includes(error.status);
            const isNetworkError = !error.status && (error.name === 'FetchError' || error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('failed to fetch'));
            if ((isRetryableHttpError || isNetworkError) && attempt < maxRetries) {
                console.log(`Retrying in ${currentDelay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                currentDelay *= 2;
            } else {
                throw error; 
            }
        }
    }
    throw new Error(`All retry attempts exhausted for "${context.actionDescription}" on "${contextIdentifier}".`);
};

// Creates a new list
const createList = async (accessToken, listTitle, listDescription) => {
    try {
        // check if list already exists
        const existingListId = await getListId(accessToken, listTitle); // Use a different variable name for clarity
        if (existingListId) {
            const errorMessage = `Failed to create list: The list named "${listTitle}" already exists with ID ${existingListId}.`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }

        const url = `${TMDB_API_CONFIG.BASE_URL_V4}/list`;
        const options = {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken.access_token}`
            },
            body: JSON.stringify({
                name: `${listTitle}`,
                iso_639_1: "en",
                description: `${listDescription}`,
                public: true
            })
        };

        const response = await fetch(url, options);
        const responseData = await handleTmdbResponse(response, listTitle, "create list");
        
        if (!response.ok) {
            console.error(`Failed to create list "${listTitle}". Status: ${response.status}. Response:`, responseData);
            throw new Error(`TMDB API Error (${response.status}) creating list "${listTitle}": ${JSON.stringify(responseData)}`);
        } else {
            console.log(`List "${listTitle}" created successfully. ID: ${responseData.id}`);
            return responseData.id;
        }

    } catch (error) {
        if (error.message.startsWith('TMDB API Error')) {
            throw error;
        }
        console.error(`Unexpected error in createList for "${listTitle}":`, error);
        throw new Error(`Failed to create list "${listTitle}": ${error.message}`);
    }
}

// Given a listTitle, returns the id of the matching list
const getListId = async (accessToken, listTitle) => {
    try {
        const url = `${TMDB_API_CONFIG.BASE_URL_V4}/account/${accessToken.account_id}/lists?page=1`;
        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken.access_token}`
            }
        };

        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = await response.text(); // Get text for more detailed error
            console.error(`Failed to fetch lists. Status: ${response.status} ${response.statusText}. Response: ${errorText}`);
            throw new Error(`Failed to fetch lists: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        if (!data.results || !Array.isArray(data.results)) {
            throw new Error(`Unexpected response format: ${JSON.stringify(data)}`);
        }

        const foundList = data.results.find(list => list.name === listTitle);
        return foundList ? foundList.id : null;

    } catch (error) {
        if (error.message.startsWith('Failed to fetch lists') || error.message.startsWith('Unexpected response format')) {
            throw error;
        }
        console.error(`Error in getListId for list title "${listTitle}":`, error.message);
        throw new Error(`Failed to get list ID for "${listTitle}": ${error.message}`);
    }
};


// Adds movies to an existing list
const updateList = async (accessToken, listData, idLookupResult) => {
    const listTitle = listData.title;
    let listId;
    let movieLookupFailures = idLookupResult.movieLookupFailures || { notFoundTitles: [], failedToSearchTitles: [] };
    let itemsAttemptedCount = idLookupResult.successfulIds?.length || 0;
    let itemsSuccessfullyAddedOrConfirmedCount = 0; // Renamed for clarity

    try {
        if (!listTitle) throw new Error('Title for list was not provided in the listData.');
        listId = await getListId(accessToken, listTitle);
        if (!listId) throw new Error(`List with name: "${listTitle}" does not exist and cannot be updated.`);

        const movieIdsToUpdate = idLookupResult.successfulIds;

        if (movieIdsToUpdate.length === 0) {
            if (listData.movieData?.length > 0) {
                console.warn(`No TMDB movie IDs were resolved for list "${listTitle}", though scraped data existed. Skipping update.`);
            } else {
                console.log(`No movie data provided to find TMDB IDs for list "${listTitle}". Skipping update.`);
            }
            return { itemsAttemptedCount, itemsSuccessfullyAddedCount: itemsSuccessfullyAddedOrConfirmedCount, movieLookupFailures };
        }

        console.log(`Preparing to update list ID ${listId} ("${listTitle}") with ${movieIdsToUpdate.length} items.`);
        const BATCH_SIZE = 100;
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
                const responseData = await fetchWithRetry( url, options, { listTitle, actionDescription: `update batch ${batchNumber}/${totalBatches}` });
                
                let individualItemFailuresInBatchCount = 0; // Count actual failures in this batch
                let individualItemSuccessesOrAlreadyTakenInBatchCount = 0;

                if (responseData?.results && Array.isArray(responseData.results)) {
                    const actualFailedItemsInThisBatch = [];
                    responseData.results.forEach(itemResult => {
                        const isAlreadyTaken = itemResult.success === false && 
                                               itemResult.error && 
                                               itemResult.error.some(errMsg => typeof errMsg === 'string' && errMsg.toLowerCase().includes('media has already been taken'));
                        
                        if (itemResult.success === true || isAlreadyTaken) {
                            itemsSuccessfullyAddedOrConfirmedCount++; // Increment global counter
                            individualItemSuccessesOrAlreadyTakenInBatchCount++;
                        } else {
                            individualItemFailuresInBatchCount++;
                            actualFailedItemsInThisBatch.push(itemResult); // Collect actual failures
                        }
                    });
                    if (individualItemFailuresInBatchCount > 0) {
                        console.warn(`Batch ${batchNumber} for list "${listTitle}": ${individualItemFailuresInBatchCount} item(s) had unexpected failures. Items confirmed/added: ${individualItemSuccessesOrAlreadyTakenInBatchCount}. Failures:`, actualFailedItemsInThisBatch);
                    }
                } else if (responseData && typeof responseData.success === 'boolean' && responseData.success === false) {
                    console.warn(`Batch ${batchNumber} for list "${listTitle}" reported overall failure by TMDB. Response:`, responseData);
                    anyCriticalBatchFailure = true;
                } else if (responseData && typeof responseData.success === 'boolean' && responseData.success === true && !responseData.results) {
                    console.log(`Batch ${batchNumber} for list "${listTitle}" reported overall success by TMDB. Assuming all ${batchMovieIds.length} items in batch were processed (added or already present).`);
                    itemsSuccessfullyAddedOrConfirmedCount += batchMovieIds.length; // Assume all in batch are now "confirmed"
                    individualItemSuccessesOrAlreadyTakenInBatchCount = batchMovieIds.length;
                } else if (!responseData || (!Array.isArray(responseData.results) && typeof responseData.success !== 'boolean')) {
                     console.warn(`Batch ${batchNumber} for list "${listTitle}" processed, but TMDB response format was unexpected. Response:`, responseData);
                     anyCriticalBatchFailure = true;
                }

                if (!anyCriticalBatchFailure) {
                    console.log(`Batch ${batchNumber} for list "${listTitle}" processed. Items confirmed/added in batch: ${individualItemSuccessesOrAlreadyTakenInBatchCount}. Unexpected failures in batch: ${individualItemFailuresInBatchCount}.`);
                }

            } catch (batchError) {
                console.error(`CRITICAL error processing batch ${batchNumber} for list "${listTitle}" after retries: ${batchError.message}`);
                anyCriticalBatchFailure = true;
                if (batchError.message.includes("(401)") || batchError.message.includes("(403)")) {
                    console.error("Authentication/Authorization error during batch update. Stopping further batches for this list.");
                    break; 
                }
            }
            if (i + BATCH_SIZE < movieIdsToUpdate.length) {
                 await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        if (anyCriticalBatchFailure) {
            const error = new Error(`One or more batches had critical API failures for list "${listTitle}"`);
            error.movieLookupFailures = movieLookupFailures;
            error.itemsAttemptedCount = itemsAttemptedCount;
            error.itemsSuccessfullyAddedCount = itemsSuccessfullyAddedOrConfirmedCount; // Use the updated counter
            throw error;
        } else {
            console.log(`All item batches for list "${listTitle}" (ID: ${listId}) were processed. Total items confirmed on list (added or already present): ${itemsSuccessfullyAddedOrConfirmedCount}/${itemsAttemptedCount}.`);
        }
        return { itemsAttemptedCount, itemsSuccessfullyAddedCount: itemsSuccessfullyAddedOrConfirmedCount, movieLookupFailures };

    } catch (error) {
        const currentListTitle = listData?.title || 'Unknown Title';
        if (!error.movieLookupFailures && (movieLookupFailures.notFoundTitles.length > 0 || movieLookupFailures.failedToSearchTitles.length > 0)) {
            error.movieLookupFailures = movieLookupFailures;
        }
        if (error.itemsAttemptedCount === undefined) error.itemsAttemptedCount = itemsAttemptedCount;
        if (error.itemsSuccessfullyAddedCount === undefined) error.itemsSuccessfullyAddedCount = itemsSuccessfullyAddedOrConfirmedCount;
        
        if (error.message.startsWith('TMDB API Error') || /* ... other known error prefixes ... */ error.message.startsWith('One or more batches had critical API failures')) {
            throw error;
        }
        console.error(`Unexpected error in updateList for list "${currentListTitle}":`, error.message, error.stack);
        const newError = new Error(`Failed to update list "${currentListTitle}" (unexpected): ${error.message}`);
        newError.movieLookupFailures = error.movieLookupFailures;
        newError.itemsAttemptedCount = error.itemsAttemptedCount;
        newError.itemsSuccessfullyAddedCount = error.itemsSuccessfullyAddedCount;
        throw newError;
    }
};

// --- New Helper Functions for Collection Search ---
const searchForTmdbCollectionByName = async (apiKey, collectionQueryName, rawTitleForLog) => {
    const encodedCollectionName = encodeURIComponent(collectionQueryName);
    const collectionSearchUrl = `${TMDB_API_CONFIG.BASE_URL_V3}/search/collection?api_key=${apiKey}&query=${encodedCollectionName}&page=1`;
    const options = { method: 'GET', headers: { accept: 'application/json' } };

    try {
        // Using fetchWithRetry for collection search as well
        const data = await fetchWithRetry(
            collectionSearchUrl,
            options,
            { collectionName: collectionQueryName, actionDescription: "search for collection" }
        );

        if (data.results && data.results.length > 0) {
            // Heuristic: take the first result. Could be improved with string similarity if needed.
            const foundCollection = data.results[0];
            console.log(`Found collection: "${foundCollection.name}" (ID: ${foundCollection.id}) for query "${collectionQueryName}"`);
            return foundCollection.id;
        }
        console.log(`No collections found for query: "${collectionQueryName}"`);
        return null;
    } catch (error) {
        console.error(`Error during collection search for "${collectionQueryName}" (Original: "${rawTitleForLog}"): ${error.message}`);
        return null; // Return null on error so getMovieIds can continue
    }
}

const getMovieIdsFromTmdbCollection = async (apiKey, collectionId, collectionNameForLog) => {
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
                // Only add actual movies that have an ID
                if (part.media_type === 'movie' && part.id) {
                    movieIds.push(part.id);
                }
            });
            console.log(`Found ${movieIds.length} movie IDs in collection "${data.name || collectionNameForLog}".`);
        } else {
            console.log(`No movie parts found in collection ID ${collectionId} ("${data.name || collectionNameForLog}").`);
        }
        return movieIds;
    } catch (error) {
        console.error(`Error fetching movies from collection ID ${collectionId} ("${collectionNameForLog}"): ${error.message}`);
        return []; // Return empty array on error
    }
}

// Takes an array of movie titles and years
// Outputs array of TMDB ids of those movies
const getMovieIds = async (accessToken, moviesList) => {
    const successfulIds = new Set();
    const notFoundTitles = [];
    const failedToSearchTitles = [];
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
        console.error("CRITICAL: TMDB_API_KEY for v3 search is missing in getMovieIds!");
        moviesList.forEach(movie => {
            failedToSearchTitles.push({ title: movie.title, year: movie.year, reason: 'TMDB_API_KEY missing' });
        });
        return { successfulIds: [], notFoundTitles, failedToSearchTitles, attemptedCount: moviesList.length };
    }

    for (const movie of moviesList) {
        const { title: rawTitle, year: rawScrapedYear } = movie;
        let movieFound = false;

        try {
            if (!rawTitle) {
                failedToSearchTitles.push({ title: 'N/A (Title Missing)', year: rawScrapedYear || 'N/A', reason: 'Missing title data' });
                continue;
            }

            const { sanitizedTitle, searchYear: initialSearchYear, isLikelyCollection } = normalizeTitleForSearch(rawTitle, rawScrapedYear);

            if (!sanitizedTitle) {
                failedToSearchTitles.push({ title: rawTitle, year: rawScrapedYear || 'N/A', reason: 'Title became empty after sanitization' });
                continue;
            }
            
            const searchYearsToTry = [initialSearchYear];
            if (initialSearchYear && /^\d{4}$/.test(initialSearchYear)) { // If initialSearchYear is a valid 4-digit year
                searchYearsToTry.push(String(parseInt(initialSearchYear, 10) + 1));
                searchYearsToTry.push(String(parseInt(initialSearchYear, 10) - 1));
            }
            // Remove null/undefined and duplicates from searchYearsToTry
            const uniqueSearchYears = [...new Set(searchYearsToTry.filter(yr => yr !== null && yr !== undefined))];
            if (uniqueSearchYears.length === 0) uniqueSearchYears.push(null); // Ensure at least one search (without year) if no valid years

            console.log(`Processing: "${rawTitle}" (Scraped Year: ${rawScrapedYear || 'N/A'}) -> Sanitized: "${sanitizedTitle}" (Likely Collection: ${isLikelyCollection})`);

            for (const currentSearchYear of uniqueSearchYears) {
                if (movieFound) break; // Stop trying if already found

                console.log(`  Attempting TMDB movie search for: "${sanitizedTitle}" with year: ${currentSearchYear || 'Any'}`);
                
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
                        // If a specific year was searched, try to find an exact match or closer one
                        if (currentSearchYear) {
                            const yearMatch = movieData.results.find(r => r.release_date?.startsWith(currentSearchYear));
                            if (yearMatch) {
                                foundM = yearMatch;
                            } else if (foundM.release_date && !foundM.release_date.startsWith(currentSearchYear)) {
                                console.warn(`    Found TMDB movie "${foundM.title} (${foundM.release_date?.substring(0,4)})" for "${sanitizedTitle}", but year ${currentSearchYear} did not match results closely. Using first result.`);
                            }
                        }
                        console.log(`    SUCCESS: Found TMDB Movie ID ${foundM.id} ("${foundM.title}") for query "${sanitizedTitle}" (Year: ${currentSearchYear || 'Any'})`);
                        successfulIds.add(foundM.id);
                        movieFound = true;
                    } else {
                        console.log(`    No results for "${sanitizedTitle}" with year: ${currentSearchYear || 'Any'}`);
                    }
                } catch (movieSearchError) {
                    console.warn(`    Movie search failed for "${sanitizedTitle}" with year ${currentSearchYear || 'Any'}: ${movieSearchError.message}`);
                }
            } // End of year retry loop

            // --- Collection Search Attempt (if movie not found via any year attempt AND it's likely a collection) ---
            if (!movieFound && isLikelyCollection) {
                console.log(`  Movie search yielded no results for "${sanitizedTitle}". Attempting collection search as it's marked 'likely a collection'.`);
                const collectionQuery = sanitizedTitle.length > 3 ? sanitizedTitle : rawTitle.split('/')[0].trim(); // Or use rawTitle for collection search
                const collectionId = await searchForTmdbCollectionByName(apiKey, collectionQuery, rawTitle);
                if (collectionId) {
                    const collectionMovieIds = await getMovieIdsFromTmdbCollection(apiKey, collectionId, collectionQuery);
                    if (collectionMovieIds.length > 0) {
                        console.log(`    Added ${collectionMovieIds.length} movies from collection "${collectionQuery}" to results for original title "${rawTitle}".`);
                        collectionMovieIds.forEach(id => successfulIds.add(id));
                        movieFound = true; // Mark as found (via collection this time)
                    } else {
                        console.log(`    Collection "${collectionQuery}" found, but it contained no movie parts or movies could not be extracted.`);
                    }
                }
            }

            if (!movieFound) {
                console.warn(`  FINAL: No TMDB movies or collection parts found for: "${sanitizedTitle}" (Original: "${rawTitle}", Original year: ${rawScrapedYear || 'N/A'})`);
                notFoundTitles.push({ title: rawTitle, year: rawScrapedYear });
            }

        } catch (error) { // Catch errors from the outer try block for this movie's processing
            console.error(`Unexpected error processing movie "${rawTitle}" (${rawScrapedYear || 'N/A'}):`, error.message, error.stack);
            failedToSearchTitles.push({ title: rawTitle, year: rawScrapedYear, reason: 'Unexpected error in getMovieIds loop', details: error.message });
        }
    }

    return { 
        successfulIds: Array.from(successfulIds), 
        notFoundTitles, 
        failedToSearchTitles,
        attemptedCount: moviesList.length 
    };
};

// Takes listData object as input
export const createOrUpdateList = async (accessToken, listData) => {
    // Initialize stats object that will be returned or attached to an error
    let processingStats = {
        itemsAttemptedCount: 0,
        itemsSuccessfullyAddedCount: 0,
        movieLookupFailures: { notFoundTitles: [], failedToSearchTitles: [] },
        scrapedItemsCount: listData.movieData?.length || 0,
        tmdbIdsFoundCount: 0 // This will be set after getMovieIds
    };

    try {
        let listId = await getListId(accessToken, listData.title);
        if (!listId) {
            console.log(`List "${listData.title}" not found. Attempting to create...`);
            listId = await createList(accessToken, listData.title, listData.description);
            if (!listId) {
                throw new Error(`List "${listData.title}" was not found and an ID was not returned after attempting creation.`);
            }
        } else {
            console.log(`List "${listData.title}" found with ID ${listId}. Proceeding to update.`);
        }

        // Call getMovieIds ONCE here to get IDs and lookup failures
        const idLookupResult = await getMovieIds(accessToken, listData.movieData);
        
        // Populate stats from getMovieIds result
        processingStats.tmdbIdsFoundCount = idLookupResult.successfulIds?.length || 0;
        processingStats.movieLookupFailures = {
            notFoundTitles: idLookupResult.notFoundTitles || [],
            failedToSearchTitles: idLookupResult.failedToSearchTitles || []
        };
        
        // Pass the full idLookupResult (which includes successfulIds) to updateList
        const updateResult = await updateList(accessToken, listData, idLookupResult); 
        
        // Populate remaining stats from updateList result
        processingStats.itemsAttemptedCount = updateResult.itemsAttemptedCount;
        processingStats.itemsSuccessfullyAddedCount = updateResult.itemsSuccessfullyAddedCount;
        // movieLookupFailures in processingStats is already set from the initial idLookupResult

        console.log(`Finished createOrUpdateList for "${listData.title}". TMDB IDs Found: ${processingStats.tmdbIdsFoundCount}, Items Added: ${processingStats.itemsSuccessfullyAddedCount}/${processingStats.itemsAttemptedCount}`);
        return processingStats;

    } catch (error) {
        console.error(`Error during createOrUpdateList for "${listData.title}": ${error.message}`);
        // Ensure all calculated stats are attached to the error object before re-throwing
        if (error.scrapedItemsCount === undefined) error.scrapedItemsCount = processingStats.scrapedItemsCount;
        if (error.tmdbIdsFoundCount === undefined) error.tmdbIdsFoundCount = processingStats.tmdbIdsFoundCount; // Will be 0 if error before getMovieIds
        if (error.itemsAttemptedCount === undefined) error.itemsAttemptedCount = processingStats.itemsAttemptedCount; // Will be 0 if error before updateList
        if (error.itemsSuccessfullyAddedCount === undefined) error.itemsSuccessfullyAddedCount = processingStats.itemsSuccessfullyAddedCount; // Will be 0
        
        // If movieLookupFailures were gathered before the error, attach them.
        // If error already has them (e.g., from updateList), don't overwrite unless current ones are more complete.
        if (!error.movieLookupFailures && (processingStats.movieLookupFailures.notFoundTitles.length > 0 || processingStats.movieLookupFailures.failedToSearchTitles.length > 0)) {
            error.movieLookupFailures = processingStats.movieLookupFailures;
        }
        throw error;
    }
};