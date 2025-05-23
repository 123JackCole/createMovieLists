/**
 * @file Configuration file for the TMDB Movie List Creator script.
 * This file centralizes constant values used throughout the application,
 * including URLs for web scraping, CSS selectors for data extraction,
 * and TMDB API endpoint configurations.
 * Modifying values here can change the behavior of scrapers and API interactions
 * without needing to alter the core logic of the functions.
 */

// -----------------------------------------------------------------------------
// SCRAPER CONFIGURATION
// Defines URLs and CSS selectors for each website to be scraped.
// -----------------------------------------------------------------------------

/**
 * URLs for the main listing/browse pages of each movie distributor's website.
 * These are the entry points for the scrapers.
 * For paginated sites, this is usually the base URL to which page numbers are appended.
 * @type {object}
 * @property {string} CRITERION - URL for Criterion Collection Blu-ray/DVD list.
 * @property {string} CRITERION_4K - URL for Criterion Collection 4K UHD list.
 * @property {string} VINEGAR_SYNDROME - Base URL for Vinegar Syndrome general releases (paginated).
 * @property {string} VINEGAR_SYNDROME_4K - Base URL for Vinegar Syndrome 4K UHD releases (paginated).
 * @property {string} MASTERS_OF_CINEMA - Base URL for Masters of Cinema list (paginated with hash).
 */
export const SCRAPER_URLS = {
    CRITERION: 'https://www.criterion.com/shop/browse/list?sort=spine_number&format=blu-ray,dvd',
    CRITERION_4K: 'https://www.criterion.com/shop/browse/list?sort=spine_number&format=4k_ultra_hd',
    VINEGAR_SYNDROME: 'https://vinegarsyndrome.com/collections/all-vinegar-syndrome-releases?filter.p.product_type=Blu-ray&filter.p.product_type=Blu-ray%2FDVD%20Combo&filter.p.product_type=DVD&filter.p.product_type=VHS&page=',
    VINEGAR_SYNDROME_4K: 'https://vinegarsyndrome.com/collections/all-vinegar-syndrome-releases?filter.p.product_type=4k%20Ultra%20HD%2FBlu-ray%20Combo&page=',
    MASTERS_OF_CINEMA: 'https://eurekavideo.co.uk/masters-of-cinema/#page-',
    SIFF: 'https://www.siff.net/festival/film-finder-2025?page='
};

/**
 * CSS selectors for scraping the main list pages of the Criterion Collection website.
 * Used to identify movie rows and extract title, year, director, and country.
 * @type {object}
 * @property {string} MOVIE_ROW - Selector for each table row representing a film or set (specifically within `<tbody>`).
 * @property {string} TITLE_TEXT_SPAN - Selector for the `<span>` containing the title text within a movie row.
 * @property {string} YEAR_TEXT - Selector for the element containing the year text within a movie row.
 * @property {string} DIRECTOR_TEXT - Selector for the element containing the director text.
 * @property {string} COUNTRY_TEXT - Selector for the element containing the country text.
 */
export const CRITERION_SELECTORS = {
    MOVIE_ROW: 'tbody tr',       // Targets data rows, excluding header rows in <thead>
    TITLE_TEXT_SPAN: '.g-title span',
    YEAR_TEXT: '.g-year',
    DIRECTOR_TEXT: '.g-director',
    COUNTRY_TEXT: '.g-country'
};

/**
 * CSS selectors for scraping the detail pages of Criterion Collection sets/collections.
 * Used when a main list item is identified as a set, and the script navigates to its detail page.
 * @type {object}
 * @property {string} FILM_SET_ITEM - Selector for each list item (`<li>`) representing an individual film within the set.
 * @property {string} FILM_TITLE - Selector for the title paragraph (`<p>`) of an individual film in the set.
 * @property {string} FILM_YEAR - Selector for the year paragraph (`<p>`) of an individual film in the set.
 */
