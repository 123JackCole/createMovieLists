// Adds Titles and Descriptions for each site to be scraped to a TMDB list
export const addListMetadata = ({ccMovies, cc4kMovies, vsMovies, vs4kMovies, mocMovies}) => {
    // metadata constants for tmdb lists
    const ccTitle = 'Criterion Collection Movie List';
    const ccDescription = 'All movies in the Criterion Collection. https://www.criterion.com/';
    const cc4kTitle = 'Criterion Collection 4k Movie List';
    const cc4kDescription = 'All 4k movies in the Criterion Collection. https://www.criterion.com/';
    const vsTitle = 'Vinegar Syndrome Movie List';
    const vsDescription = 'All movies in the Vinegar Syndrome. https://vinegarsyndrome.com/';
    const vs4kTitle = 'Vinegar Syndrome 4k Movie List';
    const vs4kDescription = 'All 4k movies in the Vinegar Syndrome. https://vinegarsyndrome.com/';
    const mocTitle = 'The Masters of Cinema Movie List';
    const mocDescription = 'All movies in the Masters of Cinema. https://eurekavideo.co.uk/masters-of-cinema/';

    const tmdbListData = [];
    
    if (ccMovies?.length) {
        tmdbListData.push({
            'title': ccTitle,
            'description': ccDescription,
            'movieData': ccMovies
        });
    }

    if (cc4kMovies?.length) {
        tmdbListData.push({
            'title': cc4kTitle,
            'description': cc4kDescription,
            'movieData': cc4kMovies
        });
    }

    if (vsMovies?.length) {
        tmdbListData.push({
            'title': vsTitle,
            'description': vsDescription,
            'movieData': vsMovies
        });
    }

    if (vs4kMovies?.length) {
        tmdbListData.push({
            'title': vs4kTitle,
            'description': vs4kDescription,
            'movieData': vs4kMovies
        });
    }

    if (mocMovies?.length) {
        tmdbListData.push({
            'title': mocTitle,
            'description': mocDescription,
            'movieData': mocMovies
        });
    }
    
    return tmdbListData;
}