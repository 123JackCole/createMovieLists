import { ignoreMedia } from "../utils/ignoreMedia.js"; // Utility to block non-essential requests
import { VINEGAR_SYNDROME_SELECTORS } from "../config.js"; // Selectors from configuration

const LOG_PREFIX = "[VinegarSyndromeScraper]";

/**
 * Scrapes the Vinegar Syndrome website for movie titles from paginated catalog pages.
 * It navigates through each page of a given category/URL, extracting product titles.
 * Note: This scraper currently only extracts titles, as years are not readily available
 * on the main product listing pages for Vinegar Syndrome.
 *
 * The function uses a single Puppeteer page instance, navigating it through each
 * numbered page until no more items are found.
 *
 * @async
 * @function scrapeVinegarSyndrome
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance to use for creating a new page.
 * @param {string} baseUrl - The base URL for the Vinegar Syndrome catalog page.
 * The page number will be appended to this URL (e.g., "https://site.com/collection?page=").
 * @returns {Promise<Array<{title: string, year: null}>>} A promise that resolves to an array of
 * movie objects, each containing a `title` (string) and `year` (currently always `null`).
 * Returns an empty array if a critical error occurs or no movies are found.
 */
export const scrapeVinegarSyndrome = async (browser, baseUrl) => { 
    let vsPage; // Declare page variable here to be accessible in the finally block
    const scrapedMovies = []; // Initialize an array to accumulate all scraped movie titles

    console.log(`${LOG_PREFIX} INFO: Starting scrape for Vinegar Syndrome from base URL: ${baseUrl}`);
    try {
        vsPage = await browser.newPage(); // Create a new page instance
        // Apply request interception to ignore non-essential media
        // Ensure ignoreMedia is awaited if it's an asynchronous function
        await ignoreMedia(vsPage); 

        let pageNum = 1;        // Start with the first page
        let morePages = true;   // Flag to control the pagination loop

        // Loop through pages as long as there's content or no errors stop us
        while (morePages) {
            const currentPageUrl = baseUrl + pageNum;
            console.log(`${LOG_PREFIX} INFO: Processing Vinegar Syndrome - Page ${pageNum} (${currentPageUrl})`);
            try {
                // Navigate to the current page number
                await vsPage.goto(currentPageUrl, { 
                    waitUntil: 'networkidle2', // Wait for network activity to settle, good for JS-heavy pages
                    timeout: 60000             // 60-second navigation timeout
                });

                // Optional: Wait for a specific container element to ensure the main content grid is loaded.
                // This can prevent errors if page.evaluate runs before the content is ready.
                // Example: await vsPage.waitForSelector(VINEGAR_SYNDROME_SELECTORS.MAIN_PRODUCT_GRID_CONTAINER || '.default-grid-selector', { timeout: 10000 });

                // Execute script in the browser context to extract movie titles from the current page
                const moviesOnThisPage = await vsPage.evaluate((selectors) => {
                    // Select all product item elements based on the configured selector
                    const productItemElements = Array.from(document.querySelectorAll(selectors.PRODUCT_ITEM));
                    
                    // If no product items are found on the page, return an empty array.
                    // This is the primary condition for stopping pagination.
                    if (productItemElements.length === 0) {
                        return [];
                    }
                    
                    // Map over each product item element to extract its title.
                    return productItemElements.map(movieElement => {
                        const title = movieElement.querySelector(selectors.TITLE)?.innerText.trim() || '';
                        // Vinegar Syndrome list pages typically don't show the year for each item.
                        // Returning year as null for consistency with other scrapers.
                        return { title, year: null }; 
                    });
                }, VINEGAR_SYNDROME_SELECTORS); // Pass selectors into the browser context
                
                if (moviesOnThisPage.length === 0) {
                    // No movies found on the current page, assume end of pagination.
                    console.log(`${LOG_PREFIX} INFO: No movies found on Vinegar Syndrome page ${pageNum}. Assuming end of list.`);
                    morePages = false;
                } else {
                    // Add successfully scraped movies from this page to the main array.
                    scrapedMovies.push(...moviesOnThisPage);
                    console.log(`${LOG_PREFIX} INFO: Found ${moviesOnThisPage.length} movies on VS page ${pageNum}. Total collected: ${scrapedMovies.length}`);
                    pageNum++; // Increment to process the next page
                }

            } catch (error) {
                // Handle errors that occur while processing a single page (e.g., navigation timeout, selector not found).
                console.warn(`${LOG_PREFIX} WARN: Failed while processing Vinegar Syndrome page ${pageNum} for URL "${baseUrl}": ${error.message}`);
                // Log stack for more details if needed: console.warn(error.stack);
                morePages = false; // Stop pagination if a page fails critically.
            }
        } // End of while loop (pagination)

        console.log(`${LOG_PREFIX} INFO: Finished scraping Vinegar Syndrome for base URL ${baseUrl}. Total movies found: ${scrapedMovies.length}`);
        return scrapedMovies;
        
    } catch (error) { // Outer catch for critical errors (e.g., browser.newPage() failure)
        console.error(`${LOG_PREFIX} CRITICAL ERROR: Failed to scrape Vinegar Syndrome for base URL "${baseUrl}": ${error.message}`, error.stack || '');
        // Re-throw the error so Promise.allSettled in the calling function (scrapeWebsites) can catch it.
        // Or, to allow other scrapers to continue, return an empty array.
        // For consistency with CriterionScraper, let's return empty array on critical failure of this specific scraper.
        return []; 
    } finally {
        // Ensure the Puppeteer page is closed, even if errors occurred.
        if (vsPage && !vsPage.isClosed()) {
            try {
                await vsPage.close();
                // console.log(`${LOG_PREFIX} DEBUG: Vinegar Syndrome page for ${baseUrl} closed in finally block.`);
            } catch (closePageError) {
                console.error(`${LOG_PREFIX} ERROR: Error closing Vinegar Syndrome page (finally): ${closePageError.message}`);
            }
        }
    }
};
