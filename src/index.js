if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain, dialog, systemPreferences } = require('electron');
const fs = require('fs');
const { createWindow, updateGlobalShortcuts } = require('./utils/window');
const { setupGeminiIpcHandlers, sendToRenderer } = require('./utils/gemini');

const geminiSessionRef = { current: null };
let mainWindow = null;
let appIsReady = false;

function createMainWindow() {
    // Double-check that app is ready before creating window
    if (!appIsReady || !app.isReady()) {
        console.error('❌ Attempted to create window before app is ready');
        return null;
    }

    try {
        console.log('🔧 Creating main window...');
        mainWindow = createWindow(sendToRenderer, geminiSessionRef);
        
        // Ensure dock icon is visible on macOS
        if (process.platform === 'darwin') {
            app.dock.show();
        }
        
        console.log('Main window created successfully');
        return mainWindow;
    } catch (error) {
        console.error('❌ Error creating main window:', error);
        return null;
    }
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // Someone tried to run a second instance, focus our window instead
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        console.log('🚀 App is ready, initializing...');
        appIsReady = true;
        
        // Ensure dock icon is visible on macOS before creating window
        if (process.platform === 'darwin') {
            app.dock.show();
        }
        
        setupGeminiIpcHandlers(geminiSessionRef);
        setupGeneralIpcHandlers();
        createMainWindow();
        
        console.log('App initialization complete');
    }).catch(error => {
        console.error('Error during app initialization:', error);
    });
}

app.on('window-all-closed', () => {
    console.log('All windows closed');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    console.log('App preparing to quit');
});

app.on('activate', () => {
    console.log('App activated');
    
    // Only create window if app is ready and no windows exist
    if (appIsReady && app.isReady() && BrowserWindow.getAllWindows().length === 0) {
        console.log('🔧 Creating window on activation...');
        createMainWindow();
    } else if (!appIsReady || !app.isReady()) {
        console.log('⏳ App not ready yet, activation will be handled after ready event');
    } else {
        console.log('ℹ️ Windows already exist, not creating new window');
    }
});

