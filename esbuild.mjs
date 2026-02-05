import * as esbuild from 'esbuild';
import { glob } from 'glob';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const testOnly = process.argv.includes('--test');

async function buildExtension() {
  const context = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    plugins: [],
  });

  if (watch) {
    await context.watch();
    console.log('Watching for changes...');
  } else {
    await context.rebuild();
    await context.dispose();
    console.log('Extension build complete');
  }
}

async function buildTests() {
  // Find all test files
  const testFiles = await glob('src/test/**/*.ts', {
    ignore: ['src/test/**/fixtures/**']
  });

  if (testFiles.length === 0) {
    console.log('No test files found');
    return;
  }

  const context = await esbuild.context({
    entryPoints: testFiles,
    bundle: true,
    format: 'cjs',
    sourcemap: true,
    sourcesContent: false,
    platform: 'node',
    outdir: 'out/test',
    outbase: 'src/test',
    external: ['vscode', 'mocha'],
    logLevel: 'info',
    plugins: [],
  });

  await context.rebuild();
  await context.dispose();
  console.log('Test build complete');
}

async function main() {
  if (testOnly) {
    await buildTests();
  } else {
    await buildExtension();
    if (!watch) {
      await buildTests();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
