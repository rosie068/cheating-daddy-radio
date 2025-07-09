# TriFetch Installation Guide for macOS

## Opening TriFetch for the First Time

When you first try to open TriFetch, macOS might show a security warning because the app is not signed with an Apple Developer certificate. This is normal and the app is safe to use.

## How to Open TriFetch

### Method 1: Right-Click to Open (Recommended)
1. **Download** the TriFetch DMG file
2. **Open the DMG** by double-clicking it
3. **Drag TriFetch** to your Applications folder
4. **Navigate to Applications** folder in Finder
5. **Right-click** on TriFetch.app
6. **Select "Open"** from the context menu
7. **Click "Open"** in the dialog that appears

### Method 2: Using System Preferences
If the right-click method doesn't work:

1. **Try to open TriFetch** normally (it will show a warning)
2. **Go to System Preferences** → **Security & Privacy**
3. **Click "General"** tab
4. **Look for the message** about TriFetch being blocked
5. **Click "Open Anyway"** next to the message
6. **Confirm** by clicking "Open" in the dialog

### Method 3: Using Terminal (Advanced)
If you're comfortable with Terminal:

```bash
# Navigate to Applications folder
cd /Applications

# Remove the quarantine attribute
sudo xattr -r -d com.apple.quarantine TriFetch.app

# Now you can open the app normally
open TriFetch.app
```

## Why This Happens

- TriFetch is not signed with an Apple Developer certificate
- macOS protects users by warning about unsigned applications
- The app is completely safe - this is just a precaution by Apple
- Once you've opened it the first time, you won't see this warning again

## Troubleshooting

### "App is damaged and can't be opened"
If you see this message:
1. Delete the app from Applications
2. Empty your Trash
3. Re-download the DMG file
4. Try the installation process again

### App won't open after following the steps
1. Make sure you're using the latest version of TriFetch
2. Try restarting your Mac
3. Check that you have sufficient permissions to run applications

### Still having issues?
- Make sure you're running macOS 10.15 (Catalina) or later
- Ensure you have enough disk space for the application
- Check that your macOS security settings allow apps from "App Store and identified developers"

## First Launch Setup

After successfully opening TriFetch:

1. **Grant Permissions**: TriFetch will ask for screen recording permissions
2. **API Key**: You'll need to add your Gemini API key in the main screen
3. **Onboarding**: Follow the onboarding slides to set up the app
4. **Passcode**: Enter your provided passcode to start using the AI assistant

---

**Note**: This security warning is normal for any app that isn't distributed through the Mac App Store. TriFetch is safe to use and the warning is just Apple's way of being cautious about unsigned applications. 