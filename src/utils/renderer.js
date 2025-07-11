// renderer.js
const { ipcRenderer } = require('electron');

// Create reference to the main app element (will be set when DOM is ready)
let trifetchApp = null;

// Initialize cheddar object early to avoid reference errors
let cheddar = {
    setStatus: (text) => {
        if (trifetchApp) {
            trifetchApp.setStatus(text);
        } else {
            console.log('Status (app not ready):', text);
        }
    }
};

let screenshotInterval = null;
let audioContext = null;
let audioProcessor = null;
let micAudioProcessor = null;
let audioBuffer = [];
let isScreenCaptureInitialized = false;
let isScreenCaptureInitializing = false;
const SAMPLE_RATE = 24000;
const AUDIO_CHUNK_DURATION = 0.1; // seconds
const BUFFER_SIZE = 4096; // Increased buffer size for smoother audio

let currentImageQuality = 'medium'; // Store current image quality for manual screenshots

const isLinux = process.platform === 'linux';
const isMacOS = process.platform === 'darwin';

// Token tracking system for rate limiting
let tokenTracker = {
    tokens: [], // Array of {timestamp, count, type} objects
    audioStartTime: null,

    // Add tokens to the tracker
    addTokens(count, type = 'image') {
        const now = Date.now();
        this.tokens.push({
            timestamp: now,
            count: count,
            type: type,
        });

        // Clean old tokens (older than 1 minute)
        this.cleanOldTokens();
    },

    // Calculate image tokens based on Gemini 2.0 rules
    calculateImageTokens(width, height) {
        // Images ≤384px in both dimensions = 258 tokens
        if (width <= 384 && height <= 384) {
            return 258;
        }

        // Larger images are tiled into 768x768 chunks, each = 258 tokens
        const tilesX = Math.ceil(width / 768);
        const tilesY = Math.ceil(height / 768);
        const totalTiles = tilesX * tilesY;

        return totalTiles * 258;
    },

    // Track audio tokens continuously
    trackAudioTokens() {
        if (!this.audioStartTime) {
            this.audioStartTime = Date.now();
            return;
        }

        const now = Date.now();
        const elapsedSeconds = (now - this.audioStartTime) / 1000;

        // Audio = 32 tokens per second
        const audioTokens = Math.floor(elapsedSeconds * 32);

        if (audioTokens > 0) {
            this.addTokens(audioTokens, 'audio');
            this.audioStartTime = now;
        }
    },

    // Clean tokens older than 1 minute
    cleanOldTokens() {
        const oneMinuteAgo = Date.now() - 60 * 1000;
        this.tokens = this.tokens.filter(token => token.timestamp > oneMinuteAgo);
    },

    // Get total tokens in the last minute
    getTokensInLastMinute() {
        this.cleanOldTokens();
        return this.tokens.reduce((total, token) => total + token.count, 0);
    },

    // Check if we should throttle based on settings
    shouldThrottle() {
        // Get rate limiting settings from localStorage
        const throttleEnabled = localStorage.getItem('throttleTokens') === 'true';
        if (!throttleEnabled) {
            return false;
        }

        const maxTokensPerMin = parseInt(localStorage.getItem('maxTokensPerMin') || '1000000', 10);
        const throttleAtPercent = parseInt(localStorage.getItem('throttleAtPercent') || '75', 10);

        const currentTokens = this.getTokensInLastMinute();
        const throttleThreshold = Math.floor((maxTokensPerMin * throttleAtPercent) / 100);

        console.log(`Token check: ${currentTokens}/${maxTokensPerMin} (throttle at ${throttleThreshold})`);

        return currentTokens >= throttleThreshold;
    },

    // Reset the tracker
    reset() {
        this.tokens = [];
        this.audioStartTime = null;
    },
};

// Track audio tokens every few seconds
setInterval(() => {
    tokenTracker.trackAudioTokens();
}, 2000);



