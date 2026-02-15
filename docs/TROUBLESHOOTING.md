# Troubleshooting Guide

This guide helps diagnose and resolve common issues with draw.io Desktop.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Application Won't Start](#application-wont-start)
- [File Operations](#file-operations)
- [Export Problems](#export-problems)
- [Performance Issues](#performance-issues)
- [Security Warnings](#security-warnings)
- [Data Recovery](#data-recovery)

---

## Installation Issues

### "App can't be opened because it is from an unidentified developer" (macOS)

**Solution:**
1. Right-click on the app and select "Open"
2. Click "Open" in the security dialog
3. Or go to System Preferences > Security & Privacy > General and click "Open Anyway"

### "Windows protected your PC" (Windows)

**Solution:**
1. Click "More info"
2. Click "Run anyway"
3. Note: This warning appears because the app is not signed with an EV certificate

### Installation fails on Linux

**Solution:**
1. Make the AppImage executable:
   ```bash
   chmod +x draw.io-x.x.x.AppImage
   ```
2. Run with `--no-sandbox` flag if using on older systems:
   ```bash
   ./draw.io-x.x.x.AppImage --no-sandbox
   ```

---

## Application Won't Start

### Blank white screen

**Possible Causes:**
1. Corrupted app data
2. Missing drawio submodule
3. Display driver issues

**Solutions:**
1. Clear app data:
   - **Windows:** Delete `%APPDATA%\draw.io\`
   - **macOS:** Delete `~/Library/Application Support/draw.io/`
   - **Linux:** Delete `~/.config/draw.io/`

2. Verify submodule:
   ```bash
   git submodule update --init --recursive
   ```

3. Disable hardware acceleration:
   ```bash
   draw.io --disable-acceleration
   ```

### Crash on startup

**Check logs:**
- **Windows:** `%APPDATA%\draw.io\logs\main.log`
- **macOS:** `~/Library/Logs/draw.io/main.log`
- **Linux:** `~/.config/draw.io/logs/main.log`

**Common fixes:**
1. Update to latest version
2. Run with `--disable-update` flag
3. Check for conflicting software (antivirus, sandboxing tools)

---

## File Operations

### "File is too large" error

**Cause:** File exceeds 100MB limit

**Solutions:**
1. Split large diagrams into multiple files
2. Reduce embedded images (compress or use external links)
3. Remove unused pages from multi-page diagrams

### "Access denied" when saving

**Possible Causes:**
1. File is read-only
2. Another program has the file open
3. Insufficient permissions

**Solutions:**
1. Check file properties and remove read-only status
2. Close the file in other applications
3. Save to a different location (Documents folder)
4. Run as administrator (Windows) or check permissions (macOS/Linux)

### "File has been modified by another program" (Conflict)

**Cause:** The file was changed externally while open in draw.io

**Solutions:**
1. Choose "Discard Changes" to reload the external version
2. Choose "Cancel" and save your version with a different name
3. Use "File > Save As" to create a new copy

### Lost unsaved work

**Check for drafts:**
Draw.io automatically creates draft files when you save:
- Look for files starting with `.$` in the same folder (e.g., `.$filename.drawio.dtmp`)
- On Windows, these may be hidden - enable "Show hidden files"

**Recover from backup:**
- Backup files use extension `.bkp` (e.g., `.$filename.drawio.bkp`)
- Remove the `.bkp` extension to restore

---

## Export Problems

### Export to PDF fails

**Solutions:**
1. Check available disk space
2. Try exporting with smaller page size
3. Reduce diagram complexity
4. Export as SVG first, then convert to PDF

### PNG/JPEG export quality is poor

**Solutions:**
1. Increase the scale factor: `--scale 2` or higher
2. Use PNG instead of JPEG for diagrams (better quality)
3. Export at higher resolution and resize in image editor

### SVG export issues

**Common problems:**
- Fonts not displaying: Enable font embedding `--embed-svg-fonts true`
- Images missing: Enable image embedding `--embed-svg-images`

---

## Performance Issues

### Slow startup

**Possible Causes:**
1. Large recent files list
2. Hardware acceleration issues
3. Antivirus scanning

**Solutions:**
1. Clear recent files: Help > Clear Recent Files
2. Disable hardware acceleration
3. Add draw.io to antivirus exclusions

### Laggy editing

**Solutions:**
1. Close other applications to free RAM
2. Reduce diagram complexity:
   - Fewer shapes per page
   - Smaller images (compress or link externally)
   - Disable shadows/effects if not needed
3. Disable spell checking: Edit > Check Spelling

### High CPU/Memory usage

**Check for:**
1. Large embedded images
2. Complex diagrams with many connections
3. Multiple large files open

**Solutions:**
1. Compress images before embedding
2. Split complex diagrams
3. Close unused tabs/windows

---

## Security Warnings

### "This file may be dangerous" when opening files

**Cause:** File contains active content or unrecognized format

**Solution:**
- This is a security feature - only open files from trusted sources
- Files from unknown sources should be scanned with antivirus first

### Plugin installation blocked

**Cause:** Plugins must be explicitly enabled

**Solution:**
1. Start draw.io with `--enable-plugins` flag
2. Plugins can only be loaded from the plugins directory
3. Install plugins via: Extras > Plugins > Install

---

## Data Recovery

### Recovering from crashes

1. **Check for draft files:**
   - Look in the same folder as your original file
   - Files starting with `.$` are drafts

2. **Check backup files:**
   - Files with `.bkp` extension
   - Located in same folder as original

3. **Check temp directory:**
   - **Windows:** `%TEMP%\draw.io\`
   - **macOS:** `/tmp/`
   - **Linux:** `/tmp/`

### Auto-save and backup settings

Enable in application:
- Edit > Backup (enabled by default)
- This creates `.bkp` files on each save

### Manual backup strategy

1. Use version control (Git) for important diagrams
2. Enable cloud sync (OneDrive, Dropbox, etc.) on your diagrams folder
3. Regular exports to multiple formats (PNG, SVG, PDF)

---

## Getting Help

### Debug mode

Run with debug logging:
```bash
# Windows
draw.io.exe --enable-logging

# macOS
/Applications/draw.io.app/Contents/MacOS/draw.io --enable-logging

# Linux
./draw.io --enable-logging
```

### Report issues

1. Collect log files from the locations mentioned above
2. Note your OS version and draw.io version
3. Describe exact steps to reproduce the issue
4. Report at: https://github.com/jgraph/drawio-desktop/issues

### Log Locations

| OS | Log Location |
|----|--------------|
| Windows | `%APPDATA%\draw.io\logs\main.log` |
| macOS | `~/Library/Logs/draw.io/main.log` |
| Linux | `~/.config/draw.io/logs/main.log` |

---

## Command Line Options

### Development/Testing
- `--disable-acceleration` - Disable hardware acceleration
- `--disable-update` - Disable auto-update checks
- `--silent-update` - Update without user prompts
- `--enable-plugins` - Enable plugin support

### Export Mode
- `-x, --export` - Export mode
- `-f, --format` - Export format (pdf, png, svg, xml)
- `-o, --output` - Output file/folder
- `-s, --scale` - Scale factor
- See full list: `draw.io --help`
