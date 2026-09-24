import {defineConfig} from "rollup";
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import styles from "rollup-plugin-styles";
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import del from 'rollup-plugin-delete';
import importAssets from 'rollup-plugin-import-assets';
import externalGlobals from 'rollup-plugin-external-globals';
import svgr from '@svgr/rollup'
import manifest from "./plugin.json" assert { type: 'json' }
import pkg from "./package.json" assert { type: 'json' }

export default defineConfig({
	input: './src/ts/index.tsx',
	plugins: [
		del({ targets: './dist/*', force: true }),
		typescript(),
		json(),
		styles(),
		svgr({icon: true}),
		commonjs(),
		nodeResolve({
			browser: true
		}),
		externalGlobals({
			react: 'SP_REACT',
			'react-dom': 'SP_REACTDOM',
			'@decky/ui': 'DFL',
			'@decky/manifest': JSON.stringify(manifest),
			'@decky/pkg': JSON.stringify(pkg),
		}),
		replace({
			preventAssignment: false,
			'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || "production"),
		}),
		importAssets({
			publicPath: `http://127.0.0.1:1337/plugins/${manifest.name}/`
		})
	],
	context: 'window',
	external: ['react', 'react-dom', '@decky/ui'],
	treeshake: {
		// Assume all external modules have imports with side effects (the default) while allowing decky libraries to treeshake
		pureExternalImports: {
			pure: ['@decky/ui', '@decky/api']
		},
		preset: 'smallest'
	},
	output: {
		dir: 'dist',
		format: 'esm',
		sourcemap: true,
		sourcemapPathTransform: (relativeSourcePath) => relativeSourcePath.replace(/^\.\.\//, `decky://decky/plugin/${encodeURIComponent(manifest.name)}/`),
		exports: 'default'
	},
});