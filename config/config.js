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
 * @property {string} SIFF - Base URL for the SIFF Film Finder (paginated).
 * @property {string} LETTERBOXD.INDUSTRY - Base URL for the Letterboxd Industry List.
 * @property {string} LETTERBOXD.READERS - Base URL for the Letterboxd Reader List.
 * @property {string} LETTERBOXD.CRITERION - Base URL for the Letterboxd Criterion List.
*/
export const SCRAPER_URLS = {
    CRITERION: 'https://www.criterion.com/shop/browse/list?sort=spine_number&format=blu-ray,dvd',
    CRITERION_4K: 'https://www.criterion.com/shop/browse/list?sort=spine_number&format=4k_ultra_hd',
    VINEGAR_SYNDROME: 'https://vinegarsyndrome.com/collections/all-vinegar-syndrome-releases?filter.p.product_type=Blu-ray&filter.p.product_type=Blu-ray%2FDVD%20Combo&filter.p.product_type=DVD&filter.p.product_type=VHS&page=',
    VINEGAR_SYNDROME_4K: 'https://vinegarsyndrome.com/collections/all-vinegar-syndrome-releases?filter.p.product_type=4k%20Ultra%20HD%2FBlu-ray%20Combo&page=',
    MASTERS_OF_CINEMA: 'https://eurekavideo.co.uk/masters-of-cinema/#page-',
    SIFF: 'https://www.siff.net/festival/film-finder-2025?page=',
    LETTERBOXD: {
        INDUSTRY: 'https://letterboxd.com/hetchy/list/the-new-york-times-100-best-movies-of-the/',
        READERS: 'https://letterboxd.com/hetchy/list/the-nytimes-readers-500-top-movies-of-the/',
        CRITERION: 'https://letterboxd.com/hetchy/list/r-criterions-100-best-films-of-the-21st-century/'
    }
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
 * @property {string} PRODUCT_WRAPPER - Selector for the main div container of each product item on the list page.
 * @property {string} DETAIL_PAGE_LINK - Selector for the `<a>` tag within a product item that links to its detail page.
 * @property {string} TITLE_ON_LIST_PAGE - Selector for the element containing the product title on the list page (often within the DETAIL_PAGE_LINK).
 */
export const VINEGAR_SYNDROME_SELECTORS = {
    FILM_COLLECTION_SELECTOR: '.collection__page-products', // Class of main div containing all movies
    PRODUCT_WRAPPER: '.collection__page-product.js-product-listing', // More specific wrapper for each item
    DETAIL_PAGE_LINK: '.product-info-inner > a', // Link to the detail page
    TITLE_ON_LIST_PAGE: '.prod-title', // The title span, child of the DETAIL_PAGE_LINK
};

/**
 * CSS selectors for scraping individual film or collection detail pages on the Vinegar Syndrome website.
 * @type {object}
 * @property {string} DESCRIPTION_CONTAINER - Selector for the main product description `div` which contains details.
 * @note For collections on Vinegar Syndrome, individual film titles are often within `<strong>` tags inside paragraphs
 * within the DESCRIPTION_CONTAINER. Year information is typically in subsequent paragraphs containing "directed by:".
 * The scraper uses these cues rather than direct selectors for individual film years within collections.
 */
export const VINEGAR_SYNDROME_DETAIL_SELECTORS = {
    DESCRIPTION_CONTAINER: '.product__section--desc.product__decription-container',
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
    MOVIE_ITEM: '.data-grid-item', // Each individual movie card
    TITLE: '.title', // The title text within a card
    DETAILS_ELEMENT: 'small' // Elements containing director and year/country info
};

/**
 * CSS selectors for scraping the SIFF (Seattle International Film Festival) Film Finder list pages.
 * @type {object}
 * @property {string} FILM_LIST_CONTAINER - Selector for the main div holding all film items on a list page (e.g., "div.row.filtered-index").
 * @property {string} MOVIE_ITEM_WRAPPER - Selector for the wrapper of each individual film item on the list page.
 * @property {string} TITLE_ON_LIST_PAGE - Selector for the film title element as it appears on the list page.
 * @property {string} DETAIL_PAGE_LINK - Selector for the `<a>` tag within a movie item that links to the film's detail page.
 */
export const SIFF_SELECTORS = {
    FILM_LIST_CONTAINER: 'div.row.filtered-index',
    MOVIE_ITEM_WRAPPER: 'div.row.filtered-index > div.col-xs-6', // Targets columns directly under the container
    TITLE_ON_LIST_PAGE: 'a.tw-group span span.tw-text-2xl.tw-font-bold',
    DETAIL_PAGE_LINK: 'a.tw-group'
};

/**
 * CSS selectors for scraping individual film detail pages on the SIFF website.
 * @type {object}
 * @property {string} YEAR_INFO_PARAGRAPH - Selector for the `<p class="small">` element that typically
 * contains metadata like year, country, duration, and director. The year is extracted from this paragraph.
 */
export const SIFF_DETAIL_SELECTORS = {
    YEAR_INFO_PARAGRAPH: 'div.col-sm-8 > p.small'
};

/**
 * CSS selectors for scraping Letterboxd list pages.
 * @type {object}
 * @property {string} MOVIE_LIST_CONTAINER - The main <ul> element holding the entire grid of posters.
 * @property {string} FILM_ITEM_CONTAINER - The <li> element that acts as a placeholder for each film. Used to get the total count.
 * @property {string} RENDERED_COMPONENT - The actual <div> React component that is lazy-loaded inside the container.
 * @property {string} TITLE_DATA_ANCHOR - The <a> tag within the component that holds the title and year in its 'data-original-title' attribute.
 */
export const LETTERBOXD_SELECTORS = {
    MOVIE_LIST_CONTAINER: 'ul.js-list-entries.poster-list',
    FILM_ITEM_CONTAINER: 'li.poster-container',
    RENDERED_COMPONENT: 'div.react-component.poster.film-poster',
    TITLE_DATA_ANCHOR: 'a.frame[data-original-title]',
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