import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitleForSearch } from './titleSanitizer.js'; // Adjust path if necessary

describe('normalizeTitleForSearch()', () => {
    // Test Suite for Basic Title and Year Handling
    describe('Basic Title and Year', () => {
        test('should return title and year as is if no sanitization needed', () => {
            const result = normalizeTitleForSearch('Clean Movie Title', '2023');
            assert.deepStrictEqual(result, {
                sanitizedTitle: 'Clean Movie Title',
                searchYear: '2023',
                isLikelyCollection: false
            });
        });

        test('should handle null scrapedYear', () => {
            const result = normalizeTitleForSearch('Movie Without Year', null);
            assert.deepStrictEqual(result, {
                sanitizedTitle: 'Movie Without Year',
                searchYear: null,
                isLikelyCollection: false
            });
        });

        test('should handle "N/A" scrapedYear', () => {
            const result = normalizeTitleForSearch('Movie With NA Year', 'N/A');
            assert.deepStrictEqual(result, {
                sanitizedTitle: 'Movie With NA Year',
                searchYear: null,
                isLikelyCollection: false
            });
        });

        test('should return empty string for null rawTitle', () => {
            const result = normalizeTitleForSearch(null, '2023');
            assert.deepStrictEqual(result, {
                sanitizedTitle: '',
                searchYear: null, // searchYear becomes null because title is empty
                isLikelyCollection: false
            });
        });
    });

    // Test Suite for Year Extraction from Title
    describe('Year Extraction from Title', () => {
        test('should extract year from title if scrapedYear is null', () => {
            const result = normalizeTitleForSearch('Movie With Year (2022)', null);
            assert.deepStrictEqual(result, {
                sanitizedTitle: 'Movie With Year',
                searchYear: '2022',
                isLikelyCollection: false
            });
        });

        test('should extract year from title if scrapedYear is "N/A"', () => {
            const result = normalizeTitleForSearch('Another Film (2021)', 'N/A');
            assert.deepStrictEqual(result, {
                sanitizedTitle: 'Another Film',
                searchYear: '2021',
                isLikelyCollection: false
            });
        });

        test('should prefer scrapedYear over year in title if scrapedYear is valid', () => {
            const result = normalizeTitleForSearch('Title (1999)', '2000');
            assert.deepStrictEqual(result, {
                sanitizedTitle: 'Title', // (1999) still removed as it matches pattern
                searchYear: '2000',
                isLikelyCollection: false
            });
        });
        
        test('should remove year from title even if it matches a valid scrapedYear', () => {
            const result = normalizeTitleForSearch('Valid Year Movie (2023)', '2023');
            assert.deepStrictEqual(result, {
                sanitizedTitle: 'Valid Year Movie', // (2023) is removed
                searchYear: '2023',
                isLikelyCollection: false
            });
        });
    });

    // Test Suite for Removing Edition/Format Info
    describe('Edition and Format String Removal', () => {
        test('should remove (Limited Edition)', () => {
            const result = normalizeTitleForSearch('Film (Limited Edition)', '2020');
            assert.strictEqual(result.sanitizedTitle, 'Film');
        });

        test('should remove (4K Ultra HD)', () => {
            const result = normalizeTitleForSearch('Film (4K Ultra HD)', '2020');
            assert.strictEqual(result.sanitizedTitle, 'Film');
        });
        
        test('should remove "4K Ultra HD" when not in parentheses', () => {
            const result = normalizeTitleForSearch('Film Title 4K Ultra HD', '2020');
            assert.strictEqual(result.sanitizedTitle, 'Film Title');
        });

        test('should remove [Hard Case]', () => {
            const result = normalizeTitleForSearch('Film [Hard Case]', '2020');
            assert.strictEqual(result.sanitizedTitle, 'Film');
        });
        
        test('should remove (Blu-ray/DVD Combo)', () => {
            const result = normalizeTitleForSearch('Film (Blu-ray/DVD Combo)', '2020');
            assert.strictEqual(result.sanitizedTitle, 'Film');
        });

        test('should remove multiple format strings', () => {
            const result = normalizeTitleForSearch('Complex Title (Limited Edition) (4K UHD and Blu-ray) [Standard Edition]', '2021');
            assert.strictEqual(result.sanitizedTitle, 'Complex Title');
        });

        test('should remove (aka ...)', () => {
            const result = normalizeTitleForSearch('Original Title (aka Another Title)', '2005');
            assert.strictEqual(result.sanitizedTitle, 'Original Title');
        });
    });

    // Test Suite for Collection Likelihood and Sanitization
    describe('Collection Handling', () => {
        test('should flag "Trilogy" title as likely collection', () => {
            const result = normalizeTitleForSearch('My Awesome Trilogy', '2020');
            assert.strictEqual(result.isLikelyCollection, true);
            assert.strictEqual(result.sanitizedTitle, 'My Awesome'); // "Trilogy" removed by Phase 5
        });

        test('should flag "Eclipse Series 1: Early Films" as likely collection and sanitize prefix', () => {
            const result = normalizeTitleForSearch('Eclipse Series 1: Early Films', 'N/A');
            assert.strictEqual(result.isLikelyCollection, true);
            assert.strictEqual(result.sanitizedTitle, 'Early'); // "Eclipse Series 1:" and " Films" removed
        });
        
        test('should flag "X Films by Y" as likely collection', () => {
            const result = normalizeTitleForSearch('Three Films by Director Name', 'N/A');
            assert.strictEqual(result.isLikelyCollection, true);
            assert.strictEqual(result.sanitizedTitle, 'Director Name'); // "Three Films by " removed by regex
        });

        test('should handle slash-separated titles and flag as likely collection', () => {
            const result = normalizeTitleForSearch('Film A / Film B', '2020');
            assert.strictEqual(result.sanitizedTitle, 'Film A');
            assert.strictEqual(result.isLikelyCollection, true);
        });
    });
    
    // Test Suite for Final Cleanup
    describe('Final Cleanup', () => {
        test('should trim whitespace', () => {
            const result = normalizeTitleForSearch('  Spaced Out Title  ', '2020');
            assert.strictEqual(result.sanitizedTitle, 'Spaced Out Title');
        });

        test('should collapse multiple spaces', () => {
            const result = normalizeTitleForSearch('Title  With   Extra   Spaces', '2020');
            assert.strictEqual(result.sanitizedTitle, 'Title With Extra Spaces');
        });
        
        test('should remove trailing colons or hyphens', () => {
            const result = normalizeTitleForSearch('Title Ending With :', '2020');
            assert.strictEqual(result.sanitizedTitle, 'Title Ending With');
            const result2 = normalizeTitleForSearch('Another Title - ', '2021');
            assert.strictEqual(result2.sanitizedTitle, 'Another Title');
        });

        test('should handle fallback if title becomes empty', () => {
            const result = normalizeTitleForSearch('Trilogy', null); // 'Trilogy' is removed by collectionTermsToRemove
            assert.strictEqual(result.sanitizedTitle, 'Trilogy'); // Falls back to rawTitle.split('/')[0] which is rawTitle
        });
    });

    describe('Specific "Not Found" Report Cases', () => {
        test('should handle "W. C. Fields—Six Short Films"', () => {
            const result = normalizeTitleForSearch('W. C. Fields—Six Short Films', '1933');
            assert.deepStrictEqual(result, {
                sanitizedTitle: 'W. C. Fields—', // Current regex removes ": Six Short Films"
                searchYear: '1933',
                isLikelyCollection: true
            });
        });

        test('should handle "Jimi Plays Monterey & Shake! Otis at Monterey"', () => {
            const result = normalizeTitleForSearch('Jimi Plays Monterey & Shake! Otis at Monterey', '1986');
            assert.deepStrictEqual(result, {
                sanitizedTitle: 'Jimi Plays Monterey & Shake! Otis at Monterey',
                searchYear: '1986',
                isLikelyCollection: true
            });
        });
    });
});
