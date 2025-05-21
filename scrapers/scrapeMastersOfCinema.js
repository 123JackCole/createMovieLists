import { autoScroll } from '../utils/autoScrollUtil.js';    // Utility for scrolling pages with dynamic content
import { ignoreMedia } from '../utils/ignoreMedia.js';      // Utility to block non-essential requests
import { MASTERS_OF_CINEMA_SELECTORS } from '../config.js'; // Selectors from configuration

const LOG_PREFIX = "[MastersOfCinemaScraper]";

/**
 * Scrapes the Masters of Cinema website for movie titles and their release years.
 * This scraper handles paginated results. For each page, it navigates, reloads (to ensure
 * client-side routing updates content for hash-based URLs), waits for a key container,
 * auto-scrolls to load all items, and then extracts movie data.
 *
 * It uses a single Puppeteer page instance, navigating it through each numbered page
 * until no more items are found or a page fails to load correctly.
 *
 * @async
 * @function scrapeMastersOfCinema
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance to use for creating a new page.
 * @param {string} baseUrl - The base URL for the Masters of Cinema catalog page.
 * The page number will be appended to this URL (e.g., "https://site.com/moc/#page-").
 * @returns {Promise<Array<{title: string, year: string|null}>>} A promise that resolves to an array of
 * movie objects, each containing a `title` and `year`. The year is extracted from text like "YYYY / Country".
 * Returns an empty array if a critical error occurs or no movies are found.
 */
