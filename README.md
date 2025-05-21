TMDB Movie List Creator & Website Scraper
Summary

This script automates the creation and updating of movie lists on The Movie Database (TMDB). I mainly use these lists as import lists on [Radarr](https://radarr.video/). Using TMDB lists for importing media is not yet supported by [Sonarr](https://sonarr.tv/), so the script currently only is for movies, not shows. This could change if Sonarr adds support in the future.

The script scrapes movie titles and release years from various film distributor websites, then uses the TMDB API to:

    Authenticate a TMDB user.

    Search for the TMDB ID of each scraped movie.

    Create new lists on TMDB if they don't already exist.

    Populate these TMDB lists with the found movies.

Currently, it is configured to scrape movie data from:

    The Criterion Collection

    Vinegar Syndrome

    The Masters of Cinema (Eureka Video)

The script is designed to be modular, allowing for new scraper sites to be added with relative ease. It also generates a report of movies that could not be successfully matched on TMDB, aiding in manual review or script refinement.
Features

    Scrapes movie titles and years from multiple pre-configured websites.

    Handles paginated results and dynamic content loading (e.g., infinite scroll) on scraped sites.

    Intelligently drills down into "set" or "collection" pages on sites like Criterion Collection to extract individual film titles.

    Sanitizes and normalizes scraped titles to improve TMDB search accuracy.

    Attempts TMDB movie searches with year variations (year, year+1, year-1) if an initial search fails.

    Attempts TMDB collection searches if a movie search fails and the title appears to be a collection.

    Authenticates with TMDB using the v4 API user authentication flow.

    Creates new lists on TMDB with specified titles and descriptions.

    Updates existing lists by adding movies in batches to avoid API rate issues.

    Includes retry logic for transient network or server errors (e.g., 504 Gateway Timeout) when interacting with TMDB.

    Generates a local Markdown report (TMDB_List_Failure_Report.md) detailing movies that could not be found on TMDB or failed during the search process.

    Provides detailed console logging of its operations.

Screenshots

Placeholder: Add a screenshot of the script running successfully in the console.
[SCREENSHOT_CONSOLE_OUTPUT_HERE]

Placeholder: Add a screenshot of an example TMDB list created by the script.
[SCREENSHOT_TMDB_LIST_EXAMPLE_HERE]

Placeholder: Add a screenshot of the generated failure report.
[SCREENSHOT_FAILURE_REPORT_HERE]
Setup Instructions

Follow these steps to set up and run the script:
1. Prerequisites

    Node.js: Ensure you have Node.js installed (preferably a recent LTS version). You can download it from nodejs.org.

    npm or yarn: These package managers come with Node.js.

2. Get the Code

Clone this repository or download the script files to your local machine.

git clone <your-repository-url>
cd <your-project-directory>

(If you don't have a Git repository, simply place all the .js files and the package.json in a directory.)
3. Install Dependencies

Navigate to the project directory in your terminal and run:

npm install

or if you use yarn:

yarn install

This will install all necessary packages listed in package.json, including puppeteer-extra, dotenv, open, etc.
4. Environment Variables

The script uses environment variables for TMDB API credentials. You'll need two pieces of information from TMDB:

    TMDB API Read Access Token (v4 Auth): This is used to initiate the authentication flow. You can generate this in your TMDB account settings under the API section.

    TMDB API Key (v3): This is used for searching movies and collections via the TMDB API v3. This is the same API key you get when you register for an API key on TMDB.

Create a file named .env in the root directory of the project. Add your TMDB credentials to this file:

# .env file

# Your TMDB API v4 Read Access Token (for initiating user authentication)
TMDB_READ_ACCESS_TOKEN=your_v4_read_access_token_here

# Your TMDB API Key (v3 - used for searching movies/collections)
TMDB_API_KEY=your_v3_api_key_here

Important: Add .env to your .gitignore file to prevent accidentally committing your secret credentials to version control.
5. Configuration (Optional Review)

The config.js file contains URLs for the websites to be scraped and CSS selectors used by the scrapers. If the structure of these websites changes, you may need to update the selectors in this file.
Running the Script

Once set up, you can run the script from your terminal in the project's root directory:

node main.js

First Run - TMDB Authentication:
On the very first run (or if your TMDB access token needs re-authentication), the script will:

    Print a TMDB URL to the console.

    Automatically open this URL in your default web browser.

    You will need to log in to your TMDB account (if not already logged in) and approve the script's request for access.

    After approving in the browser, return to the terminal and press ENTER to continue the script.

The script will then proceed to scrape websites and update/create your TMDB lists. Subsequent runs might not require this browser authentication step if the access token is still valid or if a refresh mechanism were implemented (currently, it re-authenticates each time for simplicity).
Adding a New Site to Scrape

To add a new website for the script to scrape movies from, follow these steps:
1. Create a New Scraper File

    In the scrapers/ directory, create a new JavaScript file (e.g., newSiteScraper.js).

    This file will contain the Puppeteer logic specific to scraping the new site.

2. Write the Scraper Function

Your new scraper function should follow this general structure:

// scrapers/newSiteScraper.js
import { ignoreMedia } from "../utils/ignoreMedia.js"; // Optional: if you want to ignore media
import { NEW_SITE_SELECTORS } from '../config.js'; // You'll define these selectors in config.js

// Define a log prefix for this scraper
const LOG_PREFIX = "[NewSiteScraper]";

/**
 * Scrapes 'New Site Name' for movie titles and years.
 * @async
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance.
 * @param {string} url - The URL of the site/page to scrape.
 * @returns {Promise<Array<{title: string, year: string|null}>>} Array of movie objects.
 */
export const scrapeNewSite = async (browser, url) => {
    let page;
    const scrapedMovies = [];
    console.log(`${LOG_PREFIX} INFO: Starting scrape for New Site: ${url}`);
    try {
        page = await browser.newPage();
        await ignoreMedia(page); // Optional
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log(`${LOG_PREFIX} INFO: Navigated to ${url}`);

        // --- Add your Puppeteer logic here to: ---
        // 1. Handle pagination if necessary (similar to scrapeMastersOfCinema.js).
        // 2. Use page.evaluate() with selectors from NEW_SITE_SELECTORS to extract titles and years.
        // 3. If the site has "set" or "collection" detail pages, implement logic to navigate
        //    and scrape individual films from those pages (similar to scrapeCriterionCollection.js).
        // 4. Push each extracted movie as an object { title: "Movie Title", year: "YYYY" }
        //    (or year: null if not available) into the `scrapedMovies` array.

        // Example (very basic, adapt heavily):
        const moviesOnPage = await page.evaluate((selectors) => {
            const items = [];
            document.querySelectorAll(selectors.MOVIE_ITEM_SELECTOR).forEach(el => {
                const title = el.querySelector(selectors.TITLE_SELECTOR)?.innerText.trim() || '';
                const year = el.querySelector(selectors.YEAR_SELECTOR)?.innerText.trim().substring(0,4) || null;
                if (title) items.push({ title, year });
            });
            return items;
        }, NEW_SITE_SELECTORS);

        scrapedMovies.push(...moviesOnPage);
        console.log(`${LOG_PREFIX} INFO: Found ${moviesOnPage.length} items on current page.`);

        // Remember to handle pagination logic to set `morePages = false` when done.

        console.log(`${LOG_PREFIX} INFO: Finished scraping New Site. Total movies found: ${scrapedMovies.length}`);
        return scrapedMovies;
    } catch (error) {
        console.error(`${LOG_PREFIX} ERROR: Failed to scrape New Site at ${url}: ${error.message}`, error.stack || '');
        return []; // Return empty array on failure
    } finally {
        if (page && !page.isClosed()) {
            try { await page.close(); }
            catch (e) { console.error(`${LOG_PREFIX} ERROR: Failed to close page for New Site: ${e.message}`); }
        }
    }
};

3. Add Configuration to config.js

    Add URL:
    In config.js, add the URL for the new site to the SCRAPER_URLS object:

    export const SCRAPER_URLS = {
        // ... existing URLs ...
        NEW_SITE_NAME: '[https://www.newsite.com/movies/all](https://www.newsite.com/movies/all)', // Example
    };

    Add Selectors:
    Define the CSS selectors needed for your new scraper in config.js:

    export const NEW_SITE_SELECTORS = {
        MOVIE_ITEM_SELECTOR: '.product-card',
        TITLE_SELECTOR: '.product-title',
        YEAR_SELECTOR: '.product-year',
        // Add selectors for set detail pages if applicable
    };

4. Update scrapers/index.js

    Import your new scraper function.

    Add it to the scrapingTasks array.

// scrapers/index.js
// ... other imports ...
import { scrapeNewSite } from './newSiteScraper.js'; // Import your new scraper
import { SCRAPER_URLS } from '../config.js';

export const scrapeWebsites = async (browser) => {
    // ...
    const scrapingTasks = [
        // ... existing tasks ...
        { name: "New Site Name", func: scrapeNewSite, url: SCRAPER_URLS.NEW_SITE_NAME, key: 'newSiteMovies' }
    ];

    // ... (rest of the function, including Promise.allSettled and result processing) ...

    const aggregatedScrapedData = {
        // ... existing data keys ...
        newSiteMovies: [] // Add a key for your new site's data
    };
    
    // Ensure your results.forEach loop correctly assigns to aggregatedScrapedData[task.key]
    results.forEach((result, index) => {
        const task = scrapingTasks[index];
        if (result.status === 'fulfilled') {
            aggregatedScrapedData[task.key] = Array.isArray(result.value) ? result.value : [];
            // ... logging ...
        } else {
            //

