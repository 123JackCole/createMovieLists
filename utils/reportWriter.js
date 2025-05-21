import fs from 'fs/promises';
import path from 'path';

export const writeFailureReport = async (failuresByListTitle) => {
    const reportFilename = `TMDB_List_Failure_Report.md`;
    let reportContent = `# TMDB Movie ID Lookup Failure Report (${new Date().toLocaleString()})\n\n`;

    let totalNotFound = 0;
    let totalFailedToSearch = 0;

    for (const listTitle in failuresByListTitle) {
        reportContent += `## List: ${listTitle}\n\n`;
        const failures = failuresByListTitle[listTitle];
        let listHasFailures = false;

        if (failures.notFoundTitles && failures.notFoundTitles.length > 0) {
            listHasFailures = true;
            totalNotFound += failures.notFoundTitles.length;
            reportContent += `### Movies Not Found in TMDB Search (${failures.notFoundTitles.length}):\n`;
            failures.notFoundTitles.forEach(movie => {
                reportContent += `- Title: "${movie.title}", Year: ${movie.year || 'N/A'}\n`;
            });
            reportContent += "\n";
        }

        if (failures.failedToSearchTitles && failures.failedToSearchTitles.length > 0) {
            listHasFailures = true;
            totalFailedToSearch += failures.failedToSearchTitles.length;
            reportContent += `### Movies Failed During Search Process (${failures.failedToSearchTitles.length}):\n`;
            failures.failedToSearchTitles.forEach(movie => {
                reportContent += `- Title: "${movie.title || 'N/A'}", Year: ${movie.year || 'N/A'}, Reason: ${movie.reason}`;
                if (movie.details) {
                    reportContent += `, Details: ${typeof movie.details === 'string' ? movie.details : JSON.stringify(movie.details)}`;
                }
                reportContent += "\n";
            });
            reportContent += "\n";
        }

        if (!listHasFailures) {
            reportContent += `_No movie ID lookup failures for this list._\n\n`;
        }
    }

    if (totalNotFound === 0 && totalFailedToSearch === 0) {
        reportContent += "**Overall: No movie ID lookup failures across all lists.**\n";
    } else {
        reportContent += `**Overall Summary: Total Not Found in Search: ${totalNotFound}, Total Failed During Search: ${totalFailedToSearch}.**\n`;
    }

    try {
        await fs.writeFile(reportFilename, reportContent);
        console.log(`\n---> Movie ID lookup failure report generated: ${path.resolve(reportFilename)}`);
    } catch (error) {
        console.error("Failed to write movie ID lookup failure report:", error);
    }
};