export const scrapeMastersOfCinema = async (browser, baseUrl) => {
    let mocPage; // Declare page variable here to be accessible in the finally block
    const scrapedMovies = []; // Initialize an array to accumulate all scraped movie objects

    console.log(`${LOG_PREFIX} INFO: Starting scrape for Masters of Cinema from base URL: ${baseUrl}`);
    try {
        mocPage = await browser.newPage(); // Create a new page instance
        // Apply request interception to ignore non-essential media
        // Ensure ignoreMedia is awaited if it's an asynchronous function
        await ignoreMedia(mocPage);

        let pageNum = 1;        // Start with the first page
        let morePages = true;   // Flag to control the pagination loop

        // Loop through pages as long as there's content or no errors stop us
        while (morePages) {
            const currentPageUrl = baseUrl + pageNum;
            console.log(`${LOG_PREFIX} INFO: Processing Masters of Cinema - Page ${pageNum} (${currentPageUrl})`);
            try {
                // Navigate to the current page number
                await mocPage.goto(currentPageUrl, { 
                    waitUntil: 'networkidle2', // Wait for network activity to settle
                    timeout: 60000             // 60-second navigation timeout
                });
                // Reload the page; this is crucial for sites where client-side routing
                // updates content based on URL hash changes (e.g., #page-X)
                // and goto alone might not trigger a full content refresh.
                console.log(`${LOG_PREFIX} INFO: Reloading MOC Page ${pageNum} to ensure content update...`);
                await mocPage.reload({ waitUntil: 'networkidle2', timeout: 60000 });
                console.log(`${LOG_PREFIX} INFO: Reload of MOC Page ${pageNum} complete.`);


                // Wait for the main data grid container to be present and visible.
                // If this fails, it likely means the page is invalid or has no content grid.
                try {
                    await mocPage.waitForSelector(MASTERS_OF_CINEMA_SELECTORS.PAGE_DATA_GRID_CONTAINER, { 
                        timeout: 15000, // Slightly increased timeout for this critical check
                        visible: true   // Ensure the element is not just in DOM but also visible
                    });
                    // console.log(`${LOG_PREFIX} DEBUG: Data grid container found on MOC Page ${pageNum}.`);
                } catch (error) {
                    console.warn(`${LOG_PREFIX} WARN: Container (${MASTERS_OF_CINEMA_SELECTORS.PAGE_DATA_GRID_CONTAINER}) not found or not visible on MOC page ${pageNum}. Assuming end of content. Error: ${error.message}`);
                    morePages = false; // Stop pagination
                    continue; // Skip to the next iteration of the while loop (which will then terminate)
                }

                // Scroll the page to ensure all dynamically loaded items are present
                // console.log(`${LOG_PREFIX} DEBUG: Starting autoScroll for MOC Page ${pageNum}`);
                await autoScroll(mocPage, { 
                    scrollDelay: 1200,    // Custom options for autoScroll if needed
                    stabilityChecks: 2,
                    maxScrolls: 40 
                });
                // console.log(`${LOG_PREFIX} DEBUG: Finished autoScroll for MOC Page ${pageNum}. Evaluating content...`);

                // Execute script in the browser context to extract movie titles and years from the current page
                const moviesOnThisPage = await mocPage.evaluate((selectors) => {
                    // Select all individual movie item elements based on the configured selector
                    const movieItemElements = Array.from(document.querySelectorAll(selectors.MOVIE_ITEM));
                    
                    if (movieItemElements.length === 0) {
                        return []; // No movie items found on this page
                    }
                    
                    // Map over each movie item element to extract its data
                    return movieItemElements.map(itemElement => {
                        const title = itemElement.querySelector(selectors.TITLE)?.innerText.trim() || '';
                        // Year is typically in the second 'small' tag within the details element.
                        const detailElements = itemElement.querySelectorAll(selectors.DETAILS_ELEMENT); // e.g., 'small'
                        let year = null; // Default to null if year cannot be extracted

                        if (detailElements && detailElements.length > 1) {
                            const yearTextContent = detailElements[1].innerText?.trim();
                            if (yearTextContent) {
                                const yearPart = yearTextContent.split('/')[0].trim(); // Takes "YYYY" from "YYYY / Country"
                                if (yearPart.match(/^\d{4}$/)) { // Basic validation for a 4-digit year
                                    year = yearPart;
                                } else {
                                    // console.warn(`[Browser Context] Could not parse valid year from "${yearTextContent}" for title "${title}"`);
                                }
                            }
                        }
                        return { title, year };
                    });
                }, MASTERS_OF_CINEMA_SELECTORS); // Pass selectors into the browser context

                if (moviesOnThisPage.length === 0) {
                    // No movies found on the current page, assume end of pagination.
                    console.log(`${LOG_PREFIX} INFO: No movies found on Masters of Cinema page ${pageNum}. Ending MOC scrape.`);
                    morePages = false;
                } else {
                    // Add successfully scraped movies from this page to the main array.
                    scrapedMovies.push(...moviesOnThisPage);
                    console.log(`${LOG_PREFIX} INFO: Found ${moviesOnThisPage.length} movies on MOC page ${pageNum}. Total collected: ${scrapedMovies.length}`);
                    pageNum++; // Increment to process the next page
                }
            } catch (error) {
                // Handle errors that occur while processing a single page.
                console.warn(`${LOG_PREFIX} WARN: Failed while processing Masters of Cinema page ${pageNum} for URL "${baseUrl}": ${error.message}`, error.stack || '');
                morePages = false; // Stop pagination if a page fails critically.
            }
        } // End of while loop (pagination)

        console.log(`${LOG_PREFIX} INFO: Finished scraping Masters of Cinema for base URL ${baseUrl}. Total movies found: ${scrapedMovies.length}`);
        return scrapedMovies;
        
    } catch (error) { // Outer catch for critical errors (e.g., browser.newPage() failure)
        console.error(`${LOG_PREFIX} CRITICAL ERROR: Failed to scrape Masters of Cinema for base URL "${baseUrl}": ${error.message}`, error.stack || '');
        // Return an empty array on critical failure to allow Promise.allSettled to continue with other scrapers.
        return []; 
    } finally {
        // Ensure the Puppeteer page is closed, even if errors occurred.
        if (mocPage && !mocPage.isClosed()) {
            try {
                await mocPage.close();
                // console.log(`${LOG_PREFIX} DEBUG: Masters of Cinema page for ${baseUrl} closed in finally block.`);
            } catch (closePageError) {
                console.error(`${LOG_PREFIX} ERROR: Error closing Masters of Cinema page (finally): ${closePageError.message}`);
            }
        }
    }
};
