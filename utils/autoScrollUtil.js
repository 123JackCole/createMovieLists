/**
 * Asynchronously scrolls a Puppeteer page to the bottom, attempting to load all dynamically
 * loaded content (e.g., "infinite scroll" pages).
 *
 * The function operates by repeatedly scrolling to the current bottom of the page,
 * waiting for a specified delay to allow new content to load, and then checking if
 * the page height has changed. Scrolling stops when the page height remains stable
 * for a certain number of checks, a maximum number of scroll attempts is reached,
 * or an overall timeout within the browser context is exceeded.
 *
 * This entire scrolling logic is executed within the browser's context via `page.evaluate()`.
 *
 * @async
 * @function autoScroll
 * @param {import('puppeteer').Page} page - The Puppeteer Page object to scroll.
 * @param {object} [options={}] - Optional configuration for the scrolling behavior.
 * @param {number} [options.scrollDelay=1000] - Time in milliseconds to wait after each scroll
 * for new content to potentially load before checking height.
 * @param {number} [options.stabilityChecks=3] - The number of consecutive times the scrollHeight
 * must remain unchanged to consider the page fully scrolled.
 * @param {number} [options.maxScrolls=50] - The maximum number of scroll attempts to make. This acts as
 * a safeguard against infinite loops on pages that continuously load
 * content or where the stability check might not trigger.
 * @param {number} [options.initialScrolls=1] - The number of quick, initial scrolls to perform at the
 * very beginning. This can help "kickstart" lazy-loading
 * mechanisms on some pages.
 * @returns {Promise<void>} A promise that resolves when the scrolling process is considered complete
 * (either stable, max scrolls reached, or timeout). It rejects if a
 * critical error occurs during the `page.evaluate` call itself.
 * @throws {Error} If a critical error occurs during the `page.evaluate()` call from the Node.js side.
 */
export const autoScroll = async (page, options = {}) => {
    // Destructure options with default values.
    // These defaults can be tuned based on typical website behavior.
    const {
        scrollDelay = 1000,      // Default: 1 second wait after each scroll.
        stabilityChecks = 3,    // Default: Page height must be stable for 3 checks.
        maxScrolls = 50,        // Default: Max 50 scroll attempts.
        initialScrolls = 1      // Default: 1 initial quick scroll.
    } = options;

    try {
        // Execute the scrolling logic within the browser's context.
        // All parameters (scrollDelay, etc.) are passed into this browser-side function.
        await page.evaluate(
            async (pScrollDelay, pStabilityChecks, pMaxScrolls, pInitialScrolls) => {
                // This function runs in the browser, not in Node.js.
                // It uses a Promise to manage the asynchronous scrolling loop.
                await new Promise((resolve, reject) => {
                    let lastHeight = 0;           // Stores the scrollHeight from the previous check.
                    let scrollsAttempted = 0;     // Counter for scroll attempts.
                    let stableCount = 0;          // Counter for consecutive stable height checks.
                    let totalTimeElapsedInEvaluate = 0; // Tracks time to prevent getting stuck indefinitely.
                    
                    // Calculate a generous overall timeout for the browser-side logic.
                    // This is a safeguard within page.evaluate itself.
                    const browserContextOverallTimeout = pMaxScrolls * (pScrollDelay + 500); // Add a buffer per scroll.

                    // Recursive function to perform a scroll attempt and check for stability.
                    const attemptScroll = () => {
                        // Check if the browser-side logic has been running too long.
                        if (totalTimeElapsedInEvaluate > browserContextOverallTimeout) {
                            console.warn('[AutoScroll Browser] WARN: Overall timeout reached within page.evaluate.');
                            resolve(); // Resolve the promise to finish.
                            return;
                        }

                        const currentHeight = document.body.scrollHeight;
                        window.scrollTo(0, currentHeight); // Scroll to the current bottom of the page.
                        scrollsAttempted++;

                        // Wait for `pScrollDelay` milliseconds to allow new content to load.
                        setTimeout(() => {
                            totalTimeElapsedInEvaluate += pScrollDelay; // Increment time tracker.
                            const newHeight = document.body.scrollHeight;

                            if (newHeight === lastHeight) {
                                // Page height hasn't changed, increment stability counter.
                                stableCount++;
                                if (stableCount >= pStabilityChecks) {
                                    // Page height has been stable for the required number of checks.
                                    console.log(`[AutoScroll Browser] INFO: Page height stable at ${newHeight}px after ${scrollsAttempted} scrolls.`);
                                    resolve(); // Scrolling is complete.
                                    return;
                                }
                            } else {
                                // Page height changed, so reset stability counter and update lastHeight.
                                stableCount = 0;
                                lastHeight = newHeight;
                            }

                            // Check if maximum scroll attempts have been reached.
                            if (scrollsAttempted >= pMaxScrolls) {
                                console.warn(`[AutoScroll Browser] WARN: Reached max scrolls (${pMaxScrolls}). Assuming end of page at ${newHeight}px.`);
                                resolve(); // Stop scrolling.
                                return;
                            }

                            // If not done, schedule the next scroll attempt.
                            attemptScroll();
                        }, pScrollDelay);
                    };

                    // Perform initial quick scrolls to trigger lazy loading further down.
                    (async () => {
                        for (let i = 0; i < pInitialScrolls; i++) {
                            window.scrollTo(0, document.body.scrollHeight);
                            // Brief pause for the DOM to react to the initial scrolls.
                            await new Promise(r => setTimeout(r, 100)); 
                        }
                        // Set the initial height after these quick scrolls.
                        lastHeight = document.body.scrollHeight;
                        // Start the main recursive scrolling loop.
                        attemptScroll();
                    })();
                });
            },
            // Pass Node.js variables as arguments to the page.evaluate function.
            scrollDelay,
            stabilityChecks,
            maxScrolls,
            initialScrolls
        );
    } catch (error) {
        // This catch block handles errors from the `page.evaluate` call itself
        // (e.g., if the page closes unexpectedly, context is destroyed, or an error is thrown from within the promise in evaluate).
        console.error(`[AutoScrollUtil] ERROR: Error during page.evaluate for auto-scrolling: ${error.message}`, error.stack || '');
        throw new Error(`Failed to auto-scroll: ${error.message}`); // Re-throw to be handled by the caller.
    }
};