export const CRITERION_COLLECTION_DETAIL_SELECTORS = {
    FILM_SET_ITEM: 'ul.film-setlist > a > li.film-set', // Targets the <li> within the <a> within the <ul>
    FILM_TITLE: 'p.film-set-title',
    FILM_YEAR: 'p.film-set-year',
};

/**
 * CSS selectors for scraping the Vinegar Syndrome website product listing pages.
 * @type {object}
 * @property {string} PRODUCT_ITEM - Selector for the main container of each product/movie item.
 * @property {string} TITLE - Selector for the element containing the product title.
 * @note Vinegar Syndrome list pages typically do not display the release year directly with each item.
 * The scraper for this site primarily extracts titles.
 */
export const VINEGAR_SYNDROME_SELECTORS = {
    PRODUCT_ITEM: '.product-info',
    TITLE: '.prod-title'
    // Note: Vinegar Syndrome might not have a readily available year on the main list page.
};

/**
 * CSS selectors for scraping the Masters of Cinema website product listing pages.
 * @type {object}
 * @property {string} PAGE_DATA_GRID_CONTAINER - Selector for the main container holding all movie items on a page. Used with `waitForSelector`.
 * @property {string} MOVIE_ITEM - Selector for each individual movie item/card within the grid.
 * @property {string} TITLE - Selector for the element containing the movie title within a movie item.
 * @property {string} DETAILS_ELEMENT - Selector for elements (typically `<small>`) containing details like director and year/country. The year is often in the second such element.
 */
export const MASTERS_OF_CINEMA_SELECTORS = {
    PAGE_DATA_GRID_CONTAINER: '.data-grid-container', // Used to wait for the main content grid to load
    MOVIE_ITEM: '.data-grid-item',                  // Each individual movie card
    TITLE: '.title',                                // The title text within a card
    DETAILS_ELEMENT: 'small'                        // Elements containing director and year/country info
};

/**
 * CSS selectors for scraping the SIFF Film Finder website.
 * @type {object}
 * @property {string} FILM_LIST_CONTAINER - Selector for the main div holding all film items (e.g., "div.row.filtered-index").
 * @property {string} MOVIE_ITEM_WRAPPER - Selector for the wrapper of each individual film item (e.g., "div.col-xs-6.col-sm-4.col-md-3").
 * @property {string} TITLE - Selector for the film title element within a movie item.
 * @note SIFF list pages typically do not display the release year directly with each item.
 * The scraper for this site primarily extracts titles.
 */
export const SIFF_SELECTORS = {
    FILM_LIST_CONTAINER: 'div.row.filtered-index', // The div that contains all the film columns
    MOVIE_ITEM_WRAPPER: 'div.row.filtered-index > div.col-xs-6', // Each column holding a film
    TITLE: 'a.tw-group span span.tw-text-2xl.tw-font-bold' 
};

// -----------------------------------------------------------------------------
// TMDB API CONFIGURATION
// Defines base URLs for different versions of the TMDB API.
// API keys should be stored in environment variables (e.g., .env file), not here.
// -----------------------------------------------------------------------------

/**
 * Configuration for interacting with The Movie Database (TMDB) API.
 * @type {object}
 * @property {string} BASE_URL_V3 - The base URL for TMDB API v3 (primarily used for searching movies/collections).
 * @property {string} BASE_URL_V4 - The base URL for TMDB API v4 (used for list management and user authentication).
 */
export const TMDB_API_CONFIG = {
    BASE_URL_V3: 'https://api.themoviedb.org/3', // Used for movie/collection searching
    BASE_URL_V4: 'https://api.themoviedb.org/4', // Used for list management and user authentication
};

// Example of how you might store other app-wide constants:
// export const APP_SETTINGS = {
//     DEFAULT_RETRY_ATTEMPTS: 3,
//     DEFAULT_TIMEOUT_MS: 30000,
// };
