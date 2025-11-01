console.log('Testing electron import...');

try {
  const electron = require('electron');
  console.log('Electron type:', typeof electron);
  console.log('Electron keys:', Object.keys(electron));
  
  if (electron.app) {
    console.log('App available:', typeof electron.app);
  } else {
    console.log('App not available');
  }
} catch (error) {
  console.error('Error requiring electron:', error);
}