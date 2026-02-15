/**
 * Electron Fuses Configuration
 * Applies security fuses to the Electron binary
 * https://www.electronjs.org/docs/latest/tutorial/fuses
 */
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const builder = require('electron-builder');

async function addElectronFuses(context: any) {
	const {
		appOutDir,
		packager: { appInfo: { productFilename } },
		electronPlatformName,
		arch
	} = context;

	const ext = {
		darwin: '.app',
		win32: '.exe',
		linux: [''],
	}[electronPlatformName];

	const IS_LINUX = electronPlatformName === 'linux';
	const executableName = IS_LINUX
		? productFilename.replace('.', '')
		: productFilename;

	const electronBinaryPath = path.join(appOutDir, `${executableName}${ext}`);

	// Skip temp builds
	if (electronBinaryPath.includes('-temp/')) {
		console.log('Skipping fuses for temp build:', electronBinaryPath);
		return;
	}

	console.log('Applying security fuses to:', electronBinaryPath);

	const fusesConfig = {
		version: FuseVersion.V1,

		// Security fuses - DISABLED to allow debugging
		[FuseV1Options.RunAsNode]: false,
		[FuseV1Options.EnableCookieEncryption]: true,
		[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
		[FuseV1Options.EnableNodeCliInspectArguments]: false,
		[FuseV1Options.OnlyLoadAppFromAsar]: true,

		// ASAR integrity - DISABLED for development, enable in production
		// This validates the app.asar hasn't been tampered with
		[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,

		// V8 snapshot - DISABLED due to ARM64 compatibility issues
		[FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,

		// macOS code signing reset for ARM64
		resetAdHocDarwinSignature: electronPlatformName === 'darwin' &&
			(arch === builder.Arch.arm64 || arch === builder.Arch.universal),
	};

	try {
		await flipFuses(electronBinaryPath, fusesConfig);
		console.log('Successfully applied security fuses');

		// Log fuse status
		console.log('Fuse configuration:');
		console.log('  - RunAsNode: DISABLED (prevents NODE_ENV manipulation)');
		console.log('  - EnableCookieEncryption: ENABLED');
		console.log('  - EnableNodeOptionsEnvironmentVariable: DISABLED');
		console.log('  - EnableNodeCliInspectArguments: DISABLED');
		console.log('  - OnlyLoadAppFromAsar: ENABLED');
		console.log('  - EnableEmbeddedAsarIntegrityValidation: DISABLED (development)');
	} catch (error) {
		console.error('Failed to apply fuses:', error);
		// Don't fail the build on fuse errors
		console.warn('Continuing without fuse modifications');
	}
}

module.exports = async (context: any) => {
	await addElectronFuses(context);
};
