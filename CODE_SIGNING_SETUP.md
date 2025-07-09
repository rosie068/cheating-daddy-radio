# Code Signing Setup for TriFetch

This guide will help you set up code signing for TriFetch to prevent macOS firewall from blocking the app.

## Prerequisites

1. **Apple Developer Account** - You need a paid Apple Developer account ($99/year)
2. **Xcode** - Install from Mac App Store (required for code signing tools)

## Step 1: Get Apple Developer Certificate

### Option A: Using Xcode (Recommended)
1. Open Xcode
2. Go to Xcode → Preferences → Accounts
3. Click "+" and add your Apple ID
4. Select your team and click "Manage Certificates"
5. Click "+" and choose "Developer ID Application"
6. The certificate will be automatically created and installed

### Option B: Using Apple Developer Portal
1. Go to [Apple Developer Portal](https://developer.apple.com/account/)
2. Navigate to Certificates, Identifiers & Profiles
3. Click Certificates → "+" → "Developer ID Application"
4. Follow the instructions to create and download the certificate
5. Double-click the downloaded certificate to install it in Keychain

## Step 2: Verify Certificate Installation

Run this command to check if your certificate is installed:

```bash
security find-identity -v -p codesigning
```

You should see output like:
```
1) A1B2C3D4E5F6... "Developer ID Application: Your Name (TEAM_ID)"
```

## Step 3: Configure Environment Variables

Create a `.env` file in your project root with these variables:

```bash
# Required for code signing
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"

# Optional for notarization (recommended for distribution)
APPLE_ID="your-apple-id@example.com"
APPLE_ID_PASSWORD="your-app-specific-password"
APPLE_TEAM_ID="YOUR_TEAM_ID"
```

### Getting App-Specific Password (for notarization)
1. Go to [Apple ID Account Page](https://appleid.apple.com/)
2. Sign in with your Apple ID
3. Go to Security → App-Specific Passwords
4. Generate a new password labeled "TriFetch Notarization"
5. Use this password (not your regular Apple ID password)

## Step 4: Install Environment Variables

Add these to your shell profile (`~/.zshrc` or `~/.bash_profile`):

```bash
# TriFetch Code Signing
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your-apple-id@example.com"
export APPLE_ID_PASSWORD="your-app-specific-password"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

Then reload your shell:
```bash
source ~/.zshrc
```

## Step 5: Build Signed App

Now you can build the app with code signing:

```bash
npm run make
```

The app will be automatically signed and should not be blocked by macOS firewall.

## Troubleshooting

### "No identity found" Error
- Make sure you have a valid Apple Developer certificate installed
- Check that the certificate name matches your `APPLE_SIGNING_IDENTITY`
- Try using the full certificate name from `security find-identity -v -p codesigning`

### Notarization Takes Too Long
- Notarization can take 5-30 minutes
- You can build without notarization by not setting the `APPLE_ID` environment variable
- Code signing alone is usually sufficient to prevent firewall blocking

### Permission Issues
- Make sure the certificate is installed in the login keychain
- You might need to unlock the keychain: `security unlock-keychain ~/Library/Keychains/login.keychain`

## Alternative: Self-Signed Certificate (Development Only)

If you don't have an Apple Developer account, you can create a self-signed certificate for development:

```bash
# This creates a self-signed certificate (not recommended for distribution)
security create-keypair -a rsa -s 2048 -f ~/Desktop/TriFetch.key
security import ~/Desktop/TriFetch.key -k ~/Library/Keychains/login.keychain
```

However, this won't prevent Gatekeeper warnings and isn't recommended for distribution.

## Building Without Code Signing

If you need to build without code signing temporarily, you can disable it by commenting out the `osxSign` section in `forge.config.js`.

---

**Note**: Code signing is essential for macOS app distribution. Without it, users will see security warnings and the app may be blocked by firewalls and security software. 