// Configuration file for films to exclude from scraping/processing

/**
 * Films to exclude from all scrapers and TMDB operations
 * Each entry can be a string (exact title match) or an object with title and optional year
 */
export const FILM_BLACKLIST = [
    // Olympic Films collection - causes issues with TMDB API
    "100 Years of Olympic Films: 1912–2012",
    
    // Example of title with year specification (if needed for precision)
    // { title: "Some Film", year: "1999" },
    
    // Add more problematic films here as needed
];

/**
 * Check if a film should be excluded based on the blacklist
 * @param {string} title - The film title to check
 * @param {string|null} year - Optional year for more precise matching
 * @returns {boolean} True if the film should be excluded
 */
export const isFilmBlacklisted = (title, year = null) => {
    if (!title) return false;
    
    return FILM_BLACKLIST.some(blacklistItem => {
        if (typeof blacklistItem === 'string') {
            // Simple string comparison (case-insensitive)
            return title.toLowerCase().trim() === blacklistItem.toLowerCase().trim();
        } else if (typeof blacklistItem === 'object' && blacklistItem.title) {
            // Object with title and optional year
            const titleMatches = title.toLowerCase().trim() === blacklistItem.title.toLowerCase().trim();
            const yearMatches = !blacklistItem.year || year === blacklistItem.year;
            return titleMatches && yearMatches;
        }
        return false;
    });
};

/**
 * Filter an array of films to remove blacklisted items
 * @param {Array<{title: string, year: string|null}>} films - Array of film objects
 * @returns {Array<{title: string, year: string|null}>} Filtered array with blacklisted films removed
 */
export const filterBlacklistedFilms = (films) => {
    return films.filter(film => !isFilmBlacklisted(film.title, film.year));
};