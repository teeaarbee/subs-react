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
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-8">
          Subtitle Word Finder
        </h1>
        
        <div className="flex gap-2 mb-8">
          <input
            type="text"
            value={searchWord}
            onChange={(e) => setSearchWord(e.target.value)}
            placeholder="Enter search word"
            className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {totalCount > 0 && (
          <div className="text-sm text-gray-600 mb-4">
            Found {totalCount} occurrences
          </div>
        )}

        <div className="space-y-4">
          {results.map((result, index) => (
            <div key={index} className="bg-white p-4 rounded-lg shadow">
              <div className="text-sm text-gray-500 mb-1">
                {result.fileName}
              </div>
              <div className="text-sm font-mono text-gray-600 mb-2">
                {result.timestamp}
              </div>
              <div className="text-gray-900">
                {result.subtitleText}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;