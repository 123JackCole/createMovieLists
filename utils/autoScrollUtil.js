/**
 * @file A library of scrolling utility functions for Puppeteer.
 */

// =============================================================================
// GENERIC INFINITE SCROLL UTILITY
// =============================================================================

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
 * @param {number} [options.scrollDelay=1000] - Time in milliseconds to wait after each scroll.
 * @param {number} [options.stabilityChecks=3] - The number of consecutive times the scrollHeight
 * must remain unchanged to consider the page fully scrolled.
 * @param {number} [options.maxScrolls=50] - The maximum number of scroll attempts to make.
 * @param {number} [options.initialScrolls=1] - The number of quick, initial scrolls to perform.
 * @returns {Promise<void>} A promise that resolves when the scrolling process is complete.
 * @throws {Error} If a critical error occurs during the `page.evaluate()` call.
 */
export const autoScroll = async (page, options = {}) => {
    const {
        scrollDelay = 1000,
        stabilityChecks = 3,
        maxScrolls = 50,
        initialScrolls = 1
    } = options;

    try {
        await page.evaluate(
            async (pScrollDelay, pStabilityChecks, pMaxScrolls, pInitialScrolls) => {
                await new Promise((resolve) => {
                    let lastHeight = 0;
                    let scrollsAttempted = 0;
                    let stableCount = 0;
                    const attemptScroll = () => {
                        const currentHeight = document.body.scrollHeight;
                        window.scrollTo(0, currentHeight);
                        scrollsAttempted++;
                        setTimeout(() => {
                            const newHeight = document.body.scrollHeight;
                            if (newHeight === lastHeight) {
                                stableCount++;
                                if (stableCount >= pStabilityChecks) {
                                    console.log(`[AutoScroll Browser] INFO: Page height stable at ${newHeight}px after ${scrollsAttempted} scrolls.`);
                                    resolve();
                                    return;
                                }
                            } else {
                                stableCount = 0;
                                lastHeight = newHeight;
                            }
                            if (scrollsAttempted >= pMaxScrolls) {
                                console.warn(`[AutoScroll Browser] WARN: Reached max scrolls (${pMaxScrolls}).`);
                                resolve();
                                return;
                            }
                            attemptScroll();
                        }, pScrollDelay);
                    };
                    (async () => {
                        for (let i = 0; i < pInitialScrolls; i++) {
                            window.scrollTo(0, document.body.scrollHeight);
                            await new Promise(r => setTimeout(r, 100));
                        }
                        lastHeight = document.body.scrollHeight;
                        attemptScroll();
                    })();
                });
            },
            scrollDelay,
            stabilityChecks,
            maxScrolls,
            initialScrolls
        );
    } catch (error) {
        console.error(`[AutoScrollUtil] ERROR: Error during page.evaluate for auto-scrolling: ${error.message}`, error.stack || '');
        throw new Error(`Failed to auto-scroll: ${error.message}`);
    }
};


// =============================================================================
// ELEMENT-AWARE SCROLL UTILITY FOR REACT/JS-HEAVY SITES
// =============================================================================

/**
 * Scrolls a page in controlled steps to trigger viewport-based rendering, which is common
 * on modern JavaScript sites (e.g., React virtualized lists).
 *
 * This function is "element-aware." Instead of checking page height, it monitors the count of
 * rendered elements against a total number of expected container elements. It scrolls in small,
 * controlled chunks to ensure components in the viewport have time to render, avoiding timeouts
 * and handling lazy-loading more effectively than a simple scroll-to-bottom approach.
 *
 * @async
 * @function scrollAndRenderReact
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 * @param {object} options - Configuration for the scrolling behavior.
 * @param {string} options.renderedElSelector - The CSS selector for the elements that are dynamically rendered.
 * @param {string} options.totalElSelector - The CSS selector for the container elements that indicate the total number of items.
 * @returns {Promise<number>} A promise that resolves to the final count of rendered elements.
 */
export const scrollAndRenderReact = async (page, options) => {
    const {
        renderedElSelector,
        totalElSelector
    } = options;

    // Enhanced scrolling parameters for better component rendering
    const scrollStep = 200;
    const scrollDelay = 1500;
    const maxScrolls = 300;
    const stabilityChecks = 10;
    const chunkSize = 5;
    
    let totalScrollsAttempted = 0;
    let lastReactCount = 0;
    let stableCount = 0;
    
    let currentState = await page.evaluate((renderedSel, totalSel) => ({
        reactComponents: document.querySelectorAll(renderedSel).length,
        totalContainers: document.querySelectorAll(totalSel).length,
        scrollHeight: document.body.scrollHeight,
        scrollTop: window.pageYOffset
    }), renderedElSelector, totalElSelector);
    
    while (totalScrollsAttempted < maxScrolls) {
        const scrollsInThisChunk = Math.min(chunkSize, maxScrolls - totalScrollsAttempted);
        
        const chunkResult = await page.evaluate(async (p) => {
            let scrollsAttempted = 0;
            let currentScroll = p.currentScrollTop;
            
            while (scrollsAttempted < p.scrollsInThisChunk) {
                const docHeight = document.body.scrollHeight;
                const windowHeight = window.innerHeight;
                const nextScroll = Math.min(currentScroll + p.scrollStep, docHeight - windowHeight);
                
                window.scrollTo({ top: nextScroll, behavior: 'smooth' });
                currentScroll = nextScroll;
                scrollsAttempted++;
                
                await new Promise(resolve => setTimeout(resolve, p.scrollDelay));
                
                if (nextScroll >= docHeight - windowHeight) {
                    break;
                }
            }
            
            return {
                reactComponents: document.querySelectorAll(p.renderedSel).length,
                totalContainers: document.querySelectorAll(p.totalSel).length,
                scrollHeight: document.body.scrollHeight,
                scrollTop: window.pageYOffset,
                scrollsInChunk: scrollsAttempted
            };
        }, { 
            scrollStep, 
            scrollDelay, 
            scrollsInThisChunk, 
            currentScrollTop: currentState.scrollTop, 
            renderedSel: renderedElSelector, 
            totalSel: totalElSelector 
        });
        
        totalScrollsAttempted += chunkResult.scrollsInChunk;
        
        // Check if all components are rendered
        if (chunkResult.reactComponents >= chunkResult.totalContainers) {
            break;
        }
        
        // Enhanced stability checking - only stop if we have reasonable completion rate
        if (chunkResult.reactComponents === lastReactCount) {
            stableCount++;
            if (stableCount >= stabilityChecks) {
                // Only break if we have a reasonable percentage OR we've tried many scrolls
                if (chunkResult.reactComponents >= chunkResult.totalContainers * 0.8 || totalScrollsAttempted >= maxScrolls * 0.8) {
                    break;
                } else {
                    // Reset stability count to keep trying when completion rate is low
                    stableCount = 0;
                }
            }
        } else {
            stableCount = 0;
            lastReactCount = chunkResult.reactComponents;
        }
        
        currentState = chunkResult;
        
        // Check if we've reached the bottom of the page
        const windowHeight = await page.evaluate(() => window.innerHeight);
        if (chunkResult.scrollTop >= chunkResult.scrollHeight - windowHeight) {
            break;
        }
        
        // Wait between scroll chunks to allow for rendering
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Final wait to ensure all components are stable
    await new Promise(resolve => setTimeout(resolve, 3000));
    const finalCount = await page.evaluate((sel) => document.querySelectorAll(sel).length, renderedElSelector);
    
    return finalCount;
}