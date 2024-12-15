// pages/index.js
import React, { useState } from 'react';
import axios from 'axios';

const Home = () => {
  const [searchWord, setSearchWord] = useState('');
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  const handleSearch = async () => {
    if (!searchWord) {
      alert("Please provide a search word.");
      return;
    }

    try {
      const response = await axios.post('/api/search', { searchWord });
      setResults(response.data.occurrences);
      setTotalCount(response.data.totalCount);
    } catch (error) {
      console.error("Error searching files:", error);
    }
  };

  return (
    <div>
      <h1>Subtitle Word Finder</h1>
      <input
        type="text"
        value={searchWord}
        onChange={(e) => setSearchWord(e.target.value)}
        placeholder="Enter search word"
      />
      <button onClick={handleSearch}>Search</button>
      <div>Total occurrences: {totalCount}</div>
      <div>
        {results.map((result, index) => (
          <div key={index}>
            <strong>{result.fileName}</strong> - {result.timestamp}: {result.subtitleText}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;