function setupGeneralIpcHandlers() {
    console.log('🔧 Setting up general IPC handlers...');
    
    ipcMain.handle('quit-application', async event => {
        try {
            app.quit();
            return { success: true };
        } catch (error) {
            console.error('Error quitting application:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (mainWindow) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    ipcMain.handle('update-content-protection', async event => {
        try {
            if (mainWindow) {
                        // Get content protection setting from localStorage via cheddar
        const contentProtection = await mainWindow.webContents.executeJavaScript(
            'cheddar.getContentProtection()'
        );
                mainWindow.setContentProtection(contentProtection);
                console.log('Content protection updated:', contentProtection);
            }
            return { success: true };
        } catch (error) {
            console.error('Error updating content protection:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('save-report', async (event, { filename, content }) => {
        try {
            const { filePath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Report',
                defaultPath: filename,
                filters: [
                    { name: 'Text Files', extensions: ['txt'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (filePath) {
                fs.writeFileSync(filePath, content, 'utf8');
                return { success: true, path: filePath };
            } else {
                return { success: false, error: 'Save cancelled' };
            }
        } catch (error) {
            console.error('Error saving report:', error);
            return { success: false, error: error.message };
        }
    });




    // Test IPC handler to verify communication is working
    ipcMain.handle('test-ipc', async (event) => {
        console.log('🧪 Test IPC handler called successfully!');
        return { success: true, message: 'IPC communication working' };
    });

    // Global permission status - checked once at startup
    let screenRecordingPermissionGranted = false;
    let permissionCheckedAtStartup = false;
    
    // Cache for screen sources to prevent multiple requests
    let screenSourcesCache = null;
    let lastSourcesCheck = 0;
    let isGettingScreenSources = false;
    const SOURCES_CACHE_DURATION = 10000; // 10 seconds cache

    // Check screen recording permission once at startup
    ipcMain.handle('check-screen-recording-permission', async (event) => {
        console.log('🔍 Checking screen recording permission at startup...');
        
        if (permissionCheckedAtStartup) {
            console.log('Permission already checked at startup, status:', screenRecordingPermissionGranted);
            return { success: true, granted: screenRecordingPermissionGranted };
        }
        
        if (process.platform === 'darwin') {
            console.log('🍎 macOS detected - checking screen recording permission...');
            
            const permissionStatus = systemPreferences.getMediaAccessStatus('screen');
            console.log('Current permission status:', permissionStatus);
            
            if (permissionStatus === 'granted') {
                console.log('Screen recording permission already granted');
                screenRecordingPermissionGranted = true;
                permissionCheckedAtStartup = true;
                return { success: true, granted: true };
            } else if (permissionStatus === 'denied') {
                console.log('Screen recording permission denied');
                screenRecordingPermissionGranted = false;
                permissionCheckedAtStartup = true;
                
                const response = await dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: 'Screen Recording Permission Required',
                    message: 'Screen recording permission is required to generate reports.',
                    detail: 'To enable screen recording:\n\n1. Open System Preferences\n2. Go to Security & Privacy\n3. Click Privacy tab\n4. Select Screen Recording from the list\n5. Check the box next to TriFetch\n6. Restart the app',
                    buttons: ['Open System Preferences', 'Cancel'],
                    defaultId: 0,
                    cancelId: 1
                });
                
                if (response.response === 0) {
                    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
                }
                
                return { success: true, granted: false };
            } else {
                console.log('Permission not determined, requesting permission...');
                
                try {
                    // Attempt to register the app with macOS
                    const { desktopCapturer } = require('electron');
                    
                    // Try to trigger permission registration
                    try {
                        await desktopCapturer.getSources({ 
                            types: ['screen'], 
                            thumbnailSize: { width: 150, height: 150 },
                            fetchWindowIcons: false
                        });
                    } catch (registrationError) {
                        console.log('Registration attempt failed:', registrationError.message);
                    }
                    
                    // Wait for system processing
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Check permission status after registration attempt
                    const newStatus = systemPreferences.getMediaAccessStatus('screen');
                    console.log('Permission status after registration:', newStatus);
                    
                    screenRecordingPermissionGranted = (newStatus === 'granted');
                    permissionCheckedAtStartup = true;
                    
                    // Handle different permission states
                    if (newStatus === 'granted') {
                        console.log('Screen recording permission granted');
                    } else if (newStatus === 'denied') {
                        console.log('Permission denied - user must enable in System Preferences');
                    } else {
                        // Show dialog for unclear permission state
                        const response = await dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Screen Recording Setup Required',
                            message: 'TriFetch needs screen recording permission to generate reports.',
                            detail: 'The app may not appear in System Preferences automatically. Try these steps:\n\n1. Open System Preferences\n2. Go to Privacy & Security\n3. Click Screen & System Audio Recording\n4. Look for "TriFetch", "Electron", or "com.trifetch.clinical-assistant"\n5. If not found, restart TriFetch and try again\n6. You may need to move the app to your Applications folder first\n\nAlternatively, try using the app - it may work even without appearing in the list.',
                            buttons: ['Open System Preferences', 'Try Anyway', 'Cancel'],
                            defaultId: 0,
                            cancelId: 2
                        });
                        
                        if (response.response === 0) {
                            await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
                        } else if (response.response === 1) {
                            // User wants to try anyway
                            screenRecordingPermissionGranted = true;
                            console.log('User chose to try anyway - setting permission as granted');
                        }
                    }

                    
                    return { success: true, granted: screenRecordingPermissionGranted };
                    
                } catch (permError) {
                    console.error('Permission request failed:', permError);
                    screenRecordingPermissionGranted = false;
                    permissionCheckedAtStartup = true;
                    return { success: true, granted: false };
                }
            }
        } else {
            // Non-macOS platforms don't need permission
            screenRecordingPermissionGranted = true;
            permissionCheckedAtStartup = true;
            return { success: true, granted: true };
        }
    });

    // Screen capture IPC handlers using desktopCapturer
    ipcMain.handle('get-screen-sources', async (event) => {
        console.log('get-screen-sources called');
        
        // Check if permission was granted at startup
        if (!screenRecordingPermissionGranted) {
            console.log('Screen recording permission not granted');
            
            // Show dialog with options
            const response = await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Screen Recording Permission Required',
                message: 'TriFetch cannot generate reports without screen recording permission.',
                detail: 'Please follow these steps:\n\n1. Move TriFetch to your Applications folder\n2. Restart TriFetch\n3. Grant permission when prompted\n\nIf TriFetch doesn\'t appear in System Preferences:\n• Look for "Electron" or "com.trifetch.clinical-assistant" in the list\n• Try the "Force Registration" option below\n• Restart your Mac if nothing works',
                buttons: ['Open System Preferences', 'Force Registration', 'Cancel'],
                defaultId: 0,
                cancelId: 2
            });
            
            if (response.response === 0) {
                await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
            } else if (response.response === 1) {
                // Try force registration
                console.log('User chose force registration, attempting...');
                
                try {
                    const { desktopCapturer } = require('electron');
                    
                    // Attempt force registration
                    const testSources = await desktopCapturer.getSources({ 
                        types: ['screen', 'window'], 
                        thumbnailSize: { width: 200, height: 200 },
                        fetchWindowIcons: true
                    });
                    
                    console.log('Force registration completed, got', testSources.length, 'sources');
                    
                    // Update permission status
                    const newStatus = systemPreferences.getMediaAccessStatus('screen');
                    console.log('Permission status after force registration:', newStatus);
                    
                    if (newStatus === 'granted') {
                        screenRecordingPermissionGranted = true;
                        console.log('Permission now granted');
                        
                        // Continue with the normal flow
                    } else {
                        console.log('Permission still not granted, but trying anyway...');
                        // Sometimes the sources work even if the permission status isn't updated
                        screenRecordingPermissionGranted = true;
                        
                        // Show success message
                        await dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Registration Attempted',
                            message: 'Force registration completed.',
                            detail: 'The app should now appear in System Preferences > Privacy & Security > Screen Recording. Please enable it there and try again.\n\nIf you don\'t see it, try restarting TriFetch.',
                            buttons: ['OK']
                        });
                        
                        return { success: false, error: 'Force registration completed. Please check System Preferences and try again.' };
                    }
                    
                } catch (forceError) {
                    console.log('Force registration failed:', forceError.message);
                    return { success: false, error: 'Force registration failed. Please restart the app and grant permission.' };
                }
            } else {
                return { success: false, error: 'Screen recording permission not granted. Please restart the app and grant permission.' };
            }
        }

        // Prevent multiple simultaneous calls
        if (isGettingScreenSources) {
            console.log('Another get-screen-sources call is in progress, waiting...');
            while (isGettingScreenSources) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            // Return cached result if available
            if (screenSourcesCache && (Date.now() - lastSourcesCheck) < SOURCES_CACHE_DURATION) {
                console.log('Returning cached screen sources');
                return screenSourcesCache;
            }
        }

        isGettingScreenSources = true;

        try {
            const { desktopCapturer } = require('electron');
            console.log('🔍 Getting screen sources using desktopCapturer...');
            
            // Return cached screen sources if available and recent
            if (screenSourcesCache && (Date.now() - lastSourcesCheck) < SOURCES_CACHE_DURATION) {
                console.log('📋 Returning cached screen sources');
                isGettingScreenSources = false;
                return screenSourcesCache;
            }
            
            console.log('Getting screen sources...');
            
            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('desktopCapturer.getSources() timed out after 10 seconds')), 10000);
            });
            
            const sourcesPromise = desktopCapturer.getSources({ 
                types: ['window', 'screen'],
                thumbnailSize: { width: 150, height: 150 }
            });
            
            const sources = await Promise.race([sourcesPromise, timeoutPromise]);
            
            console.log(`Found ${sources.length} screen sources`);
            
            const result = { 
                success: true, 
                sources: sources.map(source => ({
                    id: source.id,
                    name: source.name,
                    thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null
                }))
            };
            
            // Cache the result
            screenSourcesCache = result;
            lastSourcesCheck = Date.now();
            
            console.log('Screen sources result prepared');
            isGettingScreenSources = false;
            return result;
            
        } catch (error) {
            console.error('❌ Error getting screen sources:', error);
            console.error('Error stack:', error.stack);
            isGettingScreenSources = false;
            return { success: false, error: error.message };
        }
    });

    // Clear screen sources cache (useful for testing)
    ipcMain.handle('clear-screen-sources-cache', async (event) => {
        console.log('🗑️ Clearing screen sources cache');
        screenSourcesCache = null;
        lastSourcesCheck = 0;
        isGettingScreenSources = false;
        return { success: true, message: 'Cache cleared' };
    });

    // Force app registration with macOS permission system (useful if app doesn't appear in System Preferences)
    ipcMain.handle('force-permission-registration', async (event) => {
        console.log('Forcing app registration with macOS permission system...');
        
        try {
            const { desktopCapturer } = require('electron');
            
            // Attempt to access screen recording to trigger system registration
            console.log('Triggering permission registration...');
            const sources = await desktopCapturer.getSources({ 
                types: ['screen'], 
                thumbnailSize: { width: 200, height: 200 },
                fetchWindowIcons: false
            });
            
            console.log('Registration attempt completed, found', sources.length, 'sources');
            
            // Wait for system to process
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const status = systemPreferences.getMediaAccessStatus('screen');
            console.log('Permission status after registration:', status);
            
            if (status === 'granted') {
                return { success: true, message: 'Permission already granted', status };
            } else if (status === 'denied') {
                return { success: true, message: 'App should now appear in System Preferences > Privacy & Security > Screen Recording. Please enable it there.', status };
            } else {
                return { success: true, message: 'Permission dialog should have appeared. App should now be visible in System Preferences.', status };
            }
            
        } catch (error) {
            console.error('Registration failed:', error);
            return { success: false, error: error.message };
        }
    });

    // Direct screenshot IPC handler
    ipcMain.handle('take-direct-screenshot', async (event, { sourceId }) => {
        try {
            const { desktopCapturer } = require('electron');
            
            console.log('📸 Taking direct screenshot for source:', sourceId);
            
            // Get the specific source for screenshot
            const sources = await desktopCapturer.getSources({ 
                types: ['screen', 'window'],
                thumbnailSize: { width: 1920, height: 1080 } // Full resolution thumbnail
            });
            
            console.log('🔍 Available sources for screenshot:', sources.map(s => ({ id: s.id, name: s.name })));
            
            const selectedSource = sources.find(source => source.id === sourceId);
            if (!selectedSource) {
                console.error(`❌ Source with ID ${sourceId} not found`);
                console.error('Available sources:', sources.map(s => s.id));
                throw new Error(`Source with ID ${sourceId} not found`);
            }
            
            console.log('✅ Selected source for screenshot:', {
                id: selectedSource.id,
                name: selectedSource.name,
                thumbnailSize: selectedSource.thumbnail ? `${selectedSource.thumbnail.getSize().width}x${selectedSource.thumbnail.getSize().height}` : 'no thumbnail'
            });
            
            // The thumbnail is already a screenshot at the requested resolution
            const thumbnailDataURL = selectedSource.thumbnail.toDataURL('image/jpeg', 0.9);
            
            // Extract base64 data from data URL
            const base64Data = thumbnailDataURL.split(',')[1];
            
            console.log('📊 Screenshot data generated:', {
                dataLength: base64Data.length,
                dataSize: `${Math.round(base64Data.length / 1024)}KB`,
                sourceName: selectedSource.name,
                timestamp: new Date().toISOString()
            });
            
            return { 
                success: true, 
                data: base64Data,
                source: selectedSource.name,
                metadata: {
                    sourceId: selectedSource.id,
                    sourceName: selectedSource.name,
                    dataLength: base64Data.length,
                    timestamp: new Date().toISOString()
                }
            };
            
        } catch (error) {
            console.error('❌ Error taking direct screenshot:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            return { success: false, error: error.message };
        }
    });
    
    console.log('General IPC handlers setup complete');
}
