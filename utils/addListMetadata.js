// utils/addListMetadata.js

/**
 * Takes arrays of scraped movie data from different sources and transforms them
 * into a structured array suitable for creating or updating TMDB lists.
 * Each object in the returned array represents a list to be processed,
 * containing its title, description, and the associated movie data (titles and years).
 *
 * @function addListMetadata
 * @param {object} scrapedData - An object containing arrays of scraped movie data.
 * @param {Array<{title: string, year: string|null}>} [scrapedData.ccMovies=[]] - Movies from Criterion Collection (Blu-ray/DVD).
 * @param {Array<{title: string, year: string|null}>} [scrapedData.cc4kMovies=[]] - Movies from Criterion Collection (4K UHD).
 * @param {Array<{title: string, year: string|null}>} [scrapedData.vsMovies=[]] - Movies from Vinegar Syndrome (Blu-ray/DVD).
 * @param {Array<{title: string, year: string|null}>} [scrapedData.vs4kMovies=[]] - Movies from Vinegar Syndrome (4K UHD).
 * @param {Array<{title: string, year: string|null}>} [scrapedData.mocMovies=[]] - Movies from Masters of Cinema.
 * @returns {Array<{title: string, description: string, movieData: Array<{title: string, year: string|null}>}>}
 * An array of objects, where each object represents a list to be created/updated on TMDB.
 * Returns an empty array if no movie data is provided for any source.
 */
export const addListMetadata = ({
    ccMovies = [], // Default to empty array if not provided
    cc4kMovies = [],
    vsMovies = [],
    vs4kMovies = [],
    mocMovies = []
}) => {
    // Define metadata (titles and descriptions) for each TMDB list that will be created/updated.
    // These could also be moved to a central config file if they become numerous or need frequent changes.
    const ccTitle = 'Criterion Collection Movie List';
    const ccDescription = 'All movies in the Criterion Collection. Source: https://www.criterion.com/';
    
    const cc4kTitle = 'Criterion Collection 4k Movie List';
    const cc4kDescription = 'All 4k movies in the Criterion Collection. Source: https://www.criterion.com/';
    
    const vsTitle = 'Vinegar Syndrome Movie List';
    const vsDescription = 'All movies in the Vinegar Syndrome. Source: https://vinegarsyndrome.com/';
    
    const vs4kTitle = 'Vinegar Syndrome 4k Movie List';
    const vs4kDescription = 'All 4k movies in the Vinegar Syndrome. Source: https://vinegarsyndrome.com/';
    
    const mocTitle = 'The Masters of Cinema Movie List';
    const mocDescription = 'All movies in the Masters of Cinema. Source: https://eurekavideo.co.uk/masters-of-cinema/';

    // Initialize an array to hold the structured data for each list.
    const tmdbListData = [];
    
    // Conditionally add data for each source list if movies were scraped for it.
    if (ccMovies?.length > 0) { // Check if the ccMovies array exists and has items
        tmdbListData.push({
            title: ccTitle,
            description: ccDescription,
            movieData: ccMovies // Array of {title, year} objects
        });
    }

    if (cc4kMovies?.length > 0) {
        tmdbListData.push({
            title: cc4kTitle,
            description: cc4kDescription,
            movieData: cc4kMovies
        });
    }

    if (vsMovies?.length > 0) {
        tmdbListData.push({
            title: vsTitle,
            description: vsDescription,
            movieData: vsMovies
        });
    }

    if (vs4kMovies?.length > 0) {
        tmdbListData.push({
            title: vs4kTitle,
            description: vs4kDescription,
            movieData: vs4kMovies
        });
    }

    if (mocMovies?.length > 0) {
        tmdbListData.push({
            title: mocTitle,
            description: mocDescription,
            movieData: mocMovies
        });
    }
    
    // Log how many lists are being prepared (can be done in the calling function too)
    // console.log(`[AddListMetadata] INFO: Prepared ${tmdbListData.length} lists for TMDB processing.`);
    
    return tmdbListData;
};
