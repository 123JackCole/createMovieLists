// scrapers/criterionScraper.js
import { ignoreMedia } from "../utils/ignoreMedia.js";
import { CRITERION_SELECTORS, CRITERION_COLLECTION_DETAIL_SELECTORS } from '../config.js';

export const scrapeCriterionCollection = async (browser, url) => {
    let mainListPage;
    const allFilmsOutput = []; 

    console.log(`[Criterion] Starting scrape for main list: ${url}`);
    try {
        mainListPage = await browser.newPage();
        await ignoreMedia(mainListPage); 
        await mainListPage.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log(`[Criterion] Navigated to main list: ${url}`);

        const initialItemsFromList = await mainListPage.evaluate((selectors) => {
            const isEffectivelyBlank = (text) => {
                if (!text) return true;
                const trimmedText = text.trim();
                return trimmedText === '' || trimmedText === '&nbsp;';
            };

            return Array.from(document.querySelectorAll(selectors.MOVIE_ROW)).map((row, index) => {
                const titleText = row.querySelector(selectors.TITLE_TEXT_SPAN)?.innerText.trim() || '';
                const yearText = row.querySelector(selectors.YEAR_TEXT)?.innerText.trim() || '';
                const directorText = row.querySelector(selectors.DIRECTOR_TEXT)?.innerText.trim() || '';
                const countryText = row.querySelector(selectors.COUNTRY_TEXT)?.innerText.trim() || '';
                
                let detailUrl = null;
                if (row.dataset.href) {
                    detailUrl = row.dataset.href;
                }
                
                const isSet = isEffectivelyBlank(yearText) &&
                              isEffectivelyBlank(directorText) &&
                              isEffectivelyBlank(countryText);
                
                return { 
                    rawTitle: titleText, 
                    rawYear: yearText,
                    directorText, 
                    countryText,  
                    isSet, 
                    detailUrl 
                };
            });
        }, CRITERION_SELECTORS);

        console.log(`[Criterion] Found ${initialItemsFromList.length} initial items on list page. Processing each...`);
        // Optional: Log a few items to see their structure
        // if (initialItemsFromList.length > 0) {
        //     console.log("[Criterion] Example initial items (first 3):", JSON.stringify(initialItemsFromList.slice(0,3), null, 2));
        // }

        for (const item of initialItemsFromList) {
            if (!item.rawTitle) {
                // console.log("[Criterion] Skipping item with no rawTitle.");
                continue;
            }

            // console.log(`\n[Criterion] Processing Main List Item: "${item.rawTitle}"`);
            // console.log(`  Identified as Set (isSet flag): ${item.isSet}, Extracted Detail URL: ${item.detailUrl}`);

            if (item.isSet && item.detailUrl) {
                // console.log(`  Attempting to drill down into set: "${item.rawTitle}" at ${item.detailUrl}`);
                try {
                    await mainListPage.goto(item.detailUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                    // console.log(`  Successfully navigated to detail page for "${item.rawTitle}". Scraping films in set...`);
                    
                    const filmsInThisSet = await mainListPage.evaluate((detailSelectors) => {
                        const setFilms = [];
                        const filmElements = document.querySelectorAll(detailSelectors.FILM_SET_ITEM);
                        filmElements.forEach((filmElement) => {
                            const title = filmElement.querySelector(detailSelectors.FILM_TITLE)?.innerText.trim() || '';
                            const year = filmElement.querySelector(detailSelectors.FILM_YEAR)?.innerText.trim() || '';
                            if (title && year && !isNaN(parseInt(year.substring(0,4)))) {
                                setFilms.push({ title, year: year.substring(0,4) });
                            } else if (title) {
                                setFilms.push({ title, year: null }); 
                            }
                        });
                        return setFilms;
                    }, CRITERION_COLLECTION_DETAIL_SELECTORS);

                    // console.log(`  For set "${item.rawTitle}", films extracted from detail page: ${JSON.stringify(filmsInThisSet, null, 2)}`);

                    if (filmsInThisSet.length > 0) {
                        allFilmsOutput.push(...filmsInThisSet);
                        // console.log(`  Added ${filmsInThisSet.length} films from set "${item.rawTitle}" to output.`);
                    } else {
                        // console.warn(`  No individual films extracted from detail page for set "${item.rawTitle}". Adding original set title as fallback.`);
                        allFilmsOutput.push({ title: item.rawTitle, year: (item.rawYear === '&nbsp;' || item.rawYear === '') ? null : item.rawYear.substring(0,4) });
                    }
                } catch (detailPageError) {
                    console.error(`  Error scraping detail page ${item.detailUrl} for set "${item.rawTitle}": ${detailPageError.message}. Adding original set title as fallback.`);
                    allFilmsOutput.push({ title: item.rawTitle, year: (item.rawYear === '&nbsp;' || item.rawYear === '') ? null : item.rawYear.substring(0,4) });
                }
            } else {
                // if (item.isSet && !item.detailUrl) {
                //     console.warn(`  Item "${item.rawTitle}" was identified as a set, but no detailUrl was found (data-href missing or empty). Adding as single entry.`);
                // }
                const yearForSingleFilm = (item.rawYear && !isNaN(parseInt(item.rawYear.substring(0,4)))) ? item.rawYear.substring(0,4) : null;
                if (item.rawTitle) { 
                   allFilmsOutput.push({ title: item.rawTitle, year: yearForSingleFilm });
                }
            }
        } 

        // De-duplicate the collected films
        const uniqueFilms = [];
        const seenFilms = new Set(); 

        for (const film of allFilmsOutput) {
            // CORRECTED filmIdentifier:
            const filmIdentifier = `${film.title}|${film.year}`; 
            if (!seenFilms.has(filmIdentifier)) {
                uniqueFilms.push(film);
                seenFilms.add(filmIdentifier);
            }
        }
        
        console.log(`[Criterion] Finished processing. Total unique films collected for ${url}: ${uniqueFilms.length}`);
        return uniqueFilms; // Return the de-duplicated list

    } catch (error) {
        console.error(`[Criterion] CRITICAL Error in scrapeCriterionCollection for URL ${url}:`, error.message, error.stack);
        return [];
    } finally {
        if (mainListPage && !mainListPage.isClosed()) {
            try { 
                await mainListPage.close(); 
            } catch (closeError) { 
                console.error('[Criterion] Error closing page (finally):', closeError.message); 
            }
        }
    }
};
