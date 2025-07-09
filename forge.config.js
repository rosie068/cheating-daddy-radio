const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
    packagerConfig: {
        asar: true,
        extraResource: ['./src/assets/SystemAudioDump'],
        name: 'TriFetch',
        icon: 'src/assets/logo',
        // Override the default Electron license with our GPL-3.0 license
        afterCopy: [(buildPath, electronVersion, platform, arch, callback) => {
            const fs = require('fs');
            const path = require('path');
            const projectLicense = path.join(__dirname, 'LICENSE');
            const buildLicense = path.join(buildPath, 'LICENSE');
            
            // Copy the project's GPL-3.0 license to override Electron's license
            fs.copyFileSync(projectLicense, buildLicense);
            callback();
        }],
        // Code signing for macOS - prevents firewall blocking
        // Use `security find-identity -v -p codesigning` to find your identity
        // You need a valid Apple Developer certificate for this to work
        osxSign: {
            identity: process.env.APPLE_SIGNING_IDENTITY || 'Developer ID Application',
            optionsForFile: (filePath) => {
                return {
                    entitlements: 'entitlements.plist',
                    hardenedRuntime: true,
                    'gatekeeper-assess': false,
                    'signature-flags': 'library'
                };
            },
        },
        // App notarization - recommended for distribution
        // Requires Apple ID with app-specific password
        osxNotarize: process.env.APPLE_ID ? {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
        } : undefined,
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'trifetch',
                productName: 'TriFetch',
                shortcutName: 'TriFetch',
                createDesktopShortcut: true,
                createStartMenuShortcut: true,
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin'],
        },
        {
            name: '@electron-forge/maker-deb',
            config: {},
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {},
        },
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};
