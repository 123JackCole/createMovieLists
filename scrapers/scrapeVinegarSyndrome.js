import { autoScroll } from '../utils/autoScrollUtil.js';
import { ignoreMedia } from "../utils/ignoreMedia.js";
import { VINEGAR_SYNDROME_SELECTORS, VINEGAR_SYNDROME_DETAIL_SELECTORS } from "../config/config.js";

const LOG_PREFIX = "[VinegarSyndromeScraper]";
// Number of detail pages to process in parallel for each list page's results
const CONCURRENT_DETAIL_PAGES = 5;

/**
 * Scrapes a single Vinegar Syndrome product detail page to extract film title(s) and year(s).
 * This function is executed in the browser context via `page.evaluate()`.
 * It attempts to identify if the product is a single film or a collection by parsing the
 * product description text. For collections, it tries to extract individual film titles
 * (often found in `<strong>` tags) and their associated years (from nearby "directed by:" lines).
 * For single films, it looks for a primary year associated with the main product title.
 *
 * @async
 * @private
 * @function scrapeVsDetailPage
 * @param {import('puppeteer').Page} detailPage - The Puppeteer page object, already navigated to the product detail URL.
 * @param {string} mainProductTitleFromList - The title of the product as scraped from the list page. This is used
 * as a fallback if the page is treated as a single film entry or if collection parsing fails.
 * @returns {Promise<Array<{title: string, year: string|null}>>} An array of film objects.
 * Each object contains `title` and `year` (which can be null if not found).
 * For collections, this array can contain multiple film objects. For single items, it usually contains one.
 */
const scrapeVsDetailPage = async (detailPage, mainProductTitleFromList) => {
     // For browser-side console logs
    // This function's core logic is executed in the browser's context.
    return await detailPage.evaluate((detailPageSelectors, productTitleFromList) => {
        const FN_NAME_BROWSER = "scrapeVsDetailPage-BrowserContext";
        const extractedFilms = [];
        const descriptionContainer = document.querySelector(detailPageSelectors.DESCRIPTION_CONTAINER);
        
        if (!descriptionContainer) {
            // This log will appear in the browser's console if Puppeteer is run non-headless with DevTools open,
            // or if page.on('console') is set up in the Node.js context.
            console.warn(`[${FN_NAME_BROWSER}] WARN: Description container not found for "${productTitleFromList}". Returning main title with null year.`);
            return [{ title: productTitleFromList, year: null }]; // Fallback if no description
        }

        const paragraphs = Array.from(descriptionContainer.querySelectorAll('p'));
        let potentialCollectionFilms = [];

        // Attempt to identify collection structure:
        // Look for <p><strong>FILM TITLE</strong></p>
        // then look in subsequent <p> tags for a line containing "directed by:" and year info.
        for (let i = 0; i < paragraphs.length; i++) {
            const pElement = paragraphs[i];
            const strongTag = pElement.querySelector('strong');
            
            if (strongTag) {
                const potentialTitle = strongTag.innerText.trim();
                // Heuristics to determine if the <strong> tag likely contains a film title
                // rather than other bolded information (e.g., "Subscribers:", "Limited to X units").
                if (potentialTitle.length > 3 && // Arbitrary minimum length for a title
                    !potentialTitle.toLowerCase().includes("subscribers:") &&
                    !potentialTitle.toLowerCase().includes("flash pre-order") &&
                    !potentialTitle.toLowerCase().includes("limited to") &&
                    !potentialTitle.toLowerCase().includes("units") &&
                    !potentialTitle.match(/^\d+k$/i) && // Avoid "2k", "4k" which might be resolution
                    pElement.innerText.trim().toUpperCase().startsWith(potentialTitle.toUpperCase())) { // Title is usually the start of the <p>
                    
                    let yearForThisFilm = null;
                    // Scan the next few paragraphs (up to 4 more) for director/year info.
                    for (let j = i + 1; j < Math.min(i + 5, paragraphs.length); j++) {
                        const detailsText = paragraphs[j].innerText;
                        if (detailsText.toLowerCase().includes('directed by:')) {
                            // Try to extract year from a pattern like "YYYY / XX min"
                            const yearMinMatch = detailsText.match(/(\d{4})\s*\/\s*\d+\s*min/);
                            if (yearMinMatch && yearMinMatch[1]) {
                                yearForThisFilm = yearMinMatch[1];
                                break; // Found year, stop searching for this film's details
                            }
                            // Fallback: try to find any 4-digit number in the details line
                            const generalYearMatch = detailsText.match(/\b(\d{4})\b/);
                            if (generalYearMatch && generalYearMatch[1]) {
                                yearForThisFilm = generalYearMatch[1];
                                break; // Found year
                            }
                        }
                    }
                    if (!yearForThisFilm) {
                        console.warn(`[${FN_NAME_BROWSER}] WARN: Year not found for potential collection item "${potentialTitle}" (Original product: "${productTitleFromList}")`);
                    }
                    potentialCollectionFilms.push({ title: potentialTitle, year: yearForThisFilm });
                }
            }
        }

        // If the collection parsing logic found distinct films, use those.
        if (potentialCollectionFilms.length > 0) {
            // console.log(`[${FN_NAME_BROWSER}] DEBUG: Found ${potentialCollectionFilms.length} potential collection films for "${productTitleFromList}"`);
            return potentialCollectionFilms;
        }

        // Fallback: If no collection structure was clearly identified,
        // assume it's a single film and try to find one year for the main product title.
        let singleFilmYear = null;
        for (const p of paragraphs) {
            const pText = p.innerText;
            if (pText.toLowerCase().includes('directed by:')) {
                const yearMinMatch = pText.match(/(\d{4})\s*\/\s*\d+\s*min/);
                if (yearMinMatch && yearMinMatch[1]) {
                    singleFilmYear = yearMinMatch[1];
                    break;
                }
                const generalYearMatch = pText.match(/\b(\d{4})\b/);
                if (generalYearMatch && generalYearMatch[1]) {
                    singleFilmYear = generalYearMatch[1];
                    break;
                }
            }
        }
        // Add the main product title with the year found (or null if none).
        if (productTitleFromList) { // Ensure productTitleFromList is not empty/null
           if (!singleFilmYear) {
               console.warn(`[${FN_NAME_BROWSER}] WARN: Year not found for single film entry "${productTitleFromList}"`);
           }
           extractedFilms.push({ title: productTitleFromList, year: singleFilmYear });
        }
        return extractedFilms;

    }, VINEGAR_SYNDROME_DETAIL_SELECTORS, mainProductTitleFromList); // Pass selectors and the main title
};


