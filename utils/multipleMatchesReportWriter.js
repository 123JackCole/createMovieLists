import fs from 'fs/promises';
import path from 'path';

/**
 * Generates and writes a Markdown report detailing movies that had multiple TMDB matches
 * with the same title and year, showing which movie was selected and what alternatives were available.
 * This helps with manual curation to identify and remove false matches.
 *
 * @async
 * @function writeMultipleMatchesReport
 * @param {Object.<string, Array<{originalTitle: string, originalYear: string|null, searchTerm: string, searchYear: string|null, selectedMovie: Object, allMatches: Array<Object>}>>} multipleMatchesByListTitle
 * An object where each key is a list title (string) and the value is an array of objects
 * containing information about movies that had multiple matches:
 * - `originalTitle`: The original title from the source
 * - `originalYear`: The original year from the source (if any)
 * - `searchTerm`: The sanitized search term used
 * - `searchYear`: The year used in the search (if any)
 * - `selectedMovie`: The movie that was selected (highest vote count)
 * - `allMatches`: Array of all movies that matched the search criteria
 * @returns {Promise<void>} A promise that resolves when the report has been written, or rejects if writing fails.
 */
export const writeMultipleMatchesReport = async (multipleMatchesByListTitle) => {
    const reportFilename = `TMDB_Multiple_Matches_Report.md`;
    
    let reportContent = `# TMDB Multiple Matches Report (${new Date().toLocaleString()})\n\n`;
    reportContent += `This report shows movies that had multiple TMDB matches with the same title and year. The movie with the highest vote count was automatically selected, but you may want to manually review these to ensure the correct movie was chosen.\n\n`;

    let totalMultipleMatchesOverall = 0;

    // Iterate over each list title
    for (const listTitle in multipleMatchesByListTitle) {
        const multipleMatchesForThisList = multipleMatchesByListTitle[listTitle];
        
        if (!multipleMatchesForThisList || multipleMatchesForThisList.length === 0) {
            continue; // Skip lists with no multiple matches
        }

        reportContent += `## List: ${listTitle}\n\n`;
        reportContent += `**${multipleMatchesForThisList.length} movies with multiple matches:**\n\n`;
        totalMultipleMatchesOverall += multipleMatchesForThisList.length;

        // Process each movie with multiple matches
        multipleMatchesForThisList.forEach((matchInfo, index) => {
            reportContent += `### ${index + 1}. "${matchInfo.originalTitle}" (${matchInfo.originalYear || 'No Year'})\n\n`;
            reportContent += `- **Search Term:** "${matchInfo.searchTerm}"\n`;
            reportContent += `- **Search Year:** ${matchInfo.searchYear || 'Any'}\n`;
            reportContent += `- **Total Matches Found:** ${matchInfo.allMatches.length}\n\n`;

            // Show the selected movie
            const selected = matchInfo.selectedMovie;
            reportContent += `** SELECTED (Highest Vote Count):**\n`;
            reportContent += `- **TMDB ID:** ${selected.id}\n`;
            reportContent += `- **Title:** "${selected.title}"\n`;
            reportContent += `- **Release Date:** ${selected.release_date || 'N/A'}\n`;
            reportContent += `- **Vote Count:** ${selected.vote_count || 0}\n`;
            reportContent += `- **Vote Average:** ${selected.vote_average || 'N/A'}\n`;
            if (selected.overview) {
                reportContent += `- **Overview:** ${selected.overview.substring(0, 200)}${selected.overview.length > 200 ? '...' : ''}\n`;
            }
            reportContent += `- **TMDB URL:** https://www.themoviedb.org/movie/${selected.id}\n\n`;

            // Show alternative matches
            const alternatives = matchInfo.allMatches.filter(movie => movie.id !== selected.id);
            if (alternatives.length > 0) {
                reportContent += `** ALTERNATIVES (Not Selected):**\n\n`;
                alternatives.forEach((alt, altIndex) => {
                    reportContent += `${altIndex + 1}. **TMDB ID:** ${alt.id} - "${alt.title}"\n`;
                    reportContent += `   - **Release Date:** ${alt.release_date || 'N/A'}\n`;
                    reportContent += `   - **Vote Count:** ${alt.vote_count || 0}\n`;
                    reportContent += `   - **Vote Average:** ${alt.vote_average || 'N/A'}\n`;
                    if (alt.overview) {
                        reportContent += `   - **Overview:** ${alt.overview.substring(0, 150)}${alt.overview.length > 150 ? '...' : ''}\n`;
                    }
                    reportContent += `   - **TMDB URL:** https://www.themoviedb.org/movie/${alt.id}\n\n`;
                });
            }

            reportContent += `---\n\n`;
        });
    }

    // Add overall summary
    if (totalMultipleMatchesOverall === 0) {
        reportContent += `**Overall: No movies with multiple matches found across all lists.**\n`;
    } else {
        reportContent += `**Overall Summary: ${totalMultipleMatchesOverall} movies had multiple TMDB matches and require manual review.**\n\n`;
        reportContent += `**Instructions for Manual Review:**\n`;
        reportContent += `1. Visit the TMDB URLs for both selected and alternative movies\n`;
        reportContent += `2. Compare plot summaries, cast, and other details\n`;
        reportContent += `3. Identify any false matches that should be removed from your database\n`;
        reportContent += `4. Consider the release date context of your source material\n`;
        reportContent += `5. Note that higher vote counts generally indicate more popular/well-known versions\n`;
    }

    // Write the report to file
    try {
        await fs.writeFile(reportFilename, reportContent);
        console.log(`\n---> [MultipleMatchesReporter] INFO: Multiple matches report generated: ${path.resolve(reportFilename)}`);
    } catch (error) {
        console.error(`[MultipleMatchesReporter] ERROR: Failed to write multiple matches report to "${reportFilename}" - Error: ${error.message}`, error.stack || '');
    }
};