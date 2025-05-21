/**
 * Sanitizes a movie title, extracts a potential search year, and flags if it's likely a collection.
 * @param {string} rawTitle The raw movie title.
 * @param {string|null} scrapedYear The year of the movie as scraped (can be 'N/A', a range, or null).
 * @returns {{sanitizedTitle: string, searchYear: string|null, isLikelyCollection: boolean}}
 */
export const normalizeTitleForSearch = (rawTitle, scrapedYear) => {
    if (!rawTitle) {
        return { sanitizedTitle: '', searchYear: null, isLikelyCollection: false };
    }

    let normalizedTitle = rawTitle;
    let searchYear = null;
    let isLikelyCollection = false;
    const originalTitleLower = rawTitle.toLowerCase();

    // Keywords that suggest a title might be a collection or box set
    const collectionKeywords = [
        "trilogy", "tetralogy", "collection", "box set", "serials", "films by", "series",
        "films of", "works of", "project no.", "volume", "anthology", "showa-era films",
        "his greatest hits", "the complete films", "essential films", "masterpieces",
        "eclipse series", "five films directed by", "three films by", "two films by",
        "four films by", "six short films", "the silent years", "the early years",
        "the sound years", "emergence of a superstar", "the wallace krimi at ccc",
        "science fiction at defa", "produced by val lewton", "tales of the four seasons",
        "journeys by", "comedies", "dramas", "escapes", "melodramas"
    ];

    if (collectionKeywords.some(keyword => originalTitleLower.includes(keyword))) {
        isLikelyCollection = true;
    }
    // Also consider titles with multiple works separated by '/' or '&' as potentially needing collection lookup
    // or needing to be split (though we try to split '/' for movie search)
    if (originalTitleLower.includes('/') || (originalTitleLower.includes(' & ') && originalTitleLower.split(' & ').length > 1) ) {
        // This is a weaker signal for "collection" but might indicate multiple items
        isLikelyCollection = true;
    }


    const isValidSingleYear = (yr) => yr && /^\d{4}$/.test(yr) && yr !== 'N/A';

    if (isValidSingleYear(scrapedYear)) {
        searchYear = scrapedYear;
    } else if (scrapedYear && scrapedYear.includes('-') && isValidSingleYear(scrapedYear.split('-')[0])) {
        searchYear = scrapedYear.split('-')[0].trim();
    } else if (scrapedYear && scrapedYear.includes('/') && isValidSingleYear(scrapedYear.split('/')[0])) {
        const firstPart = scrapedYear.split('/')[0].trim();
        if (isValidSingleYear(firstPart)) searchYear = firstPart;
    }

    const yearInTitleRegex = /\s*\((\d{4})\)$/;
    const titleYearMatch = normalizedTitle.match(yearInTitleRegex);
    if (titleYearMatch && titleYearMatch[1]) {
        const yearFromTitle = titleYearMatch[1];
        if (!searchYear) searchYear = yearFromTitle;
        normalizedTitle = normalizedTitle.replace(yearInTitleRegex, '');
    }

    // --- Phase 1: Remove specific edition/format/superfluous info ---
    normalizedTitle = normalizedTitle.replace(/\s*-\s*Limited Edition Deluxe LED VHS/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Limited Edition\)\s*\(4K UHD and Blu-ray\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Limited Edition Box Set\)\s*\[\d+\s*copies\]/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\[Limited Edition Box Set\]\s*4K Ultra HD/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Limited Edition Box Set\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Limited Edition\) \[\d+\s*copies\]/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Limited Edition\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\[Hard Case\]/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(4K UHD and Blu-ray\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(4K Ultra HD\/BD\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*4K Ultra HD/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(UHD\/BD\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(UHD\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Blu-ray\/DVD Combo\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Blu-ray\/DVD\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(BD\/DVD\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Blu-ray\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(DVD\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\[Standard Edition\]/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Standard Edition\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\[Single Disc\]/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(Reissue\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\[Sold Out\]/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\[Region Free\]/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\[\d+\s*copies\]/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(aka [^)]+\)/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\[aka [^\]]+\]/gi, '');
    normalizedTitle = normalizedTitle.replace(/\s*\(2024\)/gi, '');


    // --- Phase 2: Handle Collection Prefixes and Suffixes ---
    // For collection search, we might want a less aggressively cleaned title,
    // or use the rawTitle. For movie search, these removals are generally good.
    if (!isLikelyCollection || (isLikelyCollection && normalizedTitle.length > rawTitle.length * 0.5) ) { // Apply these if not a collection or if title still long
        normalizedTitle = normalizedTitle.replace(/^(Eclipse Series \d+:|Martin Scorsese’s World Cinema Project No\. \d+:|Forgotten Gialli: Volume \w+:|Home Grown Horrors: Volume \w+:)\s*/i, '');
        normalizedTitle = normalizedTitle.replace(/\s*No\.\s*\d+/gi, '');
        normalizedTitle = normalizedTitle.replace(/\s*Volume\s*([IVXLCDM]+|\d+|One|Two|Three|Four|Five|Six|Seven|Eight)/gi, '');
    }
    // These are more general and might apply even to collection titles for cleanup
    normalizedTitle = normalizedTitle.replace(/:\s*(The Complete Films|The Complete Short Films|The Complete Crime Serials|The Documentaries of|Travels with|Portraits of the Artist|The Early Years|The Silent Years|The Sound Years|Emergence of a Superstar|Masterpieces, \d{4}–\d{4}|The Wallace Krimi at CCC|Science Fiction at DEFA|Produced by Val Lewton|Five Films Directed by .*|Three Films by .*|Two Films by .*|Four Films by .*|Six Short Films by .*)/gi, '');


    // --- Phase 3: Handle slash-separated titles (for movie search, take first part) ---
    if (normalizedTitle.includes('/') && !normalizedTitle.match(/Blu-ray\/DVD/i)) {
        normalizedTitle = normalizedTitle.split('/')[0].trim();
    }
    
    // --- Phase 4: Year removal (already largely handled by yearInTitleRegex at the top) ---
    const trailingYearRegex = /\s*\(\d{4}(-\d{4})?\)$/;
    if (normalizedTitle.match(trailingYearRegex)) {
        const matchedTrailingYear = normalizedTitle.match(trailingYearRegex)[0].replace(/[()\s]/g, '');
        if (searchYear !== matchedTrailingYear.split('-')[0]) {
            normalizedTitle = normalizedTitle.replace(trailingYearRegex, '');
        }
    }

    // --- Phase 5: Remove generic collection terms (more aggressively if needed) ---
    // If it's likely a collection, we might be more gentle here or skip this for collection search.
    if (!isLikelyCollection || (isLikelyCollection && normalizedTitle.length > rawTitle.length * 0.6)) {
        const collectionTermsToRemove = [
            "Trilogy", "Tetralogy", "Box Set", "Serials",
            "Double Feature", "Anthology"
        ];
        for (const term of collectionTermsToRemove) {
            const regex = new RegExp(`\\s*${term}(\\s*:|\\s+|$|\\s*No\\.\\s*\\d+|\\s*Volume\\s*[IVXLCDM\\d]+)?`, 'gi');
            normalizedTitle = normalizedTitle.replace(regex, '');
        }
        normalizedTitle = normalizedTitle.replace(/\s*1\s*&\s*2/gi, '');
        normalizedTitle = normalizedTitle.replace(/\s*1\s*[-–]\s*\d+/gi, '');
    }


    // --- Phase 6: Final cleanup ---
    normalizedTitle = normalizedTitle.replace(/\s*[:–-]\s*$/, '');
    normalizedTitle = normalizedTitle.trim();
    normalizedTitle = normalizedTitle.replace(/\s\s+/g, ' ');

    let finalSanitizedTitle = normalizedTitle;
    // If sanitization resulted in an empty string, or something very short,
    // and it was likely a collection, consider using a less processed version or original for collection search.
    // For movie search, if it's empty, it's problematic.
    if (!finalSanitizedTitle && rawTitle) {
        finalSanitizedTitle = rawTitle.split('/')[0].trim(); // Basic fallback
    }
    
    // If isLikelyCollection is true, the sanitizedTitle might be for movie search.
    // For collection search, sometimes rawTitle or a less aggressively cleaned title is better.
    // This function primarily prepares for movie search.
    // The `isLikelyCollection` flag helps `getMovieIds` decide to try a collection search.

    return {
        sanitizedTitle: finalSanitizedTitle,
        searchYear: isValidSingleYear(searchYear) ? searchYear : null,
        isLikelyCollection
    };
};