/**
 * Scrapes the Vinegar Syndrome website for movie titles and their release years.
 * It navigates through paginated list pages to get product titles and links to their detail pages.
 * For each product, it visits the detail page (concurrently in batches) to extract the release year(s).
 * If a detail page describes a collection, it attempts to extract titles and years for individual films.
 *
 * @async
 * @function scrapeVinegarSyndrome
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance.
 * @param {string} baseUrl - The base URL for the Vinegar Syndrome catalog page (page number will be appended).
 * @returns {Promise<Array<{title: string, year: string|null}>>} A promise that resolves to an array of
 * movie objects, each containing a `title` and `year`. Returns an empty array on critical failure.
 */
export const scrapeVinegarSyndrome = async (browser, baseUrl) => { 
    let listPage; // Page object for iterating through the main list pages
    const allFoundFilms = []; // Accumulates all {title, year} objects from all detail pages

    console.log(`${LOG_PREFIX} INFO: Starting scrape for Vinegar Syndrome from base URL: ${baseUrl}`);
    try {
        listPage = await browser.newPage();
        await listPage.setCacheEnabled(false); // Attempt to prevent loading stale cached pages
        await ignoreMedia(listPage);           // Configure page to ignore media requests

        let pageNum = 1;
        let moreListPages = true;
        const MAX_LIST_PAGES = 50; // Safety limit for pagination to prevent infinite loops

        // --- Loop through main list pages ---
        while (moreListPages && pageNum <= MAX_LIST_PAGES) {
            const currentListUrl = `${baseUrl}${pageNum}`;
            console.log(`${LOG_PREFIX} INFO: Processing Vinegar Syndrome - List Page ${pageNum} (${currentListUrl})`);

            try {
                await listPage.goto(currentListUrl, { waitUntil: 'networkidle2', timeout: 60000 });

                // Scroll the page to ensure all dynamically loaded items are present
                // console.log(`${LOG_PREFIX} DEBUG: Starting autoScroll for VS Page ${pageNum}`);
                await autoScroll(listPage, { 
                    scrollDelay: 1200,    // Custom options for autoScroll if needed
                    stabilityChecks: 2,
                    maxScrolls: 40 
                });
                // console.log(`${LOG_PREFIX} DEBUG: Finished autoScroll for VS Page ${pageNum}. Evaluating content...`);

                // Extract product titles and their detail page URLs from the current list page
                const productsOnListPage = await listPage.evaluate((listPageSelectors) => {
                    const productEntries = [];
                    document.querySelectorAll(listPageSelectors.PRODUCT_WRAPPER).forEach(itemWrapper => {
                        const linkElement = itemWrapper.querySelector(listPageSelectors.DETAIL_PAGE_LINK);
                        const titleElement = linkElement?.querySelector(listPageSelectors.TITLE_ON_LIST_PAGE);
                        const title = titleElement?.innerText.trim() || '';
                        const detailUrl = linkElement?.href || null;
                        if (title && detailUrl) {
                            productEntries.push({ rawTitleFromList: title, detailUrl });
                        }
                    });
                    return productEntries;
                }, VINEGAR_SYNDROME_SELECTORS);
                
                if (productsOnListPage.length === 0) {
                    console.log(`${LOG_PREFIX} INFO: No more products found on VS list page ${pageNum}. Ending list pagination.`);
                    moreListPages = false;
                } else {
                    console.log(`${LOG_PREFIX} INFO: Found ${productsOnListPage.length} products on list page ${pageNum}. Processing their detail pages in parallel batches of ${CONCURRENT_DETAIL_PAGES}...`);
                    
                    // --- Process detail pages in parallel batches ---
                    for (let i = 0; i < productsOnListPage.length; i += CONCURRENT_DETAIL_PAGES) {
                        const batchProductEntries = productsOnListPage.slice(i, i + CONCURRENT_DETAIL_PAGES);
                        // console.log(`${LOG_PREFIX} DEBUG: Processing detail page batch ${Math.floor(i / CONCURRENT_DETAIL_PAGES) + 1} (size: ${batchProductEntries.length}) for VS list page ${pageNum}.`);

                        // Create an array of promises, each for scraping one detail page
                        const detailPagePromises = batchProductEntries.map(async (productEntry) => {
                            let detailPageForBatchItem = null; // Temporary page for this specific detail task
                            try {
                                detailPageForBatchItem = await browser.newPage();
                                await detailPageForBatchItem.setCacheEnabled(false);
                                await ignoreMedia(detailPageForBatchItem);
                                
                                // console.log(`${LOG_PREFIX} DEBUG: Navigating to detail page: ${productEntry.detailUrl} for product "${productEntry.rawTitleFromList}"`);
                                await detailPageForBatchItem.goto(productEntry.detailUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                                
                                // Call the helper function to scrape the detail page content
                                const filmsFromDetail = await scrapeVsDetailPage(detailPageForBatchItem, productEntry.rawTitleFromList);

                                if (filmsFromDetail.length > 0) {
                                    return filmsFromDetail;
                                } else {
                                    // This case is generally handled inside scrapeVsDetailPage's fallback.
                                    // If scrapeVsDetailPage returns empty, it means it couldn't find anything.
                                    console.warn(`${LOG_PREFIX} WARN: No film data extracted from detail page for "${productEntry.rawTitleFromList}". Adding original title with null year.`);
                                    return [{ title: productEntry.rawTitleFromList, year: null }];
                                }
                            } catch (detailPageError) {
                                console.warn(`${LOG_PREFIX} WARN: Failed to process detail page ${productEntry.detailUrl} for product "${productEntry.rawTitleFromList}": ${detailPageError.message}`, detailPageError.stack || '');
                                return [{ title: productEntry.rawTitleFromList, year: null }]; // Fallback if detail page processing fails
                            } finally {
                                if (detailPageForBatchItem && !detailPageForBatchItem.isClosed()) {
                                    await detailPageForBatchItem.close();
                                }
                            }
                        });

                        // Wait for all promises in the current batch to settle
                        const settledResults = await Promise.allSettled(detailPagePromises);
                        settledResults.forEach(result => {
                            if (result.status === 'fulfilled' && result.value) {
                                allFoundFilms.push(...result.value); // Add successfully scraped films to the main list
                            } else if (result.status === 'rejected') {
                                // This error would be from the async map function itself, not usually from scrapeVsDetailPage (which returns fallbacks)
                                console.error(`${LOG_PREFIX} ERROR: A detail page scraping promise was unexpectedly rejected:`, result.reason);
                            }
                        });
                    }
                    pageNum++; // Move to the next list page
                }
            } catch (error) { // Catch errors related to processing a single list page
                console.warn(`${LOG_PREFIX} WARN: Failed while processing VS list page ${pageNum} for URL "${baseUrl}": ${error.message}`, error.stack || '');
                moreListPages = false; // Stop pagination if a list page itself fails critically
            }
        }

        if (pageNum > MAX_LIST_PAGES) {
            console.warn(`${LOG_PREFIX} WARN: Reached max list pages to scrape (${MAX_LIST_PAGES}). Stopping VS scrape.`);
        }

        // --- De-duplicate the final list of all found films ---
        const uniqueFilms = [];
        const seenFilms = new Set(); // To track "title|year" combinations
        for (const film of allFoundFilms) {
            const filmIdentifier = `${film.title}|${film.year}`;
            if (!seenFilms.has(filmIdentifier)) {
                uniqueFilms.push(film);
                seenFilms.add(filmIdentifier);
            }
        }

        console.log(`${LOG_PREFIX} INFO: Finished scraping Vinegar Syndrome. Total unique films processed: ${uniqueFilms.length} (from ${allFoundFilms.length} initially extracted).`);
        return uniqueFilms;
        
    } catch (error) { // Outer catch for critical errors (e.g., browser.newPage() failure or unhandled exceptions)
        console.error(`${LOG_PREFIX} CRITICAL ERROR: Failed to scrape Vinegar Syndrome for base URL "${baseUrl}": ${error.message}`, error.stack || '');
        return []; // Return an empty array on critical failure
    } finally {
        // Ensure the main listPage is closed if it was opened
        if (listPage && !listPage.isClosed()) {
            try {
                await listPage.close();
                // console.log(`${LOG_PREFIX} DEBUG: Vinegar Syndrome list page for ${baseUrl} closed in finally block.`);
            } catch (closePageError) {
                console.error(`${LOG_PREFIX} ERROR: Error closing Vinegar Syndrome list page (finally): ${closePageError.message}`);
            }
        }
    }
};
