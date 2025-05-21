// Config file for all constant values
// any changes to the scripts should be started here

// -----------------------------------------------------------------------------
// SCRAPER CONFIGURATION
// -----------------------------------------------------------------------------
export const SCRAPER_URLS = {
    CRITERION: 'https://www.criterion.com/shop/browse/list?sort=spine_number&format=blu-ray,dvd',
    CRITERION_4K: 'https://www.criterion.com/shop/browse/list?sort=spine_number&format=4k_ultra_hd',
    VINEGAR_SYNDROME: 'https://vinegarsyndrome.com/collections/all-vinegar-syndrome-releases?filter.p.product_type=Blu-ray&filter.p.product_type=Blu-ray%2FDVD%20Combo&filter.p.product_type=DVD&filter.p.product_type=VHS&page=',
    VINEGAR_SYNDROME_4K: 'https://vinegarsyndrome.com/collections/all-vinegar-syndrome-releases?filter.p.product_type=4k%20Ultra%20HD%2FBlu-ray%20Combo&page=',
    MASTERS_OF_CINEMA: 'https://eurekavideo.co.uk/masters-of-cinema/#page-'
};

export const CRITERION_SELECTORS = {
    MOVIE_ROW: 'tbody tr',
    TITLE_TEXT_SPAN: '.g-title span',
    YEAR_TEXT: '.g-year',
    DIRECTOR_TEXT: '.g-director',
    COUNTRY_TEXT: '.g-country'
};

export const CRITERION_COLLECTION_DETAIL_SELECTORS = {
    FILM_SET_ITEM: 'ul.film-setlist > a > li.film-set',
    FILM_TITLE: 'p.film-set-title',
    FILM_YEAR: 'p.film-set-year',
};

export const VINEGAR_SYNDROME_SELECTORS = {
    PRODUCT_ITEM: '.product-info',
    TITLE: '.prod-title'
    // Note: Vinegar Syndrome might not have a readily available year on the main list page.
};

export const MASTERS_OF_CINEMA_SELECTORS = {
    PAGE_DATA_GRID_CONTAINER: '.data-grid-container', // For waitForSelector
    MOVIE_ITEM: '.data-grid-item',
    TITLE: '.title',
    DETAILS_ELEMENT: 'small'
};

// -----------------------------------------------------------------------------
// TMDB API CONFIGURATION
// -----------------------------------------------------------------------------
export const TMDB_API_CONFIG = {
    BASE_URL_V3: 'https://api.themoviedb.org/3', // For movie searching
    BASE_URL_V4: 'https://api.themoviedb.org/4', // For list management and authentication
};