function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        // Improved scaling to prevent clipping
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function initializeGemini(profile = 'interview', language = 'en-US') {
    console.log('🔵 initializeGemini called from renderer with:', { profile, language });
    const apiKey = localStorage.getItem('apiKey')?.trim();
    if (apiKey) {
        console.log('🔑 API key found, calling initialize-gemini IPC...');
        const success = await ipcRenderer.invoke('initialize-gemini', apiKey, localStorage.getItem('customPrompt') || '', profile, language);
        console.log('🔵 initialize-gemini IPC returned:', success);
        if (success) {
            cheddar.setStatus('Live');
        } else {
            cheddar.setStatus('error');
        }
    } else {
        console.log('❌ No API key found in localStorage');
    }
}

// Listen for status updates
ipcRenderer.on('update-status', (event, status) => {
    console.log('Status update:', status);
                    cheddar.setStatus(status);
});

    // Listen for responses - REMOVED: This is handled in TriFetchApp.js to avoid duplicates
// ipcRenderer.on('update-response', (event, response) => {
//     console.log('Gemini response:', response);
//     cheddar.e().setResponse(response);
//     // You can add UI elements to display the response if needed
// });

async function startCapture(screenshotIntervalSeconds = 5, imageQuality = 'medium') {
    console.log('Starting direct screenshot capture...');
    
    // Prevent multiple simultaneous initialization attempts
    if (isScreenCaptureInitializing) {
        console.log('Screen capture initialization already in progress');
        return;
    }
    
    if (isScreenCaptureInitialized) {
        console.log('Screen capture already initialized');
        return;
    }
    
    // Reset any existing capture state
    stopCapture();
    
    isScreenCaptureInitializing = true;

    // Store the image quality for manual screenshots
    currentImageQuality = imageQuality;

    // Reset token tracker when starting new capture session
    tokenTracker.reset();
    console.log('🎯 Token tracker reset for new capture session');

    try {
        console.log('Starting screen capture using Electron desktopCapturer...');

        // First test basic IPC communication
        console.log('🧪 Testing basic IPC communication...');
        try {
            const testResult = await ipcRenderer.invoke('test-ipc');
            console.log('✅ Test IPC result:', testResult);
        } catch (testError) {
            console.error('❌ Test IPC failed:', testError);
            throw new Error('Basic IPC communication failed: ' + testError.message);
        }

        // Get available screen sources from main process
        console.log('🔄 Calling IPC: get-screen-sources...');
        const sourcesResult = await ipcRenderer.invoke('get-screen-sources');
        console.log('📨 IPC response received:', sourcesResult);
        
        if (!sourcesResult.success) {
            throw new Error('Failed to get screen sources: ' + sourcesResult.error);
        }

        if (sourcesResult.sources.length === 0) {
            throw new Error('No screen sources available');
        }

        console.log(`Found ${sourcesResult.sources.length} available sources`);

        // Find the best screen source (prefer main screen)
        let selectedSource = null;
        
        // Filter to ONLY screen sources - NO windows, cameras, or other sources
        const screenSources = sourcesResult.sources.filter(source => {
            const id = source.id.toLowerCase();
            const name = source.name.toLowerCase();
            
            // MUST be a screen source with screen: prefix
            const isValidScreenId = id.startsWith('screen:');
            
            // MUST contain screen or display in name
            const hasScreenInName = name.includes('screen') || name.includes('display') || name.includes('entire');
            
            // ABSOLUTELY NO camera/webcam sources
            const isNotCamera = !name.includes('camera') && 
                              !name.includes('webcam') && 
                              !name.includes('facetime') &&
                              !name.includes('cam') &&
                              !id.includes('camera') &&
                              !id.includes('webcam');
            
            // ABSOLUTELY NO window sources (only full screen)
            const isNotWindow = !id.startsWith('window:');
            
            return isValidScreenId && hasScreenInName && isNotCamera && isNotWindow;
        });
        
        if (screenSources.length === 0) {
            throw new Error('No valid screen display sources found. Only camera or window sources available.');
        }
        
        console.log(`Found ${screenSources.length} valid screen sources`);
        
        // Look for main screen first from filtered sources
        selectedSource = screenSources.find(source => {
            const name = source.name.toLowerCase();
            return name.includes('screen 1') ||
                   name.includes('main') ||
                   name.includes('primary') ||
                   name.includes('display 1');
        });
        
        // If no main screen found, use the first screen source
        if (!selectedSource) {
            selectedSource = screenSources[0];
        }

        console.log(`Selected screen source: ${selectedSource.name}`);

        // No video streaming needed - just verify screen sources are available for direct screenshots
        console.log('Screen source verified for direct screenshots');

        // Test direct screenshot capability
        try {
            const testScreenshot = await ipcRenderer.invoke('take-direct-screenshot', {
                sourceId: selectedSource.id
            });
            
            if (!testScreenshot.success) {
                throw new Error('Direct screenshot test failed: ' + testScreenshot.error);
            }
            
            console.log('✅ Direct screenshot capability verified');
        } catch (testError) {
            console.error('❌ Direct screenshot test failed:', testError);
            throw new Error('Direct screenshot capability test failed: ' + testError.message);
        }

        // Manual mode only - no automatic screenshots
        console.log('Manual mode enabled - screenshots captured on demand via Generate Report button');
        isScreenCaptureInitialized = true;
        isScreenCaptureInitializing = false;
        console.log('✅ Direct screenshot capture initialization completed');
        
    } catch (err) {
        console.error('❌ Error starting capture:', err);
        console.error('❌ Error details:', {
            name: err.name,
            message: err.message,
            stack: err.stack
        });
        isScreenCaptureInitialized = false;
        isScreenCaptureInitializing = false;
        mediaStream = null;
        cheddar.setStatus('error');
        
        // Re-throw the error so caller knows it failed
        throw err;
    }
}

