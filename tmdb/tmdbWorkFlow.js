import { authenticateForTMDB } from './tmdbAuth.js';
import { createOrUpdateList } from './tmdbApi.js'; // This returns detailed stats
import { writeFailureReport } from '../utils/failureReportWriter.js';
import { writeMultipleMatchesReport } from '../utils/multipleMatchesReportWriter.js';

const LOG_PREFIX = "[TMDBWorkflow]";

/**
 * Processes an array of scraped movie data, authenticates with TMDB,
 * then creates or updates TMDB lists for each data set.
 * It collects statistics on the processing of each list and generates a summary report
 * as well as a detailed report for movie ID lookup failures.
 *
 * @async
 * @function processScrapedData
 * @param {Array<{title: string, description: string, movieData: Array<{title: string, year: string|null}>}>} scrapedDataArray
 * An array of objects, where each object represents a list to be processed.
 * Each object should contain:
 * - `title`: The title for the TMDB list.
 * - `description`: The description for the TMDB list.
 * - `movieData`: An array of movie objects (e.g., `{title: string, year: string|null}`) scraped from a source.
 * @returns {Promise<void>} A promise that resolves when all processing is complete.
 * The function primarily performs side effects like logging, API calls, and file writing.
 */
export const processScrapedData = async (scrapedDataArray) => {
    let accessToken;
    try {
        console.log(`${LOG_PREFIX} INFO: Authenticating with TMDB...`);
        accessToken = await authenticateForTMDB();
        console.log(`${LOG_PREFIX} INFO: TMDB Authentication successful.`);
    } catch (authError) {
        console.error(`${LOG_PREFIX} ERROR: TMDB Authentication failed. Cannot process lists. Error: ${authError.message}`, authError.stack || '');
        return; // Stop processing if authentication fails
    }

    // Array to store detailed statistics for each list processed
    const overallProcessingStats = [];

    // Loop through each list's data prepared from scraping
    for (const listData of scrapedDataArray) {
        const listTitle = listData.title; // For cleaner access

        // Initialize stats for the current list
        let listStats = {
            title: listTitle,
            scrapedItemsCount: listData.movieData?.length || 0,
            tmdbIdsFoundCount: 0,
            itemsAttemptedAddToTmdb: 0,
            itemsSuccessfullyAddedToTmdb: 0,
            status: 'Pending', // Initial status
            errorReason: null,
            movieLookupFailures: { 
                notFoundTitles: [], 
                failedToSearchTitles: [], 
                multipleMatches: [] 
            }
        };

        // Validate essential listData properties
        if (!listTitle || !listData.movieData) {
            console.error(`${LOG_PREFIX} ERROR: Skipping invalid list data (missing title or movieData):`, listData);
            listStats.status = 'Skipped (Invalid Data)';
            listStats.errorReason = 'Invalid list data object (missing title or movieData)';
            overallProcessingStats.push(listStats);
            continue; // Move to the next listData item
        }
        
        try {
            console.log(`\n${LOG_PREFIX} INFO: Processing list: "${listTitle}"...`);
            // createOrUpdateList handles getting TMDB IDs, creating/updating the list, and adding items.
            // It returns a detailed statistics object.
            const resultFromApi = await createOrUpdateList(accessToken, listData);
            
            // Populate listStats from the result
            listStats.tmdbIdsFoundCount = resultFromApi.tmdbIdsFoundCount || 0;
            listStats.itemsAttemptedAddToTmdb = resultFromApi.itemsAttemptedCount || 0;
            listStats.itemsSuccessfullyAddedToTmdb = resultFromApi.itemsSuccessfullyAddedCount || 0;
            listStats.movieLookupFailures = resultFromApi.movieLookupFailures || { notFoundTitles: [], failedToSearchTitles: [] };
            listStats.status = 'Processed'; // Mark as processed
            if (listStats.movieLookupFailures.notFoundTitles.length > 0 || listStats.movieLookupFailures.failedToSearchTitles.length > 0) {
                listStats.status += ' (with movie lookup failures - see report)';
            }
            if (listStats.itemsAttemptedAddToTmdb > 0 && listStats.itemsSuccessfullyAddedToTmdb < listStats.itemsAttemptedAddToTmdb) {
                 listStats.status += ' (with item addition failures - see logs)';
            }
            
        } catch (error) {
            console.error(`${LOG_PREFIX} ERROR: Failed to critically process list "${listTitle}": ${error.message}`);
            listStats.status = 'Failed Critically';
            listStats.errorReason = error.message;
            // Capture stats even on failure if they were attached to the error object by createOrUpdateList
            if (error.scrapedItemsCount !== undefined) listStats.scrapedItemsCount = error.scrapedItemsCount;
            if (error.tmdbIdsFoundCount !== undefined) listStats.tmdbIdsFoundCount = error.tmdbIdsFoundCount;
            if (error.itemsAttemptedCount !== undefined) listStats.itemsAttemptedAddToTmdb = error.itemsAttemptedCount;
            if (error.itemsSuccessfullyAddedCount !== undefined) listStats.itemsSuccessfullyAddedToTmdb = error.itemsSuccessfullyAddedCount;
            if (error.movieLookupFailures) listStats.movieLookupFailures = error.movieLookupFailures;
        }
        overallProcessingStats.push(listStats); // Add this list's stats to the overall collection
    }

    // --- Generate and Log Detailed List Processing Summary ---
    console.log(`\n${LOG_PREFIX} INFO: --- Detailed List Processing Summary ---`);
    const allMovieLookupFailuresForReport = {};
    const allMultipleMatchesForReport = {};
    let grandTotalScraped = 0;
    let grandTotalTmdbIdsFound = 0;
    let grandTotalAttemptedAdd = 0;
    let grandTotalSuccessfullyAdded = 0;

    overallProcessingStats.forEach(stats => {
        console.log(`\n  List: "${stats.title}"`);
        console.log(`    Status: ${stats.status}`);
        if (stats.errorReason) {
            // Log only a snippet of the error reason in the summary for brevity
            console.log(`    Error: ${stats.errorReason.substring(0, 200)}${stats.errorReason.length > 200 ? '...' : ''}`);
        }
        console.log(`    Movies Scraped from Source: ${stats.scrapedItemsCount}`);
        console.log(`    TMDB Movie IDs Found: ${stats.tmdbIdsFoundCount}`);
        console.log(`    Items Attempted to Add/Update on TMDB: ${stats.itemsAttemptedAddToTmdb}`);
        console.log(`    Items Reported as Successfully Added/Updated by TMDB: ${stats.itemsSuccessfullyAddedToTmdb}`);
        
        // Aggregate grand totals
        grandTotalScraped += stats.scrapedItemsCount;
        grandTotalTmdbIdsFound += (stats.tmdbIdsFoundCount || 0); // Ensure NaN is not propagated
        grandTotalAttemptedAdd += (stats.itemsAttemptedAddToTmdb || 0);
        grandTotalSuccessfullyAdded += (stats.itemsSuccessfullyAddedToTmdb || 0);

        // Collect failures for the report file
        if (stats.movieLookupFailures && 
            (stats.movieLookupFailures.notFoundTitles?.length > 0 || stats.movieLookupFailures.failedToSearchTitles?.length > 0)) {
            allMovieLookupFailuresForReport[stats.title] = stats.movieLookupFailures;
        }

        // Collect multiple matches for the report file
        if (stats.movieLookupFailures && stats.movieLookupFailures.multipleMatches?.length > 0) {
            allMultipleMatchesForReport[stats.title] = stats.movieLookupFailures.multipleMatches;
        }
    });
    
    console.log("\n--- Grand Totals ---");
    console.log(`Total Movies Scraped Across All Lists: ${grandTotalScraped}`);
    console.log(`Total TMDB Movie IDs Found Across All Lists: ${grandTotalTmdbIdsFound}`);
    console.log(`Total Items Attempted to Add/Update on TMDB: ${grandTotalAttemptedAdd}`);
    console.log(`Total Items Successfully Added/Updated on TMDB: ${grandTotalSuccessfullyAdded}`);
    console.log("--- End of Summary ---");

    // Write the detailed failure report file if there are any lookup failures
    if (Object.keys(allMovieLookupFailuresForReport).length > 0) {
        await writeFailureReport(allMovieLookupFailuresForReport);
    } else {
        console.log(`${LOG_PREFIX} INFO: No movie ID lookup failures to report across all lists.`);
    }

    // Write the multiple matches report file if there are any multiple matches
    if (Object.keys(allMultipleMatchesForReport).length > 0) {
        await writeMultipleMatchesReport(allMultipleMatchesForReport);
    } else {
        console.log(`${LOG_PREFIX} INFO: No movies with multiple TMDB matches to report across all lists.`);
    }

    console.log(`${LOG_PREFIX} INFO: TMDB data processing finished.`);
};