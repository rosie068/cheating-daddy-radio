import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class AssistantView extends LitElement {
    static styles = css`
        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        * {
            font-family: 'Inter', sans-serif;
            cursor: default;
        }

        .response-container {
            height: calc(100% - 60px);
            overflow-y: auto;
            border-radius: 10px;
            font-size: var(--response-font-size, 18px);
            line-height: 1.6;
            background: var(--main-content-background);
            padding: 16px;
            scroll-behavior: smooth;
            user-select: text;
            cursor: text;
        }

        /* Allow text selection for all content within the response container */
        .response-container * {
            user-select: text;
            cursor: text;
        }

        /* Restore default cursor for interactive elements */
        .response-container a {
            cursor: pointer;
        }

        /* Markdown styling */
        .response-container h1,
        .response-container h2,
        .response-container h3,
        .response-container h4,
        .response-container h5,
        .response-container h6 {
            margin: 1.2em 0 0.6em 0;
            color: var(--text-color);
            font-weight: 600;
        }

        .response-container h1 {
            font-size: 1.8em;
        }
        .response-container h2 {
            font-size: 1.5em;
        }
        .response-container h3 {
            font-size: 1.3em;
        }
        .response-container h4 {
            font-size: 1.1em;
        }
        .response-container h5 {
            font-size: 1em;
        }
        .response-container h6 {
            font-size: 0.9em;
        }

        .response-container p {
            margin: 0.8em 0;
            color: var(--text-color);
        }

        .response-container ul,
        .response-container ol {
            margin: 0.8em 0;
            padding-left: 2em;
            color: var(--text-color);
        }

        .response-container li {
            margin: 0.4em 0;
        }

        .response-container blockquote {
            margin: 1em 0;
            padding: 0.5em 1em;
            border-left: 4px solid var(--focus-border-color);
            background: rgba(0, 122, 255, 0.1);
            font-style: italic;
        }

        .response-container code {
            background: rgba(255, 255, 255, 0.1);
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.85em;
        }

        .response-container pre {
            background: var(--input-background);
            border: 1px solid var(--button-border);
            border-radius: 6px;
            padding: 1em;
            overflow-x: auto;
            margin: 1em 0;
        }

        .response-container pre code {
            background: none;
            padding: 0;
            border-radius: 0;
        }

        .response-container a {
            color: var(--link-color);
            text-decoration: none;
        }

        .response-container a:hover {
            text-decoration: underline;
        }

        .response-container strong,
        .response-container b {
            font-weight: 600;
            color: var(--text-color);
        }

        .response-container em,
        .response-container i {
            font-style: italic;
        }

        .response-container hr {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 2em 0;
        }

        .response-container table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }

        .response-container th,
        .response-container td {
            border: 1px solid var(--border-color);
            padding: 0.5em;
            text-align: left;
        }

        .response-container th {
            background: var(--input-background);
            font-weight: 600;
        }

        .response-container::-webkit-scrollbar {
            width: 8px;
        }

        .response-container::-webkit-scrollbar-track {
            background: var(--scrollbar-track);
            border-radius: 4px;
        }

        .response-container::-webkit-scrollbar-thumb {
            background: var(--scrollbar-thumb);
            border-radius: 4px;
        }

        .response-container::-webkit-scrollbar-thumb:hover {
            background: var(--scrollbar-thumb-hover);
        }

        .text-input-container {
            display: flex;
            gap: 10px;
            margin-top: 10px;
            align-items: center;
            flex-wrap: wrap;
        }

        .button-group {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .text-input-container input {
            flex: 1;
            background: var(--input-background);
            color: var(--text-color);
            border: 1px solid var(--button-border);
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 14px;
        }

        .text-input-container input:focus {
            outline: none;
            border-color: var(--focus-border-color);
            box-shadow: 0 0 0 3px var(--focus-box-shadow);
            background: var(--input-focus-background);
        }

        .text-input-container input::placeholder {
            color: var(--placeholder-color);
        }

        .text-input-container button {
            background: transparent;
            color: var(--start-button-background);
            border: none;
            padding: 0;
            border-radius: 100px;
        }

        .text-input-container button:hover {
            background: var(--text-input-button-hover);
        }

        .generate-report-button {
            background: var(--start-button-background);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .generate-report-button:hover {
            background: var(--start-button-background-hover);
        }

        .generate-report-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .export-report-button {
            background: var(--button-background);
            color: var(--text-color);
            border: 1px solid var(--button-border);
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .export-report-button:hover {
            background: var(--hover-background);
        }

        .export-report-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .nav-button {
            background: transparent;
            color: white;
            border: none;
            padding: 4px;
            border-radius: 50%;
            font-size: 12px;
            display: flex;
            align-items: center;
            width: 36px;
            height: 36px;
            justify-content: center;
        }

        .nav-button:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .nav-button:disabled {
            opacity: 0.3;
        }

        .nav-button svg {
            stroke: white !important;
        }

        .response-counter {
            font-size: 12px;
            color: var(--description-color);
            white-space: nowrap;
            min-width: 60px;
            text-align: center;
        }
    `;

    static properties = {
        responses: { type: Array },
        currentResponseIndex: { type: Number },
        selectedProfile: { type: String },
        onSendText: { type: Function },
        _isGeneratingReport: { type: Boolean },
    };

    constructor() {
        super();
        this.responses = [];
        this.currentResponseIndex = -1;
        this.selectedProfile = 'interview';
        this.onSendText = () => {};
        this._isGeneratingReport = false;
    }

    getProfileNames() {
        return {
            interview: 'Patient Reporting',
            // sales: 'Sales Call',
            // meeting: 'Business Meeting',
            // presentation: 'Presentation',
            // negotiation: 'Negotiation',
        };
    }

    getCurrentResponse() {
        const profileNames = this.getProfileNames();
        return this.responses.length > 0 && this.currentResponseIndex >= 0
            ? this.responses[this.currentResponseIndex]
            : `Welcome, Doctor! I am here to help you with your ${profileNames[this.selectedProfile] || 'session'}. Please provide me with any relevant clinical information, and click on Generate Report for me to view the current image and automate a new report for your review. For modification, simply type in the chat box and hit return to make modidifications to the existing report. Once you are happy with the report, you can export it to a text file using Export Report.`;
    }

    renderMarkdown(content) {
        // Check if marked is available
        if (typeof window !== 'undefined' && window.marked) {
            try {
                // Configure marked for better security and formatting
                window.marked.setOptions({
                    breaks: true,
                    gfm: true,
                    sanitize: false, // We trust the AI responses
                });
                const rendered = window.marked.parse(content);
                console.log('Markdown rendered successfully');
                return rendered;
            } catch (error) {
                console.warn('Error parsing markdown:', error);
                return content; // Fallback to plain text
            }
        }
        console.log('Marked not available, using plain text');
        return content; // Fallback if marked is not available
    }

    getResponseCounter() {
        return this.responses.length > 0 ? `${this.currentResponseIndex + 1}/${this.responses.length}` : '';
    }

    navigateToPreviousResponse() {
        if (this.currentResponseIndex > 0) {
            this.currentResponseIndex--;
            this.dispatchEvent(
                new CustomEvent('response-index-changed', {
                    detail: { index: this.currentResponseIndex },
                })
            );
            this.requestUpdate();
        }
    }

    navigateToNextResponse() {
        if (this.currentResponseIndex < this.responses.length - 1) {
            this.currentResponseIndex++;
            this.dispatchEvent(
                new CustomEvent('response-index-changed', {
                    detail: { index: this.currentResponseIndex },
                })
            );
            this.requestUpdate();
        }
    }

    scrollResponseUp() {
        const container = this.shadowRoot.querySelector('.response-container');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3; // Scroll 30% of container height
            container.scrollTop = Math.max(0, container.scrollTop - scrollAmount);
        }
    }

    scrollResponseDown() {
        const container = this.shadowRoot.querySelector('.response-container');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3; // Scroll 30% of container height
            container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + scrollAmount);
        }
    }

    loadFontSize() {
        const fontSize = localStorage.getItem('fontSize');
        if (fontSize !== null) {
            const fontSizeValue = parseInt(fontSize, 10) || 20;
            const root = document.documentElement;
            root.style.setProperty('--response-font-size', `${fontSizeValue}px`);
        }
    }

    connectedCallback() {
        super.connectedCallback();

        // Load and apply font size
        this.loadFontSize();

        // Set up IPC listeners for keyboard shortcuts
        if (window.require) {
            const { ipcRenderer } = window.require('electron');

            this.handlePreviousResponse = () => {
                console.log('Received navigate-previous-response message');
                this.navigateToPreviousResponse();
            };

            this.handleNextResponse = () => {
                console.log('Received navigate-next-response message');
                this.navigateToNextResponse();
            };

            this.handleScrollUp = () => {
                console.log('Received scroll-response-up message');
                this.scrollResponseUp();
            };

            this.handleScrollDown = () => {
                console.log('Received scroll-response-down message');
                this.scrollResponseDown();
            };

            ipcRenderer.on('navigate-previous-response', this.handlePreviousResponse);
            ipcRenderer.on('navigate-next-response', this.handleNextResponse);
            ipcRenderer.on('scroll-response-up', this.handleScrollUp);
            ipcRenderer.on('scroll-response-down', this.handleScrollDown);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();

        // Clean up IPC listeners
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (this.handlePreviousResponse) {
                ipcRenderer.removeListener('navigate-previous-response', this.handlePreviousResponse);
            }
            if (this.handleNextResponse) {
                ipcRenderer.removeListener('navigate-next-response', this.handleNextResponse);
            }
            if (this.handleScrollUp) {
                ipcRenderer.removeListener('scroll-response-up', this.handleScrollUp);
            }
            if (this.handleScrollDown) {
                ipcRenderer.removeListener('scroll-response-down', this.handleScrollDown);
            }
        }
    }

    async handleSendText() {
        const textInput = this.shadowRoot.querySelector('#textInput');
        if (textInput && textInput.value.trim()) {
            const message = textInput.value.trim();
            textInput.value = ''; // Clear input
            
            // Call handleGenerateReport with the text input as context
            // This ensures every API call includes screenshot + user input + previous context
            await this.handleGenerateReportWithContext(message);
        }
    }

    async handleGenerateReport() {
        // Call the main method without additional context from input
        await this.handleGenerateReportWithContext();
    }

    async handleGenerateReportWithContext(userContext = null) {
        // Prevent multiple simultaneous Generate Report calls
        if (this._isGeneratingReport) {
            console.log('Generate Report already in progress, skipping...');
            return;
        }
        
        this._isGeneratingReport = true;
        
        // Initialize screen capture and generate report
        try {
            
            // First, reset screen capture to ensure correct source selection
            console.log('🔄 Forcing screen capture reset to fix source selection...');
            if (window.cheddar.resetScreenCapture) {
                window.cheddar.resetScreenCapture();
            }
            
            // Now initialize screen capture with proper source selection
            console.log('🔍 Initializing screen capture with correct source...');
            
            if (!window.cheddar.isScreenCaptureInitialized) {
                console.log('✅ Condition passed - initializing screen capture...');
                try {
                    console.log('🚀 About to call window.cheddar.startCapture(5, "high")...');
                    const result = await window.cheddar.startCapture(5, 'high');
                    console.log('🎉 startCapture returned:', result);
                    console.log('Screen capture initialized successfully');
                    console.log('🔍 Immediately after startCapture - isScreenCaptureInitialized:', window.cheddar.isScreenCaptureInitialized);
                    
                    // Wait a moment to ensure all initialization is complete
                    await new Promise(resolve => setTimeout(resolve, 100));
                    console.log('🔍 After 100ms delay - isScreenCaptureInitialized:', window.cheddar.isScreenCaptureInitialized);
                } catch (initError) {
                    console.error('Failed to initialize screen capture:', initError);
                    
                    // Show user-friendly error message based on error type
                    if (initError.message.includes('Permission denied') || initError.name === 'NotAllowedError') {
                        console.error('Screen recording permission denied by user');
                        alert('Screen recording permission is required to generate reports. Please allow screen recording in your system settings and try again.');
                    } else if (initError.message.includes('No screen sources')) {
                        console.error('No screen sources available');
                        alert('No screen sources are available for capture. Please check your display settings.');
                    } else {
                        console.error('Screen capture initialization failed:', initError.message);
                        alert('Failed to initialize screen capture: ' + initError.message);
                    }
                    return; // Exit if screen capture can't be initialized
                }
            }
            
            // Verify screen capture is working
            console.log('🔍 About to check isScreenCaptureInitialized...');
            console.log('🔍 window.cheddar.isScreenCaptureInitialized:', window.cheddar.isScreenCaptureInitialized);
            if (!window.cheddar.isScreenCaptureInitialized) {
                console.error('Screen capture is not initialized after startCapture call');
                console.error('Debug info:', {
                    cheddarExists: !!window.cheddar,
                    startCaptureExists: !!window.cheddar?.startCapture,
                    isScreenCaptureInitialized: window.cheddar?.isScreenCaptureInitialized,
                    cheddarKeys: Object.keys(window.cheddar || {})
                });
                alert('Screen capture initialization failed. Check browser console for details.');
                return;
            }
            
            // Use provided context or check for text input in the chat box
            let additionalContext = userContext;
            if (!additionalContext) {
                const textInput = this.shadowRoot.querySelector('#textInput');
                additionalContext = textInput && textInput.value.trim() ? textInput.value.trim() : null;
                
                if (additionalContext) {
                    console.log('Including additional context from chat input:', additionalContext);
                    // Clear the input after capturing it
                    textInput.value = '';
                }
            } else {
                console.log('Using provided user context:', additionalContext);
            }
            
            // Use the existing manual screenshot function
            if (window.captureManualScreenshot) {
                console.log('Capturing screen for report generation...');
                await window.captureManualScreenshot('high', additionalContext);
                console.log('Screen captured and sent to API for analysis');
            } else if (window.cheddar && window.cheddar.captureScreenshot) {
                console.log('Using cheddar.captureScreenshot...');
                await window.cheddar.captureScreenshot('high', true);
                
                // Wait a moment for the screenshot to be processed
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Send text message with additional context if provided
                let prompt = `Please analyze this medical image and generate a comprehensive radiology report. Include clinical findings, anatomical observations, and relevant medical recommendations based on the imaging study presented.`;
                
                if (additionalContext) {
                    prompt = `Please analyze this medical image and generate a comprehensive radiology report. Include clinical findings, anatomical observations, and relevant medical recommendations based on the imaging study presented.

Additional context provided by the user: ${additionalContext}

Please incorporate this additional information into your analysis and report generation.`;
                    console.log('Including additional context in fallback report generation:', additionalContext);
                }
                
                // Send the text message for analysis
                if (window.cheddar && window.cheddar.sendTextMessage) {
                    await window.cheddar.sendTextMessage(prompt);
                }
                
                console.log('Screen captured and sent to API for analysis');
            } else {
                console.warn('Screen capture function not available');
                console.log('Available functions:', {
                    captureManualScreenshot: typeof window.captureManualScreenshot,
                    cheddar: Object.keys(window.cheddar || {})
                });
                alert('Screen capture functions are not available. Please restart the application.');
            }
        } catch (error) {
            console.error('Error generating report:', error);
            
            // Handle different types of errors
            if (error.name === 'NotAllowedError') {
                console.log('Screen recording permission denied by user');
                alert('Screen recording permission is required to generate reports.');
            } else {
                alert('Error generating report: ' + error.message);
            }
        } finally {
            // Always reset the flag when done
            this._isGeneratingReport = false;
        }
    }

    async handleExportReport() {
        const currentResponse = this.getCurrentResponse();
        
        if (!currentResponse || currentResponse.length === 0) {
            console.warn('No content to export');
            return;
        }

        // Create a clean text version by removing HTML tags and hidden image descriptions
        let cleanText = currentResponse.replace(/<[^>]*>/g, '');
        
        // Remove hidden image description markers and content
        cleanText = cleanText.replace(/<!-- IMAGE_DESCRIPTION_START -->.*?<!-- IMAGE_DESCRIPTION_END -->/gs, '').trim();
        
        // Extract only the report content starting from CLINICAL HISTORY
        const clinicalHistoryIndex = cleanText.search(/CLINICAL HISTORY/i);
        if (clinicalHistoryIndex !== -1) {
            cleanText = cleanText.substring(clinicalHistoryIndex);
        }
        
        // Clean up any extra whitespace
        cleanText = cleanText.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
        
        // Generate timestamp for filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `report_${timestamp}.txt`;

        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            try {
                const result = await ipcRenderer.invoke('save-report', {
                    filename: filename,
                    content: cleanText
                });
                
                if (result.success) {
                    console.log('Report exported successfully:', result.path);
                    
                    // Reset context window after export
                    try {
                        await ipcRenderer.invoke('reset-context-window');
                        console.log('Context window reset after export');
                    } catch (contextError) {
                        console.error('Error resetting context window:', contextError);
                    }
                } else {
                    console.error('Failed to export report:', result.error);
                }
            } catch (error) {
                console.error('Error exporting report:', error);
            }
        } else {
            console.warn('Electron IPC not available');
        }
    }

    handleTextKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendText();
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            const container = this.shadowRoot.querySelector('.response-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 0);
    }

    firstUpdated() {
        super.firstUpdated();
        this.updateResponseContent();
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('responses') || changedProperties.has('currentResponseIndex')) {
            this.updateResponseContent();
        }
    }

    updateResponseContent() {
        console.log('updateResponseContent called');
        const container = this.shadowRoot.querySelector('#responseContainer');
        if (container) {
            const currentResponse = this.getCurrentResponse();
            console.log('Current response:', currentResponse);
            const renderedResponse = this.renderMarkdown(currentResponse);
            console.log('Rendered response:', renderedResponse);
            container.innerHTML = renderedResponse;
        } else {
            console.log('Response container not found');
        }
    }

    render() {
        const responseCounter = this.getResponseCounter();

        return html`
            <div class="response-container" id="responseContainer"></div>

            <div class="text-input-container">
                <button class="nav-button" @click=${this.navigateToPreviousResponse} ?disabled=${this.currentResponseIndex <= 0}>
                    <?xml version="1.0" encoding="UTF-8"?><svg
                        width="24px"
                        height="24px"
                        stroke-width="1.7"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        color="#ffffff"
                    >
                        <path d="M15 6L9 12L15 18" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>

                ${this.responses.length > 0 ? html` <span class="response-counter">${responseCounter}</span> ` : ''}

                <input type="text" id="textInput" placeholder="Type a message to the AI..." @keydown=${this.handleTextKeydown} />

                <div class="button-group">
                    <button class="generate-report-button" @click=${this.handleGenerateReport} ?disabled=${this._isGeneratingReport}>
                        ${this._isGeneratingReport ? 'Generating...' : 'Generate Report'}
                    </button>

                    <button class="export-report-button" @click=${this.handleExportReport} ?disabled=${this.responses.length === 0}>
                        Export Report
                    </button>
                </div>

                <button class="nav-button" @click=${this.navigateToNextResponse} ?disabled=${this.currentResponseIndex >= this.responses.length - 1}>
                    <?xml version="1.0" encoding="UTF-8"?><svg
                        width="24px"
                        height="24px"
                        stroke-width="1.7"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        color="#ffffff"
                    >
                        <path d="M9 6L15 12L9 18" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>
        `;
    }
}

customElements.define('assistant-view', AssistantView);
