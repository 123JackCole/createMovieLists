import { autoScroll } from '../utils/autoScrollUtil.js';
import { ignoreMedia } from '../utils/ignoreMedia.js';
import { MASTERS_OF_CINEMA_SELECTORS } from '../config.js';

// Scrapes vs for movie titles and movie years.
export const scrapeMastersOfCinema = async (browser, url) => {
    let mocPage;
    
    try {
        mocPage = await browser.newPage();
        await ignoreMedia(mocPage);

        const mocMovies = [];
        let pageNum = 1;
        let morePages = true;

        while (morePages) {
            try {
                await mocPage.goto(url + pageNum, { waitUntil: 'networkidle2', timeout: 60000 });
                await mocPage.reload({ waitUntil: 'networkidle2', timeout: 60000 });

                try {
                    await mocPage.waitForSelector(MASTERS_OF_CINEMA_SELECTORS.PAGE_DATA_GRID_CONTAINER, { timeout: 10000 });
                } catch (error) {
                    morePages = false;
                    continue; 
                }

                await autoScroll(mocPage);

                const mocMoviesOnPage = await mocPage.evaluate((selectors) => {
                    const movieItemElements = Array.from(document.querySelectorAll(selectors.MOVIE_ITEM));
                    if (movieItemElements.length === 0) {
                        return [];
                    }
                    return movieItemElements.map(itemElement => {
                        const title = itemElement.querySelector(selectors.TITLE)?.innerText.trim() || '';
                        const detailElements = itemElement.querySelectorAll(selectors.DETAILS_ELEMENT);
                        let year = '';
                        if (detailElements && detailElements.length > 1) {
                            const yearTextContent = detailElements[1].innerText?.trim();
                            if (yearTextContent) {
                                year = yearTextContent.split('/')[0].trim();
                            }
                        }
                        return { title, year };
                    });
                }, MASTERS_OF_CINEMA_SELECTORS);

                if (mocMoviesOnPage.length === 0) {
                    morePages = false;
                } else {
                    mocMovies.push(...mocMoviesOnPage);
                    pageNum++;
                }
            } catch (error) {
                console.warn(`Failed while processing Masters of Cinema page ${pageNum} for ${url}: ${error.message}`);
                morePages = false; 
            }
        }

        return mocMovies;
        
    } catch (error) {
        console.error(`Critical error in scrapeMastersOfCinema for base URL ${url}:`, error.message);
        throw new Error(`Failed to scrape Masters of Cinema (${url}): ${error.message}`);
    } finally {
        if (mocPage && !mocPage.isClosed()) {
            try {
                await mocPage.close();
            } catch (error) {
                console.error('Error closing Masters of Cinema page (finally):', error.message);
            }
        }
    }
};