import { scrapeCriterionCollection } from './scrapeCriterionCollection.js';
import { scrapeVinegarSyndrome } from './scrapeVinegarSyndrome.js';
import { scrapeMastersOfCinema } from './scrapeMastersOfCinema.js';
import { SCRAPER_URLS } from '../config.js';

export const scrapeWebsites = async (browser) => {
    const scrapingPromises = [
        scrapeCriterionCollection(browser, SCRAPER_URLS.CRITERION),
        scrapeCriterionCollection(browser, SCRAPER_URLS.CRITERION_4K),
        scrapeVinegarSyndrome(browser, SCRAPER_URLS.VINEGAR_SYNDROME),
        scrapeVinegarSyndrome(browser, SCRAPER_URLS.VINEGAR_SYNDROME_4K),
        scrapeMastersOfCinema(browser, SCRAPER_URLS.MASTERS_OF_CINEMA)
    ];

    const results = await Promise.allSettled(scrapingPromises);

    let ccMovies = [], cc4kMovies = [], vsMovies = [], vs4kMovies = [], mocMovies = [];

    // Result 0: Criterion Collection Blu-ray/DVD
    if (results[0].status === 'fulfilled') {
        ccMovies = results[0].value;
        console.log(`Successfully scraped Criterion Collection (Blu-ray/DVD): ${ccMovies.length} items`);
    } else {
        console.error(`Error scraping Criterion Collection (Blu-ray/DVD): ${results[0].reason?.message || results[0].reason}`);
    }

    // Result 1: Criterion Collection 4K
    if (results[1].status === 'fulfilled') {
        cc4kMovies = results[1].value;
        console.log(`Successfully scraped Criterion Collection (4K): ${cc4kMovies.length} items`);
    } else {
        console.error(`Error scraping Criterion Collection (4K): ${results[1].reason?.message || results[1].reason}`);
    }

    // Result 2: Vinegar Syndrome Blu-ray/DVD
    if (results[2].status === 'fulfilled') {
        vsMovies = results[2].value;
        console.log(`Successfully scraped Vinegar Syndrome (Blu-ray/DVD): ${vsMovies.length} items`);
    } else {
        console.error(`Error scraping Vinegar Syndrome (Blu-ray/DVD): ${results[2].reason?.message || results[2].reason}`);
    }

    // Result 3: Vinegar Syndrome 4K
    if (results[3].status === 'fulfilled') {
        vs4kMovies = results[3].value;
        console.log(`Successfully scraped Vinegar Syndrome (4K): ${vs4kMovies.length} items`);
    } else {
        console.error(`Error scraping Vinegar Syndrome (4K): ${results[3].reason?.message || results[3].reason}`);
    }

    // Result 4: Masters of Cinema
    if (results[4].status === 'fulfilled') {
        mocMovies = results[4].value;
        console.log(`Successfully scraped Masters of Cinema: ${mocMovies.length} items`);
    } else {
        console.error(`Error scraping Masters of Cinema: ${results[4].reason?.message || results[4].reason}`);
    }

    console.log("Finished scraping all websites.");
    return { ccMovies, cc4kMovies, vsMovies, vs4kMovies, mocMovies };
}