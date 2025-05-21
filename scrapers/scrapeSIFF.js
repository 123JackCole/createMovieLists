import { ignoreMedia } from "../utils/ignoreMedia.js";
import { SIFF_SELECTORS } from '../config.js';

const LOG_PREFIX = "[SIFFScraper]";

/**
 * Scrapes the SIFF Film Finder for movie titles.
 * It navigates through paginated results on the SIFF website.
 * Note: This scraper currently only extracts titles, as years are not directly
 * available on the main film finder list page.
 *
 * @async
 * @function scrapeSiff
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance.
 * @param {string} baseUrl - The base URL for the SIFF film finder (e.g., "https://www.siff.net/festival/film-finder-2025?page=").
 * @returns {Promise<Array<{title: string, year: null}>>} A promise that resolves to an array of
 * movie objects, each containing a `title` and `year` (which will be `null`).
 */
export const scrapeSiff = async (browser, baseUrl) => {
    let siffPage;
    const scrapedMovies = [];
    console.log(`${LOG_PREFIX} INFO: Starting scrape for SIFF Film Finder from base URL: ${baseUrl}`);

    try {
        siffPage = await browser.newPage();
        await ignoreMedia(siffPage);

        let pageNum = 1;
        let morePages = true;
        const MAX_PAGES_TO_SCRAPE = 50; // Adjust as needed, SIFF usually has <20 pages for ~130 films at 12/page

        while (morePages && pageNum <= MAX_PAGES_TO_SCRAPE) {
            const currentPageUrl = `${baseUrl}${pageNum}`;
            console.log(`${LOG_PREFIX} INFO: Processing SIFF Film Finder - Page ${pageNum} (${currentPageUrl})`);

            try {
                await siffPage.goto(currentPageUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 60000
                });

                try {
                    await siffPage.waitForSelector(SIFF_SELECTORS.FILM_LIST_CONTAINER, { timeout: 10000, visible: true });
                } catch (e) {
                    console.warn(`${LOG_PREFIX} WARN: Film list container (${SIFF_SELECTORS.FILM_LIST_CONTAINER}) not found on page ${pageNum}. Assuming end of content.`);
                    morePages = false;
                    continue;
                }
                
                // Add a small delay for any final JS rendering after network idle, if needed.
                // await siffPage.waitForTimeout(500);


                const moviesOnThisPage = await siffPage.evaluate((selectors) => {
                    const filmItemElements = Array.from(document.querySelectorAll(selectors.MOVIE_ITEM_WRAPPER));
                    if (filmItemElements.length === 0) {
                        return [];
                    }
                    
                    const films = [];
                    filmItemElements.forEach(itemElement => {
                        // The title is within a nested span structure
                        const titleElement = itemElement.querySelector(selectors.TITLE);
                        const title = titleElement?.innerText.trim() || '';
                        
                        if (title) {
                            films.push({ title, year: null }); // Year is not available on this list page
                        }
                    });
                    return films;
                }, SIFF_SELECTORS);
                
                if (moviesOnThisPage.length === 0) {
                    console.log(`${LOG_PREFIX} INFO: No movies found on SIFF page ${pageNum}. Assuming end of list.`);
                    morePages = false;
                } else {
                    scrapedMovies.push(...moviesOnThisPage);
                    console.log(`${LOG_PREFIX} INFO: Found ${moviesOnThisPage.length} movies on SIFF page ${pageNum}. Total collected: ${scrapedMovies.length}`);
                    pageNum++;
                }

            } catch (error) {
                console.warn(`${LOG_PREFIX} WARN: Failed while processing SIFF page ${pageNum} for URL "${baseUrl}": ${error.message}`, error.stack || '');
                morePages = false; // Stop pagination on page error
            }
        }

        if (pageNum > MAX_PAGES_TO_SCRAPE) {
            console.warn(`${LOG_PREFIX} WARN: Reached max pages to scrape (${MAX_PAGES_TO_SCRAPE}). Stopping SIFF scrape.`);
        }

        console.log(`${LOG_PREFIX} INFO: Finished scraping SIFF Film Finder. Total movies found: ${scrapedMovies.length}`);
        return scrapedMovies;
        
    } catch (error) {
        console.error(`${LOG_PREFIX} CRITICAL ERROR: Failed to scrape SIFF Film Finder for base URL "${baseUrl}": ${error.message}`, error.stack || '');
        return []; 
    } finally {
        if (siffPage && !siffPage.isClosed()) {
            try {
                await siffPage.close();
            } catch (closePageError) {
                console.error(`${LOG_PREFIX} ERROR: Error closing SIFF page (finally): ${closePageError.message}`);
            }
        }
    }
};
