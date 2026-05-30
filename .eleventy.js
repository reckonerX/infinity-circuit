module.exports = function(eleventyConfig) {
  // Pass assets through to the built site
  eleventyConfig.addPassthroughCopy("src/assets");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes"
    }
  };
};