/**
 * End-to-End Tests for draw.io Desktop
 * Tests critical user workflows
 */
import { test, expect } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Test timeouts
const APP_LAUNCH_TIMEOUT = 30000;
const ACTION_TIMEOUT = 10000;

test.describe.configure({ mode: 'serial' });

test.describe('Application Launch', () => {
	let electronApp: Awaited<ReturnType<typeof electron.launch>>;
	let window: Awaited<ReturnType<typeof electronApp.firstWindow>>;

	test.beforeAll(async () => {
		electronApp = await electron.launch({
			args: [path.join(__dirname, '../../src/main/electron.js')],
			env: {
				DRAWIO_ENV: 'test',
				NODE_ENV: 'test'
			}
		});

		window = await electronApp.firstWindow();
		await window.waitForLoadState('domcontentloaded');
	});

	test.afterAll(async () => {
		await electronApp.close();
	});

	test('should launch successfully', async () => {
		const title = await window.title();
		expect(title).toContain('draw.io');
	});

	test('should load draw.io interface', async () => {
		// Wait for the main editor to load
		await expect(window.locator('.geEditor')).toBeVisible({ timeout: APP_LAUNCH_TIMEOUT });
	});

	test('should have correct window dimensions', async () => {
		const bounds = await window.evaluate(() => {
			return {
				width: window.innerWidth,
				height: window.innerHeight
			};
		});

		expect(bounds.width).toBeGreaterThan(500);
		expect(bounds.height).toBeGreaterThan(500);
	});

	test('should not have console errors on launch', async () => {
		const errors: string[] = [];

		window.on('console', msg => {
			if (msg.type() === 'error') {
				errors.push(msg.text());
			}
		});

		// Wait a bit for any errors
		await window.waitForTimeout(2000);

		// Filter out expected errors
		const criticalErrors = errors.filter(err =>
			!err.includes('source map') &&
			!err.includes('favicon')
		);

		expect(criticalErrors).toHaveLength(0);
	});
});

test.describe('File Operations', () => {
	let electronApp: Awaited<ReturnType<typeof electron.launch>>;
	let window: Awaited<ReturnType<typeof electronApp.firstWindow>>;
	const testFilePath = path.join(__dirname, 'fixtures', 'test.drawio');

	test.beforeAll(async () => {
		// Create test directory
		const fixturesDir = path.join(__dirname, 'fixtures');
		if (!fs.existsSync(fixturesDir)) {
			fs.mkdirSync(fixturesDir, { recursive: true });
		}

		// Create a test file
		const testContent = `<mxfile version="21.0">
			<diagram name="Page-1">
				<mxGraphModel dx="1422" dy="754" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
					<root>
						<mxCell id="0" />
						<mxCell id="1" parent="0" />
					</root>
				</mxGraphModel>
			</diagram>
		</mxfile>`;
		fs.writeFileSync(testFilePath, testContent);

		electronApp = await electron.launch({
			args: [path.join(__dirname, '../../src/main/electron.js'), testFilePath],
			env: {
				DRAWIO_ENV: 'test',
				NODE_ENV: 'test'
			}
		});

		window = await electronApp.firstWindow();
		await window.waitForLoadState('domcontentloaded');
	});

	test.afterAll(async () => {
		await electronApp.close();

		// Cleanup
		if (fs.existsSync(testFilePath)) {
			fs.unlinkSync(testFilePath);
		}
	});

	test('should open file from command line', async () => {
		// Wait for the editor to load
		await expect(window.locator('.geEditor')).toBeVisible({ timeout: APP_LAUNCH_TIMEOUT });

		// Check if the diagram loaded (no error dialogs)
		const dialogs = await window.locator('.geDialog').count();
		expect(dialogs).toBe(0);
	});
});

test.describe('Security', () => {
	let electronApp: Awaited<ReturnType<typeof electron.launch>>;
	let window: Awaited<ReturnType<typeof electronApp.firstWindow>>;

	test.beforeAll(async () => {
		electronApp = await electron.launch({
			args: [path.join(__dirname, '../../src/main/electron.js')],
			env: {
				DRAWIO_ENV: 'test',
				NODE_ENV: 'test'
			}
		});

		window = await electronApp.firstWindow();
		await window.waitForLoadState('domcontentloaded');
	});

	test.afterAll(async () => {
		await electronApp.close();
	});

	test('should have context isolation enabled', async () => {
		const hasContextIsolation = await window.evaluate(() => {
			// Check if window.electron is defined but Node.js APIs are not
			return typeof window.electron !== 'undefined' &&
				typeof (window as any).require === 'undefined';
		});

		expect(hasContextIsolation).toBe(true);
	});

	test('should not allow navigation to external URLs', async () => {
		// Try to navigate to external URL
		await window.evaluate(() => {
			try {
				window.location.href = 'https://example.com';
			} catch (e) {
				// Expected to fail
			}
		});

		// Wait a bit
		await window.waitForTimeout(1000);

		// Should still be on local file
		const url = window.url();
		expect(url).toMatch(/^file:\/\//);
	});
});
