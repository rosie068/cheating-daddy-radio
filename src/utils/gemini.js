const { GoogleGenerativeAI } = require('@google/generative-ai');
const { BrowserWindow, ipcMain } = require('electron');
const { getSystemPrompt } = require('./prompts');

// Conversation tracking variables
let currentSessionId = null;
let currentTranscription = '';
let conversationHistory = [];
let isInitializingSession = false;

// Context window tracking variables
let currentContextHistory = []; // Tracks conversation within current context window
let isNewContextWindow = true; // Flag to indicate if we're starting a new context

// Token management constants
const MAX_CHAT_CONTEXT_TOKENS = 3000; // Max tokens for past chat context to balance cost

// Simple token estimation function (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / 4);
}

let messageBuffer = '';

// Reconnection tracking variables
let reconnectionAttempts = 0;
let maxReconnectionAttempts = 3;
let reconnectionDelay = 2000; // 2 seconds between attempts
let lastSessionParams = null;

// Gemini model instance
let geminiModel = null;

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

// Conversation management functions
function initializeNewSession() {
    currentSessionId = Date.now().toString();
    currentTranscription = '';
    conversationHistory = [];
    currentContextHistory = [];
    isNewContextWindow = true;
    console.log('New conversation session started:', currentSessionId);
}

function saveConversationTurn(transcription, aiResponse) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const conversationTurn = {
        timestamp: Date.now(),
        transcription: transcription.trim(),
        ai_response: aiResponse.trim(),
    };

    conversationHistory.push(conversationTurn);
    currentContextHistory.push(conversationTurn);
    console.log('Saved conversation turn:', conversationTurn);

    // Send to renderer to save in IndexedDB
    sendToRenderer('save-conversation-turn', {
        sessionId: currentSessionId,
        turn: conversationTurn,
        fullHistory: conversationHistory,
    });
}

function getCurrentSessionData() {
    return {
        sessionId: currentSessionId,
        history: conversationHistory,
        contextHistory: currentContextHistory,
    };
}

// New function to start a new context window
function startNewContextWindow() {
    currentContextHistory = [];
    isNewContextWindow = true;
    console.log('New context window started');
}

