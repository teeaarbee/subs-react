export function createSearchIndex(text) {
  return text.toLowerCase().split(/\s+/).reduce((acc, word, index) => {
    if (!acc[word]) acc[word] = [];
    acc[word].push(index);
    return acc;
  }, {});
}

export function optimizeSearchTerm(searchTerm) {
  return searchTerm
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
} 