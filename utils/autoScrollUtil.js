// Helper function to scroll to the bottom of the page
export const autoScroll = async (page, options = {}) => {
    const {
        scrollDelay = 500,      // Time (ms) to wait after each scroll for new content to load
        stabilityChecks = 3,    // How many consecutive times scrollHeight needs to be stable to confirm the end
        maxScrolls = 50,        // Maximum number of scroll attempts to prevent infinite loops
        initialScrolls = 2      // Number of initial quick scrolls to get things going
    } = options;

    try {
        await page.evaluate(
            async (scrollDelay, stabilityChecks, maxScrolls, initialScrolls) => {
                await new Promise((resolve, reject) => {
                    let lastHeight = 0;
                    let scrolls = 0;
                    let stableCount = 0;
                    let totalTimeWaited = 0;
                    const overallTimeout = maxScrolls * (scrollDelay + 500); // A generous overall timeout

                    const attemptScroll = () => {
                        if (totalTimeWaited > overallTimeout) {
                            console.warn('AutoScroll: Overall timeout reached.');
                            resolve();
                            return;
                        }

                        const currentHeight = document.body.scrollHeight;
                        window.scrollTo(0, currentHeight); // Jump to the current bottom
                        scrolls++;

                        setTimeout(() => {
                            totalTimeWaited += scrollDelay;
                            const newHeight = document.body.scrollHeight;

                            if (newHeight === lastHeight) {
                                stableCount++;
                                if (stableCount >= stabilityChecks) {
                                    console.log(`AutoScroll: Page height stable at ${newHeight}px after ${scrolls} scrolls.`);
                                    resolve();
                                    return;
                                }
                            } else {
                                stableCount = 0; // Reset stability counter if height changed
                                lastHeight = newHeight;
                            }

                            if (scrolls >= maxScrolls) {
                                console.warn(`AutoScroll: Reached max scrolls (${maxScrolls}). Assuming end of page at ${newHeight}px.`);
                                resolve();
                                return;
                            }

                            // Continue scrolling
                            attemptScroll();
                        }, scrollDelay);
                    };

                    // Perform a few initial quick scrolls if specified
                    (async () => {
                        for (let i = 0; i < initialScrolls; i++) {
                            window.scrollTo(0, document.body.scrollHeight);
                            await new Promise(r => setTimeout(r, 100)); // Short delay for very initial loads
                        }
                        lastHeight = document.body.scrollHeight; // Set initial height after initial scrolls
                        attemptScroll(); // Start the main scrolling loop
                    })();
                });
            },
            scrollDelay,
            stabilityChecks,
            maxScrolls,
            initialScrolls
        );
    } catch (error) {
        console.error('Error during auto-scrolling:', error.message);
        // If the error is from page.evaluate (e.g. execution context destroyed),
        // it might be caught here.
        throw new Error(`Failed to auto-scroll: ${error.message}`);
    }
};