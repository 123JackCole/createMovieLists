import { ignoreMedia } from "../utils/ignoreMedia.js";
import { VINEGAR_SYNDROME_SELECTORS } from "../config.js";

// Scrapes vs for movie titles and movie years.
export const scrapeVinegarSyndrome = async (browser, url) => { 
    let vsPage;

    try {
        vsPage = await browser.newPage();
        await ignoreMedia(vsPage);

        const vsMovies = [];
        let pageNum = 1;
        let morePages = true;

        while (morePages) {
            try {
                await vsPage.goto(url + pageNum, { waitUntil: 'networkidle2', timeout: 60000 });

                const vsMoviesOnPage = await vsPage.evaluate((selectors) => {
                    const productItemElements = Array.from(document.querySelectorAll(selectors.PRODUCT_ITEM));
                    if (productItemElements.length === 0) {
                        return [];
                    }
                    return productItemElements.map(movieElement => {
                        const title = movieElement.querySelector(selectors.TITLE)?.innerText.trim() || '';
                        return { title };
                    });
                }, VINEGAR_SYNDROME_SELECTORS);
                
                if (vsMoviesOnPage.length === 0) {
                    morePages = false;
                } else {
                    vsMovies.push(...vsMoviesOnPage);
                    pageNum++;
                }

            } catch (error) {
                console.warn(`Failed while processing Vinegar Syndrome page ${pageNum} for ${url}: ${error.message}`);
                morePages = false;
            }
        }

        return vsMovies;
        
    } catch (error) {
        console.error(`Critical error in scrapeVinegarSyndrome for base URL ${url}:`, error.message);
        throw new Error(`Failed to scrape Vinegar Syndrome (${url}): ${error.message}`);
    } finally {
        if (vsPage && !vsPage.isClosed()) {
            try {
                await vsPage.close();
            } catch (error) {
                console.error('Error closing Vinegar Syndrome page (finally):', error.message);
            }
        }
    }
};