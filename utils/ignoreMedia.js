/**
 * Configures a Puppeteer page to intercept and abort requests for common media types
 * (images, stylesheets, fonts, media) to potentially speed up page loading and reduce bandwidth usage
 * during scraping. This function modifies the page's request interception behavior.
 *
 * @async
 * @function ignoreMedia
 * @param {import('puppeteer').Page} page - The Puppeteer Page object to configure.
 * @returns {Promise<void>} A promise that resolves once request interception is set up.
 * Note: The actual request handling is event-driven and continues
 * as long as the page is active and interception is enabled.
 */
export const ignoreMedia = async (page) => {
    // Enable request interception for the page.
    // This must be called before adding request event listeners.
    await page.setRequestInterception(true);

    // Set up an event listener for each new request initiated by the page.
    page.on('request', (req) => {
        // Get the type of the resource being requested (e.g., 'document', 'script', 'image', 'stylesheet').
        const resourceType = req.resourceType();

        // Check if the resource type is one of those we want to block.
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            // Abort the request if it's for a blocked resource type.
            // This prevents the resource from being downloaded.
            req.abort().catch(error => {
                // It's good practice to catch potential errors from abort(),
                // though they are rare for this specific use case.
                // For example, if the request was already handled or the page closed.
                console.warn(`[ignoreMedia] WARN: Failed to abort request for ${req.url()}: ${error.message}`);
            });
        } else {
            // Allow all other requests to continue as normal.
            // This is crucial for the page to load essential content like HTML, scripts, XHR.
            req.continue().catch(error => {
                console.warn(`[ignoreMedia] WARN: Failed to continue request for ${req.url()}: ${error.message}`);
            });
        }
    });
};