function setupLinuxMicProcessing(micStream) {
    // Setup microphone audio processing for Linux
    const micAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const micSource = micAudioContext.createMediaStreamSource(micStream);
    const micProcessor = micAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    micProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioBuffer.push(...inputData);

        // Process audio in chunks
        while (audioBuffer.length >= samplesPerChunk) {
            const chunk = audioBuffer.splice(0, samplesPerChunk);
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);

            await ipcRenderer.invoke('send-audio-content', {
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            });
        }
    };

    micSource.connect(micProcessor);
    micProcessor.connect(micAudioContext.destination);

    // Store processor reference for cleanup
    audioProcessor = micProcessor;
}

function setupWindowsLoopbackProcessing() {
    // Setup audio processing for Windows loopback audio only
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);
    audioProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    audioProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioBuffer.push(...inputData);

        // Process audio in chunks
        while (audioBuffer.length >= samplesPerChunk) {
            const chunk = audioBuffer.splice(0, samplesPerChunk);
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);

            await ipcRenderer.invoke('send-audio-content', {
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            });
        }
    };

    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
}

async function captureScreenshot(imageQuality = 'medium', isManual = false) {
    console.log(`Capturing ${isManual ? 'manual' : 'automated'} screenshot...`);
    
    // Check rate limiting for automated screenshots only
    if (!isManual && tokenTracker.shouldThrottle()) {
        console.log('Screenshot skipped due to rate limiting');
        return;
    }

    try {
        
        // Get available screen sources from main process
        const sourcesResult = await ipcRenderer.invoke('get-screen-sources');
        
        if (!sourcesResult.success) {
            throw new Error('Failed to get screen sources: ' + sourcesResult.error);
        }

        if (sourcesResult.sources.length === 0) {
            throw new Error('No screen sources available');
        }

        // Filter to ONLY screen sources - NO windows, cameras, or other sources
        const screenSources = sourcesResult.sources.filter(source => {
            const id = source.id.toLowerCase();
            const name = source.name.toLowerCase();
            
            // MUST be a screen source with screen: prefix
            const isValidScreenId = id.startsWith('screen:');
            
            // MUST contain screen or display in name
            const hasScreenInName = name.includes('screen') || name.includes('display') || name.includes('entire');
            
            // ABSOLUTELY NO camera/webcam sources
            const isNotCamera = !name.includes('camera') && 
                              !name.includes('webcam') && 
                              !name.includes('facetime') &&
                              !name.includes('cam') &&
                              !id.includes('camera') &&
                              !id.includes('webcam');
            
            // ABSOLUTELY NO window sources (only full screen)
            const isNotWindow = !id.startsWith('window:');
            
            return isValidScreenId && hasScreenInName && isNotCamera && isNotWindow;
        });
        
        if (screenSources.length === 0) {
            throw new Error('No valid screen display sources found');
        }
        
        // Use the first screen source
        const selectedSource = screenSources[0];
        console.log(`Using screen source: ${selectedSource.name}`);
        
        // Create a temporary canvas for direct screenshot
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Set canvas dimensions (standard screen size)
        canvas.width = 1920;
        canvas.height = 1080;
        
        // Use desktopCapturer to get a direct screenshot
        const screenshotResult = await ipcRenderer.invoke('take-direct-screenshot', {
            sourceId: selectedSource.id
        });
        
        if (!screenshotResult.success) {
            throw new Error('Failed to take direct screenshot: ' + screenshotResult.error);
        }
        
        // Convert the screenshot data to canvas
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                context.drawImage(img, 0, 0);
                resolve();
            };
            img.onerror = reject;
            img.src = `data:image/jpeg;base64,${screenshotResult.data}`;
        });
        
        console.log('Screenshot captured:', `${canvas.width}x${canvas.height}`);

        let qualityValue;
        switch (imageQuality) {
            case 'high':
                qualityValue = 0.9;
                break;
            case 'medium':
                qualityValue = 0.7;
                break;
            case 'low':
                qualityValue = 0.5;
                break;
            default:
                qualityValue = 0.7; // Default to medium
        }

        canvas.toBlob(
            async blob => {
                if (!blob) {
                    console.error('Failed to create blob from canvas');
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64data = reader.result.split(',')[1];

                    // Validate base64 data
                    if (!base64data || base64data.length < 100) {
                        console.error('Invalid base64 data generated');
                        return;
                    }

                    // Enhanced debugging logs
                    console.log('🔍 Screenshot capture details:', {
                        dataLength: base64data.length,
                        canvasSize: `${canvas.width}x${canvas.height}`,
                        isManual: isManual,
                        blobSize: blob.size,
                        qualityValue: qualityValue,
                        timestamp: new Date().toISOString()
                    });

                    // Save screenshot locally for verification
                    try {
                        const saveResult = await ipcRenderer.invoke('save-screenshot-locally', {
                            data: base64data,
                            filename: `screenshot_${Date.now()}.jpg`
                        });
                        
                        if (saveResult.success) {
                            console.log('💾 Screenshot saved locally:', saveResult.path);
                        } else {
                            console.warn('⚠️ Failed to save screenshot locally:', saveResult.error);
                        }
                    } catch (saveError) {
                        console.warn('⚠️ Error saving screenshot locally:', saveError);
                    }

                    console.log('📤 Sending image to AI...', {
                        dataLength: base64data.length,
                        canvasSize: `${canvas.width}x${canvas.height}`,
                        isManual: isManual
                    });
                    
                    const result = await ipcRenderer.invoke('send-image-content', {
                        data: base64data,
                        metadata: {
                            width: canvas.width,
                            height: canvas.height,
                            quality: qualityValue,
                            blobSize: blob.size,
                            isManual: isManual,
                            timestamp: new Date().toISOString()
                        }
                    });

                    if (result.success) {
                        // Track image tokens after successful send
                        const imageTokens = tokenTracker.calculateImageTokens(canvas.width, canvas.height);
                        tokenTracker.addTokens(imageTokens, 'image');
                        console.log(`📊 Image sent successfully - ${imageTokens} tokens used (${canvas.width}x${canvas.height})`);
                        console.log('✅ AI response received for image');
                    } else {
                        console.error('❌ Failed to send image:', result.error);
                    }
                };
                reader.readAsDataURL(blob);
            },
            'image/jpeg',
            qualityValue
        );
        
    } catch (error) {
        console.error('❌ Error capturing direct screenshot:', error);
        throw error;
    }
}

