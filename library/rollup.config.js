import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';

export default {
    input: 'src/index.js',
    output: [
        {
            file: 'dist/hanzilookup.cjs.js',
            format: 'cjs',
            exports: 'named'
        },
        {
            file: 'dist/hanzilookup.esm.js',
            format: 'es'
        },
        {
            file: 'dist/hanzilookup.min.js',
            format: 'iife',
            name: 'HanziLookup',
            exports: 'named',
            globals: {
                jquery: '$'
            }
        }
    ],
    external: ['jquery'], // Treat jquery as external if imported (not currently imported though)
    plugins: [
        resolve(),
        commonjs(),
        babel({
            babelHelpers: 'bundled',
            presets: ['@babel/preset-env'],
            exclude: 'node_modules/**'
        })
    ]
};
