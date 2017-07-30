import resolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';

export default {
  entry: 'src/L.PolylineDecorator.js',
  dest: 'dist/leaflet.polylineDecorator.js',
  format: 'umd',
  plugins: [
    resolve(),
    babel({
      babelrc: false,
      exclude: 'node_modules/**',
      presets: ['es2015-rollup'],
      plugins: ['external-helpers']
    })
  ],
};
