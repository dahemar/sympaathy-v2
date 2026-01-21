#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { brotliCompressSync, gzipSync, constants } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const publicDir = join(__dirname, '..', 'public');
const files = ['posts_bootstrap.json', 'posts_bootstrap.min.json'];

console.log('🗜️  Precompressing JSON artifacts...\n');

for (const file of files) {
  const filePath = join(publicDir, file);
  
  try {
    const content = readFileSync(filePath);
    const originalSize = content.length;
    
    // Brotli compression (level 11 for max compression)
    const brotli = brotliCompressSync(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11
      }
    });
    writeFileSync(`${filePath}.br`, brotli);
    
    // Gzip compression (level 9 for max compression)
    const gzip = gzipSync(content, { level: 9 });
    writeFileSync(`${filePath}.gz`, gzip);
    
    console.log(`✅ ${file}`);
    console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`   Brotli:   ${(brotli.length / 1024).toFixed(2)} KB (${((1 - brotli.length / originalSize) * 100).toFixed(1)}% reduction)`);
    console.log(`   Gzip:     ${(gzip.length / 1024).toFixed(2)} KB (${((1 - gzip.length / originalSize) * 100).toFixed(1)}% reduction)\n`);
  } catch (err) {
    console.error(`❌ Failed to compress ${file}:`, err.message);
  }
}

console.log('✨ Precompression complete!');