async function captureManualScreenshot(imageQuality = null) {
    console.log('Manual screenshot triggered');
    
    const quality = imageQuality || currentImageQuality;
    
    // Only capture screenshot, don't send automatic text message
    await captureScreenshot(quality, true); // Pass true for isManual
    
    // Wait a moment for the screenshot to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Send a focused message for medical report generation
    await sendTextMessage(`Please analyze this medical image and generate a comprehensive radiology report. Include clinical findings, anatomical observations, and relevant medical recommendations based on the imaging study presented.`);
}

// Helper function to open screenshots directory
async function openScreenshotsDirectory() {
    try {
        const result = await ipcRenderer.invoke('open-screenshots-directory');
        if (result.success) {
            console.log('📁 Screenshots directory opened:', result.path);
        } else {
            console.error('❌ Failed to open screenshots directory:', result.error);
        }
        return result;
    } catch (error) {
        console.error('❌ Error opening screenshots directory:', error);
        return { success: false, error: error.message };
    }
}

// Helper function to get screenshots directory path
async function getScreenshotsDirectory() {
    try {
        const result = await ipcRenderer.invoke('get-screenshots-directory');
        return result;
    } catch (error) {
        console.error('❌ Error getting screenshots directory:', error);
        return { success: false, error: error.message };
    }
}

