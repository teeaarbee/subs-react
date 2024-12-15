// pages/index.js
import React, { useState } from 'react';
import axios from 'axios';

const Home = () => {
  const [searchWord, setSearchWord] = useState('');
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchWord) {
      alert("Please provide a search word.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post('/api/search', { searchWord });
      setResults(response.data.occurrences);
      setTotalCount(response.data.totalCount);
    } catch (error) {
      console.error("Error searching files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Subtitle Word Finder
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Search through your subtitle files instantly
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <div className="flex gap-3">
            <input
              type="text"   
              value={searchWord}
              onChange={(e) => setSearchWord(e.target.value)}
              placeholder="Enter word to search..."
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg
                       transition-colors duration-200 flex items-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </div>

        {totalCount > 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Found {totalCount} occurrences
          </div>
        )}

        <div className="space-y-4">
          {results.map((result, index) => (
            <div 
              key={index} 
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6
                         hover:shadow-lg transition-shadow duration-200"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {result.fileName.split('/').pop()}
                </h3>
                <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                  {result.timestamp}
                </span>
              </div>
              <p className="text-gray-700 dark:text-gray-300">
                {result.subtitleText}
              </p>
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Path: {result.fileName}
              </div>
            </div>
          ))}
        </div>

        {isLoading && results.length === 0 && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Searching through files...</p>
          </div>
        )}

        {!isLoading && results.length === 0 && searchWord && (
          <div className="text-center py-12 text-gray-600 dark:text-gray-300">
            No results found for &quot;{searchWord}&quot;
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;