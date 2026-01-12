#!/usr/bin/env node

/**
 * Patch node-pg-migrate to support both dash (-) and underscore (_) separators
 * 
 * This patch modifies the getNumericPrefix function to accept both separators,
 * allowing migration files to use either format: timestamp-description.js or timestamp_description.js
 */

const fs = require('fs');
const path = require('path');

const nodePgMigratePath = path.join(process.cwd(), 'node_modules/node-pg-migrate/dist/bundle/index.js');

function patchNodePgMigrate() {
  if (!fs.existsSync(nodePgMigratePath)) {
    console.error('❌ node-pg-migrate not found at:', nodePgMigratePath);
    console.error('   Run npm install first');
    process.exit(1);
  }

  let content = fs.readFileSync(nodePgMigratePath, 'utf8');
  
  // Check if already patched
  if (content.includes('// PATCHED: support both dash and underscore separators')) {
    // Silently return - already patched
    return;
  }

  // Find the getNumericPrefix function and patch it
  // The original splits on SEPARATOR (which is "_")
  // We'll modify it to try both "_" and "-"
  
  const originalPattern = /const prefix = filename\.split\(SEPARATOR\)\[0\];/;
  const patchedCode = `// PATCHED: support both dash and underscore separators
  // Try underscore first (original behavior), then dash
  let prefix = filename.split(SEPARATOR)[0];
  if (!prefix || !/^\\d+$/.test(prefix)) {
    // If underscore didn't work, try dash
    const dashPrefix = filename.split("-")[0];
    if (dashPrefix && /^\\d+$/.test(dashPrefix)) {
      prefix = dashPrefix;
    }
  }`;

  if (originalPattern.test(content)) {
    content = content.replace(originalPattern, patchedCode);
    fs.writeFileSync(nodePgMigratePath, content, 'utf8');
    // Silent success - only log on error
  } else {
    // Only log errors, not normal operation
    console.error('❌ Could not find getNumericPrefix function to patch');
    console.error('   The node-pg-migrate version may have changed');
    process.exit(1);
  }
}

patchNodePgMigrate();
