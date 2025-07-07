import { scrollAndRenderReact } from "../utils/autoScrollUtil.js";
import { ignoreMedia } from "../utils/ignoreMedia.js";
import { LETTERBOXD_SELECTORS } from '../config/config.js';

const LOG_PREFIX = "[LetterboxdScraper]";

/**
 * Scrapes a Letterboxd list for movie titles and their release years.
 * It uses an element-aware scrolling utility to handle modern JavaScript-based
 * lazy-loading, ensuring all films on the list are rendered before extraction.
 *
 * @async
 * @function scrapeLetterboxdList
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance to use for creating pages.
 * @param {string} url - The URL of the Letterboxd list page to scrape.
 * @returns {Promise<Array<{title: string, year: string|null}>>} A promise that resolves to an array of
 * film objects, each containing a `title` and `year`. Returns an empty array if a critical error occurs.
 */
export const scrapeLetterboxdList = async (browser, url) => {
    let lbpage;

    console.log(`${LOG_PREFIX} INFO: Starting scrape for Letterboxd list: ${url}`);
    try {
        lbpage = await browser.newPage();
        await ignoreMedia(lbpage);
        // Set a generous default timeout to accommodate for scrolling and rendering delays.
        lbpage.setDefaultTimeout(120000);

        console.log(`${LOG_PREFIX} INFO: Navigating to list: ${url}`);
        await lbpage.goto(url, { waitUntil: 'networkidle2' });
        console.log(`${LOG_PREFIX} INFO: Successfully navigated to list.`);

        await lbpage.waitForSelector(LETTERBOXD_SELECTORS.MOVIE_LIST_CONTAINER, { timeout: 30000 });
        
        const totalContainers = await lbpage.$$eval(LETTERBOXD_SELECTORS.FILM_ITEM_CONTAINER, (items) => items.length);
        console.log(`${LOG_PREFIX} INFO: Found ${totalContainers} total film containers. Starting element-aware scroll...`);

        // Use the scrolling utility to ensure all React components render.
        await scrollAndRenderReact(lbpage, {
            renderedElSelector: LETTERBOXD_SELECTORS.RENDERED_COMPONENT,
            totalElSelector: LETTERBOXD_SELECTORS.FILM_ITEM_CONTAINER
        });

        console.log(`${LOG_PREFIX} INFO: Element-aware scroll completed.`);

        // Additional wait to ensure all components are stable after scrolling.
        await new Promise(resolve => setTimeout(resolve, 3000));

        // --- Extract film data from the now fully-rendered page ---
        const allFilmsOutput = await lbpage.evaluate((selectors) => {
            const films = [];
            const components = document.querySelectorAll(selectors.RENDERED_COMPONENT);

            components.forEach(component => {
                const anchor = component.querySelector(selectors.TITLE_DATA_ANCHOR);
                if (anchor) {
                    const originalTitle = anchor.getAttribute('data-original-title');
                    if (originalTitle) {
                        // Clean the string (remove star ratings) and parse title/year
                        const cleanTitle = originalTitle.replace(/\s*[★½]+\s*$/, '').trim();
                        const match = cleanTitle.match(/^(.+?)\s+\((\d{4})\)$/);
                        const title = match ? match[1].trim() : cleanTitle;
                        const year = match ? match[2] : null;
                        films.push({ title, year });
                    }
                }
            });
            return films;
        }, LETTERBOXD_SELECTORS);

        console.log(`${LOG_PREFIX} INFO: Finished processing. Total films collected: ${allFilmsOutput.length}.`);

        // Add a warning if the number of extracted films is significantly lower than expected.
        if (allFilmsOutput.length < totalContainers * 0.9) {
            console.warn(`${LOG_PREFIX} WARN: Low extraction rate detected (${allFilmsOutput.length}/${totalContainers}). Some films may have been missed.`);
        }

        return allFilmsOutput;

    } catch (error) {
        console.error(`${LOG_PREFIX} CRITICAL ERROR: Failed to scrape Letterboxd list at URL "${url}": ${error.message}`, error.stack || '');
        return [];
    } finally {
        if (lbpage && !lbpage.isClosed()) {
            await lbpage.close().catch(e => console.error(`${LOG_PREFIX} ERROR: Error closing page: ${e.message}`));
        }
    }
};