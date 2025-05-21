import { ignoreMedia } from "../utils/ignoreMedia.js";
import { CRITERION_SELECTORS, CRITERION_COLLECTION_DETAIL_SELECTORS } from '../config.js';

const LOG_PREFIX = "[CriterionScraper]";

/**
 * Scrapes the Criterion Collection website for movie titles and their release years.
 * It handles two main cases:
 * 1. Individual films listed directly on a browse page.
 * 2. Film sets (collections/box sets) listed on a browse page:
 * - It identifies these sets (typically by blank year, director, and country fields on the main list).
 * - It navigates to the detail page for the set (using a 'data-href' attribute on the row).
 * - It then scrapes the individual film titles and years from that set's detail page.
 * Finally, it de-duplicates all collected films before returning them.
 *
 * @async
 * @function scrapeCriterionCollection
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance to use for creating pages.
 * @param {string} url - The URL of the Criterion Collection browse page to scrape (e.g., a specific format or main list).
 * @returns {Promise<Array<{title: string, year: string|null}>>} A promise that resolves to an array of unique
 * film objects, each containing a `title` and `year`. Returns an empty array if a critical error occurs.
 */
export const scrapeCriterionCollection = async (browser, url) => {
    let mainListPage; // Declare page variable here to be accessible in finally block
    const allFilmsOutput = []; // Accumulates all {title, year} objects

    console.log(`${LOG_PREFIX} INFO: Starting scrape for main list: ${url}`);
    try {
        mainListPage = await browser.newPage();
        // Apply request interception to ignore non-essential media (if ignoreMedia is async, await is correct)
        await ignoreMedia(mainListPage); 
        
        console.log(`${LOG_PREFIX} INFO: Navigating to main list: ${url}`);
        await mainListPage.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log(`${LOG_PREFIX} INFO: Successfully navigated to main list: ${url}`);

        // --- Phase 1: Scrape initial items from the main list page ---
        // This evaluate block extracts preliminary data for each row, including a potential detail URL
        // and a flag indicating if the row likely represents a set.
        const initialItemsFromList = await mainListPage.evaluate((mainPageSelectors) => {
            /**
             * Helper function within page.evaluate to check if text content is effectively blank
             * (empty, null, or just HTML non-breaking space).
             * @param {string|null} text - The text content to check.
             * @returns {boolean} True if the text is effectively blank.
             */
            const isEffectivelyBlank = (text) => {
                if (!text) return true;
                const trimmedText = text.trim();
                return trimmedText === '' || trimmedText === '&nbsp;';
            };

            // Select all movie rows based on the configured selector
            return Array.from(document.querySelectorAll(mainPageSelectors.MOVIE_ROW)).map((row, index) => {
                const titleText = row.querySelector(mainPageSelectors.TITLE_TEXT_SPAN)?.innerText.trim() || '';
                const yearText = row.querySelector(mainPageSelectors.YEAR_TEXT)?.innerText.trim() || '';
                const directorText = row.querySelector(mainPageSelectors.DIRECTOR_TEXT)?.innerText.trim() || '';
                const countryText = row.querySelector(mainPageSelectors.COUNTRY_TEXT)?.innerText.trim() || '';
                
                let detailUrl = null;
                // Prioritize extracting the detail URL from the 'data-href' attribute of the row.
                if (row.dataset.href) {
                    detailUrl = row.dataset.href;
                }
                // Note: Fallback logic for finding <a> tags was removed based on user confirmation
                // that data-href is the primary method. If this changes, re-add fallbacks.
                
                // Determine if this row represents a set based on blank year, director, and country fields.
                const isSet = isEffectivelyBlank(yearText) &&
                              isEffectivelyBlank(directorText) &&
                              isEffectivelyBlank(countryText);
                
                return { 
                    rawTitle: titleText, 
                    rawYear: yearText,       // Original year text from the main list
                    directorText,            // Original director text (for logging/debugging)
                    countryText,             // Original country text (for logging/debugging)
                    isSet,                   // Boolean flag indicating if it's likely a set
                    detailUrl                // URL to the detail page (if found)
                };
            });
        }, CRITERION_SELECTORS); // Pass the selectors for the main list page

        console.log(`${LOG_PREFIX} INFO: Found ${initialItemsFromList.length} initial items/rows on list page. Processing each...`);
        // Optional: Log a few example items for debugging structure
        // if (initialItemsFromList.length > 0) {
        //     console.log(`${LOG_PREFIX} DEBUG: Example initial items (first 3):`, JSON.stringify(initialItemsFromList.slice(0,3), null, 2));
        // }

        // --- Phase 2: Process each item from the main list ---
        // If an item is identified as a set and has a detail URL, navigate to that page and scrape individual films.
        // Otherwise, treat it as a single film.
        for (const item of initialItemsFromList) {
            if (!item.rawTitle) { // Skip items that somehow have no title
                // console.log(`${LOG_PREFIX} DEBUG: Skipping item with no rawTitle.`);
                continue;
            }

            // Log details for the current item being processed from the main list
            // console.log(`\n${LOG_PREFIX} DEBUG: Processing Main List Item: "${item.rawTitle}"`);
            // console.log(`${LOG_PREFIX} DEBUG:   Original Scraped Year: "${item.rawYear}", Director: "${item.directorText}", Country: "${item.countryText}"`);
            // console.log(`${LOG_PREFIX} DEBUG:   Identified as Set (isSet flag): ${item.isSet}, Extracted Detail URL: ${item.detailUrl}`);

            if (item.isSet && item.detailUrl) {
                console.log(`${LOG_PREFIX} INFO: Item "${item.rawTitle}" identified as a set. Attempting to drill down to: ${item.detailUrl}`);
                try {
                    await mainListPage.goto(item.detailUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                    // console.log(`${LOG_PREFIX} DEBUG: Successfully navigated to detail page for "${item.rawTitle}". Scraping films in set...`);
                    
                    const filmsInThisSet = await mainListPage.evaluate((detailPageSelectors) => {
                        const setFilms = [];
                        const filmElements = document.querySelectorAll(detailPageSelectors.FILM_SET_ITEM);
                        filmElements.forEach((filmElement) => {
                            const title = filmElement.querySelector(detailPageSelectors.FILM_TITLE)?.innerText.trim() || '';
                            const yearString = filmElement.querySelector(detailPageSelectors.FILM_YEAR)?.innerText.trim() || '';
                            let year = null;
                            if (yearString && !isNaN(parseInt(yearString.substring(0,4)))) {
                                year = yearString.substring(0,4); // Extract first 4 digits as year
                            }
                            
                            if (title) { // Only add if a title was found
                                setFilms.push({ title, year }); 
                            } else {
                                // console.warn(`[Browser Context] Film in set missing title. Year found: "${yearString}"`);
                            }
                        });
                        return setFilms;
                    }, CRITERION_COLLECTION_DETAIL_SELECTORS); // Pass selectors for the detail page

                    // console.log(`${LOG_PREFIX} DEBUG: For set "${item.rawTitle}", films extracted from detail page: ${JSON.stringify(filmsInThisSet, null, 2)}`);

                    if (filmsInThisSet.length > 0) {
                        allFilmsOutput.push(...filmsInThisSet);
                        console.log(`${LOG_PREFIX} INFO: Added ${filmsInThisSet.length} films from set "${item.rawTitle}" to output.`);
                    } else {
                        // If no individual films found on detail page, add the original set title as a fallback.
                        console.warn(`${LOG_PREFIX} WARN: No individual films extracted from detail page for set "${item.rawTitle}". Adding original set title as fallback.`);
                        const fallbackYear = (item.rawYear === '&nbsp;' || item.rawYear === '') ? null : (item.rawYear.substring(0,4).match(/^\d{4}$/) ? item.rawYear.substring(0,4) : null);
                        allFilmsOutput.push({ title: item.rawTitle, year: fallbackYear });
                    }
                } catch (detailPageError) {
                    console.error(`${LOG_PREFIX} ERROR: Error scraping detail page ${item.detailUrl} for set "${item.rawTitle}": ${detailPageError.message}. Adding original set title as fallback.`, detailPageError.stack || '');
                    const fallbackYear = (item.rawYear === '&nbsp;' || item.rawYear === '') ? null : (item.rawYear.substring(0,4).match(/^\d{4}$/) ? item.rawYear.substring(0,4) : null);
                    allFilmsOutput.push({ title: item.rawTitle, year: fallbackYear });
                }
            } else {
                // This item is not a set or has no detail URL. Add it as a single film.
                if (item.isSet && !item.detailUrl) {
                    console.warn(`${LOG_PREFIX} WARN: Item "${item.rawTitle}" was identified as a set, but no detailUrl was found (data-href missing or empty). Adding as single entry.`);
                }
                // Extract year for single film, ensuring it's a 4-digit number or null.
                const yearForSingleFilm = (item.rawYear && !isNaN(parseInt(item.rawYear.substring(0,4)))) ? item.rawYear.substring(0,4) : null;
                if (item.rawTitle) { 
                   allFilmsOutput.push({ title: item.rawTitle, year: yearForSingleFilm });
                }
            }
        } 

        // --- Phase 3: De-duplicate the collected films ---
        // This ensures that if a film was somehow added multiple times (e.g., from a set and as a single entry, or duplicate set processing),
        // it only appears once in the final output.
        const uniqueFilms = [];
        const seenFilms = new Set(); // Used to track "title|year" combinations to identify duplicates.

        for (const film of allFilmsOutput) {
            // Create a unique identifier string for each film based on its title and year.
            const filmIdentifier = `${film.title}|${film.year}`; 
            if (!seenFilms.has(filmIdentifier)) {
                uniqueFilms.push(film);
                seenFilms.add(filmIdentifier);
            }
        }
        
        console.log(`${LOG_PREFIX} INFO: Finished processing. Total unique films collected for ${url}: ${uniqueFilms.length} (from ${allFilmsOutput.length} initially processed).`);
        return uniqueFilms; // Return the de-duplicated list of films

    } catch (error) { // Catch critical errors from the main try block (e.g., browser.newPage(), initial page.goto())
        console.error(`${LOG_PREFIX} CRITICAL ERROR: Failed to scrape Criterion Collection at URL "${url}": ${error.message}`, error.stack || '');
        return []; // Return an empty array on critical failure to allow Promise.allSettled to continue with other scrapers.
    } finally {
        // Ensure the Puppeteer page is closed, even if errors occurred.
        if (mainListPage && !mainListPage.isClosed()) {
            try { 
                await mainListPage.close(); 
                // console.log(`${LOG_PREFIX} DEBUG: Page for ${url} closed in finally block.`);
            } catch (closeError) { 
                console.error(`${LOG_PREFIX} ERROR: Error closing page for ${url} (finally): ${closeError.message}`); 
            }
        }
    }
};
