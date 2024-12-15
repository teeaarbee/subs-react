// pages/index.js
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import axios from 'axios';
import debounce from 'lodash/debounce';

const Home = () => {
  const [searchWord, setSearchWord] = useState('');
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const RESULTS_PER_PAGE = 20;
  
  // Client-side cache
  const searchCache = useRef(new Map());

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (searchTerm) => {
      if (!searchTerm) return;
      
      // Check client-side cache first
      const cacheKey = searchTerm.toLowerCase();
      if (searchCache.current.has(cacheKey)) {
        const cachedData = searchCache.current.get(cacheKey);
        setResults(cachedData.occurrences);
        setTotalCount(cachedData.totalCount);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      setResults([]);
      setTotalCount(0);
      
      try {
        const response = await axios.post('/api/search', { 
          searchWord: searchTerm 
        }, {
          timeout: 8000 // 8 second timeout
        });
        
        // Cache the results
        searchCache.current.set(cacheKey, response.data);
        setResults(response.data.occurrences);
        setTotalCount(response.data.totalCount);
        
        // Show message if results are partial
        if (response.data.isPartial) {
          setError('Showing first 10 matches. Refine your search for more specific results.');
        }
      } catch (error) {
        console.error("Error searching files:", error);
        if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
          setError('Search timed out. Try a more specific search term.');
        } else {
          setError(error.response?.data?.message || 'An error occurred while searching');
        }
        setResults([]);
        setTotalCount(0);
      } finally {
        setIsLoading(false);
      }
    }, 500),
    [setResults, setTotalCount, setError, setIsLoading]
  );

  // Calculate paginated results
  const paginatedResults = useMemo(() => {
    const start = (page - 1) * RESULTS_PER_PAGE;
    return results.slice(start, start + RESULTS_PER_PAGE);
  }, [results, page]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [searchWord]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchWord(value);
    if (value.length >= 2) { // Only search if 2 or more characters
      debouncedSearch(value);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Besttt Friends Finder
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Search through any episode of friends instantly
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <div className="flex gap-3">
            <input
              type="text"
              value={searchWord}
              onChange={handleInputChange}
              placeholder="Enter word to search..."
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center items-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}

        {totalCount > 0 && !isLoading && (
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Found {totalCount} matches in {results.length} scenes
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {paginatedResults.map((result, index) => (
            <div 
              key={index} 
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow duration-200"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {result.fileName.split('/').pop().replace('.srt', '')}
                </h3>
                <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                  {result.timestamp}
                </span>
              </div>
              <p className="text-gray-700 dark:text-gray-300">
                {result.subtitleText}
              </p>
            </div>
          ))}
        </div>

        {/* Pagination controls */}
        {totalCount > RESULTS_PER_PAGE && (
          <div className="flex justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-4 py-2">
              Page {page} of {Math.ceil(totalCount / RESULTS_PER_PAGE)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(totalCount / RESULTS_PER_PAGE)}
              className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {!isLoading && searchWord && totalCount === 0 && (
          <div className="text-center py-8 text-gray-600 dark:text-gray-300">
            No results found for &quot;{searchWord}&quot;
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;