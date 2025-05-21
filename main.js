import puppeteer from 'puppeteer-extra'; // Puppeteer for browser automation
import StealthPlugin from 'puppeteer-extra-plugin-stealth'; // Stealth plugin to make Puppeteer less detectable
import 'dotenv/config'; // Loads environment variables from a .env file into process.env

// --- Application Modules ---
import { scrapeWebsites } from './scrapers/index.js';         // Orchestrates all website scraping
import { addListMetadata } from './utils/addListMetadata.js'; // Structures scraped data for TMDB
import { processScrapedData } from './tmdb/tmdbWorkFlow.js';  // Handles all TMDB API interactions

// Define a consistent logging prefix for messages originating from this main process file
const LOG_PREFIX = "[MainProcess]";

// Apply the stealth plugin to Puppeteer to help avoid bot detection
puppeteer.use(StealthPlugin());

// --- Global Error Handling ---
// Catch any unhandled promise rejections that might not have been caught locally in async functions.
// This is a safety net.
process.on('unhandledRejection', (reason, promise) => {
    console.error(`${LOG_PREFIX} ERROR: Unhandled Promise Rejection at:`, promise, 'Reason:', reason);
    if (reason instanceof Error && reason.stack) {
        console.error(reason.stack);
    }
    process.exit(1);
});

/**
 * Main asynchronous function to orchestrate the entire script's workflow:
 * 1. Initializes and launches a Puppeteer browser instance.
 * 2. Calls the `scrapeWebsites` module to scrape movie data from configured sources.
 * 3. Calls `addListMetadata` to transform the raw scraped data into a format suitable for TMDB.
 * 4. Calls `processScrapedData` to interact with the TMDB API (authenticate, create/update lists, add items).
 * 5. Ensures the browser is closed in a `finally` block, regardless of success or failure.
 * 6. Sets the process exit code based on whether an error occurred.
 *
 * @async
 * @function main
 * @returns {Promise<void>} A promise that resolves when the main process completes or an error is handled.
 */
const main = async () => {
    console.log(`${LOG_PREFIX} INFO: Starting the movie list creation script...`);
    let browser;

    try {
        // --- Browser Initialization ---
        console.log(`${LOG_PREFIX} INFO: Launching Puppeteer browser...`);
        browser = await puppeteer.launch({
            // headless: false, // Uncomment for debugging to see the browser UI
            // args: ['--no-sandbox', '--disable-setuid-sandbox'] // Useful for some CI/Linux environments
        });
        console.log(`${LOG_PREFIX} INFO: Browser launched successfully.`);

        // --- Data Scraping ---
        console.log(`${LOG_PREFIX} INFO: Starting website scraping process...`);
        const rawScrapedData = await scrapeWebsites(browser); // Pass the browser instance to the scraper orchestrator
        console.log(`${LOG_PREFIX} INFO: Finished scraping all websites.`);

        // --- Data Preparation ---
        console.log(`${LOG_PREFIX} INFO: Preparing scraped data for TMDB processing...`);
        const tmdbReadyData = addListMetadata(rawScrapedData); // Transform data
        console.log(`${LOG_PREFIX} INFO: Prepared ${tmdbReadyData.length} lists for TMDB processing.`);

        // --- TMDB Processing ---
        if (tmdbReadyData.length > 0) {
            console.log(`${LOG_PREFIX} INFO: Starting TMDB data processing...`);
            await processScrapedData(tmdbReadyData); // Process the structured data with TMDB
            console.log(`${LOG_PREFIX} INFO: TMDB processing complete.`);
        } else {
            console.log(`${LOG_PREFIX} INFO: No data scraped from websites, so no TMDB processing will occur.`);
        }

        console.log(`\n${LOG_PREFIX} INFO: Script finished successfully!`);

    } catch (error) {
        // Catch any errors that propagate up from the main workflow steps
        console.error(`${LOG_PREFIX} ERROR: A critical error occurred in the main process: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exitCode = 1; // Signal an error exit status to the operating system
    } finally {
        // Ensure the browser is closed whether the script succeeds or fails
        if (browser) {
            try {
                console.log(`${LOG_PREFIX} INFO: Closing browser...`);
                await browser.close();
                console.log(`${LOG_PREFIX} INFO: Browser closed successfully.`);
            } catch (closeError) {
                console.error(`${LOG_PREFIX} ERROR: Failed to close the browser: ${closeError.message}`, closeError.stack || '');
                // If an error occurs during browser close, and no other error has set the exit code,
                // set it now to indicate a problem.
                if (!process.exitCode) { 
                    process.exit(1);
                }
            }
        }
    }
};

// --- Script Execution ---
// Execute the main function and handle its final promise resolution.
main().then(() => {
    // This block executes after main() has completed (either resolved or its catch/finally handled errors).
    if (typeof process.exitCode === 'undefined' || process.exitCode === 0) {
        console.log(`\n${LOG_PREFIX} FINAL: Script execution cycle completed successfully.`);
        process.exit(0); // Explicitly exit with success code; often not needed as Node.js will exit when event loop is empty.
    } else {
        console.log(`\n${LOG_PREFIX} FINAL: Script execution cycle completed with error code: ${process.exitCode}.`);
        process.exit(process.exitCode); // Explicitly exit with the set error code.
    }
}).catch(unhandledErrorFromMainCall => {
    // This catch is an ultimate safeguard if the main() promise itself rejects in an unhandled way
    // (e.g., if main() was not async and threw, or if .then()/.catch() logic itself had an issue).
    // With the current structure of main(), errors should be caught internally or by the unhandledRejection handler.
    console.error(`${LOG_PREFIX} CRITICAL: Unhandled error from main() function call chain:`, unhandledErrorFromMainCall);
    process.exit(1);
});
