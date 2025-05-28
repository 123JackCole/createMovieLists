import { ignoreMedia } from "../utils/ignoreMedia.js"; // Utility to block non-essential requests
import { SIFF_SELECTORS, SIFF_DETAIL_SELECTORS } from '../config.js'; // Selectors from configuration

const LOG_PREFIX = "[SIFFScraper]";

/**
 * Scrapes the SIFF (Seattle International Film Festival) Film Finder website for movie titles and their release years.
 * The process involves:
 * 1. Navigating through paginated main list pages of the film finder.
 * 2. On each list page, extracting the title and a URL to the individual film's detail page.
 * 3. For each film found on the list page, navigating to its detail page.
 * 4. On the detail page, extracting the release year from a specific metadata paragraph.
 * 5. Aggregating all successfully scraped film titles and their years.
 * 6. De-duplicating the final list of films based on title and year.
 *
 * Note: This scraper navigates to a detail page for each film to get the year,
 * which can be slower than scraping only from a list page but provides more accurate data.
 *
 * @async
 * @function scrapeSiff
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance to use for creating new pages.
 * @param {string} baseUrl - The base URL for the SIFF film finder. Page numbers will be appended to this
 * (e.g., "https://www.siff.net/festival/film-finder-2025?page=").
 * @returns {Promise<Array<{title: string, year: string|null}>>} A promise that resolves to an array of unique
 * film objects, each containing a `title` and `year` (which can be null if not found).
 * Returns an empty array if a critical error occurs or no films are found.
 */