// Function to build conversation context for API calls with token limits
function buildConversationContext(userMessage) {
    if (isNewContextWindow || currentContextHistory.length === 0) {
        // For new context windows or first messages, just send the user message
        return userMessage;
    }
    
    // Find the latest report from the conversation history
    let latestReport = '';
    for (let i = currentContextHistory.length - 1; i >= 0; i--) {
        const response = currentContextHistory[i].ai_response;
        // Check if this response looks like a report (contains standard report sections)
        if (response.includes('CLINICAL HISTORY') || response.includes('TECHNIQUE') || response.includes('FINDINGS') || response.includes('IMPRESSION')) {
            latestReport = response;
            break;
        }
    }
    
    if (!latestReport) {
        // No report found, just send the user message
        return userMessage;
    }
    
    // Build past chat context with token limits
    let pastChatContext = '';
    let currentTokens = 0;
    
    // Add recent chat exchanges (excluding the initial image upload)
    for (let i = currentContextHistory.length - 1; i >= 1; i--) { // Start from 1 to skip initial image upload
        const turn = currentContextHistory[i];
        const userInput = turn.transcription;
        const aiResponse = turn.ai_response;
        
        // Skip if this is a report (already included as latestReport)
        if (aiResponse.includes('CLINICAL HISTORY') || aiResponse.includes('TECHNIQUE') || aiResponse.includes('FINDINGS') || aiResponse.includes('IMPRESSION')) {
            continue;
        }
        
        const chatEntry = `User: ${userInput}\nAI: ${aiResponse}\n\n`;
        const entryTokens = estimateTokens(chatEntry);
        
        if (currentTokens + entryTokens > MAX_CHAT_CONTEXT_TOKENS) {
            break; // Stop adding if we exceed token limit
        }
        
        pastChatContext = chatEntry + pastChatContext; // Prepend to maintain chronological order
        currentTokens += entryTokens;
    }
    
    // Detect if this is a new image analysis request
    const isNewImageAnalysis = userMessage.includes('Please analyze this NEW medical image') || 
                              userMessage.includes('generate a comprehensive radiology report');
    
    // Build the full context
    let fullContext = `PREVIOUS REPORT:
${latestReport}`;
    
    if (pastChatContext.trim()) {
        fullContext += `

PAST CONVERSATION:
${pastChatContext.trim()}`;
    }
    
    if (isNewImageAnalysis) {
        fullContext += `

NEW IMAGE ANALYSIS REQUEST:
${userMessage}

INSTRUCTIONS: A new medical image has been provided. Please analyze this new image and generate a comprehensive radiology report. Use the previous report and conversation history as context for comparison and reference, but focus on analyzing the new image. Generate a complete new report based on the new image findings.

CRITICAL FORMATTING REQUIREMENTS:
1. Use PLAIN TEXT formatting throughout the entire report - NO markdown, NO bold, NO special formatting
2. ALL section headers must use identical plain text formatting: CLINICAL HISTORY:, TECHNIQUE:, FINDINGS:, IMPRESSION:, RECOMMENDATIONS:
3. RECOMMENDATIONS section must use the same plain text formatting as all other sections (no bold, no special styling)
4. Generate a complete new report based on the new image analysis
5. Use simple bullet points with dashes (-) where appropriate`;
    } else {
        fullContext += `

USER REQUEST:
${userMessage}

INSTRUCTIONS: Please provide the complete modified report that incorporates the user's request above. Keep all the content from the current report that wasn't specifically requested to be changed. Consider the past conversation context when relevant. Return ONLY the modified report content, not a conversation or explanation.

CRITICAL FORMATTING REQUIREMENTS:
1. Use PLAIN TEXT formatting throughout the entire report - NO markdown, NO bold, NO special formatting
2. ALL section headers must use identical plain text formatting: CLINICAL HISTORY:, TECHNIQUE:, FINDINGS:, IMPRESSION:, RECOMMENDATIONS:
3. RECOMMENDATIONS section must use the same plain text formatting as all other sections (no bold, no special styling)
4. Maintain the same section structure and order as the current report
5. Use simple bullet points with dashes (-) where appropriate
6. Only change what the user specifically requested while preserving the plain text format`;
    }
    
    console.log(`Context built with ${estimateTokens(fullContext)} estimated tokens (${isNewImageAnalysis ? 'NEW IMAGE' : 'MODIFICATION'})`);
    return fullContext;
}

async function sendReconnectionContext() {
    // Reconnection context not needed for gemini-1.5-flash model
    // Conversation history is maintained separately
    console.log('Reconnection context not required for current model');
}

async function getEnabledTools() {
    const tools = [];

    // Check if Google Search is enabled (default: true)
    const googleSearchEnabled = await getStoredSetting('googleSearchEnabled', 'true');
    console.log('Google Search enabled:', googleSearchEnabled);

    if (googleSearchEnabled === 'true') {
        tools.push({ googleSearch: {} });
        console.log('Added Google Search tool');
    } else {
        console.log('Google Search tool disabled');
    }

    return tools;
}

async function getStoredSetting(key, defaultValue) {
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            // Wait a bit for the renderer to be ready
            await new Promise(resolve => setTimeout(resolve, 100));

            // Try to get setting from renderer process localStorage
            const value = await windows[0].webContents.executeJavaScript(`
                (function() {
                    try {
                        if (typeof localStorage === 'undefined') {
                            console.log('localStorage not available yet for ${key}');
                            return '${defaultValue}';
                        }
                        const stored = localStorage.getItem('${key}');
                        console.log('Retrieved setting ${key}:', stored);
                        return stored || '${defaultValue}';
                    } catch (e) {
                        console.error('Error accessing localStorage for ${key}:', e);
                        return '${defaultValue}';
                    }
                })()
            `);
            return value;
        }
    } catch (error) {
        console.error('Error getting stored setting for', key, ':', error.message);
    }
    console.log('Using default value for', key, ':', defaultValue);
    return defaultValue;
}

