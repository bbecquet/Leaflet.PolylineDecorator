import resolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';

export default {
  entry: 'src/L.PolylineDecorator.js',
  dest: 'dist/leaflet.polylineDecorator.js',
  format: 'es',
  plugins: [
    resolve(),
    babel({
      exclude: 'node_modules/**',
    })
  ],
};