export const scrapeSiff = async (browser, baseUrl) => {
    let listPage; // Page object for iterating through the main film finder list pages
    const allFoundFilms = []; // Accumulates all {title, year} objects before de-duplication

    console.log(`${LOG_PREFIX} INFO: Starting scrape for SIFF Film Finder from base URL: ${baseUrl}`);
    try {
        listPage = await browser.newPage(); // Create a single page object to reuse for list page navigation
        await listPage.setCacheEnabled(false); // Attempt to disable caching for fresh content
        await ignoreMedia(listPage); // Configure page to ignore non-essential media requests

        let pageNum = 1;
        let moreListPages = true; // Flag to control the pagination loop for the main list
        const MAX_LIST_PAGES = 50; // Safety limit to prevent infinite loops on list pagination

        // --- Loop through main list pages ---
        while (moreListPages && pageNum <= MAX_LIST_PAGES) {
            const currentListUrl = `${baseUrl}${pageNum}`;
            console.log(`${LOG_PREFIX} INFO: Processing SIFF Film Finder - List Page ${pageNum} (${currentListUrl})`);

            try {
                await listPage.goto(currentListUrl, { waitUntil: 'networkidle2', timeout: 60000 });

                // Wait for the main container of film items to ensure the page has loaded relevant content.
                try {
                    await listPage.waitForSelector(SIFF_SELECTORS.FILM_LIST_CONTAINER, { timeout: 15000, visible: true });
                    // console.log(`${LOG_PREFIX} DEBUG: Film list container found on list page ${pageNum}.`);
                } catch (e) {
                    console.warn(`${LOG_PREFIX} WARN: Film list container (${SIFF_SELECTORS.FILM_LIST_CONTAINER}) not found or not visible on list page ${pageNum}. Assuming end of content. Error: ${e.message}`);
                    moreListPages = false; // Stop pagination
                    continue; // Skip to the next iteration of the while loop (which will then terminate)
                }
                
                // Extract film titles and their detail page URLs from the current list page
                const filmsOnListPage = await listPage.evaluate((siffListPageSelectors) => {
                    const filmEntries = [];
                    // Select all film item wrappers on the current list page
                    document.querySelectorAll(siffListPageSelectors.MOVIE_ITEM_WRAPPER).forEach(itemElement => {
                        const linkElement = itemElement.querySelector(siffListPageSelectors.DETAIL_PAGE_LINK);
                        const titleElement = itemElement.querySelector(siffListPageSelectors.TITLE_ON_LIST_PAGE);
                        
                        const title = titleElement?.innerText.trim() || '';
                        const detailUrl = linkElement?.href || null; // Get the absolute URL
                        
                        if (title && detailUrl) {
                            filmEntries.push({ title, detailUrl });
                        } else {
                            // console.warn(`[SIFF Scraper - Browser] Could not extract title or detailUrl from item:`, itemElement.innerHTML.substring(0,100));
                        }
                    });
                    return filmEntries;
                }, SIFF_SELECTORS); // Pass selectors for the list page
                
                if (filmsOnListPage.length === 0) {
                    console.log(`${LOG_PREFIX} INFO: No more film entries found on SIFF list page ${pageNum}. Ending list pagination.`);
                    moreListPages = false;
                } else {
                    console.log(`${LOG_PREFIX} INFO: Found ${filmsOnListPage.length} film entries on list page ${pageNum}. Fetching details for each...`);
                    
                    // --- Process each film's detail page ---
                    // This loop reuses the 'listPage' object to navigate to each detail page sequentially.
                    // For higher concurrency on detail pages (if needed and site allows), a batching approach
                    // similar to VinegarSyndromeScraper could be implemented here.
                    for (const filmEntry of filmsOnListPage) {
                        let year = null; // Default year for the film
                        try {
                            // console.log(`${LOG_PREFIX} DEBUG: Navigating to detail page: ${filmEntry.detailUrl} for title "${filmEntry.title}"`);
                            await listPage.goto(filmEntry.detailUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                            
                            // Extract the year from the detail page
                            const yearFromDetailPage = await listPage.evaluate((siffDetailPageSelectors) => {
                                const yearInfoParagraph = document.querySelector(siffDetailPageSelectors.YEAR_INFO_PARAGRAPH);
                                if (yearInfoParagraph) {
                                    const spans = Array.from(yearInfoParagraph.querySelectorAll('span'));
                                    // Filter out spans used as separators (class "pipe") and empty spans
                                    const relevantSpans = spans.filter(span => !span.classList.contains('pipe') && span.innerText.trim() !== '');
                                    
                                    // Iterate through relevant spans to find the first 4-digit number, assuming it's the year.
                                    for (const span of relevantSpans) {
                                        const text = span.innerText.trim();
                                        if (/^\d{4}$/.test(text)) { // Check if text is a 4-digit number
                                            return text; 
                                        }
                                    }
                                }
                                return null; // Year not found
                            }, SIFF_DETAIL_SELECTORS); // Pass selectors for the detail page

                            if (yearFromDetailPage) {
                                year = yearFromDetailPage;
                                // console.log(`${LOG_PREFIX} DEBUG: Found year "${year}" for title "${filmEntry.title}"`);
                            } else {
                                console.warn(`${LOG_PREFIX} WARN: Year not found on detail page for "${filmEntry.title}" at ${filmEntry.detailUrl}`);
                            }
                            allFoundFilms.push({ title: filmEntry.title, year: year });

                        } catch (detailPageError) {
                            console.warn(`${LOG_PREFIX} WARN: Failed to process detail page ${filmEntry.detailUrl} for title "${filmEntry.title}": ${detailPageError.message}`, detailPageError.stack || '');
                            allFoundFilms.push({ title: filmEntry.title, year: null }); // Add with null year as fallback
                        }
                    }
                    pageNum++; // Move to the next list page
                }
            } catch (error) { // Catch errors related to processing a single list page
                console.warn(`${LOG_PREFIX} WARN: Failed while processing SIFF list page ${pageNum} for URL "${baseUrl}": ${error.message}`, error.stack || '');
                moreListPages = false; // Stop pagination if a list page itself fails critically
            }
        }

        if (pageNum > MAX_LIST_PAGES) {
            console.warn(`${LOG_PREFIX} WARN: Reached max list pages to scrape (${MAX_LIST_PAGES}). Stopping SIFF scrape.`);
        }

        // --- De-duplicate the final list of all found films ---
        const uniqueFilms = [];
        const seenFilms = new Set(); // Used to track "title|year" combinations
        for (const film of allFoundFilms) {
            const filmIdentifier = `${film.title}|${film.year}`; // Create a unique key
            if (!seenFilms.has(filmIdentifier)) {
                uniqueFilms.push(film);
                seenFilms.add(filmIdentifier);
            }
        }

        console.log(`${LOG_PREFIX} INFO: Finished scraping SIFF Film Finder. Total unique films processed: ${uniqueFilms.length} (from ${allFoundFilms.length} initially extracted).`);
        return uniqueFilms;
        
    } catch (error) { // Outer catch for critical errors (e.g., browser.newPage() or unhandled exceptions)
        console.error(`${LOG_PREFIX} CRITICAL ERROR: Failed to scrape SIFF Film Finder for base URL "${baseUrl}": ${error.message}`, error.stack || '');
        return []; // Return an empty array on critical failure to allow Promise.allSettled to continue
    } finally {
        // Ensure the Puppeteer page is closed, even if errors occurred.
        if (listPage && !listPage.isClosed()) {
            try {
                await listPage.close();
                // console.log(`${LOG_PREFIX} DEBUG: SIFF page for ${baseUrl} closed in finally block.`);
            } catch (closePageError) {
                console.error(`${LOG_PREFIX} ERROR: Error closing SIFF page (finally): ${closePageError.message}`);
            }
        }
    }
};