async function attemptReconnection() {
    if (!lastSessionParams || reconnectionAttempts >= maxReconnectionAttempts) {
        console.log('Max reconnection attempts reached or no session params stored');
        sendToRenderer('update-status', 'Session closed');
        return false;
    }

    reconnectionAttempts++;
    console.log(`Attempting reconnection ${reconnectionAttempts}/${maxReconnectionAttempts}...`);

    // Wait before attempting reconnection
    await new Promise(resolve => setTimeout(resolve, reconnectionDelay));

    try {
        const session = await initializeGeminiSession(
            lastSessionParams.apiKey,
            lastSessionParams.customPrompt,
            lastSessionParams.profile,
            lastSessionParams.language,
            true // isReconnection flag
        );

        if (session && global.geminiSessionRef) {
            global.geminiSessionRef.current = session;
            reconnectionAttempts = 0; // Reset counter on successful reconnection
            console.log('Gemini session reconnected');
            return true;
        }
    } catch (error) {
        console.error(`Reconnection attempt ${reconnectionAttempts} failed:`, error);
    }

    // If this attempt failed, try again
    if (reconnectionAttempts < maxReconnectionAttempts) {
        return attemptReconnection();
    } else {
        console.log('All reconnection attempts failed');
        sendToRenderer('update-status', 'Session closed');
        return false;
    }
}

async function initializeGeminiSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US', isReconnection = false) {
    console.log('🚀 initializeGeminiSession called with:', { apiKey: apiKey ? '***' : 'null', profile, language, isReconnection });
    
    if (isInitializingSession) {
        console.log('Session initialization already in progress');
        return false;
    }

    isInitializingSession = true;
    sendToRenderer('session-initializing', true);

    // Store session parameters for reconnection (only if not already reconnecting)
    if (!isReconnection) {
        lastSessionParams = {
            apiKey,
            customPrompt,
            profile,
            language,
        };
        reconnectionAttempts = 0; // Reset counter for new session
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        console.error('❌ Invalid API key provided to GoogleGenAI');
        throw new Error('Invalid API key');
    }
    
    console.log('🔑 Creating GoogleGenerativeAI client with API key...');
    const client = new GoogleGenerativeAI(apiKey);

    // Get enabled tools first to determine Google Search status
    const enabledTools = await getEnabledTools();
    const googleSearchEnabled = enabledTools.some(tool => tool.googleSearch);

    const systemPrompt = getSystemPrompt(profile, customPrompt, googleSearchEnabled);

    // Initialize new conversation session (only if not reconnecting)
    if (!isReconnection) {
        initializeNewSession();
    }

    try {
        // Initialize the generative model for gemini-2.0-flash-lite
        geminiModel = client.getGenerativeModel({
            model: 'gemini-2.0-flash-lite',
            systemInstruction: systemPrompt,
            tools: enabledTools.length > 0 ? enabledTools : undefined,
        });

        console.log('✅ Gemini model created successfully');
        isInitializingSession = false;
        sendToRenderer('session-initializing', false);
        sendToRenderer('update-status', 'Session connected');
        
        return geminiModel;
    } catch (error) {
        console.error('Failed to initialize Gemini session:', error);
        isInitializingSession = false;
        sendToRenderer('session-initializing', false);
        sendToRenderer('update-status', 'Error: ' + error.message);
        return null;
    }
}

