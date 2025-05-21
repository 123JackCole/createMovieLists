import { scrapeCriterionCollection } from './scrapeCriterionCollection.js';
import { scrapeVinegarSyndrome } from './scrapeVinegarSyndrome.js';
import { scrapeMastersOfCinema } from './scrapeMastersOfCinema.js';
import { scrapeSiff } from './scrapeSIFF.js';
import { SCRAPER_URLS } from '../config.js'; // URLs for each scraping task

const LOG_PREFIX = "[ScrapersOrchestrator]";

/**
 * Orchestrates the scraping of multiple websites/sections concurrently.
 * It takes a Puppeteer browser instance and a list of scraping tasks (defined by URLs and scraper functions).
 * Each scraper function is responsible for scraping a specific site or section and returning an array of
 * movie objects (typically { title: string, year: string|null }).
 *
 * This function uses `Promise.allSettled` to ensure all scraping attempts complete,
 * regardless of individual failures. It then processes the results, logging successes
 * and errors for each task, and aggregates the scraped data.
 *
 * @async
 * @function scrapeWebsites
 * @param {import('puppeteer').Browser} browser - The active Puppeteer browser instance to be used by individual scrapers.
 * @returns {Promise<object>} A promise that resolves to an object containing the aggregated scraped movie data,
 * structured by source. For example:
 * {
 * ccMovies: Array<{title: string, year: string|null}>,
 * cc4kMovies: Array<{title: string, year: string|null}>,
 * vsMovies: Array<{title: string, year: string|null}>,
 * vs4kMovies: Array<{title: string, year: string|null}>,
 * mocMovies: Array<{title: string, year: string|null}>
 * }
 * Each array will be empty if its corresponding scraping task failed or found no items.
 */
export const scrapeWebsites = async (browser) => {
    console.log(`${LOG_PREFIX} INFO: Starting parallel scraping of all websites...`);

    // Define the scraping tasks. Each task includes a descriptive name (for logging),
    // the scraper function to call, and the URL to scrape.
    const scrapingTasks = [
        { name: "Criterion Collection (Blu-ray/DVD)", func: scrapeCriterionCollection, url: SCRAPER_URLS.CRITERION, key: 'ccMovies' },
        { name: "Criterion Collection (4K UHD)", func: scrapeCriterionCollection, url: SCRAPER_URLS.CRITERION_4K, key: 'cc4kMovies' },
        { name: "Vinegar Syndrome (Blu-ray/DVD)", func: scrapeVinegarSyndrome, url: SCRAPER_URLS.VINEGAR_SYNDROME, key: 'vsMovies' },
        { name: "Vinegar Syndrome (4K UHD)", func: scrapeVinegarSyndrome, url: SCRAPER_URLS.VINEGAR_SYNDROME_4K, key: 'vs4kMovies' },
        { name: "Masters of Cinema", func: scrapeMastersOfCinema, url: SCRAPER_URLS.MASTERS_OF_CINEMA, key: 'mocMovies' },
        { name: "SIFF Film Finder", func: scrapeSiff, url: SCRAPER_URLS.SIFF, key: 'siffMovies' }
    ];

    // Create an array of promises by calling each scraper function.
    const scrapingPromises = scrapingTasks.map(task => 
        task.func(browser, task.url)
            .catch(err => { // Add a catch here to ensure Promise.allSettled gets a structured error for func failures
                console.error(`${LOG_PREFIX} ERROR: [${task.name}] Scraper function itself threw an unhandled error: ${err.message}`, err.stack);
                return Promise.reject(err); // Ensure it's a rejected promise for allSettled
            })
    );

    // Execute all scraping promises concurrently and wait for all to settle (either fulfill or reject).
    const results = await Promise.allSettled(scrapingPromises);

    // Initialize an object to hold the results.
    const aggregatedScrapedData = {
        ccMovies: [],
        cc4kMovies: [],
        vsMovies: [],
        vs4kMovies: [],
        mocMovies: []
    };

    // Process the results of each settled promise.
    results.forEach((result, index) => {
        const task = scrapingTasks[index]; // Get the corresponding task definition for logging and key access
        if (result.status === 'fulfilled') {
            // Assign the successfully scraped data to the correct key in aggregatedScrapedData.
            // Ensure result.value is an array; individual scrapers should return [] on their own internal errors.
            aggregatedScrapedData[task.key] = Array.isArray(result.value) ? result.value : [];
            console.log(`${LOG_PREFIX} INFO: Successfully scraped ${task.name}: ${aggregatedScrapedData[task.key].length} items found.`);
        } else {
            // Log the error if a scraping task was rejected.
            // The individual scraper functions should ideally log their own specific errors before throwing.
            // This catches errors from the promise itself or if the scraper threw.
            const reason = result.reason;
            console.error(`${LOG_PREFIX} ERROR: Failed to scrape ${task.name}. Reason: ${reason?.message || reason}`, reason?.stack || '');
            // aggregatedScrapedData[task.key] will remain an empty array as initialized.
        }
    });

    console.log(`${LOG_PREFIX} INFO: Finished scraping all websites.`);
    return aggregatedScrapedData;
};
