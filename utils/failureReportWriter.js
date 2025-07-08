import fs from 'fs/promises'; // Using the promise-based version of the 'fs' module for async file operations
import path from 'path';     // Core Node.js module for working with file and directory paths

/**
 * Generates and writes a Markdown report detailing movies that could not be successfully
 * matched with a TMDB ID or encountered errors during the TMDB search process.
 * The report is organized by the source list title.
 *
 * @async
 * @function writeFailureReport
 * @param {Object.<string, {notFoundTitles: Array<{title: string, year: string|null}>, failedToSearchTitles: Array<{title: string, year: string|null, reason: string, details?: string}>}>} failuresByListTitle
 * An object where each key is a list title (string) and the value is an object
 * containing two arrays:
 * - `notFoundTitles`: Movies for which TMDB search yielded no results.
 * - `failedToSearchTitles`: Movies for which an error occurred during the TMDB search attempt.
 * @returns {Promise<void>} A promise that resolves when the report has been written, or rejects if writing fails.
 * The function logs success or failure to the console.
 */
export const writeFailureReport = async (failuresByListTitle) => {
    // Define a fixed filename for the report. This file will be overwritten on each run.
    // If a history of reports is desired, a timestamp could be re-introduced into the filename.
    const reportFilename = `TMDB_List_Failure_Report.md`;
    
    // Initialize report content with a main title and the current date/time.
    let reportContent = `# TMDB Movie ID Lookup Failure Report (${new Date().toLocaleString()})\n\n`;

    let totalNotFoundOverall = 0;        // Counter for all movies not found across all lists
    let totalFailedToSearchOverall = 0;  // Counter for all movies that failed during search across all lists

    // Iterate over each list title provided in the failuresByListTitle object
    for (const listTitle in failuresByListTitle) {
        reportContent += `## List: ${listTitle}\n\n`; // Add a section header for the current list
        const failuresForThisList = failuresByListTitle[listTitle];
        let listHadAnyFailures = false; // Flag to track if this specific list had any failures to report

        // Process and format "Not Found" titles for the current list
        if (failuresForThisList.notFoundTitles && failuresForThisList.notFoundTitles.length > 0) {
            listHadAnyFailures = true;
            totalNotFoundOverall += failuresForThisList.notFoundTitles.length;
            reportContent += `### Movies Not Found in TMDB Search (${failuresForThisList.notFoundTitles.length}):\n`;
            failuresForThisList.notFoundTitles.forEach(movie => {
                reportContent += `- Title: "${movie.title}", Year: ${movie.year || 'N/A'}\n`;
            });
            reportContent += "\n"; // Add a blank line for better readability
        }

        // Process and format "Failed to Search" titles for the current list
        if (failuresForThisList.failedToSearchTitles && failuresForThisList.failedToSearchTitles.length > 0) {
            listHadAnyFailures = true;
            totalFailedToSearchOverall += failuresForThisList.failedToSearchTitles.length;
            reportContent += `### Movies Failed During Search Process (${failuresForThisList.failedToSearchTitles.length}):\n`;
            failuresForThisList.failedToSearchTitles.forEach(movie => {
                reportContent += `- Title: "${movie.title || 'N/A'}", Year: ${movie.year || 'N/A'}, Reason: ${movie.reason}`;
                if (movie.details) {
                    // Sanitize details slightly if it's an object, otherwise use as string
                    const detailString = typeof movie.details === 'string' ? movie.details : JSON.stringify(movie.details);
                    reportContent += `, Details: ${detailString}`;
                }
                reportContent += "\n";
            });
            reportContent += "\n"; // Add a blank line
        }

        // If a list had no failures of either type, note that.
        if (!listHadAnyFailures) {
            reportContent += `_No movie ID lookup failures for this list._\n\n`;
        }
    }

    // Add an overall summary to the report
    if (totalNotFoundOverall === 0 && totalFailedToSearchOverall === 0) {
        reportContent += "**Overall: No movie ID lookup failures across all lists.**\n";
    } else {
        reportContent += `**Overall Summary: Total Not Found in Search: ${totalNotFoundOverall}, Total Failed During Search: ${totalFailedToSearchOverall}.**\n`;
    }

    // Try to write the generated report content to the file
    try {
        await fs.writeFile(reportFilename, reportContent);
        // Log success and the absolute path to the generated report file.
        console.log(`\n---> [FailureReportWriter] INFO: Movie ID lookup failure report generated: ${path.resolve(reportFilename)}`);
    } catch (error) {
        // Log an error if writing the file fails.
        console.error(`[FailureReportWriter] ERROR: Failed to write movie ID lookup failure report to "${reportFilename}" - Error: ${error.message}`, error.stack || '');
    }
};
