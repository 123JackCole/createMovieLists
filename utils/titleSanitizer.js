/**
 * Sanitizes a movie title to improve TMDB search accuracy, extracts a potential search year,
 * and flags if the original title likely refers to a collection or box set.
 *
 * The sanitization process involves multiple phases:
 * 1. Determining a primary search year (from scraped data or title).
 * 2. Removing common edition, format, and superfluous information (e.g., "(Limited Edition)", "(4K UHD)").
 * 3. Handling specific prefixes and suffixes related to collections (e.g., "Eclipse Series X:", "Volume Y").
 * 4. Processing titles that might represent multiple works (e.g., "Title A / Title B").
 * 5. Removing generic collection-related terms if the title isn't primarily identified as a collection.
 * 6. Final cleanup of whitespace and trailing characters.
 *
 * @param {string} rawTitle The original, potentially messy, movie title from the scraping source.
 * @param {string|null} scrapedYear The year string as scraped from the source. This can be a single year,
 * a range (e.g., "1960-1976"), "N/A", or null.
 * @returns {{
* sanitizedTitle: string,
* searchYear: string|null,
* isLikelyCollection: boolean
* }} An object containing:
* - `sanitizedTitle`: The cleaned title, intended for TMDB movie searches.
* - `searchYear`: The best guess for a single 4-digit year to use in TMDB searches, or null if none could be reliably determined.
* - `isLikelyCollection`: A boolean flag indicating if the `rawTitle` likely refers to a collection, box set, or series.
*/
export const normalizeTitleForSearch = (rawTitle, scrapedYear) => {
   // Immediately return if no raw title is provided to avoid errors.
   if (!rawTitle) {
       return { sanitizedTitle: '', searchYear: null, isLikelyCollection: false };
   }

   let normalizedTitle = rawTitle;
   let searchYear = null;
   let isLikelyCollection = false;
   const originalTitleLower = rawTitle.toLowerCase(); // Used for case-insensitive keyword matching.

   // Keywords that strongly suggest the rawTitle refers to a collection, box set, or series.
   // This is used to guide later sanitization steps and TMDB search strategy.
   const collectionKeywords = [
       "trilogy", "tetralogy", "collection", "box set", "serials", "films by", "series",
       "films of", "works of", "project no.", "volume", "anthology", "showa-era films",
       "his greatest hits", "the complete films", "essential films", "masterpieces",
       "eclipse series", "five films directed by", "three films by", "two films by",
       "four films by", "six short films", "the silent years", "the early years",
       "the sound years", "emergence of a superstar", "the wallace krimi at ccc",
       "science fiction at defa", "produced by val lewton", "tales of the four seasons",
       "journeys by", "comedies", "dramas", "escapes", "melodramas"
       // Note: Some terms like "Cinema" or "Collection" might be part of actual movie titles,
       // so their removal later is conditional or more targeted.
   ];

   if (collectionKeywords.some(keyword => originalTitleLower.includes(keyword))) {
       isLikelyCollection = true;
   }
   // Titles with '/' or '&' (suggesting multiple works) are also good candidates for collection search.
   if (originalTitleLower.includes('/') || (originalTitleLower.includes(' & ') && originalTitleLower.split(' & ').length > 1) ) {
       isLikelyCollection = true; // This might be a weaker signal but worth noting.
   }

   /**
    * Helper function to validate if a string is a single 4-digit year.
    * @param {string|null} yr The string to validate.
    * @returns {boolean} True if it's a valid single year, false otherwise.
    */
   const isValidSingleYear = (yr) => yr && /^\d{4}$/.test(yr) && yr !== 'N/A';

   // Determine the primary searchYear:
   // 1. Prefer a valid single year from scrapedYear.
   // 2. If scrapedYear is a range (e.g., "1960-1976"), use the first year.
   // 3. If scrapedYear is slash-separated (e.g., "1966 / Germany"), try the first part.
   if (isValidSingleYear(scrapedYear)) {
       searchYear = scrapedYear;
   } else if (scrapedYear && scrapedYear.includes('-')) {
       const firstYearInRange = scrapedYear.split('-')[0].trim();
       if (isValidSingleYear(firstYearInRange)) searchYear = firstYearInRange;
   } else if (scrapedYear && scrapedYear.includes('/')) {
       const firstPart = scrapedYear.split('/')[0].trim();
       if (isValidSingleYear(firstPart)) searchYear = firstPart;
   }

   // Regex to find a year like (YYYY) at the end of the title.
   const yearInTitleRegex = /\s*\((\d{4})\)$/;
   const titleYearMatch = normalizedTitle.match(yearInTitleRegex);

   if (titleYearMatch && titleYearMatch[1]) { // If a (YYYY) pattern is found
       const yearFromTitle = titleYearMatch[1];
       if (!searchYear) { // Only use this year if we haven't already set a searchYear from scrapedYear
           searchYear = yearFromTitle;
       }
       // Always remove the (YYYY) from the title string if it was matched, to clean the title.
       normalizedTitle = normalizedTitle.replace(yearInTitleRegex, '');
   }

   // --- Phase 1: Remove specific edition, format, and superfluous info ---
   // These are common patterns that clutter titles and reduce TMDB search accuracy.
   // Order can be important: remove more specific/longer patterns first.
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
   normalizedTitle = normalizedTitle.replace(/\s*4K Ultra HD/gi, ''); // More aggressive removal for "Title 4K Ultra HD"
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
   normalizedTitle = normalizedTitle.replace(/\s*\[\d+\s*copies\]/gi, ''); // e.g., "[3000 copies]"
   normalizedTitle = normalizedTitle.replace(/\s*\(aka [^)]+\)/gi, ''); // Remove "(aka...)"
   normalizedTitle = normalizedTitle.replace(/\s*\[aka [^\]]+\]/gi, ''); // Remove "[aka...]"
   normalizedTitle = normalizedTitle.replace(/\s*\(2024\)/gi, ''); // Example: remove specific year if it's edition info, not release year


   // --- Phase 2: Handle Collection Prefixes and Suffixes ---
   // These rules attempt to strip common collection-related phrasing to isolate a core title.
   // The condition `!isLikelyCollection || ...` tries to be less aggressive if the title
   // wasn't initially flagged as a collection, or if it's already quite long,
   // to avoid over-stripping a legitimate (though long) movie title.
   if (!isLikelyCollection || (isLikelyCollection && normalizedTitle.length > rawTitle.length * 0.5) ) {
       // Remove specific prefixes like "Eclipse Series 1: "
       normalizedTitle = normalizedTitle.replace(/^(Eclipse Series \d+:|Martin Scorsese’s World Cinema Project No\. \d+:|Forgotten Gialli: Volume \w+:|Home Grown Horrors: Volume \w+:)\s*/i, '');
       // Remove general "No. X" or "Volume X" if they appear elsewhere (often after a colon)
       normalizedTitle = normalizedTitle.replace(/\s*No\.\s*\d+/gi, '');
       normalizedTitle = normalizedTitle.replace(/\s*Volume\s*([IVXLCDM]+|\d+|One|Two|Three|Four|Five|Six|Seven|Eight)/gi, '');
   }
   // Remove more general descriptive suffixes that often follow a colon.
   normalizedTitle = normalizedTitle.replace(/:\s*(The Complete Films|The Complete Short Films|The Complete Crime Serials|The Documentaries of|Travels with|Portraits of the Artist|The Early Years|The Silent Years|The Sound Years|Emergence of a Superstar|Masterpieces, \d{4}–\d{4}|The Wallace Krimi at CCC|Science Fiction at DEFA|Produced by Val Lewton|Five Films Directed by .*|Three Films by .*|Two Films by .*|Four Films by .*|Six Short Films by .*)/gi, '');


   // --- Phase 3: Handle slash-separated titles (for movie search, take first part) ---
   // If a title contains '/', it often represents multiple works (e.g., "Title A / Title B").
   // For a direct movie search, we typically try the first part.
   // We avoid splitting common format strings like "Blu-ray/DVD".
   if (normalizedTitle.includes('/') && !normalizedTitle.match(/Blu-ray\/DVD/i)) {
       normalizedTitle = normalizedTitle.split('/')[0].trim();
   }
   
   // --- Phase 4: Year removal (already largely handled by yearInTitleRegex at the top) ---
   // This is a final cleanup for any (YYYY) or (YYYY-YYYY) at the end of the title,
   // especially if the year extracted from the title wasn't the one chosen as `searchYear`.
   const trailingYearRegex = /\s*\(\d{4}(-\d{4})?\)$/;
   if (normalizedTitle.match(trailingYearRegex)) {
       const matchedTrailingYearFull = normalizedTitle.match(trailingYearRegex)[0];
       const matchedTrailingYearDigits = matchedTrailingYearFull.replace(/[()\s]/g, ''); // Get "YYYY" or "YYYY-YYYY"
       // Only remove if this trailing year (or its first part if a range) wasn't our chosen searchYear.
       if (searchYear !== matchedTrailingYearDigits.split('-')[0]) {
           normalizedTitle = normalizedTitle.replace(trailingYearRegex, '');
       }
   }

   // --- Phase 5: Remove generic collection terms ---
   // This is more aggressive. If `isLikelyCollection` is false, or if it is true but the title
   // is still reasonably long (heuristic: >60% of original), we apply these removals.
   // This helps clean up titles for individual movie search but might be too much if the
   // original title *was* the best query for a collection search on TMDB.
   if (!isLikelyCollection || (isLikelyCollection && normalizedTitle.length > rawTitle.length * 0.6)) {
       const collectionTermsToRemove = [
           "Trilogy", "Tetralogy", "Box Set", "Serials",
           "Double Feature", "Anthology"
           // "Collection", "Cinema", "Series" are omitted here as they might be too broad
           // or part of a more specific pattern handled earlier/later.
       ];
       for (const term of collectionTermsToRemove) {
           // Regex to match the term if it's standalone or followed by specific separators/indicators.
           const regex = new RegExp(`\\s*${term}(\\s*:|\\s+|$|\\s*No\\.\\s*\\d+|\\s*Volume\\s*[IVXLCDM\\d]+)?`, 'gi');
           normalizedTitle = normalizedTitle.replace(regex, '');
       }
       // Specific patterns for numbered items.
       normalizedTitle = normalizedTitle.replace(/\s*1\s*&\s*2/gi, ''); // e.g., "Title 1 & 2"
       normalizedTitle = normalizedTitle.replace(/\s*1\s*[-–]\s*\d+/gi, ''); // e.g., "Title 1-3" or "Title 1 – 3"
   }


   // --- Phase 6: Final cleanup ---
   normalizedTitle = normalizedTitle.replace(/\s*[:–-]\s*$/, ''); // Remove trailing punctuation like ' :', ' -'
   normalizedTitle = normalizedTitle.trim();                       // Remove leading/trailing whitespace
   normalizedTitle = normalizedTitle.replace(/\s\s+/g, ' ');      // Collapse multiple spaces into one

   let finalSanitizedTitle = normalizedTitle;
   // Fallback: If sanitization results in an empty string, use a minimally processed version of the raw title.
   // This prevents sending empty queries to TMDB.
   if (!finalSanitizedTitle && rawTitle) {
       console.warn(`[TitleSanitizer] WARN: Title "${rawTitle}" became empty after sanitization. Using fallback.`);
       finalSanitizedTitle = rawTitle.split('/')[0].trim(); // Basic fallback: take first part of slash-separated or whole title
       if (!finalSanitizedTitle) finalSanitizedTitle = rawTitle.trim(); // If still empty, use original trimmed
   }
   
   // The `isLikelyCollection` flag is returned to help `getMovieIds` decide
   // whether to attempt a TMDB collection search if a direct movie search fails.
   // The `sanitizedTitle` is primarily optimized for *movie* search.
   // For *collection* search, `getMovieIds` might use `rawTitle` or a less-cleaned version.

   return {
       sanitizedTitle: finalSanitizedTitle,
       searchYear: isValidSingleYear(searchYear) ? searchYear : null, // Ensure searchYear is a valid single year or null
       isLikelyCollection
   };
};
