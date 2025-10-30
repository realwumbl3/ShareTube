// Listen for extension installation/update lifecycle event
chrome.runtime.onInstalled.addListener(() => {
  // Log a basic message for diagnostics
  console.log('NewApp installed.');
});


