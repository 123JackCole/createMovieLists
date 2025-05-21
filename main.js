import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import 'dotenv/config';

import { scrapeWebsites } from './scrapers/index.js';
import { addListMetadata } from './utils/addListMetadata.js';
import { processScrapedData } from './tmdb/tmdbWorkFlow.js';

puppeteer.use(StealthPlugin());

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (reason instanceof Error && reason.stack) {
        console.error(reason.stack);
    }
});

const main = async () => {
    console.log("Starting the movie list creation script...");
    let browser;

    try {
        console.log("Launching browser...");
        browser = await puppeteer.launch({
            // headless: false // Useful for debugging
        });
        console.log("Browser launched.");

        console.log("Scraping websites...");
        const rawScrapedData = await scrapeWebsites(browser);
        console.log("Finished scraping. Preparing data for TMDB...");

        const tmdbReadyData = addListMetadata(rawScrapedData);
        console.log(`Prepared ${tmdbReadyData.length} lists for TMDB processing.`);

        if (tmdbReadyData.length > 0) {
            await processScrapedData(tmdbReadyData);
            console.log("TMDB processing complete.");
        } else {
            console.log("No data to process for TMDB.");
        }

        console.log("Script finished successfully!");

    } catch (error) {
        console.error("An error occurred in the main process:", error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exitCode = 1;
    } finally {
        if (browser) {
            try {
                console.log("Closing browser...");
                await browser.close();
                console.log("Browser closed.");
            } catch (closeError) {
                console.error("Error closing the browser:", closeError.message);
                if (!process.exitCode) {
                    process.exitCode = 1;
                }
            }
        }
    }
}

// Execute the main function
// This ensures the script runs when executed with `node main.js`
main().then(() => {
    if (typeof process.exitCode === 'undefined' || process.exitCode === 0) {
        console.log("Script succeeded.");
    } else {
        console.log(`Exiting script with error code: ${process.exitCode}.`);
    }
}).catch(unhandledErrorInMain => {
    console.error("Unhandled error after main execution attempt:", unhandledErrorInMain);
    process.exitCode = 1;
});