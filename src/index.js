if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain, dialog, systemPreferences } = require('electron');
const fs = require('fs');
const path = require('path');
const { createWindow, updateGlobalShortcuts } = require('./utils/window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./utils/gemini');

const geminiSessionRef = { current: null };
let mainWindow = null;

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    return mainWindow;
}

app.whenReady().then(() => {
    createMainWindow();
    setupGeminiIpcHandlers(geminiSessionRef);
    setupGeneralIpcHandlers();
});

app.on('window-all-closed', () => {
    stopMacOSAudioCapture();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopMacOSAudioCapture();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

function setupGeneralIpcHandlers() {
    console.log('🔧 Setting up general IPC handlers...');
    
    ipcMain.handle('quit-application', async event => {
        try {
            stopMacOSAudioCapture();
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

    // Screen capture IPC handlers using desktopCapturer
    ipcMain.handle('get-screen-sources', async (event) => {
        console.log('🎯 get-screen-sources IPC handler called!');
        console.log('📋 Event details:', { 
            senderType: event.sender.constructor.name,
            senderId: event.sender.id 
        });
        try {
            const { desktopCapturer } = require('electron');
            console.log('🔍 Getting screen sources using desktopCapturer...');
            
            // Check screen recording permission on macOS
            if (process.platform === 'darwin') {
                console.log('🍎 macOS detected - checking screen recording permission...');
                
                const permissionStatus = systemPreferences.getMediaAccessStatus('screen');
                console.log('📋 Current permission status:', permissionStatus);
                
                if (permissionStatus === 'denied') {
                    console.log('❌ Screen recording permission denied');
                    const response = await dialog.showMessageBox(mainWindow, {
                        type: 'warning',
                        title: 'Screen Recording Permission Required',
                        message: 'Screen recording permission is required to capture screenshots.',
                        detail: 'To enable screen recording:\n\n1. Open System Preferences\n2. Go to Security & Privacy\n3. Click Privacy tab\n4. Select Screen Recording from the list\n5. Check the box next to TriFetch\n6. Restart the app if needed',
                        buttons: ['Open System Preferences', 'Cancel'],
                        defaultId: 0,
                        cancelId: 1
                    });
                    
                    if (response.response === 0) {
                        // Open System Preferences to Privacy settings
                        await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
                    }
                    
                    return { success: false, error: 'Screen recording permission denied. Please grant permission in System Preferences.' };
                }
                
                if (permissionStatus === 'not-determined') {
                    console.log('❓ Screen recording permission not determined - attempting to request...');
                    
                    // Show info dialog before requesting permission
                    const response = await dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: 'Screen Recording Permission Needed',
                        message: 'TriFetch needs screen recording permission to capture screenshots.',
                        detail: 'You will see a system dialog asking for permission. Please click "Allow" to continue.',
                        buttons: ['Continue', 'Cancel'],
                        defaultId: 0,
                        cancelId: 1
                    });
                    
                    if (response.response === 1) {
                        return { success: false, error: 'Screen recording permission request cancelled.' };
                    }
                    
                    // Try to trigger permission request by calling getSources
                    try {
                        console.log('🔑 Attempting to trigger permission request...');
                        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
                        console.log('✅ Permission request completed');
                        
                        // Check permission status again
                        const newStatus = systemPreferences.getMediaAccessStatus('screen');
                        console.log('📋 New permission status:', newStatus);
                        
                        if (newStatus === 'denied') {
                            return { success: false, error: 'Screen recording permission was denied. Please grant permission in System Preferences and restart the app.' };
                        }
                        
                        if (newStatus === 'not-determined') {
                            return { success: false, error: 'Screen recording permission is still pending. Please grant permission and try again.' };
                        }
                        
                    } catch (permError) {
                        console.error('❌ Permission request failed:', permError);
                        return { success: false, error: 'Failed to request screen recording permission: ' + permError.message };
                    }
                }
                
                if (permissionStatus === 'granted') {
                    console.log('✅ Screen recording permission granted');
                }
            }
            
            console.log('📱 Calling desktopCapturer.getSources()...');
            
            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('desktopCapturer.getSources() timed out after 10 seconds')), 10000);
            });
            
            const sourcesPromise = desktopCapturer.getSources({ 
                types: ['window', 'screen'],
                thumbnailSize: { width: 150, height: 150 }
            });
            
            console.log('⏰ Waiting for screen sources (10 second timeout)...');
            const sources = await Promise.race([sourcesPromise, timeoutPromise]);
            
            console.log(`✅ Found ${sources.length} screen sources`);
            
            // Log each source for debugging
            sources.forEach((source, index) => {
                console.log(`   ${index}: ${source.name} (${source.id})`);
            });
            
            const result = { 
                success: true, 
                sources: sources.map(source => ({
                    id: source.id,
                    name: source.name,
                    thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null
                }))
            };
            
            console.log('🎉 Screen sources result prepared, returning...');
            return result;
            
        } catch (error) {
            console.error('❌ Error getting screen sources:', error);
            console.error('Error stack:', error.stack);
            return { success: false, error: error.message };
        }
    });

    // Direct screenshot IPC handler
    ipcMain.handle('take-direct-screenshot', async (event, { sourceId }) => {
        try {
            const { desktopCapturer } = require('electron');
            
            // Get the specific source for screenshot
            const sources = await desktopCapturer.getSources({ 
                types: ['screen', 'window'],
                thumbnailSize: { width: 1920, height: 1080 } // Full resolution thumbnail
            });
            
            const selectedSource = sources.find(source => source.id === sourceId);
            if (!selectedSource) {
                throw new Error(`Source with ID ${sourceId} not found`);
            }
            
            // The thumbnail is already a screenshot at the requested resolution
            const thumbnailDataURL = selectedSource.thumbnail.toDataURL('image/jpeg', 0.9);
            
            // Extract base64 data from data URL
            const base64Data = thumbnailDataURL.split(',')[1];
            
            return { 
                success: true, 
                data: base64Data,
                source: selectedSource.name
            };
            
        } catch (error) {
            console.error('Error taking direct screenshot:', error);
            return { success: false, error: error.message };
        }
    });
    
    console.log('✅ General IPC handlers setup complete');
}