// Expose functions to global scope for external access
window.captureManualScreenshot = captureManualScreenshot;
window.openScreenshotsDirectory = openScreenshotsDirectory;
window.getScreenshotsDirectory = getScreenshotsDirectory;

function stopCapture() {
    if (screenshotInterval) {
        clearInterval(screenshotInterval);
        screenshotInterval = null;
    }

    if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    isScreenCaptureInitialized = false;
    isScreenCaptureInitializing = false;
}

function resetScreenCapture() {
    console.log('🔄 Resetting screen capture to fix source selection...');
    stopCapture();
    console.log('✅ Screen capture reset complete - next startCapture will re-select source');
}

// Send text message to Gemini
async function sendTextMessage(text) {
    if (!text || text.trim().length === 0) {
        console.warn('Cannot send empty text message');
        return { success: false, error: 'Empty message' };
    }

    try {
        const result = await ipcRenderer.invoke('send-text-message', text);
        if (result.success) {
            console.log('Text message sent successfully');
        } else {
            console.error('Failed to send text message:', result.error);
        }
        return result;
    } catch (error) {
        console.error('Error sending text message:', error);
        return { success: false, error: error.message };
    }
}

// Conversation storage functions using IndexedDB
let conversationDB = null;

async function initConversationStorage() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ConversationHistory', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            conversationDB = request.result;
            resolve(conversationDB);
        };

        request.onupgradeneeded = event => {
            const db = event.target.result;

            // Create sessions store
            if (!db.objectStoreNames.contains('sessions')) {
                const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
                sessionStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

async function saveConversationSession(sessionId, conversationHistory) {
    if (!conversationDB) {
        await initConversationStorage();
    }

    const transaction = conversationDB.transaction(['sessions'], 'readwrite');
    const store = transaction.objectStore('sessions');

    const sessionData = {
        sessionId: sessionId,
        timestamp: parseInt(sessionId),
        conversationHistory: conversationHistory,
        lastUpdated: Date.now(),
    };

    return new Promise((resolve, reject) => {
        const request = store.put(sessionData);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function getConversationSession(sessionId) {
    if (!conversationDB) {
        await initConversationStorage();
    }

    const transaction = conversationDB.transaction(['sessions'], 'readonly');
    const store = transaction.objectStore('sessions');

    return new Promise((resolve, reject) => {
        const request = store.get(sessionId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function getAllConversationSessions() {
    if (!conversationDB) {
        await initConversationStorage();
    }

    const transaction = conversationDB.transaction(['sessions'], 'readonly');
    const store = transaction.objectStore('sessions');
    const index = store.index('timestamp');

    return new Promise((resolve, reject) => {
        const request = index.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            // Sort by timestamp descending (newest first)
            const sessions = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(sessions);
        };
    });
}

// Listen for conversation data from main process
ipcRenderer.on('save-conversation-turn', async (event, data) => {
    try {
        await saveConversationSession(data.sessionId, data.fullHistory);
        console.log('Conversation session saved:', data.sessionId);
    } catch (error) {
        console.error('Error saving conversation session:', error);
    }
});

// Initialize conversation storage when renderer loads
initConversationStorage().catch(console.error);

// Handle shortcuts based on current view
function handleShortcut(shortcutKey) {
    const currentView = cheddar.getCurrentView();

    if (shortcutKey === 'ctrl+enter' || shortcutKey === 'cmd+enter') {
        if (currentView === 'main') {
            cheddar.element().handleStart();
        } else {
            // Shortcut disabled - use Generate Report button instead
            console.log('Manual screenshot shortcut disabled. Use Generate Report button instead.');
        }
    }
}

// Initialize the full cheddar object when DOM is ready
function initializeCheddar() {
    // Wait for the trifetch-app element to be available
    const app = document.querySelector('trifetch-app');
    if (!app) {
        console.log('trifetch-app element not found yet, retrying...');
        setTimeout(initializeCheddar, 100);
        return;
    }
    
    trifetchApp = app;
    
    // Update the cheddar object with all functions
    Object.assign(cheddar, {
        // Element access
        element: () => trifetchApp,
        e: () => trifetchApp,
        
        // App state functions - access properties directly from the app element
        getCurrentView: () => trifetchApp.currentView,
        getLayoutMode: () => trifetchApp.layoutMode,
        
        // Status and response functions
        setStatus: (text) => trifetchApp.setStatus(text),
        setResponse: (response) => trifetchApp.setResponse(response),
        
        // Core functionality
        initializeGemini,
        startCapture,
        stopCapture,
        resetScreenCapture,
        sendTextMessage,
        handleShortcut,
        captureScreenshot,
        
        // Conversation history functions
        getAllConversationSessions,
        getConversationSession,
        initConversationStorage,
        
        // Screenshot debugging functions
        openScreenshotsDirectory,
        getScreenshotsDirectory,
        
        // Content protection function
        getContentProtection: () => {
            const contentProtection = localStorage.getItem('contentProtection');
            return contentProtection !== null ? contentProtection === 'true' : true;
        },
        
        // Platform detection
        isLinux: isLinux,
        isMacOS: isMacOS,
    });
    
    // Define getter property separately using Object.defineProperty for better control
    Object.defineProperty(cheddar, 'isScreenCaptureInitialized', {
        get: function() {
            console.log('🔍 defineProperty Getter called - isScreenCaptureInitialized variable value:', isScreenCaptureInitialized);
            return isScreenCaptureInitialized;
        },
        enumerable: true,
        configurable: true
    });
    
    console.log('Cheddar object initialized successfully');
    console.log('Cheddar properties:', Object.keys(cheddar));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCheddar);
} else {
    initializeCheddar();
}

// Make it globally available
window.cheddar = cheddar;


// Also expose captureManualScreenshot globally for AssistantView
window.captureManualScreenshot = captureManualScreenshot;
