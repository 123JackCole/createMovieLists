import { authenticateForTMDB } from './tmdbAuth.js';
import { createOrUpdateList } from './tmdbApi.js'; // This now returns more detailed stats
import { writeFailureReport } from '../utils/reportWriter.js';

export const processScrapedData = async (scrapedDataArray) => {
    let accessToken;
    try {
        accessToken = await authenticateForTMDB();
    } catch (authError) {
        console.error("TMDB Authentication failed. Cannot process lists.", authError.message);
        return;
    }

    const overallProcessingStats = []; // Array to store stats for each list

    for (const listData of scrapedDataArray) {
        const listTitle = listData.title;
        let listStats = {
            title: listTitle,
            scrapedItemsCount: listData.movieData?.length || 0,
            tmdbIdsFoundCount: 0,
            itemsAttemptedAddToTmdb: 0,
            itemsSuccessfullyAddedToTmdb: 0,
            status: 'Pending',
            errorReason: null,
            movieLookupFailures: { notFoundTitles: [], failedToSearchTitles: [] }
        };

        if (!listTitle) {
            console.error("Skipping invalid list data (missing title):", listData);
            listStats.status = 'Failed';
            listStats.errorReason = 'Invalid list data object (missing title)';
            overallProcessingStats.push(listStats);
            continue;
        }
        
        try {
            console.log(`\nProcessing list: "${listTitle}"...`);
            // createOrUpdateList now returns an object with detailed stats and failures
            const result = await createOrUpdateList(accessToken, listData);
            
            listStats.tmdbIdsFoundCount = result.tmdbIdsFoundCount; // From the re-call of getMovieIds in createOrUpdateList
            listStats.itemsAttemptedAddToTmdb = result.itemsAttemptedCount;
            listStats.itemsSuccessfullyAddedToTmdb = result.itemsSuccessfullyAddedCount;
            listStats.movieLookupFailures = result.movieLookupFailures;
            listStats.status = 'Processed (with potential item failures - see report/logs)';
            
        } catch (error) {
            console.error(`Failed to critically process list "${listTitle}": ${error.message}`);
            listStats.status = 'Failed Critically';
            listStats.errorReason = error.message;
            // Capture stats even on failure if they were attached to the error object
            if (error.scrapedItemsCount !== undefined) listStats.scrapedItemsCount = error.scrapedItemsCount;
            if (error.tmdbIdsFoundCount !== undefined) listStats.tmdbIdsFoundCount = error.tmdbIdsFoundCount;
            if (error.itemsAttemptedCount !== undefined) listStats.itemsAttemptedAddToTmdb = error.itemsAttemptedCount;
            if (error.itemsSuccessfullyAddedCount !== undefined) listStats.itemsSuccessfullyAddedToTmdb = error.itemsSuccessfullyAddedCount;
            if (error.movieLookupFailures) listStats.movieLookupFailures = error.movieLookupFailures;
        }
        overallProcessingStats.push(listStats);
    }

    // --- List Processing Summary ---
    console.log("\n--- Detailed List Processing Summary ---");
    const allMovieLookupFailuresForReport = {};
    let grandTotalScraped = 0;
    let grandTotalTmdbIdsFound = 0;
    let grandTotalAttemptedAdd = 0;
    let grandTotalSuccessfullyAdded = 0;

    overallProcessingStats.forEach(stats => {
        console.log(`\nList: "${stats.title}"`);
        console.log(`  Status: ${stats.status}`);
        if (stats.errorReason) {
            console.log(`  Error: ${stats.errorReason.substring(0, 200)}...`); // Keep error summary brief
        }
        console.log(`  Movies Scraped from Source: ${stats.scrapedItemsCount}`);
        console.log(`  TMDB Movie IDs Found: ${stats.tmdbIdsFoundCount}`);
        console.log(`  Items Attempted to Add/Update on TMDB: ${stats.itemsAttemptedAddToTmdb}`);
        console.log(`  Items Reported as Successfully Added/Updated by TMDB: ${stats.itemsSuccessfullyAddedToTmdb}`);
        
        grandTotalScraped += stats.scrapedItemsCount;
        grandTotalTmdbIdsFound += stats.tmdbIdsFoundCount;
        grandTotalAttemptedAdd += stats.itemsAttemptedAddToTmdb;
        grandTotalSuccessfullyAdded += stats.itemsSuccessfullyAddedToTmdb;

        if (stats.movieLookupFailures && (stats.movieLookupFailures.notFoundTitles.length > 0 || stats.movieLookupFailures.failedToSearchTitles.length > 0)) {
            allMovieLookupFailuresForReport[stats.title] = stats.movieLookupFailures;
        }
    });
    
    console.log("\n--- Grand Totals ---");
    console.log(`Total Movies Scraped Across All Lists: ${grandTotalScraped}`);
    console.log(`Total TMDB Movie IDs Found Across All Lists: ${grandTotalTmdbIdsFound}`);
    console.log(`Total Items Attempted to Add/Update on TMDB: ${grandTotalAttemptedAdd}`);
    console.log(`Total Items Successfully Added/Updated on TMDB: ${grandTotalSuccessfullyAdded}`);
    console.log("--- End of Summary ---");

    if (Object.keys(allMovieLookupFailuresForReport).length > 0) {
        await writeFailureReport(allMovieLookupFailuresForReport);
    } else {
        console.log("No movie ID lookup failures to report across all lists.");
    }
};