function setupGeminiIpcHandlers(geminiSessionRef) {
    // Store the geminiSessionRef globally for reconnection access
    global.geminiSessionRef = geminiSessionRef;

    ipcMain.handle('initialize-gemini', async (event, apiKey, customPrompt, profile = 'interview', language = 'en-US') => {
        console.log('🔵 initialize-gemini IPC handler called with:', { apiKey: apiKey ? '***' : 'null', profile, language });
        const session = await initializeGeminiSession(apiKey, customPrompt, profile, language);
        if (session) {
            geminiSessionRef.current = session;
            console.log('✅ Gemini session stored in geminiSessionRef.current');
            return true;
        }
        console.log('❌ Failed to create Gemini session');
        return false;
    });


    ipcMain.handle('send-image-content', async (event, { data, metadata, debug, additionalContext }) => {
        console.log('📸 send-image-content called, geminiSessionRef.current:', geminiSessionRef.current ? 'exists' : 'null');
        if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };

        try {
            if (!data || typeof data !== 'string') {
                console.error('❌ Invalid image data received - data type:', typeof data);
                return { success: false, error: 'Invalid image data' };
            }

            // Enhanced validation and debugging
            console.log('🔍 Image data validation:', {
                dataLength: data.length,
                dataType: typeof data,
                dataStart: data.substring(0, 50) + '...',
                metadata: metadata || 'No metadata provided'
            });

            const buffer = Buffer.from(data, 'base64');

            if (buffer.length < 1000) {
                console.error(`❌ Image buffer too small: ${buffer.length} bytes`);
                return { success: false, error: 'Image buffer too small' };
            }

            // Additional buffer validation
            console.log('📊 Buffer validation:', {
                bufferLength: buffer.length,
                bufferStart: buffer.subarray(0, 10).toString('hex'),
                isValidJPEG: buffer[0] === 0xFF && buffer[1] === 0xD8, // JPEG magic bytes
                metadata: metadata
            });

            // Create the image part for gemini-2.0-flash-lite
            const imagePart = {
                inlineData: {
                    data: data,
                    mimeType: 'image/jpeg'
                }
            };

            console.log('📤 Sending image to Gemini API...', {
                imagePartSize: JSON.stringify(imagePart).length,
                mimeType: imagePart.inlineData.mimeType,
                dataLength: imagePart.inlineData.data.length,
                timestamp: new Date().toISOString()
            });

            // Generate content with the image
            const startTime = Date.now();
            let contentParts = [imagePart];
            
            // Build contextual prompt for image analysis
            let prompt = '';
            
            if (isNewContextWindow || currentContextHistory.length === 0) {
                // First image analysis - use standard prompt
                prompt = `Please analyze this medical image and generate a comprehensive radiology report. Include clinical findings, anatomical observations, and relevant medical recommendations based on the imaging study presented.`;
                
                if (additionalContext && additionalContext.trim()) {
                    prompt += `

Additional context provided by the user: ${additionalContext.trim()}

Please incorporate this additional information into your analysis and report generation.`;
                }
            } else {
                // Subsequent image analysis - include conversation context like text messages
                let contextualPrompt = `Please analyze this NEW medical image and generate a comprehensive radiology report.`;
                
                if (additionalContext && additionalContext.trim()) {
                    contextualPrompt = `${additionalContext.trim()}`;
                }
                
                // Use buildConversationContext to include latest report and past conversation
                prompt = buildConversationContext(contextualPrompt);
                console.log('Including conversation context with image analysis');
            }
            
            if (prompt) {
                const textPart = { text: prompt };
                contentParts.push(textPart);
                console.log('Adding prompt to image analysis:', prompt.substring(0, 200) + '...');
            }
            
            const result = await geminiSessionRef.current.generateContent(contentParts);
            const response = await result.response;
            const text = response.text();
            const endTime = Date.now();
            
            console.log('✅ Gemini API response received:', {
                responseTime: `${endTime - startTime}ms`,
                responseLength: text.length,
                responseStart: text.substring(0, 100) + '...',
                timestamp: new Date().toISOString()
            });

            // Send the response back to the renderer
            sendToRenderer('update-response', text);

            // Only start new context window if this is the very first image analysis
            // Otherwise, preserve existing context to maintain conversation history
            if (isNewContextWindow) {
                startNewContextWindow();
                console.log('Started new context window for first image analysis');
            } else {
                console.log('Preserving existing context window for continued conversation');
            }

            // Save conversation turn with enhanced metadata including image description
            
            // Extract image description from the AI response
            let imageDescription = '';
            const descriptionMatch = text.match(/<!-- IMAGE_DESCRIPTION_START -->(.*?)<!-- IMAGE_DESCRIPTION_END -->/s);
            if (descriptionMatch) {
                imageDescription = descriptionMatch[1].trim();
            }
            
            // Build enhanced conversation context with image description
            let conversationContext = '';
            if (metadata) {
                conversationContext = `Image uploaded (${metadata.width}x${metadata.height}, quality: ${metadata.quality}, manual: ${metadata.isManual})`;
            } else {
                conversationContext = 'Image uploaded';
            }
            
            // Add image description if available
            if (imageDescription) {
                conversationContext += `\nImage Description: ${imageDescription}`;
            }
            
            saveConversationTurn(conversationContext, text);

            // Mark that we're no longer in a new context window after first interaction
            isNewContextWindow = false;

            return { success: true, responseTime: endTime - startTime };
        } catch (error) {
            console.error('❌ Error sending image to Gemini:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-text-message', async (event, text) => {
        if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };

        try {
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                return { success: false, error: 'Invalid text message' };
            }

            console.log('Sending text message:', text);
            
            // Build conversation context for text messages
            const contextualMessage = buildConversationContext(text.trim());
            console.log('Contextual message built:', { 
                originalLength: text.trim().length, 
                contextualLength: contextualMessage.length,
                hasContext: currentContextHistory.length > 0
            });
            
            // Generate content with the contextual text
            const result = await geminiSessionRef.current.generateContent(contextualMessage);
            const response = await result.response;
            const responseText = response.text();
            
            // Mark that we're no longer in a new context window after first text interaction
            isNewContextWindow = false;

            // Send the response back to the renderer
            sendToRenderer('update-response', responseText);

            // Save conversation turn
            saveConversationTurn(text.trim(), responseText);

            return { success: true };
        } catch (error) {
            console.error('Error sending text:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('close-session', async event => {
        try {
            // Clear session params to prevent reconnection when user closes session
            lastSessionParams = null;

            // Cleanup any pending resources
            if (geminiSessionRef.current) {
                geminiSessionRef.current = null;
            }
            geminiModel = null;

            sendToRenderer('update-status', 'Session closed');

            return { success: true };
        } catch (error) {
            console.error('Error closing session:', error);
            return { success: false, error: error.message };
        }
    });

    // Conversation history IPC handlers
    ipcMain.handle('get-current-session', async event => {
        try {
            return { success: true, data: getCurrentSessionData() };
        } catch (error) {
            console.error('Error getting current session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-new-session', async event => {
        try {
            initializeNewSession();
            return { success: true, sessionId: currentSessionId };
        } catch (error) {
            console.error('Error starting new session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-google-search-setting', async (event, enabled) => {
        try {
            console.log('Google Search setting updated to:', enabled);
            // The setting is already saved in localStorage by the renderer
            // This is just for logging/confirmation
            return { success: true };
        } catch (error) {
            console.error('Error updating Google Search setting:', error);
            return { success: false, error: error.message };
        }
    });

    // Context window management
    ipcMain.handle('reset-context-window', async () => {
        try {
            startNewContextWindow();
            console.log('Context window reset via IPC');
            return { success: true };
        } catch (error) {
            console.error('Error resetting context window:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    initializeGeminiSession,
    getEnabledTools,
    getStoredSetting,
    sendToRenderer,
    initializeNewSession,
    saveConversationTurn,
    getCurrentSessionData,
    sendReconnectionContext,
    setupGeminiIpcHandlers,
    attemptReconnection,
    startNewContextWindow,
};
